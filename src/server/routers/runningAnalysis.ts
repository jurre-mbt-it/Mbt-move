/**
 * Hardloopanalyse-router (2D videoanalyse) — tweede assessment-type.
 *
 * Toegang: zelfde gate als de Mobility Assessment (therapeut met
 * canUseAssessment, of admin) + per-patient behandelrelatie/praktijk.
 * Vast standaardformulier: items worden bij aanmaken aangemaakt uit de
 * catalogus in `@/lib/running-analysis/catalog`.
 */
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  protectedProcedure,
  assertMfaSatisfied,
  assertStaffMfaEnrolled,
} from '@/server/trpc'
import { practiceScope } from '@/server/lib/patient-access'
import { auditLog } from '@/server/audit'
import { REAR_ITEMS, SIDE_ITEMS, METRICS, DEFAULT_SUBTITLE, DEFAULT_VIEW_LABEL } from '@/lib/running-analysis/catalog'
import {
  rearZone,
  sideStatus,
  rearTotal,
  REAR_ZONE_LABEL,
  SIDE_STATUS_LABEL,
} from '@/lib/running-analysis/compute'
import { draftRunningAnalysisNarrative } from '@/lib/ai/anthropic'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  // Defense-in-depth: de praktijk-tak hieronder mag ALLEEN voor THERAPIST gelden.
  // Patiënten/atleten delen de practiceId van hun therapeut; zonder deze check
  // zou een non-therapist via die tak bij mede-patiënten kunnen. Alle callers
  // zijn nu therapist-gated, dus dit is een vangnet tegen toekomstige regressie.
  if (user.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve behandelrelatie met deze patiënt' })
  }
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, ...ACTIVE_LINK } } },
        ...practiceScope(user),
      ],
    },
    select: { id: true },
  })
  if (!ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve behandelrelatie met deze patiënt' })
}

/** Gate op canUseAssessment (admin altijd door) — spiegelt de Mobility Assessment. */
const runningProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Zie assessments.ts: op protectedProcedure gebouwd, dus de MFA-poorten van
  // therapistProcedure ontbraken (audit 2026-07-27, M1).
  assertStaffMfaEnrolled(ctx)
  assertMfaSatisfied(ctx)
  if (ctx.user!.role === 'ADMIN') return next({ ctx })
  if (ctx.user!.role !== 'THERAPIST') throw new TRPCError({ code: 'FORBIDDEN' })
  const u = await ctx.prisma.user.findUnique({
    where: { id: ctx.user!.id },
    select: { canUseAssessment: true },
  })
  if (!u?.canUseAssessment) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Assessment is niet geactiveerd voor jouw account. Neem contact op met een admin.',
    })
  }
  return next({ ctx })
})

async function analysisPatientId(
  prisma: typeof import('@/lib/prisma').prisma,
  id: string,
): Promise<string> {
  const a = await prisma.runningAnalysis.findUnique({ where: { id }, select: { patientId: true } })
  if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
  return a.patientId
}

export const runningAnalysisRouter = createTRPCRouter({
  listForPatient: runningProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const rows = await ctx.prisma.runningAnalysis.findMany({
        where: { patientId: input.patientId },
        orderBy: { performedAt: 'desc' },
        include: {
          therapist: { select: { name: true, email: true } },
          items: { where: { section: 'REAR' }, select: { value: true } },
        },
      })
      return rows.map((a) => ({
        id: a.id,
        performedAt: a.performedAt,
        goal: a.goal,
        status: a.status,
        therapistName: a.therapist.name ?? a.therapist.email,
        rearTotal: rearTotal(a.items.map((i) => i.value)),
      }))
    }),

  get: runningProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.prisma.runningAnalysis.findUnique({
        where: { id: input.id },
        include: {
          items: { orderBy: { order: 'asc' } },
          advice: { orderBy: { order: 'asc' } },
          patient: { select: { id: true, name: true, email: true, dateOfBirth: true } },
          therapist: { select: { id: true, name: true, email: true, jobTitle: true } },
        },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)
      // metricComments (Json) plat teruggeven: de recursieve Prisma-JsonValue
      // blaast de tRPC-inferentie op (TS2589), zelfde valkuil als cardioParams.
      return { ...a, metricComments: (a.metricComments ?? null) as Record<string, string> | null }
    }),

  create: runningProcedure
    .input(z.object({ patientId: z.string(), performedAt: z.string().optional(), goal: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      let order = 0
      const items = [
        ...REAR_ITEMS.map((it) => ({
          section: 'REAR' as const,
          key: it.key,
          label: it.label,
          comment: it.defaultComment || null,
          order: order++,
        })),
        ...SIDE_ITEMS.map((it) => ({
          section: 'SIDE' as const,
          key: it.key,
          label: it.label,
          idealMin: it.idealMin,
          idealMax: it.idealMax,
          axisMin: it.axisMin,
          axisMax: it.axisMax,
          unit: it.unit,
          order: order++,
        })),
      ]
      const a = await ctx.prisma.runningAnalysis.create({
        data: {
          patientId: input.patientId,
          therapistId: ctx.user.id,
          performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
          goal: input.goal ?? null,
          subtitle: DEFAULT_SUBTITLE,
          viewLabel: DEFAULT_VIEW_LABEL,
          items: { create: items },
        },
      })
      return { id: a.id }
    }),

  updateMeta: runningProcedure
    .input(
      z.object({
        id: z.string(),
        performedAt: z.string().optional(),
        goal: z.string().max(2000).nullable().optional(),
        location: z.string().max(200).nullable().optional(),
        subtitle: z.string().max(200).nullable().optional(),
        viewLabel: z.string().max(200).nullable().optional(),
        cadence: z.number().nullable().optional(),
        strideLength: z.number().nullable().optional(),
        stepLength: z.number().nullable().optional(),
        groundContact: z.number().nullable().optional(),
        flightTime: z.number().nullable().optional(),
        dutyFactor: z.number().nullable().optional(),
        // Opmerking per loopmetric: { <metricKey>: tekst }. Losse string-record
        // (geen enum-key: dat blaast de tRPC-inferentie op — TS2589). De keys
        // zijn onze zes vaste metrics; lege waarden filtert de UI eruit.
        metricComments: z.record(z.string(), z.string().max(2000)).nullable().optional(),
        therapistComments: z.string().max(4000).nullable().optional(),
        nextMoment: z.string().max(2000).nullable().optional(),
        status: z.enum(['DRAFT', 'FINAL']).optional(),
        notes: z.string().max(4000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, performedAt, metricComments, ...rest } = input
      await assertTreating(ctx.prisma, ctx.user, await analysisPatientId(ctx.prisma, id))
      await ctx.prisma.runningAnalysis.update({
        where: { id },
        data: {
          ...rest,
          ...(performedAt ? { performedAt: new Date(performedAt) } : {}),
          ...(metricComments !== undefined ? { metricComments: metricComments ?? Prisma.JsonNull } : {}),
        },
      })
      return { ok: true }
    }),

  updateItem: runningProcedure
    .input(
      z.object({
        id: z.string(),
        value: z.number().nullable().optional(),
        comment: z.string().nullable().optional(),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const it = await ctx.prisma.runningAnalysisItem.findUnique({
        where: { id },
        select: { analysisId: true },
      })
      if (!it) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, await analysisPatientId(ctx.prisma, it.analysisId))
      await ctx.prisma.runningAnalysisItem.update({ where: { id }, data })
      return { ok: true }
    }),

  setAdvice: runningProcedure
    .input(z.object({ analysisId: z.string(), advice: z.array(z.object({ title: z.string(), body: z.string() })) }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await analysisPatientId(ctx.prisma, input.analysisId))
      await ctx.prisma.$transaction([
        ctx.prisma.runningAnalysisAdvice.deleteMany({ where: { analysisId: input.analysisId } }),
        ctx.prisma.runningAnalysisAdvice.createMany({
          data: input.advice.map((a, i) => ({ analysisId: input.analysisId, order: i, title: a.title, body: a.body })),
        }),
      ])
      return { ok: true }
    }),

  delete: runningProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, await analysisPatientId(ctx.prisma, input.id))
      await ctx.prisma.runningAnalysis.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  aiDraft: runningProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.prisma.runningAnalysis.findUnique({
        where: { id: input.id },
        include: {
          items: { orderBy: { order: 'asc' } },
        },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)

      const rearItems = a.items.filter((i) => i.section === 'REAR')
      const sideItems = a.items.filter((i) => i.section === 'SIDE')

      const rear = rearItems.map((i) => {
        const z = rearZone(i.value)
        return { label: i.label, score: i.value, status: z ? REAR_ZONE_LABEL[z] : '—' }
      })
      const side = sideItems.map((i) => {
        const range = { idealMin: i.idealMin ?? 0, idealMax: i.idealMax ?? 0, axisMin: i.axisMin ?? 0, axisMax: i.axisMax ?? 100 }
        const z = sideStatus(i.value, range)
        return {
          label: i.label,
          value: i.value,
          ideal: `${i.idealMin ?? '—'}° tot ${i.idealMax ?? '—'}°`,
          status: z ? SIDE_STATUS_LABEL[z] : '—',
        }
      })
      const metrics = METRICS.map((m) => ({
        label: m.label,
        value: (a as Record<string, unknown>)[m.key] as number | null,
        unit: m.unit,
      }))

      if (rearItems.every((i) => i.value == null) && sideItems.every((i) => i.value == null)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vul eerst scores/hoeken in.' })
      }

      await auditLog({
        event: 'DATA_EXPORTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'RunningAnalysis',
        resourceId: a.id,
        metadata: { route: 'runningAnalysis.aiDraft', target: 'anthropic', patientId: a.patientId },
        req: ctx.req,
      })

      return draftRunningAnalysisNarrative({
        // goal bewust weggelaten: vrije tekst gaat niet naar de externe AI
        // (AVG-dataminimalisatie, zie anthropic.ts).
        rearTotal: rearTotal(rearItems.map((i) => i.value)),
        rear,
        side,
        metrics,
      })
    }),
})
