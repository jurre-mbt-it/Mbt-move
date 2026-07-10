/**
 * Strava-sync: haalt recente activiteiten + hun HR/tempo-streams op en schrijft
 * ze naar CardioLog (source = STRAVA), inclusief de per-minuut `series` die de
 * HR-grafiek + cardiac-decoupling op het activity-scherm voedt.
 *
 * Idempotent op (patientId, externalId = "strava:<activityId>"), dus opnieuw
 * syncen overschrijft veilig.
 */
import type { CardioActivity, PrismaClient } from '@prisma/client'
import { resolveMaxHr } from '@/lib/cardio-zones'
import { rpeFromHeartRate } from '@/server/wearables/ingest'
import { getValidAccessToken, stravaGet } from './oauth'

const createId = () => crypto.randomUUID()

const SPORT_MAP: Record<string, CardioActivity> = {
  Run: 'RUNNING', TrailRun: 'RUNNING', VirtualRun: 'RUNNING',
  Ride: 'CYCLING', VirtualRide: 'CYCLING', MountainBikeRide: 'CYCLING', GravelRide: 'CYCLING',
  Walk: 'WALKING', Hike: 'WALKING',
  Swim: 'SWIMMING',
  Rowing: 'ROWING',
  Elliptical: 'CROSSTRAINER', StairStepper: 'STAIRCLIMBER',
}

type StravaActivity = {
  id: number
  sport_type?: string
  type?: string
  moving_time?: number
  elapsed_time?: number
  distance?: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed?: number
  calories?: number
  start_date?: string
  has_heartrate?: boolean
}

type StreamResponse = {
  time?: { data: number[] }
  heartrate?: { data: number[] }
  velocity_smooth?: { data: number[] }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

/** Bucket de high-res streams naar één punt per minuut (zoals de HealthKit-serie). */
function buildSeries(s: StreamResponse | null): { t: number; hr: number | null; spd: number | null }[] | undefined {
  const time = s?.time?.data
  if (!Array.isArray(time) || time.length < 2) return undefined
  const hr = s?.heartrate?.data
  const spd = s?.velocity_smooth?.data
  const buckets = new Map<number, { hrs: number[]; spds: number[] }>()
  for (let i = 0; i < time.length; i++) {
    const b = Math.floor(time[i] / 60) * 60
    let e = buckets.get(b)
    if (!e) {
      e = { hrs: [], spds: [] }
      buckets.set(b, e)
    }
    const h = hr?.[i]
    if (typeof h === 'number') e.hrs.push(h)
    const v = spd?.[i]
    if (typeof v === 'number') e.spds.push(v)
  }
  const out = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e]) => ({
      t,
      hr: e.hrs.length ? Math.round(mean(e.hrs)) : null,
      spd: e.spds.length ? Math.round(mean(e.spds) * 100) / 100 : null,
    }))
  if (out.filter((p) => p.hr != null).length < 2) return undefined
  return out.slice(0, 240)
}

type Db = Pick<PrismaClient, 'stravaConnection' | 'user' | 'cardioLog'>

/** Sync de laatste `days` dagen aan Strava-activiteiten. Retourneert het aantal. */
export async function syncStravaActivities(prisma: Db, userId: string, opts?: { days?: number }): Promise<number> {
  const token = await getValidAccessToken(prisma, userId)
  const days = opts?.days ?? 30
  const after = Math.floor((Date.now() - days * 86_400_000) / 1000)

  const activities = await stravaGet<StravaActivity[]>(token, `/athlete/activities?after=${after}&per_page=100`)
  if (!Array.isArray(activities) || activities.length === 0) {
    await prisma.stravaConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } })
    return 0
  }

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: { maxHeartRate: true, restingHeartRate: true, dateOfBirth: true },
  })
  const maxHr =
    resolveMaxHr({
      maxHeartRate: profile?.maxHeartRate,
      restingHeartRate: profile?.restingHeartRate,
      dateOfBirth: profile?.dateOfBirth,
    })?.maxHr ?? null

  let count = 0
  for (const a of activities) {
    const durationSec = a.moving_time ?? a.elapsed_time
    if (!durationSec || durationSec < 60) continue

    const distanceM = a.distance != null ? Math.round(a.distance) : null
    const avgHeartRate = a.average_heartrate != null ? Math.round(a.average_heartrate) : null
    const avgPaceSecPerKm = distanceM && distanceM > 0 ? Math.round(durationSec / (distanceM / 1000)) : null

    let series: ReturnType<typeof buildSeries> = undefined
    if (a.has_heartrate) {
      try {
        const streams = await stravaGet<StreamResponse>(
          token,
          `/activities/${a.id}/streams?keys=time,heartrate,velocity_smooth&key_by_type=true`,
        )
        series = buildSeries(streams)
      } catch {
        // streams optioneel — grafiek degradeert netjes
      }
    }

    const data = {
      activity: SPORT_MAP[a.sport_type ?? a.type ?? ''] ?? 'OTHER',
      protocol: 'STEADY_STATE' as const,
      durationSec,
      distanceM,
      avgHeartRate,
      maxHeartRate: a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
      calories: a.calories != null ? Math.round(a.calories) : null,
      rpe: rpeFromHeartRate(avgHeartRate, maxHr, profile?.restingHeartRate),
      avgPaceSecPerKm,
      series: series ?? undefined,
      source: 'STRAVA' as const,
      completedAt: a.start_date ? new Date(a.start_date) : new Date(),
    }
    const externalId = `strava:${a.id}`
    await prisma.cardioLog.upsert({
      where: { patientId_externalId: { patientId: userId, externalId } },
      update: data,
      create: { id: createId(), patientId: userId, externalId, ...data },
    })
    count++
  }

  await prisma.stravaConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } })
  return count
}
