import { createTRPCRouter } from '@/server/trpc'
import { authRouter } from './auth'
import { exercisesRouter } from './exercises'
import { patientsRouter } from './patients'
import { programsRouter } from './programs'
import { weekSchedulesRouter } from './weekSchedules'
import { researchRouter } from './research'
import { patientRouter } from './patient'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  exercises: exercisesRouter,
  patients: patientsRouter,
  programs: programsRouter,
  weekSchedules: weekSchedulesRouter,
  research: researchRouter,
  patient: patientRouter,
})

export type AppRouter = typeof appRouter
