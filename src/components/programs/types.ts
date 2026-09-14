import type { IntensityType } from '@/lib/prescription'
import type { StructuredCardio } from '@/lib/cardio-workout'
import type { ItemGroups } from '@/lib/planner-blocks'

export type RepUnit = 'reps' | 'reps/zijde' | 'sec' | 'sec/zijde' | 'min' | 'm'
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

  // Intensiteits-voorschrift — RPE / %1RM / onder daily max / techniek / tekst.
  // Zie @/lib/prescription en enum IntensityType in schema.prisma.
  intensityType: IntensityType
  intensityMin?: number | null
  intensityMax?: number | null
  intensityText?: string | null

  // Dynamic
  extraParams: ExtraParam[]

  // Per-instance notitie voor de patiënt — wordt op ProgramExercise.notes
  // opgeslagen, niet op de globale Exercise. Dus alleen zichtbaar binnen dit
  // specifieke programma; andere therapeuten/patiënten zien deze tekst niet.
  notes?: string | null

  // Superset
  supersetGroup: string | null  // null | 'A' | 'B' | 'C' …
  supersetOrder: number

  // ── Bloklijst (2026-09-13): een rij is een oefening, notitie of pauze ──
  blockKind?: 'EXERCISE' | 'NOTE' | 'BREAK'
  repsPerSet?: number[] | null
  amrap?: boolean
  phase?: 'WARMUP' | 'COOLDOWN' | null
  isBodyweight?: boolean
  completionOnly?: boolean
  trackMax?: boolean | null
  /** NOTE: de tekst; BREAK: optionele tekst. */
  text?: string | null
  durationSec?: number | null

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
  /** Supersets/circuits per week-dag, sleutel "w1d2" (zie lib/planner-blocks.ts). */
  groups: Record<string, ItemGroups>
  /** Cardio-workout (blokkenbouwer) per week-dag, zelfde sleutel. */
  cardioByDay: Record<string, StructuredCardio>
  isTemplate: boolean
  tendinopathyMode: boolean
  trackOneRepMax: boolean
  /** Tendinopathie-dagdoel: aantal ISO-rondes per dag per oefening. Alleen
   *  betekenisvol als `tendinopathyMode` aan staat. */
  dailyTarget?: number | null
  /** Patient mag programma elke dag starten; klaar zodra `weeklyTarget`
   *  is bereikt binnen een rolling week (Mo-Su). */
  flexibleSchedule?: boolean
  weeklyTarget?: number | null
  /** Looptijd/controle-interval in weken (leeg = standaard 8). Na afloop
   *  krijgt de therapeut een controle-signaal. */
  reviewAfterWeeks?: number | null
}
