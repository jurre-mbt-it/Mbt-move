/**
 * Kinvent-router: aanmelden, koppelen en metingen ophalen.
 *
 * Toegangsmodel: therapistProcedure, en per patiënt via de gedeelde
 * `hasPatientAccess()`. Niet zelf een where-clause schrijven; dat is precies
 * hoe de praktijk-tak eerder naar de verkeerde rollen lekte (zie AGENTS.md).
 *
 * De aanmelding is één per praktijk (KinventConnection). Kinvent kent geen
 * service-credential en het JWT is niet te verversen zonder de tweede factor,
 * dus elke 31 dagen tikt een therapeut een code over. Wie dat doet staat in
 * `connectedById`; de rest van de praktijk werkt op dezelfde verbinding.
 *
 * Twee dingen die dit bestand bewust NIET doet:
 *
 *   - Patiëntgegevens overnemen. Niet elke Kinvent-patiënt hoort in BASE thuis.
 *     We bewaren alleen `User.kinventParticipantCode`; naam, geboortedatum,
 *     e-mail en foto blijven bij Kinvent. De participantenlijst wordt alleen op
 *     het koppelmoment opgehaald zodat de therapeut kan kiezen, en nergens
 *     opgeslagen of gelogd.
 *
 *   - Zelf besluiten wat er in het dossier komt. `pullForPatient` haalt op en
 *     geeft een voorstel terug; pas een aparte commit schrijft weg, na een
 *     keuze van de therapeut. Handmatig invoeren blijft daarmee overal
 *     mogelijk en een import overschrijft nooit stilzwijgend een ingetypte
 *     waarde.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'
import { hasPatientAccess } from '@/server/lib/patient-access'
import { auditLog } from '@/server/audit'
import {
  KinventError,
  analyzeProtocols,
  completeSecondFactor,
  fetchDeletedProtocolCodes,
  fetchProtocolsForParticipant,
  requestSecondFactor,
  searchParticipants,
} from '@/lib/kinvent/client'
import { decryptToken, encryptToken, jwtExpiry } from '@/lib/kinvent/crypto'
import { buildCandidates, type ImportCandidate } from '@/lib/kinvent/candidates'

export type { ImportCandidate } from '@/lib/kinvent/candidates'

type Prisma = typeof import('@/lib/prisma').prisma
type Ctx = { prisma: Prisma; user: { id: string; role: string; practiceId: string | null } }

/** Zoveel dagen vóór het verlopen begint de vraag om opnieuw aan te melden. */
const RENEW_WARNING_DAYS = 5

/** Zet een Kinvent-fout om in iets dat de therapeut kan lezen. */
function toTRPC(err: unknown): never {
  if (err instanceof KinventError) {
    throw new TRPCError({
      code: err.needsSignIn ? 'PRECONDITION_FAILED' : 'BAD_GATEWAY',
      message: err.message,
    })
  }
  throw err
}

function practiceOf(user: Ctx['user']): string {
  if (!user.practiceId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Kinvent is aan een praktijk gekoppeld, niet aan een los account.' })
  }
  return user.practiceId
}

async function assertAccess(prisma: Prisma, user: Ctx['user'], patientId: string) {
  if (!(await hasPatientAccess(prisma, user, patientId))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen toegang tot deze patiënt' })
  }
}

/**
 * Het bewaarde JWT van deze praktijk, of een duidelijke fout als er geen
 * (geldige) aanmelding is. Het token zelf verlaat de server nooit.
 */
async function tokenFor(ctx: Ctx): Promise<string> {
  const practiceId = practiceOf(ctx.user)
  const conn = await ctx.prisma.kinventConnection.findUnique({ where: { practiceId } })
  if (!conn) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'De praktijk is nog niet aangemeld bij Kinvent.' })
  }
  if (conn.tokenExpiresAt <= new Date()) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'De Kinvent-aanmelding is verlopen. Meld opnieuw aan.' })
  }
  return decryptToken(conn.token)
}

/** Bewaart een vers JWT versleuteld, met de vervaldatum uit het token zelf. */
async function storeToken(ctx: Ctx, token: string) {
  const practiceId = practiceOf(ctx.user)
  const expiresAt = jwtExpiry(token)
  if (!expiresAt) {
    throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Kinvent gaf een token zonder vervaldatum terug.' })
  }
  await ctx.prisma.kinventConnection.upsert({
    where: { practiceId },
    create: { practiceId, token: encryptToken(token), tokenExpiresAt: expiresAt, connectedById: ctx.user.id },
    update: { token: encryptToken(token), tokenExpiresAt: expiresAt, connectedById: ctx.user.id, connectedAt: new Date(), lastError: null },
  })
  await auditLog({ event: 'KINVENT_SIGNED_IN', userId: ctx.user.id, resource: 'practice', resourceId: practiceId })
  return { expiresAt }
}

/** Een mislukte call met verlopen token noteren, zodat de status het toont. */
async function noteError(ctx: Ctx, err: unknown) {
  if (err instanceof KinventError && ctx.user.practiceId) {
    await ctx.prisma.kinventConnection.updateMany({
      where: { practiceId: ctx.user.practiceId },
      data: { lastError: err.message },
    })
  }
}


export const kinventRouter = createTRPCRouter({
  // ── Aanmelding van de praktijk ─────────────────────────────────────────────

  connectionStatus: therapistProcedure.query(async ({ ctx }) => {
    const practiceId = practiceOf(ctx.user)
    const conn = await ctx.prisma.kinventConnection.findUnique({
      where: { practiceId },
      select: { tokenExpiresAt: true, connectedAt: true, connectedById: true, lastUsedAt: true, lastError: true },
    })
    if (!conn) return { connected: false as const }
    const msLeft = conn.tokenExpiresAt.getTime() - Date.now()
    const daysLeft = Math.max(0, Math.floor(msLeft / 86_400_000))
    const connectedBy = await ctx.prisma.user.findUnique({
      where: { id: conn.connectedById },
      select: { name: true },
    })
    return {
      connected: msLeft > 0,
      expiresAt: conn.tokenExpiresAt,
      daysLeft,
      needsRenewal: daysLeft <= RENEW_WARNING_DAYS,
      connectedAt: conn.connectedAt,
      connectedByName: connectedBy?.name ?? null,
      lastUsedAt: conn.lastUsedAt,
      lastError: conn.lastError,
    }
  }),

  /**
   * Stap 1: laat Kinvent de code versturen. Staat 2FA uit op het account, dan
   * is de aanmelding hiermee meteen rond.
   */
  startSignIn: therapistProcedure.mutation(async ({ ctx }) => {
    practiceOf(ctx.user)
    try {
      const result = await requestSecondFactor()
      if (result.kind === 'signed-in') {
        const { expiresAt } = await storeToken(ctx, result.token)
        return { done: true as const, expiresAt }
      }
      return { done: false as const, method: result.method }
    } catch (err) {
      toTRPC(err)
    }
  }),

  /** Stap 2: de code uit mail of sms. */
  completeSignIn: therapistProcedure
    .input(z.object({ code: z.string().trim().min(4).max(12) }))
    .mutation(async ({ ctx, input }) => {
      practiceOf(ctx.user)
      try {
        const token = await completeSecondFactor(input.code)
        return await storeToken(ctx, token)
      } catch (err) {
        toTRPC(err)
      }
    }),

  disconnect: therapistProcedure.mutation(async ({ ctx }) => {
    const practiceId = practiceOf(ctx.user)
    await ctx.prisma.kinventConnection.deleteMany({ where: { practiceId } })
    await auditLog({ event: 'KINVENT_SIGNED_OUT', userId: ctx.user.id, resource: 'practice', resourceId: practiceId })
    return { ok: true }
  }),

  // ── Koppelen van een patiënt ───────────────────────────────────────────────

  /**
   * Zoek een Kinvent-profiel op naam, voor het koppelmoment.
   *
   * Kinvent filtert zelf op naam, dus alleen de treffers gaan over de lijn.
   * We geven alleen terug wat nodig is om de juiste persoon aan te wijzen; bij
   * naamgenoten is het geboortejaar het enige onderscheid, dus dat gaat mee.
   */
  searchParticipants: therapistProcedure
    .input(z.object({ query: z.string().min(2).max(60) }))
    .query(async ({ ctx, input }) => {
      try {
        const hits = await searchParticipants(await tokenFor(ctx), input.query.trim())
        return hits.map((p) => ({
          code: p.code,
          name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
          birthYear: p.dateOfBirth ? new Date(p.dateOfBirth).getUTCFullYear() : null,
          // Kinvent legt het toezien op consent bij ons. Zonder vastgelegde
          // consent koppelen mag, maar de therapeut moet het zien.
          consentRecorded: p.consentRecorded,
        }))
      } catch (err) {
        await noteError(ctx, err)
        toTRPC(err)
      }
    }),

  linkStatus: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertAccess(ctx.prisma, ctx.user, input.patientId)
      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { kinventParticipantCode: true, kinventLinkedAt: true },
      })
      const sync = await ctx.prisma.kinventSync.findUnique({
        where: { patientId: input.patientId },
        select: { lastSyncAt: true, lastError: true },
      })
      return {
        linked: !!patient?.kinventParticipantCode,
        linkedAt: patient?.kinventLinkedAt ?? null,
        lastSyncAt: sync?.lastSyncAt ?? null,
        lastError: sync?.lastError ?? null,
      }
    }),

  link: therapistProcedure
    .input(z.object({ patientId: z.string(), participantCode: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAccess(ctx.prisma, ctx.user, input.patientId)
      // `kinventParticipantCode` is uniek: één Kinvent-profiel hoort bij hooguit
      // één BASE-dossier, anders lopen metingen in twee dossiers door elkaar.
      const taken = await ctx.prisma.user.findUnique({
        where: { kinventParticipantCode: input.participantCode },
        select: { id: true },
      })
      if (taken && taken.id !== input.patientId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Dit Kinvent-profiel is al aan een andere patiënt gekoppeld.' })
      }
      await ctx.prisma.user.update({
        where: { id: input.patientId },
        data: { kinventParticipantCode: input.participantCode, kinventLinkedAt: new Date(), kinventLinkedById: ctx.user.id },
      })
      await ctx.prisma.kinventSync.upsert({
        where: { patientId: input.patientId },
        create: { patientId: input.patientId },
        update: { lastError: null },
      })
      await auditLog({ event: 'KINVENT_LINKED', userId: ctx.user.id, resource: 'user', resourceId: input.patientId })
      return { ok: true }
    }),

  unlink: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertAccess(ctx.prisma, ctx.user, input.patientId)
      await ctx.prisma.user.update({
        where: { id: input.patientId },
        data: { kinventParticipantCode: null, kinventLinkedAt: null, kinventLinkedById: null },
      })
      await ctx.prisma.kinventSync.deleteMany({ where: { patientId: input.patientId } })
      await auditLog({ event: 'KINVENT_UNLINKED', userId: ctx.user.id, resource: 'user', resourceId: input.patientId })
      return { ok: true }
    }),

  // ── Metingen ophalen ───────────────────────────────────────────────────────

  /**
   * Haalt nieuwe metingen op en geeft ze terug als voorstel. Schrijft niets.
   *
   * `since` staat standaard op de laatst gebruikte timestamp; met `all` haal je
   * de volledige historie op, wat we bij een verse koppeling één keer doen.
   */
  pullForPatient: therapistProcedure
    .input(z.object({ patientId: z.string(), all: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }): Promise<{ candidates: ImportCandidate[]; removedProtocolCodes: string[] }> => {
      await assertAccess(ctx.prisma, ctx.user, input.patientId)
      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { kinventParticipantCode: true },
      })
      if (!patient?.kinventParticipantCode) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Deze patiënt is niet gekoppeld aan Kinvent.' })
      }
      const sync = await ctx.prisma.kinventSync.findUnique({ where: { patientId: input.patientId } })
      // BASE legt het lichaamsgewicht van een patiënt nergens vast, dus ijken
      // we op de vorige sprongmeting van dezelfde persoon. Een sprong van een
      // factor 2,2 daarin is de omschakeling naar ponden, geen gewichtstoename.
      const lastJump = await ctx.prisma.kinventJumpResult.findFirst({
        where: { patientId: input.patientId, bodyWeightKg: { not: null } },
        orderBy: { performedAt: 'desc' },
        select: { bodyWeightKg: true },
      })
      const referenceWeight = lastJump?.bodyWeightKg ?? null
      const since = input.all ? 0 : Number(sync?.lastUpdatedAfter ?? 0)

      let protocols
      let deletedProtocolCodes
      let analyses
      try {
        const token = await tokenFor(ctx)
        // De lichte lijst is klein (geen ruwe curves), dus we halen alles op en
        // houden lokaal alleen over wat sinds de vorige ronde is gewijzigd.
        // Verwijderde sessies staan er niet in; die vragen we apart als codes.
        const alle = await fetchProtocolsForParticipant(token, patient.kinventParticipantCode)
        protocols = alle.filter((p) => (p.updatedOn ?? 0) > since)
        deletedProtocolCodes = await fetchDeletedProtocolCodes(token, patient.kinventParticipantCode)
        analyses = protocols.length ? await analyzeProtocols(token, protocols.map((p) => p.code)) : []
        await ctx.prisma.kinventConnection.updateMany({
          where: { practiceId: ctx.user.practiceId ?? '' },
          data: { lastUsedAt: new Date() },
        })
      } catch (err) {
        await noteError(ctx, err)
        await ctx.prisma.kinventSync.updateMany({
          where: { patientId: input.patientId },
          data: { lastError: err instanceof Error ? err.message : 'Onbekende fout' },
        })
        toTRPC(err)
      }

      // Wat al eens is geïmporteerd, markeren we in plaats van te verbergen:
      // de therapeut ziet zo dat een meting bekend is en kan hem overslaan.
      const [entries, jumps] = await Promise.all([
        ctx.prisma.testReportEntry.findMany({
          where: { report: { patientId: input.patientId }, kinventActivityCode: { not: null } },
          select: { kinventActivityCode: true, kinventProtocolCode: true },
        }),
        ctx.prisma.kinventJumpResult.findMany({
          where: { patientId: input.patientId },
          select: { protocolCode: true, activityCode: true },
        }),
      ])
      const knownActivityCodes = new Set<string>([
        ...entries.flatMap((e) => (e.kinventActivityCode ? [e.kinventActivityCode] : [])),
        ...jumps.map((j) => j.activityCode),
      ])
      const knownProtocolCodes = new Set<string>([
        ...entries.flatMap((e) => (e.kinventProtocolCode ? [e.kinventProtocolCode] : [])),
        ...jumps.map((j) => j.protocolCode),
      ])

      const { candidates, removedProtocolCodes } = buildCandidates({
        protocols,
        analyses,
        knownActivityCodes,
        knownProtocolCodes,
        deletedProtocolCodes,
        referenceWeightKg: referenceWeight,
      })
      return { candidates, removedProtocolCodes }
    }),
})
