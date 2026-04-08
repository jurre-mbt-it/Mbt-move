import { createTRPCRouter } from '@/server/trpc'
import { authRouter } from './auth'
import { exercisesRouter } from './exercises'
import { programsRouter } from './programs'
import { weekSchedulesRouter } from './weekSchedules'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  exercises: exercisesRouter,
  programs: programsRouter,
  weekSchedules: weekSchedulesRouter,
})

export type AppRouter = typeof appRouter
