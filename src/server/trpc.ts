import { initTRPC, TRPCError } from '@trpc/server'
import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
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

// In-memory cache voor user lookups (leeft mee met de serverless instantie)
const userCache = new Map<string, { user: Context['user']; expiresAt: number }>()
const USER_CACHE_TTL = 60_000 // 60 seconden

export async function createTRPCContext(opts: { req?: NextRequest }): Promise<Context> {
  let user: Context['user'] = null

  try {
    // Mobile clients sturen de Supabase JWT als Bearer-token; browsers gebruiken cookies.
    const authHeader = opts.req?.headers.get('authorization') ?? opts.req?.headers.get('Authorization')
    const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7)
      : null

    let supabaseUser: { id: string; email?: string } | undefined

    if (bearerToken) {
      const supabaseJs = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data } = await supabaseJs.auth.getUser(bearerToken)
      if (data.user) supabaseUser = { id: data.user.id, email: data.user.email }
    } else {
      const supabase = await createClient()
      // getSession() leest uit cookie — geen netwerkroundtrip naar Supabase
      const { data: { session } } = await supabase.auth.getSession()
      supabaseUser = session?.user
    }

    if (supabaseUser?.id && supabaseUser?.email) {
      // Check cache eerst
      const cached = userCache.get(supabaseUser.id)
      if (cached && cached.expiresAt > Date.now()) {
        user = cached.user
      } else {
        // Één DB-query, resultaat wordt gecached
        const dbUser = await prisma.user.findUnique({
          where: { email: supabaseUser.email },
          select: { id: true, email: true, role: true },
        })
        if (dbUser) {
          user = { id: dbUser.id, email: dbUser.email, role: dbUser.role }
          userCache.set(supabaseUser.id, { user, expiresAt: Date.now() + USER_CACHE_TTL })
        }
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

/** Therapist OR Athlete — both can create exercises */
export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user!.role
  if (role !== 'THERAPIST' && role !== 'ATHLETE' && role !== 'ADMIN') {
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
