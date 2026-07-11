import { initTRPC, TRPCError } from '@trpc/server'
import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { DPA_VERSION } from '@/lib/dpa-constants'

export interface Context {
  req?: NextRequest
  prisma: typeof prisma
  user: {
    id: string
    email: string
    role: string
    practiceId: string | null
    supabaseUserId: string
    mfaEnabled: boolean
    dpaAcceptedVersion: string | null
  } | null
  /** Assurance level uit de `aal`-claim van de sessie-JWT ('aal1'|'aal2'|null).
   *  'aal2' = tweede factor (TOTP) is deze sessie daadwerkelijk doorlopen. */
  aal: string | null
}

/** Lees de `aal`-claim uit een (reeds vertrouwde) Supabase access-token JWT.
 *  Geen signature-check nodig: de token is al geverifieerd door getUser/
 *  getSession voordat we hier komen. */
function decodeAalClaim(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof json.aal === 'string' ? json.aal : null
  } catch {
    return null
  }
}

// In-memory cache voor user lookups (leeft mee met de serverless instantie)
const userCache = new Map<string, { user: Context['user']; expiresAt: number }>()
const USER_CACHE_TTL = 60_000 // 60 seconden

/**
 * Verwijder een user uit de lookup-cache. Aan te roepen wanneer een veld dat
 * in `Context['user']` gecached wordt muteert binnen dezelfde instantie —
 * met name `dpaAcceptedVersion` na `dpa.accept`, zodat de DPA-gate de patiënt
 * niet nog tot 60s blijft blokkeren na acceptatie. Sleutel = supabaseUserId.
 */
export function invalidateUserCache(supabaseUserId: string) {
  userCache.delete(supabaseUserId)
}

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
    select: { id: true, email: true, role: true, practiceId: true, supabaseUserId: true, mfaEnabled: true, dpaAcceptedVersion: true },
  })
  if (byUuid) return byUuid

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, practiceId: true, supabaseUserId: true, mfaEnabled: true, dpaAcceptedVersion: true },
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
        select: { id: true, email: true, role: true, practiceId: true, supabaseUserId: true, mfaEnabled: true, dpaAcceptedVersion: true },
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
  let accessToken: string | null = null

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
      accessToken = bearerToken
    } else {
      const supabase = await createClient()
      // getSession() leest uit cookie — geen netwerkroundtrip naar Supabase
      const { data: { session } } = await supabase.auth.getSession()
      supabaseUser = session?.user
      accessToken = session?.access_token ?? null
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
            mfaEnabled: dbUser.mfaEnabled,
            dpaAcceptedVersion: dbUser.dpaAcceptedVersion,
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
    aal: decodeAalClaim(accessToken),
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

/**
 * DPA-vangnet op de API-laag (defense-in-depth naast de web-shell-guard
 * `src/lib/auth/require-role.ts` én de iOS-gate). PATIENT/ATHLETE mogen géén
 * patient-data-endpoints raken vóór ze de verwerkersovereenkomst hebben
 * geaccepteerd. Staff (THERAPIST/ADMIN) tekent de DPA buiten de app om en valt
 * dus buiten deze gate.
 *
 * De check is rol-gericht, zodat een tRPC-brede toepassing (via
 * `protectedProcedure`) therapeut-/admin-flows nooit raakt. Alleen een kleine,
 * expliciete set prefixes moet vóór acceptatie bereikbaar blijven:
 *   - `dpa.*`    → status opvragen + accepteren (anders kan men nooit voldoen)
 *   - `auth.*`   → identiteit/rol (mobiel leest `auth.getMe` om de gate te sturen)
 *   - `invite.*` → `invite.finalize` draait direct na OTP, vóór de DPA-stap
 */
const DPA_REQUIRED_ROLES: ReadonlySet<string> = new Set(['PATIENT', 'ATHLETE'])
const DPA_EXEMPT_PREFIXES = ['dpa.', 'auth.', 'invite.'] as const
const DPA_REQUIRED_MESSAGE =
  'Accepteer eerst de verwerkersovereenkomst (AVG) om verder te gaan.'

const dpaGuard = t.middleware(({ ctx, path, next }) => {
  const u = ctx.user
  if (
    u &&
    DPA_REQUIRED_ROLES.has(u.role) &&
    u.dpaAcceptedVersion !== DPA_VERSION &&
    !DPA_EXEMPT_PREFIXES.some((p) => path.startsWith(p))
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: DPA_REQUIRED_MESSAGE })
  }
  return next()
})

export const protectedProcedure = t.procedure
  .use(({ ctx, next }) => {
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
  .use(dpaGuard)

const MFA_CHALLENGE_MESSAGE =
  'Voltooi de tweede-factor-verificatie (MFA) om deze actie uit te voeren.'

/**
 * Dwingt af dat een staff-gebruiker (THERAPIST/ADMIN) met MFA ingeschakeld de
 * tweede factor deze sessie daadwerkelijk heeft doorlopen (aal2). Voorheen
 * werd MFA alleen client-side afgedwongen via een redirect naar /mfa/challenge;
 * een aal1-sessie kon die overslaan en direct tRPC-mutations aanroepen. Deze
 * check sluit dat server-side. Patiënten/atleten en nog-niet-geënrolde staff
 * (mfaEnabled=false, sessie blijft aal1) worden niet geraakt.
 */
function assertMfaSatisfied(ctx: Context) {
  const u = ctx.user
  if (!u) return
  const isStaff = u.role === 'THERAPIST' || u.role === 'ADMIN'
  if (isStaff && u.mfaEnabled && ctx.aal !== 'aal2') {
    throw new TRPCError({ code: 'FORBIDDEN', message: MFA_CHALLENGE_MESSAGE })
  }
}

export const therapistProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user!.role !== 'THERAPIST' && ctx.user!.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  assertMfaSatisfied(ctx)
  return next({ ctx })
})

/** Therapist OR Athlete — both can create exercises */
export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user!.role
  if (role !== 'THERAPIST' && role !== 'ATHLETE' && role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  assertMfaSatisfied(ctx)
  return next({ ctx })
})

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user!.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  assertMfaSatisfied(ctx)
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
  assertMfaSatisfied(ctx)
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
