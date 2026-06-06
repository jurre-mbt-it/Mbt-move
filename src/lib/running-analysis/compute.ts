/**
 * Zone-/balkberekening voor de Hardloopanalyse.
 *
 * Twee balktypes:
 *  - REAR (achteraanzicht): score 0-100, één-zijdige drempels (rood <70,
 *    oranje 70-85, groen ≥85). Hoger is beter.
 *  - SIDE (zijaanzicht): hoek binnen een ideale range. Groene band = ideaal,
 *    oranje "randzone" = ideaal ± 50% van de bandbreedte, rood erbuiten.
 *
 * Gedeeld door router, editor-preview en PDF.
 */

export type Zone = 'RED' | 'ORANGE' | 'GREEN'
export type ZoneSegment = { zone: Zone; from: number; to: number }

export const ZONE_COLOR: Record<Zone, string> = {
  RED: '#cf4429',
  ORANGE: '#e87a55',
  GREEN: '#2f9e5b',
}

/** Achteraanzicht-totaal/score-label. */
export const REAR_ZONE_LABEL: Record<Zone, string> = {
  RED: 'ONVOLDOENDE',
  ORANGE: 'IN OPBOUW',
  GREEN: 'GOED',
}

/** Zijaanzicht-status-label. */
export const SIDE_STATUS_LABEL: Record<Zone, string> = {
  RED: 'BUITEN RANGE',
  ORANGE: 'RANDZONE',
  GREEN: 'GOED',
}

// ── Achteraanzicht (0-100, drempels 70/85) ───────────────────────────────
export const REAR_AXIS = { min: 0, max: 100, orange: 70, green: 85 } as const

export function rearZone(value: number | null | undefined): Zone | null {
  if (value == null) return null
  if (value >= REAR_AXIS.green) return 'GREEN'
  if (value >= REAR_AXIS.orange) return 'ORANGE'
  return 'RED'
}

export function rearSegments(): ZoneSegment[] {
  const o = REAR_AXIS.orange / REAR_AXIS.max
  const g = REAR_AXIS.green / REAR_AXIS.max
  return [
    { zone: 'RED', from: 0, to: o },
    { zone: 'ORANGE', from: o, to: g },
    { zone: 'GREEN', from: g, to: 1 },
  ]
}

export function rearFraction(value: number | null | undefined): number | null {
  if (value == null) return null
  return clamp01((value - REAR_AXIS.min) / (REAR_AXIS.max - REAR_AXIS.min))
}

// ── Zijaanzicht (ideale range met band) ──────────────────────────────────
export type SideRange = {
  idealMin: number
  idealMax: number
  axisMin: number
  axisMax: number
}

/** Randzone-marge: 50% van de ideale bandbreedte aan weerszijden. */
function sideMargin(r: SideRange): number {
  return 0.5 * (r.idealMax - r.idealMin)
}

export function sideStatus(value: number | null | undefined, r: SideRange): Zone | null {
  if (value == null) return null
  if (value >= r.idealMin && value <= r.idealMax) return 'GREEN'
  const m = sideMargin(r)
  if (value >= r.idealMin - m && value <= r.idealMax + m) return 'ORANGE'
  return 'RED'
}

/** Band-segmenten: rood | oranje | groen | oranje | rood (fracties 0..1). */
export function sideSegments(r: SideRange): ZoneSegment[] {
  const m = sideMargin(r)
  const f = (v: number) => clamp01((v - r.axisMin) / (r.axisMax - r.axisMin))
  const oLo = f(r.idealMin - m)
  const gLo = f(r.idealMin)
  const gHi = f(r.idealMax)
  const oHi = f(r.idealMax + m)
  const segs: ZoneSegment[] = [
    { zone: 'RED', from: 0, to: oLo },
    { zone: 'ORANGE', from: oLo, to: gLo },
    { zone: 'GREEN', from: gLo, to: gHi },
    { zone: 'ORANGE', from: gHi, to: oHi },
    { zone: 'RED', from: oHi, to: 1 },
  ]
  return segs.filter((s) => s.to > s.from)
}

export function sideFraction(value: number | null | undefined, r: SideRange): number | null {
  if (value == null) return null
  return clamp01((value - r.axisMin) / (r.axisMax - r.axisMin))
}

// ── Helpers ───────────────────────────────────────────────────────────────
/** Gemiddelde achteraanzicht-score (afgerond), of null als er niets is. */
export function rearTotal(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number')
  if (nums.length === 0) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/** Nederlands getal: komma-decimaal, integers zonder decimalen. */
export function formatNumber(value: number | null | undefined, maxDecimals = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toLocaleString('nl-NL', { maximumFractionDigits: maxDecimals })
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
