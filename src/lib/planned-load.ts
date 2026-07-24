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
  exercises?: { sets: number; reps: number; repUnit?: string | null; restTime?: number | null }[]
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
 * De eenheid van `reps` bepaalt wat het getal betékent, en dus hoe lang de set
 * duurt. Zonder dit telde een plank van 60 sec als 180 seconden werk (60 × 3),
 * "5 min" als 15 seconden, en "10 reps per zijde" als 10 in plaats van 20. Dat
 * getal voedt de geplande belasting, dus die fout liep door tot in de weekbalk.
 *
 * De aanbod-lijst staat in REP_UNITS (program-constants), maar repUnit is vrije
 * tekst en oude rijen bevatten van alles. Onbekend → reps, zodat een eenheid
 * die we niet kennen nooit een wilde uitschieter oplevert.
 *
 * `m` (meters) kan niet: zonder tempo is afstand geen tijd. Valt bewust terug
 * op de reps-schatting in plaats van te doen alsof we het weten.
 */
function werkSecondenPerSet(reps: number, repUnit?: string | null): number {
  const u = (repUnit ?? '').toLowerCase().trim()
  // "per zijde" verdubbelt óók bij tijd-eenheden: 30 sec/zijde = 60 sec werk.
  const perZijde = u.includes('zijde') || u.includes('kant') || u.includes('been') || u.includes('arm')
  if (u.startsWith('sec')) return reps * (perZijde ? 2 : 1)
  if (u.startsWith('min')) return reps * 60 * (perZijde ? 2 : 1)
  if (perZijde) return reps * SECONDS_PER_REP * 2
  return reps * SECONDS_PER_REP
}

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

/**
 * Duur van een set oefeningen: reps × 3s werk + rust. Grof, maar het is de
 * enige plek waar die schatting staat — de server schrijft 'm bij het opslaan
 * weg op het item, zodat de tegel, de weekbalk en de patiënt allemaal hetzelfde
 * getal zien.
 */
export function durationFromExercises(
  exercises: { sets: number; reps: number; repUnit?: string | null; restTime?: number | null }[],
): number {
  return exercises.reduce(
    (sum, e) => sum + e.sets * (werkSecondenPerSet(e.reps, e.repUnit) + (e.restTime ?? DEFAULT_REST_SEC)),
    0,
  )
}

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
    durationSec = durationFromExercises(item.exercises)
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
