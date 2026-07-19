/**
 * overload_risk (MEDIUM urgency)
 * Overreaching-signaal uit het fitness-fatigue model (zie
 * src/lib/training-load.ts): vorm = fitheid − vermoeidheid. Trigger wanneer
 * de vorm minstens `minDays` opeenvolgende dagen onder `formBelow` zit
 * (TrainingPeaks/Friel-conventie: < −30 = overreaching-zone).
 *
 * De ACWR triggert hier bewust NIET (meer): als ratio-maat is die
 * methodologisch onderuit gehaald (Impellizzeri 2020) en gaf loze
 * overreaching-meldingen. We sturen op de vorm-as; de ACWR blijft alleen als
 * context in triggerData staan. Het `acwrAbove`-config-veld wordt genegeerd.
 *
 * deloadNeeded kijkt naar aanhoudende pijn; deze regel naar pure belasting —
 * ook zonder pijnklachten kan de opbouw te steil zijn.
 */
import type { Evaluator } from '../types'

export const overloadRisk: Evaluator = (agg, rule) => {
  const cfg = rule.defaultConfig as {
    formBelow: number   // bv. -30
    minDays: number     // bv. 5 opeenvolgende dagen
    feelLow?: number    // bv. 2.5 — versterkt het signaal als het gevoel ook laag is
  }
  const feelLow = cfg.feelLow ?? 2.5

  // IJkperiode: het model kent het startniveau nog niet, dus een diepe vorm
  // is dan een opstart-artefact en geen overreaching. Geen melding (en dus
  // ook geen load-push via daily-reminders) tot de ijk klaar is.
  if (!agg.loadCalibrationReady) return null

  const hist = agg.loadFormHistory
  if (!hist || hist.length === 0) return null

  // Opeenvolgende dagen (t/m vandaag) met vorm onder de grens.
  let consecutive = 0
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i] < cfg.formBelow) consecutive++
    else break
  }

  const formLow = consecutive >= cfg.minDays
  if (!formLow) return null

  const todayForm = hist[hist.length - 1]
  const reasons: string[] = []
  reasons.push(`vorm zit ${consecutive} dagen op rij onder ${cfg.formBelow} (nu ${Math.round(todayForm)})`)

  // Feel-versterking: een lage subjectieve gevoelsscore bovenop de hoge load
  // maakt het overreaching-beeld sterker (slecht verdragen, niet alleen veel).
  // Geen zelfstandige trigger — alleen versterkend wanneer de load-drempel al
  // is gehaald. Tilt de urgentie dan naar HIGH.
  const feelReinforces = agg.recentAvgFeel !== null && agg.recentAvgFeel <= feelLow
  if (feelReinforces) {
    reasons.push(`de sessies voelen zwaar (gem. gevoel ${agg.recentAvgFeel!.toFixed(1)}/5)`)
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
      acwr: agg.loadAcwr, // context, geen trigger
      recentAvgFeel: agg.recentAvgFeel,
      feelReinforces,
    },
    urgency: feelReinforces ? 'HIGH' : rule.defaultUrgency,
  }
}
