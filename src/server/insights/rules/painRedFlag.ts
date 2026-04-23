/**
 * pain_red_flag (CRITICAL)
 * - NRS >= 8 on a single session, OR
 * - NRS >= 6 on 2 consecutive most-recent sessions
 *
 * Dedup: 1x per 24h per patient (handled in orchestrator).
 */
import type { Evaluator } from '../types'

export const painRedFlag: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as {
    singleSessionThreshold: number
    consecutiveSessionsThreshold: number
    consecutiveSessionsCount: number
  }
  if (agg.sessions.length === 0) return null

  const last = agg.sessions[0]
  if (last.painLevel != null && last.painLevel >= cfg.singleSessionThreshold) {
    return {
      title: `Kritieke pijnscore bij ${agg.patientName}`,
      suggestion: `NRS ${last.painLevel}/10 gemeten in de laatste sessie${last.completedAt ? ` op ${last.completedAt.toLocaleDateString('nl-NL')}` : ''}. Neem contact op met de patiënt voordat de volgende sessie plaatsvindt.`,
      triggerData: {
        trigger: 'single_session_threshold',
        sessionId: last.id,
        painLevel: last.painLevel,
        completedAt: last.completedAt?.toISOString() ?? null,
      },
      urgency: rule.defaultUrgency,
    }
  }

  const relevant = agg.sessions.slice(0, cfg.consecutiveSessionsCount)
  if (
    relevant.length === cfg.consecutiveSessionsCount &&
    relevant.every((s) => s.painLevel != null && s.painLevel >= cfg.consecutiveSessionsThreshold)
  ) {
    return {
      title: `Aanhoudend hoge pijn bij ${agg.patientName}`,
      suggestion: `NRS >= ${cfg.consecutiveSessionsThreshold} op ${cfg.consecutiveSessionsCount} opeenvolgende sessies (${relevant.map((s) => s.painLevel).join('/')}). Klinisch patroon vraagt om een korte check-in met de patiënt.`,
      triggerData: {
        trigger: 'consecutive_sessions',
        sessionIds: relevant.map((s) => s.id),
        painLevels: relevant.map((s) => s.painLevel),
      },
      urgency: rule.defaultUrgency,
    }
  }

  return null
}
