import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import {
  createTRPCRouter,
  adminProcedure,
  mfaAdminProcedure,
  invalidateUserCache,
} from '@/server/trpc'
import { auditLog } from '@/server/audit'

/**
 * Admin-only router. Beheer van users, rollen en praktijken.
 */
export const adminRouter = createTRPCRouter({
  // ── Users ─────────────────────────────────────────────────────────────

  listUsers: adminProcedure
    .input(
      z
        .object({
          role: z.enum(['PATIENT', 'ATHLETE', 'THERAPIST', 'COACH', 'ADMIN']).optional(),
          query: z.string().optional(),
          practiceId: z.string().nullable().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        where: {
          ...(input?.role ? { role: input.role } : {}),
          ...(input?.practiceId !== undefined
            ? { practiceId: input.practiceId }
            : {}),
          ...(input?.query
            ? {
                OR: [
                  { name: { contains: input.query, mode: 'insensitive' as const } },
                  { email: { contains: input.query, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          practiceId: true,
          createdAt: true,
          mfaEnabled: true,
          canUseAssessment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    }),

  setUserRole: mfaAdminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(['PATIENT', 'ATHLETE', 'THERAPIST', 'COACH', 'ADMIN']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Bescherming tegen self-demote: admin kan zichzelf niet downgraden
      if (input.userId === ctx.user.id && input.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Je kunt je eigen admin-rol niet intrekken',
        })
      }
      const updated = await ctx.prisma.$transaction(async (tx) => {
        // Een uitbehandel-markering hoort bij een patiënt of atleet. Promoveert
        // iemand naar THERAPIST, COACH of ADMIN, dan blijft die rij anders
        // lopen terwijl niemand hem nog kan heractiveren: `patients.reactivate`
        // zoekt in de patiëntenlijst en deze gebruiker staat daar niet meer in.
        // Het pushfilter kijkt niet naar rol, dus de nieuwe therapeut krijgt
        // vanaf dat moment stil geen ochtendpush meer over zijn eigen training.
        //
        // Afstempelen en niet verwijderen: de reden en de toelichting van de
        // afgesloten periode zijn een klinisch oordeel dat nergens anders
        // bewaard wordt (zie het commentaar bij model PatientCareStatus).
        if (input.role !== 'PATIENT' && input.role !== 'ATHLETE') {
          await tx.patientCareStatus.updateMany({
            where: { patientId: input.userId, reactivatedAt: null },
            data: { reactivatedAt: new Date(), reactivatedById: ctx.user.id },
          })
        }
        return tx.user.update({
          where: { id: input.userId },
          // Een coach hoort nooit bij een praktijk: bij het omzetten naar COACH
          // halen we de praktijk-koppeling weg, anders zou de praktijk-tak in
          // de toegangschecks alsnog kunnen gaan gelden.
          data: { role: input.role, ...(input.role === 'COACH' ? { practiceId: null } : {}) },
          select: { id: true, name: true, email: true, role: true, supabaseUserId: true },
        })
      })

      // Zonder dit houdt de gedegradeerde gebruiker tot 60s (USER_CACHE_TTL) zijn
      // oude rechten op de tRPC-API, want de context-cache bewaart role/practiceId.
      if (updated.supabaseUserId) invalidateUserCache(updated.supabaseUserId)

      // Sync ook Supabase user_metadata.role — proxy/middleware en LoginForm
      // lezen user_metadata, niet de DB. Zonder deze sync blijft de gebruiker
      // op de oude rol vastzitten bij login-redirect.
      try {
        const supabaseAdmin = createSupabaseAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        let supaUserId = updated.supabaseUserId
        if (!supaUserId) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
          supaUserId = users.find(u => u.email?.toLowerCase() === updated.email.toLowerCase())?.id ?? null
        }
        if (supaUserId) {
          await supabaseAdmin.auth.admin.updateUserById(supaUserId, {
            user_metadata: { role: updated.role },
          })
        }
      } catch (e) {
        console.error('setUserRole: failed to sync Supabase user_metadata', e)
      }

      const { supabaseUserId: _omit, ...rest } = updated
      return rest
    }),

  setUserPractice: mfaAdminProcedure
    .input(
      z.object({
        userId: z.string(),
        practiceId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.practiceId) {
        const practice = await ctx.prisma.practice.findUnique({
          where: { id: input.practiceId },
        })
        if (!practice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Praktijk niet gevonden' })
      }
      return ctx.prisma.user.update({
        where: { id: input.userId },
        data: { practiceId: input.practiceId },
        select: { id: true, name: true, email: true, role: true, practiceId: true },
      })
    }),

  /**
   * Verwijder een gebruiker direct (zonder 30-dagen GDPR-grace).
   * Cascade-delete via Prisma + Supabase auth-user. Onomkeerbaar.
   *
   * Beveiligingen:
   *   - Admin kan zichzelf niet verwijderen
   *   - De laatste actieve ADMIN kan niet verwijderd worden
   */
  deleteUser: mfaAdminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Je kunt jezelf niet verwijderen.' })
      }

      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, name: true, role: true },
      })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Gebruiker niet gevonden.' })

      if (target.role === 'ADMIN') {
        const adminCount = await ctx.prisma.user.count({
          where: { role: 'ADMIN', deletedAt: null },
        })
        if (adminCount <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Kan de laatste admin niet verwijderen.',
          })
        }
      }

      // Stap 1: Supabase-auth user verwijderen (best-effort — Prisma-delete gaat sowieso door)
      try {
        const supabaseAdmin = createSupabaseAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data: sb } = await supabaseAdmin.auth.admin.listUsers()
        const supaUser = sb.users.find((u) => u.email === target.email)
        if (supaUser) {
          await supabaseAdmin.auth.admin.deleteUser(supaUser.id)
        }
      } catch (err) {
        console.warn('[admin.deleteUser] supabase-delete failed:', (err as Error).message)
      }

      // Stap 2: Prisma hard-delete (cascade via schema)
      await ctx.prisma.user.delete({ where: { id: target.id } })

      return { ok: true, deletedEmail: target.email, deletedRole: target.role }
    }),

  /**
   * Admin-geassisteerde MFA-reset: het herstelpad voor een therapeut die z'n
   * authenticator kwijt is. Verwijdert de TOTP-factoren bij Supabase, wist de
   * backup-codes en zet mfaEnabled uit; bij de eerstvolgende login stuurt de
   * enroll-gate (require-role.ts / assertStaffMfaEnrolled) de gebruiker
   * automatisch opnieuw door de MFA-setup. Bewust alleen voor ánderen: je
   * eigen factoren beheer je via /mfa, en zo kan een gekaapte admin-sessie
   * dit endpoint niet gebruiken om de eigen tweede factor te slopen.
   */
  resetMfa: mfaAdminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Je eigen MFA beheer je via de beveiligingsinstellingen.',
        })
      }

      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, role: true, supabaseUserId: true },
      })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Gebruiker niet gevonden.' })

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      // Email-match alleen als fallback voor legacy rows zonder supabaseUserId
      // (zelfde patroon als deleteUser hierboven).
      let supaUserId = target.supabaseUserId
      if (!supaUserId) {
        const { data: sb } = await supabaseAdmin.auth.admin.listUsers()
        supaUserId = sb.users.find((u) => u.email === target.email)?.id ?? null
      }

      let factorsRemoved = 0
      if (supaUserId) {
        const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
          userId: supaUserId,
        })
        if (error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
        }
        for (const factor of data?.factors ?? []) {
          const { error: delError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
            id: factor.id,
            userId: supaUserId,
          })
          if (delError) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: delError.message })
          }
          factorsRemoved++
        }
      }

      // Oude backup-codes zijn na een reset waardeloos én gevaarlijk (wie de
      // telefoon vond, kan het briefje ook hebben) — dus weg ermee.
      await ctx.prisma.mfaBackupCode.deleteMany({ where: { userId: target.id } })
      await ctx.prisma.user.update({
        where: { id: target.id },
        data: { mfaEnabled: false },
        select: { id: true },
      })
      if (supaUserId) invalidateUserCache(supaUserId)

      await auditLog({
        event: 'MFA_RESET_BY_ADMIN',
        userId: target.id,
        actorEmail: ctx.user.email,
        metadata: { targetEmail: target.email, targetRole: target.role, factorsRemoved },
        req: ctx.req,
      })

      return { ok: true, factorsRemoved }
    }),

  // ── Practices ─────────────────────────────────────────────────────────

  listPractices: adminProcedure.query(async ({ ctx }) => {
    // Expliciete select en geen `include`: anders reist `uiPrefs` mee, en dat is
    // een recursief Json-type waar de tRPC-typeboom van omvalt (TS2589 in elk
    // scherm dat de router aanraakt). Een lijst met praktijken heeft die blob
    // sowieso niet nodig.
    const practices = await ctx.prisma.practice.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        postalCode: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
        agbCodePractice: true,
        createdAt: true,
        _count: { select: { users: true } },
        users: {
          where: { isPracticeOwner: true },
          select: { id: true, name: true, firstName: true, lastName: true, email: true },
          take: 1,
        },
      },
    })
    // Vlak `users[0]` af naar `owner` voor de client.
    return practices.map(({ users, ...rest }) => ({
      ...rest,
      owner: users[0] ?? null,
    }))
  }),

  /** Therapeuten van een specifieke praktijk — voor de owner-picker dropdown. */
  listPracticeMembers: adminProcedure
    .input(z.object({ practiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        where: {
          practiceId: input.practiceId,
          role: { in: ['THERAPIST', 'ADMIN'] },
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          isPracticeOwner: true,
        },
        orderBy: [{ isPracticeOwner: 'desc' }, { name: 'asc' }],
      })
    }),

  /** Owner van een praktijk wijzigen of loskoppelen. Demoot de huidige owner
   *  en promoot de nieuwe in één transactie — anders zou de partial unique
   *  index (één owner per practice) een conflict opleveren. */
  setPracticeOwner: mfaAdminProcedure
    .input(z.object({
      practiceId: z.string(),
      userId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId) {
        const target = await ctx.prisma.user.findUnique({
          where: { id: input.userId },
          select: { practiceId: true, role: true },
        })
        if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User niet gevonden' })
        if (target.practiceId !== input.practiceId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'User hoort niet bij deze praktijk' })
        }
        if (target.role !== 'THERAPIST' && target.role !== 'ADMIN') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Alleen THERAPIST of ADMIN kan owner zijn' })
        }
      }
      return ctx.prisma.$transaction(async (tx) => {
        // Stap 1: huidige owner demoten (kan niemand zijn — dan no-op)
        await tx.user.updateMany({
          where: { practiceId: input.practiceId, isPracticeOwner: true },
          data: { isPracticeOwner: false },
        })
        // Stap 2: nieuwe owner promoten (of leeg laten als userId=null)
        if (input.userId) {
          await tx.user.update({
            where: { id: input.userId },
            data: { isPracticeOwner: true },
          })
        }
        return { ok: true }
      })
    }),

  createPractice: mfaAdminProcedure
    .input(z.object({ name: z.string().min(2) }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practice.create({
        data: { name: input.name },
      })
    }),

  renamePractice: mfaAdminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(2) }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practice.update({
        where: { id: input.id },
        data: { name: input.name },
      })
    }),

  deletePractice: mfaAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Users blijven bestaan (practiceId wordt gezet op null door Prisma SetNull)
      return ctx.prisma.practice.delete({
        where: { id: input.id },
      })
    }),

  // ── Therapeut uitnodigen ───────────────────────────────────────────────

  inviteTherapist: mfaAdminProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Normaliseer naar lowercase — Supabase auth slaat email lowercase op,
      // dus zonder dit krijg je een mismatch tussen Prisma.email en Supabase.email
      // waardoor de email-fallback in resolveUser nooit aanslaat.
      const email = input.email.toLowerCase().trim()

      // Blokkeer als de gebruiker al in Prisma bestaat
      const existing = await ctx.prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${email} bestaat al als ${existing.role}.`,
        })
      }

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        { data: { role: 'THERAPIST', name: input.name ?? '' } },
      )
      if (inviteError || !inviteData?.user) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: inviteError?.message ?? 'Supabase invite gaf geen user terug',
        })
      }

      // Pre-create Prisma user mét supabaseUserId én practiceId van de
      // uitnodigende admin. Zonder supabaseUserId weigert resolveUser (zie
      // trpc.ts) THERAPIST/ADMIN-rows via email-fallback te koppelen — dat is
      // een security-defense, maar betekent dat je hem hier MOET vullen anders
      // krijgt de nieuwe collega UNAUTHORIZED op elke tRPC-call.
      //
      // Upsert, geen create: `inviteUserByEmail` hierboven schrijft een rij in
      // auth.users, en de `on_auth_user_created`-trigger maakt daar direct een
      // stub-rij bij met dezelfde id (rol PATIENT, want de trigger leest sinds
      // 2026-07-27 geen rol meer uit client-metadata). Een `create` botst dan
      // op de primary key. De rol wordt hier server-side gezet.
      const user = await ctx.prisma.user.upsert({
        where: { id: inviteData.user.id },
        update: {
          supabaseUserId: inviteData.user.id,
          name: input.name ?? email.split('@')[0],
          role: 'THERAPIST',
          practiceId: ctx.user.practiceId ?? null,
        },
        create: {
          id: inviteData.user.id,
          supabaseUserId: inviteData.user.id,
          email,
          name: input.name ?? email.split('@')[0],
          role: 'THERAPIST',
          practiceId: ctx.user.practiceId ?? null,
        },
        select: { id: true, email: true, name: true, role: true, practiceId: true },
      })

      return { ok: true, user }
    }),

  // ── Dashboard stats ───────────────────────────────────────────────────

  getStats: adminProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [totalUsers, mfaEnabled, sessionsThisWeek] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.user.count({ where: { mfaEnabled: true } }),
      ctx.prisma.sessionLog.count({ where: { completedAt: { gte: since } } }),
    ])
    return { totalUsers, mfaEnabled, sessionsThisWeek }
  }),
})
