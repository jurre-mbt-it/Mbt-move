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

export const MUSCLE_GROUPS = [
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Onderrug',
  'Bovenrug',
  'Lats',
  'Borst',
  'Schouders anterieur',
  'Schouders lateraal',
  'Schouders posterieur',
  'Biceps',
  'Triceps',
  'Onderarmen',
  'Hip flexors',
  'Adductoren',
  'Abductoren',
  'Rotatorcuff',
  'Diepe halsflexoren',
  'Tibialis anterior',
  'Intrinsieke voetspieren',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const COLLECTION_COLORS = [
  '#4ECDC4', // MBT groen
  '#60a5fa', // blauw
  '#f59e0b', // amber
  '#a78bfa', // paars
  '#f87171', // rood
  '#34d399', // emerald
  '#fb923c', // oranje
  '#e879f9', // fuchsia
] as const

// MOCK_EXERCISES verwijderd — alle oefeningen komen nu uit de database via tRPC
