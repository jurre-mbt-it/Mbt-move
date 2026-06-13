export type RepUnit = 'reps' | 'sec' | 'min' | 'm'
export type ParamType = 'number' | 'text' | 'select' | 'slider'

export interface ExtraParam {
  id: string
  label: string
  type: ParamType
  value: string | number
  /** Optionele bovengrens — als gezet, wordt het veld als range "value – valueMax" weergegeven. */
  valueMax?: string | number
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

  // Fixed params — sets/reps zijn vereist; setsMax/repsMax zijn optioneel en
  // converteren het veld naar een range (bv. 3-5 sets, 5-10 reps).
  sets: number
  setsMax?: number | null
  reps: number
  repsMax?: number | null
  repUnit: RepUnit
  rest: number          // seconds

  // Dynamic
  extraParams: ExtraParam[]

  // Per-instance notitie voor de patiënt — wordt op ProgramExercise.notes
  // opgeslagen, niet op de globale Exercise. Dus alleen zichtbaar binnen dit
  // specifieke programma; andere therapeuten/patiënten zien deze tekst niet.
  notes?: string | null

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

/** Een educatie-blok ("Leer") gekoppeld aan een dag/week van het programma.
 *  Parallel aan BuilderExercise, maar zonder oefening-parameters. */
export interface BuilderResource {
  uid: string // unieke instance-id in het programma
  resourceId: string
  title: string
  format: 'VIDEO' | 'PDF'
  videoUrl?: string | null
  thumbnailUrl?: string | null
  day: number // 1-based
  week: number // 1-based
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
  resources: BuilderResource[]
  isTemplate: boolean
  tendinopathyMode: boolean
  trackOneRepMax: boolean
  /** Patient mag programma elke dag starten; klaar zodra `weeklyTarget`
   *  is bereikt binnen een rolling week (Mo-Su). */
  flexibleSchedule?: boolean
  weeklyTarget?: number | null
}
