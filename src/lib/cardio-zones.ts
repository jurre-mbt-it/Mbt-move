/**
 * Per-atleet hartslagzone-berekening + tempo-helpers.
 *
 * Bouwt voort op de zone-definities (percentages/labels/kleuren) in
 * `cardio-constants.ts`. Het verschil: dáár zijn zones puur leeftijd-gebaseerd
 * (%HRmax via 220 - leeftijd); híer rekenen we per atleet met een HR-profiel
 * (max-HR / rust-HR) naar concrete bpm-bereiken — Karvonen wanneer rust-HR
 * bekend is, anders %HRmax, anders een leeftijd-fallback.
 */

import {
  HR_ZONES,
  type HRZone,
  type CardioActivityKey,
  calcMaxHR,
} from './cardio-constants'

export interface HrProfile {
  maxHeartRate?: number | null
  restingHeartRate?: number | null
  lthr?: number | null
  /** Voor de leeftijd-fallback wanneer maxHeartRate ontbreekt. */
  dateOfBirth?: Date | string | null
}

export type ZoneMethod = 'KARVONEN' | 'PCT_HRMAX' | 'AGE_FALLBACK'

export interface ComputedZone {
  zone: HRZone
  label: string
  color: string
  bg: string
  minBpm: number
  maxBpm: number
}

/** Leeftijd in hele jaren uit een geboortedatum, of null. */
export function ageFromDob(dob?: Date | string | null): number | null {
  if (!dob) return null
  const d = typeof dob === 'string' ? new Date(dob) : dob
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

/**
 * Bepaal de te gebruiken max-HR + methode. Expliciete `maxHeartRate` wint;
 * anders leiden we af uit leeftijd (220 - leeftijd, consistent met
 * `calcMaxHR`). null als geen van beide beschikbaar is.
 */
export function resolveMaxHr(profile: HrProfile): { maxHr: number; method: ZoneMethod } | null {
  if (profile.maxHeartRate && profile.maxHeartRate > 0) {
    return {
      maxHr: profile.maxHeartRate,
      method: profile.restingHeartRate && profile.restingHeartRate > 0 ? 'KARVONEN' : 'PCT_HRMAX',
    }
  }
  const age = ageFromDob(profile.dateOfBirth)
  if (age != null) return { maxHr: calcMaxHR(age), method: 'AGE_FALLBACK' }
  return null
}

/**
 * Bereken de vijf hartslagzones als bpm-bereiken voor deze atleet.
 * Retourneert null wanneer er onvoldoende profieldata is (geen max-HR én geen
 * geboortedatum) — caller toont dan een prompt om het HR-profiel in te vullen.
 */
export function computeHrZones(profile: HrProfile): { zones: ComputedZone[]; method: ZoneMethod } | null {
  const resolved = resolveMaxHr(profile)
  if (!resolved) return null
  const { maxHr, method } = resolved
  const rest = profile.restingHeartRate ?? 0
  const useKarvonen = method === 'KARVONEN' && rest > 0 && rest < maxHr

  const toBpm = (pct: number): number =>
    useKarvonen ? Math.round(rest + (pct / 100) * (maxHr - rest)) : Math.round((pct / 100) * maxHr)

  const zones = ([1, 2, 3, 4, 5] as HRZone[]).map((z): ComputedZone => {
    const def = HR_ZONES[z]
    return {
      zone: z,
      label: def.label,
      color: def.color,
      bg: def.bg,
      minBpm: toBpm(def.minPct),
      maxBpm: toBpm(def.maxPct),
    }
  })
  return { zones, method }
}

/** Welke zone hoort bij een gemeten hartslag, gegeven het profiel. */
export function bpmToZone(bpm: number, profile: HrProfile): HRZone | null {
  const computed = computeHrZones(profile)
  if (!computed) return null
  for (const z of computed.zones) {
    if (bpm <= z.maxBpm) return z.zone
  }
  return 5
}

// ── Tempo ─────────────────────────────────────────────────────────────────────

/** Gemiddeld tempo in seconden per kilometer, of null bij ontbrekende data. */
export function paceSecPerKm(distanceM?: number | null, durationSec?: number | null): number | null {
  if (!distanceM || distanceM <= 0 || !durationSec || durationSec <= 0) return null
  return Math.round(durationSec / (distanceM / 1000))
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = Math.round(totalSec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Activiteit-bewuste tempo-weergave. Canoniek slaan we altijd s/km op, maar de
 * conventie per sport verschilt:
 *  - hardlopen/wandelen → min/km
 *  - fietsen → km/u
 *  - roeien → split per 500 m
 *  - zwemmen → per 100 m
 */
export function formatPace(
  activity: CardioActivityKey,
  distanceM?: number | null,
  durationSec?: number | null,
): string | null {
  const secPerKm = paceSecPerKm(distanceM, durationSec)
  if (secPerKm == null) return null
  switch (activity) {
    case 'CYCLING':
    case 'WATTBIKE':
    case 'ASSAULT_BIKE': {
      const kmh = 3600 / secPerKm
      return `${kmh.toFixed(1)} km/u`
    }
    case 'ROWING':
    case 'SKIERG':
      return `${mmss(secPerKm / 2)} /500m`
    case 'SWIMMING':
      return `${mmss(secPerKm / 10)} /100m`
    default:
      return `${mmss(secPerKm)} /km`
  }
}

/** Zelfde weergave-logica, maar vanuit een opgeslagen avgPaceSecPerKm. */
export function formatPaceFromSecPerKm(activity: CardioActivityKey, secPerKm?: number | null): string | null {
  if (secPerKm == null || secPerKm <= 0) return null
  // Reconstrueer via een fictieve 1 km zodat we dezelfde branch-logica delen.
  return formatPace(activity, 1000, secPerKm)
}
