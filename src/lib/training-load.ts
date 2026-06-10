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
 * ACWR (Gabbett) is bewust SECUNDAIR: de voorspellende waarde is omstreden
 * (Impellizzeri 2020; meta-analyse 2025), dus we tonen 'm als indicatie naast
 * de vorm-curve, niet als hard oordeel. EWMA-variant (7d/28d), niet rollend.
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
  | 'overreaching'  // vorm < −30 of ACWR > 1.5 — gas terug
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

/** sRPE in arbitrary units; ontbrekende RPE → 5 (matig), zoals elders in de app. */
export function sessionLoad(durationMinutes: number, rpe: number | null | undefined): number {
  return Math.max(0, durationMinutes) * (rpe ?? 5)
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

export function loadStatus(form: number, acwr: number | null): LoadStatus {
  if (form < -30 || (acwr !== null && acwr > 1.5)) {
    return {
      key: 'overreaching',
      label: 'Overreaching-risico',
      description: 'Belasting stijgt veel sneller dan het lichaam gewend is. Bouw een rustdag of lichtere sessie in.',
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
