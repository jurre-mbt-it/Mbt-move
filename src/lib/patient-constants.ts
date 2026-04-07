import { buildMockProgram } from './program-constants'

export const MOCK_PATIENT = {
  id: 'pat1',
  name: 'Jan de Vries',
  email: 'jan@example.com',
  avatarUrl: null,
  therapistName: 'Emma Bakker',
  programId: 'p1',
  programName: 'Knie Revalidatie — Fase 1',
}

// Today is "Monday week 1" in the mock
export const TODAY_DAY = 1
export const TODAY_WEEK = 1

export type ExerciseLogEntry = {
  exerciseId: string
  setsCompleted: number
  repsCompleted: number
  weight: number | null
  painLevel: number | null
  done: boolean
}

export type SessionLog = {
  id: string
  date: string
  programName: string
  week: number
  day: number
  dayLabel: string
  duration: number // minutes
  exercisesCompleted: number
  exercisesTotal: number
  painLevel: number | null
  exertionLevel: number | null
  notes: string
}

export const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

export const MOCK_SESSION_HISTORY: SessionLog[] = [
  {
    id: 'sl1',
    date: '2025-03-28',
    programName: 'Knie Revalidatie — Fase 1',
    week: 1,
    day: 3,
    dayLabel: 'Woensdag',
    duration: 42,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 3,
    exertionLevel: 6,
    notes: 'Voelde goed, knie iets stijf bij begin',
  },
  {
    id: 'sl2',
    date: '2025-03-26',
    programName: 'Knie Revalidatie — Fase 1',
    week: 1,
    day: 2,
    dayLabel: 'Dinsdag',
    duration: 38,
    exercisesCompleted: 3,
    exercisesTotal: 4,
    painLevel: 4,
    exertionLevel: 7,
    notes: '',
  },
  {
    id: 'sl3',
    date: '2025-03-24',
    programName: 'Knie Revalidatie — Fase 1',
    week: 1,
    day: 1,
    dayLabel: 'Maandag',
    duration: 35,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 5,
    exertionLevel: 8,
    notes: 'Eerste sessie, zwaarder dan verwacht',
  },
  {
    id: 'sl4',
    date: '2025-03-21',
    programName: 'Knie Revalidatie — Fase 1',
    week: 0,
    day: 3,
    dayLabel: 'Woensdag',
    duration: 30,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 6,
    exertionLevel: 7,
    notes: '',
  },
  {
    id: 'sl5',
    date: '2025-03-19',
    programName: 'Knie Revalidatie — Fase 1',
    week: 0,
    day: 2,
    dayLabel: 'Dinsdag',
    duration: 28,
    exercisesCompleted: 3,
    exercisesTotal: 4,
    painLevel: 7,
    exertionLevel: 8,
    notes: 'Pijn bij Nordic Hamstring, gestopt na 3 sets',
  },
]

export function getTodayExercises() {
  const all = buildMockProgram()
  return all.filter(e => e.day === TODAY_DAY && e.week === TODAY_WEEK)
}

export function getWeekSchedule() {
  const all = buildMockProgram()
  const days: Record<number, typeof all> = {}
  all.forEach(e => {
    if (e.week === TODAY_WEEK) {
      if (!days[e.day]) days[e.day] = []
      days[e.day].push(e)
    }
  })
  return days
}
