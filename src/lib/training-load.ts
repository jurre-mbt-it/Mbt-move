/**
 * Training-load model: Banister fitness-fatigue (supercompensatie) + EWMA-ACWR.
 *
 * Eén gemeenschappelijke "valuta" voor kracht én cardio: sRPE = RPE × minuten
 * (Foster 2001, gevalideerd voor beide modaliteiten). Daarop draait een
 * fitness-fatigue model zoals TrainingPeaks' Performance Manager:
 *
 *   Fitheid     (CTL) = EWMA van dagelijkse load, tijdsconstante 42 dagen
 *   Vermoeidheid (ATL) = EWMA van dagelijkse load, tijdsconstante 7 dagen
 *   Vorm        (TSB) = Fitheid − Vermoeidheid
 *
 * Trainen → Fitheid stijgt langzaam; stoppen → langzaam verval; te veel in
 * korte tijd → Vermoeidheid piekt en Vorm duikt diep negatief (overreaching,
 * zone < −30 per Friel/TrainingPeaks-conventie).
 *
 * FRAME: opbouw-begeleiding, geen blessure-voorspelling. Op individueel niveau
 * heeft geen enkel load-getal serieuze predictieve waarde; we sturen daarom op
 * (1) een consistent opgebouwde fitheidsbasis, (2) het vermijden van scherpe
 * week-op-week pieken en (3) genoeg afwisseling (Foster monotony/strain).
 *
 * De vorm (TSB) is het ENIGE dat de status bepaalt. De ACWR (Gabbett) is
 * methodologisch onderuit gehaald als stuurmaat — een ratio-artefact zonder
 * aangetoonde voorspellende waarde (Impellizzeri 2020, IJSPP & Sports Medicine
 * "Time to Dismiss ACWR") — en drijft daarom NIETS meer aan; hij blijft alleen
 * als stil trend-cijfer beschikbaar (EWMA 7d/28d), niet als oordeel.
 *
 * In plaats daarvan:
 *   - `weekToWeekChange`  spike-detectie zonder ratio-artefact (kale % sprong)
 *   - `trainingMonotony`/`trainingStrain`  Foster's afwisselings-maat
 *   - `computeConsistency`  adherentie: actieve dagen/week + streak
 *
 * Puur (geen server-deps) zodat client en server dezelfde wiskunde delen.
 */

export type DailyLoad = { date: string; load: number } // date = 'yyyy-mm-dd'

export type LoadPoint = {
  date: string
  load: number      // dag-totaal sRPE (AU)
  fitness: number   // CTL (AU/dag)
  fatigue: number   // ATL (AU/dag)
  form: number      // TSB = fitness − fatigue
}

export type LoadStatusKey =
  | 'overreaching'  // vorm < −30 — gas terug
  | 'productief'    // vorm −30..−10 — effectieve overload
  | 'neutraal'      // vorm −10..+5 — onderhoud/plateau
  | 'fris'          // vorm +5..+25 — hersteld, klaar om te bouwen
  | 'ontraind'      // vorm > +25 — fitheid loopt terug door inactiviteit

export type LoadStatus = {
  key: LoadStatusKey
  label: string
  description: string
}

const TAU_FITNESS = 42
const TAU_FATIGUE = 7
const TAU_CHRONIC = 28 // EWMA-ACWR: acute 7d vs chronisch 28d

/**
 * Bovengrens op één sessieduur (seconden). Vangt de doorgelopen-timer-bug:
 * een sessie die "voltooid" wordt weggeschreven nadat de app uren/dagen open
 * bleef staan, krijgt anders een absurde duur (bv. 76 u) die als enorme sRPE
 * de fitness/chronische basis opblaast en ACWR + vorm dagenlang vergiftigt.
 * Mediaan-sessie ≈ 30 min, p95 ≈ 2 u, dus 4 u knipt nooit een echte sessie af.
 */
export const MAX_SESSION_DURATION_SEC = 4 * 60 * 60

/** Kap een geregistreerde sessieduur (s) af op MAX_SESSION_DURATION_SEC; niet-eindige/negatieve → 0. */
export function clampSessionDurationSec(sec: number | null | undefined): number {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return 0
  return Math.min(sec, MAX_SESSION_DURATION_SEC)
}

/** sRPE in arbitrary units; ontbrekende RPE → 5 (matig), zoals elders in de app. */
export function sessionLoad(durationMinutes: number, rpe: number | null | undefined): number {
  return Math.max(0, durationMinutes) * (rpe ?? 5)
}

/**
 * Edwards' TRIMP — HR-zone-gewogen interne load voor cardio (gevalideerd,
 * correleert sterk met sRPE bij aerobe sessies, r≈0.83–0.86). Som over de vijf
 * HR-zones van (minuten in zone × zonegewicht 1..5).
 *
 * Vereist alleen tijd-in-zone, die uit gemeten HR wordt afgeleid en op
 * `CardioLog.timeInZones` staat. Zolang er geen wearable-HR is, is dit veld
 * null en geeft de functie null terug — de aanroeper valt dan terug op sRPE,
 * zodat de curve continu en bruikbaar blijft zonder watch-koppeling.
 *
 * BELANGRIJK: TRIMP en sRPE zijn verschillende eenheden. Meng ze NIET in
 * dezelfde EWMA-reeks (dat geeft een discontinue curve). TRIMP is bedoeld als
 * losse cardio-readout naast de sRPE-curve, niet als curve-aandrijving.
 *
 * @param timeInZonesSec  object { "1": sec, "2": sec, … "5": sec } of null
 */
export function edwardsTrimp(
  timeInZonesSec: Record<string, number> | null | undefined,
): number | null {
  if (!timeInZonesSec || typeof timeInZonesSec !== 'object') return null
  let trimp = 0
  let any = false
  for (let zone = 1; zone <= 5; zone++) {
    const sec = Number(timeInZonesSec[String(zone)] ?? 0)
    if (!Number.isFinite(sec) || sec <= 0) continue
    any = true
    trimp += (sec / 60) * zone
  }
  return any ? Math.round(trimp) : null
}

/**
 * Bouw de dagelijkse curve over [from..to] (inclusief). `loads` mag sparse
 * zijn; dagen zonder training tellen als 0 (verval). Begin `from` ruim vóór
 * het weergavevenster (≥ 42 dagen warm-up) zodat de EWMA's ingelopen zijn.
 */
export function buildLoadCurve(loads: DailyLoad[], from: Date, to: Date): LoadPoint[] {
  const byDate = new Map<string, number>()
  for (const l of loads) {
    byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.load)
  }

  const points: LoadPoint[] = []
  let fitness = 0
  let fatigue = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  while (cursor <= end) {
    const iso = isoDay(cursor)
    const load = byDate.get(iso) ?? 0
    // EWMA met λ = 1/τ (TrainingPeaks-conventie)
    fitness = fitness + (load - fitness) / TAU_FITNESS
    fatigue = fatigue + (load - fatigue) / TAU_FATIGUE
    points.push({
      date: iso,
      load,
      fitness: round1(fitness),
      fatigue: round1(fatigue),
      form: round1(fitness - fatigue),
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return points
}

/** EWMA-ACWR (acute 7d / chronisch 28d) op de laatste dag van de reeks. */
export function ewmaAcwr(loads: DailyLoad[], from: Date, to: Date): number | null {
  const byDate = new Map<string, number>()
  for (const l of loads) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.load)

  let acute = 0
  let chronic = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cursor <= end) {
    const load = byDate.get(isoDay(cursor)) ?? 0
    acute = acute + (load - acute) / TAU_FATIGUE
    chronic = chronic + (load - chronic) / TAU_CHRONIC
    cursor.setDate(cursor.getDate() + 1)
  }
  if (chronic < 1) return null // te weinig historie voor een zinvolle ratio
  return Math.round((acute / chronic) * 100) / 100
}

/** Dagelijkse load-totalen (incl. 0-dagen) over [from..to] inclusief. */
function dailyTotals(loads: DailyLoad[], from: Date, to: Date): number[] {
  const byDate = new Map<string, number>()
  for (const l of loads) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.load)
  const out: number[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cursor <= end) {
    out.push(byDate.get(isoDay(cursor)) ?? 0)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * Week-op-week verandering (%): som van de laatste 7 dagen t.o.v. het
 * gemiddelde weektotaal over de `priorWeeks` weken dáárvoor. Vervangt de ACWR
 * als spike-detectie — een kale procentuele sprong zonder ratio-artefact.
 *
 *   +60  = deze week 60% zwaarder dan gewend → mogelijke piek, rustiger opbouwen
 *    0   = gelijk aan het recente gemiddelde (consistente opbouw)
 *   −40  = flink lichter (deload of gemiste sessies)
 *
 * null zolang er te weinig chronische basis is om zinvol te vergelijken.
 */
export function weekToWeekChange(
  loads: DailyLoad[],
  to: Date,
  priorWeeks = 3,
): number | null {
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  const last7Start = new Date(end)
  last7Start.setDate(last7Start.getDate() - 6)
  const priorEnd = new Date(last7Start)
  priorEnd.setDate(priorEnd.getDate() - 1)
  const priorStart = new Date(priorEnd)
  priorStart.setDate(priorStart.getDate() - (priorWeeks * 7 - 1))

  const last7 = dailyTotals(loads, last7Start, end).reduce((a, b) => a + b, 0)
  const priorDays = dailyTotals(loads, priorStart, priorEnd)
  const priorSum = priorDays.reduce((a, b) => a + b, 0)
  const priorActiveDays = priorDays.filter(d => d > 0).length
  const priorWeekMean = priorSum / priorWeeks
  // Te dunne basis → geen zinvolle vergelijking. Vlak na de eerste logs is de
  // voorgaande periode bijna leeg en explodeert de deling (+283%-artefacten);
  // eis daarom minstens 4 actieve dagen én een substantiële weekload in de
  // voorgaande weken. Consumers tonen dan "basis in opbouw" i.p.v. een getal.
  if (priorActiveDays < 4 || priorWeekMean < 100) return null
  return Math.round(((last7 - priorWeekMean) / priorWeekMean) * 100)
}

/**
 * Foster's training-monotony over de laatste 7 dagen: gemiddelde dagload
 * gedeeld door de spreiding (populatie-SD, rustdagen tellen als 0). Hoog =
 * elke dag hetzelfde, weinig afwisseling zwaar/licht — geassocieerd met ziekte
 * en blessures (Foster 1998; Anderson 2003). Richtwaarde: > ~2.0 = te eentonig.
 *
 * null als er in de week niet getraind is (gem. load 0) of alle dagen exact
 * gelijk zijn (SD 0 — geen zinvolle spreiding te bepalen).
 */
export function trainingMonotony(loads: DailyLoad[], to: Date): number | null {
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  const days = dailyTotals(loads, start, end)
  const mean = days.reduce((a, b) => a + b, 0) / days.length
  if (mean <= 0) return null
  const variance = days.reduce((a, b) => a + (b - mean) ** 2, 0) / days.length
  const sd = Math.sqrt(variance)
  if (sd === 0) return null
  return Math.round((mean / sd) * 100) / 100
}

/**
 * Foster's training-strain: weektotaal × monotony. Combineert "hoeveel" met
 * "hoe eentonig" — het weekvolume weegt zwaarder naarmate de belasting
 * monotoner verdeeld is. null als monotony niet te bepalen is.
 */
export function trainingStrain(loads: DailyLoad[], to: Date): number | null {
  const monotony = trainingMonotony(loads, to)
  if (monotony === null) return null
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  const weekLoad = dailyTotals(loads, start, end).reduce((a, b) => a + b, 0)
  return Math.round(weekLoad * monotony)
}

/** Adherentie-/consistentie-signaal — de positieve kant van "opdagen". */
export type Consistency = {
  activeDaysPerWeek: number  // gem. actieve dagen/week over het venster
  sessionsLast7d: number     // aantal gelogde sessies in de laatste 7 dagen
  streakWeeks: number        // aaneengesloten weken (t/m nu) met ≥1 sessie
}

/**
 * Bereken hoe consistent er getraind is over [from..to]. `loads` mag meerdere
 * entries per dag bevatten (één per sessie) — sessies tellen we op entry-niveau,
 * actieve dagen op unieke datum.
 */
export function computeConsistency(loads: DailyLoad[], from: Date, to: Date): Consistency {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  const activeDates = new Set<string>()
  for (const l of loads) {
    if (l.load > 0 && l.date >= isoDay(start) && l.date <= isoDay(end)) activeDates.add(l.date)
  }
  const spanDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const weeks = spanDays / 7
  const activeDaysPerWeek = Math.round((activeDates.size / weeks) * 10) / 10

  const last7Start = new Date(end)
  last7Start.setDate(last7Start.getDate() - 6)
  const last7StartIso = isoDay(last7Start)
  const endIso = isoDay(end)
  const sessionsLast7d = loads.filter(
    (l) => l.load > 0 && l.date >= last7StartIso && l.date <= endIso,
  ).length

  // Streak: loop terug in 7-daagse blokken vanaf vandaag; tel aaneengesloten
  // weken met minstens één actieve dag.
  let streakWeeks = 0
  for (let w = 0; ; w++) {
    const wEnd = new Date(end)
    wEnd.setDate(wEnd.getDate() - w * 7)
    const wStart = new Date(wEnd)
    wStart.setDate(wStart.getDate() - 6)
    if (wStart < start) break
    const wStartIso = isoDay(wStart)
    const wEndIso = isoDay(wEnd)
    let has = false
    for (const d of activeDates) {
      if (d >= wStartIso && d <= wEndIso) { has = true; break }
    }
    if (!has) break
    streakWeeks++
  }

  return { activeDaysPerWeek, sessionsLast7d, streakWeeks }
}

/**
 * Statuslabel puur op basis van de vorm (TSB). De ACWR bepaalt hier bewust
 * NIETS meer (zie module-header): één interpreteerbare as i.p.v. een tweede,
 * omstreden signaal dat het beeld troebel maakt.
 */
export function loadStatus(form: number): LoadStatus {
  if (form < -30) {
    return {
      key: 'overreaching',
      label: 'Overreaching-risico',
      description: 'Vermoeidheid ligt fors boven de fitheid. Bouw een rustdag of lichtere sessie in en daarna geleidelijker op.',
    }
  }
  if (form < -10) {
    return {
      key: 'productief',
      label: 'Productief',
      description: 'Effectieve trainingsprikkel — vermoeidheid is hoger dan fitheid, precies waar adaptatie ontstaat.',
    }
  }
  if (form <= 5) {
    return {
      key: 'neutraal',
      label: 'Onderhoud',
      description: 'Belasting en herstel in balans. Prima voor onderhoud; voor opbouw mag de prikkel iets omhoog.',
    }
  }
  if (form <= 25) {
    return {
      key: 'fris',
      label: 'Fris',
      description: 'Goed hersteld — een uitstekend moment voor een zwaardere sessie of test.',
    }
  }
  return {
    key: 'ontraind',
    label: 'Fitheid zakt weg',
    description: 'Langere tijd weinig belasting — de opgebouwde fitheid loopt langzaam terug.',
  }
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
