/**
 * low_feel (MEDIUM urgency)
 * De subjectieve "Hoe voelde het?"-score blijft laag over een aanhoudende
 * periode. Trigger: de recente N sessies hebben allemaal `feelScore <= feelBelow`
 * EN er zijn minstens N sessies mét een ingevulde feel-score om naar te kijken.
 *
 * Aanvulling op de pijn-/belasting-regels: een patiënt kan binnen "veilige"
 * pijn- en load-grenzen blijven en tóch consequent slecht herstellen / de
 * sessies als zwaar ervaren. Dat is een signaal om belasting, uitvoering of
 * herstel te herzien voordat het in pijn of uitval omslaat.
 */
import type { Evaluator } from '../types'

export const lowFeel: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as {
    feelBelow: number
    recentSessions: number
  }

  const recent = agg.sessions.slice(0, cfg.recentSessions)
  if (recent.length < cfg.recentSessions) return null

  const feelValues = recent.map((s) => s.feelScore).filter((v): v is number => v != null)
  if (feelValues.length < cfg.recentSessions) return null

  const allLow = feelValues.every((v) => v <= cfg.feelBelow)
  if (!allLow) return null

  const avg = feelValues.reduce((a, b) => a + b, 0) / feelValues.length

  return {
    title: `${agg.patientName} voelt zich aanhoudend slecht na de sessies`,
    suggestion: `Laatste ${cfg.recentSessions} sessies hadden een gevoelsscore ≤ ${cfg.feelBelow}/5 (gem. ${avg.toFixed(1)}). Bekijk samen of de belasting, uitvoering of het herstel aanpassing nodig heeft — ook als pijn en load binnen de grenzen blijven.`,
    triggerData: {
      recentSessionIds: recent.map((s) => s.id),
      feelValues,
      avg,
    },
    urgency: rule.defaultUrgency,
  }
}
