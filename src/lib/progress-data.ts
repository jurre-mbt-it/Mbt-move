import type { PrismaClient } from '@prisma/client'

const DEFAULT_WINDOW_DAYS = 90

export type ProgressDataResult = {
  sessions: Array<{
    id: string
    date: string
    durationMinutes: number
    painLevel: number | null
    exertionLevel: number | null
    notes: string | null
  }>
  oneRmByExercise: Record<string, { date: string; oneRm: number }[]>
  totalSessions: number
  avgPain: number | null
  avgExertion: number | null
  windowDays: number
}

/**
 * Geconsolideerde voortgangs-data per patient over een vast venster
 * (default 90 dagen). Bron-of-truth voor zowel:
 *  - `patients.getProgress` tRPC (web dashboard)
 *  - `/print/progress/[patientId]` route (PDF export web)
 *  - tRPC HTML-procedure voor mbt-gym (expo-print mobile)
 *
 * Houd deze functie pure: geen audit-logging, geen access-checks —
 * die horen bij de caller (anders dupliceer je audits over 3 routes).
 */
export async function getPatientProgressData(
  prisma: PrismaClient,
  patientId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<ProgressDataResult> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const sessions = await prisma.sessionLog.findMany({
    where: { patientId, status: 'COMPLETED', completedAt: { gte: since } },
    orderBy: { completedAt: 'asc' },
    select: {
      id: true,
      completedAt: true,
      duration: true,
      painLevel: true,
      exertionLevel: true,
      notes: true,
    },
  })

  const exerciseLogs = await prisma.exerciseLog.findMany({
    where: {
      session: { patientId, status: 'COMPLETED' },
      weight: { not: null },
    },
    orderBy: { session: { completedAt: 'asc' } },
    select: {
      exerciseId: true,
      weight: true,
      estimatedOneRepMax: true,
      setsCompleted: true,
      repsCompleted: true,
      session: { select: { completedAt: true } },
    },
    take: 500,
  })

  const exerciseIds = [...new Set(exerciseLogs.map((l) => l.exerciseId))]
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: exerciseIds } },
    select: { id: true, name: true },
  })
  const exerciseMap = Object.fromEntries(exercises.map((e) => [e.id, e.name]))

  const oneRmByExercise: Record<string, { date: string; oneRm: number }[]> = {}
  for (const log of exerciseLogs) {
    if (!log.estimatedOneRepMax || !log.session.completedAt) continue
    const name = exerciseMap[log.exerciseId] ?? log.exerciseId
    if (!oneRmByExercise[name]) oneRmByExercise[name] = []
    oneRmByExercise[name].push({
      date: log.session.completedAt.toISOString().slice(0, 10),
      oneRm: Math.round(log.estimatedOneRepMax),
    })
  }

  const painLogs = sessions.filter((s) => s.painLevel !== null)
  const exertionLogs = sessions.filter((s) => s.exertionLevel !== null)

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.completedAt?.toISOString() ?? '',
      durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
      painLevel: s.painLevel ?? null,
      exertionLevel: s.exertionLevel ?? null,
      notes: s.notes ?? null,
    })),
    oneRmByExercise,
    totalSessions: sessions.length,
    avgPain:
      painLogs.length > 0
        ? Math.round(
            (painLogs.reduce((sum, l) => sum + (l.painLevel ?? 0), 0) / painLogs.length) * 10,
          ) / 10
        : null,
    avgExertion:
      exertionLogs.length > 0
        ? Math.round(
            (exertionLogs.reduce((sum, l) => sum + (l.exertionLevel ?? 0), 0) /
              exertionLogs.length) *
              10,
          ) / 10
        : null,
    windowDays,
  }
}
