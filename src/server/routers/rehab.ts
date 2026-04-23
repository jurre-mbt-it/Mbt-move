/**
 * Rehab-protocol tRPC router.
 *
 * Therapist-facing stoplicht-tracker voor fasegebonden revalidatie-criteria.
 * Catalog-tabellen (RehabProtocol/Phase/Criterion) zijn admin-beheerd.
 * Therapeut activeert per patient en vinkt criteria R/O/G af.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  const relation = await prisma.patientTherapist.findFirst({
    where: { therapistId: user.id, patientId, ...ACTIVE_LINK },
  })
  if (!relation) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve behandelrelatie met deze patiënt',
    })
  }
}

function weeksBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 3600 * 1000))
}

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

      const tracker = await ctx.prisma.patientRehabTracker.findUnique({
        where: { patientId: input.patientId },
        include: {
          protocol: {
            include: {
              phases: {
                orderBy: { order: 'asc' },
                include: {
                  criteria: { orderBy: { order: 'asc' } },
                },
              },
            },
          },
          activatedBy: { select: { id: true, name: true, email: true } },
        },
      })

      if (!tracker) return null

      // Haal statuses op voor alle criteria van dit protocol
      const criterionIds = tracker.protocol.phases.flatMap((p) =>
        p.criteria.map((c) => c.id),
      )
      const statuses = criterionIds.length
        ? await ctx.prisma.rehabCriterionStatus.findMany({
            where: {
              patientId: input.patientId,
              criterionId: { in: criterionIds },
            },
          })
        : []
      const statusByCriterionId = new Map(statuses.map((s) => [s.criterionId, s]))

      // Bereken expected phase op basis van operatiedatum
      const now = new Date()
      let weeksSinceSurgery: number | null = null
      let expectedPhaseOrder: number | null = null
      if (tracker.surgeryDate) {
        weeksSinceSurgery = weeksBetween(tracker.surgeryDate, now)
        // Kies fase waar typicalStartWeek <= wss < typicalEndWeek (of endWeek null)
        for (const phase of tracker.protocol.phases) {
          if (phase.typicalStartWeek == null) continue
          if (weeksSinceSurgery < phase.typicalStartWeek) continue
          if (phase.typicalEndWeek == null || weeksSinceSurgery < phase.typicalEndWeek) {
            expectedPhaseOrder = phase.order
            break
          }
        }
        // Voor surgery nog niet gebeurd: blijf in pre-op
        if (weeksSinceSurgery < 0) {
          const preOp = tracker.protocol.phases.find((p) => p.order === 0)
          if (preOp) expectedPhaseOrder = preOp.order
        }
      }

      // Overall progress: % criteria MET
      const total = criterionIds.length
      const met = statuses.filter((s) => s.status === 'MET').length
      const inProgress = statuses.filter((s) => s.status === 'IN_PROGRESS').length
      const progressPct = total > 0 ? Math.round((met / total) * 100) : 0

      return {
        patientId: input.patientId,
        protocolId: tracker.protocolId,
        protocol: {
          id: tracker.protocol.id,
          key: tracker.protocol.key,
          name: tracker.protocol.name,
          description: tracker.protocol.description,
          sourceReference: tracker.protocol.sourceReference,
        },
        surgeryDate: tracker.surgeryDate,
        injuryDate: tracker.injuryDate,
        activatedAt: tracker.activatedAt,
        activatedByName: tracker.activatedBy.name ?? tracker.activatedBy.email,
        notes: tracker.notes,
        weeksSinceSurgery,
        expectedPhaseOrder,
        progress: { total, met, inProgress, pct: progressPct },
        phases: tracker.protocol.phases.map((phase) => {
          const phaseStatuses = phase.criteria.map((c) => statusByCriterionId.get(c.id))
          const phaseTotal = phase.criteria.length
          const phaseMet = phaseStatuses.filter((s) => s?.status === 'MET').length
          const phaseInProgress = phaseStatuses.filter((s) => s?.status === 'IN_PROGRESS').length
          return {
            id: phase.id,
            order: phase.order,
            shortName: phase.shortName,
            name: phase.name,
            description: phase.description,
            keyGoals: phase.keyGoals,
            typicalStartWeek: phase.typicalStartWeek,
            typicalEndWeek: phase.typicalEndWeek,
            progress: {
              total: phaseTotal,
              met: phaseMet,
              inProgress: phaseInProgress,
              pct: phaseTotal > 0 ? Math.round((phaseMet / phaseTotal) * 100) : 0,
            },
            criteria: phase.criteria.map((c) => {
              const s = statusByCriterionId.get(c.id)
              return {
                id: c.id,
                order: c.order,
                name: c.name,
                testDescription: c.testDescription,
                reference: c.reference,
                targetValue: c.targetValue,
                targetUnit: c.targetUnit,
                inputType: c.inputType,
                isBonus: c.isBonus,
                status: s?.status ?? 'NOT_MET',
                measurementValue: s?.measurementValue ?? null,
                measurementDate: s?.measurementDate ?? null,
                notes: s?.notes ?? null,
                updatedAt: s?.updatedAt ?? null,
              }
            }),
          }
        }),
      }
    }),

  activateForPatient: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        protocolId: z.string(),
        surgeryDate: z.string().nullable().optional(),
        injuryDate: z.string().nullable().optional(),
        notes: z.string().optional(),
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
        notes: z.string().nullable().optional(),
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
        notes: z.string().nullable().optional(),
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
})
