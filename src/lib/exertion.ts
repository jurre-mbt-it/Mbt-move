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
  const restFloor = zones[0].minBpm

  const timeInZones: Record<string, number> = {}
  let activeSec = 0

  for (const [binKey, rawSec] of Object.entries(hist)) {
    const bin = Number(binKey)
    const sec = Number(rawSec)
    if (!Number.isFinite(bin) || !Number.isFinite(sec) || sec <= 0) continue

    // Midden van de bin als representatieve hartslag.
    const bpm = bin + HR_BIN_BPM / 2
    if (bpm < restFloor) continue

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
  const trimp = edwardsTrimp(timeInZones)
  if (trimp == null) return null

  return { timeInZones, trimp, activeSec: Math.round(activeSec) }
}

/**
 * Persoonlijke schaal 0-100 voor de weergave: de dag afgezet tegen het
 * eigen zwaarste recente etmaal. Zonder referentie (nieuwe gebruiker) geven we
 * null terug in plaats van een verzonnen schaal.
 *
 * `recentTrimps` = TRIMP-waarden van de voorgaande dagen (zonder vandaag).
 */
export function exertionScore(trimp: number, recentTrimps: number[]): number | null {
  const valid = recentTrimps.filter((t) => Number.isFinite(t) && t > 0)
  if (valid.length < 7) return null
  // p90 i.p.v. het maximum: één uitschieter mag de schaal niet permanent
  // platdrukken.
  const sorted = [...valid].sort((a, b) => a - b)
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
  if (!p90 || p90 <= 0) return null
  return Math.max(0, Math.min(100, Math.round((trimp / p90) * 100)))
}
