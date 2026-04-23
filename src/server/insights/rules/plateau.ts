/**
 * plateau (LOW)
 * No measurable change in pain/exertion/load for >= `daysWithoutChange` days.
 *
 * Uses aggregates.daysSinceChange which is computed from walking back through
 * session deltas in pain/exertion/avg weight.
 */
import type { Evaluator } from '../types'

export const plateau: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as { daysWithoutChange: number }
  if (agg.daysSinceChange == null) return null
  if (agg.daysSinceChange < cfg.daysWithoutChange) return null
  // Ignore if too few sessions — need at least 3 to trust the detection
  if (agg.sessions.length < 3) return null

  return {
    title: `Mogelijk plateau bij ${agg.patientName}`,
    suggestion: `Geen meetbare verandering in pijn, inspanning of belasting in de afgelopen ${agg.daysSinceChange} dagen. Tijd om een variatie of progressie te bespreken.`,
    triggerData: {
      daysSinceChange: agg.daysSinceChange,
      sessionCount: agg.sessions.length,
    },
    urgency: rule.defaultUrgency,
  }
}
