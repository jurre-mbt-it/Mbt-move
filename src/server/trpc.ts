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
    practiceId: string | null
    supabaseUserId: string
  } | null
}

// In-memory cache voor user lookups (leeft mee met de serverless instantie)
const userCache = new Map<string, { user: Context['user']; expiresAt: number }>()
const USER_CACHE_TTL = 60_000 // 60 seconden

/**
 * Resolve een Supabase auth-user naar een Prisma user-row.
 *
 * Lookup-volgorde:
 *  1. Op `supabaseUserId` (stabiele binding — werkt door email-changes heen).
 *  2. Fallback: legacy rows zonder supabaseUserId, gematcht op email — maar
 *     ALLEEN als die row inderdaad nog ongelinkt is. Bij match wordt de
 *     supabaseUserId direct geback-fild zodat dezelfde user voortaan via
 *     pad #1 binnenkomt.
 *
 * Een row die al een ANDERE supabaseUserId heeft maar wel deze email →
 * geweigerd. Dat is het account-takeover-scenario (Supabase email-change).
 */
async function resolveUser(supabaseUserId: string, email: string) {
  const byUuid = await prisma.user.findUnique({
    where: { supabaseUserId },
    select: { id: true, email: true, role: true, practiceId: true, supabaseUserId: true },
  })
  if (byUuid) return byUuid

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, practiceId: true, supabaseUserId: true },
  })
  if (!byEmail) return null
  if (byEmail.supabaseUserId && byEmail.supabaseUserId !== supabaseUserId) {
    // Bestaande row hoort bij een andere Supabase-account — weiger.
    return null
  }
  if (!byEmail.supabaseUserId) {
    // Defense-in-depth: voor high-value rollen weigeren we email-fallback
    // backfill. Anders zou een attacker die hun Supabase-email naar een
    // therapist/admin email weet te wisselen vóór de deploy-SQL gerund is,
    // die identiteit kunnen claimen. Voor THERAPIST/ADMIN moet supabaseUserId
    // al via de bulk-backfill (zie supabase-schema.sql) gevuld zijn.
    if (byEmail.role === 'THERAPIST' || byEmail.role === 'ADMIN') {
      return null
    }
    try {
      const updated = await prisma.user.update({
        where: { id: byEmail.id },
        data: { supabaseUserId },
        select: { id: true, email: true, role: true, practiceId: true, supabaseUserId: true },
      })
      return updated
    } catch {
      // Race / constraint violation — wacht op volgende request.
      return null
    }
  }
  return byEmail
}

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
      const cached = userCache.get(supabaseUser.id)
      if (cached && cached.expiresAt > Date.now()) {
        user = cached.user
      } else {
        const dbUser = await resolveUser(supabaseUser.id, supabaseUser.email)
        if (dbUser && dbUser.supabaseUserId) {
          user = {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role,
            practiceId: dbUser.practiceId,
            supabaseUserId: dbUser.supabaseUserId,
          }
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

const MFA_REQUIRED_MESSAGE =
  'Deze actie vereist MFA. Schakel Two-Factor Authentication in via Instellingen → Beveiliging.'

/** Algemene MFA-required procedure (rol-agnostisch). Voor uitgaande features. */
export const mfaRequiredProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const role = ctx.user!.role
  if (role !== 'THERAPIST' && role !== 'ADMIN') return next({ ctx })
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user!.id },
    select: { mfaEnabled: true },
  })
  if (!user?.mfaEnabled) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MFA_REQUIRED_MESSAGE })
  }
  return next({ ctx })
})

/**
 * Therapist OR admin met MFA aan. Gebruik voor gevoelige therapist-mutations
 * zoals patient-delete, program-delete, invite-create, role-changes.
 */
export const mfaTherapistProcedure = therapistProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user!.id },
    select: { mfaEnabled: true },
  })
  if (!user?.mfaEnabled) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MFA_REQUIRED_MESSAGE })
  }
  return next({ ctx })
})

/** Admin met MFA aan. Voor alle admin-mutations + GDPR confirmDeletion. */
export const mfaAdminProcedure = adminProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user!.id },
    select: { mfaEnabled: true },
  })
  if (!user?.mfaEnabled) {
    throw new TRPCError({ code: 'FORBIDDEN', message: MFA_REQUIRED_MESSAGE })
  }
  return next({ ctx })
})
