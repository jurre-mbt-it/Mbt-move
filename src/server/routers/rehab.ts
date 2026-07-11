/**
 * Rehab-protocol tRPC router.
 *
 * Therapist-facing stoplicht-tracker voor fasegebonden revalidatie-criteria.
 * Catalog-tabellen (RehabProtocol/Phase/Criterion) zijn admin-beheerd.
 * Therapeut activeert per patient en vinkt criteria R/O/G af.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, therapistProcedure, adminProcedure, mfaAdminProcedure } from '@/server/trpc'
import { getPatientRehabTrackerData } from '@/lib/rehab-data'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  // Defense-in-depth: de praktijk-tak mag ALLEEN voor THERAPIST gelden
  // (patiënten/atleten delen de practiceId). Vangnet tegen toekomstige regressie.
  if (user.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve behandelrelatie met deze patiënt' })
  }
  // Toegang = directe PatientTherapist-relatie OF zelfde praktijk.
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

/**
 * Tracker-state laden — pure logica zit in `@/lib/rehab-data` zodat
 * PDF-export en deze router exact dezelfde shape teruggeven.
 */
const loadTrackerState = getPatientRehabTrackerData

export const rehabRouter = createTRPCRouter({
  /** Lijst van beschikbare protocollen in de catalog. */
  listProtocols: therapistProcedure.query(async ({ ctx }) => {
    return ctx.prisma.rehabProtocol.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        specialty: true,
        sourceReference: true,
      },
    })
  }),

  /**
   * Volledige tracker-state voor een patiënt: actief protocol + alle fases met
   * criteria + per-criterium status + berekende expected-phase op basis van
   * operatiedatum.
   */
  getPatientTracker: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      return loadTrackerState(ctx.prisma, input.patientId)
    }),

  /**
   * Read-only tracker voor de ingelogde patient zelf. Geen edit-mutations
   * gekoppeld — patient ziet alleen status-kleuren, geen measurement-dialogs.
   */
  getMyTracker: protectedProcedure.query(async ({ ctx }) => {
    return loadTrackerState(ctx.prisma, ctx.user.id)
  }),

  activateForPatient: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        protocolId: z.string(),
        surgeryDate: z.string().nullable().optional(),
        injuryDate: z.string().nullable().optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)

      const protocol = await ctx.prisma.rehabProtocol.findUnique({
        where: { id: input.protocolId },
      })
      if (!protocol || !protocol.isActive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Protocol bestaat niet of is inactief' })
      }

      const surgeryDate = input.surgeryDate ? new Date(input.surgeryDate) : null
      const injuryDate = input.injuryDate ? new Date(input.injuryDate) : null

      await ctx.prisma.patientRehabTracker.upsert({
        where: { patientId: input.patientId },
        update: {
          protocolId: input.protocolId,
          activatedById: ctx.user.id,
          activatedAt: new Date(),
          deactivatedAt: null,
          surgeryDate,
          injuryDate,
          notes: input.notes,
        },
        create: {
          patientId: input.patientId,
          protocolId: input.protocolId,
          activatedById: ctx.user.id,
          surgeryDate,
          injuryDate,
          notes: input.notes,
        },
      })
      return { ok: true }
    }),

  deactivateForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const existing = await ctx.prisma.patientRehabTracker.findUnique({
        where: { patientId: input.patientId },
      })
      if (!existing) return { ok: true }
      await ctx.prisma.patientRehabTracker.update({
        where: { patientId: input.patientId },
        data: { deactivatedAt: new Date() },
      })
      return { ok: true }
    }),

  /**
   * Bewerk alleen de data-velden van de tracker (operatiedatum, blessuredatum,
   * notities). Protocol switchen gaat via activateForPatient.
   */
  updateTrackerDetails: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        surgeryDate: z.string().nullable().optional(),
        injuryDate: z.string().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const existing = await ctx.prisma.patientRehabTracker.findUnique({
        where: { patientId: input.patientId },
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tracker niet gevonden — activeer eerst' })
      }
      await ctx.prisma.patientRehabTracker.update({
        where: { patientId: input.patientId },
        data: {
          ...(input.surgeryDate !== undefined
            ? { surgeryDate: input.surgeryDate ? new Date(input.surgeryDate) : null }
            : {}),
          ...(input.injuryDate !== undefined
            ? { injuryDate: input.injuryDate ? new Date(input.injuryDate) : null }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      })
      return { ok: true }
    }),

  /** Upsert van de status voor één criterium. */
  updateCriterionStatus: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        criterionId: z.string(),
        status: z.enum(['NOT_MET', 'IN_PROGRESS', 'MET']),
        measurementValue: z.string().nullable().optional(),
        measurementDate: z.string().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)

      // Defensief: zorg dat dit criterium hoort bij het protocol van de patient
      const tracker = await ctx.prisma.patientRehabTracker.findUnique({
        where: { patientId: input.patientId },
        select: { protocolId: true },
      })
      if (!tracker) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tracker niet actief voor deze patiënt' })
      }
      const criterion = await ctx.prisma.rehabCriterion.findUnique({
        where: { id: input.criterionId },
        include: { phase: true },
      })
      if (!criterion || criterion.phase.protocolId !== tracker.protocolId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Criterium hoort niet bij actief protocol' })
      }

      const measurementDate = input.measurementDate ? new Date(input.measurementDate) : null

      await ctx.prisma.rehabCriterionStatus.upsert({
        where: {
          patientId_criterionId: {
            patientId: input.patientId,
            criterionId: input.criterionId,
          },
        },
        update: {
          status: input.status,
          measurementValue: input.measurementValue ?? null,
          measurementDate,
          notes: input.notes ?? null,
          updatedById: ctx.user.id,
        },
        create: {
          patientId: input.patientId,
          criterionId: input.criterionId,
          status: input.status,
          measurementValue: input.measurementValue ?? null,
          measurementDate,
          notes: input.notes ?? null,
          updatedById: ctx.user.id,
        },
      })
      return { ok: true }
    }),

  // ── ADMIN-ONLY: protocol catalog management ──────────────────────────────

  /** Admin: lijst alle protocollen incl. tellingen, actief + inactief. */
  adminListProtocols: adminProcedure.query(async ({ ctx }) => {
    const protocols = await ctx.prisma.rehabProtocol.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { phases: true, trackers: true } },
        phases: {
          select: { _count: { select: { criteria: true } } },
        },
      },
    })
    return protocols.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      specialty: p.specialty,
      sourceReference: p.sourceReference,
      isActive: p.isActive,
      phaseCount: p._count.phases,
      trackerCount: p._count.trackers,
      criteriaCount: p.phases.reduce((sum, ph) => sum + ph._count.criteria, 0),
    }))
  }),

  /** Admin: volledig protocol-detail incl alle phases en criteria. */
  adminGetProtocol: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const p = await ctx.prisma.rehabProtocol.findUnique({
        where: { id: input.id },
        include: {
          phases: {
            orderBy: { order: 'asc' },
            include: { criteria: { orderBy: { order: 'asc' } } },
          },
        },
      })
      if (!p) throw new TRPCError({ code: 'NOT_FOUND' })
      return p
    }),

  adminUpdateProtocol: mfaAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        description: z.string().max(2000).nullable().optional(),
        specialty: z.string().min(1).optional(),
        sourceReference: z.string().max(500).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      await ctx.prisma.rehabProtocol.update({
        where: { id },
        data: patch,
      })
      return { ok: true }
    }),

  adminCreateProtocol: mfaAdminProcedure
    .input(
      z.object({
        key: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Key: alleen lowercase + cijfers + streepjes'),
        name: z.string().min(2),
        description: z.string().max(2000).optional(),
        specialty: z.string().min(1),
        sourceReference: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const p = await ctx.prisma.rehabProtocol.create({
        data: { ...input, isActive: true },
      })
      return { id: p.id }
    }),

  adminDeleteProtocol: mfaAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Alleen verwijderen als geen trackers dit protocol gebruiken
      const trackers = await ctx.prisma.patientRehabTracker.count({
        where: { protocolId: input.id },
      })
      if (trackers > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Protocol wordt gebruikt door ${trackers} patient-tracker(s). Zet eerst deactivateForPatient uit voor alle patients of zet isActive=false.`,
        })
      }
      await ctx.prisma.rehabProtocol.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // Criteria CRUD (phase toevoegen laten we voor nu uit scope — fases komen via seed)

  adminUpdateCriterion: mfaAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        testDescription: z.string().min(2).optional(),
        reference: z.string().nullable().optional(),
        targetValue: z.string().min(1).optional(),
        targetUnit: z.string().nullable().optional(),
        inputType: z.enum(['NUMERIC', 'TEXT', 'PASS_FAIL']).optional(),
        isBonus: z.boolean().optional(),
        isBilateral: z.boolean().optional(),
        newtonMinGreen: z.number().int().nullable().optional(),
        newtonMinOrange: z.number().int().nullable().optional(),
        lsiMinGreen: z.number().int().min(0).max(100).nullable().optional(),
        lsiMinOrange: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      await ctx.prisma.rehabCriterion.update({ where: { id }, data: patch })
      return { ok: true }
    }),

  adminCreateCriterion: mfaAdminProcedure
    .input(
      z.object({
        phaseId: z.string(),
        name: z.string().min(2),
        testDescription: z.string().min(2),
        reference: z.string().optional(),
        targetValue: z.string().min(1),
        targetUnit: z.string().optional(),
        inputType: z.enum(['NUMERIC', 'TEXT', 'PASS_FAIL']).default('NUMERIC'),
        isBonus: z.boolean().default(false),
        isBilateral: z.boolean().default(false),
        newtonMinGreen: z.number().int().optional(),
        newtonMinOrange: z.number().int().optional(),
        lsiMinGreen: z.number().int().min(0).max(100).optional(),
        lsiMinOrange: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const maxOrder = await ctx.prisma.rehabCriterion.findFirst({
        where: { phaseId: input.phaseId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const order = (maxOrder?.order ?? -1) + 1
      const { phaseId, ...rest } = input
      const c = await ctx.prisma.rehabCriterion.create({
        data: { phaseId, order, ...rest },
      })
      return { id: c.id }
    }),

  adminDeleteCriterion: mfaAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.rehabCriterion.delete({ where: { id: input.id } })
      return { ok: true }
    }),
})
