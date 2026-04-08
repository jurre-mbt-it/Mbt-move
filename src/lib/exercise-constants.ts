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

// Mock exercises for UI without Supabase
export const MOCK_EXERCISES = [
  {
    id: '1',
    name: 'Bulgarian Split Squat',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'INTERMEDIATE',
    mediaType: 'YOUTUBE',
    videoUrl: 'https://www.youtube.com/watch?v=2C-uNgKwPLE',
    thumbnailUrl: null,
    description: 'Unilaterale squatvariatie met achterste been op een bank.',
    tags: ['kracht', 'benen', 'unilateraal'],
    instructions: ['Sta op 60-70 cm van de bank', 'Plaats de wreef van het achterste been op de bank', 'Zak recht naar beneden terwijl de knie over de teen blijft'],
    muscleLoads: { Quadriceps: 5, Glutes: 4, Hamstrings: 2, Core: 2 },
    isPublic: true,
    createdById: 'demo',
    createdAt: new Date('2025-01-15'),
  },
  {
    id: '2',
    name: 'Nordic Hamstring Curl',
    category: 'STRENGTH',
    bodyRegion: ['KNEE', 'BACK'],
    difficulty: 'ADVANCED',
    mediaType: 'YOUTUBE',
    videoUrl: 'https://www.youtube.com/watch?v=3eUkh7cRmqY',
    thumbnailUrl: null,
    description: 'Excentrische hamstrings oefening voor krachtontwikkeling en blessurepreventie.',
    tags: ['hamstrings', 'excentrisch', 'preventie'],
    instructions: ['Kniel op een mat met enkels gefixeerd', 'Laat je romp langzaam naar voren zakken', 'Gebruik je handen om de val op te vangen', 'Druk terug naar de startpositie'],
    muscleLoads: { Hamstrings: 5, Glutes: 3, Core: 2 },
    isPublic: true,
    createdById: 'demo',
    createdAt: new Date('2025-01-20'),
  },
  {
    id: '3',
    name: 'Hip 90/90 Mobiliteit',
    category: 'MOBILITY',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    mediaType: 'YOUTUBE',
    videoUrl: 'https://www.youtube.com/watch?v=Rni2oLXeXKg',
    thumbnailUrl: null,
    description: 'Heup mobilisatie in 90/90 positie voor interne en externe rotatie.',
    tags: ['heup', 'mobiliteit', 'rotatie'],
    instructions: ['Ga zitten met beide benen in 90° hoek', 'Houd de romp rechtop', 'Leun naar voren over het voorste been'],
    muscleLoads: { 'Hip flexors': 3, Adductoren: 3, 'Rotatorcuff': 1 },
    isPublic: true,
    createdById: 'demo',
    createdAt: new Date('2025-02-01'),
  },
  {
    id: '4',
    name: 'Single Leg Deadlift',
    category: 'STABILITY',
    bodyRegion: ['HIP', 'BACK', 'ANKLE'],
    difficulty: 'INTERMEDIATE',
    mediaType: 'YOUTUBE',
    videoUrl: 'https://www.youtube.com/watch?v=5PKi8DlxBbo',
    thumbnailUrl: null,
    description: 'Balans en stabiliteit oefening met focus op heupscharnieren.',
    tags: ['balans', 'stabiliteit', 'unilateraal'],
    instructions: ['Sta op één been', 'Hinge vanuit de heup naar voren', 'Houd de rug recht en de core actief'],
    muscleLoads: { Hamstrings: 4, Glutes: 4, Core: 3, Calves: 2 },
    isPublic: true,
    createdById: 'demo',
    createdAt: new Date('2025-02-10'),
  },
  {
    id: '5',
    name: 'Box Jump',
    category: 'PLYOMETRICS',
    bodyRegion: ['KNEE', 'HIP', 'ANKLE'],
    difficulty: 'INTERMEDIATE',
    mediaType: 'YOUTUBE',
    videoUrl: 'https://www.youtube.com/watch?v=52jOmGGMPgM',
    thumbnailUrl: null,
    description: 'Explosieve springoefening voor krachtontwikkeling en atletisch vermogen.',
    tags: ['explosief', 'plyometrie', 'springen'],
    instructions: ['Sta voor de box met voeten schouderbreed', 'Zak door de knieën in een kwart squat', 'Spring explosief omhoog en land zacht'],
    muscleLoads: { Quadriceps: 4, Glutes: 4, Calves: 4, Core: 2 },
    isPublic: true,
    createdById: 'demo',
    createdAt: new Date('2025-02-15'),
  },
  {
    id: '6',
    name: 'Schouder Externe Rotatie (band)',
    category: 'STABILITY',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    mediaType: 'YOUTUBE',
    videoUrl: 'https://www.youtube.com/watch?v=wNe-HFPyLGs',
    thumbnailUrl: null,
    description: 'Rotatorcuff versterking voor schouder stabiliteit.',
    tags: ['schouder', 'rotatorcuff', 'band'],
    instructions: ['Houd de elleboog 90° gebogen tegen het lichaam', 'Roteer de onderarm naar buiten tegen weerstand', 'Keer gecontroleerd terug'],
    muscleLoads: { Rotatorcuff: 5, 'Schouders posterieur': 3 },
    isPublic: true,
    createdById: 'demo',
    createdAt: new Date('2025-03-01'),
  },
]

export type MockExercise = (typeof MOCK_EXERCISES)[number]
