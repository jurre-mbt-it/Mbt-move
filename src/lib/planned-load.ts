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

import { readWorkout, flattenSteps, targetRpe } from './cardio-workout'
import type { CardioActivityKey } from './cardio-constants'

export type PlannedLoadInput = {
  kind: string
  plannedDurationSec?: number | null
  plannedRpe?: number | null
  quickCategory?: string | null
  quickDurationSec?: number | null
  /** Inline oefeningen — gebruikt om duur te schatten als die ontbreekt. */
  exercises?: { sets: number; reps: number; repUnit?: string | null; restTime?: number | null }[]
  /**
   * Ruwe `cardioParams` van het item. Nodig omdat een cardio-workout op
   * AFSTAND geen duur oplevert: `totalDurationSec` telt alleen `durationSec`,
   * dus een duurloop van 29 km kwam op 0 uit en telde niet mee in de weekbalk.
   */
  cardioParams?: unknown
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
 * Seconden per meter voor afstand-oefeningen (farmer's carry, sledepush,
 * lunges over een baan): 30 m = 60 sec. Bewust langzaam — het gaat om belaste
 * verplaatsing, niet om hardlopen.
 *
 * MOET gelijk blijven aan `SECONDS_PER_METER` in de mobiele repo
 * (lib/prescription-mirror.ts); `npm run check:mirror` vergelijkt de waarde.
 */
const SECONDS_PER_METER = 2

/**
 * Seconden per kilometer per cardio-activiteit, als vangnet voor een workout
 * die op AFSTAND is voorgeschreven ("lange duurloop 29 km") en dus geen duur
 * heeft. Rustig-aeroob tempo van een recreatieve sporter.
 *
 * Nadrukkelijk een schatting, geen voorschrift: er is geen drempel of tempo per
 * patiënt opgeslagen (zie de kop van lib/cardio-workout.ts), dus dit is de
 * enige manier om zo'n sessie überhaupt mee te laten tellen. Alles wat hierop
 * leunt komt terug als `estimated: true`, en de therapeut kan het overschrijven
 * met `plannedDurationSec`.
 *
 * LET OP: dit is iets ánders dan SECONDS_PER_METER hierboven. Dat gaat over
 * belaste verplaatsing in een krachtoefening (2 sec/m ≈ 33 min per km) en is
 * gespiegeld met de mobiele repo; deze tabel is web-only.
 */
const SEC_PER_KM: Partial<Record<CardioActivityKey, number>> = {
  RUNNING: 390,      // 6:30 min/km
  WALKING: 750,      // 12:30 min/km
  CYCLING: 150,      // 24 km/u
  SWIMMING: 1500,    // 2:30 min/100 m
  ROWING: 300,       // 2:30 min/500 m
  SKIERG: 300,
  CROSSTRAINER: 300,
}
/** Onbekende activiteit → hardlooptempo; dat is de veruit gebruikelijkste. */
const SEC_PER_KM_FALLBACK = 390

export type CardioEstimate = { durationSec: number; load: number; rpe: number }

/**
 * Duur, belasting en gemiddelde RPE van een gestructureerde cardio-workout,
 * met afstand-stappen omgerekend naar tijd.
 *
 * Dit is `structuredLoad` + `totalDurationSec` in één pas, maar dan met de
 * afstand-tak erbij: die twee doen `st.durationSec ?? 0` en laten een
 * afstand-stap dus als nul meetellen. Retourneert null als er niets te rekenen
 * valt, zodat de aanroeper zijn eigen vangnet houdt.
 */
export function cardioEstimate(raw: unknown): CardioEstimate | null {
  const w = readWorkout(raw)
  if (!w) return null
  const secPerKm = SEC_PER_KM[w.activity] ?? SEC_PER_KM_FALLBACK

  let sec = 0
  let load = 0
  for (const st of flattenSteps(w.blocks)) {
    // Duur wint; een stap heeft er per contract precies één van beide.
    const d = st.durationSec ?? (st.distanceM != null ? (st.distanceM / 1000) * secPerKm : 0)
    if (d <= 0) continue
    sec += d
    load += (d / 60) * targetRpe(st.target)
  }
  if (sec <= 0) return null

  return {
    durationSec: Math.round(sec),
    load: Math.round(load),
    rpe: Math.round((load / (sec / 60)) * 10) / 10,
  }
}

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
 * `m` (meters) rekent op SECONDS_PER_METER. Afstand kent geen tempo-per-rep, dus
 * dit is een vaste aanname; hij stond eerder op de reps-schatting (30 m = 90 sec)
 * terwijl de app 45 sec gebruikte. Nu beide 2 sec/m.
 */
function werkSecondenPerSet(reps: number, repUnit?: string | null): number {
  const u = (repUnit ?? '').toLowerCase().trim()
  // "per zijde" verdubbelt óók bij tijd-eenheden: 30 sec/zijde = 60 sec werk.
  const perZijde = u.includes('zijde') || u.includes('kant') || u.includes('been') || u.includes('arm')
  const zijde = perZijde ? 2 : 1
  // Let op de volgorde: 'min' begint óók met 'm', dus die eerst.
  if (u.startsWith('sec')) return reps * zijde
  if (u.startsWith('min')) return reps * 60 * zijde
  if (u.startsWith('m')) return reps * SECONDS_PER_METER * zijde
  return reps * SECONDS_PER_REP * zijde
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
  // Cardio op afstand levert geen duur; reken 'm uit de blokken. Dit staat
  // vóór de oefening-tak omdat een cardio-item geen inline oefeningen heeft.
  let cardio: CardioEstimate | null = null
  if (durationSec == null || durationSec <= 0) {
    cardio = cardioEstimate(item.cardioParams)
    if (cardio) {
      durationSec = cardio.durationSec
      estimated = true
    }
  }
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
  // Voorschrift van de therapeut wint. Daarna het gewogen gemiddelde uit de
  // cardio-blokken: die dragen hun eigen doelen, dus een intervalsessie hoeft
  // niet terug te vallen op de categorie-gemiddelde 5.
  let rpe = item.plannedRpe ?? null
  if (rpe == null && cardio) {
    rpe = cardio.rpe
    estimated = true
  }
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
