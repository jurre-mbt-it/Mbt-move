/**
 * deload_needed (MEDIUM urgency)
 * Pijn blijft hoog over een aanhoudende periode — niet per se een flare, maar
 * wel sustained load-intolerance. Trigger: recente N sessies allemaal
 * session.painLevel >= `painAbove` EN er zijn minstens N sessies om naar te
 * kijken.
 *
 * painFlare detecteert een relatieve spike vs baseline; deze rule detecteert
 * blijvend hoge klachten die om een deload vragen, ook als het baseline óók
 * hoog is.
 */
import type { Evaluator } from '../types'

export const deloadNeeded: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as {
    painAbove: number
    recentSessions: number
  }

  const recent = agg.sessions.slice(0, cfg.recentSessions)
  if (recent.length < cfg.recentSessions) return null

  const painValues = recent.map((s) => s.painLevel).filter((v): v is number => v != null)
  if (painValues.length < cfg.recentSessions) return null

  const allHigh = painValues.every((v) => v >= cfg.painAbove)
  if (!allHigh) return null

  const avg = painValues.reduce((a, b) => a + b, 0) / painValues.length

  return {
    title: `${agg.patientName} heeft aanhoudend hoge pijn`,
    suggestion: `Laatste ${cfg.recentSessions} sessies hadden pijn ≥ ${cfg.painAbove}/10 (gem. ${avg.toFixed(1)}). Overweeg een deload-week: ~30% minder volume of 5 herhalingen minder per oefening, zonder lager dan dat te gaan.`,
    triggerData: {
      recentSessionIds: recent.map((s) => s.id),
      painValues,
      avg,
      guidance: { volumePct: -30, repsDeltaMax: 5 },
    },
    urgency: rule.defaultUrgency,
  }
}
