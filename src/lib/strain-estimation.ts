/**
 * Auto-estimation engine for muscle strain (1-5 per muscle group).
 *
 * Given exercise metadata (movement pattern, load type, unilateral,
 * difficulty, body regions) this returns a Record<muscle, load> that
 * serves as a sensible starting point. The therapist can then adjust.
 */

import type { MuscleGroup } from './exercise-constants'

// ── Types ────────────────────────────────────────────────────────────────────

export type LoadType = 'BODYWEIGHT' | 'WEIGHTED' | 'MACHINE' | 'BAND'

export type MovementPattern =
  | 'SQUAT' | 'LUNGE' | 'HINGE'
  | 'PUSH_HORIZONTAL' | 'PUSH_VERTICAL'
  | 'PULL_HORIZONTAL' | 'PULL_VERTICAL'
  | 'HIP_THRUST' | 'CALF_RAISE'
  | 'CORE' | 'ROTATION'
  | 'ISOLATION_UPPER' | 'ISOLATION_LOWER'
  | 'CARRY' | 'FULL_BODY'

export interface StrainEstimationInput {
  movementPattern: MovementPattern | null
  loadType: LoadType
  isUnilateral: boolean
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  category: string
  bodyRegions: string[]
}

// ── Movement → muscle mapping ────────────────────────────────────────────────

type MuscleRole = 'primary' | 'secondary'

const MOVEMENT_MUSCLES: Record<MovementPattern, Array<[MuscleGroup, MuscleRole]>> = {
  SQUAT: [
    ['Quadriceps', 'primary'],
    ['Glutes', 'primary'],
    ['Core', 'secondary'],
    ['Calves', 'secondary'],
    ['Hamstrings', 'secondary'],
  ],
  LUNGE: [
    ['Quadriceps', 'primary'],
    ['Glutes', 'primary'],
    ['Hamstrings', 'secondary'],
    ['Core', 'secondary'],
    ['Calves', 'secondary'],
    ['Hip flexors', 'secondary'],
  ],
  HINGE: [
    ['Hamstrings', 'primary'],
    ['Glutes', 'primary'],
    ['Onderrug', 'secondary'],
    ['Core', 'secondary'],
    ['Bovenrug', 'secondary'],
  ],
  PUSH_HORIZONTAL: [
    ['Borst', 'primary'],
    ['Triceps', 'secondary'],
    ['Schouders anterieur', 'secondary'],
  ],
  PUSH_VERTICAL: [
    ['Schouders anterieur', 'primary'],
    ['Schouders lateraal', 'secondary'],
    ['Triceps', 'secondary'],
    ['Core', 'secondary'],
  ],
  PULL_HORIZONTAL: [
    ['Bovenrug', 'primary'],
    ['Biceps', 'secondary'],
    ['Schouders posterieur', 'secondary'],
    ['Onderarmen', 'secondary'],
  ],
  PULL_VERTICAL: [
    ['Lats', 'primary'],
    ['Biceps', 'secondary'],
    ['Bovenrug', 'secondary'],
    ['Onderarmen', 'secondary'],
  ],
  HIP_THRUST: [
    ['Glutes', 'primary'],
    ['Hamstrings', 'secondary'],
    ['Core', 'secondary'],
  ],
  CALF_RAISE: [
    ['Calves', 'primary'],
  ],
  CORE: [
    ['Core', 'primary'],
    ['Hip flexors', 'secondary'],
    ['Onderrug', 'secondary'],
  ],
  ROTATION: [
    ['Core', 'primary'],
    ['Schouders posterieur', 'secondary'],
    ['Onderrug', 'secondary'],
  ],
  ISOLATION_UPPER: [
    ['Biceps', 'primary'],
    ['Onderarmen', 'secondary'],
  ],
  ISOLATION_LOWER: [
    ['Quadriceps', 'primary'],
    ['Hamstrings', 'secondary'],
  ],
  CARRY: [
    ['Core', 'primary'],
    ['Onderarmen', 'primary'],
    ['Schouders lateraal', 'secondary'],
    ['Bovenrug', 'secondary'],
    ['Glutes', 'secondary'],
  ],
  FULL_BODY: [
    ['Quadriceps', 'primary'],
    ['Glutes', 'primary'],
    ['Hamstrings', 'secondary'],
    ['Core', 'secondary'],
    ['Schouders anterieur', 'secondary'],
    ['Bovenrug', 'secondary'],
  ],
}

// ── Body region → muscle fallback (when no movement pattern is set) ──────────

const BODY_REGION_MUSCLES: Record<string, MuscleGroup[]> = {
  KNEE:      ['Quadriceps', 'Hamstrings', 'Calves'],
  HIP:       ['Glutes', 'Hip flexors', 'Adductoren', 'Abductoren'],
  SHOULDER:  ['Schouders anterieur', 'Schouders lateraal', 'Schouders posterieur', 'Rotatorcuff'],
  BACK:      ['Bovenrug', 'Onderrug', 'Lats'],
  ANKLE:     ['Calves'],
  FOOT:      ['Calves'],
  LUMBAR:    ['Onderrug', 'Core'],
  THORACIC:  ['Bovenrug', 'Core'],
  CERVICAL:  ['Bovenrug'],
  ELBOW:     ['Biceps', 'Triceps', 'Onderarmen'],
  WRIST:     ['Onderarmen'],
  FULL_BODY: ['Quadriceps', 'Glutes', 'Core', 'Bovenrug'],
}

// ── Main estimation function ─────────────────────────────────────────────────

export function estimateMuscleStrain(
  input: StrainEstimationInput
): Partial<Record<MuscleGroup, number>> {
  const result: Partial<Record<string, number>> = {}

  // Step 1: Get base muscles from movement pattern or body regions
  let muscles: Array<[string, MuscleRole]> = []

  if (input.movementPattern && MOVEMENT_MUSCLES[input.movementPattern]) {
    muscles = MOVEMENT_MUSCLES[input.movementPattern]
  } else if (input.bodyRegions.length > 0) {
    // Fallback: derive from body regions
    const seen = new Set<string>()
    for (const region of input.bodyRegions) {
      const regionMuscles = BODY_REGION_MUSCLES[region]
      if (regionMuscles) {
        for (const m of regionMuscles) {
          if (!seen.has(m)) {
            seen.add(m)
            muscles.push([m, seen.size <= 2 ? 'primary' : 'secondary'])
          }
        }
      }
    }
  }

  if (muscles.length === 0) return result

  // Step 2: Assign base loads
  for (const [muscle, role] of muscles) {
    result[muscle] = role === 'primary' ? 3 : 2
  }

  // Step 3: Apply modifiers

  // Load type modifier
  const loadMod = {
    BODYWEIGHT: 0,
    BAND: 0,
    MACHINE: 0.5,
    WEIGHTED: 1,
  }[input.loadType]

  if (loadMod > 0) {
    for (const [muscle, role] of muscles) {
      result[muscle] = (result[muscle] ?? 0) + (role === 'primary' ? loadMod : loadMod * 0.5)
    }
  }

  // Unilateral modifier (more demand per side)
  if (input.isUnilateral) {
    for (const [muscle, role] of muscles) {
      if (role === 'primary') {
        result[muscle] = (result[muscle] ?? 0) + 1
      }
    }
  }

  // Difficulty modifier
  const diffMod = {
    BEGINNER: -0.5,
    INTERMEDIATE: 0,
    ADVANCED: 0.5,
  }[input.difficulty]

  if (diffMod !== 0) {
    for (const muscle of Object.keys(result)) {
      result[muscle] = (result[muscle] ?? 0) + diffMod
    }
  }

  // Category modifier
  if (input.category === 'PLYOMETRICS') {
    // Plyometrics increases strain on lower body muscles
    const lowerMuscles = new Set([
      'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Hip flexors',
      'Adductoren', 'Abductoren',
    ])
    for (const muscle of Object.keys(result)) {
      if (lowerMuscles.has(muscle)) {
        result[muscle] = (result[muscle] ?? 0) + 1
      }
    }
  } else if (input.category === 'MOBILITY' || input.category === 'STABILITY') {
    // Lower intensity for mobility/stability
    for (const muscle of Object.keys(result)) {
      result[muscle] = (result[muscle] ?? 0) - 1
    }
  }

  // Step 4: Clamp all values to 1-5 and round
  const clamped: Partial<Record<MuscleGroup, number>> = {}
  for (const [muscle, val] of Object.entries(result)) {
    const rounded = Math.round(val ?? 0)
    if (rounded >= 1) {
      clamped[muscle as MuscleGroup] = Math.min(5, Math.max(1, rounded))
    }
  }

  return clamped
}

// ── Labels for UI ────────────────────────────────────────────────────────────

export const LOAD_TYPE_OPTIONS: Array<{ value: LoadType; label: string }> = [
  { value: 'BODYWEIGHT', label: 'Lichaamsgewicht' },
  { value: 'WEIGHTED', label: 'Gewicht (dumbbells, barbell)' },
  { value: 'MACHINE', label: 'Machine / kabel' },
  { value: 'BAND', label: 'Weerstandsband' },
]

export const MOVEMENT_PATTERN_OPTIONS: Array<{ value: MovementPattern; label: string; emoji: string }> = [
  { value: 'SQUAT', label: 'Squat', emoji: '🦵' },
  { value: 'LUNGE', label: 'Lunge / uitvalspas', emoji: '🚶' },
  { value: 'HINGE', label: 'Hip hinge / deadlift', emoji: '🏋️' },
  { value: 'PUSH_HORIZONTAL', label: 'Horizontaal duwen (bench press)', emoji: '💪' },
  { value: 'PUSH_VERTICAL', label: 'Verticaal duwen (shoulder press)', emoji: '🙌' },
  { value: 'PULL_HORIZONTAL', label: 'Horizontaal trekken (row)', emoji: '🚣' },
  { value: 'PULL_VERTICAL', label: 'Verticaal trekken (pull-up/lat pull)', emoji: '🧗' },
  { value: 'HIP_THRUST', label: 'Hip thrust / bridge', emoji: '🍑' },
  { value: 'CALF_RAISE', label: 'Kuitoefening', emoji: '🦶' },
  { value: 'CORE', label: 'Core / buik', emoji: '🎯' },
  { value: 'ROTATION', label: 'Rotatie', emoji: '🔄' },
  { value: 'ISOLATION_UPPER', label: 'Isolatie bovenlichaam (curl, extension)', emoji: '💪' },
  { value: 'ISOLATION_LOWER', label: 'Isolatie onderlichaam (leg ext, leg curl)', emoji: '🦵' },
  { value: 'CARRY', label: 'Carry / dragen', emoji: '🧳' },
  { value: 'FULL_BODY', label: 'Full body (clean, snatch, burpee)', emoji: '⚡' },
]
