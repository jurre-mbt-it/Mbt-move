/**
 * Ingestie van HealthKit-payloads (POST /api/wearable/sync).
 *
 * De native iOS-bridge leest HealthKit met anchored queries en stuurt batches.
 * Alles is idempotent op de HealthKit-sample-UUID (`externalId`): overlappende
 * batches — na anchor-reset of herinstallatie — overschrijven dezelfde rij in
 * plaats van te dupliceren. Workouts landen in CardioLog (zelfde "valuta" als
 * handmatige cardio, zodat de belasting-curve ze meeneemt); slaap en vitals in
 * hun eigen tabellen.
 */
import { z } from 'zod'
import type { PrismaClient, CardioActivity } from '@prisma/client'
import { aggregateNight, sleepQualityScore, type SleepSegment } from '@/lib/sleep-metrics'
import { resolveMaxHr } from '@/lib/cardio-zones'
import { computeStressDay } from '@/lib/stress'

const createId = () => crypto.randomUUID()

// HealthKit-workout-typen → onze CardioActivity. De bridge mag ook direct een
// CardioActivity-waarde sturen; onbekend → OTHER.
const ACTIVITY_MAP: Record<string, CardioActivity> = {
  running: 'RUNNING',
  cycling: 'CYCLING',
  rowing: 'ROWING',
  swimming: 'SWIMMING',
  walking: 'WALKING',
  elliptical: 'CROSSTRAINER',
  stairClimbing: 'STAIRCLIMBER',
  stairs: 'STAIRCLIMBER',
  // directe enum-waarden (idempotent door uppercasing hieronder)
}
const VALID_ACTIVITIES = new Set<CardioActivity>([
  'RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'CROSSTRAINER', 'WALKING',
  'SKIERG', 'ASSAULT_BIKE', 'WATTBIKE', 'STAIRCLIMBER', 'OTHER',
])

function mapActivity(raw: string): CardioActivity {
  const upper = raw.toUpperCase() as CardioActivity
  if (VALID_ACTIVITIES.has(upper)) return upper
  return ACTIVITY_MAP[raw] ?? 'OTHER'
}

/**
 * Sessie-RPE-proxy uit gemeten HR: %HRR (Karvonen) → 1-10. Geeft de belasting-
 * curve een intensiteits-gewogen sRPE voor watch-workouts (die geen RPE
 * bevatten), i.p.v. de vlakke fallback van 5. Zonder HR-profiel: null.
 */
export function rpeFromHeartRate(
  avgHr: number | null | undefined,
  maxHr: number | null | undefined,
  restHr: number | null | undefined,
): number | null {
  if (avgHr == null || maxHr == null || maxHr <= (restHr ?? 0)) return null
  const rest = restHr ?? 60
  const frac = (avgHr - rest) / (maxHr - rest)
  return Math.max(1, Math.min(10, Math.round(frac * 10)))
}

const workoutSchema = z.object({
  externalId: z.string().min(1),
  activity: z.string().min(1),
  startAt: z.string(),
  endAt: z.string().optional(),
  durationSec: z.number().int().positive(),
  distanceM: z.number().int().nonnegative().optional(),
  avgHeartRate: z.number().int().min(30).max(240).optional(),
  maxHeartRate: z.number().int().min(30).max(240).optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  timeInZones: z.record(z.string(), z.number()).optional(),
})

const sleepSegmentSchema = z.object({
  stage: z.enum(['awake', 'light', 'deep', 'rem', 'inBed']),
  startAt: z.string(),
  endAt: z.string(),
})

const sleepNightSchema = z.object({
  externalId: z.string().optional(),
  date: z.string(), // yyyy-mm-dd van de ochtend
  segments: z.array(sleepSegmentSchema).min(1),
})

const vitalsSchema = z.object({
  date: z.string(), // yyyy-mm-dd
  hrv: z.number().positive().optional(),
  hrvType: z.enum(['SDNN', 'RMSSD']).optional(),
  restingHeartRate: z.number().int().min(20).max(150).optional(),
  respiratoryRate: z.number().positive().max(60).optional(),
  wristTempDeviation: z.number().min(-10).max(10).optional(),
  steps: z.number().int().nonnegative().max(200000).optional(),
  activeEnergyKcal: z.number().nonnegative().max(30000).optional(),
  basalEnergyKcal: z.number().nonnegative().max(30000).optional(),
  vo2Max: z.number().positive().max(100).optional(), // ml/kg/min
})

// Hard caps per batch: de native bridge stuurt incrementele anchored queries,
// dus een normale sync is klein. De caps begrenzen de werk-amplificatie (DB-
// writes + readiness-hercompute per dag) van een kwaadaardige/kapotte payload.
const MAX_WORKOUTS = 500
const MAX_SLEEP = 200
const MAX_VITALS = 200
const MAX_HR_DAYS = 200

// Intraday HR voor de stress-meter: compacte buckets (avg bpm per venster,
// workouts al client-side uitgesloten). m = minuut van de dag (0–1439).
const hrDaySchema = z.object({
  date: z.string(), // yyyy-mm-dd
  buckets: z
    .array(z.object({ m: z.number().int().min(0).max(1439), bpm: z.number().min(20).max(240) }))
    .max(96),
})

export const syncPayloadSchema = z.object({
  device: z.object({ model: z.string().optional() }).optional(),
  anchors: z.record(z.string(), z.string()).optional(),
  workouts: z.array(workoutSchema).max(MAX_WORKOUTS).default([]),
  sleep: z.array(sleepNightSchema).max(MAX_SLEEP).default([]),
  vitals: z.array(vitalsSchema).max(MAX_VITALS).default([]),
  hrIntraday: z.array(hrDaySchema).max(MAX_HR_DAYS).default([]),
})

export type SyncPayload = z.infer<typeof syncPayloadSchema>

export type IngestResult = {
  workouts: number
  sleep: number
  vitals: number
  /** start-of-day datums die geraakt zijn — readiness moet hervoor herrekend. */
  affectedDates: Date[]
}

function startOfDayUTCLocal(dateStr: string): Date {
  // 'yyyy-mm-dd' → lokale start-of-day (consistent met de rest van de app,
  // die start-of-day in lokale tijd gebruikt).
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

type Db = Pick<PrismaClient, 'wearableConnection' | 'cardioLog' | 'sleepEntry' | 'vitalsEntry' | 'stressEntry' | 'user'>

export async function ingestWearableData(
  prisma: Db,
  userId: string,
  payload: SyncPayload,
): Promise<IngestResult> {
  const affected = new Set<number>() // start-of-day epoch ms

  // HR-profiel ophalen voor de sRPE-afleiding van workouts.
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxHeartRate: true, restingHeartRate: true, dateOfBirth: true },
  })

  // ── Connection bijwerken (upsert) ──────────────────────
  await prisma.wearableConnection.upsert({
    where: { userId_provider: { userId, provider: 'APPLE_HEALTH' } },
    update: {
      lastSyncAt: new Date(),
      ...(payload.device?.model ? { deviceModel: payload.device.model } : {}),
      ...(payload.anchors ? { anchors: payload.anchors } : {}),
    },
    create: {
      id: createId(),
      userId,
      provider: 'APPLE_HEALTH',
      deviceModel: payload.device?.model ?? null,
      anchors: payload.anchors ?? undefined,
      lastSyncAt: new Date(),
    },
  })

  // ── Workouts → CardioLog (idempotent op externalId) ────
  for (const w of payload.workouts) {
    const activity = mapActivity(w.activity)
    const completedAt = new Date(w.startAt)
    const rpe = rpeFromHeartRate(w.avgHeartRate, profile?.maxHeartRate, profile?.restingHeartRate)
    const avgPaceSecPerKm =
      w.distanceM && w.distanceM > 0 ? Math.round(w.durationSec / (w.distanceM / 1000)) : null

    const data = {
      activity,
      protocol: 'STEADY_STATE' as const,
      durationSec: w.durationSec,
      distanceM: w.distanceM ?? null,
      avgHeartRate: w.avgHeartRate ?? null,
      maxHeartRate: w.maxHeartRate ?? null,
      calories: w.activeEnergyKcal != null ? Math.round(w.activeEnergyKcal) : null,
      rpe,
      timeInZones: w.timeInZones ?? undefined,
      avgPaceSecPerKm,
      source: 'APPLE_WATCH' as const,
      completedAt,
    }

    await prisma.cardioLog.upsert({
      // Key op (patientId, externalId): een door de client aangeleverde
      // HealthKit-UUID kan zo nooit de cardio-rij van een ándere patiënt raken.
      where: { patientId_externalId: { patientId: userId, externalId: w.externalId } },
      update: data,
      create: { id: createId(), patientId: userId, externalId: w.externalId, ...data },
    })
    affected.add(startOfDayUTCLocal(completedAt.toISOString().slice(0, 10)).getTime())
  }

  // ── Sleep → SleepEntry (idempotent op userId+date) ─────
  for (const s of payload.sleep) {
    const night = aggregateNight(s.segments as SleepSegment[])
    if (night.asleepMin <= 0) continue
    const date = startOfDayUTCLocal(s.date)
    const quality = sleepQualityScore(night)
    const sorted = [...s.segments].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
    const startAt = new Date(sorted[0].startAt)
    const endAt = new Date(sorted[sorted.length - 1].endAt)

    const data = {
      startAt,
      endAt,
      inBedMin: night.inBedMin,
      asleepMin: night.asleepMin,
      awakeMin: night.awakeMin,
      lightMin: night.lightMin,
      deepMin: night.deepMin,
      remMin: night.remMin,
      efficiency: night.efficiency,
      latencyMin: night.latencyMin,
      qualityScore: quality,
      stages: s.segments as unknown as object,
      source: 'APPLE_WATCH' as const,
      ...(s.externalId ? { externalId: s.externalId } : {}),
    }

    await prisma.sleepEntry.upsert({
      where: { userId_date: { userId, date } },
      update: data,
      create: { id: createId(), userId, date, ...data },
    })
    affected.add(date.getTime())
  }

  // ── Vitals → VitalsEntry (idempotent op userId+date) ───
  for (const v of payload.vitals) {
    const date = startOfDayUTCLocal(v.date)
    const data = {
      restingHeartRate: v.restingHeartRate ?? null,
      hrv: v.hrv ?? null,
      hrvType: v.hrvType ?? null,
      respiratoryRate: v.respiratoryRate ?? null,
      wristTempDeviation: v.wristTempDeviation ?? null,
      steps: v.steps != null ? Math.round(v.steps) : null,
      activeEnergyKcal: v.activeEnergyKcal != null ? Math.round(v.activeEnergyKcal) : null,
      basalEnergyKcal: v.basalEnergyKcal != null ? Math.round(v.basalEnergyKcal) : null,
      vo2Max: v.vo2Max ?? null,
      source: 'APPLE_WATCH' as const,
    }
    await prisma.vitalsEntry.upsert({
      where: { userId_date: { userId, date } },
      update: data,
      create: { id: createId(), userId, date, ...data },
    })
    affected.add(date.getTime())
  }

  // ── Stress → StressEntry (server-side %HRR, HRmax uit profiel/leeftijd) ───
  // Alleen als we een max-HR kunnen bepalen (expliciet of via geboortedatum).
  const maxHrRes = resolveMaxHr({
    maxHeartRate: profile?.maxHeartRate,
    restingHeartRate: profile?.restingHeartRate,
    dateOfBirth: profile?.dateOfBirth,
  })
  if (maxHrRes && payload.hrIntraday.length > 0) {
    // Rust-HR per dag uit de meegestuurde vitals (valt anders terug op dag-p10).
    const restByDay = new Map<string, number>()
    for (const v of payload.vitals) {
      if (v.restingHeartRate != null) restByDay.set(v.date, v.restingHeartRate)
    }
    for (const day of payload.hrIntraday) {
      const result = computeStressDay(day.buckets, {
        restingHr: restByDay.get(day.date) ?? profile?.restingHeartRate ?? null,
        maxHr: maxHrRes.maxHr,
      })
      if (!result) continue
      const date = startOfDayUTCLocal(day.date)
      const data = {
        avgScore: result.avgScore,
        restingHeartRate: result.restingHeartRate,
        samples: result.samples,
        timeInBands: result.timeInBands,
        source: 'APPLE_WATCH' as const,
      }
      await prisma.stressEntry.upsert({
        where: { userId_date: { userId, date } },
        update: data,
        create: { id: createId(), userId, date, ...data },
      })
      affected.add(date.getTime())
    }
  }

  return {
    workouts: payload.workouts.length,
    sleep: payload.sleep.length,
    vitals: payload.vitals.length,
    affectedDates: [...affected].map(ms => new Date(ms)),
  }
}
