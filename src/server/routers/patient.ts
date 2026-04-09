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
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'

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
    muscleLoads: { muscle: string; load: number }[]
    easierVariantId: string | null
    harderVariantId: string | null
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
    muscleLoads: Object.fromEntries(
      pe.exercise.muscleLoads.map(ml => [ml.muscle, ml.load])
    ) as Record<string, number>,
    supersetGroup: pe.supersetGroup ?? null,
    supersetOrder: pe.supersetOrder,
    notes: pe.notes ?? null,
    easierVariantId: pe.exercise.easierVariantId ?? null,
    harderVariantId: pe.exercise.harderVariantId ?? null,
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

  getTodayExercises: protectedProcedure.query(async ({ ctx }) => {
    const program = await ctx.prisma.program.findFirst({
      where: { patientId: ctx.user.id, status: 'ACTIVE' },
      include: {
        exercises: {
          include: {
            exercise: { include: { muscleLoads: true } },
          },
          orderBy: [{ order: 'asc' }],
        },
      },
    })

    if (!program) return { program: null, exercises: [] }

    const allExercises = program.exercises.map(mapProgramExercise)

    const { week, day } = computeCurrentWeekDay(
      program.startDate,
      program.weeks,
      [...new Set(allExercises.map(e => e.day))]
    )

    const todayExercises = allExercises.filter(e => e.week === week && e.day === day)

    return {
      program: {
        id: program.id,
        name: program.name,
        currentWeek: week,
        currentDay: day,
        weeks: program.weeks,
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
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.sessionLog.create({
        data: {
          patientId: ctx.user.id,
          programId: input.programId ?? null,
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
            })),
          },
        },
        select: { id: true },
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
          program: { select: { name: true } },
          exerciseLogs: { select: { exerciseId: true } },
        },
      })

      return sessions.map(s => ({
        id: s.id,
        completedAt: s.completedAt?.toISOString() ?? s.scheduledAt.toISOString(),
        scheduledAt: s.scheduledAt.toISOString(),
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
        exertionLevel: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
      select: { completedAt: true, duration: true, exertionLevel: true },
    })

    return sessions
      .filter(s => s.completedAt && s.duration != null && s.exertionLevel != null)
      .map(s => ({
        date: s.completedAt!,
        durationMinutes: Math.round(s.duration! / 60),
        rpe: s.exertionLevel!,
        sRPE: Math.round((s.duration! / 60) * s.exertionLevel!),
      }))
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
          muscleLoads: Object.fromEntries(ex.muscleLoads.map(ml => [ml.muscle, ml.load])) as Record<string, number>,
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
})
