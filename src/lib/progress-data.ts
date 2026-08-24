import type { PrismaClient } from '@prisma/client'

const DEFAULT_WINDOW_DAYS = 90

export type ProgressDataResult = {
  sessions: Array<{
    id: string
    date: string
    durationMinutes: number
    painLevel: number | null
    exertionLevel: number | null
    feelScore: number | null
    notes: string | null
  }>
  oneRmByExercise: Record<string, { date: string; oneRm: number; weight: number; reps: number | null }[]>
  totalSessions: number
  avgPain: number | null
  avgExertion: number | null
  avgFeel: number | null
  cardio: {
    sessions: Array<{
      id: string
      date: string
      activity: string
      /** Ruw bron-type (padel, hike) — benoemt de sport waar de enum OTHER zegt. */
      sourceActivity: string | null
      protocol: string
      durationMinutes: number
      distanceKm: number | null
      avgPaceSecPerKm: number | null
      avgHeartRate: number | null
      zone: number | null
      rpe: number | null
      painLevel: number | null
    }>
    totalSessions: number
    totalMinutes: number
    totalDistanceKm: number
    avgRpe: number | null
    /** Seconden per HR-zone (1-5) opgeteld over het venster. */
    timeInZonesSec: Record<string, number>
  }
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
      feelScore: true,
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

  const oneRmByExercise: Record<string, { date: string; oneRm: number; weight: number; reps: number | null }[]> = {}
  for (const log of exerciseLogs) {
    if (!log.estimatedOneRepMax || !log.session.completedAt) continue
    const name = exerciseMap[log.exerciseId] ?? log.exerciseId
    if (!oneRmByExercise[name]) oneRmByExercise[name] = []
    oneRmByExercise[name].push({
      date: log.session.completedAt.toISOString().slice(0, 10),
      oneRm: Math.round(log.estimatedOneRepMax),
      weight: Math.round(log.weight ?? 0),
      reps: log.repsCompleted ?? null,
    })
  }

  const painLogs = sessions.filter((s) => s.painLevel !== null)
  const exertionLogs = sessions.filter((s) => s.exertionLevel !== null)
  const feelLogs = sessions.filter((s) => s.feelScore !== null)

  // ── Cardio ────────────────────────────────────────────────────────────────
  const cardioLogs = await prisma.cardioLog.findMany({
    where: { patientId, completedAt: { gte: since } },
    orderBy: { completedAt: 'asc' },
    select: {
      id: true,
      completedAt: true,
      activity: true,
      sourceActivity: true,
      protocol: true,
      durationSec: true,
      distanceM: true,
      avgPaceSecPerKm: true,
      avgHeartRate: true,
      zone: true,
      rpe: true,
      painLevel: true,
      timeInZones: true,
    },
    take: 500,
  })

  const cardioRpeLogs = cardioLogs.filter((c) => c.rpe !== null)
  const timeInZonesSec: Record<string, number> = {}
  for (const c of cardioLogs) {
    const tiz = c.timeInZones as Record<string, number> | null
    if (tiz && typeof tiz === 'object') {
      for (const [zone, sec] of Object.entries(tiz)) {
        if (typeof sec === 'number') timeInZonesSec[zone] = (timeInZonesSec[zone] ?? 0) + sec
      }
    }
  }

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.completedAt?.toISOString() ?? '',
      durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
      painLevel: s.painLevel ?? null,
      exertionLevel: s.exertionLevel ?? null,
      feelScore: s.feelScore ?? null,
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
    avgFeel:
      feelLogs.length > 0
        ? Math.round(
            (feelLogs.reduce((sum, l) => sum + (l.feelScore ?? 0), 0) / feelLogs.length) * 10,
          ) / 10
        : null,
    cardio: {
      sessions: cardioLogs.map((c) => ({
        id: c.id,
        date: c.completedAt.toISOString(),
        activity: c.activity,
        sourceActivity: c.sourceActivity,
        protocol: c.protocol,
        durationMinutes: Math.round(c.durationSec / 60),
        distanceKm: c.distanceM != null ? Math.round(c.distanceM / 10) / 100 : null,
        avgPaceSecPerKm: c.avgPaceSecPerKm,
        avgHeartRate: c.avgHeartRate,
        zone: c.zone,
        rpe: c.rpe,
        painLevel: c.painLevel,
      })),
      totalSessions: cardioLogs.length,
      totalMinutes: Math.round(cardioLogs.reduce((sum, c) => sum + c.durationSec, 0) / 60),
      totalDistanceKm:
        Math.round(cardioLogs.reduce((sum, c) => sum + (c.distanceM ?? 0), 0) / 10) / 100,
      avgRpe:
        cardioRpeLogs.length > 0
          ? Math.round(
              (cardioRpeLogs.reduce((sum, c) => sum + (c.rpe ?? 0), 0) / cardioRpeLogs.length) * 10,
            ) / 10
          : null,
      timeInZonesSec,
    },
    windowDays,
  }
}
