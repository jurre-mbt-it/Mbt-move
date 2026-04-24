/**
 * Clinical Insight Engine (CIE) tRPC router.
 *
 * Access model:
 *   - Therapists see/act on insights of patients they are actively treating
 *     (PatientTherapist isActive=true AND status=APPROVED).
 *   - Admin sees/acts on everything.
 *   - PATIENT/ATHLETE have no procedures here — engine is therapist-facing.
 *
 * Key principle: engine suggests, therapist decides. No automatic actions,
 * no schema mutations from insight side.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  createTRPCRouter,
  therapistProcedure,
  adminProcedure,
} from '@/server/trpc'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  // Toegang = directe PatientTherapist-relatie OF zelfde praktijk (Phase B).
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

export const insightsRouter = createTRPCRouter({
  /**
   * Dashboard voor ingelogde therapeut: alle OPEN insights voor patiënten
   * met wie ze een actieve behandelrelatie hebben, gesorteerd op urgentie + datum.
   */
  getDashboard: therapistProcedure.query(async ({ ctx }) => {
    const patientIds =
      ctx.user.role === 'ADMIN'
        ? undefined
        : (
            await ctx.prisma.patientTherapist.findMany({
              where: { therapistId: ctx.user.id, ...ACTIVE_LINK },
              select: { patientId: true },
            })
          ).map((r) => r.patientId)

    if (patientIds && patientIds.length === 0) {
      return { insights: [], silentPatients: [] }
    }

    const insights = await ctx.prisma.insight.findMany({
      where: {
        ...(patientIds ? { patientId: { in: patientIds } } : {}),
        status: 'OPEN',
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ urgency: 'asc' }, { createdAt: 'desc' }],
      include: {
        patient: { select: { id: true, name: true, email: true } },
        exercise: { select: { id: true, name: true } },
      },
    })

    // "Geactiveerde patiënten zonder insights" — toon als kleine rustige lijst
    const enabledStatuses = await ctx.prisma.patientInsightStatus.findMany({
      where: {
        enabled: true,
        patientObjection: false,
        ...(patientIds ? { patientId: { in: patientIds } } : {}),
      },
      include: { patient: { select: { id: true, name: true, email: true } } },
    })
    const noisyPatientIds = new Set(insights.map((i) => i.patientId))
    const silentPatients = enabledStatuses
      .filter((s) => !noisyPatientIds.has(s.patientId))
      .map((s) => ({
        patientId: s.patient.id,
        name: s.patient.name ?? s.patient.email,
      }))

    return {
      insights: insights.map((i) => ({
        id: i.id,
        patientId: i.patientId,
        patientName: i.patient.name ?? i.patient.email,
        signalType: i.signalType,
        urgency: i.urgency,
        title: i.title,
        suggestion: i.suggestion,
        triggerData: i.triggerData,
        exerciseId: i.exerciseId,
        exerciseName: i.exercise?.name ?? null,
        status: i.status,
        createdAt: i.createdAt,
      })),
      silentPatients,
    }
  }),

  /** Tijdlijn per patiënt — alle insights + acties, nieuwste eerst. */
  getPatientTimeline: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const insights = await ctx.prisma.insight.findMany({
        where: { patientId: input.patientId },
        orderBy: { createdAt: 'desc' },
        include: {
          exercise: { select: { id: true, name: true } },
          actions: {
            orderBy: { createdAt: 'asc' },
            include: { therapist: { select: { id: true, name: true, email: true } } },
          },
        },
      })
      return insights.map((i) => ({
        id: i.id,
        signalType: i.signalType,
        urgency: i.urgency,
        title: i.title,
        suggestion: i.suggestion,
        triggerData: i.triggerData,
        exerciseId: i.exerciseId,
        exerciseName: i.exercise?.name ?? null,
        status: i.status,
        statusChangedAt: i.statusChangedAt,
        snoozedUntil: i.snoozedUntil,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        actions: i.actions.map((a) => ({
          id: a.id,
          action: a.action,
          note: a.note,
          createdAt: a.createdAt,
          therapistName: a.therapist.name ?? a.therapist.email,
        })),
      }))
    }),

  /** Aantal open signalen per patiënt — voor kalender-chip en dashboards. */
  countOpenForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const now = new Date()
      const count = await ctx.prisma.insight.count({
        where: {
          patientId: input.patientId,
          status: 'OPEN',
          OR: [
            { snoozedUntil: null },
            { snoozedUntil: { lte: now } },
          ],
        },
      })
      return { count }
    }),

  /** Status voor activation-toggle op patient detail. */
  getStatus: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const status = await ctx.prisma.patientInsightStatus.findUnique({
        where: { patientId: input.patientId },
      })
      return {
        enabled: status?.enabled ?? false,
        enabledAt: status?.enabledAt ?? null,
        patientObjection: status?.patientObjection ?? false,
        patientObjectionAt: status?.patientObjectionAt ?? null,
        patientObjectionNote: status?.patientObjectionNote ?? null,
      }
    }),

  activateForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const existing = await ctx.prisma.patientInsightStatus.findUnique({
        where: { patientId: input.patientId },
      })
      if (existing?.patientObjection) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Patiënt heeft bezwaar gemaakt tegen de Clinical Insight Engine. Kan niet activeren.',
        })
      }
      await ctx.prisma.patientInsightStatus.upsert({
        where: { patientId: input.patientId },
        update: {
          enabled: true,
          enabledById: ctx.user.id,
          enabledAt: new Date(),
          disabledAt: null,
        },
        create: {
          patientId: input.patientId,
          enabled: true,
          enabledById: ctx.user.id,
          enabledAt: new Date(),
        },
      })
      return { ok: true }
    }),

  deactivateForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      await ctx.prisma.patientInsightStatus.upsert({
        where: { patientId: input.patientId },
        update: {
          enabled: false,
          disabledAt: new Date(),
        },
        create: {
          patientId: input.patientId,
          enabled: false,
          disabledAt: new Date(),
        },
      })
      return { ok: true }
    }),

  /** Therapeut logt actie op insight. note is ALTIJD optioneel. */
  act: therapistProcedure
    .input(
      z.object({
        insightId: z.string(),
        action: z.enum(['VIEWED', 'FOLLOWED_UP', 'DISMISSED', 'SNOOZED', 'REOPENED']),
        note: z.string().optional(),
        snoozeDays: z.number().int().min(1).max(30).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.prisma.insight.findUnique({
        where: { id: input.insightId },
      })
      if (!insight) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, insight.patientId)

      await ctx.prisma.insightAction.create({
        data: {
          insightId: insight.id,
          therapistId: ctx.user.id,
          action: input.action,
          note: input.note,
        },
      })

      // Sync insight.status based on action type
      const patches: {
        status?: 'OPEN' | 'FOLLOWED_UP' | 'DISMISSED' | 'SNOOZED'
        snoozedUntil?: Date | null
        statusChangedById?: string
        statusChangedAt?: Date
      } = {}
      const now = new Date()
      if (input.action === 'FOLLOWED_UP') {
        patches.status = 'FOLLOWED_UP'
        patches.statusChangedById = ctx.user.id
        patches.statusChangedAt = now
      } else if (input.action === 'DISMISSED') {
        patches.status = 'DISMISSED'
        patches.statusChangedById = ctx.user.id
        patches.statusChangedAt = now
      } else if (input.action === 'SNOOZED') {
        const days = input.snoozeDays ?? 7
        patches.status = 'SNOOZED'
        patches.snoozedUntil = new Date(now.getTime() + days * 24 * 3600 * 1000)
        patches.statusChangedById = ctx.user.id
        patches.statusChangedAt = now
      } else if (input.action === 'REOPENED') {
        patches.status = 'OPEN'
        patches.snoozedUntil = null
        patches.statusChangedById = ctx.user.id
        patches.statusChangedAt = now
      }
      if (Object.keys(patches).length > 0) {
        await ctx.prisma.insight.update({
          where: { id: insight.id },
          data: patches,
        })
      }

      return { ok: true }
    }),

  /** Therapeut voorkeuren (signals, thresholds, quiet hours). */
  getPrefs: therapistProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.prisma.therapistInsightPref.findUnique({
      where: { therapistId: ctx.user.id },
    })
    return {
      signalsEnabled: (prefs?.signalsEnabled ?? {}) as Record<string, boolean>,
      customThresholds: (prefs?.customThresholds ?? {}) as Record<string, Record<string, number>>,
      notificationPrefs: (prefs?.notificationPrefs ?? {}) as Record<string, string[]>,
      quietHoursStart: prefs?.quietHoursStart ?? null,
      quietHoursEnd: prefs?.quietHoursEnd ?? null,
    }
  }),

  updatePrefs: therapistProcedure
    .input(
      z.object({
        signalsEnabled: z.record(z.string(), z.boolean()).optional(),
        customThresholds: z.record(z.string(), z.record(z.string(), z.number())).optional(),
        notificationPrefs: z.record(z.string(), z.array(z.string())).optional(),
        quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
        quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.therapistInsightPref.upsert({
        where: { therapistId: ctx.user.id },
        update: {
          ...(input.signalsEnabled !== undefined ? { signalsEnabled: input.signalsEnabled } : {}),
          ...(input.customThresholds !== undefined ? { customThresholds: input.customThresholds } : {}),
          ...(input.notificationPrefs !== undefined ? { notificationPrefs: input.notificationPrefs } : {}),
          ...(input.quietHoursStart !== undefined ? { quietHoursStart: input.quietHoursStart } : {}),
          ...(input.quietHoursEnd !== undefined ? { quietHoursEnd: input.quietHoursEnd } : {}),
        },
        create: {
          therapistId: ctx.user.id,
          signalsEnabled: input.signalsEnabled ?? {},
          customThresholds: input.customThresholds ?? {},
          notificationPrefs: input.notificationPrefs ?? {},
          quietHoursStart: input.quietHoursStart ?? null,
          quietHoursEnd: input.quietHoursEnd ?? null,
        },
      })
      return { ok: true }
    }),

  /** Bezwaar registreren — admin OF actieve behandelend therapeut. */
  registerPatientObjection: therapistProcedure
    .input(z.object({ patientId: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // admin OR treating therapist
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const now = new Date()
      await ctx.prisma.patientInsightStatus.upsert({
        where: { patientId: input.patientId },
        update: {
          patientObjection: true,
          patientObjectionAt: now,
          patientObjectionNote: input.note,
          enabled: false,
          disabledAt: now,
        },
        create: {
          patientId: input.patientId,
          enabled: false,
          patientObjection: true,
          patientObjectionAt: now,
          patientObjectionNote: input.note,
          disabledAt: now,
        },
      })
      return { ok: true }
    }),

  /** Admin-only: catalog van alle regels. */
  listRules: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.insightRule.findMany({ orderBy: { category: 'asc' } })
  }),
})
