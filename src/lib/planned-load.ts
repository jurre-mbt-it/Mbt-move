/**
 * Geplande weekbelasting.
 *
 * Eenheid = sRPE: `duur_in_minuten × RPE`. Bewust dezelfde eenheid als de
 * gerealiseerde load-curve, zodat "gepland 1450 / gehaald 1380" een eerlijke
 * vergelijking is en niet twee schalen naast elkaar.
 *
 * Een therapeut hoeft niets in te vullen: ontbreekt duur of RPE, dan schatten
 * we. Dat is expliciet zichtbaar in de UI (`estimated`), want een geschat
 * getal mag niet doen alsof het een voorschrift is.
 */

export type PlannedLoadInput = {
  kind: string
  plannedDurationSec?: number | null
  plannedRpe?: number | null
  quickCategory?: string | null
  quickDurationSec?: number | null
  /** Inline oefeningen — gebruikt om duur te schatten als die ontbreekt. */
  exercises?: { sets: number; reps: number; restTime?: number | null }[]
}

/**
 * Standaard-RPE per categorie. Grof, maar beter dan niets: een mobiliteits-
 * sessie van 20 minuten is nu eenmaal geen 20 minuten intervaltraining.
 * Wordt altijd overschreven zodra de therapeut `plannedRpe` invult.
 */
const DEFAULT_RPE: Record<string, number> = {
  STRENGTH: 7,
  PLYOMETRICS: 7,
  CARDIO: 5,
  STABILITY: 4,
  MOBILITY: 3,
}
const FALLBACK_RPE = 5

/** Ruwe schatting van de duur van een krachtset: reps × 3s + rust. */
const SECONDS_PER_REP = 3
const DEFAULT_REST_SEC = 60

/**
 * Een PROGRAM-item verwijst naar een programma; zijn oefeningen hangen aan dat
 * programma, niet aan het item, en zijn hier dus niet beschikbaar. Zonder een
 * schatting zou zo'n item op 0 uitkomen en zou een week die volledig uit
 * programma's bestaat "geen belasting" melden — precies de meest voorkomende
 * situatie. Dit is een grove aanname; de therapeut kan 'm per item overschrijven
 * met plannedDurationSec en de UI markeert 'm als schatting.
 */
const DEFAULT_PROGRAM_DURATION_SEC = 45 * 60

/** Alleen deze tellen mee; een rustdag of notitie is per definitie 0. */
const LOAD_BEARING_KINDS = ['PROGRAM', 'WORKOUT']

export type PlannedLoad = {
  /** sRPE-punten. 0 voor niet-belastende items. */
  load: number
  /** True als duur of RPE is afgeleid i.p.v. voorgeschreven. */
  estimated: boolean
  durationSec: number
  rpe: number
}

export function itemPlannedLoad(item: PlannedLoadInput): PlannedLoad {
  if (!LOAD_BEARING_KINDS.includes(item.kind)) {
    return { load: 0, estimated: false, durationSec: 0, rpe: 0 }
  }

  let estimated = false

  // ── Duur ──
  let durationSec = item.plannedDurationSec ?? item.quickDurationSec ?? null
  if (durationSec == null && item.exercises?.length) {
    durationSec = item.exercises.reduce(
      (sum, e) => sum + e.sets * (e.reps * SECONDS_PER_REP + (e.restTime ?? DEFAULT_REST_SEC)),
      0,
    )
    estimated = true
  }
  if (durationSec == null && item.kind === 'PROGRAM') {
    // Oefeningen van een programma zijn hier niet bekend — zie de constante.
    durationSec = DEFAULT_PROGRAM_DURATION_SEC
    estimated = true
  }
  if (durationSec == null || durationSec <= 0) {
    return { load: 0, estimated: true, durationSec: 0, rpe: 0 }
  }
  if (item.plannedDurationSec == null) estimated = true

  // ── RPE ──
  let rpe = item.plannedRpe ?? null
  if (rpe == null) {
    rpe = DEFAULT_RPE[item.quickCategory ?? ''] ?? FALLBACK_RPE
    estimated = true
  }

  return {
    load: Math.round((durationSec / 60) * rpe),
    estimated,
    durationSec,
    rpe,
  }
}

/** Som van een dag/week. `estimated` als één item geschat is. */
export function sumPlannedLoad(items: PlannedLoadInput[]): PlannedLoad & { itemCount: number } {
  let load = 0
  let estimated = false
  let durationSec = 0
  let counted = 0
  for (const it of items) {
    const r = itemPlannedLoad(it)
    if (r.load === 0 && !LOAD_BEARING_KINDS.includes(it.kind)) continue
    load += r.load
    durationSec += r.durationSec
    if (r.estimated) estimated = true
    counted++
  }
  return {
    load,
    estimated,
    durationSec,
    rpe: durationSec > 0 ? Math.round((load / (durationSec / 60)) * 10) / 10 : 0,
    itemCount: counted,
  }
}

/**
 * Hoe verhoudt gepland zich tot het doel? Buiten 0.85–1.10 wordt het gemeld;
 * daarbinnen is de week "op koers". Bewust ruim: een weekplan is geen recept.
 */
export type LoadVerdict = 'under' | 'on_target' | 'over' | 'no_target'

export function loadVerdict(planned: number, target: number | null | undefined): LoadVerdict {
  if (target == null || target <= 0) return 'no_target'
  const ratio = planned / target
  if (ratio < 0.85) return 'under'
  if (ratio > 1.1) return 'over'
  return 'on_target'
}
