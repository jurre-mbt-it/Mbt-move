import { buildMockProgram } from './program-constants'
import { PATIENTS } from './mock-data'

// De ingelogde patiënt is Jan de Vries (pat1) in de mock
const _patient = PATIENTS.find(p => p.id === 'pat1')!

export const MOCK_PATIENT = {
  id: _patient.id,
  name: _patient.name,
  email: _patient.email,
  avatarUrl: null as string | null,
  therapistName: 'Emma Bakker',
  programId: _patient.programId ?? 'p1',
  programName: _patient.programName ?? 'Knie Revalidatie — Fase 1',
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
    date: '2026-04-05',
    programName: 'Knie Revalidatie — Fase 1',
    week: 3,
    day: 3,
    dayLabel: 'Zondag',
    duration: 38,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 2,
    exertionLevel: 6,
    notes: 'Voelde goed, knie iets stijf bij begin',
  },
  {
    id: 'sl2',
    date: '2026-04-03',
    programName: 'Knie Revalidatie — Fase 1',
    week: 3,
    day: 2,
    dayLabel: 'Vrijdag',
    duration: 42,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 3,
    exertionLevel: 7,
    notes: 'Licht ongemak bij terminal extension',
  },
  {
    id: 'sl3',
    date: '2026-04-01',
    programName: 'Knie Revalidatie — Fase 1',
    week: 3,
    day: 1,
    dayLabel: 'Dinsdag',
    duration: 35,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 3,
    exertionLevel: 6,
    notes: '',
  },
  {
    id: 'sl4',
    date: '2026-03-27',
    programName: 'Knie Revalidatie — Fase 1',
    week: 2,
    day: 3,
    dayLabel: 'Woensdag',
    duration: 40,
    exercisesCompleted: 4,
    exercisesTotal: 4,
    painLevel: 4,
    exertionLevel: 7,
    notes: '',
  },
  {
    id: 'sl5',
    date: '2026-03-25',
    programName: 'Knie Revalidatie — Fase 1',
    week: 2,
    day: 2,
    dayLabel: 'Dinsdag',
    duration: 30,
    exercisesCompleted: 3,
    exercisesTotal: 4,
    painLevel: 4,
    exertionLevel: 6,
    notes: 'Sessie vroegtijdig gestopt wegens pijn',
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
