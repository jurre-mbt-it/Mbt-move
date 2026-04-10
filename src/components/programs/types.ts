export type RepUnit = 'reps' | 'sec' | 'min'
export type ParamType = 'number' | 'text' | 'select' | 'slider'

export interface ExtraParam {
  id: string
  label: string
  type: ParamType
  value: string | number
  unit?: string
  options?: string[]
  min?: number
  max?: number
}

export interface BuilderExercise {
  uid: string           // unique instance id in program
  exerciseId: string
  name: string
  category: string
  difficulty: string
  muscleLoads: Record<string, number>
  easierVariantId: string | null
  harderVariantId: string | null
  videoUrl?: string | null
  trackOneRepMax: boolean

  // Fixed params
  sets: number
  reps: number
  repUnit: RepUnit
  rest: number          // seconds

  // Dynamic
  extraParams: ExtraParam[]

  // Superset
  supersetGroup: string | null  // null | 'A' | 'B' | 'C' …
  supersetOrder: number

  // Selection
  selected: boolean

  // Day/week
  day: number   // 1-based
  week: number  // 1-based
}

export interface CustomParameter {
  id: string
  label: string
  type: ParamType
  unit?: string
  options?: string[]
  min?: number
  max?: number
  defaultValue?: string | number
  isGlobal: boolean
  order: number
}

export interface ProgramState {
  name: string
  description: string
  patientId: string | null
  weeks: number
  daysPerWeek: number
  currentWeek: number
  currentDay: number
  exercises: BuilderExercise[]
  isTemplate: boolean
  tendinopathyMode: boolean
}
