/**
 * adherence_drop (MEDIUM)
 * - recent 7d session count < `dropRatio` * prior 14d avg, OR
 * - no completed sessions in `silentDays` or more.
 */
import type { Evaluator } from '../types'

export const adherenceDrop: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as { dropRatio: number; silentDays: number }

  if (agg.daysSinceLastSession != null && agg.daysSinceLastSession >= cfg.silentDays) {
    return {
      title: `Geen sessies van ${agg.patientName}`,
      suggestion: `Laatste gelogde sessie was ${agg.daysSinceLastSession} dagen geleden. Check even of er iets speelt — bel of stuur een bericht.`,
      triggerData: {
        trigger: 'silent_days',
        daysSinceLastSession: agg.daysSinceLastSession,
      },
      urgency: rule.defaultUrgency,
    }
  }

  if (agg.adherenceRatio != null && agg.adherenceRatio < cfg.dropRatio) {
    return {
      title: `Adherence-dip bij ${agg.patientName}`,
      suggestion: `Sessies afgelopen 7 dagen (${agg.recentCount7d}) ligt op ${Math.round(agg.adherenceRatio * 100)}% van de voorgaande 14-daagse norm. Kort moment om te polsen of het programma nog past.`,
      triggerData: {
        trigger: 'ratio_drop',
        recentCount7d: agg.recentCount7d,
        priorCount7dScaled: agg.priorCount7dScaled,
        adherenceRatio: agg.adherenceRatio,
      },
      urgency: rule.defaultUrgency,
    }
  }

  return null
}
