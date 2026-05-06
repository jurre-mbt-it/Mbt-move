/**
 * Cohort analytics router.
 *
 * Twee niveaus:
 * - therapistOverview: aggregates over de eigen patiënten van de ingelogde
 *   therapeut/admin (gebruikt PatientTherapist link).
 * - adminOverview: aggregates over álle patiënten in de praktijk (alleen
 *   ADMIN). Voor cross-practice gebruik bestaat aparte research-router.
 *
 * Beide queries respecteren `cohortAnalyticsOptOut` op de User: opt-out users
 * worden NIET meegenomen in tellingen, gemiddelden of trends.
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  protectedProcedure,
  therapistProcedure,
  adminProcedure,
} from '@/server/trpc'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sinceWindow = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const round1 = (n: number | null) =>
  n == null ? null : Math.round(n * 10) / 10

// ─── Router ───────────────────────────────────────────────────────────────────

export const cohortRouter = createTRPCRouter({
  /**
   * Aggregaten over de eigen patiënten van de therapeut. Patiënten met
   * cohortAnalyticsOptOut=true tellen NIET mee.
   */
  therapistOverview: therapistProcedure
    .input(
      z
        .object({
          windowDays: z.number().int().min(1).max(365).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.windowDays ?? 30
      const since = sinceWindow(days)

      // Alle eigen patiënten met actieve relatie + niet opt-out.
      const patients = await ctx.prisma.user.findMany({
        where: {
          role: 'PATIENT',
          cohortAnalyticsOptOut: false,
          deletedAt: null,
          patientTherapists: {
            some: {
              therapistId: ctx.user.id,
              isActive: true,
              status: 'APPROVED',
            },
          },
        },
        select: { id: true },
      })
      const patientIds = patients.map((p) => p.id)

      if (patientIds.length === 0) {
        return {
          cohortSize: 0,
          windowDays: days,
          totalSessions: 0,
          sessionsThisWeek: 0,
          avgPainLevel: null,
          avgExertionLevel: null,
          avgWellnessScore: null,
          adherencePct: null,
          topExercises: [],
        }
      }

      const weekStart = sinceWindow(7)

      const [
        totalSessions,
        sessionsThisWeek,
        sessionAggregates,
        wellnessAggregate,
        topExerciseRows,
        plannedSessions,
      ] = await Promise.all([
        ctx.prisma.sessionLog.count({
          where: {
            patientId: { in: patientIds },
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
        }),
        ctx.prisma.sessionLog.count({
          where: {
            patientId: { in: patientIds },
            status: 'COMPLETED',
            completedAt: { gte: weekStart },
          },
        }),
        ctx.prisma.sessionLog.aggregate({
          where: {
            patientId: { in: patientIds },
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
          _avg: { painLevel: true, exertionLevel: true },
        }),
        ctx.prisma.wellnessCheck.aggregate({
          where: {
            userId: { in: patientIds },
            date: { gte: since },
          },
          _avg: {
            sleep: true,
            soreness: true,
            fatigue: true,
            mood: true,
            stress: true,
          },
        }),
        ctx.prisma.exerciseLog.groupBy({
          by: ['exerciseId'],
          where: {
            session: {
              patientId: { in: patientIds },
              status: 'COMPLETED',
              completedAt: { gte: since },
            },
          },
          _count: { exerciseId: true },
          orderBy: { _count: { exerciseId: 'desc' } },
          take: 5,
        }),
        ctx.prisma.sessionLog.count({
          where: {
            patientId: { in: patientIds },
            scheduledAt: { gte: since, lte: new Date() },
          },
        }),
      ])

      const exerciseIds = topExerciseRows.map((r) => r.exerciseId)
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const nameMap = new Map(exercises.map((e) => [e.id, e.name]))

      const wellnessTotal =
        wellnessAggregate._avg.sleep != null
          ? (wellnessAggregate._avg.sleep ?? 0) +
            (wellnessAggregate._avg.soreness ?? 0) +
            (wellnessAggregate._avg.fatigue ?? 0) +
            (wellnessAggregate._avg.mood ?? 0) +
            (wellnessAggregate._avg.stress ?? 0)
          : null

      const avgWellnessScore =
        wellnessTotal != null
          ? Math.round(((wellnessTotal - 5) / 20) * 100)
          : null

      const adherencePct =
        plannedSessions > 0
          ? Math.min(100, Math.round((totalSessions / plannedSessions) * 100))
          : null

      return {
        cohortSize: patientIds.length,
        windowDays: days,
        totalSessions,
        sessionsThisWeek,
        avgPainLevel: round1(sessionAggregates._avg.painLevel),
        avgExertionLevel: round1(sessionAggregates._avg.exertionLevel),
        avgWellnessScore,
        adherencePct,
        topExercises: topExerciseRows.map((r) => ({
          exerciseId: r.exerciseId,
          name: nameMap.get(r.exerciseId) ?? 'Oefening',
          count: r._count.exerciseId,
        })),
      }
    }),

  /**
   * Platform-wide aggregaten — alleen voor ADMIN.
   * Net als therapistOverview filteren we op cohortAnalyticsOptOut=false.
   */
  adminOverview: adminProcedure
    .input(
      z
        .object({
          windowDays: z.number().int().min(1).max(365).default(30),
          practiceId: z.string().nullable().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.windowDays ?? 30
      const since = sinceWindow(days)

      const userFilter = {
        role: { in: ['PATIENT', 'ATHLETE'] as ('PATIENT' | 'ATHLETE')[] },
        cohortAnalyticsOptOut: false,
        deletedAt: null,
        ...(input?.practiceId !== undefined
          ? { practiceId: input.practiceId }
          : {}),
      }

      const users = await ctx.prisma.user.findMany({
        where: userFilter,
        select: { id: true, role: true },
      })
      const userIds = users.map((u) => u.id)
      const patientCount = users.filter((u) => u.role === 'PATIENT').length
      const athleteCount = users.filter((u) => u.role === 'ATHLETE').length

      if (userIds.length === 0) {
        return {
          totalUsers: 0,
          patientCount: 0,
          athleteCount: 0,
          windowDays: days,
          totalSessions: 0,
          totalCardioSessions: 0,
          avgPainLevel: null,
          avgExertionLevel: null,
          avgWellnessScore: null,
          activeUserCount: 0,
          topExercises: [],
        }
      }

      const [
        totalSessions,
        totalCardioSessions,
        sessionAggregates,
        wellnessAggregate,
        activeUserRows,
        topExerciseRows,
      ] = await Promise.all([
        ctx.prisma.sessionLog.count({
          where: {
            patientId: { in: userIds },
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
        }),
        ctx.prisma.cardioLog.count({
          where: {
            patientId: { in: userIds },
            completedAt: { gte: since },
          },
        }),
        ctx.prisma.sessionLog.aggregate({
          where: {
            patientId: { in: userIds },
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
          _avg: { painLevel: true, exertionLevel: true },
        }),
        ctx.prisma.wellnessCheck.aggregate({
          where: {
            userId: { in: userIds },
            date: { gte: since },
          },
          _avg: {
            sleep: true,
            soreness: true,
            fatigue: true,
            mood: true,
            stress: true,
          },
        }),
        ctx.prisma.sessionLog.findMany({
          where: {
            patientId: { in: userIds },
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
          select: { patientId: true },
          distinct: ['patientId'],
        }),
        ctx.prisma.exerciseLog.groupBy({
          by: ['exerciseId'],
          where: {
            session: {
              patientId: { in: userIds },
              status: 'COMPLETED',
              completedAt: { gte: since },
            },
          },
          _count: { exerciseId: true },
          orderBy: { _count: { exerciseId: 'desc' } },
          take: 10,
        }),
      ])

      const exerciseIds = topExerciseRows.map((r) => r.exerciseId)
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const nameMap = new Map(exercises.map((e) => [e.id, e.name]))

      const wellnessTotal =
        wellnessAggregate._avg.sleep != null
          ? (wellnessAggregate._avg.sleep ?? 0) +
            (wellnessAggregate._avg.soreness ?? 0) +
            (wellnessAggregate._avg.fatigue ?? 0) +
            (wellnessAggregate._avg.mood ?? 0) +
            (wellnessAggregate._avg.stress ?? 0)
          : null

      const avgWellnessScore =
        wellnessTotal != null
          ? Math.round(((wellnessTotal - 5) / 20) * 100)
          : null

      return {
        totalUsers: userIds.length,
        patientCount,
        athleteCount,
        windowDays: days,
        totalSessions,
        totalCardioSessions,
        avgPainLevel: round1(sessionAggregates._avg.painLevel),
        avgExertionLevel: round1(sessionAggregates._avg.exertionLevel),
        avgWellnessScore,
        activeUserCount: activeUserRows.length,
        topExercises: topExerciseRows.map((r) => ({
          exerciseId: r.exerciseId,
          name: nameMap.get(r.exerciseId) ?? 'Oefening',
          count: r._count.exerciseId,
        })),
      }
    }),

  /**
   * Toggle voor patient/athlete: zelf in/uit cohort-aggregates stappen.
   * Default = meedoen; door op true te zetten wordt de gebruiker uitgesloten
   * van álle therapist-/admin-aggregates.
   */
  setMyOptOut: protectedProcedure
    .input(z.object({ optOut: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { cohortAnalyticsOptOut: input.optOut },
      })
      return { ok: true, optOut: input.optOut }
    }),

  /**
   * Lees-eigen-status (voor de toggle in settings).
   */
  getMyOptOut: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { cohortAnalyticsOptOut: true },
    })
    return { optOut: user?.cohortAnalyticsOptOut ?? false }
  }),
})
