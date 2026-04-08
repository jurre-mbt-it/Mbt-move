import { EXERCISE_CATEGORIES } from './exercise-constants'

export const WORKOUT_TYPES = EXERCISE_CATEGORIES.map(cat => ({
  value: cat.value,
  label: cat.label,
  icon: cat.value === 'STRENGTH' ? '💪' : cat.value === 'MOBILITY' ? '🧘' : cat.value === 'PLYOMETRICS' ? '⚡' : cat.value === 'CARDIO' ? '❤️' : '🎯',
  description: cat.value === 'STRENGTH' ? 'Gewichten & weerstand'
    : cat.value === 'MOBILITY' ? 'Mobiliteit & flexibiliteit'
    : cat.value === 'PLYOMETRICS' ? 'Explosieve kracht'
    : cat.value === 'CARDIO' ? 'Cardio & uithoudingsvermogen'
    : 'Stabiliteit & balans',
  color: cat.value === 'STRENGTH' ? '#4ECDC4'
    : cat.value === 'MOBILITY' ? '#60a5fa'
    : cat.value === 'PLYOMETRICS' ? '#f97316'
    : cat.value === 'CARDIO' ? '#ef4444'
    : '#a78bfa',
}))

export interface WorkoutSet {
  reps: number
  weight: number
  completed: boolean
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  name: string
  category: string
  sets: WorkoutSet[]
}

export interface Workout {
  id: string
  name: string
  type: string
  description: string
  exercises: WorkoutExercise[]
  createdAt: string
  startedAt?: string
  completedAt?: string
  duration?: number // minutes
  feedback?: {
    effort: number     // 1-10
    pain: number       // 1-10
    satisfaction: number // 1-10
    notes: string
  }
}

const STORAGE_KEY = 'mbt-workouts'

export function getSavedWorkouts(): Workout[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

export function saveWorkout(workout: Workout) {
  const all = getSavedWorkouts()
  const idx = all.findIndex(w => w.id === workout.id)
  if (idx >= 0) all[idx] = workout
  else all.unshift(workout)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function deleteWorkout(id: string) {
  const all = getSavedWorkouts().filter(w => w.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}
