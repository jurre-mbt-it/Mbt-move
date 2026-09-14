/**
 * Kinvent-router: aanmelden, koppelen en metingen ophalen.
 *
 * Toegangsmodel: therapistProcedure, en per patiënt via de gedeelde
 * `hasPatientAccess()`. Niet zelf een where-clause schrijven; dat is precies
 * hoe de praktijk-tak eerder naar de verkeerde rollen lekte (zie AGENTS.md).
 *
 * De aanmelding is één per praktijk (KinventConnection). Kinvent kent geen
 * service-credential en het JWT is niet te verversen zonder de tweede factor,
 * dus elke 31 dagen typt een therapeut e-mail, wachtwoord en code van het
 * praktijkaccount over. Die gegevens gaan één keer door naar Kinvent en worden
 * niet bewaard; alleen het JWT, versleuteld. Wie aanmeldde staat in
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
import { createTRPCRouter, protectedProcedure, therapistProcedure } from '@/server/trpc'
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
import { kinventCategory, kinventLabel, kinventSource } from '@/lib/kinvent/labels'
import { kgToNewton, rond } from '@/lib/kinvent/units'
import { syncCriteriaVoorEntry } from '@/server/lib/rehab-criterion-sync'
import { specFromCatalog } from './testReports'
import type { TestCatalogItem } from '@prisma/client'

export type { ImportCandidate } from '@/lib/kinvent/candidates'

type Prisma = typeof import('@/lib/prisma').prisma
type Ctx = { prisma: Prisma; user: { id: string; role: string; practiceId: string | null } }

/** Zoveel dagen vóór het verlopen begint de vraag om opnieuw aan te melden. */
const RENEW_WARNING_DAYS = 5

/** Inloggegevens van het praktijkaccount; alleen doorgeven, nooit opslaan of loggen. */
const credentialsInput = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
})

const sleutel = (c: { protocolCode: string; activityCode: string }) => `${c.protocolCode}/${c.activityCode}`

/**
 * Een kandidaat als rapportregel die aan een catalogustest hangt. De regel
 * neemt de spec van de catalogus over (zones, eenheid, metric), zodat het
 * gekoppelde rehab-criterium erop kan rekenen. Staat de catalogustest in
 * Newton, dan rekenen we Kinvents kilogrammen om; dat is de enige plek waar
 * dat gebeurt.
 */
function entryFromCatalog(reportId: string, c: ImportCandidate, order: number, item: TestCatalogItem) {
  const spec = specFromCatalog(item)
  const inNewton = /^n(ewton)?$/i.test(item.unitPrimary ?? '')
  const omzet = (v: number | null) => rond(v === null ? null : inNewton ? kgToNewton(v) : v)
  const isJump = c.kind === 'JUMP'
  const enkel = c.single ?? (c.left === null || c.right === null ? Math.max(c.left ?? 0, c.right ?? 0) : null)
  const notes =
    [
      c.unit.status === 'suspect' ? `Eenheidscontrole: ${c.unit.reason}` : null,
      !isJump && inNewton ? 'Uit Kinvent in kg, omgerekend naar N (×9,80665).' : null,
    ]
      .filter(Boolean)
      .join(' ') || null
  return {
    reportId,
    order,
    catalogItemId: item.id,
    ...spec,
    leftPrimary: isJump ? null : omzet(c.left),
    rightPrimary: isJump ? null : omzet(c.right),
    singleValue: isJump ? rond(c.jumpHeightCm) : spec.kind === 'SINGLE' ? omzet(enkel) : null,
    notes,
    kinventProtocolCode: c.protocolCode,
    kinventActivityCode: c.activityCode,
    kinventRepCode: null,
    importedAt: new Date(),
    importedUnit: isJump ? 'cm' : 'kg',
  }
}

/** Sprongen en krachttests met herhalingen, nieuwste eerst. */
async function metingenVan(prisma: Prisma, patientId: string) {
  const [jumps, strength] = await Promise.all([
    prisma.kinventJumpResult.findMany({
      where: { patientId },
      orderBy: { performedAt: 'desc' },
      take: 300,
      include: { reps: { orderBy: { ordinal: 'asc' } } },
    }),
    prisma.kinventStrengthResult.findMany({
      where: { patientId },
      orderBy: { performedAt: 'desc' },
      take: 300,
      include: { reps: { orderBy: { ordinal: 'asc' } } },
    }),
  ])
  return { jumps, strength }
}

/** Laatst bekende lichaamsgewicht van deze patiënt uit Kinvent, als ijkpunt. */
async function referenceWeightFor(prisma: Prisma, patientId: string): Promise<number | null> {
  const last = await prisma.kinventJumpResult.findFirst({
    where: { patientId, bodyWeightKg: { not: null } },
    orderBy: { performedAt: 'desc' },
    select: { bodyWeightKg: true },
  })
  return last?.bodyWeightKg ?? null
}

/**
 * Een krachtkandidaat als rapportregel. Bilateraal met LSI waar links én
 * rechts er zijn, anders een enkele waarde in kg. Drempels zijn de standaard
 * van het rapport; de therapeut past ze aan zoals bij een handmatige regel.
 */
function entryFromCandidate(reportId: string, c: ImportCandidate, order: number) {
  const bilateral = c.left !== null && c.right !== null
  const value = c.single ?? Math.max(c.left ?? 0, c.right ?? 0)
  return {
    reportId,
    order,
    category: kinventCategory(c.exerciseType),
    categoryOrder: 10,
    name: kinventLabel(c.title),
    subtitle: null,
    source: kinventSource(c.deviceType, c.exerciseType),
    kind: bilateral ? ('BILATERAL' as const) : ('SINGLE' as const),
    metric: bilateral ? ('LSI' as const) : ('VALUE' as const),
    unitPrimary: 'kg',
    unitSecondary: null,
    plotUnit: bilateral ? '%' : 'kg',
    axisMin: bilateral ? 60 : 0,
    axisMax: bilateral ? 100 : Math.max(10, Math.ceil((value * 1.25) / 5) * 5),
    zoneOrangeMin: bilateral ? 80 : 0,
    zoneGreenMin: bilateral ? 90 : 0,
    higherIsBetter: true,
    leftPrimary: rond(c.left),
    rightPrimary: rond(c.right),
    singleValue: bilateral ? null : rond(value),
    notes: c.unit.status === 'suspect' ? `Eenheidscontrole: ${c.unit.reason}` : null,
    kinventProtocolCode: c.protocolCode,
    kinventActivityCode: c.activityCode,
    kinventRepCode: null,
    importedAt: new Date(),
    importedUnit: 'kg',
  }
}

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
  startSignIn: therapistProcedure.input(credentialsInput).mutation(async ({ ctx, input }) => {
    practiceOf(ctx.user)
    try {
      const result = await requestSecondFactor(input)
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
    .input(credentialsInput.extend({ code: z.string().trim().min(4).max(12) }))
    .mutation(async ({ ctx, input }) => {
      practiceOf(ctx.user)
      try {
        const token = await completeSecondFactor({ email: input.email, password: input.password }, input.code)
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
        select: { lastSyncAt: true, lastError: true, pendingCount: true, lastCheckedAt: true },
      })
      return {
        linked: !!patient?.kinventParticipantCode,
        linkedAt: patient?.kinventLinkedAt ?? null,
        lastSyncAt: sync?.lastSyncAt ?? null,
        lastError: sync?.lastError ?? null,
        /** Protocollen bij Kinvent waarvan nog niets in BASE staat. */
        pendingCount: sync?.pendingCount ?? 0,
        lastCheckedAt: sync?.lastCheckedAt ?? null,
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
      // BASE legt zelf geen lichaamsgewicht vast; de vorige Kinvent-meting van
      // dezelfde persoon is het ijkpunt voor de eenheidscontrole.
      const referenceWeight = await referenceWeightFor(ctx.prisma, input.patientId)
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
      const pending = new Set(candidates.filter((c) => !c.alreadyImported).map((c) => c.protocolCode)).size
      await ctx.prisma.kinventSync.upsert({
        where: { patientId: input.patientId },
        create: { patientId: input.patientId, pendingCount: pending, lastCheckedAt: new Date() },
        update: { pendingCount: pending, lastCheckedAt: new Date(), lastError: null },
      })
      return { candidates, removedProtocolCodes }
    }),

  /**
   * Schrijft gekozen kandidaten weg, ná bevestiging door de therapeut.
   *
   * We vertrouwen geen cijfers van de client: de gekozen protocollen worden
   * opnieuw bij Kinvent opgehaald en het voorstel wordt opnieuw opgebouwd,
   * zodat wat in het dossier komt altijd rechtstreeks van Kinvent komt.
   * Krachttests worden regels in het opgegeven testrapport, sprongen gaan
   * naar de sprongtabel. Wat al in het rapport staat wordt overgeslagen,
   * nooit overschreven.
   */
  commitImport: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        reportId: z.string().nullable(),
        items: z
          .array(
            z.object({
              protocolCode: z.string(),
              activityCode: z.string(),
              /** Catalogustest waar de regel aan moet hangen; dan werkt het rehab-criterium mee. */
              catalogItemId: z.string().nullable().optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAccess(ctx.prisma, ctx.user, input.patientId)
      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { kinventParticipantCode: true },
      })
      if (!patient?.kinventParticipantCode) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Deze patiënt is niet gekoppeld aan Kinvent.' })
      }
      // Catalogustests alleen uit de eigen praktijk of de globale seed, anders
      // is elke catalogus-id van elke praktijk via een geraden id te gebruiken.
      const gekozenCatalogus = new Map(
        input.items.flatMap((i) => (i.catalogItemId ? [[sleutel(i), i.catalogItemId] as const] : [])),
      )
      const catalogusItems = gekozenCatalogus.size
        ? await ctx.prisma.testCatalogItem.findMany({
            where: {
              id: { in: [...new Set(gekozenCatalogus.values())] },
              OR: ctx.user.practiceId ? [{ practiceId: null }, { practiceId: ctx.user.practiceId }] : [{ practiceId: null }],
            },
          })
        : []
      const catalogusById = new Map(catalogusItems.map((c) => [c.id, c]))
      if (input.reportId) {
        const report = await ctx.prisma.testReport.findUnique({
          where: { id: input.reportId },
          select: { patientId: true },
        })
        if (!report || report.patientId !== input.patientId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Testrapport niet gevonden bij deze patiënt.' })
        }
      }

      const gekozen = new Set(input.items.map((i) => `${i.protocolCode}/${i.activityCode}`))
      const codes = new Set(input.items.map((i) => i.protocolCode))
      const referenceWeight = await referenceWeightFor(ctx.prisma, input.patientId)

      let candidates: ImportCandidate[]
      try {
        const token = await tokenFor(ctx)
        const alle = await fetchProtocolsForParticipant(token, patient.kinventParticipantCode)
        const protocols = alle.filter((p) => codes.has(p.code))
        const analyses = await analyzeProtocols(token, protocols.map((p) => p.code))
        candidates = buildCandidates({
          protocols,
          analyses,
          knownActivityCodes: new Set(),
          knownProtocolCodes: new Set(),
          deletedProtocolCodes: [],
          referenceWeightKg: referenceWeight,
        }).candidates.filter((c) => gekozen.has(`${c.protocolCode}/${c.activityCode}`))
      } catch (err) {
        await noteError(ctx, err)
        toTRPC(err)
      }

      let entries = 0
      let jumps = 0
      let strength = 0
      let skipped = 0

      // Naar het rapport: elke krachttest, plus een sprong als hij aan een
      // catalogustest (CMJ-hoogte) hangt.
      const naarRapport = candidates.filter((c) => c.kind === 'STRENGTH' || gekozenCatalogus.has(sleutel(c)))
      if (naarRapport.length > 0) {
        if (!input.reportId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Kies een testrapport voor de krachttests.' })
        }
        const reportId = input.reportId
        const bestaand = new Set(
          (
            await ctx.prisma.testReportEntry.findMany({
              where: { reportId, kinventActivityCode: { in: naarRapport.map((c) => c.activityCode) } },
              select: { kinventActivityCode: true },
            })
          ).map((e) => e.kinventActivityCode),
        )
        const max = await ctx.prisma.testReportEntry.aggregate({ where: { reportId }, _max: { order: true } })
        let order = (max._max.order ?? -1) + 1
        for (const c of naarRapport) {
          if (bestaand.has(c.activityCode)) {
            skipped++
            continue
          }
          const item = catalogusById.get(gekozenCatalogus.get(sleutel(c)) ?? '') ?? null
          const e = await ctx.prisma.testReportEntry.create({
            data: item ? entryFromCatalog(reportId, c, order++, item) : entryFromCandidate(reportId, c, order++),
            select: { id: true },
          })
          entries++
          // Zelfde doorwerking als bij een handmatig opgeslagen regel: het
          // gekoppelde criterium in het lopende traject kleurt mee.
          if (item) {
            void syncCriteriaVoorEntry(ctx.prisma, e.id, ctx.user.id).catch((err) =>
              console.error('[kinvent] criteria-sync mislukt', err),
            )
          }
        }
      }

      for (const c of candidates) {
        if (c.kind !== 'JUMP' || !c.jump) continue
        const j = c.jump
        await ctx.prisma.$transaction(async (tx) => {
          const data = {
            patientId: input.patientId,
            activityCode: c.activityCode,
            performedAt: c.performedAt,
            jumpType: j.jumpType,
            variant: j.variant,
            bodyWeightKg: j.bodyWeightKg,
            gravityRatio: j.gravityRatio,
            numberOfJumps: j.numberOfJumps,
            peakJumpHeightCm: j.peakJumpHeightCm ?? c.jumpHeightCm,
            heightAverageCm: j.heightAverageCm,
            rsi: j.rsi ?? c.rsi,
            mrsi: j.mrsi,
            fatigueIndex: j.fatigueIndex,
          }
          const result = await tx.kinventJumpResult.upsert({
            where: { protocolCode: c.protocolCode },
            create: { protocolCode: c.protocolCode, ...data },
            update: data,
          })
          await tx.kinventJumpRep.deleteMany({ where: { resultId: result.id } })
          await tx.kinventJumpRep.createMany({
            data: j.reps.map((r, i) => ({
              resultId: result.id,
              ordinal: i + 1,
              repCode: r.repCode,
              side: r.side,
              jumpHeightCm: r.jumpHeightCm,
              jumpHeightByVelocityCm: r.jumpHeightByVelocityCm,
              flightTimeMs: r.flightTimeMs,
              contactTimeMs: r.contactTimeMs,
              peakForceN: r.peakForceN,
              peakForceLeftN: r.peakForceLeftN,
              peakForceRightN: r.peakForceRightN,
              netMaxForceN: r.netMaxForceN,
              maxPowerW: r.maxPowerW,
              rsi: r.rsi,
              timeToStabilizeMs: r.timeToStabilizeMs,
              propulsiveImpulsePhase1: r.propulsiveImpulsePhase1,
              propulsiveImpulsePhase2: r.propulsiveImpulsePhase2,
              rfdTotal: r.rfdTotal,
              rfdLeft: r.rfdLeft,
              rfdRight: r.rfdRight,
            })),
          })
        })
        jumps++
      }

      // Krachtdetails altijd, ook als de rapportregel al bestond: zo is een
      // eerdere import aan te vullen zonder het rapport te raken.
      for (const c of candidates) {
        if (c.kind !== 'STRENGTH' || !c.strength) continue
        const st = c.strength
        await ctx.prisma.$transaction(async (tx) => {
          const data = {
            patientId: input.patientId,
            protocolCode: c.protocolCode,
            performedAt: c.performedAt,
            exerciseType: c.exerciseType,
            title: c.title,
            deviceType: c.deviceType,
            leftMaxKg: rond(st.left),
            rightMaxKg: rond(st.right),
            singleMaxKg: rond(st.single),
          }
          const result = await tx.kinventStrengthResult.upsert({
            where: { activityCode: c.activityCode },
            create: { activityCode: c.activityCode, ...data },
            update: data,
          })
          await tx.kinventStrengthRep.deleteMany({ where: { resultId: result.id } })
          await tx.kinventStrengthRep.createMany({
            data: st.reps.map((r, i) => ({
              resultId: result.id,
              ordinal: i + 1,
              repCode: r.repCode,
              side: r.side,
              maxKg: r.maxKg,
              averageKg: r.averageKg,
              rfdToMax: r.rfdToMax,
              rfdAverage: r.rfdAverage,
              timeToMaxMs: r.timeToMaxMs,
              impulseNs: r.impulseNs,
            })),
          })
        })
        strength++
      }

      await ctx.prisma.kinventSync.upsert({
        where: { patientId: input.patientId },
        create: { patientId: input.patientId, lastSyncAt: new Date() },
        update: { lastSyncAt: new Date(), lastError: null, pendingCount: { decrement: new Set(candidates.map((c) => c.protocolCode)).size } },
      })
      await ctx.prisma.kinventSync.updateMany({ where: { patientId: input.patientId, pendingCount: { lt: 0 } }, data: { pendingCount: 0 } })
      await auditLog({ event: 'KINVENT_IMPORTED', userId: ctx.user.id, resource: 'user', resourceId: input.patientId })
      return { entries, jumps, strength, skipped }
    }),

  /** Geïmporteerde sprongen en krachttests van een patiënt, nieuwste eerst. Alleen tonen. */
  measurementsForPatient: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertAccess(ctx.prisma, ctx.user, input.patientId)
      return metingenVan(ctx.prisma, input.patientId)
    }),

  /** Dezelfde metingen voor de ingelogde patiënt of atleet zelf (app en atleetportaal). */
  myMeasurements: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'PATIENT' && ctx.user.role !== 'ATHLETE') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Alleen voor de patiënt of atleet zelf.' })
    }
    return metingenVan(ctx.prisma, ctx.user.id)
  }),
})
