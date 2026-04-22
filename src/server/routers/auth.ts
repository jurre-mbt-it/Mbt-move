import { z } from 'zod'
import crypto from 'node:crypto'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { auditLog } from '@/server/audit'

// ─── MFA helpers ─────────────────────────────────────────────────────────────

const BACKUP_CODES_COUNT = 10
const MFA_REQUIRED_ROLES = ['THERAPIST', 'ADMIN'] as const
const MFA_BACKUP_SALT = process.env.MFA_BACKUP_SALT ?? 'mbt-move-mfa-backup-dev'

/** Genereer een leesbare 10-char backup-code (XXXX-XXXXX). */
function generateBackupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // geen 0/O, 1/I voor leesbaarheid
  const bytes = crypto.randomBytes(9)
  let code = ''
  for (let i = 0; i < 9; i++) {
    code += alphabet[bytes[i] % alphabet.length]
    if (i === 3) code += '-'
  }
  return code
}

function hashBackupCode(code: string): string {
  return crypto
    .createHmac('sha256', MFA_BACKUP_SALT)
    .update(code.toUpperCase().replace(/\s+/g, ''))
    .digest('hex')
}

export function roleRequiresMfa(role: string): boolean {
  return MFA_REQUIRED_ROLES.includes(role as (typeof MFA_REQUIRED_ROLES)[number])
}

export const authRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return { user: ctx.user }
  }),

  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        specialty: true,
        bio: true,
        injuryInfo: true,
        injuryVisibleToTherapist: true,
        mfaEnabled: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
    }

    // MFA-enforcement voor kritieke rollen.
    const mfaRequired = roleRequiresMfa(user.role)
    return {
      ...user,
      mfaRequired,
      mfaEnforcementPending: mfaRequired && !user.mfaEnabled,
    }
  }),

  /**
   * Sync User.mfaEnabled met de werkelijke Supabase MFA-factoren van de user.
   * De client bepaalt NIET zelf de status — we vragen het aan Supabase op
   * (security review #3). Input werd weggehaald; client roept dit gewoon
   * aan na enroll/unenroll en de server bepaalt de echte stand.
   */
  setMfaStatus: protectedProcedure
    .mutation(async ({ ctx }) => {
      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
        userId: ctx.user.id,
      })
      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      const enabled = (data?.factors ?? []).some((f) => f.status === 'verified')
      const updated = await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { mfaEnabled: enabled },
      })
      await auditLog({
        event: enabled ? 'MFA_VERIFIED' : 'MFA_ENROLLED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        metadata: { mfaEnabled: enabled },
        req: ctx.req,
      })
      return updated
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        specialty: z.string().optional(),
        bio: z.string().optional(),
        injuryInfo: z.string().nullable().optional(),
        injuryVisibleToTherapist: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: input,
      })
    }),

  // ─── MFA enforcement + backup codes ───────────────────────────────────────

  /**
   * Status-query voor MFA. Geeft client genoeg info om het juiste scherm te tonen:
   *  - is MFA aan?
   *  - is MFA verplicht voor jouw rol?
   *  - hoeveel backup-codes heb je nog (niet de codes zelf)?
   */
  mfaStatus: protectedProcedure.query(async ({ ctx }) => {
    const [user, unusedCount] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          mfaEnabled: true,
          mfaEnforcedAt: true,
          mfaLastBackupCodesGeneratedAt: true,
          role: true,
        },
      }),
      ctx.prisma.mfaBackupCode.count({
        where: { userId: ctx.user.id, usedAt: null },
      }),
    ])
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' })

    return {
      enabled: user.mfaEnabled,
      required: roleRequiresMfa(user.role),
      enforcedAt: user.mfaEnforcedAt,
      backupCodesRemaining: unusedCount,
      lastBackupCodesGeneratedAt: user.mfaLastBackupCodesGeneratedAt,
    }
  }),

  /**
   * Genereer (of regenereer) backup-codes. Verwijdert eventuele eerdere codes.
   * De klare codes worden EENMALIG teruggegeven aan de caller — daarna alleen
   * de hash beschikbaar. Vereist dat MFA al verified is.
   */
  generateBackupCodes: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { mfaEnabled: true },
    })
    if (!user?.mfaEnabled) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Schakel eerst MFA (Authenticator) in voordat je backup-codes genereert.',
      })
    }

    // Verwijder bestaande codes (regenerate-flow: klare codes moeten ongeldig worden)
    await ctx.prisma.mfaBackupCode.deleteMany({ where: { userId: ctx.user.id } })

    const plainCodes: string[] = []
    for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
      plainCodes.push(generateBackupCode())
    }

    await ctx.prisma.mfaBackupCode.createMany({
      data: plainCodes.map((c) => ({
        userId: ctx.user.id,
        codeHash: hashBackupCode(c),
      })),
    })

    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { mfaLastBackupCodesGeneratedAt: new Date() },
    })

    await auditLog({
      event: 'MFA_ENROLLED',
      userId: ctx.user.id,
      actorEmail: ctx.user.email,
      metadata: { action: 'backup-codes-generated', count: plainCodes.length },
      req: ctx.req,
    })

    return {
      codes: plainCodes,
      count: plainCodes.length,
      warning:
        'Bewaar deze codes op een veilige plek (password-manager of geprint). Je kunt ze EEN keer gebruiken om in te loggen als je je authenticator-app kwijt bent. Ze worden na deze reactie niet meer getoond.',
    }
  }),

  /**
   * Verifieer één backup-code en "verbrand" 'm. Gebruikt als MFA-alternatief
   * wanneer een therapeut z'n authenticator kwijt is.
   *
   * NB: we vertrouwen hier op Supabase's sessie — de caller heeft al een
   * password login achter de rug, en gebruikt nu een backup-code in plaats van
   * TOTP. Na succes moet de client de Supabase MFA-challenge omzeilen
   * (bv. door `supabase.auth.mfa.challenge` + admin-bypass flow).
   */
  verifyBackupCode: protectedProcedure
    .input(z.object({ code: z.string().min(8).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const hash = hashBackupCode(input.code)
      const record = await ctx.prisma.mfaBackupCode.findUnique({
        where: { codeHash: hash },
      })
      if (!record || record.userId !== ctx.user.id) {
        await auditLog({
          event: 'MFA_FAILED',
          userId: ctx.user.id,
          actorEmail: ctx.user.email,
          metadata: { action: 'backup-code-invalid' },
          req: ctx.req,
        })
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Ongeldige backup-code.' })
      }
      if (record.usedAt) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Deze code is al gebruikt.',
        })
      }
      await ctx.prisma.mfaBackupCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      })

      const remaining = await ctx.prisma.mfaBackupCode.count({
        where: { userId: ctx.user.id, usedAt: null },
      })

      await auditLog({
        event: 'MFA_VERIFIED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        metadata: { action: 'backup-code-used', remaining },
        req: ctx.req,
      })

      return { ok: true, remaining }
    }),
})
