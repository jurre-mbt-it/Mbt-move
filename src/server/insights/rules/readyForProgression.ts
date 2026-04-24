/**
 * ready_for_progression (LOW)
 * - Session NRS < `painBelow` on last N sessions
 * - Per-exercise smiley positive (painLevel <= 2) on last N sessions (majority)
 * - Adherence >= `adherencePct` last 7 days
 */
import type { Evaluator } from '../types'

export const readyForProgression: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as {
    painBelow: number
    feedbackPositiveThreshold: number
    recentSessions: number
    adherencePct: number
  }

  const recent = agg.sessions.slice(0, cfg.recentSessions)
  if (recent.length < cfg.recentSessions) return null

  const allPainLow = recent.every((s) => s.painLevel != null && s.painLevel < cfg.painBelow)
  if (!allPainLow) return null

  // Per-exercise smiley positive = painLevel <= threshold (2 = positive bucket).
  // We require the MAJORITY of exerciseLogs in recent sessions to be positive.
  const exerciseFeedback = recent.flatMap((s) =>
    s.exerciseLogs.map((el) => el.painLevel).filter((v): v is number => v != null),
  )
  if (exerciseFeedback.length === 0) return null
  const positiveCount = exerciseFeedback.filter((v) => v <= cfg.feedbackPositiveThreshold).length
  const positiveRatio = positiveCount / exerciseFeedback.length
  if (positiveRatio < 0.6) return null

  // Adherence: recentCount7d / expected weekly target. We use priorCount7dScaled
  // as "expected" when available; otherwise any recent activity = OK.
  if (agg.adherenceRatio != null && agg.adherenceRatio < cfg.adherencePct / 100) return null
  if (agg.recentCount7d === 0) return null

  return {
    title: `${agg.patientName} lijkt klaar voor progressie`,
    suggestion: `Laatste ${cfg.recentSessions} sessies: alle NRS < ${cfg.painBelow}, ${Math.round(positiveRatio * 100)}% positieve feedback per oefening, adherence ${agg.adherenceRatio != null ? Math.round(agg.adherenceRatio * 100) : '—'}%. Overweeg progressie: ongeveer +10% gewicht of +1–5 herhalingen per oefening. Max 5 reps boven de huidige waarde.`,
    triggerData: {
      recentSessionIds: recent.map((s) => s.id),
      positiveRatio,
      adherenceRatio: agg.adherenceRatio,
      guidance: { weightPct: 10, repsDeltaMax: 5 },
    },
    urgency: rule.defaultUrgency,
  }
}
