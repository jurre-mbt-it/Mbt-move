import { buildMockProgram } from './program-constants'
import { PATIENTS } from './mock-data'
import type { ExerciseSession } from './recovery-estimation'

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

/**
 * Mock recovery sessions — maps session history to exercise data
 * so the recovery engine can calculate muscle-level recovery.
 * In production this comes from SessionLog + ExerciseLog + Exercise.muscleLoads
 */
export function getMockRecoverySessions(): ExerciseSession[] {
  const exercises = buildMockProgram()

  // Last session (Apr 5, Day 3 Week 3) — same exercises as Day 1 of the mock program
  // Since mock only has week 1 data, we reuse those exercises
  const day1Exercises = exercises.filter(e => e.day === 1)
  const day2Exercises = exercises.filter(e => e.day === 2)

  return [
    // Session 1: April 5 (2 days ago) — Day 1 exercises
    ...day1Exercises.map(e => ({
      exerciseId: e.exerciseId,
      muscleLoads: e.muscleLoads,
      sets: e.sets,
      reps: e.reps,
      repUnit: e.repUnit,
      completedAt: new Date('2026-04-06T10:30:00'),
      painLevel: 2,
      rpe: 6,
    })),
    // Session 2: April 3 (4 days ago) — Day 2 exercises
    ...day2Exercises.map(e => ({
      exerciseId: e.exerciseId,
      muscleLoads: e.muscleLoads,
      sets: e.sets,
      reps: e.reps,
      repUnit: e.repUnit,
      completedAt: new Date('2026-04-04T15:00:00'),
      painLevel: 3,
      rpe: 7,
    })),
  ]
}

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
