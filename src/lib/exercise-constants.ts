export const EXERCISE_CATEGORIES = [
  { value: 'STRENGTH',    label: 'Kracht' },
  { value: 'MOBILITY',    label: 'Mobiliteit' },
  { value: 'PLYOMETRICS', label: 'Plyometrie' },
  { value: 'CARDIO',      label: 'Cardio' },
  { value: 'STABILITY',   label: 'Stabiliteit' },
] as const

export const BODY_REGIONS = [
  { value: 'KNEE',      label: 'Knie' },
  { value: 'SHOULDER',  label: 'Schouder' },
  { value: 'BACK',      label: 'Rug' },
  { value: 'ANKLE',     label: 'Enkel' },
  { value: 'HIP',       label: 'Heup' },
  { value: 'FULL_BODY', label: 'Full Body' },
  { value: 'CERVICAL',  label: 'Cervicaal' },
  { value: 'THORACIC',  label: 'Thoracaal' },
  { value: 'LUMBAR',    label: 'Lumbaal' },
  { value: 'ELBOW',     label: 'Elleboog' },
  { value: 'WRIST',     label: 'Pols' },
  { value: 'FOOT',      label: 'Voet' },
] as const

export const DIFFICULTIES = [
  { value: 'BEGINNER',     label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED',     label: 'Advanced' },
] as const

// De 12 spierregio's — één vocabulaire voor tagging, muscleLoads-sleutels,
// het fatigue-model (τ per regio) en de status-lijst. Vervangt de oude 22
// granulaire MUSCLE_GROUPS (zie docs/plan-muscle-fatigue-v2.md §1.0).
// Volgorde = top-to-bottom voor de UI.
export const MUSCLE_REGIONS = [
  'Nek',
  'Schouders',
  'Borst',
  'Armen',
  'Bovenrug',
  'Core',
  'Onderrug',
  'Glutes',
  'Quadriceps',
  'Hamstrings',
  'Onderbeen',
  'Voeten',
] as const

export type MuscleRegion = (typeof MUSCLE_REGIONS)[number]

// Gelijk aan `--p-data-*` in globals.css. Deze waarden komen in de database
// terecht (kleur van een collectie), dus het blijven kale hexcodes.
export const COLLECTION_COLORS = [
  '#9FCEC9', // mint
  '#5FD08A', // groen
  '#F5B942', // goud
  '#E87A55', // brand-oranje
  '#F0796C', // koraal
  '#7FB0D8', // staalblauw
  '#45A8A2', // diep turquoise
  '#D9C08A', // zand
] as const

// MOCK_EXERCISES verwijderd — alle oefeningen komen nu uit de database via tRPC
