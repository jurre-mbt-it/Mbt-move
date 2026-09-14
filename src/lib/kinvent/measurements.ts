/**
 * Rekenlaag onder de metingenpagina: links-rechtsverschil als percentage met
 * richting, en de reeksen voor de grafiek over de tijd.
 *
 * Puur en zonder database. De typen spiegelen wat de router teruggeeft
 * (Prisma-rijen met reps), zodat dit ook in de app te hergebruiken is.
 */
import { kinventLabel } from './labels'

export type JumpRepRij = {
  ordinal: number
  side: string | null
  jumpHeightCm: number | null
  flightTimeMs: number | null
  contactTimeMs: number | null
  peakForceN: number | null
  peakForceLeftN: number | null
  peakForceRightN: number | null
  netMaxForceN: number | null
  maxPowerW: number | null
  rsi: number | null
  timeToStabilizeMs: number | null
  propulsiveImpulsePhase1: number | null
  propulsiveImpulsePhase2: number | null
  rfdTotal: number | null
  rfdLeft: number | null
  rfdRight: number | null
}

export type JumpMeting = {
  id: string
  performedAt: Date | string
  jumpType: string | null
  variant: string
  peakJumpHeightCm: number | null
  rsi: number | null
  bodyWeightKg: number | null
  reps: JumpRepRij[]
}

export type KrachtRepRij = {
  ordinal: number
  side: string | null
  maxKg: number | null
  averageKg: number | null
  rfdToMax: number | null
  rfdAverage: number | null
  timeToMaxMs: number | null
  impulseNs: number | null
}

export type KrachtMeting = {
  id: string
  performedAt: Date | string
  title: string | null
  exerciseType: string | null
  deviceType: string | null
  leftMaxKg: number | null
  rightMaxKg: number | null
  singleMaxKg: number | null
  reps: KrachtRepRij[]
}

export type MetingKeuze =
  | { soort: 'sprong'; jumpType: string; eenbenig: boolean }
  | { soort: 'kracht'; title: string }

export type Maat = 'hoogte' | 'piek' | 'verschil' | 'rsi'

export type Reeks = { key: string; label: string; points: Array<{ t: number; v: number }> }

/**
 * Verschil rechts ten opzichte van links, als percentage van de hoogste van
 * de twee. Positief = rechts hoger, negatief = rechts lager.
 */
export function asymmetryPct(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null
  const hoogste = Math.max(Math.abs(left), Math.abs(right))
  if (hoogste === 0) return null
  return ((right - left) / hoogste) * 100
}

export function formatAsymmetry(pct: number | null): string {
  if (pct === null) return '–'
  const abs = Math.round(Math.abs(pct))
  if (abs === 0) return 'gelijk'
  return pct < 0 ? `rechts ${abs}% lager` : `links ${abs}% lager`
}

const JUMP_LABEL: Record<string, string> = { CMJ: 'CMJ', SJ: 'Squat jump', DROP: 'Drop jump', MULTIPLE_JUMPS: 'Herhaalde sprongen' }
const JUMP_VOLGORDE = ['CMJ', 'SJ', 'DROP', 'MULTIPLE_JUMPS']

function tijd(d: Date | string): number {
  return new Date(d).getTime()
}

/** Eenbenig = de sprongen van deze meting zijn per been gedaan. */
export function isEenbenig(m: JumpMeting): boolean {
  return m.reps.some((r) => r.side === 'LEFT' || r.side === 'RIGHT')
}

/** De sprong met de grootste hoogte; de eerste als er geen hoogte is. */
export function besteSprong(reps: JumpRepRij[]): JumpRepRij | null {
  if (reps.length === 0) return null
  return reps.reduce((top, r) => ((r.jumpHeightCm ?? -1) > (top.jumpHeightCm ?? -1) ? r : top), reps[0])
}

export function metingLabel(keuze: MetingKeuze): string {
  if (keuze.soort === 'kracht') return kinventLabel(keuze.title)
  const naam = JUMP_LABEL[keuze.jumpType] ?? keuze.jumpType
  return keuze.jumpType === 'MULTIPLE_JUMPS' ? naam : `${naam} ${keuze.eenbenig ? 'eenbenig' : 'tweebenig'}`
}

export function metingSleutel(keuze: MetingKeuze): string {
  return keuze.soort === 'kracht' ? `kracht:${keuze.title}` : `sprong:${keuze.jumpType}:${keuze.eenbenig ? '1' : '2'}`
}

/** Welke metingen er zijn om uit te kiezen, sprongen eerst, dan kracht op titel. */
export function metingOpties(jumps: JumpMeting[], kracht: KrachtMeting[]): Array<{ key: string; label: string; keuze: MetingKeuze }> {
  const sprongen = new Map<string, MetingKeuze>()
  for (const m of jumps) {
    if (!m.jumpType) continue
    const keuze: MetingKeuze = { soort: 'sprong', jumpType: m.jumpType, eenbenig: isEenbenig(m) }
    sprongen.set(metingSleutel(keuze), keuze)
  }
  const sprongKeuzes = [...sprongen.values()].sort((a, b) => {
    if (a.soort !== 'sprong' || b.soort !== 'sprong') return 0
    const va = JUMP_VOLGORDE.indexOf(a.jumpType)
    const vb = JUMP_VOLGORDE.indexOf(b.jumpType)
    if (va !== vb) return (va === -1 ? 99 : va) - (vb === -1 ? 99 : vb)
    return Number(a.eenbenig) - Number(b.eenbenig)
  })
  const titels = [...new Set(kracht.map((k) => k.title ?? ''))]
  const krachtKeuzes: MetingKeuze[] = titels.map((title) => ({ soort: 'kracht', title }))
  return [...sprongKeuzes, ...krachtKeuzes].map((keuze) => ({ key: metingSleutel(keuze), label: metingLabel(keuze), keuze }))
}

function punten(items: Array<{ t: number; v: number | null }>): Array<{ t: number; v: number }> {
  return items.flatMap((p) => (p.v === null ? [] : [{ t: p.t, v: p.v }])).sort((a, b) => a.t - b.t)
}

/** De reeksen voor de grafiek: één per zijde waar dat van toepassing is. */
export function trendSeries(keuze: MetingKeuze, maat: Maat, jumps: JumpMeting[], kracht: KrachtMeting[]): { unit: string; series: Reeks[] } {
  if (keuze.soort === 'kracht') {
    const rijen = kracht.filter((k) => (k.title ?? '') === keuze.title)
    if (maat === 'piek') {
      const links = punten(rijen.map((k) => ({ t: tijd(k.performedAt), v: k.leftMaxKg ?? k.singleMaxKg })))
      const rechts = punten(rijen.map((k) => ({ t: tijd(k.performedAt), v: k.rightMaxKg })))
      return { unit: 'kg', series: rechts.length ? [{ key: 'L', label: 'Links', points: links }, { key: 'R', label: 'Rechts', points: rechts }] : [{ key: 'S', label: 'Piek', points: links }] }
    }
    if (maat === 'verschil') {
      return { unit: '%', series: [{ key: 'V', label: 'Verschil', points: punten(rijen.map((k) => ({ t: tijd(k.performedAt), v: asymmetryPct(k.leftMaxKg, k.rightMaxKg) }))) }] }
    }
    return { unit: '', series: [] }
  }

  const rijen = jumps.filter((m) => m.jumpType === keuze.jumpType && isEenbenig(m) === keuze.eenbenig)
  const unit = maat === 'hoogte' ? 'cm' : maat === 'piek' ? 'N' : maat === 'verschil' ? '%' : ''

  if (keuze.eenbenig) {
    const perZijde = (side: 'LEFT' | 'RIGHT') =>
      punten(
        rijen.map((m) => {
          const beste = besteSprong(m.reps.filter((r) => r.side === side))
          if (!beste) return { t: tijd(m.performedAt), v: null }
          const v = maat === 'hoogte' ? beste.jumpHeightCm : maat === 'piek' ? beste.peakForceN : maat === 'rsi' ? beste.rsi : null
          return { t: tijd(m.performedAt), v }
        }),
      )
    if (maat === 'verschil') {
      // Verschil tussen het beste linker- en rechterbeen op dezelfde dag.
      const perDag = new Map<string, { t: number; L: number | null; R: number | null }>()
      for (const m of rijen) {
        const dag = new Date(m.performedAt).toISOString().slice(0, 10)
        const cur = perDag.get(dag) ?? { t: tijd(m.performedAt), L: null, R: null }
        const l = besteSprong(m.reps.filter((r) => r.side === 'LEFT'))?.peakForceN ?? null
        const r = besteSprong(m.reps.filter((r) => r.side === 'RIGHT'))?.peakForceN ?? null
        if (l !== null) cur.L = Math.max(cur.L ?? 0, l)
        if (r !== null) cur.R = Math.max(cur.R ?? 0, r)
        perDag.set(dag, cur)
      }
      return { unit, series: [{ key: 'V', label: 'Verschil', points: punten([...perDag.values()].map((d) => ({ t: d.t, v: asymmetryPct(d.L, d.R) }))) }] }
    }
    return { unit, series: [{ key: 'L', label: 'Links', points: perZijde('LEFT') }, { key: 'R', label: 'Rechts', points: perZijde('RIGHT') }] }
  }

  const beste = rijen.map((m) => ({ m, b: besteSprong(m.reps) }))
  if (maat === 'hoogte') {
    return { unit, series: [{ key: 'H', label: 'Hoogte', points: punten(beste.map(({ m, b }) => ({ t: tijd(m.performedAt), v: m.peakJumpHeightCm ?? b?.jumpHeightCm ?? null }))) }] }
  }
  if (maat === 'piek') {
    return {
      unit,
      series: [
        { key: 'L', label: 'Links', points: punten(beste.map(({ m, b }) => ({ t: tijd(m.performedAt), v: b?.peakForceLeftN ?? null }))) },
        { key: 'R', label: 'Rechts', points: punten(beste.map(({ m, b }) => ({ t: tijd(m.performedAt), v: b?.peakForceRightN ?? null }))) },
      ],
    }
  }
  if (maat === 'verschil') {
    return { unit, series: [{ key: 'V', label: 'Verschil', points: punten(beste.map(({ m, b }) => ({ t: tijd(m.performedAt), v: asymmetryPct(b?.peakForceLeftN ?? null, b?.peakForceRightN ?? null) }))) }] }
  }
  return { unit, series: [{ key: 'RSI', label: 'RSI', points: punten(beste.map(({ m, b }) => ({ t: tijd(m.performedAt), v: m.rsi ?? b?.rsi ?? null }))) }] }
}
