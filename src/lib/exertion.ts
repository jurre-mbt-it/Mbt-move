/**
 * Dag-belasting uit continue hartslag ("exertion", vergelijkbaar met Athlytic's
 * Exertion of Whoop's Strain).
 *
 * Waarom een histogram en geen tijdreeks: Edwards-TRIMP heeft alleen de
 * VERDELING van de hartslag over de dag nodig, niet de volgorde. Een histogram
 * van minuten per bpm-bin is daarom compact (~40 getallen per dag), en omdat de
 * ruwe bpm bewaard blijft kunnen we de historie herberekenen zodra iemands
 * max-hartslag verandert. Zone-indeling gebeurt hier server-side, waar het
 * HR-profiel al staat; het toestel hoeft dat profiel niet te kennen.
 *
 * BELANGRIJK: dit is een LOSSE dag-readout naast de sRPE-curve, geen invoer
 * ervoor. TRIMP en sRPE zijn verschillende eenheden (zie training-load.ts), en
 * bovendien zit de trainings-hartslag hier óók in: dat zou de belasting van een
 * gelogde training dubbel tellen.
 */

import { computeHrZones, type HrProfile } from './cardio-zones'
import { edwardsTrimp } from './training-load'

/** Bin-breedte van het hartslag-histogram in bpm. */
export const HR_BIN_BPM = 5

/**
 * Lichte band ónder Edwards-zone 1: dagelijkse activiteit (lopen, staan,
 * rondlopen op werk) zit bij fitte mensen ruim onder 50% HRmax en zou anders
 * volledig wegvallen — dan is de dag-readout weer alleen een trainingslog.
 * Vanaf 20% van de hartslagreserve (Karvonen) telt tijd mee met een klein
 * gewicht; gekalibreerd tegen Athlytic op echte dagen (2026-07-23): een
 * kantoordag-tot-de-middag kwam hiermee op ~0,8 op de 0-10-schaal waar
 * Athlytic 0,9 gaf, een volle rustige dag op ~2,3.
 */
export const LIGHT_HRR_FLOOR = 0.2
export const LIGHT_WEIGHT = 0.3

/** { ondergrens-van-de-bin (bpm) → seconden }, bv. { "120": 480 }. */
export type BpmHistogram = Record<string, number>

export type ExertionDay = {
  /** Seconden per hartslagzone, zelfde vorm als CardioLog.timeInZones. */
  timeInZones: Record<string, number>
  /** Edwards-TRIMP over de hele dag (a.u.). */
  trimp: number
  /** Totale tijd op of boven zone 1, in seconden. */
  activeSec: number
}

/**
 * Zet een dag-histogram om in tijd-per-zone + TRIMP.
 *
 * Alles ónder zone 1 (rustig zitten, slapen) telt niet mee: dat is geen
 * belasting. Retourneert null als het profiel geen zones oplevert of als er
 * geen enkele actieve minuut in zit.
 */
export function computeExertionDay(
  hist: BpmHistogram | null | undefined,
  profile: HrProfile,
): ExertionDay | null {
  if (!hist || typeof hist !== 'object') return null
  // Edwards-TRIMP is gedefinieerd op %HRmax-zones (50-60% t/m 90-100%), dus
  // rust-HR bewust NIET meegeven: computeHrZones zou anders Karvonen pakken en
  // de ondergrens naar ~64% HRmax schuiven (max 200 + rust 55 → vloer 128 bpm).
  // Daarmee valt alle dagelijkse activiteit weg en blijven alleen trainingen
  // over — precies wat deze hele-dag-readout juist wél moet vangen.
  const computed = computeHrZones({ ...profile, restingHeartRate: null })
  if (!computed) return null

  const zones = computed.zones
  const zone1Floor = zones[0].minBpm
  const rest = profile.restingHeartRate ?? 0
  const maxHr = zones[zones.length - 1].maxBpm
  /**
   * Ondergrens van de lichte band: 20% HRR als de rust-HR bekend is. De
   * HRR-variant personaliseert — bij een hoge rust-HR schuift de band mee
   * omhoog zodat stilzitten niet meetelt.
   *
   * Twee vangnetten, want deze vloer bepaalt wat er wordt WEGGEGOOID:
   *
   * 1. Klemmen op `zone1Floor`. Zonder dat ligt de HRR-vloer bij een rust-HR
   *    boven ~0,375 × HRmax BOVEN de Edwards-vloer, en dan sloeg de lus ook
   *    echte zone-1-tijd over. Voorbeeld: max 175, rust 78 → zone1Floor 88,
   *    HRR-vloer 97 — alles tussen 88 en 97 (traplopen, wandelen, boodschappen)
   *    verdween. Dat raakt juist de gedeconditioneerde patiënt voor wie deze
   *    readout bedoeld is. De lichte band mag krimpen, zone 1 nooit.
   * 2. Zónder rust-HR geen lichte band. De oude 40%-HRmax-fallback lag bij een
   *    60-jarige op 64 bpm, onder zijn slaap-HR, en het histogram is bewust het
   *    hele etmaal (slaap inbegrepen) — dat leverde honderden AU verzonnen
   *    belasting per dag op en drukte de p90-ijking van de 0-10-schaal plat.
   *    Niets kunnen onderscheiden betekent hier: niets meetellen onder zone 1.
   */
  const lightFloor =
    rest > 0 && rest < maxHr
      ? Math.min(rest + LIGHT_HRR_FLOOR * (maxHr - rest), zone1Floor)
      : zone1Floor

  const timeInZones: Record<string, number> = {}
  let activeSec = 0
  let lightMin = 0

  for (const [binKey, rawSec] of Object.entries(hist)) {
    const bin = Number(binKey)
    const sec = Number(rawSec)
    if (!Number.isFinite(bin) || !Number.isFinite(sec) || sec <= 0) continue

    // Midden van de bin als representatieve hartslag.
    const bpm = bin + HR_BIN_BPM / 2
    if (bpm < lightFloor) continue

    if (bpm < zone1Floor) {
      // Lichte band: onder sleutel '0' in timeInZones (edwardsTrimp negeert
      // die), gewogen bijdrage rekenen we hieronder zelf bij.
      timeInZones['0'] = (timeInZones['0'] ?? 0) + sec
      activeSec += sec
      lightMin += sec / 60
      continue
    }

    let zone = 5
    for (const z of zones) {
      if (bpm <= z.maxBpm) {
        zone = z.zone
        break
      }
    }
    const key = String(zone)
    timeInZones[key] = (timeInZones[key] ?? 0) + sec
    activeSec += sec
  }

  if (activeSec <= 0) return null
  const trimp = Math.round((edwardsTrimp(timeInZones) ?? 0) + LIGHT_WEIGHT * lightMin)

  return { timeInZones, trimp, activeSec: Math.round(activeSec) }
}

/**
 * Persoonlijke schaal 0-100 voor de weergave: de dag afgezet tegen de eigen
 * p90-dag van het venster. Zonder referentie (nieuwe gebruiker) geven we null
 * terug in plaats van een verzonnen schaal.
 *
 * De p90 is het ANKERPUNT van de schaal, niet de bovenkant ervan. Dat verschil
 * is de hele reden dat hier een curve staat en geen deling:
 *
 *   score = 100 × (1 − e^(−trimp / p90))
 *
 * Eerst deelden we recht door de p90 en klemden we op 100. Per definitie zit
 * dan een tiende van je dagen op precies 10,0: je p90 ís je gewone zware dag.
 * Een normale duurloop las daardoor hetzelfde als een dag die twee keer zo
 * zwaar was, en omdat het doelbereik in wearables.ts op een ABSOLUTE schaal
 * geijkt is (max 8,0 bij een perfect herstel) sloeg de kop na élke training om
 * naar "eerst herstellen". Op een echt profiel van 60 dagen gebeurde dat 16
 * van de 46 keer — een waarschuwing die altijd afgaat, waarschuwt niet meer.
 *
 * De curve verzadigt in plaats van af te kappen. Bij kleine ratio's valt hij
 * samen met de oude lineaire schaal, dus de Athlytic-ijking van 2026-07-23
 * (kantoordag ~0,8, rustige dag ~2,3) blijft staan. Daarboven blijft er ruimte:
 * de p90-dag leest 6,3, tweemaal je p90 leest 8,6, en 10,0 vraagt ruim vijf
 * keer je p90 — precies de bedoeling, want 10 hoort "buiten alles wat je tot nu
 * toe gedaan hebt" te betekenen.
 *
 * `recentTrimps` = TRIMP-waarden van de voorgaande dagen (zonder vandaag).
 */
export function exertionScore(trimp: number, recentTrimps: number[]): number | null {
  const valid = recentTrimps.filter((t) => Number.isFinite(t) && t > 0)
  if (valid.length < 7) return null
  // p90 i.p.v. het maximum: één uitschieter mag het anker niet permanent
  // omhoog trekken.
  const sorted = [...valid].sort((a, b) => a - b)
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
  if (!p90 || p90 <= 0) return null
  if (!Number.isFinite(trimp) || trimp <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-trimp / p90)))))
}
