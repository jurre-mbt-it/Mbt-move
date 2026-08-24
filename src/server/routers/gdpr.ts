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
import { deregisterPolarForUser } from '@/server/wearables/polar/sync'
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
      painEntries,
      messages,
      notifications,
      weekSchedules,
      researchConsent,
      favoriteExercises,
      auditLogs,
      dpaRecords,
      careStatuses,
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
          cohortAnalyticsOptIn: true,
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
      ctx.prisma.painEntry.findMany({ where: { userId } }),
      ctx.prisma.message.findMany({
        where: { OR: [{ patientId: userId }, { authorId: userId }] },
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
      // Behandelstatus: wanneer een praktijk of coach de behandeling afsloot,
      // waarom, en de vrije toelichting daarbij. Dat laatste is een klinisch
      // oordeel over de betrokkene en valt daarmee onder art. 15; het staat
      // bewust NIET in de audit-log (audit.ts:7-8 verbiedt PII in metadata),
      // dus deze export is de enige plek waar de betrokkene er bij kan.
      //
      // Alle rijen, ook de gereactiveerde: `reactivatedAt` is gevuld zodra
      // iemand weer in behandeling is genomen, en die eerdere periodes horen
      // net zo goed bij zijn gegevens. Geen careScopeWhereForRead hier: dat
      // filter scopet op de LEZER, en de lezer is hier de betrokkene zelf.
      //
      // `dischargedBy`/`reactivatedBy` gaan mee als NAAM: wie dit besluit nam
      // is onderdeel van de informatie waar art. 15 recht op geeft, en een kale
      // user-id zegt de betrokkene niets. Het e-mailadres wordt hier alleen
      // opgehaald als terugval voor een behandelaar zonder naam, precies zoals
      // `patients.get` het doet, en haalt de export verder niet (zie
      // `careStatusExport` hieronder). Verder geen velden van die behandelaar.
      ctx.prisma.patientCareStatus.findMany({
        where: { patientId: userId },
        orderBy: { dischargedAt: 'desc' },
        select: {
          id: true,
          dischargedAt: true,
          reason: true,
          note: true,
          reactivatedAt: true,
          createdAt: true,
          updatedAt: true,
          dischargedBy: { select: { name: true, email: true } },
          reactivatedBy: { select: { name: true, email: true } },
        },
      }),
    ])

    if (!user) throw new TRPCError({ code: 'NOT_FOUND' })

    // De behandelaar gaat als naam mee, niet als naam plus werk-e-mailadres.
    // Dat adres voegt voor de betrokkene niets toe aan "wie sloot mijn
    // behandeling af", is een persoonsgegeven van een derde, en dit bestand is
    // een download die overal terecht kan komen. Het adres blijft alleen als
    // terugval staan voor een behandelaar zonder naam, want een leeg veld zegt
    // helemaal niets.
    const careStatusExport = careStatuses.map((c) => ({
      id: c.id,
      dischargedAt: c.dischargedAt,
      reason: c.reason,
      note: c.note,
      reactivatedAt: c.reactivatedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      dischargedByName: c.dischargedBy.name ?? c.dischargedBy.email,
      reactivatedByName: c.reactivatedBy
        ? c.reactivatedBy.name ?? c.reactivatedBy.email
        : null,
    }))

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
      painEntries,
      messages,
      notifications,
      weekSchedules,
      careStatuses: careStatusExport,
      researchConsent,
      favoriteExercises,
      auditLogs,
      anonymousResearchMapping: dpaRecords
        ? { note: 'Er zijn geanonimiseerde onderzoeks-records onder een kettingloze ID, niet in deze export.' }
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
   * Wabvpz art. 15j — inzage in het toegangslogboek van het eigen dossier:
   * "wie heeft mijn dossier wanneer geraadpleegd?".
   *
   * We tonen audit-rijen waar de patiënt het *doelwit* is (`resourceId = ik`),
   * niet waar 'ie zelf de actor is. Bewust beperkt tot de drie inzage-events die
   * gegarandeerd `resourceId = patientId` zetten (zie `patients.ts`); mutatie-
   * events hebben een andere resourceId-semantiek en horen hier niet thuis.
   * De actor (therapeut) wordt via de `user`-relatie opgehaald voor naam/e-mail.
   */
  getMyAccessLog: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.id
    const ACCESS_EVENTS = ['PATIENT_VIEWED', 'PROGRAM_VIEWED', 'SESSION_LOG_VIEWED']
    const ACTION_LABELS: Record<string, string> = {
      PATIENT_VIEWED: 'Dossier ingezien',
      PROGRAM_VIEWED: 'Programma bekeken',
      SESSION_LOG_VIEWED: 'Sessie-log bekeken',
    }

    const rows = await ctx.prisma.auditLog.findMany({
      where: { resourceId: userId, event: { in: ACCESS_EVENTS } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        event: true,
        createdAt: true,
        actorEmail: true,
        user: { select: { name: true, email: true, specialty: true } },
      },
    })

    return rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      event: r.event,
      action: ACTION_LABELS[r.event] ?? r.event,
      // Actor = de therapeut die toegang had. IP/userAgent bewust niet getoond
      // aan de patiënt (dat is locatie-info van de behandelaar).
      actorName: r.user?.name ?? null,
      actorEmail: r.user?.email ?? r.actorEmail ?? null,
      actorSpecialty: r.user?.specialty ?? null,
    }))
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

      // Token ook aan Polar-zijde intrekken; de rij zelf cascadet mee.
      await deregisterPolarForUser(ctx.prisma, user.id)

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
