import { createTRPCRouter } from '@/server/trpc'
import { authRouter } from './auth'
import { exercisesRouter } from './exercises'
import { programsRouter } from './programs'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  exercises: exercisesRouter,
  programs: programsRouter,
})

export type AppRouter = typeof appRouter
