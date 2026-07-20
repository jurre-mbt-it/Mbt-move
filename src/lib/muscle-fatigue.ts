/**
 * Muscle Fatigue Engine v2 — science-backed, cardio-aware.
 *
 * One shared per-region *dose* function feeding an accumulating
 * exponential-decay fatigue model. Both strength (sessionLog + exerciseLogs)
 * and cardio (cardioLog) contribute to the same per-region fatigue load L,
 * so a long run loads the legs and two hard quad sessions in a week stack.
 *
 * Scientific basis (see docs/plan-muscle-fatigue-v2.md §7):
 * - Proximity to failure / RIR drives fatigue — Zourdos 2016; Refalo 2023.
 * - Eccentric & long-muscle-length damage → slowest recovery, most DOMS —
 *   Proske & Morgan 2001; Nosaka & Newton 2002.
 * - Isometrics cause minimal muscle damage — supports near-zero ISO
 *   contribution and the tendinopathy daily-ISO flow.
 * - Recovery is exponential/front-loaded, muscle-size dependent —
 *   McLester 2003; supercompensation theory.
 *
 * Pure functions, no DB, no DOM. Portable to the iOS app later (section 8).
 */

import { MUSCLE_REGIONS, type MuscleRegion } from './exercise-constants'

// ── Public types ─────────────────────────────────────────────────────────────

export type MuscleFatigueStatus = 'recovered' | 'recovering' | 'fatigued'

export interface StrengthStimulus {
  muscleLoads: Record<string, number>
  sets: number
  reps: number
  repUnit: string
  completedAt: Date
  rpe?: number
  painLevel?: number
  // exercise metadata for damageFactor:
  movementPattern?: string | null
  loadType?: string | null
  category?: string | null
}

export interface CardioStimulus {
  activity: string // CardioActivity
  durationMin: number
  completedAt: Date
  rpe?: number
  hrZone?: number | null // optional; if present prefer over default
}

export interface MuscleFatigueState {
  muscle: MuscleRegion
  recoveryPercent: number // 0-100
  fatigueLoad: number // raw L, for debugging/tooltips
  status: MuscleFatigueStatus
  hoursRemaining: number // estimated hours until recoveryPercent hits ~95
}

// ── Model constants (docs/plan-muscle-fatigue-v2.md §1) ──────────────────────

/** L_FULL — the fatigue load that maps to 0% recovery. §1.5 */
const L_FULL = 18

/** Recovery time constant τ_base per region (hours), muscle-size based. §1.2 */
export const MUSCLE_TAU_BASE: Record<MuscleRegion, number> = {
  Nek: 24,
  Schouders: 28,
  Borst: 40,
  Armen: 24,
  Bovenrug: 40,
  Core: 28,
  Onderrug: 36,
  Glutes: 40,
  Quadriceps: 40,
  Hamstrings: 40,
  Onderbeen: 28,
  Voeten: 18,
}

/** movementPattern → base damage factor. §1.3 */
const MOVEMENT_DAMAGE: Record<string, number> = {
  HINGE: 1.3,
  LUNGE: 1.25,
  SQUAT: 1.15,
  ISOLATION_LOWER: 1.1,
  HIP_THRUST: 1.0,
  PUSH_HORIZONTAL: 1.0,
  PUSH_VERTICAL: 1.0,
  PULL_HORIZONTAL: 1.0,
  PULL_VERTICAL: 1.0,
  CALF_RAISE: 1.05,
  ROTATION: 0.95,
  ISOLATION_UPPER: 1.0,
  CARRY: 0.9,
  CORE: 0.9,
  FULL_BODY: 1.05,
}

/** cardio activity → damage factor. §1.4 */
const CARDIO_DAMAGE: Record<string, number> = {
  RUNNING: 1.3,
  STAIRCLIMBER: 1.0,
  ROWING: 0.9,
  WALKING: 0.8,
  CROSSTRAINER: 0.7,
  SKIERG: 0.7,
  CYCLING: 0.6,
  WATTBIKE: 0.6,
  ASSAULT_BIKE: 0.6,
  SWIMMING: 0.6,
  OTHER: 0.7,
}

/** cardio activity → region profile (involvement-equivalent weights). §1.4 */
const CARDIO_PROFILES: Record<string, Partial<Record<MuscleRegion, number>>> = {
  RUNNING: { Quadriceps: 2, Hamstrings: 2, Onderbeen: 2.5, Glutes: 1.5, Core: 1 },
  WALKING: { Quadriceps: 1, Onderbeen: 1, Glutes: 1, Hamstrings: 0.5 },
  CYCLING: { Quadriceps: 2.5, Glutes: 1.5, Onderbeen: 1, Hamstrings: 1 },
  WATTBIKE: { Quadriceps: 2.5, Glutes: 1.5, Onderbeen: 1, Hamstrings: 1 },
  ASSAULT_BIKE: { Quadriceps: 2, Glutes: 1.5, Onderbeen: 1, Hamstrings: 1, Armen: 0.5, Schouders: 0.5 },
  CROSSTRAINER: { Quadriceps: 2, Glutes: 1.5, Hamstrings: 1, Onderbeen: 1 },
  ROWING: { Quadriceps: 2, Glutes: 1.5, Hamstrings: 1, Bovenrug: 1.5, Core: 1, Armen: 0.5 },
  SKIERG: { Bovenrug: 1.5, Armen: 1, Core: 1.5 },
  STAIRCLIMBER: { Quadriceps: 2, Glutes: 2, Onderbeen: 1.5, Hamstrings: 1 },
  SWIMMING: { Bovenrug: 1.5, Schouders: 1, Core: 1 },
  OTHER: { Quadriceps: 1, Core: 0.5 },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

const HOUR_MS = 1000 * 60 * 60

/**
 * intensityFactor — proximity to failure is the main fatigue driver. §1.1
 * Prefer RPE (clamped), fall back to rep zone.
 */
function intensityFromRpe(rpe: number): number {
  return clamp(0.55 + 0.09 * (rpe - 5), 0.4, 1.3)
}

type TrainingZone = 'strength' | 'hypertrophy' | 'strength_endurance' | 'endurance'

function classifyTrainingZone(reps: number, repUnit: string): TrainingZone {
  if (repUnit === 'sec') {
    return reps <= 20 ? 'strength' : reps <= 45 ? 'hypertrophy' : 'endurance'
  }
  if (repUnit === 'min') return 'endurance'
  if (reps <= 5) return 'strength'
  if (reps <= 12) return 'hypertrophy'
  if (reps <= 20) return 'strength_endurance'
  return 'endurance'
}

const ZONE_INTENSITY: Record<TrainingZone, number> = {
  strength: 0.95,
  hypertrophy: 0.85,
  strength_endurance: 0.7,
  endurance: 0.55,
}

function strengthIntensityFactor(s: {
  rpe?: number
  reps: number
  repUnit: string
}): number {
  if (s.rpe != null) return intensityFromRpe(s.rpe)
  return ZONE_INTENSITY[classifyTrainingZone(s.reps, s.repUnit)]
}

/**
 * damageFactor — eccentric / long-muscle-length damage drives the slowest
 * recovery and most DOMS. Derived from Exercise metadata, no DB column. §1.3
 * Eccentric contractions at long muscle length cause the most damage and
 * slowest recovery; isometrics cause the least. This is why an RDL costs more
 * recovery per set than a leg press, and why the daily tendinopathy ISO's
 * barely register.
 */
export function damageFactor(input: {
  movementPattern?: string | null
  loadType?: string | null
  category?: string | null
  repUnit?: string
}): number {
  let d = input.movementPattern
    ? MOVEMENT_DAMAGE[input.movementPattern] ?? 1.0
    : 1.0

  if (input.repUnit === 'sec') d *= 0.55 // isometric hold — minimal damage
  if (input.category === 'PLYOMETRICS') d *= 1.2 // high eccentric + impact
  if (input.loadType === 'BODYWEIGHT') d *= 0.9
  // category MOBILITY → dose already 0 upstream (muscleLoadsRecord returns {})

  return clamp(d, 0.5, 1.6)
}

/** τ for a dose, stretched by damage. §1.2 */
export function tauFor(muscle: string, damage: number): number {
  const base = MUSCLE_TAU_BASE[muscle as MuscleRegion]
  // Regions outside the closed set should never occur; guard defensively.
  const tauBase = base ?? 28
  return tauBase * (0.8 + 0.2 * damage)
}

// ── Dose functions ───────────────────────────────────────────────────────────

/** Per-region strength dose for one exercise-instance. §1.1 */
export function strengthMuscleDose(s: StrengthStimulus, muscle: string): number {
  const involvement = s.muscleLoads[muscle] ?? 0
  if (involvement <= 0) return 0

  const sets = s.sets ?? 3
  const intensity = strengthIntensityFactor(s)
  const damage = damageFactor(s)
  const painFactor =
    s.painLevel != null && s.painLevel > 5 ? 1 + (s.painLevel - 5) * 0.08 : 1

  return involvement * sets * intensity * damage * painFactor
}

/** Per-region cardio doses for one CardioLog. §1.4 */
export function cardioMuscleDoses(c: CardioStimulus): Record<string, number> {
  const profile = CARDIO_PROFILES[c.activity] ?? CARDIO_PROFILES.OTHER
  const durationFactor = clamp(c.durationMin / 30, 0.3, 3)
  const intensity = c.rpe != null ? intensityFromRpe(c.rpe) : 0.6
  const cardioDamage = CARDIO_DAMAGE[c.activity] ?? CARDIO_DAMAGE.OTHER

  const doses: Record<string, number> = {}
  for (const [muscle, weight] of Object.entries(profile)) {
    if (!weight) continue
    doses[muscle] = weight * durationFactor * intensity * cardioDamage
  }
  return doses
}

// ── Accumulation + recovery percent ──────────────────────────────────────────

interface Impulse {
  dose: number
  completedAt: Date
  damage: number
}

function recoveryPercentFromLoad(load: number): number {
  return clamp(100 * (1 - load / L_FULL), 0, 100)
}

function statusFor(percent: number): MuscleFatigueStatus {
  if (percent >= 80) return 'recovered'
  if (percent >= 45) return 'recovering'
  return 'fatigued'
}

/**
 * Estimate hours until this muscle reaches ~95% recovered given its current
 * impulses. Solved numerically off the dominant (slowest) impulse; good enough
 * for a rough "~1d 4u" ETA on the status list.
 */
function estimateHoursRemaining(muscle: string, impulses: Impulse[], now: Date): number {
  const targetLoad = L_FULL * 0.05 // 95% recovered
  let currentLoad = 0
  for (const imp of impulses) {
    const dtH = (now.getTime() - imp.completedAt.getTime()) / HOUR_MS
    currentLoad += imp.dose * Math.exp(-dtH / tauFor(muscle, imp.damage))
  }
  if (currentLoad <= targetLoad) return 0

  // Walk forward in 1h steps up to two weeks.
  for (let h = 1; h <= 336; h++) {
    const future = new Date(now.getTime() + h * HOUR_MS)
    let load = 0
    for (const imp of impulses) {
      const dtH = (future.getTime() - imp.completedAt.getTime()) / HOUR_MS
      load += imp.dose * Math.exp(-dtH / tauFor(muscle, imp.damage))
    }
    if (load <= targetLoad) return h
  }
  return 336
}

/**
 * Compute current per-region fatigue from all strength + cardio stimuli.
 * Only regions with any stimulus in the input window are returned.
 */
export function computeMuscleFatigue(
  strength: StrengthStimulus[],
  cardio: CardioStimulus[],
  now: Date = new Date(),
): MuscleFatigueState[] {
  // region → list of impulses (dose + when + damage-for-τ)
  const byMuscle = new Map<string, Impulse[]>()

  const add = (muscle: string, dose: number, completedAt: Date, damage: number) => {
    if (dose <= 0) return
    const list = byMuscle.get(muscle) ?? []
    list.push({ dose, completedAt, damage })
    byMuscle.set(muscle, list)
  }

  for (const s of strength) {
    const damage = damageFactor(s)
    for (const muscle of Object.keys(s.muscleLoads)) {
      add(muscle, strengthMuscleDose(s, muscle), s.completedAt, damage)
    }
  }

  for (const c of cardio) {
    const cardioDamage = CARDIO_DAMAGE[c.activity] ?? CARDIO_DAMAGE.OTHER
    const doses = cardioMuscleDoses(c)
    for (const [muscle, dose] of Object.entries(doses)) {
      add(muscle, dose, c.completedAt, cardioDamage)
    }
  }

  const states: MuscleFatigueState[] = []
  for (const [muscle, impulses] of byMuscle.entries()) {
    // Ignore regions outside the closed set (defensive; e.g. stale data).
    if (!(muscle in MUSCLE_TAU_BASE)) continue

    let load = 0
    for (const imp of impulses) {
      const dtH = (now.getTime() - imp.completedAt.getTime()) / HOUR_MS
      load += imp.dose * Math.exp(-dtH / tauFor(muscle, imp.damage))
    }
    const recoveryPercent = Math.round(recoveryPercentFromLoad(load))
    states.push({
      muscle: muscle as MuscleRegion,
      recoveryPercent,
      fatigueLoad: load,
      status: statusFor(recoveryPercent),
      hoursRemaining: estimateHoursRemaining(muscle, impulses, now),
    })
  }

  // Worst first (lowest recoveryPercent at top).
  return states.sort((a, b) => a.recoveryPercent - b.recoveryPercent)
}

// ── Colour + label helpers (docs §6, iOS brand tokens) ───────────────────────

/**
 * recoveryPercent → colour. Aligned to iOS brand tokens
 * (mbt-gym-mobile/constants/theme.ts) so web and iOS read identically.
 */
export function getMuscleFatigueColor(p: number): string {
  if (p >= 80) return '#5FD08A' // P.green — recovered
  if (p >= 55) return '#F5B942' // P.gold — recovering
  if (p >= 30) return '#E87A55' // accent orange (P.lime) — loaded
  return '#F87171' // P.danger — heavily loaded
}

export function getMuscleFatigueLabel(p: number): string {
  if (p >= 80) return 'Hersteld'
  if (p >= 55) return 'Herstellende'
  if (p >= 30) return 'Vermoeid'
  return 'Zwaar belast'
}

/** "~1d 4u" style ETA. */
export function formatHoursRemaining(hours: number): string {
  if (hours <= 0) return 'Hersteld'
  if (hours < 1) return '<1u'
  if (hours < 24) return `~${Math.round(hours)}u`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.round(hours % 24)
  if (remainingHours === 0) return `~${days}d`
  return `~${days}d ${remainingHours}u`
}

export { MUSCLE_REGIONS }
export type { MuscleRegion }
