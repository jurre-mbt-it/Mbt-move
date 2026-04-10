/**
 * Cardio module constants voor MBT Move
 * Activiteiten, protocollen, HR zones, walk-run templates
 */

// ── Activiteiten ─────────────────────────────────────────────────────────────

export type CardioActivityKey =
  | 'RUNNING' | 'CYCLING' | 'ROWING' | 'SWIMMING' | 'CROSSTRAINER'
  | 'WALKING' | 'SKIERG' | 'ASSAULT_BIKE' | 'WATTBIKE' | 'STAIRCLIMBER' | 'OTHER'

export const CARDIO_ACTIVITIES: Record<CardioActivityKey, {
  label: string
  icon: string
  unit: 'km' | 'min' | 'kcal'
  description: string
}> = {
  RUNNING:       { label: 'Hardlopen',      icon: '🏃', unit: 'km',  description: 'Buitenshuis of op de loopband' },
  CYCLING:       { label: 'Fietsen',        icon: '🚴', unit: 'km',  description: 'Buiten- of indoorfiets' },
  ROWING:        { label: 'Roeien',         icon: '🚣', unit: 'km',  description: 'Roeiergometer' },
  SWIMMING:      { label: 'Zwemmen',        icon: '🏊', unit: 'km',  description: 'Baanzwemmen' },
  CROSSTRAINER:  { label: 'Crosstrainer',   icon: '⚡', unit: 'min', description: 'Elliptische trainer' },
  WALKING:       { label: 'Wandelen',       icon: '🚶', unit: 'km',  description: 'Wandelen / Nordic walking' },
  SKIERG:        { label: 'SkiErg',         icon: '🎿', unit: 'min', description: 'Concept2 SkiErg' },
  ASSAULT_BIKE:  { label: 'Assault Bike',   icon: '💨', unit: 'min', description: 'Air bike / Echo bike' },
  WATTBIKE:      { label: 'Wattbike',       icon: '⚙️', unit: 'min', description: 'Wattbike / vermogensfiets' },
  STAIRCLIMBER:  { label: 'Stairclimber',   icon: '🪜', unit: 'min', description: 'Trapklimmer / stepmill' },
  OTHER:         { label: 'Overig',         icon: '🏋️', unit: 'min', description: 'Andere activiteit' },
}

// ── Protocollen ───────────────────────────────────────────────────────────────

export type CardioProtocolKey =
  | 'STEADY_STATE' | 'INTERVALS' | 'TEMPO' | 'FARTLEK'
  | 'ZONE_TRAINING' | 'THRESHOLD' | 'LONG_SLOW_DISTANCE' | 'WALK_RUN'

export const CARDIO_PROTOCOLS: Record<CardioProtocolKey, {
  label: string
  description: string
  hasIntervals: boolean
  color: string
}> = {
  STEADY_STATE:       { label: 'Steady State',        description: 'Constante intensiteit gedurende de hele training', hasIntervals: false, color: '#3ECF6A' },
  INTERVALS:          { label: 'Intervallen',          description: 'Afwisseling van hoge en lage intensiteit', hasIntervals: true,  color: '#f59e0b' },
  TEMPO:              { label: 'Tempo',                description: 'Comfortabel hard tempo, net onder drempelwaarde', hasIntervals: false, color: '#6366f1' },
  FARTLEK:            { label: 'Fartlek',              description: 'Vrije intervallen op gevoel, wisselend tempo', hasIntervals: false, color: '#ec4899' },
  ZONE_TRAINING:      { label: 'Zontraining',          description: 'Training in een specifieke hartslagzone', hasIntervals: false, color: '#14b8a6' },
  THRESHOLD:          { label: 'Drempeltraining',      description: 'Training op of net onder de anaerobe drempel', hasIntervals: false, color: '#ef4444' },
  LONG_SLOW_DISTANCE: { label: 'Lange Duurloop (LSD)', description: 'Lage intensiteit, lange duur — opbouw aerobe basis', hasIntervals: false, color: '#84cc16' },
  WALK_RUN:           { label: 'Walk-Run',             description: 'Afwisseling lopen en wandelen — return-to-running', hasIntervals: true,  color: '#0ea5e9' },
}

// ── Hartslagzones ─────────────────────────────────────────────────────────────

export type HRZone = 1 | 2 | 3 | 4 | 5

export const HR_ZONES: Record<HRZone, {
  label: string
  description: string
  minPct: number
  maxPct: number
  color: string
  bg: string
  rpeFeel: string
}> = {
  1: { label: 'Zone 1 — Herstel',         description: 'Actief herstel, zeer lage intensiteit',  minPct: 50, maxPct: 60, color: '#3b82f6', bg: '#dbeafe', rpeFeel: 'RPE 1-2 — Zeer licht' },
  2: { label: 'Zone 2 — Aerobe basis',    description: 'Vetverbranding, aerobe opbouw',          minPct: 60, maxPct: 70, color: '#22c55e', bg: '#dcfce7', rpeFeel: 'RPE 3-4 — Licht' },
  3: { label: 'Zone 3 — Tempo',           description: 'Comfortabel intensief, aerobe drempel',  minPct: 70, maxPct: 80, color: '#eab308', bg: '#fef9c3', rpeFeel: 'RPE 5-6 — Matig' },
  4: { label: 'Zone 4 — Drempel',         description: 'Anaerobe drempel, hoog intensief',       minPct: 80, maxPct: 90, color: '#f97316', bg: '#ffedd5', rpeFeel: 'RPE 7-8 — Hard' },
  5: { label: 'Zone 5 — VO2max',          description: 'Maximale inspanning, korte duur',        minPct: 90, maxPct: 100, color: '#ef4444', bg: '#fee2e2', rpeFeel: 'RPE 9-10 — Maximaal' },
}

/** Bereken maximale hartslag (220 - leeftijd) */
export function calcMaxHR(age: number): number {
  return 220 - age
}

/** Geef HR range voor een zone op basis van leeftijd */
export function calcZoneHRRange(zone: HRZone, age: number): { min: number; max: number } {
  const maxHR = calcMaxHR(age)
  const z = HR_ZONES[zone]
  return {
    min: Math.round(maxHR * z.minPct / 100),
    max: Math.round(maxHR * z.maxPct / 100),
  }
}

/** Bepaal zone op basis van HR en leeftijd */
export function classifyHRZone(hr: number, age: number): HRZone {
  const maxHR = calcMaxHR(age)
  const pct = (hr / maxHR) * 100
  if (pct < 60) return 1
  if (pct < 70) return 2
  if (pct < 80) return 3
  if (pct < 90) return 4
  return 5
}

// ── Cardio interval type ──────────────────────────────────────────────────────

export interface CardioInterval {
  workDuration: number    // seconden
  workDistance?: number   // meter
  restDuration: number    // seconden
  repetitions: number
  label?: string          // bijv. "Loopblok", "Wandelblok"
}

// ── Walk-Run templates ─────────────────────────────────────────────────────────

export interface WalkRunWeek {
  week: number
  runMin: number
  walkMin: number
  rounds: number
  totalMin: number
  sessionsPerWeek: number
  notes?: string
}

export interface WalkRunTemplate {
  id: string
  name: string
  description: string
  injury: string
  weeks: WalkRunWeek[]
  targetDistance: string
  progressionRule: string
}

export const WALK_RUN_TEMPLATES: WalkRunTemplate[] = [
  {
    id: 'wr-generiek',
    name: 'Generiek Return-to-Running',
    description: 'Stapsgewijs terugkeer naar hardlopen — geschikt voor de meeste blessures',
    injury: 'Generiek',
    targetDistance: '5 km',
    progressionRule: '10% toename per week maximaal. Bij pijn > 4/10 herhaal je de vorige week.',
    weeks: [
      { week: 1, runMin: 1,  walkMin: 2, rounds: 6,  totalMin: 18, sessionsPerWeek: 3, notes: 'Voorzichtig beginnen — focus op looptechniek' },
      { week: 2, runMin: 2,  walkMin: 2, rounds: 6,  totalMin: 24, sessionsPerWeek: 3 },
      { week: 3, runMin: 3,  walkMin: 2, rounds: 5,  totalMin: 25, sessionsPerWeek: 3 },
      { week: 4, runMin: 5,  walkMin: 2, rounds: 4,  totalMin: 28, sessionsPerWeek: 3, notes: 'Als pijn < 3/10 mag duur iets omhoog' },
      { week: 5, runMin: 8,  walkMin: 2, rounds: 3,  totalMin: 30, sessionsPerWeek: 3 },
      { week: 6, runMin: 10, walkMin: 1, rounds: 3,  totalMin: 33, sessionsPerWeek: 3 },
      { week: 7, runMin: 15, walkMin: 1, rounds: 2,  totalMin: 32, sessionsPerWeek: 3, notes: 'Aaneengesloten lopen wordt dominant' },
      { week: 8, runMin: 20, walkMin: 0, rounds: 1,  totalMin: 20, sessionsPerWeek: 3, notes: 'Eerste continue loop! Begin rustig.' },
      { week: 9, runMin: 25, walkMin: 0, rounds: 1,  totalMin: 25, sessionsPerWeek: 3 },
      { week: 10, runMin: 30, walkMin: 0, rounds: 1, totalMin: 30, sessionsPerWeek: 3, notes: '5 km doel bereikt bij normaal tempo' },
    ],
  },
  {
    id: 'wr-achilles',
    name: 'Achilles Return-to-Running',
    description: 'Conservatieve opbouw voor achillestendinopathie. Nadruk op hielafwikkeling en calf capacity.',
    injury: 'Achillestendinopathie',
    targetDistance: '5 km',
    progressionRule: 'Strikte 10% regel. Ochtendhiel-test uitvoeren vóór elke sessie. Stop bij stijfheid > 3/10 na 24 uur.',
    weeks: [
      { week: 1, runMin: 1,  walkMin: 3, rounds: 5,  totalMin: 20, sessionsPerWeek: 2, notes: 'Plat terrein verplicht. Hielverhoging in schoen.' },
      { week: 2, runMin: 1,  walkMin: 2, rounds: 6,  totalMin: 18, sessionsPerWeek: 2, notes: 'Hielverhoging aanhouden' },
      { week: 3, runMin: 2,  walkMin: 3, rounds: 5,  totalMin: 25, sessionsPerWeek: 3 },
      { week: 4, runMin: 3,  walkMin: 2, rounds: 5,  totalMin: 25, sessionsPerWeek: 3, notes: 'Zachte ondergrond (gras, bospad)' },
      { week: 5, runMin: 5,  walkMin: 2, rounds: 4,  totalMin: 28, sessionsPerWeek: 3 },
      { week: 6, runMin: 7,  walkMin: 2, rounds: 3,  totalMin: 27, sessionsPerWeek: 3, notes: 'Hielverhoging afbouwen naar 0.5 cm' },
      { week: 7, runMin: 10, walkMin: 2, rounds: 3,  totalMin: 36, sessionsPerWeek: 3 },
      { week: 8, runMin: 12, walkMin: 1, rounds: 2,  totalMin: 26, sessionsPerWeek: 3, notes: 'Geen hielverhoging meer indien klachtenvrij' },
      { week: 9, runMin: 20, walkMin: 1, rounds: 2,  totalMin: 42, sessionsPerWeek: 3 },
      { week: 10, runMin: 30, walkMin: 0, rounds: 1, totalMin: 30, sessionsPerWeek: 3, notes: 'Pijnvrije 5 km als doel' },
    ],
  },
  {
    id: 'wr-knie',
    name: 'Knie Return-to-Running',
    description: 'Opbouw na knieblessure (meniscus, PFPS, post-ACL). Nadruk op quadricepskracht en landing mechanics.',
    injury: 'Knieblessure (meniscus / PFPS / ACL)',
    targetDistance: '5 km',
    progressionRule: 'VAS-score na sessie < 4/10. Zwelling bij knie vertraagt progressie. Single-leg squat test als clearance.',
    weeks: [
      { week: 1, runMin: 1,  walkMin: 4, rounds: 4,  totalMin: 20, sessionsPerWeek: 2, notes: 'Vlak terrein. Geen heuvel of trap.' },
      { week: 2, runMin: 2,  walkMin: 3, rounds: 4,  totalMin: 20, sessionsPerWeek: 2 },
      { week: 3, runMin: 2,  walkMin: 2, rounds: 5,  totalMin: 20, sessionsPerWeek: 3, notes: 'Let op knie-positie bij landing (valgus check)' },
      { week: 4, runMin: 3,  walkMin: 2, rounds: 5,  totalMin: 25, sessionsPerWeek: 3 },
      { week: 5, runMin: 5,  walkMin: 2, rounds: 4,  totalMin: 28, sessionsPerWeek: 3 },
      { week: 6, runMin: 7,  walkMin: 2, rounds: 3,  totalMin: 27, sessionsPerWeek: 3, notes: 'Lichte heuvel indien klachtenvrij' },
      { week: 7, runMin: 10, walkMin: 2, rounds: 3,  totalMin: 36, sessionsPerWeek: 3 },
      { week: 8, runMin: 15, walkMin: 1, rounds: 2,  totalMin: 32, sessionsPerWeek: 3 },
      { week: 9, runMin: 20, walkMin: 0, rounds: 1,  totalMin: 20, sessionsPerWeek: 3 },
      { week: 10, runMin: 30, walkMin: 0, rounds: 1, totalMin: 30, sessionsPerWeek: 3, notes: 'Return-to-sport clearance gesprek' },
    ],
  },
]

// ── Cardio activiteit templates (bibliotheek) ─────────────────────────────────

export interface CardioActivityTemplate {
  id: string
  name: string
  activity: CardioActivityKey
  protocol: CardioProtocolKey
  targetDurationMin: number
  targetDistanceKm?: number
  targetZone?: HRZone
  targetRpe?: number
  description: string
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  intervals?: CardioInterval[]
}

export const CARDIO_TEMPLATES: CardioActivityTemplate[] = [
  {
    id: 'ct-zone2-run-30',
    name: 'Zone 2 Duurloop 30 min',
    activity: 'RUNNING',
    protocol: 'ZONE_TRAINING',
    targetDurationMin: 30,
    targetZone: 2,
    targetRpe: 4,
    difficulty: 'BEGINNER',
    description: 'Rustige aerobe duurloop in zone 2. Ideaal voor vetverbranding en aerobe basis.',
  },
  {
    id: 'ct-interval-run',
    name: 'Intervaltraining Hardlopen 8×400m',
    activity: 'RUNNING',
    protocol: 'INTERVALS',
    targetDurationMin: 35,
    targetZone: 4,
    targetRpe: 8,
    difficulty: 'INTERMEDIATE',
    description: '8 intervallen van 400 meter op hoog tempo met 90 seconden herstel.',
    intervals: [
      { workDuration: 120, workDistance: 400, restDuration: 90, repetitions: 8, label: '400m hard' },
    ],
  },
  {
    id: 'ct-bike-steady',
    name: 'Steady State Fiets 45 min',
    activity: 'CYCLING',
    protocol: 'STEADY_STATE',
    targetDurationMin: 45,
    targetZone: 2,
    targetRpe: 4,
    difficulty: 'BEGINNER',
    description: 'Rustige fietstocht of indoorfiets op gelijkmatig tempo.',
  },
  {
    id: 'ct-rowing-lsd',
    name: 'Lange Afstand Roeien 40 min',
    activity: 'ROWING',
    protocol: 'LONG_SLOW_DISTANCE',
    targetDurationMin: 40,
    targetDistanceKm: 8,
    targetZone: 2,
    targetRpe: 5,
    difficulty: 'INTERMEDIATE',
    description: 'Langzame aerobe roei-training. Techniek en basisconditie opbouwen.',
  },
  {
    id: 'ct-crosstrainer-zone3',
    name: 'Crosstrainer Tempo 25 min',
    activity: 'CROSSTRAINER',
    protocol: 'TEMPO',
    targetDurationMin: 25,
    targetZone: 3,
    targetRpe: 6,
    difficulty: 'BEGINNER',
    description: 'Goede low-impact optie voor kniegerelateerde blessures. Constant matig-hoog tempo.',
  },
  {
    id: 'ct-swimming-aerobe',
    name: 'Zwemmen Aerobe Basis 30 min',
    activity: 'SWIMMING',
    protocol: 'STEADY_STATE',
    targetDurationMin: 30,
    targetZone: 2,
    targetRpe: 4,
    difficulty: 'BEGINNER',
    description: 'Rustig baanzwemmen. Uitstekend voor schouder- en heup-revalidatie.',
  },
  {
    id: 'ct-assault-hiit',
    name: 'Assault Bike HIIT 20 min',
    activity: 'ASSAULT_BIKE',
    protocol: 'INTERVALS',
    targetDurationMin: 20,
    targetZone: 5,
    targetRpe: 9,
    difficulty: 'ADVANCED',
    description: '10 × 30 seconden maximale inspanning met 30 seconden actief herstel.',
    intervals: [
      { workDuration: 30, restDuration: 30, repetitions: 10, label: 'Max effort' },
    ],
  },
  {
    id: 'ct-skierg-interval',
    name: 'SkiErg Drempel Intervallen',
    activity: 'SKIERG',
    protocol: 'THRESHOLD',
    targetDurationMin: 30,
    targetZone: 4,
    targetRpe: 8,
    difficulty: 'ADVANCED',
    description: '4 × 5 minuten op drempelintensiteit met 2 minuten herstel.',
    intervals: [
      { workDuration: 300, restDuration: 120, repetitions: 4, label: 'Drempel blok' },
    ],
  },
  {
    id: 'ct-walking-zone1',
    name: 'Actief Herstel Wandelen 30 min',
    activity: 'WALKING',
    protocol: 'ZONE_TRAINING',
    targetDurationMin: 30,
    targetZone: 1,
    targetRpe: 2,
    difficulty: 'BEGINNER',
    description: 'Lichte wandeling als actief herstel op rustdagen. Zone 1 hartslag.',
  },
  {
    id: 'ct-wattbike-ftp',
    name: 'Wattbike FTP Test 20 min',
    activity: 'WATTBIKE',
    protocol: 'THRESHOLD',
    targetDurationMin: 20,
    targetZone: 4,
    targetRpe: 9,
    difficulty: 'ADVANCED',
    description: 'FTP (Functional Threshold Power) test over 20 minuten. Meet maximaal gemiddeld vermogen.',
  },
]

// ── TRIMP berekening ──────────────────────────────────────────────────────────

/**
 * Eenvoudige TRIMP (Training Impulse) berekening
 * TRIMP = duur × ((HRavg - HRrest) / (HRmax - HRrest)) × e^(1.92 × HR ratio)
 */
export function calculateTRIMP(
  durationMin: number,
  hrAvg: number,
  hrRest: number,
  hrMax: number,
): number {
  if (hrMax <= hrRest) return 0
  const hrRatio = (hrAvg - hrRest) / (hrMax - hrRest)
  if (hrRatio <= 0) return 0
  return durationMin * hrRatio * Math.exp(1.92 * hrRatio)
}

/**
 * Eenvoudige cardio workload op basis van RPE × duur (gelijke methode als kracht)
 */
export function calculateCardioSRPE(rpe: number, durationMin: number): number {
  return rpe * durationMin
}
