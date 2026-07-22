/**
 * Gestructureerde cardio-workout: blokken i.p.v. één duur + één zone.
 *
 * Vervangt het platte `{durationSec, zone, intervals}` waarmee je een
 * walk-run of een piramide niet kunt opschrijven. Een workout is een lijst
 * blokken; een herhaling is zelf een blok met stappen erin — zo zijn de
 * "2-step repeat" en "3-step repeat" uit TrainingPeaks gewoon één herhaling
 * met twee of drie stappen, en niet twee aparte concepten.
 *
 * DOELEN ZIJN ZONES OF RPE, GEEN % VAN DREMPEL. TrainingPeaks kan "70-80%
 * threshold pace" tonen omdat het de drempelwaarde van de atleet kent; die
 * slaan wij nergens op (er is wel een FTP-*test* in de catalogus, maar geen
 * drempel per patiënt). Zodra die er is, hoort hier een target-variant
 * `PACE_PCT` bij — de rest van het model hoeft dan niet te wijzigen.
 *
 * Woont in `WeekScheduleDayItem.cardioParams` (Json), dus geen migratie. De
 * platte legacy-velden worden bij het opslaan afgeleid meegeschreven zodat
 * oudere lezers (planner-tegel, iOS) blijven werken.
 */

import { HR_ZONES, type CardioActivityKey, type HRZone } from './cardio-constants'

// ── Blokken ───────────────────────────────────────────────────────────────

export type StepKind =
  | 'WARMUP'
  | 'ACTIVE'
  | 'RECOVERY'
  | 'COOLDOWN'
  | 'RAMP_UP'
  | 'RAMP_DOWN'

export const STEP_META: Record<StepKind, { label: string; short: string; defaultZone: HRZone; defaultSec: number }> = {
  WARMUP:    { label: 'Warming-up', short: 'W-up',    defaultZone: 2, defaultSec: 10 * 60 },
  ACTIVE:    { label: 'Actief',     short: 'Actief',  defaultZone: 4, defaultSec: 4 * 60 },
  RECOVERY:  { label: 'Herstel',    short: 'Herstel', defaultZone: 1, defaultSec: 2 * 60 },
  COOLDOWN:  { label: 'Cooldown',   short: 'Cool',    defaultZone: 1, defaultSec: 10 * 60 },
  RAMP_UP:   { label: 'Ramp up',    short: 'Ramp ↑',  defaultZone: 3, defaultSec: 5 * 60 },
  RAMP_DOWN: { label: 'Ramp down',  short: 'Ramp ↓',  defaultZone: 2, defaultSec: 5 * 60 },
}

/** Loopt de intensiteit binnen dit blok op of af? Dan heeft het een eindzone. */
export const IS_RAMP: Record<StepKind, boolean> = {
  WARMUP: false, ACTIVE: false, RECOVERY: false, COOLDOWN: false,
  RAMP_UP: true, RAMP_DOWN: true,
}

export type StepTarget =
  | { type: 'ZONE'; zone: HRZone; /** Alleen bij ramp: zone aan het eind. */ toZone?: HRZone }
  | { type: 'RPE'; min: number; max?: number }
  | { type: 'FREE' }

export type WorkoutStep = {
  id: string
  kind: StepKind
  /** Lengte: exact één van beide. */
  durationSec?: number
  distanceM?: number
  target: StepTarget
  notes?: string
}

export type WorkoutRepeat = {
  id: string
  kind: 'REPEAT'
  times: number
  steps: WorkoutStep[]
}

export type WorkoutBlock = WorkoutStep | WorkoutRepeat

export const isRepeat = (b: WorkoutBlock): b is WorkoutRepeat => b.kind === 'REPEAT'

export type StructuredCardio = {
  version: 1
  activity: CardioActivityKey
  blocks: WorkoutBlock[]
  notes?: string
}

// ── Intensiteit ───────────────────────────────────────────────────────────

/**
 * Zone → RPE, als getal. HR_ZONES draagt dit al als tekst ('RPE 7-8 — Hard');
 * dit is dezelfde vertaling maar rekenbaar, zodat de geplande belasting
 * (duur × RPE) klopt en niet geschat hoeft te worden.
 */
export const ZONE_RPE: Record<HRZone, number> = { 1: 2, 2: 3.5, 3: 5.5, 4: 7.5, 5: 9 }

/** RPE van een doel. Ramp = gemiddelde van begin- en eindzone. */
export function targetRpe(t: StepTarget): number {
  switch (t.type) {
    case 'ZONE':
      return t.toZone != null
        ? (ZONE_RPE[t.zone] + ZONE_RPE[t.toZone]) / 2
        : ZONE_RPE[t.zone]
    case 'RPE':
      return t.max != null ? (t.min + t.max) / 2 : t.min
    case 'FREE':
      // Onbekend doel → aerobe middenmoot; bewust niet 0, want het is wél werk.
      return 4
  }
}

/** Kleur van een doel, voor de grafiek. */
export function targetColor(t: StepTarget): string {
  if (t.type === 'ZONE') return HR_ZONES[t.zone].color
  if (t.type === 'RPE') {
    const z = (Math.min(5, Math.max(1, Math.round(t.min / 2))) || 1) as HRZone
    return HR_ZONES[z].color
  }
  return '#9EB5B3'
}

/** Relatieve hoogte 0..1 voor de grafiek. */
export function targetHeight(t: StepTarget): number {
  return Math.min(1, targetRpe(t) / 10)
}

// ── Rekenen ───────────────────────────────────────────────────────────────

/** Alle stappen uitgevouwen, herhalingen meegeteld. */
export function flattenSteps(blocks: WorkoutBlock[]): WorkoutStep[] {
  const out: WorkoutStep[] = []
  for (const b of blocks) {
    if (isRepeat(b)) {
      for (let i = 0; i < Math.max(1, b.times); i++) out.push(...b.steps)
    } else out.push(b)
  }
  return out
}

export function totalDurationSec(blocks: WorkoutBlock[]): number {
  return flattenSteps(blocks).reduce((s, st) => s + (st.durationSec ?? 0), 0)
}

export function totalDistanceM(blocks: WorkoutBlock[]): number {
  return flattenSteps(blocks).reduce((s, st) => s + (st.distanceM ?? 0), 0)
}

/**
 * Geplande belasting in sRPE-punten (min × RPE) — dezelfde eenheid als de
 * weekbalk en de gerealiseerde load-curve. Stappen op afstand tellen niet mee
 * in de duur en dus niet in de last; die zijn zonder tempo niet te vertalen.
 */
export function structuredLoad(blocks: WorkoutBlock[]): number {
  return Math.round(
    flattenSteps(blocks).reduce(
      (s, st) => s + ((st.durationSec ?? 0) / 60) * targetRpe(st.target),
      0,
    ),
  )
}

/** Eén regel samenvatting, bv. "10 min Z2 · 6× (4 min Z4 / 2 min Z1) · 10 min Z1". */
export function summarize(blocks: WorkoutBlock[]): string {
  const part = (st: WorkoutStep): string => {
    const len = st.durationSec != null
      ? `${Math.round(st.durationSec / 60)} min`
      : st.distanceM != null
        ? `${(st.distanceM / 1000).toFixed(2).replace(/\.?0+$/, '')} km`
        : '—'
    const tgt =
      st.target.type === 'ZONE'
        ? st.target.toZone != null ? `Z${st.target.zone}→Z${st.target.toZone}` : `Z${st.target.zone}`
        : st.target.type === 'RPE'
          ? `RPE ${st.target.min}${st.target.max != null ? `-${st.target.max}` : ''}`
          : 'vrij'
    return `${len} ${tgt}`
  }
  return blocks
    .map(b => (isRepeat(b) ? `${b.times}× (${b.steps.map(part).join(' / ')})` : part(b)))
    .join(' · ')
}

// ── Type-guard op onbekende JSON ──────────────────────────────────────────

/**
 * `cardioParams` is Json: alles wat eruit komt is `unknown`. Deze guard is de
 * enige plek waar we dat vertrouwen, zodat een oud of half record de UI niet
 * onderuit haalt.
 */
export function parseStructured(raw: unknown): StructuredCardio | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1 || !Array.isArray(o.blocks)) return null

  const zone = (v: unknown): HRZone | null =>
    typeof v === 'number' && v >= 1 && v <= 5 ? (Math.round(v) as HRZone) : null

  const target = (v: unknown): StepTarget | null => {
    if (!v || typeof v !== 'object') return null
    const t = v as Record<string, unknown>
    if (t.type === 'ZONE') {
      const z = zone(t.zone)
      if (!z) return null
      const to = zone(t.toZone)
      return to ? { type: 'ZONE', zone: z, toZone: to } : { type: 'ZONE', zone: z }
    }
    if (t.type === 'RPE' && typeof t.min === 'number') {
      return { type: 'RPE', min: t.min, ...(typeof t.max === 'number' ? { max: t.max } : {}) }
    }
    if (t.type === 'FREE') return { type: 'FREE' }
    return null
  }

  const step = (v: unknown): WorkoutStep | null => {
    if (!v || typeof v !== 'object') return null
    const s = v as Record<string, unknown>
    if (typeof s.id !== 'string' || typeof s.kind !== 'string') return null
    if (!(s.kind in STEP_META)) return null
    const tg = target(s.target)
    if (!tg) return null
    return {
      id: s.id,
      kind: s.kind as StepKind,
      ...(typeof s.durationSec === 'number' ? { durationSec: s.durationSec } : {}),
      ...(typeof s.distanceM === 'number' ? { distanceM: s.distanceM } : {}),
      target: tg,
      ...(typeof s.notes === 'string' ? { notes: s.notes } : {}),
    }
  }

  const blocks: WorkoutBlock[] = []
  for (const b of o.blocks) {
    if (b && typeof b === 'object' && (b as Record<string, unknown>).kind === 'REPEAT') {
      const r = b as Record<string, unknown>
      const steps = Array.isArray(r.steps) ? r.steps.map(step).filter((s): s is WorkoutStep => !!s) : []
      if (typeof r.id !== 'string' || steps.length === 0) continue
      blocks.push({ id: r.id, kind: 'REPEAT', times: typeof r.times === 'number' ? r.times : 1, steps })
    } else {
      const s = step(b)
      if (s) blocks.push(s)
    }
  }
  if (blocks.length === 0) return null

  const activity = typeof o.activity === 'string' ? (o.activity as CardioActivityKey) : 'RUNNING'
  return {
    version: 1,
    activity,
    blocks,
    ...(typeof o.notes === 'string' ? { notes: o.notes } : {}),
  }
}

/**
 * Zet een oud plat record om naar blokken, zodat een bestaande cardio-workout
 * niet leeg opent in de bouwer. Eenmalig bij openen; pas bij opslaan wordt de
 * gestructureerde vorm ook echt weggeschreven.
 *
 *   {durationSec, zone}              → één Actief-blok
 *   {intervals: [{work, rest, reps}]} → warming-up? nee: een herhaling
 */
export function fromLegacy(raw: unknown): StructuredCardio | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const activity = (typeof o.activity === 'string' ? o.activity : 'RUNNING') as CardioActivityKey
  const zone = (typeof o.zone === 'number' && o.zone >= 1 && o.zone <= 5 ? Math.round(o.zone) : 2) as HRZone
  const blocks: WorkoutBlock[] = []

  const ivs = Array.isArray(o.intervals) ? o.intervals : []
  for (const iv of ivs) {
    if (!iv || typeof iv !== 'object') continue
    const v = iv as Record<string, unknown>
    const work = typeof v.workDuration === 'number' ? v.workDuration : 0
    const rest = typeof v.restDuration === 'number' ? v.restDuration : 0
    const reps = typeof v.repetitions === 'number' ? Math.max(1, v.repetitions) : 1
    if (work <= 0) continue
    const steps: WorkoutStep[] = [
      { id: `l-${blocks.length}-w`, kind: 'ACTIVE', durationSec: work, target: { type: 'ZONE', zone } },
    ]
    if (rest > 0) {
      steps.push({ id: `l-${blocks.length}-r`, kind: 'RECOVERY', durationSec: rest, target: { type: 'ZONE', zone: 1 } })
    }
    blocks.push({ id: `l-${blocks.length}`, kind: 'REPEAT', times: reps, steps })
  }

  if (blocks.length === 0) {
    const dur = typeof o.durationSec === 'number' ? o.durationSec : 0
    const dist = typeof o.distanceM === 'number' ? o.distanceM : 0
    if (dur <= 0 && dist <= 0) return null
    blocks.push({
      id: 'l-0',
      kind: 'ACTIVE',
      ...(dur > 0 ? { durationSec: dur } : { distanceM: dist }),
      target: { type: 'ZONE', zone },
    })
  }
  return { version: 1, activity, blocks, ...(typeof o.notes === 'string' ? { notes: o.notes } : {}) }
}

/** Blokken uit een cardioParams-blob, ongeacht of die oud of nieuw is. */
export function readWorkout(raw: unknown): StructuredCardio | null {
  return parseStructured(raw) ?? fromLegacy(raw)
}

/**
 * Afgeleide platte velden, zodat lezers die de blokken nog niet kennen
 * (planner-tegel, iOS) een kloppende duur/zone zien i.p.v. niets.
 */
export function legacySummaryFields(w: StructuredCardio): {
  activity: CardioActivityKey
  durationSec: number
  distanceM?: number
  zone?: HRZone
} {
  const dur = totalDurationSec(w.blocks)
  const dist = totalDistanceM(w.blocks)
  // Zwaartepunt: de zone waarin de meeste tijd zit.
  const perZone = new Map<HRZone, number>()
  for (const st of flattenSteps(w.blocks)) {
    if (st.target.type !== 'ZONE') continue
    perZone.set(st.target.zone, (perZone.get(st.target.zone) ?? 0) + (st.durationSec ?? 0))
  }
  let zone: HRZone | undefined
  let best = 0
  for (const [z, sec] of perZone) if (sec > best) { best = sec; zone = z }
  return {
    activity: w.activity,
    durationSec: dur,
    ...(dist > 0 ? { distanceM: dist } : {}),
    ...(zone ? { zone } : {}),
  }
}
