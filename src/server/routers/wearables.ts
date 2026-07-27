import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import type { PrismaClient } from '@prisma/client'
import {
  createTRPCRouter,
  protectedProcedure,
  assertMfaSatisfied,
  assertStaffMfaEnrolled,
} from '@/server/trpc'
import { computeReadinessFor, READINESS_HISTORY_DAYS } from '@/server/readiness'
import { exertionScore } from '@/lib/exertion'
import { wearablesEnabledForRole } from '@/lib/wearables-access'
import { auditLog } from '@/server/audit'
import { buildAuthorizeUrl, encryptToken, isStravaConfigured, openTokens } from '@/server/wearables/strava/config'
import { syncStravaActivities } from '@/server/wearables/strava/sync'
import { syncHashtagsForLog } from '@/server/tags'

/**
 * Uitrol-gate: wearables is voorlopig alleen voor de admin (zie
 * src/lib/wearables-access.ts). Verbreden = die helper aanpassen, niet hier.
 */
const wearablesProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!wearablesEnabledForRole(ctx.user!.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  // Beide helpers zijn no-ops voor PATIENT/ATHLETE (ze kijken alleen naar
  // STAFF_ROLES), dus een atleet die zijn eigen watch-data leest merkt hier
  // niets van. Voor staff sluit dit het MFA-gat uit audit 2026-07-27, M1.
  assertStaffMfaEnrolled(ctx)
  assertMfaSatisfied(ctx)
  return next({ ctx })
})

/**
 * Wearables-router: leest de gesyncte Apple-Watch-data (slaap, vitals,
 * activiteiten) + de hybride readiness terug voor patiënt/atleet (eigen data)
 * en therapeut (na toegangscheck). Schrijven gebeurt via POST
 * /api/wearable/sync, niet hier.
 */

const SLEEP_DAYS = 30
const VITALS_DAYS = 30
const ACTIVITY_LIMIT = 20
const TREND_DAYS = 30
const STRESS_DAYS = 60

/** Toegang: directe PatientTherapist-koppeling OF zelfde praktijk (ADMIN altijd). */
async function hasPatientAccess(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
): Promise<boolean> {
  if (patientId === user.id) return true
  if (user.role === 'ADMIN') return true
  if (user.role !== 'THERAPIST' && user.role !== 'COACH') return false
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
          },
        },
        // Praktijk-tak alleen voor therapeuten; een coach komt uitsluitend
        // via de directe koppeling binnen.
        ...(user.role === 'THERAPIST' && user.practiceId ? [{ practiceId: user.practiceId }] : []),
      ],
    },
    select: { id: true },
  })
  return !!found
}

function startOfDay(d = new Date()): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Bundel alle wearable-data voor één gebruiker (gedeeld door self + therapeut).
 * Datums worden expliciet als ISO-strings geserialiseerd: de tRPC-client heeft
 * geen superjson-transformer, dus Date-velden komen toch als string binnen —
 * door hier te serialiseren matchen het afgeleide type en de runtime-waarde.
 */
async function buildOverview(prisma: PrismaClient, userId: string) {
  const sleepSince = startOfDay()
  sleepSince.setDate(sleepSince.getDate() - SLEEP_DAYS)
  const vitalsSince = startOfDay()
  vitalsSince.setDate(vitalsSince.getDate() - VITALS_DAYS)
  const trendSince = startOfDay()
  trendSince.setDate(trendSince.getDate() - TREND_DAYS)
  const stressSince = startOfDay()
  stressSince.setDate(stressSince.getDate() - STRESS_DAYS)

  // Slaap en vitals éénmaal ophalen over het ruimste venster: readiness kijkt
  // READINESS_HISTORY_DAYS (70d) terug, het overzicht zelf 30d. We fetchen 70d
  // en filteren het overzicht in-memory — voorheen las computeReadinessFor
  // dezelfde tabellen nogmaals voor een overlappend venster.
  const historySince = startOfDay()
  historySince.setDate(historySince.getDate() - READINESS_HISTORY_DAYS)
  const wideSince = new Date(Math.min(sleepSince.getTime(), vitalsSince.getTime(), historySince.getTime()))

  const sleepPromise = prisma.sleepEntry.findMany({
    where: { userId, date: { gte: wideSince } },
    orderBy: { date: 'asc' },
    select: {
      date: true, startAt: true, endAt: true, inBedMin: true, asleepMin: true,
      awakeMin: true, lightMin: true, deepMin: true, remMin: true,
      efficiency: true, latencyMin: true, qualityScore: true, stages: true,
    },
  })
  const vitalsPromise = prisma.vitalsEntry.findMany({
    where: { userId, date: { gte: wideSince } },
    orderBy: { date: 'asc' },
    select: {
      date: true, hrv: true, hrvType: true, restingHeartRate: true,
      respiratoryRate: true, wristTempDeviation: true, steps: true,
      activeEnergyKcal: true, basalEnergyKcal: true, vo2Max: true,
    },
  })

  const [connection, readiness, sleepAll, vitalsAll, activities, trend, stress, exertion] = await Promise.all([
    prisma.wearableConnection.findUnique({
      where: { userId_provider: { userId, provider: 'APPLE_HEALTH' } },
      select: { provider: true, deviceModel: true, enabled: true, lastSyncAt: true, connectedAt: true },
    }),
    Promise.all([vitalsPromise, sleepPromise]).then(([vitalsRows, sleepRows]) =>
      computeReadinessFor(prisma, userId, new Date(), { vitals: vitalsRows, sleep: sleepRows }),
    ),
    sleepPromise,
    vitalsPromise,
    prisma.cardioLog.findMany({
      where: { patientId: userId, source: { in: ['APPLE_WATCH', 'STRAVA'] } },
      orderBy: { completedAt: 'desc' },
      take: ACTIVITY_LIMIT,
    }),
    prisma.readinessSnapshot.findMany({
      where: { userId, date: { gte: trendSince } },
      orderBy: { date: 'asc' },
      select: { date: true, score: true, band: true },
    }),
    prisma.stressEntry.findMany({
      where: { userId, date: { gte: stressSince } },
      orderBy: { date: 'asc' },
      select: { date: true, avgScore: true, restingHeartRate: true, samples: true, timeInBands: true },
    }),
    prisma.exertionEntry.findMany({
      where: { userId, date: { gte: stressSince } },
      orderBy: { date: 'asc' },
      select: { date: true, trimp: true, activeSec: true, timeInZones: true },
    }),
  ])

  // Het overzicht toont een korter venster dan de readiness-historie.
  const sleep = sleepAll.filter(s => s.date >= sleepSince)
  const vitals = vitalsAll.filter(v => v.date >= vitalsSince)

  return {
    connection: connection
      ? {
          connected: true as const,
          provider: connection.provider,
          deviceModel: connection.deviceModel,
          enabled: connection.enabled,
          lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
          connectedAt: connection.connectedAt.toISOString(),
        }
      : { connected: false as const },
    readiness,
    readinessTrend: trend.map(t => ({ date: isoDay(t.date), score: t.score, band: t.band })),
    sleep: sleep.map(s => ({
      date: isoDay(s.date),
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      inBedMin: s.inBedMin,
      asleepMin: s.asleepMin,
      awakeMin: s.awakeMin,
      lightMin: s.lightMin,
      deepMin: s.deepMin,
      remMin: s.remMin,
      efficiency: s.efficiency,
      latencyMin: s.latencyMin,
      qualityScore: s.qualityScore,
      stages: s.stages as unknown,
    })),
    vitals: vitals.map(v => ({
      date: isoDay(v.date),
      hrv: v.hrv,
      hrvType: v.hrvType,
      restingHeartRate: v.restingHeartRate,
      respiratoryRate: v.respiratoryRate,
      wristTempDeviation: v.wristTempDeviation,
      steps: v.steps,
      activeEnergyKcal: v.activeEnergyKcal,
      basalEnergyKcal: v.basalEnergyKcal,
      vo2Max: v.vo2Max,
    })),
    activities: activities.map(a => ({
      id: a.id,
      activity: a.activity,
      protocol: a.protocol,
      durationSec: a.durationSec,
      distanceM: a.distanceM,
      avgHeartRate: a.avgHeartRate,
      maxHeartRate: a.maxHeartRate,
      calories: a.calories,
      rpe: a.rpe,
      avgPaceSecPerKm: a.avgPaceSecPerKm,
      timeInZones: a.timeInZones as unknown,
      series: a.series as unknown,
      source: a.source,
      feelScore: a.feelScore,
      ratedAt: a.ratedAt ? a.ratedAt.toISOString() : null,
      completedAt: a.completedAt.toISOString(),
    })),
    stress: stress.map(s => ({
      date: isoDay(s.date),
      avgScore: s.avgScore,
      restingHeartRate: s.restingHeartRate,
      samples: s.samples as unknown,
      timeInBands: s.timeInBands as unknown,
    })),
    // Dag-belasting uit continue hartslag (hele etmaal, workouts inbegrepen).
    // Losse readout naast de sRPE-curve, zie src/lib/exertion.ts. De 0-100
    // schaal rekenen we hier zodat de app die logica niet hoeft te dupliceren:
    // elke dag afgezet tegen de p90 van de dagen ervóór.
    exertion: exertion.map((e, i) => ({
      date: isoDay(e.date),
      trimp: e.trimp,
      activeSec: e.activeSec,
      timeInZones: e.timeInZones as unknown,
      score: exertionScore(e.trimp, exertion.slice(0, i).map(p => p.trimp)),
    })),
    // Doelbereik voor vandaag op dezelfde 0-10 schaal, meeschuivend met het
    // herstel (zie de uitleg in de app: goed hersteld → meer ruimte, slecht
    // hersteld → het bereik zakt). Lineair in de readiness-score; zonder
    // readiness valt het bereik weg en toont de app alleen de balk.
    exertionTarget:
      readiness.score == null
        ? null
        : {
            min: Math.round((1.5 + 0.03 * readiness.score) * 10) / 10,
            max: Math.round((2.5 + 0.055 * readiness.score) * 10) / 10,
          },
  }
}

export const wearablesRouter = createTRPCRouter({
  /** Volledig wearable-overzicht voor de ingelogde gebruiker. */
  overview: wearablesProcedure.query(({ ctx }) => buildOverview(ctx.prisma, ctx.user!.id)),

  /** Alleen de readiness van vandaag (lichter, voor dashboard-tegel). */
  readiness: wearablesProcedure.query(({ ctx }) => computeReadinessFor(ctx.prisma, ctx.user!.id)),

  /** Verbindingsstatus (voor de instellingen / connect-flow). */
  connection: wearablesProcedure.query(async ({ ctx }) => {
    const c = await ctx.prisma.wearableConnection.findUnique({
      where: { userId_provider: { userId: ctx.user!.id, provider: 'APPLE_HEALTH' } },
      select: { provider: true, deviceModel: true, enabled: true, lastSyncAt: true, connectedAt: true },
    })
    return c ? { connected: true as const, ...c } : { connected: false as const }
  }),

  /** Verbinding aan/uit zetten of loskoppelen (patient-side beheer). */
  setEnabled: wearablesProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.wearableConnection.updateMany({
        where: { userId: ctx.user!.id, provider: 'APPLE_HEALTH' },
        data: { enabled: input.enabled },
      })
      return { ok: true }
    }),

  // ── Strava (OAuth 2.0 cloud-to-cloud) ──────────────────────────────────────

  /** Geautoriseerde Strava authorize-URL; de app opent 'm in de browser. */
  stravaAuthorizeUrl: wearablesProcedure.query(({ ctx }) => {
    if (!isStravaConfigured()) {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'strava_not_configured' })
    }
    return { url: buildAuthorizeUrl(ctx.user!.id) }
  }),

  /**
   * Claim de tokens uit de verzegelde callback-blob voor de INGELOGDE gebruiker.
   * Dit bindt de koppeling aan de app-sessie i.p.v. aan een (doorstuurbare)
   * OAuth-state — zie strava/config.ts voor het waarom.
   */
  stravaClaim: wearablesProcedure
    .input(z.object({ blob: z.string().min(1).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      const t = openTokens(input.blob)
      if (!t) throw new TRPCError({ code: 'BAD_REQUEST', message: 'invalid_blob' })
      const userId = ctx.user!.id
      const data = {
        athleteId: t.athleteId,
        accessToken: encryptToken(t.accessToken),
        refreshToken: encryptToken(t.refreshToken),
        expiresAt: new Date(t.expiresAt * 1000),
        scope: t.scope,
      }
      try {
        await ctx.prisma.$transaction([
          ctx.prisma.stravaConnection.upsert({
            where: { userId },
            update: data,
            create: { userId, ...data },
          }),
          ctx.prisma.wearableConnection.upsert({
            where: { userId_provider: { userId, provider: 'STRAVA' } },
            update: { enabled: true },
            create: { userId, provider: 'STRAVA', enabled: true, deviceModel: 'Strava' },
          }),
        ])
      } catch (err) {
        // athleteId is uniek: dezelfde Strava-account kan niet aan twee
        // app-accounts hangen.
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
          throw new TRPCError({ code: 'CONFLICT', message: 'athlete_already_linked' })
        }
        throw err
      }
      return { ok: true }
    }),

  /** Strava-koppelingsstatus (voor de integraties-tegel). */
  stravaStatus: wearablesProcedure.query(async ({ ctx }) => {
    const c = await ctx.prisma.stravaConnection.findUnique({
      where: { userId: ctx.user!.id },
      select: { athleteId: true, lastSyncAt: true },
    })
    return { connected: !!c, lastSyncAt: c?.lastSyncAt?.toISOString() ?? null }
  }),

  /** Strava: handmatig (her)synchroniseren van de laatste 30 dagen. */
  stravaSync: wearablesProcedure.mutation(async ({ ctx }) => {
    // Strava's quota is applicatie-breed, niet per gebruiker: zonder limiet kan
    // één account de sync voor alle anderen opbranden (audit 2026-07-27, L5).
    const rl = await rateLimit('wearables.stravaSync', ctx.user!.id, RATE_LIMITS.stravaSync)
    if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
    const synced = await syncStravaActivities(ctx.prisma, ctx.user!.id, { days: 30 })
    return { synced }
  }),

  /** Strava: loskoppelen (verwijdert tokens + connectie). */
  stravaDisconnect: wearablesProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.stravaConnection.deleteMany({ where: { userId: ctx.user!.id } })
    await ctx.prisma.wearableConnection.deleteMany({
      where: { userId: ctx.user!.id, provider: 'STRAVA' },
    })
    return { ok: true }
  }),

  // ── Beoordelen van gesyncte activiteiten ───────────────────────────────────

  /**
   * Gesyncte activiteiten (watch/Strava) die nog beoordeeld moeten worden.
   * Venster bewust kort (7d): een eerste Strava-backfill importeert 30 dagen
   * en zou anders een flood aan popups geven; ouder werk is via het
   * activity-detailscherm alsnog te beoordelen.
   */
  unratedActivities: wearablesProcedure.query(async ({ ctx }) => {
    const since = startOfDay()
    since.setDate(since.getDate() - 7)
    const rows = await ctx.prisma.cardioLog.findMany({
      where: {
        patientId: ctx.user!.id,
        source: { in: ['APPLE_WATCH', 'STRAVA'] },
        ratedAt: null,
        completedAt: { gte: since },
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        id: true, activity: true, distanceM: true, durationSec: true,
        avgHeartRate: true, rpe: true, source: true, completedAt: true,
      },
    })
    return rows.map(r => ({ ...r, completedAt: r.completedAt.toISOString() }))
  }),

  /**
   * Beoordeel een activiteit: RPE (overschrijft de HR-schatting en telt zo mee
   * in de load-curve), gevoel-score en optionele notitie. Zet `ratedAt`.
   */
  rateActivity: wearablesProcedure
    .input(
      z.object({
        id: z.string(),
        rpe: z.number().int().min(1).max(10),
        feelScore: z.number().int().min(1).max(5).nullable().optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.prisma.cardioLog.updateMany({
        where: { id: input.id, patientId: ctx.user!.id },
        data: {
          rpe: input.rpe,
          feelScore: input.feelScore ?? null,
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
          ratedAt: new Date(),
        },
      })
      if (res.count === 0) throw new TRPCError({ code: 'NOT_FOUND' })
      // Beoordeel-notitie kan hashtags bevatten (#achillespees na het hardlopen).
      if (input.notes?.trim()) {
        const log = await ctx.prisma.cardioLog.findUnique({
          where: { id: input.id },
          select: { completedAt: true },
        })
        await syncHashtagsForLog(ctx.prisma as PrismaClient, {
          patientId: ctx.user!.id,
          taggedById: ctx.user!.id,
          loggedAt: log?.completedAt ?? new Date(),
          notes: input.notes,
          target: { cardioLogId: input.id },
        })
      }
      return { ok: true }
    }),

  /** Therapeut/admin: wearable-overzicht van een patiënt (na toegangscheck). */
  forPatient: wearablesProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma as PrismaClient, ctx.user!, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      // Inzage in andermans wearable-/gezondheidsdata → Wabvpz-audit.
      if (input.patientId !== ctx.user!.id) {
        await auditLog({
          event: 'PATIENT_VIEWED',
          userId: ctx.user!.id,
          actorEmail: ctx.user!.email,
          resource: 'User',
          resourceId: input.patientId,
          metadata: { route: 'wearables.forPatient' },
          req: ctx.req,
        })
      }
      return buildOverview(ctx.prisma as PrismaClient, input.patientId)
    }),
})
