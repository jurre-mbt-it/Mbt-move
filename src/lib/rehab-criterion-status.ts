/**
 * Statusberekening voor de koppeling criterium ↔ catalogus-test.
 *
 * Eén meting in een testrapport bepaalt de kleur van een gekoppeld
 * RehabCriterion. Volgorde van gezag:
 *   1. Eigen bilaterale drempels van het criterium (newtonMin* + lsiMin*).
 *   2. Alleen lsiMin*-drempels, op de LSI van links/rechts.
 *   3. De zones van de catalogus-test op de geplotte waarde.
 * Puur en framework-vrij, zodat vitest dit zonder database test.
 */
import {
  computeLsi,
  computePlottedValue,
  computeZone,
  formatNumber,
  formatPlotted,
  type TestSpec,
  type TestValues,
  type TestZone,
} from './test-report/compute'

export type RehabStatusWaarde = 'NOT_MET' | 'IN_PROGRESS' | 'MET'

/** De drempelvelden van een RehabCriterion die de status kunnen bepalen. */
export type CriteriumDrempels = {
  isBilateral: boolean
  newtonMinGreen: number | null
  newtonMinOrange: number | null
  lsiMinGreen: number | null
  lsiMinOrange: number | null
}

const ZONE_NAAR_STATUS: Record<TestZone, RehabStatusWaarde> = {
  GREEN: 'MET',
  ORANGE: 'IN_PROGRESS',
  RED: 'NOT_MET',
}

export function bepaalCriteriumStatus(
  drempels: CriteriumDrempels,
  spec: TestSpec,
  values: TestValues,
): { status: RehabStatusWaarde; samenvatting: string } | null {
  const links = values.leftPrimary ?? null
  const rechts = values.rightPrimary ?? null
  const lsi = computeLsi(links, rechts)

  // Een handmatige zone-override in het rapport is een klinisch oordeel en
  // wint van elke berekening, ook van de criterium-drempels.
  if (values.zoneOverride) {
    return {
      status: ZONE_NAAR_STATUS[values.zoneOverride],
      samenvatting: samenvatting(spec, values, lsi),
    }
  }

  // 1. Bilaterale drempels: beide zijden halen de Newton-grens én de LSI-grens.
  if (drempels.isBilateral && drempels.newtonMinGreen != null && drempels.newtonMinOrange != null) {
    if (links == null || rechts == null || lsi == null) return null
    const lsiGroen = drempels.lsiMinGreen ?? 90
    const lsiOranje = drempels.lsiMinOrange ?? 80
    const minZijde = Math.min(links, rechts)
    let status: RehabStatusWaarde = 'NOT_MET'
    if (minZijde >= drempels.newtonMinGreen && lsi >= lsiGroen) status = 'MET'
    else if (minZijde >= drempels.newtonMinOrange && lsi >= lsiOranje) status = 'IN_PROGRESS'
    return { status, samenvatting: samenvatting(spec, values, lsi) }
  }

  // 2. Alleen LSI-drempels.
  if (drempels.lsiMinGreen != null && drempels.lsiMinOrange != null) {
    if (lsi == null) return null
    let status: RehabStatusWaarde = 'NOT_MET'
    if (lsi >= drempels.lsiMinGreen) status = 'MET'
    else if (lsi >= drempels.lsiMinOrange) status = 'IN_PROGRESS'
    return { status, samenvatting: samenvatting(spec, values, lsi) }
  }

  // 3. Catalogus-zones op de geplotte waarde.
  const zone = computeZone(spec, values)
  if (zone == null) return null
  return { status: ZONE_NAAR_STATUS[zone], samenvatting: samenvatting(spec, values, lsi) }
}

/** Leesbare meetwaarde voor RehabCriterionStatus.measurementValue. */
function samenvatting(spec: TestSpec, values: TestValues, lsi: number | null): string {
  const links = values.leftPrimary ?? null
  const rechts = values.rightPrimary ?? null
  if (spec.kind === 'BILATERAL' && links != null && rechts != null) {
    const delen = [`L ${formatNumber(links)}`, `R ${formatNumber(rechts)}`]
    if (lsi != null) delen.push(`LSI ${Math.round(lsi)}%`)
    return delen.join(' · ')
  }
  return formatPlotted(spec, computePlottedValue(spec, values))
}
