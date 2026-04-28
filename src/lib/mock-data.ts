// ─── Types ──────────────────────────────────────────────────────────────────

export type PatientProfile = {
  id: string
  name: string
  email: string
  phone?: string
  avatarInitials: string

  // Persoonsgegevens
  dateOfBirth?: string   // ISO date string
  gender?: 'M' | 'V' | 'X'
  height?: number        // cm
  weight?: number        // kg

  // Klinisch profiel
  diagnosis: string
  goals: string[]
  limitations: string[]
  sport?: string
  notes?: string

  // Tags voor labels
  tags: string[]

  // Huidig actief programma
  programId?: string
  programName?: string
  programStatus?: 'ACTIVE' | 'DRAFT' | 'COMPLETED'
  weeksCurrent: number
  weeksTotal: number
  startDate?: string
  endDate?: string

  // Statistieken
  compliance: number          // 0-100
  sessionsCompleted: number
  sessionsTotal: number
  lastSessionDate?: string    // ISO date
  lastPainLevel?: number      // 0-10
  lastRpe?: number            // 0-10

  // Toegang
  accessCode: string
}

export type MockSessionLog = {
  id: string
  patientId: string
  date: string           // ISO date
  week: number
  day: number
  rpe: number
  pain: number
  done: number
  total: number
  duration: number       // minutes
  notes?: string
}

// ─── Patiënten ───────────────────────────────────────────────────────────────

export const PATIENTS: PatientProfile[] = [
  {
    id: 'pat1',
    name: 'Jan de Vries',
    email: 'jan@example.com',
    phone: '06-12345678',
    avatarInitials: 'JV',
    dateOfBirth: '1985-03-14',
    gender: 'M',
    height: 182,
    weight: 84,
    sport: 'Voetbal (recreatief)',
    diagnosis: 'Mediale meniscus letsel rechts, post-operatief (partiële meniscectomie)',
    goals: [
      'Volledig pijnvrij lopen na 6 weken',
      'Terugkeer naar voetbal na 12 weken',
      'Quadricepskracht links-rechts gelijk (< 10% verschil)',
    ],
    limitations: [
      'Geen diepe knieflexie > 90°',
      'Geen impact bij pijn > 4/10',
      'Trap lopen beperkt eerste 2 weken',
    ],
    notes: 'Patiënt is gemotiveerd en trouw. Werkt als leraar — kan overdag niet trainen. Voorkeur voor sessies na 17:00.',
    tags: ['Knie', 'Post-op'],
    programId: 'p1',
    programName: 'Knie Revalidatie — Fase 1',
    programStatus: 'ACTIVE',
    weeksCurrent: 3,
    weeksTotal: 6,
    startDate: '2026-03-10',
    endDate: '2026-04-21',
    compliance: 92,
    sessionsCompleted: 7,
    sessionsTotal: 9,
    lastSessionDate: '2026-04-05',
    lastPainLevel: 2,
    lastRpe: 6,
    accessCode: 'MBT-JV24',
  },
  {
    id: 'pat2',
    name: 'Maria Jansen',
    email: 'maria.jansen@gmail.com',
    phone: '06-87654321',
    avatarInitials: 'MJ',
    dateOfBirth: '1992-07-22',
    gender: 'V',
    height: 168,
    weight: 62,
    sport: 'Zwemmen',
    diagnosis: 'Rotatorcuff tendinopathie rechts (supraspinatus), conservatief beleid',
    goals: [
      'Pijnvrij zwemmen na 8 weken',
      'Volle schoudermobiliteit herstellen',
      'Scapulaire stabilisatie verbeteren',
    ],
    limitations: [
      'Geen overhead bewegingen eerste 3 weken',
      'Vermijd impingement provocatie',
    ],
    notes: 'Werkt als verpleegkundige — wisselende diensten. Whatsapp liever dan bellen.',
    tags: ['Schouder', 'Tendinopathie'],
    programId: 'p2',
    programName: 'Schouder Herstel — Fase 2',
    programStatus: 'ACTIVE',
    weeksCurrent: 5,
    weeksTotal: 8,
    startDate: '2026-02-24',
    endDate: '2026-04-21',
    compliance: 78,
    sessionsCompleted: 10,
    sessionsTotal: 16,
    lastSessionDate: '2026-04-03',
    lastPainLevel: 4,
    lastRpe: 5,
    accessCode: 'MBT-MJ92',
  },
  {
    id: 'pat3',
    name: 'Thomas van Berg',
    email: 'thomas.vanberg@outlook.com',
    avatarInitials: 'TB',
    dateOfBirth: '1978-11-05',
    gender: 'M',
    height: 178,
    weight: 91,
    sport: 'Hardlopen',
    diagnosis: 'Chronische lage rugpijn (L4-L5 discopathie), geen neurologische uitval',
    goals: [
      'Pijnreductie van 6/10 naar < 3/10',
      'Terugkeer naar hardlopen (couch-to-5km)',
      'Core stabiliteit opbouwen',
    ],
    limitations: [
      'Geen zware belasting zonder warming-up',
      'Zittend werk maximaal 45 min aaneengesloten',
    ],
    notes: 'Geen programma toegewezen. Intake gepland. Patiënt is sceptisch t.o.v. oefentherapie — wil bewijs zien.',
    tags: ['Rug'],
    weeksCurrent: 0,
    weeksTotal: 0,
    compliance: 0,
    sessionsCompleted: 0,
    sessionsTotal: 0,
    accessCode: 'MBT-TB78',
  },
  {
    id: 'pat4',
    name: 'Sophie Dekker',
    email: 'sophie.dekker@hotmail.com',
    phone: '06-11223344',
    avatarInitials: 'SD',
    dateOfBirth: '1999-04-18',
    gender: 'V',
    height: 164,
    weight: 57,
    sport: 'Volleybal (competitie)',
    diagnosis: 'Achillestendinopathie links, 6 weken klachten',
    goals: [
      'Klachtenvrij volleyballen binnen 10 weken',
      'Isometrische en eccentristische belastbaarheid opbouwen',
    ],
    limitations: [
      'Geen springen eerste 4 weken',
      'Hielverhoging in schoen handhaven',
    ],
    notes: 'Heeft komend seizoen een belangrijk toernooi. Wil snel terugkeren maar moet tempo bewaken.',
    tags: ['Enkel', 'Tendinopathie', 'Sport'],
    programId: 'p3',
    programName: 'Enkel & Achilles Fase 1',
    programStatus: 'COMPLETED',
    weeksCurrent: 6,
    weeksTotal: 6,
    startDate: '2026-02-01',
    endDate: '2026-03-15',
    compliance: 95,
    sessionsCompleted: 12,
    sessionsTotal: 12,
    lastSessionDate: '2026-03-14',
    lastPainLevel: 1,
    lastRpe: 7,
    accessCode: 'MBT-SD99',
  },
  {
    id: 'pat5',
    name: 'Emma Bakker',
    email: 'emma.bakker@gmail.com',
    avatarInitials: 'EB',
    dateOfBirth: '2001-09-30',
    gender: 'V',
    height: 171,
    weight: 64,
    sport: 'Fitness / krachttraining',
    diagnosis: 'Patellofemoraal pijnsyndroom bilateral, 3 maanden klachten',
    goals: [
      'Pijnvrij squatten',
      'Traplopen zonder pijn',
      'Trainingsvolume geleidelijk opbouwen',
    ],
    limitations: [
      'Geen diepe squat bij NRS > 3',
      'Vermijd langdurig zitten met gebogen knie',
    ],
    notes: 'Nieuwe patiënt, programma concept klaar voor review.',
    tags: ['Knie', 'PFPS'],
    programId: 'p4',
    programName: 'PFPS Protocol — Bilateral',
    programStatus: 'DRAFT',
    weeksCurrent: 0,
    weeksTotal: 8,
    compliance: 0,
    sessionsCompleted: 0,
    sessionsTotal: 0,
    accessCode: 'MBT-EB01',
  },
  {
    id: 'pat6',
    name: 'Lars Pietersen',
    email: 'lars.pietersen@work.nl',
    phone: '06-55667788',
    avatarInitials: 'LP',
    dateOfBirth: '1988-01-25',
    gender: 'M',
    height: 186,
    weight: 88,
    sport: 'Tennis (recreatief)',
    diagnosis: 'Laterale enkelbandletsel graad II rechts, 10 dagen oud',
    goals: [
      'Volledig gewichtdragend lopen zonder hulpmiddelen na 2 weken',
      'Proprioceptie en balans herstellen',
      'Terugkeer naar tennis na 8 weken',
    ],
    limitations: [
      'Geen inversie stress eerste week',
      'Tape of brace verplicht bij belasting',
    ],
    notes: '',
    tags: ['Enkel', 'Acuut'],
    programId: 'p5',
    programName: 'Enkeldistorsie Herstel',
    programStatus: 'ACTIVE',
    weeksCurrent: 1,
    weeksTotal: 8,
    startDate: '2026-03-29',
    endDate: '2026-05-24',
    compliance: 83,
    sessionsCompleted: 2,
    sessionsTotal: 3,
    lastSessionDate: '2026-04-06',
    lastPainLevel: 5,
    lastRpe: 4,
    accessCode: 'MBT-LP88',
  },
]

// ─── Sessiegeschiedenis per patiënt ──────────────────────────────────────────

export const SESSION_LOGS: MockSessionLog[] = [
  // Jan de Vries (pat1)
  { id: 's1-1', patientId: 'pat1', date: '2026-04-05', week: 3, day: 3, rpe: 6, pain: 2, done: 4, total: 4, duration: 38 },
  { id: 's1-2', patientId: 'pat1', date: '2026-04-03', week: 3, day: 2, rpe: 7, pain: 3, done: 4, total: 4, duration: 42, notes: 'Licht ongemak bij terminal extension' },
  { id: 's1-3', patientId: 'pat1', date: '2026-04-01', week: 3, day: 1, rpe: 6, pain: 3, done: 4, total: 4, duration: 35 },
  { id: 's1-4', patientId: 'pat1', date: '2026-03-27', week: 2, day: 3, rpe: 7, pain: 4, done: 4, total: 4, duration: 40 },
  { id: 's1-5', patientId: 'pat1', date: '2026-03-25', week: 2, day: 2, rpe: 6, pain: 4, done: 3, total: 4, duration: 30, notes: 'Sessie vroegtijdig gestopt wegens pijn' },
  { id: 's1-6', patientId: 'pat1', date: '2026-03-23', week: 2, day: 1, rpe: 6, pain: 3, done: 4, total: 4, duration: 38 },
  { id: 's1-7', patientId: 'pat1', date: '2026-03-18', week: 1, day: 3, rpe: 5, pain: 4, done: 4, total: 4, duration: 35 },

  // Maria Jansen (pat2)
  { id: 's2-1', patientId: 'pat2', date: '2026-04-03', week: 5, day: 2, rpe: 5, pain: 4, done: 5, total: 5, duration: 45 },
  { id: 's2-2', patientId: 'pat2', date: '2026-04-01', week: 5, day: 1, rpe: 4, pain: 3, done: 5, total: 5, duration: 40 },
  { id: 's2-3', patientId: 'pat2', date: '2026-03-27', week: 4, day: 2, rpe: 5, pain: 4, done: 4, total: 5, duration: 38, notes: 'Vermoeidheid achter in de sessie' },
  { id: 's2-4', patientId: 'pat2', date: '2026-03-25', week: 4, day: 1, rpe: 4, pain: 5, done: 5, total: 5, duration: 42 },
  { id: 's2-5', patientId: 'pat2', date: '2026-03-20', week: 3, day: 2, rpe: 5, pain: 5, done: 3, total: 5, duration: 28, notes: 'Pijn te hoog voor overhead' },

  // Sophie Dekker (pat4)
  { id: 's4-1', patientId: 'pat4', date: '2026-03-14', week: 6, day: 3, rpe: 7, pain: 1, done: 6, total: 6, duration: 50 },
  { id: 's4-2', patientId: 'pat4', date: '2026-03-12', week: 6, day: 2, rpe: 7, pain: 1, done: 6, total: 6, duration: 50 },
  { id: 's4-3', patientId: 'pat4', date: '2026-03-10', week: 6, day: 1, rpe: 6, pain: 2, done: 6, total: 6, duration: 48 },
  { id: 's4-4', patientId: 'pat4', date: '2026-03-05', week: 5, day: 3, rpe: 7, pain: 2, done: 6, total: 6, duration: 50 },
  { id: 's4-5', patientId: 'pat4', date: '2026-03-03', week: 5, day: 2, rpe: 6, pain: 2, done: 6, total: 6, duration: 48 },
  { id: 's4-6', patientId: 'pat4', date: '2026-03-01', week: 5, day: 1, rpe: 6, pain: 3, done: 5, total: 6, duration: 45 },

  // Lars Pietersen (pat6)
  { id: 's6-1', patientId: 'pat6', date: '2026-04-06', week: 1, day: 2, rpe: 4, pain: 5, done: 3, total: 3, duration: 25 },
  { id: 's6-2', patientId: 'pat6', date: '2026-04-03', week: 1, day: 1, rpe: 3, pain: 6, done: 3, total: 3, duration: 20, notes: 'Eerste sessie na blessure, voorzichtig gestart' },
]

// ─── Cardio log mock data ─────────────────────────────────────────────────────

export type MockCardioLog = {
  id: string
  patientId: string
  date: string           // ISO date
  activity: string       // CardioActivity enum value
  protocol: string       // CardioProtocol enum value
  durationSec: number
  distanceM?: number
  avgHeartRate?: number
  maxHeartRate?: number
  zone?: number
  calories?: number
  rpe?: number
  painLevel?: number
  notes?: string
}

export const CARDIO_LOGS: MockCardioLog[] = [
  // Jan de Vries (pat1) — knie, walk-run protocol
  { id: 'c1-1', patientId: 'pat1', date: '2026-04-05', activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 1080, distanceM: 2200, avgHeartRate: 138, zone: 2, rpe: 4, painLevel: 2, notes: 'Week 3 dag 3 walk-run. Knie goed.' },
  { id: 'c1-2', patientId: 'pat1', date: '2026-04-03', activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 1080, distanceM: 2100, avgHeartRate: 140, zone: 2, rpe: 5, painLevel: 3 },
  { id: 'c1-3', patientId: 'pat1', date: '2026-04-01', activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 1080, distanceM: 2050, avgHeartRate: 135, zone: 2, rpe: 4, painLevel: 2 },
  { id: 'c1-4', patientId: 'pat1', date: '2026-03-27', activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 900, distanceM: 1800, avgHeartRate: 132, zone: 2, rpe: 4, painLevel: 3 },
  { id: 'c1-5', patientId: 'pat1', date: '2026-03-25', activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 900, distanceM: 1750, avgHeartRate: 136, zone: 2, rpe: 5, painLevel: 3 },
  { id: 'c1-6', patientId: 'pat1', date: '2026-03-23', activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 900, distanceM: 1700, avgHeartRate: 130, zone: 2, rpe: 4, painLevel: 4 },
  { id: 'c1-7', patientId: 'pat1', date: '2026-03-18', activity: 'WALKING', protocol: 'ZONE_TRAINING', durationSec: 1800, distanceM: 2500, avgHeartRate: 110, zone: 1, rpe: 2, painLevel: 3, notes: 'Opstartweek — alleen wandelen' },

  // Sophie Dekker (pat4) — achilles, zone 2 fiets
  { id: 'c4-1', patientId: 'pat4', date: '2026-03-14', activity: 'CYCLING', protocol: 'ZONE_TRAINING', durationSec: 2700, distanceM: 18000, avgHeartRate: 145, zone: 2, rpe: 4, painLevel: 1, notes: 'Crosstraining tijdens achillesrevalidatie' },
  { id: 'c4-2', patientId: 'pat4', date: '2026-03-10', activity: 'CYCLING', protocol: 'ZONE_TRAINING', durationSec: 2700, distanceM: 17500, avgHeartRate: 142, zone: 2, rpe: 4, painLevel: 1 },
  { id: 'c4-3', patientId: 'pat4', date: '2026-03-05', activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: 2400, distanceM: 15000, avgHeartRate: 138, zone: 2, rpe: 4, painLevel: 2 },
  { id: 'c4-4', patientId: 'pat4', date: '2026-03-01', activity: 'CROSSTRAINER', protocol: 'STEADY_STATE', durationSec: 1800, avgHeartRate: 130, zone: 2, rpe: 3, painLevel: 2, notes: 'Geen impact op achilles' },

  // Lars Pietersen (pat6) — enkel, zwemmen als alternatief
  { id: 'c6-1', patientId: 'pat6', date: '2026-04-06', activity: 'SWIMMING', protocol: 'STEADY_STATE', durationSec: 1800, distanceM: 1200, avgHeartRate: 135, zone: 2, rpe: 4, painLevel: 4, notes: 'Enkel rust — zwemmen als non-impact alternatief' },
  { id: 'c6-2', patientId: 'pat6', date: '2026-04-03', activity: 'SWIMMING', protocol: 'STEADY_STATE', durationSec: 1800, distanceM: 1100, avgHeartRate: 132, zone: 2, rpe: 3, painLevel: 5 },
]

export function getCardioLogsByPatient(patientId: string): MockCardioLog[] {
  return CARDIO_LOGS
    .filter(c => c.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

// ─── Mock cardio programs ─────────────────────────────────────────────────────

export type MockCardioProgram = {
  id: string
  patientId?: string
  name: string
  description: string
  type: 'CARDIO'
  activity: string
  protocol: string
  weeks: number
  sessionsPerWeek: number
  targetDurationMin: number
  targetDistanceKm?: number
  targetZone?: number
  isWalkRun: boolean
  walkRunTemplateId?: string
  status: 'ACTIVE' | 'DRAFT' | 'COMPLETED'
}

export const CARDIO_PROGRAMS: MockCardioProgram[] = [
  {
    id: 'cp1',
    patientId: 'pat1',
    name: 'Walk-Run Terugkeer Protocol — Knie',
    description: 'Geleidelijke terugkeer naar hardlopen na meniscusoperatie. 10 weken progressief walk-run schema.',
    type: 'CARDIO',
    activity: 'RUNNING',
    protocol: 'WALK_RUN',
    weeks: 10,
    sessionsPerWeek: 3,
    targetDurationMin: 30,
    targetDistanceKm: 5,
    targetZone: 2,
    isWalkRun: true,
    walkRunTemplateId: 'wr-knie',
    status: 'ACTIVE',
  },
  {
    id: 'cp2',
    patientId: 'pat4',
    name: 'Cardio Crosstraining — Achilles',
    description: 'Non-impact cardio conditionering tijdens achillesrevalidatie. Fiets + crosstrainer.',
    type: 'CARDIO',
    activity: 'CYCLING',
    protocol: 'ZONE_TRAINING',
    weeks: 6,
    sessionsPerWeek: 3,
    targetDurationMin: 45,
    targetZone: 2,
    isWalkRun: false,
    status: 'COMPLETED',
  },
  {
    id: 'cp3',
    patientId: 'pat6',
    name: 'Zwem Conditie — Enkel Herstel',
    description: 'Cardiovasculaire basis behouden tijdens enkelherstel via zwemmen.',
    type: 'CARDIO',
    activity: 'SWIMMING',
    protocol: 'STEADY_STATE',
    weeks: 4,
    sessionsPerWeek: 2,
    targetDurationMin: 30,
    isWalkRun: false,
    status: 'ACTIVE',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getPatientById(id: string): PatientProfile | undefined {
  return PATIENTS.find(p => p.id === id)
}

export function getSessionsByPatient(patientId: string): MockSessionLog[] {
  return SESSION_LOGS
    .filter(s => s.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'MBT-'
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
