/**
 * Testrapport-router.
 *
 * Toegangsmodel (spiegelt assessments/clinicalTests):
 *   - Therapeut of admin (therapistProcedure).
 *   - Per patient: actieve behandelrelatie OF zelfde praktijk OF admin.
 * Catalogus + batterijen zijn een globale library (therapist read/write).
 *
 * Zone/plot-berekening leeft in `@/lib/test-report/compute`; AI-concept in
 * `@/lib/ai/anthropic`. PDF-export gaat via /print/test-report/[id].
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'
import { auditLog } from '@/server/audit'
import {
  computePlottedValue,
  computeZone,
  formatPlotted,
  formatNumber,
  ZONE_LABEL,
  type TestSpec,
} from '@/lib/test-report/compute'
import { draftTestReportNarrative, type NarrativeTestLine } from '@/lib/ai/anthropic'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  // Defense-in-depth: de praktijk-tak hieronder mag ALLEEN voor THERAPIST gelden
  // (patiënten/atleten delen de practiceId). Vangnet tegen toekomstige regressie.
  if (user.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve behandelrelatie met deze patiënt' })
  }
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, ...ACTIVE_LINK } } },
        ...(user.practiceId ? [{ practiceId: user.practiceId }] : []),
      ],
    },
    select: { id: true },
  })
  if (!ok) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve behandelrelatie met deze patiënt',
    })
  }
}

async function reportPatientId(
  prisma: typeof import('@/lib/prisma').prisma,
  id: string,
): Promise<string> {
  const r = await prisma.testReport.findUnique({ where: { id }, select: { patientId: true } })
  if (!r) throw new TRPCError({ code: 'NOT_FOUND' })
  return r.patientId
}

/** Dedupe batterij-items op catalogItemId (unique-constraint) → create-shape. */
function dedupeItems(
  items: Array<{ catalogItemId: string; order: number; targetWeek?: number | null }>,
) {
  const seen = new Set<string>()
  const out: Array<{ catalogItemId: string; order: number; targetWeek: number | null }> = []
  for (const it of items) {
    if (seen.has(it.catalogItemId)) continue
    seen.add(it.catalogItemId)
    out.push({ catalogItemId: it.catalogItemId, order: it.order, targetWeek: it.targetWeek ?? null })
  }
  return out
}

/** Reads: globale seeds (practiceId NULL) + items van de eigen praktijk. */
function practiceScope(practiceId: string | null) {
  return practiceId
    ? [{ practiceId: null }, { practiceId }]
    : [{ practiceId: null }]
}

/** Mag deze therapeut dit catalog/battery-item bewerken? Globale seeds
 *  (practiceId NULL) zijn in de single-clinic realiteit ook bewerkbaar; anders
 *  moet het item in de eigen praktijk zitten. Admin mag alles. */
function assertCanEditLibrary(
  user: { role: string; practiceId: string | null },
  item: { practiceId: string | null },
) {
  if (user.role === 'ADMIN') return
  if (item.practiceId === null) return
  if (user.practiceId && item.practiceId === user.practiceId) return
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot dit item' })
}

// ── Zod ─────────────────────────────────────────────────────────────────
const kind = z.enum(['BILATERAL', 'SINGLE'])
const metric = z.enum(['LSI', 'RIGHT', 'LEFT', 'VALUE'])
const zone = z.enum(['RED', 'ORANGE', 'GREEN'])

const specInput = z.object({
  category: z.string().min(1),
  categoryOrder: z.number().int().optional(),
  name: z.string().min(1),
  subtitle: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  kind: kind.optional(),
  metric: metric.optional(),
  unitPrimary: z.string().nullable().optional(),
  unitSecondary: z.string().nullable().optional(),
  plotUnit: z.string().optional(),
  axisMin: z.number().optional(),
  axisMax: z.number().optional(),
  zoneOrangeMin: z.number().optional(),
  zoneGreenMin: z.number().optional(),
  higherIsBetter: z.boolean().optional(),
})

const valuesInput = z.object({
  leftPrimary: z.number().nullable().optional(),
  rightPrimary: z.number().nullable().optional(),
  leftSecondary: z.number().nullable().optional(),
  rightSecondary: z.number().nullable().optional(),
  singleValue: z.number().nullable().optional(),
  textValue: z.string().nullable().optional(),
  plottedValueOverride: z.number().nullable().optional(),
  zoneOverride: zone.nullable().optional(),
  notes: z.string().nullable().optional(),
})

// Catalog → entry spec mapping (gedeelde velden hebben dezelfde namen).
function specFromCatalog(c: {
  category: string; categoryOrder: number; name: string; subtitle: string | null
  source: string | null; kind: string; metric: string; unitPrimary: string | null
  unitSecondary: string | null; plotUnit: string; axisMin: number; axisMax: number
  zoneOrangeMin: number; zoneGreenMin: number; higherIsBetter: boolean
}) {
  return {
    category: c.category, categoryOrder: c.categoryOrder, name: c.name, subtitle: c.subtitle,
    source: c.source, kind: c.kind as 'BILATERAL' | 'SINGLE', metric: c.metric as 'LSI' | 'RIGHT' | 'LEFT' | 'VALUE',
    unitPrimary: c.unitPrimary, unitSecondary: c.unitSecondary, plotUnit: c.plotUnit,
    axisMin: c.axisMin, axisMax: c.axisMax, zoneOrangeMin: c.zoneOrangeMin,
    zoneGreenMin: c.zoneGreenMin, higherIsBetter: c.higherIsBetter,
  }
}

export const testReportsRouter = createTRPCRouter({
  // ── Catalogus + batterijen ──────────────────────────────────────────────
  catalog: therapistProcedure.query(async ({ ctx }) => {
    return ctx.prisma.testCatalogItem.findMany({
      where: { isActive: true, OR: practiceScope(ctx.user.practiceId) },
      orderBy: [{ categoryOrder: 'asc' }, { category: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    })
  }),

  batteries: therapistProcedure.query(async ({ ctx }) => {
    return ctx.prisma.testBattery.findMany({
      where: { isActive: true, OR: practiceScope(ctx.user.practiceId) },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { catalogItem: { select: { id: true, name: true, category: true } } },
        },
      },
    })
  }),

  // ── Catalogus-CRUD (eigen tests aanmaken/bewerken) ────────────────────────
  catalogUpsert: therapistProcedure
    .input(specInput.extend({ id: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...spec } = input
      if (id) {
        const existing = await ctx.prisma.testCatalogItem.findUnique({
          where: { id }, select: { practiceId: true },
        })
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
        assertCanEditLibrary(ctx.user, existing)
        return ctx.prisma.testCatalogItem.update({ where: { id }, data: spec })
      }
      return ctx.prisma.testCatalogItem.create({
        data: { ...spec, practiceId: ctx.user.practiceId ?? null, creatorId: ctx.user.id },
      })
    }),

  // Zachte verwijdering: isActive=false zodat bestaande rapporten/batterijen
  // die ernaar verwijzen intact blijven.
  catalogSetActive: therapistProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.testCatalogItem.findUnique({
        where: { id: input.id }, select: { practiceId: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEditLibrary(ctx.user, existing)
      return ctx.prisma.testCatalogItem.update({
        where: { id: input.id }, data: { isActive: input.isActive },
      })
    }),

  // ── Batterij-CRUD (samenstellen + weken-protocol) ─────────────────────────
  batteryUpsert: therapistProcedure
    .input(z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      durationWeeks: z.number().int().min(1).max(104).nullable().optional(),
      items: z.array(z.object({
        catalogItemId: z.string(),
        order: z.number().int(),
        targetWeek: z.number().int().min(0).max(104).nullable().optional(),
      })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, items, ...meta } = input
      const data = {
        name: meta.name,
        description: meta.description ?? null,
        durationWeeks: meta.durationWeeks ?? null,
      }
      if (id) {
        const existing = await ctx.prisma.testBattery.findUnique({
          where: { id }, select: { practiceId: true },
        })
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
        assertCanEditLibrary(ctx.user, existing)
        // Items volledig vervangen (dedup op catalogItemId i.v.m. unique).
        await ctx.prisma.testBatteryItem.deleteMany({ where: { batteryId: id } })
        return ctx.prisma.testBattery.update({
          where: { id },
          data: {
            ...data,
            items: { create: dedupeItems(items) },
          },
          include: { items: true },
        })
      }
      return ctx.prisma.testBattery.create({
        data: {
          ...data,
          practiceId: ctx.user.practiceId ?? null,
          creatorId: ctx.user.id,
          items: { create: dedupeItems(items) },
        },
        include: { items: true },
      })
    }),

  batteryDelete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.testBattery.findUnique({
        where: { id: input.id }, select: { practiceId: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      assertCanEditLibrary(ctx.user, existing)
      await ctx.prisma.testBattery.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // ── Rapporten ────────────────────────────────────────────────────────────
  listForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const rows = await ctx.prisma.testReport.findMany({
        where: { patientId: input.patientId },
        orderBy: { performedAt: 'desc' },
        include: {
          therapist: { select: { name: true, email: true } },
          _count: { select: { entries: true } },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        performedAt: r.performedAt,
        measurementNumber: r.measurementNumber,
        status: r.status,
        injuryGoal: r.injuryGoal,
        rehabPhaseLabel: r.rehabPhaseLabel,
        therapistName: r.therapist.name ?? r.therapist.email,
        entryCount: r._count.entries,
      }))
    }),

  get: therapistProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const r = await ctx.prisma.testReport.findUnique({
        where: { id: input.id },
        include: {
          entries: { orderBy: [{ categoryOrder: 'asc' }, { order: 'asc' }] },
          advice: { orderBy: { order: 'asc' } },
          patient: { select: { id: true, name: true, email: true, dateOfBirth: true } },
          therapist: { select: { id: true, name: true, email: true, jobTitle: true } },
        },
      })
      if (!r) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, r.patientId)
      return r
    }),

  create: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        performedAt: z.string().optional(),
        measurementNumber: z.number().int().nullable().optional(),
        subtitle: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const report = await ctx.prisma.testReport.create({
        data: {
          patientId: input.patientId,
          therapistId: ctx.user.id,
          performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
          measurementNumber: input.measurementNumber ?? null,
          subtitle:
            input.subtitle ?? 'Objectieve meting van kracht, power en mobiliteit',
        },
      })
      return { id: report.id }
    }),

  updateMeta: therapistProcedure
    .input(
      z.object({
        id: z.string(),
        performedAt: z.string().optional(),
        measurementNumber: z.number().int().nullable().optional(),
        subtitle: z.string().nullable().optional(),
        trajectLabel: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        injuryGoal: z.string().nullable().optional(),
        rehabPhaseLabel: z.string().nullable().optional(),
        interpretation: z.string().nullable().optional(),
        nextTestMoment: z.string().nullable().optional(),
        nextTestGoal: z.string().nullable().optional(),
        status: z.enum(['DRAFT', 'FINAL']).optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, performedAt, ...rest } = input
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, id))
      await ctx.prisma.testReport.update({
        where: { id },
        data: { ...rest, ...(performedAt ? { performedAt: new Date(performedAt) } : {}) },
      })
      return { ok: true }
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, input.id))
      await ctx.prisma.testReport.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // ── Entries ────────────────────────────────────────────────────────────
  addEntry: therapistProcedure
    .input(z.object({ reportId: z.string(), catalogItemId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, input.reportId))
      const max = await ctx.prisma.testReportEntry.aggregate({
        where: { reportId: input.reportId },
        _max: { order: true },
      })
      const order = (max._max.order ?? -1) + 1

      let spec
      if (input.catalogItemId) {
        const c = await ctx.prisma.testCatalogItem.findUnique({ where: { id: input.catalogItemId } })
        if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Test niet in catalogus' })
        spec = specFromCatalog(c)
      } else {
        spec = {
          category: 'Overig', categoryOrder: 99, name: 'Nieuwe test', subtitle: null,
          source: null, kind: 'BILATERAL' as const, metric: 'LSI' as const,
          unitPrimary: null, unitSecondary: null, plotUnit: '%', axisMin: 60, axisMax: 100,
          zoneOrangeMin: 80, zoneGreenMin: 90, higherIsBetter: true,
        }
      }
      const e = await ctx.prisma.testReportEntry.create({
        data: { reportId: input.reportId, catalogItemId: input.catalogItemId ?? null, order, ...spec },
      })
      return { id: e.id }
    }),

  addBattery: therapistProcedure
    .input(z.object({ reportId: z.string(), batteryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, input.reportId))
      const battery = await ctx.prisma.testBattery.findUnique({
        where: { id: input.batteryId },
        include: { items: { orderBy: { order: 'asc' }, include: { catalogItem: true } } },
      })
      if (!battery) throw new TRPCError({ code: 'NOT_FOUND' })
      const max = await ctx.prisma.testReportEntry.aggregate({
        where: { reportId: input.reportId },
        _max: { order: true },
      })
      let order = (max._max.order ?? -1) + 1
      await ctx.prisma.testReportEntry.createMany({
        data: battery.items.map((it) => ({
          reportId: input.reportId,
          catalogItemId: it.catalogItemId,
          order: order++,
          ...specFromCatalog(it.catalogItem),
        })),
      })
      return { added: battery.items.length }
    }),

  updateEntry: therapistProcedure
    .input(z.object({ id: z.string() }).and(specInput.partial()).and(valuesInput))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const e = await ctx.prisma.testReportEntry.findUnique({
        where: { id },
        select: { reportId: true },
      })
      if (!e) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, e.reportId))
      await ctx.prisma.testReportEntry.update({ where: { id }, data })
      return { ok: true }
    }),

  deleteEntry: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const e = await ctx.prisma.testReportEntry.findUnique({
        where: { id: input.id },
        select: { reportId: true },
      })
      if (!e) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, e.reportId))
      await ctx.prisma.testReportEntry.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // ── Vervolgadvies (replace-all) ──────────────────────────────────────────
  setAdvice: therapistProcedure
    .input(
      z.object({
        reportId: z.string(),
        advice: z.array(z.object({ title: z.string(), body: z.string() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, input.reportId))
      await ctx.prisma.$transaction([
        ctx.prisma.testReportAdvice.deleteMany({ where: { reportId: input.reportId } }),
        ctx.prisma.testReportAdvice.createMany({
          data: input.advice.map((a, i) => ({
            reportId: input.reportId, order: i, title: a.title, body: a.body,
          })),
        }),
      ])
      return { ok: true }
    }),

  // ── Batterij opslaan vanuit een rapport ──────────────────────────────────
  saveAsBattery: therapistProcedure
    .input(z.object({ reportId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await reportPatientId(ctx.prisma, input.reportId))
      const entries = await ctx.prisma.testReportEntry.findMany({
        where: { reportId: input.reportId, catalogItemId: { not: null } },
        orderBy: [{ categoryOrder: 'asc' }, { order: 'asc' }],
        select: { catalogItemId: true },
      })
      const ids = [...new Set(entries.map((e) => e.catalogItemId!).filter(Boolean))]
      if (ids.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Geen tests uit de catalogus om als batterij op te slaan.',
        })
      }
      const battery = await ctx.prisma.testBattery.create({
        data: {
          name: input.name,
          practiceId: ctx.user.practiceId ?? null,
          creatorId: ctx.user.id,
          items: { create: ids.map((catalogItemId, order) => ({ catalogItemId, order })) },
        },
      })
      return { id: battery.id }
    }),

  // ── AI-concept slottekst ──────────────────────────────────────────────────
  aiDraft: therapistProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.prisma.testReport.findUnique({
        where: { id: input.reportId },
        include: {
          entries: { orderBy: [{ categoryOrder: 'asc' }, { order: 'asc' }] },
        },
      })
      if (!report) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, report.patientId)
      if (report.entries.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Voeg eerst tests toe.' })
      }

      const tests: NarrativeTestLine[] = report.entries.map((e) => {
        const spec: TestSpec = {
          kind: e.kind as TestSpec['kind'],
          metric: e.metric as TestSpec['metric'],
          plotUnit: e.plotUnit,
          axisMin: e.axisMin,
          axisMax: e.axisMax,
          zoneOrangeMin: e.zoneOrangeMin,
          zoneGreenMin: e.zoneGreenMin,
          higherIsBetter: e.higherIsBetter,
        }
        const plotted = computePlottedValue(spec, e)
        const z = computeZone(spec, e)
        const values =
          e.kind === 'SINGLE'
            ? e.textValue ?? `${formatNumber(e.singleValue)}${e.unitPrimary ? ' ' + e.unitPrimary : ''}`
            : `L ${formatNumber(e.leftPrimary)}${e.unitPrimary ? ' ' + e.unitPrimary : ''} · R ${formatNumber(e.rightPrimary)}${e.unitPrimary ? ' ' + e.unitPrimary : ''}`
        return {
          category: e.category,
          name: e.name,
          subtitle: e.subtitle,
          values,
          headline: formatPlotted(spec, plotted),
          zone: z ? ZONE_LABEL[z] : '—',
        }
      })

      // Doorgifte van pseudonieme testdata (geen naam/identifier, zie
      // anthropic.ts) naar de externe AI loggen (AVG art. 30/32).
      await auditLog({
        event: 'DATA_EXPORTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'TestReport',
        resourceId: report.id,
        metadata: { route: 'testReports.aiDraft', target: 'anthropic', patientId: report.patientId },
        req: ctx.req,
      })

      const draft = await draftTestReportNarrative({
        // injuryGoal bewust weggelaten: vrije tekst gaat niet naar de externe AI
        // (AVG-dataminimalisatie, zie anthropic.ts).
        rehabPhaseLabel: report.rehabPhaseLabel,
        measurementNumber: report.measurementNumber,
        tests,
      })
      return draft
    }),
})
