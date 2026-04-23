/**
 * Build per-patient aggregates used by all rule-evaluators.
 * Pure function of Prisma client + patientId — no side effects.
 */
import type { PrismaClient } from '@prisma/client'
import type { PatientAggregates } from './types'

const SESSIONS_WINDOW_DAYS = 60
const RECENT_SESSIONS_COUNT = 3
const BASELINE_WINDOW_DAYS = 14

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export async function buildPatientAggregates(
  prisma: PrismaClient,
  patientId: string,
): Promise<PatientAggregates | null> {
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: { id: true, name: true, email: true },
  })
  if (!patient) return null

  const now = new Date()
  const windowStart = new Date(now.getTime() - SESSIONS_WINDOW_DAYS * 24 * 3600 * 1000)

  const sessions = await prisma.sessionLog.findMany({
    where: {
      patientId,
      status: 'COMPLETED',
      completedAt: { gte: windowStart },
    },
    orderBy: { completedAt: 'desc' },
    include: {
      exerciseLogs: {
        select: {
          exerciseId: true,
          painLevel: true,
          painDuring: true,
          weight: true,
          setsCompleted: true,
        },
      },
    },
  })

  const mappedSessions = sessions.map((s) => ({
    id: s.id,
    completedAt: s.completedAt,
    painLevel: s.painLevel,
    exertionLevel: s.exertionLevel,
    exerciseLogs: s.exerciseLogs,
  }))

  // Recent vs baseline split
  const recent = mappedSessions.slice(0, RECENT_SESSIONS_COUNT)
  const baselineCutoff = new Date(now.getTime() - BASELINE_WINDOW_DAYS * 24 * 3600 * 1000)
  const baseline = mappedSessions.filter(
    (s) => s.completedAt != null && s.completedAt < baselineCutoff,
  )

  const recentNRSVals = recent.map((s) => s.painLevel).filter((v): v is number => v != null)
  const baselineNRSVals = baseline.map((s) => s.painLevel).filter((v): v is number => v != null)

  // Adherence
  const recent7dCutoff = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const prior14dStart = new Date(now.getTime() - 21 * 24 * 3600 * 1000)
  const recentCount7d = mappedSessions.filter(
    (s) => s.completedAt != null && s.completedAt >= recent7dCutoff,
  ).length
  const priorCount14d = mappedSessions.filter(
    (s) =>
      s.completedAt != null &&
      s.completedAt >= prior14dStart &&
      s.completedAt < recent7dCutoff,
  ).length
  const priorCount7dScaled = priorCount14d / 2
  const adherenceRatio = priorCount7dScaled > 0 ? recentCount7d / priorCount7dScaled : null

  // Days since last session
  const lastSession = mappedSessions[0]
  const daysSinceLastSession = lastSession?.completedAt
    ? Math.floor((now.getTime() - lastSession.completedAt.getTime()) / (24 * 3600 * 1000))
    : null

  // Days since change (pain/exertion/weight)
  let daysSinceChange: number | null = null
  if (mappedSessions.length >= 2) {
    // Walk back until we find any delta > 1 in painLevel, exertionLevel, or avg weight
    for (let i = 0; i < mappedSessions.length - 1; i++) {
      const a = mappedSessions[i]
      const b = mappedSessions[i + 1]
      const painDelta =
        a.painLevel != null && b.painLevel != null ? Math.abs(a.painLevel - b.painLevel) : 0
      const exDelta =
        a.exertionLevel != null && b.exertionLevel != null
          ? Math.abs(a.exertionLevel - b.exertionLevel)
          : 0
      const avgWeightA = mean(
        a.exerciseLogs.map((el) => el.weight).filter((v): v is number => v != null),
      )
      const avgWeightB = mean(
        b.exerciseLogs.map((el) => el.weight).filter((v): v is number => v != null),
      )
      const weightDelta =
        avgWeightA != null && avgWeightB != null ? Math.abs(avgWeightA - avgWeightB) : 0
      if (painDelta > 1 || exDelta > 1 || weightDelta > 0.5) {
        daysSinceChange = a.completedAt
          ? Math.floor((now.getTime() - a.completedAt.getTime()) / (24 * 3600 * 1000))
          : null
        break
      }
    }
    if (daysSinceChange == null && lastSession?.completedAt) {
      // No change found = plateau for the entire window
      daysSinceChange = Math.floor(
        (now.getTime() - lastSession.completedAt.getTime()) / (24 * 3600 * 1000),
      )
    }
  }

  // Per-exercise aggregates
  const byExercise = new Map<string, { executions: number; painLevels: number[] }>()
  const allExercisePainLevels: number[] = []
  for (const s of mappedSessions) {
    for (const el of s.exerciseLogs) {
      if (!byExercise.has(el.exerciseId)) {
        byExercise.set(el.exerciseId, { executions: 0, painLevels: [] })
      }
      const agg = byExercise.get(el.exerciseId)!
      agg.executions += 1
      if (el.painLevel != null) {
        agg.painLevels.push(el.painLevel)
        allExercisePainLevels.push(el.painLevel)
      }
    }
  }
  const exerciseAggregates = Array.from(byExercise.entries()).map(([exerciseId, agg]) => ({
    exerciseId,
    executions: agg.executions,
    avgPainLevel: mean(agg.painLevels),
  }))

  return {
    patientId,
    patientName: patient.name ?? patient.email,
    now,
    sessions: mappedSessions,
    baselineMedianNRS: median(baselineNRSVals),
    recentAvgNRS: mean(recentNRSVals),
    recentCount7d,
    priorCount7dScaled,
    adherenceRatio,
    daysSinceLastSession,
    daysSinceChange,
    exerciseAggregates,
    overallAvgExercisePain: mean(allExercisePainLevels),
  }
}
