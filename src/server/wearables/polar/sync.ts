/**
 * Polar-sync: haalt exercises (laatste 30 dagen, met samples) op en schrijft
 * ze naar CardioLog (source = POLAR), inclusief de per-minuut `series` die de
 * HR-grafiek + cardiac-decoupling op het activity-scherm voedt.
 *
 * Idempotent op (patientId, externalId = "polar:<exerciseId>"), dus opnieuw
 * syncen overschrijft veilig. Cross-source-dedupe vangt óók het geval dat
 * iemand Polar Flow → Strava doorsynct en beide koppelingen heeft.
 *
 * Polar heeft geen refresh-token: een 401/403 betekent opnieuw koppelen. De
 * sync zet dan `needsReauth` en gooit 'polar_needs_reauth'.
 */
import type { CardioActivity, PrismaClient } from '@prisma/client'
import { resolveMaxHr } from '@/lib/cardio-zones'
import { rpeFromHeartRate, updateExistingSyncedLog, zonesFromSeries } from '@/server/wearables/ingest'
import { linkMeasurementToSession } from '@/server/wearables/session-match'
import { findDuplicate, enrichExistingLog } from '@/server/wearables/dedupe'
import { PolarAuthError, polarGet } from './api'
import { decryptPolarToken } from './config'

const createId = () => crypto.randomUUID()

export type PolarSample = {
  'recording-rate'?: number | null
  'sample-type'?: string
  data?: string
}

export type PolarExercise = {
  id: string | number
  start_time?: string
  start_time_utc_offset?: number
  duration?: string
  calories?: number
  distance?: number
  heart_rate?: { average?: number; maximum?: number }
  sport?: string
  detailed_sport_info?: string
  device?: string
  samples?: PolarSample[]
}

/** ISO-8601-duur ("PT2H44M45S") → seconden. Null bij onparseerbaar. */
export function parseIsoDuration(s: string | undefined): number | null {
  if (!s) return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s)
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null
  const [, d, h, min, sec] = m
  return Math.round(
    (Number(d ?? 0) * 86_400) + (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(sec ?? 0),
  )
}

/**
 * Polar-sportnaam → CardioActivity. `detailed_sport_info` is specifieker dan
 * `sport` en wint. Substring-checks dekken de Flow-varianten
 * (TREADMILL_RUNNING, INDOOR_CYCLING, NORDIC_WALKING, …); onbekend → OTHER
 * (net als STRENGTH_TRAINING — kracht hoort niet in de cardio-lijst).
 */
export function mapPolarSport(detailed: string | undefined, sport: string | undefined): CardioActivity {
  const s = (detailed ?? sport ?? '').toUpperCase()
  if (!s) return 'OTHER'
  if (s.includes('RUN') || s.includes('JOGGING')) return 'RUNNING'
  if (s.includes('CYCLING') || s.includes('BIKING') || s.includes('BIKE') || s.includes('SPINNING')) return 'CYCLING'
  if (s.includes('WALK') || s.includes('HIKING')) return 'WALKING'
  if (s.includes('SWIM')) return 'SWIMMING'
  if (s.includes('ROWING')) return 'ROWING'
  if (s.includes('CROSS_TRAINER') || s.includes('ELLIPTICAL')) return 'CROSSTRAINER'
  if (s.includes('STAIR')) return 'STAIRCLIMBER'
  return 'OTHER'
}

/**
 * Polar's `start_time` is LOKALE tijd zonder zone; `start_time_utc_offset`
 * (minuten) maakt er een instant van: UTC = lokaal − offset. Bevat de string
 * tóch al een zone (Z of ±hh:mm), dan wint die.
 */
export function polarStartToDate(startTime: string, utcOffsetMin: number | undefined): Date {
  if (/(?:Z|[+-]\d\d:?\d\d)$/.test(startTime)) return new Date(startTime)
  return new Date(Date.parse(`${startTime}Z`) - (utcOffsetMin ?? 0) * 60_000)
}

type SeriesPoint = { t: number; hr: number | null; spd: number | null }

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function parseSampleData(data: string | undefined): (number | null)[] {
  if (!data) return []
  return data.split(',').map(v => {
    const n = Number(v)
    return v === '' || v === 'null' || Number.isNaN(n) ? null : n
  })
}

/**
 * Bucket de Polar-samples naar één punt per minuut (zoals de HealthKit- en
 * Strava-series). Sample-type '0' = hartslag (bpm), '1' = snelheid (km/h,
 * hier omgerekend naar m/s zodat alle bronnen dezelfde eenheid delen).
 */
export function buildSeriesFromPolarSamples(
  samples: PolarSample[] | undefined,
  durationSec: number,
): SeriesPoint[] | undefined {
  if (!Array.isArray(samples) || durationSec <= 0) return undefined
  const hrSample = samples.find(s => s['sample-type'] === '0')
  const spdSample = samples.find(s => s['sample-type'] === '1')
  if (!hrSample?.data) return undefined

  const buckets = new Map<number, { hrs: number[]; spds: number[] }>()
  const add = (sample: PolarSample, values: (number | null)[], kind: 'hrs' | 'spds') => {
    const rate = sample['recording-rate'] ?? 5
    if (rate <= 0) return
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (v == null) continue
      const b = Math.floor((i * rate) / 60) * 60
      let e = buckets.get(b)
      if (!e) {
        e = { hrs: [], spds: [] }
        buckets.set(b, e)
      }
      e[kind].push(v)
    }
  }
  add(hrSample, parseSampleData(hrSample.data), 'hrs')
  if (spdSample?.data) add(spdSample, parseSampleData(spdSample.data), 'spds')

  const out = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e]) => ({
      t,
      hr: e.hrs.length ? Math.round(mean(e.hrs)) : null,
      // km/h → m/s, 2 decimalen (zelfde vorm als de Strava-serie)
      spd: e.spds.length ? Math.round((mean(e.spds) / 3.6) * 100) / 100 : null,
    }))
  if (out.filter(p => p.hr != null).length < 2) return undefined
  return out.slice(0, 240)
}

type Db = Pick<PrismaClient, 'polarConnection' | 'user' | 'cardioLog' | 'sessionLog'>

/** Markeer de koppeling als "opnieuw koppelen nodig" (401/403 gezien). */
export async function markNeedsReauth(prisma: Pick<PrismaClient, 'polarConnection'>, userId: string): Promise<void> {
  await prisma.polarConnection.updateMany({ where: { userId }, data: { needsReauth: true } })
}

/**
 * Geef het (ontsleutelde) access-token voor een user. Gooit bij geen
 * koppeling of als opnieuw koppelen nodig is — er is geen refresh-route.
 */
export async function getPolarAccessToken(prisma: Pick<PrismaClient, 'polarConnection'>, userId: string): Promise<string> {
  const conn = await prisma.polarConnection.findUnique({ where: { userId } })
  if (!conn) throw new Error('polar_not_connected')
  if (conn.needsReauth || conn.expiresAt.getTime() <= Date.now()) throw new Error('polar_needs_reauth')
  return decryptPolarToken(conn.accessToken)
}

/** Sync alle beschikbare Polar-exercises (max 30 dagen). Retourneert het aantal. */
export async function syncPolarExercises(prisma: Db, userId: string): Promise<number> {
  const token = await getPolarAccessToken(prisma, userId)

  let exercises: PolarExercise[] | null
  try {
    exercises = await polarGet<PolarExercise[]>(token, '/exercises?samples=true')
  } catch (err) {
    if (err instanceof PolarAuthError) {
      await markNeedsReauth(prisma, userId)
      throw new Error('polar_needs_reauth')
    }
    throw err
  }
  if (!exercises || exercises.length === 0) {
    await prisma.polarConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } })
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
  for (const ex of exercises) {
    const durationSec = parseIsoDuration(ex.duration)
    if (!durationSec || durationSec < 60 || !ex.start_time) continue

    const completedAt = polarStartToDate(ex.start_time, ex.start_time_utc_offset)
    const distanceM = ex.distance != null ? Math.round(ex.distance) : null
    const avgHeartRate = ex.heart_rate?.average != null ? Math.round(ex.heart_rate.average) : null
    const avgPaceSecPerKm = distanceM && distanceM > 0 ? Math.round(durationSec / (distanceM / 1000)) : null
    const series = buildSeriesFromPolarSamples(ex.samples, durationSec)

    const sportName = ex.detailed_sport_info ?? ex.sport ?? ''
    const data = {
      activity: mapPolarSport(ex.detailed_sport_info, ex.sport),
      sourceActivity: sportName || null,
      protocol: 'STEADY_STATE' as const,
      durationSec,
      distanceM,
      avgHeartRate,
      maxHeartRate: ex.heart_rate?.maximum != null ? Math.round(ex.heart_rate.maximum) : null,
      calories: ex.calories != null ? Math.round(ex.calories) : null,
      rpe: rpeFromHeartRate(avgHeartRate, maxHr, profile?.restingHeartRate),
      avgPaceSecPerKm,
      series: series ?? undefined,
      // Polar's zones volgen de zone-indeling van de gebruiker bij Polar, niet
      // die van de app — leid tijd-in-zone daarom net als bij watch/Strava uit
      // de hartslagcurve af, zodat de belastingscurve consistent rekent.
      timeInZones: zonesFromSeries(series ?? undefined, profile) ?? undefined,
      source: 'POLAR' as const,
      completedAt,
    }
    const externalId = `polar:${ex.id}`
    // Zelfde afhandeling als de Strava-sync: eerst de bestaande rij bijwerken
    // (met respect voor hand-gezette RPE/HR-correctie), anders dedupen op
    // tijd-overlap, anders aanmaken met P2002-vangnet voor parallelle syncs.
    const existed = await updateExistingSyncedLog(prisma, userId, externalId, data)
    let logId: string | null = null
    if (existed) {
      const row = await prisma.cardioLog.findUnique({
        where: { patientId_externalId: { patientId: userId, externalId } },
        select: { id: true, sessionLogId: true },
      })
      logId = row && row.sessionLogId == null ? row.id : null
    }
    if (!existed) {
      const dup = await findDuplicate(prisma, userId, completedAt, durationSec)
      if (dup) {
        await enrichExistingLog(prisma, dup, data)
        logId = dup.id
      } else {
        try {
          const created = await prisma.cardioLog.create({
            data: { id: createId(), patientId: userId, externalId, ...data },
          })
          logId = created.id
        } catch (err) {
          // P2002 = parallelle sync creëerde de rij zojuist; die is dan al bijgewerkt.
          if (!(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002')) {
            throw err
          }
        }
      }
    }

    // Krachttraining die ook in de app gelogd is → meting bij die sessie.
    if (logId) {
      try {
        await linkMeasurementToSession(prisma, userId, {
          id: logId,
          activity: data.activity,
          startAt: data.completedAt,
          durationSec,
        })
      } catch {
        // Volgende sync probeert het opnieuw.
      }
    }
    count++
  }

  await prisma.polarConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } })
  return count
}
