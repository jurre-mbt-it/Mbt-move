/**
 * Zone- en plot-berekening voor het Testrapport.
 *
 * Eén bron van waarheid, gedeeld door de tRPC-router (opslaan), de editor-UI
 * (live preview) en de PDF-renderer. Geen framework-imports zodat het overal
 * bruikbaar is.
 *
 * Elke test plot één waarde (`plottedValue`) op een as [axisMin, axisMax] met
 * drie zones rood/oranje/groen. Welke waarde geplot wordt hangt af van `metric`
 * (LSI = symmetrie-index, of de absolute links/rechts/enkel-waarde). De zone
 * volgt uit de drempels `zoneOrangeMin`/`zoneGreenMin` en `higherIsBetter`.
 */

export type TestKind = 'BILATERAL' | 'SINGLE'
export type PlotMetric = 'LSI' | 'RIGHT' | 'LEFT' | 'VALUE'
export type TestZone = 'RED' | 'ORANGE' | 'GREEN'

/** De spec-velden die zone/plot bepalen (catalogus-item óf rapport-entry). */
export type TestSpec = {
  kind: TestKind
  metric: PlotMetric
  plotUnit: string
  axisMin: number
  axisMax: number
  zoneOrangeMin: number
  zoneGreenMin: number
  higherIsBetter: boolean
}

/** De ingevulde meetwaarden van een rapport-entry. */
export type TestValues = {
  leftPrimary?: number | null
  rightPrimary?: number | null
  singleValue?: number | null
  plottedValueOverride?: number | null
  zoneOverride?: TestZone | null
}

/** Limb-Symmetry Index: kleinste / grootste × 100. Null bij ontbrekende data. */
export function computeLsi(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (left == null || right == null) return null
  const max = Math.max(Math.abs(left), Math.abs(right))
  if (max === 0) return null
  return (Math.min(Math.abs(left), Math.abs(right)) / max) * 100
}

/** De waarde die op de balk wordt geplot (override wint). Null = onbekend. */
export function computePlottedValue(spec: TestSpec, v: TestValues): number | null {
  if (v.plottedValueOverride != null) return v.plottedValueOverride
  switch (spec.metric) {
    case 'LSI':
      return computeLsi(v.leftPrimary, v.rightPrimary)
    case 'RIGHT':
      return v.rightPrimary ?? null
    case 'LEFT':
      return v.leftPrimary ?? null
    case 'VALUE':
      return v.singleValue ?? null
  }
}

/** Doelzone van de geplotte waarde (override wint). Null = onbekend. */
export function computeZone(spec: TestSpec, plotted: number | null): TestZone | null
export function computeZone(spec: TestSpec, v: TestValues): TestZone | null
export function computeZone(spec: TestSpec, arg: number | null | TestValues): TestZone | null {
  let plotted: number | null
  let override: TestZone | null | undefined
  if (arg != null && typeof arg === 'object') {
    override = arg.zoneOverride
    plotted = computePlottedValue(spec, arg)
  } else {
    plotted = arg
  }
  if (override) return override
  if (plotted == null) return null
  if (spec.higherIsBetter) {
    if (plotted >= spec.zoneGreenMin) return 'GREEN'
    if (plotted >= spec.zoneOrangeMin) return 'ORANGE'
    return 'RED'
  }
  // lager-is-beter: groen op de lage kant
  if (plotted <= spec.zoneGreenMin) return 'GREEN'
  if (plotted <= spec.zoneOrangeMin) return 'ORANGE'
  return 'RED'
}

/** Positie 0..1 van een waarde op de as (geklemd). */
export function axisFraction(spec: TestSpec, value: number | null): number | null {
  if (value == null) return null
  const range = spec.axisMax - spec.axisMin
  if (range === 0) return 0
  return clamp01((value - spec.axisMin) / range)
}

export type ZoneSegment = { zone: TestZone; from: number; to: number }

/**
 * De gekleurde balksegmenten in as-volgorde (links→rechts), als fracties 0..1.
 * Bij higherIsBetter staat groen rechts; bij lowerIsBetter links.
 */
export function zoneSegments(spec: TestSpec): ZoneSegment[] {
  const of = axisFraction(spec, spec.zoneOrangeMin) ?? 0
  const gf = axisFraction(spec, spec.zoneGreenMin) ?? 1
  const a = clamp01(Math.min(of, gf))
  const b = clamp01(Math.max(of, gf))
  const segs: ZoneSegment[] = spec.higherIsBetter
    ? [
        { zone: 'RED', from: 0, to: a },
        { zone: 'ORANGE', from: a, to: b },
        { zone: 'GREEN', from: b, to: 1 },
      ]
    : [
        { zone: 'GREEN', from: 0, to: a },
        { zone: 'ORANGE', from: a, to: b },
        { zone: 'RED', from: b, to: 1 },
      ]
  return segs.filter((s) => s.to > s.from)
}

/** Het zone-label zoals in het template. */
export const ZONE_LABEL: Record<TestZone, string> = {
  RED: 'ONVOLDOENDE',
  ORANGE: 'IN OPBOUW',
  GREEN: 'BEHAALD',
}

/** Print-kleuren per zone (matcht het template, print-color-adjust exact). */
export const ZONE_COLOR: Record<TestZone, string> = {
  RED: '#cf4429',
  ORANGE: '#e87a55',
  GREEN: '#2f9e5b',
}

/** Nederlands getal: komma-decimaal, integers zonder decimalen. */
export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toLocaleString('nl-NL', { maximumFractionDigits: maxDecimals })
}

/** Geplotte waarde + plot-eenheid, bv "82%", "0,75", "28 cm", "138°". */
export function formatPlotted(spec: TestSpec, plotted: number | null): string {
  if (plotted == null) return '—'
  const num = formatNumber(spec.metric === 'LSI' ? Math.round(plotted) : plotted)
  const unit = spec.plotUnit
  if (!unit) return num
  // Spatie vóór letter-eenheden ("28 cm"), niet vóór symbolen ("82%", "138°").
  return /^[%°]/.test(unit) ? `${num}${unit}` : `${num} ${unit}`
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
