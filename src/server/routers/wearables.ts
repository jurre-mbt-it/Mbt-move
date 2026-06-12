import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { computeReadinessFor } from '@/server/readiness'
import { wearablesEnabledForRole } from '@/lib/wearables-access'

/**
 * Uitrol-gate: wearables is voorlopig alleen voor de admin (zie
 * src/lib/wearables-access.ts). Verbreden = die helper aanpassen, niet hier.
 */
const wearablesProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!wearablesEnabledForRole(ctx.user!.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
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

/** Toegang: directe PatientTherapist-koppeling OF zelfde praktijk (ADMIN altijd). */
async function hasPatientAccess(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
): Promise<boolean> {
  if (patientId === user.id) return true
  if (user.role === 'ADMIN') return true
  if (user.role !== 'THERAPIST') return false
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
          },
        },
        ...(user.practiceId ? [{ practiceId: user.practiceId }] : []),
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

  const [connection, readiness, sleep, vitals, activities, trend] = await Promise.all([
    prisma.wearableConnection.findUnique({
      where: { userId_provider: { userId, provider: 'APPLE_HEALTH' } },
      select: { provider: true, deviceModel: true, enabled: true, lastSyncAt: true, connectedAt: true },
    }),
    computeReadinessFor(prisma, userId),
    prisma.sleepEntry.findMany({
      where: { userId, date: { gte: sleepSince } },
      orderBy: { date: 'asc' },
    }),
    prisma.vitalsEntry.findMany({
      where: { userId, date: { gte: vitalsSince } },
      orderBy: { date: 'asc' },
    }),
    prisma.cardioLog.findMany({
      where: { patientId: userId, source: 'APPLE_WATCH' },
      orderBy: { completedAt: 'desc' },
      take: ACTIVITY_LIMIT,
    }),
    prisma.readinessSnapshot.findMany({
      where: { userId, date: { gte: trendSince } },
      orderBy: { date: 'asc' },
      select: { date: true, score: true, band: true },
    }),
  ])

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
      completedAt: a.completedAt.toISOString(),
    })),
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

  /** Therapeut/admin: wearable-overzicht van een patiënt (na toegangscheck). */
  forPatient: wearablesProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma as PrismaClient, ctx.user!, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      return buildOverview(ctx.prisma as PrismaClient, input.patientId)
    }),
})
