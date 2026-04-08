/**
 * Recovery Estimation Engine
 *
 * Based on exercise physiology principles from NSCA, ACSM, and
 * supercompensation theory. Estimates per-muscle-group recovery
 * time based on training parameters.
 *
 * Sources:
 * - NSCA Essentials of Strength Training & Conditioning
 * - Schoenfeld (2010) — protein synthesis windows
 * - Proske & Morgan (2001) — eccentric damage & DOMS
 * - ACSM Position Stand on Resistance Training
 */

import type { MuscleGroup } from './exercise-constants'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExerciseSession {
  exerciseId: string
  muscleLoads: Record<string, number>  // muscle → load (1-5)
  sets: number
  reps: number
  repUnit: string        // 'reps' | 'sec' | 'min'
  completedAt: Date      // when the session was finished
  painLevel?: number     // 0-10
  rpe?: number           // 1-10
}

export type RecoveryStatus = 'recovered' | 'recovering' | 'fatigued'

export interface MuscleRecoveryState {
  muscle: MuscleGroup
  /** 0 = fully fatigued, 100 = fully recovered */
  recoveryPercent: number
  /** Estimated hours until full recovery */
  hoursRemaining: number
  /** Hours since last stimulus */
  hoursSinceTraining: number
  /** Total recovery time estimated (hours) */
  totalRecoveryHours: number
  status: RecoveryStatus
}

// ── Training zone classification ─────────────────────────────────────────────

type TrainingZone = 'strength' | 'hypertrophy' | 'strength_endurance' | 'endurance'

function classifyTrainingZone(reps: number, repUnit: string): TrainingZone {
  // Time-based exercises (sec/min) are typically endurance/stability
  if (repUnit === 'sec') {
    return reps <= 20 ? 'strength' : reps <= 45 ? 'hypertrophy' : 'endurance'
  }
  if (repUnit === 'min') return 'endurance'

  // Rep-based classification
  if (reps <= 5) return 'strength'
  if (reps <= 12) return 'hypertrophy'
  if (reps <= 20) return 'strength_endurance'
  return 'endurance'
}

// Base recovery hours per training zone
const ZONE_RECOVERY_HOURS: Record<TrainingZone, number> = {
  strength: 60,            // 48-72h → midpoint 60
  hypertrophy: 42,         // 36-48h → midpoint 42
  strength_endurance: 30,  // 24-36h → midpoint 30
  endurance: 18,           // 12-24h → midpoint 18
}

// ── Recovery modifiers ───────────────────────────────────────────────────────

interface RecoveryModifiers {
  /** Volume modifier: more sets = longer recovery */
  volumeMultiplier: number
  /** Intensity modifier: load level 1-5 */
  intensityMultiplier: number
  /** Pain modifier: higher pain = possibly more damage */
  painAddHours: number
  /** RPE modifier: higher RPE = more fatigue */
  rpeMultiplier: number
}

function calculateModifiers(
  sets: number,
  loadLevel: number,
  painLevel?: number,
  rpe?: number,
): RecoveryModifiers {
  // Volume: baseline at 3 sets. Each extra set adds ~8% recovery time
  const volumeMultiplier = 1 + ((sets - 3) * 0.08)

  // Intensity: load level 1-5 maps to 0.7x - 1.3x
  const intensityMultiplier = 0.7 + ((loadLevel - 1) * 0.15)

  // Pain: high pain may indicate more tissue stress
  const painAddHours = painLevel && painLevel > 5 ? (painLevel - 5) * 2 : 0

  // RPE: RPE 10 adds 20% recovery, RPE 5 baseline
  const rpeMultiplier = rpe ? 1 + ((rpe - 5) * 0.04) : 1

  return { volumeMultiplier, intensityMultiplier, painAddHours, rpeMultiplier }
}

// ── Main recovery calculation ────────────────────────────────────────────────

/**
 * Calculate recovery hours for a specific muscle from one exercise session
 */
function calculateMuscleRecoveryHours(
  loadLevel: number,
  sets: number,
  reps: number,
  repUnit: string,
  painLevel?: number,
  rpe?: number,
): number {
  const zone = classifyTrainingZone(reps, repUnit)
  const baseHours = ZONE_RECOVERY_HOURS[zone]
  const mods = calculateModifiers(sets, loadLevel, painLevel, rpe)

  const total = baseHours
    * mods.volumeMultiplier
    * mods.intensityMultiplier
    * mods.rpeMultiplier
    + mods.painAddHours

  // Clamp between 8h and 96h
  return Math.min(96, Math.max(8, Math.round(total)))
}

/**
 * Given a list of exercise sessions, calculate the current recovery
 * state for every trained muscle group.
 */
export function calculateRecoveryStates(
  sessions: ExerciseSession[],
  now: Date = new Date(),
): MuscleRecoveryState[] {
  // Aggregate per muscle: take the MOST RECENT and MOST DEMANDING stimulus
  const muscleData: Record<string, {
    totalRecoveryHours: number
    completedAt: Date
  }> = {}

  for (const session of sessions) {
    for (const [muscle, load] of Object.entries(session.muscleLoads)) {
      if (load <= 0) continue

      const recoveryHours = calculateMuscleRecoveryHours(
        load,
        session.sets,
        session.reps,
        session.repUnit,
        session.painLevel,
        session.rpe,
      )

      const existing = muscleData[muscle]
      if (!existing || session.completedAt > existing.completedAt) {
        // More recent session takes priority
        muscleData[muscle] = { totalRecoveryHours: recoveryHours, completedAt: session.completedAt }
      } else if (
        session.completedAt.getTime() === existing.completedAt.getTime() &&
        recoveryHours > existing.totalRecoveryHours
      ) {
        // Same session, take the higher recovery demand
        muscleData[muscle] = { totalRecoveryHours: recoveryHours, completedAt: session.completedAt }
      }
    }
  }

  // Calculate current state
  const states: MuscleRecoveryState[] = []

  for (const [muscle, data] of Object.entries(muscleData)) {
    const hoursSince = (now.getTime() - data.completedAt.getTime()) / (1000 * 60 * 60)
    const hoursRemaining = Math.max(0, data.totalRecoveryHours - hoursSince)
    const recoveryPercent = Math.min(100, Math.round((hoursSince / data.totalRecoveryHours) * 100))

    let status: RecoveryStatus
    if (recoveryPercent >= 85) {
      status = 'recovered'    // Green: ready to train
    } else if (recoveryPercent >= 45) {
      status = 'recovering'   // Orange: partially recovered
    } else {
      status = 'fatigued'     // Red: still fatigued
    }

    states.push({
      muscle: muscle as MuscleGroup,
      recoveryPercent,
      hoursRemaining: Math.round(hoursRemaining),
      hoursSinceTraining: Math.round(hoursSince),
      totalRecoveryHours: data.totalRecoveryHours,
      status,
    })
  }

  return states.sort((a, b) => a.recoveryPercent - b.recoveryPercent)
}

// ── Color helpers ────────────────────────────────────────────────────────────

export function getRecoveryColor(percent: number): string {
  if (percent >= 85) return '#14B8A6'   // green-500
  if (percent >= 60) return '#84cc16'   // lime-500
  if (percent >= 45) return '#f59e0b'   // amber-500
  if (percent >= 25) return '#f97316'   // orange-500
  return '#ef4444'                       // red-500
}

export function getRecoveryLabel(percent: number): string {
  if (percent >= 85) return 'Hersteld'
  if (percent >= 60) return 'Bijna hersteld'
  if (percent >= 45) return 'Herstellende'
  if (percent >= 25) return 'Vermoeid'
  return 'Zwaar belast'
}

export function formatHoursRemaining(hours: number): string {
  if (hours <= 0) return 'Hersteld'
  if (hours < 1) return '<1u'
  if (hours < 24) return `${hours}u`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (remainingHours === 0) return `${days}d`
  return `${days}d ${remainingHours}u`
}
