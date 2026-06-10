/**
 * overload_risk (MEDIUM urgency)
 * Overreaching-signaal uit het fitness-fatigue model (zie
 * src/lib/training-load.ts): vorm = fitheid − vermoeidheid. Trigger wanneer
 * de vorm minstens `minDays` opeenvolgende dagen onder `formBelow` zit
 * (TrainingPeaks/Friel-conventie: < −30 = overreaching-zone), ÓF wanneer de
 * EWMA-ACWR boven `acwrAbove` uitkomt (Gabbett — bewust als secundaire,
 * indicatieve drempel; de predictieve waarde is omstreden).
 *
 * deloadNeeded kijkt naar aanhoudende pijn; deze regel naar pure belasting —
 * ook zonder pijnklachten kan de opbouw te steil zijn.
 */
import type { Evaluator } from '../types'

export const overloadRisk: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as {
    formBelow: number   // bv. -30
    minDays: number     // bv. 5 opeenvolgende dagen
    acwrAbove: number   // bv. 1.5
  }

  const hist = agg.loadFormHistory
  if (!hist || hist.length === 0) return null

  // Opeenvolgende dagen (t/m vandaag) met vorm onder de grens.
  let consecutive = 0
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i] < cfg.formBelow) consecutive++
    else break
  }

  const acwrHigh = agg.loadAcwr !== null && agg.loadAcwr > cfg.acwrAbove
  const formLow = consecutive >= cfg.minDays
  if (!formLow && !acwrHigh) return null

  const todayForm = hist[hist.length - 1]
  const reasons: string[] = []
  if (formLow) {
    reasons.push(`vorm zit ${consecutive} dagen op rij onder ${cfg.formBelow} (nu ${Math.round(todayForm)})`)
  }
  if (acwrHigh) {
    reasons.push(`ACWR is ${agg.loadAcwr!.toFixed(2)} (> ${cfg.acwrAbove})`)
  }

  return {
    title: `${agg.patientName} bouwt mogelijk te snel op`,
    suggestion:
      `De trainingsbelasting (kracht + cardio) stijgt sneller dan het lichaam gewend is: ${reasons.join(' en ')}. ` +
      `Overweeg de komende dagen een rustdag of lichtere sessie en bouw daarna geleidelijker op. ` +
      `Zie de Belasting-tab op de voortgangspagina voor de curve.`,
    triggerData: {
      formHistory: hist,
      consecutiveDaysBelow: consecutive,
      formThreshold: cfg.formBelow,
      acwr: agg.loadAcwr,
      acwrThreshold: cfg.acwrAbove,
    },
    urgency: rule.defaultUrgency,
  }
}
