/**
 * Verloop per test: rapportregels van één patiënt gebundeld tot reeksen, zodat
 * een herhaalde test als lijn over de tijd te zien is.
 *
 * Koppelen gaat via de catalogustest (`catalogItemId`), niet via de naam: een
 * therapeut hernoemt een regel of typt een eigen titel, de catalogustest blijft
 * dezelfde. Regels zonder catalogustest (lege test, Kinvent-import zonder
 * catalogus) bundelen op genormaliseerde naam + soort + eenheid. Die twee
 * werelden gaan nooit in één reeks: een catalogus-Quadriceps in N en een losse
 * "Quadriceps" in kg zijn verschillende metingen.
 *
 * Puur en zonder database, zodat de regels te testen zijn. De router levert de
 * regels (met de echte meetdatum) en de criteria van het lopende traject.
 * Ontwerp: docs/superpowers/specs/2026-09-15-test-verloop-design.md.
 */
import {
  computeLsi,
  computePlottedValue,
  computeZone,
  roundTestValue,
  type PlotMetric,
  type TestKind,
  type TestSpec,
  type TestZone,
} from './compute'

export type VerloopRegel = {
  reportId: string
  /** Meetdatum: bij een Kinvent-import de datum van de meting, anders die van het rapport. */
  datum: Date | string
  definitief: boolean
  catalogItemId: string | null
  name: string
  subtitle: string | null
  category: string
  categoryOrder: number
  source: string | null
  kind: TestKind
  metric: PlotMetric
  unitPrimary: string | null
  plotUnit: string
  axisMin: number
  axisMax: number
  zoneOrangeMin: number
  zoneGreenMin: number
  higherIsBetter: boolean
  leftPrimary: number | null
  rightPrimary: number | null
  singleValue: number | null
  textValue: string | null
  plottedValueOverride: number | null
  zoneOverride: string | null
}

export type VerloopCriterium = {
  id: string
  catalogItemId: string | null
  name: string
  phaseOrder: number
  phaseName: string
  status: 'NOT_MET' | 'IN_PROGRESS' | 'MET'
  isBilateral: boolean
  lsiMinGreen: number | null
  newtonMinGreen: number | null
}

export type VerloopPunt = {
  datum: string
  reportId: string
  definitief: boolean
  links: number | null
  rechts: number | null
  waarde: number | null
  /** Hele procenten. */
  lsi: number | null
  geplot: number | null
  zone: TestZone | null
  tekst: string | null
}

/** zijden = links en rechts in de eenheid van de test; lsi = symmetrie in %; waarde = enkele uitslag. */
export type VerloopMaat = 'zijden' | 'lsi' | 'waarde'

export type TestReeks = {
  key: string
  catalogItemId: string | null
  naam: string
  subtitel: string | null
  categorie: string
  bron: string | null
  soort: TestKind
  metric: PlotMetric
  eenheid: string | null
  plotEenheid: string
  hogerIsBeter: boolean
  /** Oud naar nieuw. */
  punten: VerloopPunt[]
  /** Beste uitslag per kalenderdag, oud naar nieuw; alleen punten met een getal. Voor de grafiek. */
  perDag: VerloopPunt[]
  laatste: VerloopPunt
  maten: VerloopMaat[]
  standaardMaat: VerloopMaat
  /** Criteria uit het lopende traject op deze catalogustest, op fasevolgorde. */
  criteria: VerloopCriterium[]
  standaardCriteriumId: string | null
  /** Groene zonegrens van de catalogustest. Null zonder catalogustest. */
  zoneDoel: { maat: VerloopMaat; waarde: number } | null
}

const ZONES: TestZone[] = ['RED', 'ORANGE', 'GREEN']

function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function reeksSleutel(r: VerloopRegel): string {
  if (r.catalogItemId) return `cat-${r.catalogItemId}`
  return `naam-${slug(r.kind)}-${slug(r.unitPrimary ?? '') || 'geen'}-${slug(r.name)}`
}

function isLeeg(r: VerloopRegel): boolean {
  return (
    r.leftPrimary == null &&
    r.rightPrimary == null &&
    r.singleValue == null &&
    r.plottedValueOverride == null &&
    !r.textValue?.trim()
  )
}

/** Kalenderdag in Nederlandse tijd, zodat een meting om 00:30 niet op de vorige dag valt. */
function dagSleutel(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

function score(p: VerloopPunt): number | null {
  if (p.geplot != null) return p.geplot
  if (p.waarde != null) return p.waarde
  if (p.links != null || p.rechts != null) return Math.max(p.links ?? -Infinity, p.rechts ?? -Infinity)
  return null
}

/**
 * Op één testdag worden vaak meerdere pogingen gedaan (vijf CMJ's achter
 * elkaar). Een lijn met vijf punten op dezelfde dag leest als ruis; de grafiek
 * toont daarom de beste poging van die dag. De lijst eronder houdt alles.
 */
function bestePerDag(punten: VerloopPunt[], hogerIsBeter: boolean): VerloopPunt[] {
  const perDag = new Map<string, VerloopPunt>()
  for (const p of punten) {
    const v = score(p)
    if (v == null) continue
    const dag = dagSleutel(p.datum)
    const huidig = perDag.get(dag)
    const hv = huidig ? score(huidig) : null
    if (!huidig || hv == null || (hogerIsBeter ? v >= hv : v <= hv)) perDag.set(dag, p)
  }
  return [...perDag.values()].sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
}

function maatVanMetric(metric: PlotMetric): VerloopMaat {
  if (metric === 'LSI') return 'lsi'
  if (metric === 'VALUE') return 'waarde'
  return 'zijden'
}

function naarPunt(r: VerloopRegel): VerloopPunt {
  const spec: TestSpec = {
    kind: r.kind,
    metric: r.metric,
    plotUnit: r.plotUnit,
    axisMin: r.axisMin,
    axisMax: r.axisMax,
    zoneOrangeMin: r.zoneOrangeMin,
    zoneGreenMin: r.zoneGreenMin,
    higherIsBetter: r.higherIsBetter,
  }
  const zoneOverride = ZONES.includes(r.zoneOverride as TestZone) ? (r.zoneOverride as TestZone) : null
  const values = {
    leftPrimary: r.leftPrimary,
    rightPrimary: r.rightPrimary,
    singleValue: r.singleValue,
    plottedValueOverride: r.plottedValueOverride,
    zoneOverride,
  }
  const plotted = computePlottedValue(spec, values)
  const lsi = r.kind === 'BILATERAL' ? computeLsi(r.leftPrimary, r.rightPrimary) : null
  return {
    datum: new Date(r.datum).toISOString(),
    reportId: r.reportId,
    definitief: r.definitief,
    links: roundTestValue(r.leftPrimary, r.unitPrimary),
    rechts: roundTestValue(r.rightPrimary, r.unitPrimary),
    waarde: roundTestValue(r.singleValue, r.unitPrimary),
    lsi: lsi == null ? null : Math.round(lsi),
    geplot:
      plotted == null
        ? null
        : r.metric === 'LSI' && r.plottedValueOverride == null
          ? Math.round(plotted)
          : roundTestValue(plotted, r.plotUnit),
    zone: computeZone(spec, values),
    tekst: r.textValue?.trim() || null,
  }
}

export function bouwTestVerloop(
  regels: VerloopRegel[],
  criteria: VerloopCriterium[],
  opties: { alleenDefinitief?: boolean } = {},
): TestReeks[] {
  const groepen = new Map<string, VerloopRegel[]>()
  for (const r of regels) {
    if (opties.alleenDefinitief && !r.definitief) continue
    if (isLeeg(r)) continue
    const key = reeksSleutel(r)
    const lijst = groepen.get(key)
    if (lijst) lijst.push(r)
    else groepen.set(key, [r])
  }

  const reeksen: TestReeks[] = []
  for (const [key, lijst] of groepen) {
    const gesorteerd = [...lijst].sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
    const nieuwste = gesorteerd[gesorteerd.length - 1]
    const punten = gesorteerd.map(naarPunt)
    const maten: VerloopMaat[] =
      nieuwste.kind === 'SINGLE' ? ['waarde'] : nieuwste.metric === 'LSI' ? ['lsi', 'zijden'] : ['zijden']
    const eigenCriteria = nieuwste.catalogItemId
      ? criteria
          .filter((c) => c.catalogItemId === nieuwste.catalogItemId)
          .sort((a, b) => a.phaseOrder - b.phaseOrder)
      : []
    const standaard = eigenCriteria.find((c) => c.status !== 'MET') ?? eigenCriteria[eigenCriteria.length - 1] ?? null
    reeksen.push({
      key,
      catalogItemId: nieuwste.catalogItemId,
      naam: nieuwste.name,
      subtitel: nieuwste.subtitle,
      categorie: nieuwste.category,
      bron: nieuwste.source,
      soort: nieuwste.kind,
      metric: nieuwste.metric,
      eenheid: nieuwste.unitPrimary,
      plotEenheid: nieuwste.plotUnit,
      hogerIsBeter: nieuwste.higherIsBetter,
      punten,
      perDag: bestePerDag(punten, nieuwste.higherIsBetter),
      laatste: punten[punten.length - 1],
      maten,
      standaardMaat: maten[0],
      criteria: eigenCriteria,
      standaardCriteriumId: standaard?.id ?? null,
      zoneDoel: nieuwste.catalogItemId ? { maat: maatVanMetric(nieuwste.metric), waarde: nieuwste.zoneGreenMin } : null,
    })
  }

  return reeksen.sort(
    (a, b) => new Date(b.laatste.datum).getTime() - new Date(a.laatste.datum).getTime() || a.naam.localeCompare(b.naam),
  )
}

/**
 * Hoogte van de doellijn in de grafiek voor een gekozen maat. Het criterium
 * wint (dat is het doel van de fase); zonder bruikbare drempel daar de groene
 * zonegrens van de catalogustest. Null = geen lijn.
 */
export function doelLijn(reeks: TestReeks, maat: VerloopMaat, criterium: VerloopCriterium | null): number | null {
  if (criterium) {
    const v = maat === 'lsi' ? criterium.lsiMinGreen : maat === 'zijden' ? criterium.newtonMinGreen : null
    if (v != null) return v
  }
  return reeks.zoneDoel && reeks.zoneDoel.maat === maat ? reeks.zoneDoel.waarde : null
}
