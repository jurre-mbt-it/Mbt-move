/**
 * pain_flare (HIGH urgency)
 * Avg NRS of recent 3 sessions is >= `deltaAbove` points above the 14-day baseline median.
 *
 * Evidence: Silbernagel pain-monitoring model — 2-point delta is the minimal
 * clinically-meaningful threshold for tendinopathy symptom worsening.
 */
import type { Evaluator } from '../types'

export const painFlare: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as { deltaAbove: number; recentSessions: number }
  if (agg.recentAvgNRS == null || agg.baselineMedianNRS == null) return null
  const delta = agg.recentAvgNRS - agg.baselineMedianNRS
  if (delta < cfg.deltaAbove) return null

  return {
    title: `Pijn-opflakkering bij ${agg.patientName}`,
    suggestion: `Gemiddelde NRS van de laatste ${cfg.recentSessions} sessies (${agg.recentAvgNRS.toFixed(1)}) ligt ${delta.toFixed(1)} punten boven het 14-daagse baseline-mediaan (${agg.baselineMedianNRS.toFixed(1)}). Overweeg de belasting te verlagen of progressie te pauzeren.`,
    triggerData: {
      recentAvgNRS: agg.recentAvgNRS,
      baselineMedianNRS: agg.baselineMedianNRS,
      delta,
      recentSessionIds: agg.sessions.slice(0, cfg.recentSessions).map((s) => s.id),
    },
    urgency: rule.defaultUrgency,
  }
}
