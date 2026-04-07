import { initTRPC, TRPCError } from '@trpc/server'
import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

export interface Context {
  req?: NextRequest
  prisma: typeof prisma
  user: {
    id: string
    email: string
    role: string
  } | null
}

export async function createTRPCContext(opts: { req?: NextRequest }): Promise<Context> {
  let user: Context['user'] = null

  try {
    const supabase = await createClient()
    const { data: { user: supabaseUser } } = await supabase.auth.getUser()

    if (supabaseUser?.email) {
      const dbUser = await prisma.user.findUnique({
        where: { email: supabaseUser.email },
        select: { id: true, email: true, role: true },
      })
      if (dbUser) {
        user = { id: dbUser.id, email: dbUser.email, role: dbUser.role }
      }
    }
  } catch {
    // Supabase not configured — user remains null
  }

  return {
    req: opts.req,
    prisma,
    user,
  }
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const createCallerFactory = t.createCallerFactory
export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

export const therapistProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user!.role !== 'THERAPIST' && ctx.user!.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  return next({ ctx })
})

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user!.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  return next({ ctx })
})
