/**
 * GDPR / AVG router — rechten van de betrokkene.
 *
 * Implementeert:
 *   - Art. 15 (inzage) + Art. 20 (data-portabiliteit) → `exportMyData`
 *   - Art. 17 (recht op vergetelheid) → `requestDeletion`, `cancelDeletion`, `confirmDeletion`
 *
 * Design-keuzes:
 *   - Deletion is een 2-staps flow met 30-dagen grace: eerst `deletionRequestedAt`
 *     gezet, daarna cron/handmatig finalizen. Patiënt kan annuleren tijdens grace.
 *   - Export is sync (genereert JSON) en rate-limited tot 3/uur.
 *   - Alles gelogd naar audit_logs.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  mfaAdminProcedure,
} from '@/server/trpc'
import { auditLog } from '@/server/audit'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'

const GRACE_PERIOD_DAYS = 30

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseJsClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export const gdprRouter = createTRPCRouter({
  /**
   * Art. 15 + 20 — gebruiker download al z'n data als JSON.
   * Retourneert een object dat direct op de client als `.json` opgeslagen kan worden.
   */
  exportMyData: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user!.id

    const rl = await rateLimit('gdpr.export', userId, RATE_LIMITS.dataExport)
    if (!rl.ok) {
      await auditLog({
        event: 'RATE_LIMIT_HIT',
        userId,
        actorEmail: ctx.user!.email,
        resource: 'DataExport',
        metadata: { bucket: 'gdpr.export' },
        req: ctx.req,
      })
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
    }

    const [
      user,
      patientTherapists,
      patientPrograms,
      createdPrograms,
      sessionLogs,
      cardioLogs,
      wellnessChecks,
      messages,
      notifications,
      weekSchedules,
      researchConsent,
      favoriteExercises,
      auditLogs,
      dpaRecords,
    ] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          dateOfBirth: true,
          injuryInfo: true,
          specialty: true,
          bio: true,
          licenseNumber: true,
          dpaAcceptedVersion: true,
          dpaAcceptedAt: true,
          mfaEnabled: true,
          practiceId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      ctx.prisma.patientTherapist.findMany({
        where: { OR: [{ patientId: userId }, { therapistId: userId }] },
      }),
      ctx.prisma.program.findMany({ where: { patientId: userId } }),
      ctx.prisma.program.findMany({ where: { creatorId: userId } }),
      ctx.prisma.sessionLog.findMany({
        where: { patientId: userId },
        include: { exerciseLogs: true },
      }),
      ctx.prisma.cardioLog.findMany({ where: { patientId: userId } }),
      ctx.prisma.wellnessCheck.findMany({ where: { userId } }),
      ctx.prisma.message.findMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      }),
      ctx.prisma.notification.findMany({ where: { userId } }),
      ctx.prisma.weekSchedule.findMany({
        where: { OR: [{ patientId: userId }, { creatorId: userId }] },
      }),
      ctx.prisma.researchConsent.findUnique({ where: { userId } }),
      ctx.prisma.favoriteExercise.findMany({ where: { userId } }),
      ctx.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      // Research-consent anonymized-records: uit anonymousIdMapping ketenen niet
      // direct retoureerbaar (zijn gedepersonaliseerd per ontwerp). We melden het.
      ctx.prisma.anonymousIdMapping.findUnique({ where: { userId } }),
    ])

    if (!user) throw new TRPCError({ code: 'NOT_FOUND' })

    const payload = {
      exportedAt: new Date().toISOString(),
      format: 'mbt-move:export:v1',
      gdprArticles: ['15', '20'],
      notice:
        'Dit is een volledige export van je persoonsgegevens bij Movement Based Therapy. Onderzoeks-data die geanonimiseerd is bevat geen link naar jou en staat hier niet in.',
      user,
      patientTherapists,
      programs: { asPatient: patientPrograms, created: createdPrograms },
      sessionLogs,
      cardioLogs,
      wellnessChecks,
      messages,
      notifications,
      weekSchedules,
      researchConsent,
      favoriteExercises,
      auditLogs,
      anonymousResearchMapping: dpaRecords
        ? { note: 'Er zijn geanonimiseerde onderzoeks-records onder een kettingloze ID — niet in deze export.' }
        : null,
    }

    await auditLog({
      event: 'DATA_EXPORTED',
      userId,
      actorEmail: ctx.user!.email,
      metadata: {
        sessionLogCount: sessionLogs.length,
        programCount: patientPrograms.length + createdPrograms.length,
      },
      req: ctx.req,
    })

    return payload
  }),

  /**
   * Art. 17 — patiënt verzoekt zijn account te verwijderen.
   * Soft-markeert met 30-dagen grace period.
   */
  requestDeletion: protectedProcedure
    .input(
      z.object({
        reason: z.string().max(500).optional(),
        confirm: z.literal('VERWIJDER'), // user moet dit letterlijk typen
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id

      const rl = await rateLimit('gdpr.delete', userId, RATE_LIMITS.accountDeletion)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }

      const existing = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { deletionRequestedAt: true, deletedAt: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Account is al verwijderd.',
        })
      }
      if (existing.deletionRequestedAt) {
        // Idempotent — return nieuw confirmation-moment
        const cutoff = new Date(
          existing.deletionRequestedAt.getTime() + GRACE_PERIOD_DAYS * 86400 * 1000,
        )
        return {
          ok: true,
          deletionScheduledAt: cutoff,
          gracePeriodDays: GRACE_PERIOD_DAYS,
          alreadyRequested: true,
        }
      }

      const requestedAt = new Date()
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: requestedAt },
      })

      await auditLog({
        event: 'ACCOUNT_DELETION_REQUESTED',
        userId,
        actorEmail: ctx.user!.email,
        metadata: { reason: input.reason ?? null, gracePeriodDays: GRACE_PERIOD_DAYS },
        req: ctx.req,
      })

      const cutoff = new Date(requestedAt.getTime() + GRACE_PERIOD_DAYS * 86400 * 1000)
      return {
        ok: true,
        deletionScheduledAt: cutoff,
        gracePeriodDays: GRACE_PERIOD_DAYS,
        alreadyRequested: false,
      }
    }),

  /**
   * Tijdens grace-period — patiënt trekt verzoek in.
   */
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user!.id
    const existing = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true, deletedAt: true },
    })
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
    if (existing.deletedAt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Account is al definitief verwijderd; niet meer terug te draaien.',
      })
    }
    if (!existing.deletionRequestedAt) {
      return { ok: true, wasActive: false }
    }

    await ctx.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    })

    await auditLog({
      event: 'ACCOUNT_DELETION_CANCELLED',
      userId,
      actorEmail: ctx.user!.email,
      req: ctx.req,
    })

    return { ok: true, wasActive: true }
  }),

  /**
   * Status van deletion-flow — handig voor patient-settings UI.
   */
  deletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user!.id },
      select: { deletionRequestedAt: true, deletedAt: true },
    })
    if (!user) return { requestedAt: null, scheduledAt: null, gracePeriodDays: GRACE_PERIOD_DAYS }
    const scheduledAt = user.deletionRequestedAt
      ? new Date(user.deletionRequestedAt.getTime() + GRACE_PERIOD_DAYS * 86400 * 1000)
      : null
    return {
      requestedAt: user.deletionRequestedAt,
      scheduledAt,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    }
  }),

  /**
   * Admin: finaliseer verwijdering — verwijdert Supabase-user + alle patient-data
   * cascading. Alleen voor users wiens grace-period voorbij is.
   *
   * Bedoeld om via een cron-job of handmatig te draaien. Nu admin-only procedure.
   */
  confirmDeletion: mfaAdminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!user.deletionRequestedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Deze gebruiker heeft geen deletion-verzoek.',
        })
      }
      const now = Date.now()
      const cutoff =
        user.deletionRequestedAt.getTime() + GRACE_PERIOD_DAYS * 86400 * 1000
      if (now < cutoff) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Grace-period nog niet afgelopen. Wacht tot ${new Date(cutoff).toISOString()}.`,
        })
      }

      // Markeer soft-delete. Cascading hard-delete via Prisma onDelete: Cascade
      // is al ingesteld op de meeste relations; we doen hier alleen de user.
      // Full hard-delete via Supabase + cascade:
      const admin = getSupabaseAdmin()

      // Stap 1: Supabase-auth user verwijderen (als we supabase-admin hebben)
      if (admin) {
        try {
          const { data: sb } = await admin.auth.admin.listUsers()
          const supaUser = sb.users.find((u) => u.email === user.email)
          if (supaUser) {
            await admin.auth.admin.deleteUser(supaUser.id)
          }
        } catch (err) {
          console.warn('[gdpr.confirmDeletion] supabase-delete failed:', (err as Error).message)
          // We gaan door met Prisma-delete alsnog
        }
      }

      // Stap 2: Prisma hard-delete (cascade via schema)
      await ctx.prisma.user.delete({ where: { id: user.id } })

      await auditLog({
        event: 'ACCOUNT_DELETED',
        actorEmail: ctx.user!.email, // admin die de actie uitvoert
        resource: 'User',
        resourceId: user.id,
        metadata: {
          originalEmail: user.email,
          requestedAt: user.deletionRequestedAt.toISOString(),
        },
        req: ctx.req,
      })

      return { ok: true }
    }),

  /**
   * Admin: lijst alle lopende deletion-requests zodat ze afgehandeld kunnen worden.
   */
  listPendingDeletions: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      where: { deletionRequestedAt: { not: null }, deletedAt: null },
      orderBy: { deletionRequestedAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        deletionRequestedAt: true,
      },
    })
    return users.map((u) => ({
      ...u,
      scheduledAt: u.deletionRequestedAt
        ? new Date(u.deletionRequestedAt.getTime() + GRACE_PERIOD_DAYS * 86400 * 1000)
        : null,
    }))
  }),
})
