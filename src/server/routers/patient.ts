/**
 * Patient tRPC router — replaces all mock-data functions for the patient section.
 *
 * Procedures:
 * - getTodayExercises   → session page exercise list
 * - getActiveProgram    → full program for schedule / program-detail page
 * - logSession          → save completed session + exercise logs
 * - getSessionHistory   → history / dashboard last session
 * - getWorkloadSessions → ACWR calculation input
 * - getRecoverySessions → muscle recovery calculation input
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { muscleLoadsRecord } from '@/server/lib/muscle-loads'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { auditLog } from '@/server/audit'

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeCurrentWeekDay(
  startDate: Date | null,
  programWeeks: number,
  exerciseWeeks: number[]
): { week: number; day: number } {
  const today = new Date()
  const start = startDate ?? today
  const daysSince = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000))
  const week = Math.min(Math.floor(daysSince / 7) + 1, programWeeks)

  const daysAvailable = [...new Set(exerciseWeeks)].sort((a, b) => a - b)
  const dayIndex = daysSince % Math.max(daysAvailable.length, 1)
  const day = daysAvailable[dayIndex] ?? 1

  return { week, day }
}

function mapProgramExercise(pe: {
  id: string
  exerciseId: string
  week: number
  day: number
  order: number
  sets: number
  reps: number
  repUnit: string
  restTime: number
  supersetGroup: string | null
  supersetOrder: number
  notes: string | null
  exercise: {
    name: string
    category: string
    difficulty: string
    videoUrl: string | null
    muscleLoads?: { muscle: string; load: number }[]
    easierVariantId: string | null
    harderVariantId: string | null
    trackOneRepMax?: boolean
    defaultExtraParams?: unknown
  }
}) {
  return {
    uid: pe.id,
    exerciseId: pe.exerciseId,
    week: pe.week,
    day: pe.day,
    name: pe.exercise.name,
    category: pe.exercise.category,
    difficulty: pe.exercise.difficulty,
    sets: pe.sets,
    reps: pe.reps,
    repUnit: pe.repUnit,
    restTime: pe.restTime,
    videoUrl: pe.exercise.videoUrl ?? null,
    muscleLoads: pe.exercise.muscleLoads
      ? muscleLoadsRecord({ category: pe.exercise.category, muscleLoads: pe.exercise.muscleLoads })
      : {} as Record<string, number>,
    supersetGroup: pe.supersetGroup ?? null,
    supersetOrder: pe.supersetOrder,
    notes: pe.notes ?? null,
    easierVariantId: pe.exercise.easierVariantId ?? null,
    harderVariantId: pe.exercise.harderVariantId ?? null,
    trackOneRepMax: pe.exercise.trackOneRepMax ?? false,
    defaultExtraParams: Array.isArray(pe.exercise.defaultExtraParams)
      ? (pe.exercise.defaultExtraParams as Array<Record<string, unknown>>)
      : [],
  }
}

// ─── router ───────────────────────────────────────────────────────────────────

export const patientRouter = createTRPCRouter({

  // ── Active program (full, for schedule / program detail) ─────────────────

  getActiveProgram: protectedProcedure.query(async ({ ctx }) => {
    const program = await ctx.prisma.program.findFirst({
      where: { patientId: ctx.user.id, status: 'ACTIVE' },
      include: {
        exercises: {
          include: {
            exercise: { include: { muscleLoads: true } },
          },
          orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
        },
      },
    })

    if (!program) return null

    const exercises = program.exercises.map(mapProgramExercise)

    // Group by week → day
    const byWeekDay: Record<number, Record<number, typeof exercises>> = {}
    for (const ex of exercises) {
      if (!byWeekDay[ex.week]) byWeekDay[ex.week] = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(byWeekDay[ex.week] as any)[ex.day]) (byWeekDay[ex.week] as Record<number, typeof exercises>)[ex.day] = []
      ;(byWeekDay[ex.week] as Record<number, typeof exercises>)[ex.day].push(ex)
    }

    const { week: currentWeek, day: currentDay } = computeCurrentWeekDay(
      program.startDate,
      program.weeks,
      exercises.map(e => e.day)
    )

    return {
      id: program.id,
      name: program.name,
      description: program.description ?? null,
      status: program.status,
      weeks: program.weeks,
      daysPerWeek: program.daysPerWeek,
      startDate: program.startDate?.toISOString() ?? null,
      currentWeek,
      currentDay,
      exercises,
      byWeekDay,
    }
  }),

  // ── Today's exercises (for session page) ─────────────────────────────────

  getTodayExercises: protectedProcedure
    .input(
      z
        .object({
          patientId: z.string().optional(),
          // Catch-up: laat patient een gemiste dag inhalen door specifiek
          // week/day op te vragen i.p.v. computeCurrentWeekDay.
          week: z.number().int().min(1).optional(),
          day: z.number().int().min(1).max(7).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
    // Default = eigen user. Therapist kan patientId meegeven om door
    // patient's oogpunt te kijken (bv. live-behandeling flow).
    let targetPatientId = ctx.user.id
    if (input?.patientId && input.patientId !== ctx.user.id) {
      if (ctx.user.role !== 'THERAPIST' && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: {
          therapistId: ctx.user.id,
          patientId: input.patientId,
          isActive: true, status: 'APPROVED',
        },
      })
      if (!relation && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      targetPatientId = input.patientId
    }

    const program = await ctx.prisma.program.findFirst({
      where: { patientId: targetPatientId, status: 'ACTIVE' },
      include: {
        exercises: {
          include: {
            exercise: {
              select: {
                name: true, category: true, difficulty: true,
                videoUrl: true, easierVariantId: true, harderVariantId: true,
                trackOneRepMax: true, defaultExtraParams: true,
              },
            },
          },
          orderBy: [{ order: 'asc' }],
        },
      },
    })

    if (!program) return { program: null, exercises: [] }

    const allExercises = program.exercises.map(mapProgramExercise)

    // Flexible-schedule modus: patient mag elke dag het hele programma starten;
    // klaar zodra weeklyTarget keer voltooid in de huidige week (Mo-Su).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flexible = (program as any).flexibleSchedule === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weeklyTarget = (program as any).weeklyTarget as number | null | undefined

    if (flexible && weeklyTarget && weeklyTarget > 0) {
      // Bereken huidige week (Mo-Su) in patient's lokale TZ via server.
      const now = new Date()
      const day0 = now.getDay()  // 0=Su..6=Sa
      const offsetFromMon = (day0 + 6) % 7
      const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - offsetFromMon)
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7)

      const completedThisWeek = await ctx.prisma.sessionLog.count({
        where: {
          patientId: targetPatientId,
          programId: program.id,
          completedAt: { gte: weekStart, lt: weekEnd },
        },
      })

      // Alle oefeningen op één virtuele "vandaag-dag" — geen dag-filter want
      // flexible programma's hebben geen week/day-schedule meer.
      const exercisesPool = allExercises

      const targetReached = completedThisWeek >= weeklyTarget

      return {
        program: {
          id: program.id,
          name: program.name,
          currentWeek: 1,
          currentDay: 1,
          weeks: program.weeks,
          isCatchUp: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tendinopathyMode: (program as any).tendinopathyMode ?? false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackOneRepMax: (program as any).trackOneRepMax ?? false,
          flexibleSchedule: true,
          weeklyTarget,
          completedThisWeek,
          weeklyTargetReached: targetReached,
        },
        // Wanneer target bereikt: lege lijst zodat oude clients (iOS) niet
        // dezelfde oefeningen opnieuw aanbieden. Web-app gebruikt
        // weeklyTargetReached om de "lekker bezig" boodschap te tonen.
        exercises: targetReached ? [] : exercisesPool,
      }
    }

    const computed = computeCurrentWeekDay(
      program.startDate,
      program.weeks,
      [...new Set(allExercises.map(e => e.day))]
    )

    // Catch-up override: als client expliciet week+day meegeeft (gemiste dag inhalen)
    // gebruiken we die i.p.v. de berekende huidige dag.
    const week = input?.week ?? computed.week
    const day = input?.day ?? computed.day
    const isCatchUp = input?.week !== undefined || input?.day !== undefined

    const todayExercises = allExercises.filter(e => e.week === week && e.day === day)

    return {
      program: {
        id: program.id,
        name: program.name,
        currentWeek: week,
        currentDay: day,
        weeks: program.weeks,
        isCatchUp,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tendinopathyMode: (program as any).tendinopathyMode ?? false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackOneRepMax: (program as any).trackOneRepMax ?? false,
        flexibleSchedule: false,
        weeklyTarget: null,
        completedThisWeek: 0,
        weeklyTargetReached: false,
      },
      exercises: todayExercises,
    }
  }),

  // ── Log a completed session ───────────────────────────────────────────────

  logSession: protectedProcedure
    .input(
      z.object({
        programId: z.string().optional(),
        scheduledAt: z.string(),       // ISO date string
        completedAt: z.string(),       // ISO date string
        durationSeconds: z.number().int().min(0),
        painLevel: z.number().int().min(0).max(10).nullable(),
        exertionLevel: z.number().int().min(0).max(10).nullable(),
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).optional(),
            repsCompleted: z.number().int().min(0).optional(),
            painLevel: z.number().int().min(0).max(10).nullable().optional(),
            weight: z.number().nullable().optional(),
            estimatedOneRepMax: z.number().nullable().optional(),
            painDuring: z.number().int().min(0).max(10).nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.logSession', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }
      const sessionLog = await ctx.prisma.sessionLog.create({
        data: {
          patientId: ctx.user.id,
          programId: input.programId ?? undefined,
          scheduledAt: new Date(input.scheduledAt),
          completedAt: new Date(input.completedAt),
          status: 'COMPLETED',
          duration: input.durationSeconds,
          painLevel: input.painLevel,
          exertionLevel: input.exertionLevel,
          exerciseLogs: {
            create: input.exercises.map(ex => ({
              exerciseId: ex.exerciseId,
              setsCompleted: ex.setsCompleted ?? null,
              repsCompleted: ex.repsCompleted ?? null,
              painLevel: ex.painLevel ?? null,
              weight: ex.weight ?? null,
              estimatedOneRepMax: ex.estimatedOneRepMax ?? null,
              painDuring: ex.painDuring ?? null,
            })),
          },
        },
        select: { id: true },
      })
      await auditLog({
        event: 'SESSION_LOGGED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'SessionLog',
        resourceId: sessionLog.id,
        metadata: {
          exerciseCount: input.exercises.length,
          durationSeconds: input.durationSeconds,
        },
        req: ctx.req,
      })
      return sessionLog
    }),

  // ── Log a completed cardio session ───────────────────────────────────────

  logCardioSession: protectedProcedure
    .input(
      z.object({
        programId: z.string().nullable().optional(),
        activity: z.enum([
          'RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'CROSSTRAINER',
          'WALKING', 'SKIERG', 'ASSAULT_BIKE', 'WATTBIKE', 'STAIRCLIMBER', 'OTHER',
        ]),
        protocol: z.enum([
          'STEADY_STATE', 'INTERVALS', 'TEMPO', 'FARTLEK',
          'ZONE_TRAINING', 'THRESHOLD', 'LONG_SLOW_DISTANCE', 'WALK_RUN',
        ]),
        durationSec: z.number().int().min(0),
        distanceM: z.number().int().min(0).nullable().optional(),
        avgHeartRate: z.number().int().min(40).max(220).nullable().optional(),
        maxHeartRate: z.number().int().min(40).max(220).nullable().optional(),
        zone: z.number().int().min(1).max(5).nullable().optional(),
        rpe: z.number().int().min(1).max(10).nullable().optional(),
        painLevel: z.number().int().min(0).max(10).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.logCardioSession', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }
      const log = await ctx.prisma.cardioLog.create({
        data: {
          patientId: ctx.user.id,
          programId: input.programId ?? null,
          activity: input.activity,
          protocol: input.protocol,
          durationSec: input.durationSec,
          distanceM: input.distanceM ?? null,
          avgHeartRate: input.avgHeartRate ?? null,
          maxHeartRate: input.maxHeartRate ?? null,
          zone: input.zone ?? null,
          rpe: input.rpe ?? null,
          painLevel: input.painLevel ?? null,
          notes: input.notes ?? null,
        },
        select: { id: true },
      })
      await auditLog({
        event: 'CARDIO_SESSION_LOGGED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'CardioLog',
        resourceId: log.id,
        metadata: {
          activity: input.activity,
          protocol: input.protocol,
          durationSec: input.durationSec,
        },
        req: ctx.req,
      })
      return log
    }),

  // ── Active cardio program → genormaliseerde sessie ──────────────────────

  /**
   * Vindt het actieve CARDIO-programma van de ingelogde patiënt en converteert
   * het naar de shape die de cardio-session pagina verwacht.
   *
   * cardioParams JSONB komt uit twee wizards (zie programs/new/workout en
   * programs/new/walk-run) en heeft daarom verschillende velden — dit is de
   * brug die de UI uniform houdt.
   */
  getActiveCardioProgram: protectedProcedure.query(async ({ ctx }) => {
    const program = await ctx.prisma.program.findFirst({
      where: { patientId: ctx.user.id, status: 'ACTIVE', type: 'CARDIO' },
      orderBy: { updatedAt: 'desc' },
    })
    if (!program) return null

    const params = (program.cardioParams ?? {}) as Record<string, unknown>

    // Bepaal current week (1-based) op basis van elapsed days sinds startDate.
    const start = program.startDate ?? program.createdAt
    const daysSince = Math.max(
      0,
      Math.floor((Date.now() - start.getTime()) / 86_400_000),
    )
    const weekIdx = Math.min(Math.floor(daysSince / 7), program.weeks - 1)
    const week = weekIdx + 1

    // Walk-Run subtype: weken bevatten run/walk minutes en aantal rondes.
    if (params.subType === 'WALK_RUN' && Array.isArray(params.weeks)) {
      const weeks = params.weeks as Array<{
        runMin?: number
        walkMin?: number
        rounds?: number
        sessionsPerWeek?: number
      }>
      const w = weeks[weekIdx] ?? weeks[weeks.length - 1] ?? { runMin: 1, walkMin: 2, rounds: 6 }
      const rounds = Math.max(1, w.rounds ?? 6)
      const intervals: Array<{ label: string; type: 'WALK' | 'RUN'; durationSec: number }> = []
      for (let i = 0; i < rounds; i++) {
        intervals.push({ label: 'Wandelen', type: 'WALK', durationSec: (w.walkMin ?? 2) * 60 })
        intervals.push({ label: 'Lopen', type: 'RUN', durationSec: (w.runMin ?? 1) * 60 })
      }
      return {
        id: program.id,
        programName: program.name,
        activity: 'RUNNING' as const,
        protocol: 'WALK_RUN' as const,
        week,
        session: 1,
        targetDurationMin: Math.round(intervals.reduce((s, i) => s + i.durationSec, 0) / 60),
        targetZone: 2 as const,
        intervals,
      }
    }

    // Pure cardio: optioneel intervals[] met workDuration/restDuration/repetitions.
    const rawIntervals = Array.isArray(params.intervals)
      ? (params.intervals as Array<{
          workDuration?: number
          restDuration?: number
          repetitions?: number
          label?: string
        }>)
      : []
    const flatIntervals: Array<{ label: string; type: 'WALK' | 'RUN'; durationSec: number }> = []
    for (const block of rawIntervals) {
      const reps = Math.max(1, block.repetitions ?? 1)
      for (let i = 0; i < reps; i++) {
        flatIntervals.push({
          label: block.label ?? 'Werk',
          type: 'RUN',
          durationSec: block.workDuration ?? 60,
        })
        if ((block.restDuration ?? 0) > 0) {
          flatIntervals.push({
            label: 'Rust',
            type: 'WALK',
            durationSec: block.restDuration ?? 30,
          })
        }
      }
    }

    const targetZoneRaw = params.targetZone
    const targetZone =
      typeof targetZoneRaw === 'number' && targetZoneRaw >= 1 && targetZoneRaw <= 5
        ? (targetZoneRaw as 1 | 2 | 3 | 4 | 5)
        : (2 as const)

    return {
      id: program.id,
      programName: program.name,
      activity: ((params.activity as string) ?? 'RUNNING') as
        | 'RUNNING' | 'CYCLING' | 'ROWING' | 'SWIMMING' | 'CROSSTRAINER'
        | 'WALKING' | 'SKIERG' | 'ASSAULT_BIKE' | 'WATTBIKE' | 'STAIRCLIMBER' | 'OTHER',
      protocol: ((params.protocol as string) ?? 'STEADY_STATE') as
        | 'STEADY_STATE' | 'INTERVALS' | 'TEMPO' | 'FARTLEK'
        | 'ZONE_TRAINING' | 'THRESHOLD' | 'LONG_SLOW_DISTANCE' | 'WALK_RUN',
      week,
      session: 1,
      targetDurationMin:
        typeof params.targetDurationMin === 'number' ? params.targetDurationMin : 30,
      targetZone,
      intervals: flatIntervals,
    }
  }),

  // ── Log a stand-alone pain report ────────────────────────────────────────

  reportPain: protectedProcedure
    .input(
      z.object({
        nrs: z.number().int().min(0).max(10),
        location: z.string().min(1).max(80),
        context: z.enum(['rest', 'movement', 'exercise', 'after', 'always']),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.reportPain', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }
      const entry = await ctx.prisma.painEntry.create({
        data: {
          userId: ctx.user.id,
          nrs: input.nrs,
          location: input.location,
          context: input.context,
          notes: input.notes ?? null,
        },
        select: { id: true },
      })
      await auditLog({
        event: 'PAIN_REPORTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PainEntry',
        resourceId: entry.id,
        metadata: { nrs: input.nrs, context: input.context },
        req: ctx.req,
      })
      return entry
    }),

  // ── Last weights per exercise ─────────────────────────────────────────────

  /**
   * Laatste gebruikte gewicht per oefening voor een user (self of patient
   * via therapeut-flow). Handig om als "laatst gebruikt" hint te tonen.
   */
  getLastWeights: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let targetId = ctx.user!.id
      if (input?.patientId && input.patientId !== ctx.user!.id) {
        if (ctx.user!.role !== 'THERAPIST' && ctx.user!.role !== 'ADMIN') {
          throw new TRPCError({ code: 'FORBIDDEN' })
        }
        const relation = await ctx.prisma.patientTherapist.findFirst({
          where: {
            therapistId: ctx.user!.id,
            patientId: input.patientId,
            isActive: true, status: 'APPROVED',
          },
        })
        if (!relation && ctx.user!.role !== 'ADMIN') {
          throw new TRPCError({ code: 'FORBIDDEN' })
        }
        targetId = input.patientId
      }

      const logs = await ctx.prisma.exerciseLog.findMany({
        where: {
          session: { patientId: targetId, status: 'COMPLETED' },
          weight: { not: null, gt: 0 },
        },
        orderBy: { session: { completedAt: 'desc' } },
        select: {
          exerciseId: true,
          weight: true,
          repsCompleted: true,
          session: { select: { completedAt: true } },
        },
        take: 500, // genoeg voor recente historie
      })

      // Dedupe — eerste (meest recente) per exerciseId wint
      const byExercise: Record<
        string,
        { weight: number; reps: number | null; date: string }
      > = {}
      for (const log of logs) {
        if (!(log.exerciseId in byExercise) && log.weight !== null) {
          byExercise[log.exerciseId] = {
            weight: log.weight,
            reps: log.repsCompleted,
            date: (log.session.completedAt ?? new Date()).toISOString(),
          }
        }
      }

      return byExercise
    }),

  // ── Personal bests: hoogste estimated 1RM per oefening ──────────────────

  /**
   * Hoogste ooit gelogde `estimatedOneRepMax` per oefening voor deze patiënt.
   * Gebruikt op de session-pagina om een PR te detecteren tijdens loggen.
   */
  getPersonalBests: protectedProcedure.query(async ({ ctx }) => {
    const grouped = await ctx.prisma.exerciseLog.groupBy({
      by: ['exerciseId'],
      where: {
        session: { patientId: ctx.user.id, status: 'COMPLETED' },
        estimatedOneRepMax: { not: null, gt: 0 },
      },
      _max: { estimatedOneRepMax: true },
    })
    const out: Record<string, number> = {}
    for (const row of grouped) {
      if (row._max.estimatedOneRepMax != null) {
        out[row.exerciseId] = row._max.estimatedOneRepMax
      }
    }
    return out
  }),

  // ── 1RM progressie per oefening (voor progress page chart) ──────────────

  /**
   * Tijd-reeks van geschatte 1RM per oefening, gesorteerd oud → nieuw.
   * Limiet: top-N oefeningen op basis van aantal datapoints, met max
   * datapoints per oefening om payload klein te houden.
   */
  getOneRmProgression: protectedProcedure
    .input(
      z
        .object({
          maxExercises: z.number().int().min(1).max(20).default(4),
          maxPointsPerExercise: z.number().int().min(2).max(50).default(15),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.maxExercises ?? 4
      const pointsCap = input?.maxPointsPerExercise ?? 15

      const logs = await ctx.prisma.exerciseLog.findMany({
        where: {
          session: { patientId: ctx.user.id, status: 'COMPLETED' },
          estimatedOneRepMax: { not: null, gt: 0 },
        },
        orderBy: { session: { completedAt: 'asc' } },
        select: {
          exerciseId: true,
          estimatedOneRepMax: true,
          session: { select: { completedAt: true } },
        },
        take: 2000,
      })

      // Group by exerciseId.
      const grouped = new Map<string, Array<{ value: number; date: string }>>()
      for (const log of logs) {
        const date = (log.session.completedAt ?? new Date()).toISOString()
        if (!grouped.has(log.exerciseId)) grouped.set(log.exerciseId, [])
        grouped.get(log.exerciseId)!.push({
          value: log.estimatedOneRepMax!,
          date,
        })
      }

      // Top N op aantal datapoints (meest geserveerde oefeningen voorop).
      const top = Array.from(grouped.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, limit)

      const exerciseIds = top.map(([id]) => id)
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const nameMap = new Map(exercises.map(e => [e.id, e.name]))

      return top.map(([exerciseId, points]) => {
        // Subsample naar pointsCap (gelijkmatig verspreid, behoud eerste/laatste).
        const trimmed =
          points.length <= pointsCap
            ? points
            : points.filter((_, i, arr) => {
                if (i === 0 || i === arr.length - 1) return true
                const step = (arr.length - 2) / (pointsCap - 2)
                return Math.round((i - 1) / step) * step + 1 === i
              })
        return {
          exerciseId,
          name: nameMap.get(exerciseId) ?? 'Oefening',
          data: trimmed.map((p, i) => ({
            session: i + 1,
            date: p.date,
            value: Math.round(p.value * 10) / 10,
          })),
        }
      })
    }),

  // ── Tendinopathie-trend (3-lijn chart op progress page) ─────────────────

  /**
   * Tijdreeks van pijnDuring / painAfter24h / morningStiffness uit
   * exerciseLogs in tendinopathy-mode programs. Eén punt per sessie:
   * gemiddelden over de exercise-logs van die sessie.
   */
  getTendinopathyTrend: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: ctx.user.id,
          status: 'COMPLETED',
          program: { tendinopathyMode: true },
        },
        orderBy: { completedAt: 'asc' },
        take: input?.limit ?? 10,
        select: {
          id: true,
          completedAt: true,
          exerciseLogs: {
            select: {
              painDuring: true,
              painAfter24h: true,
              morningStiffness: true,
            },
          },
        },
      })

      const avg = (vals: Array<number | null>): number | null => {
        const nums = vals.filter((v): v is number => v != null)
        if (nums.length === 0) return null
        return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10
      }

      return sessions
        .map((s, i) => ({
          session: i + 1,
          date: (s.completedAt ?? new Date()).toISOString(),
          painDuring: avg(s.exerciseLogs.map(el => el.painDuring)),
          painAfter24h: avg(s.exerciseLogs.map(el => el.painAfter24h)),
          morningStiffness: avg(s.exerciseLogs.map(el => el.morningStiffness)),
        }))
        // Filter sessies zonder enige tendinopathy-data weg.
        .filter(p => p.painDuring != null || p.painAfter24h != null || p.morningStiffness != null)
    }),

  // ── Tendinopathy pain follow-up (24u na sessie) ───────────────────────────

  hasTendinopathyProgram: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.program.count({
      where: {
        patientId: ctx.user!.id,
        status: 'ACTIVE',
        tendinopathyMode: true,
      },
    })
    return count > 0
  }),

  getPendingPainFollowUps: protectedProcedure.query(async ({ ctx }) => {
    // Sessies tussen 16u en 48u geleden waar tendinopathy mode aan stond,
    // met exercise-logs die painDuring hebben maar geen painAfter24h.
    const now = Date.now()
    const earliest = new Date(now - 48 * 60 * 60 * 1000)
    const latest = new Date(now - 16 * 60 * 60 * 1000)

    const sessions = await ctx.prisma.sessionLog.findMany({
      where: {
        patientId: ctx.user!.id,
        status: 'COMPLETED',
        completedAt: { gte: earliest, lte: latest },
        program: { tendinopathyMode: true },
      },
      include: {
        program: { select: { id: true, name: true, tendinopathyMode: true } },
        exerciseLogs: {
          where: {
            painDuring: { not: null },
            painAfter24h: null,
          },
          include: {
            // We need exercise name
          },
        },
      },
    })

    // Haal exercise-namen op
    const exerciseIds = Array.from(
      new Set(sessions.flatMap(s => s.exerciseLogs.map(el => el.exerciseId))),
    )
    const exercises = exerciseIds.length
      ? await ctx.prisma.exercise.findMany({
          where: { id: { in: exerciseIds } },
          select: { id: true, name: true },
        })
      : []
    const exerciseMap = new Map(exercises.map(e => [e.id, e.name]))

    return sessions
      .filter(s => s.exerciseLogs.length > 0)
      .map(s => ({
        sessionId: s.id,
        completedAt: s.completedAt,
        programName: s.program?.name ?? null,
        exerciseLogs: s.exerciseLogs.map(el => ({
          id: el.id,
          exerciseId: el.exerciseId,
          exerciseName: exerciseMap.get(el.exerciseId) ?? 'Oefening',
          painDuring: el.painDuring,
        })),
      }))
  }),

  submitPainFollowUp: protectedProcedure
    .input(
      z.object({
        exerciseLogId: z.string(),
        painAfter24h: z.number().int().min(0).max(10),
        morningStiffness: z.number().int().min(0).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const log = await ctx.prisma.exerciseLog.findUnique({
        where: { id: input.exerciseLogId },
        select: { session: { select: { patientId: true } } },
      })
      if (!log || log.session.patientId !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      return ctx.prisma.exerciseLog.update({
        where: { id: input.exerciseLogId },
        data: {
          painAfter24h: input.painAfter24h,
          morningStiffness: input.morningStiffness ?? null,
        },
      })
    }),

  // ── Session history (for history page / dashboard) ────────────────────────

  getSessionHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: { patientId: ctx.user.id, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: input?.limit ?? 20,
        include: {
          program: { select: { id: true, name: true } },
          exerciseLogs: { select: { exerciseId: true } },
        },
      })

      return sessions.map(s => ({
        id: s.id,
        completedAt: s.completedAt?.toISOString() ?? s.scheduledAt.toISOString(),
        scheduledAt: s.scheduledAt.toISOString(),
        programId: s.program?.id ?? null,
        programName: s.program?.name ?? null,
        durationSeconds: s.duration ?? 0,
        durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
        painLevel: s.painLevel ?? null,
        exertionLevel: s.exertionLevel ?? null,
        exerciseCount: s.exerciseLogs.length,
        notes: s.notes ?? null,
      }))
    }),

  // ── Workload sessions for ACWR (SessionWorkload[]) ────────────────────────

  getWorkloadSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.prisma.sessionLog.findMany({
      where: {
        patientId: ctx.user.id,
        status: 'COMPLETED',
        completedAt: { not: null },
        duration: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
      select: { completedAt: true, duration: true, exertionLevel: true },
    })

    return sessions
      .filter(s => s.completedAt && s.duration != null)
      .map(s => {
        const durationMinutes = Math.max(1, Math.round(s.duration! / 60))
        // Default RPE 5 if no smiley was chosen (neutral effort)
        const rpe = s.exertionLevel ?? 5
        return {
          date: s.completedAt!,
          durationMinutes,
          rpe,
          sRPE: Math.round(durationMinutes * rpe),
        }
      })
  }),

  // ── Recovery sessions — with muscle loads (ExerciseSession[]) ─────────────

  getRecoverySessions: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date()
    since.setDate(since.getDate() - 7)

    const sessions = await ctx.prisma.sessionLog.findMany({
      where: {
        patientId: ctx.user.id,
        status: 'COMPLETED',
        completedAt: { gte: since },
      },
      include: {
        exerciseLogs: { select: { exerciseId: true, setsCompleted: true, repsCompleted: true, painLevel: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    // Collect all unique exercise IDs
    const exerciseIds = [
      ...new Set(sessions.flatMap(s => s.exerciseLogs.map(el => el.exerciseId))),
    ]

    if (exerciseIds.length === 0) return []

    const exercises = await ctx.prisma.exercise.findMany({
      where: { id: { in: exerciseIds } },
      include: { muscleLoads: true },
    })

    const exMap = new Map(exercises.map(e => [e.id, e]))

    return sessions.flatMap(session =>
      session.exerciseLogs.flatMap(log => {
        const ex = exMap.get(log.exerciseId)
        if (!ex) return []
        return [{
          exerciseId: log.exerciseId,
          muscleLoads: muscleLoadsRecord(ex),
          sets: log.setsCompleted ?? 3,
          reps: log.repsCompleted ?? 10,
          repUnit: 'reps',
          completedAt: session.completedAt ?? session.scheduledAt,
          painLevel: log.painLevel ?? session.painLevel ?? undefined,
          rpe: session.exertionLevel ?? undefined,
        }]
      })
    )
  }),

  // ── Therapist-access consent (Phase C) ──────────────────────────────────
  // Patient ziet welke therapeuten toegang hebben of aanvragen, en kan
  // accepteren, afwijzen, of toegang intrekken.

  getTherapistAccess: protectedProcedure.query(async ({ ctx }) => {
    const relations = await ctx.prisma.patientTherapist.findMany({
      where: { patientId: ctx.user!.id, isActive: true },
      include: {
        therapist: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { requestedAt: 'desc' },
      ],
    })
    return relations.map((r) => ({
      id: r.id,
      status: r.status,
      requestedAt: r.requestedAt,
      respondedAt: r.respondedAt,
      therapist: r.therapist,
    }))
  }),

  respondToTherapistAccess: protectedProcedure
    .input(z.object({ relationId: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findUnique({
        where: { id: input.relationId },
      })
      if (!relation) throw new TRPCError({ code: 'NOT_FOUND' })
      if (relation.patientId !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dit is niet jouw koppeling' })
      }
      return ctx.prisma.patientTherapist.update({
        where: { id: input.relationId },
        data: {
          status: input.accept ? 'APPROVED' : 'DECLINED',
          respondedAt: new Date(),
        },
      })
    }),

  revokeTherapistAccess: protectedProcedure
    .input(z.object({ relationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findUnique({
        where: { id: input.relationId },
      })
      if (!relation) throw new TRPCError({ code: 'NOT_FOUND' })
      if (relation.patientId !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dit is niet jouw koppeling' })
      }
      return ctx.prisma.patientTherapist.update({
        where: { id: input.relationId },
        data: {
          status: 'REVOKED',
          respondedAt: new Date(),
        },
      })
    }),
})
