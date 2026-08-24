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
import {
  ingestWearableData,
  rpeFromHeartRate,
  updateExistingSyncedLog,
  zonesFromSeries,
  type IngestResult,
  type SyncPayload,
} from '@/server/wearables/ingest'
import { linkMeasurementToSession } from '@/server/wearables/session-match'
import { findDuplicate, enrichExistingLog } from '@/server/wearables/dedupe'
import { computeAndStoreReadiness } from '@/server/readiness'
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

// ── Wellness: slaap, Nightly Recharge, dagactiviteit, continue HR ───────────
// Polar-responses worden naar het bestaande `syncPayloadSchema`-formaat gemapt
// en via `ingestWearableData` (source POLAR) verwerkt — dezelfde pijplijn als
// de HealthKit-bridge, inclusief qualityScore, exertion en readiness.

export type PolarSleep = {
  date?: string
  sleep_start_time?: string
  sleep_end_time?: string
  /** { "HH:MM": stage } — 0=WAKE, 1=REM, 2/3=LIGHT, 4=DEEP, 5=UNKNOWN */
  hypnogram?: Record<string, number>
}

export type PolarRecharge = {
  date?: string
  heart_rate_avg?: number
  heart_rate_variability_avg?: number
  breathing_rate_avg?: number
}

export type PolarActivity = {
  start_time?: string
  calories?: number
  active_calories?: number
  steps?: number
}

export type PolarHrDay = {
  date?: string
  heart_rate_samples?: { heart_rate?: number; sample_time?: string }[]
}

type SleepNight = SyncPayload['sleep'][number]
type VitalsDay = SyncPayload['vitals'][number]
type HrIntradayDay = SyncPayload['hrIntraday'][number]

// Polar-hypnogram-stadia → onze segment-stadia. 5 (UNKNOWN, bv. slecht
// huidcontact) telt als 'light': 'awake' zou TST en efficiëntie onterecht
// drukken, en de vensters zijn doorgaans kort.
const HYPNOGRAM_STAGE: Record<number, 'awake' | 'light' | 'deep' | 'rem'> = {
  0: 'awake', 1: 'rem', 2: 'light', 3: 'light', 4: 'deep', 5: 'light',
}

/**
 * Polar-slaapnacht → ingest-formaat. Het hypnogram heeft kloktijden ("HH:MM")
 * zonder datum; de datum komt uit `sleep_start_time`, en een kloktijd vóór de
 * start-kloktijd hoort bij de volgende kalenderdag (nacht-wrap over 00:00).
 * Zonder hypnogram → null (zeldzaam op ondersteunde horloges).
 */
export function polarSleepToNight(s: PolarSleep): SleepNight | null {
  if (!s.date || !s.sleep_start_time || !s.sleep_end_time) return null
  const entries = Object.entries(s.hypnogram ?? {})
  if (entries.length === 0) return null

  // Zone-offset van de nacht ("+02:00" of "Z"); zonder nemen we UTC.
  const offset = /(?:Z|[+-]\d\d:\d\d)$/.exec(s.sleep_start_time)?.[0] ?? 'Z'
  const startDay = s.sleep_start_time.slice(0, 10)
  const startClock = s.sleep_start_time.slice(11, 16)
  const nextDay = new Date(Date.parse(`${startDay}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

  const stamped = entries
    .map(([clock, stage]) => {
      const day = clock < startClock ? nextDay : startDay
      const at = new Date(`${day}T${clock}:00${offset}`)
      return { at, stage: HYPNOGRAM_STAGE[stage] }
    })
    .filter((e): e is { at: Date; stage: 'awake' | 'light' | 'deep' | 'rem' } => !!e.stage && !Number.isNaN(e.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  if (stamped.length === 0) return null

  const end = new Date(s.sleep_end_time)
  const segments = stamped.map((e, i) => ({
    stage: e.stage,
    startAt: e.at.toISOString(),
    endAt: (i + 1 < stamped.length ? stamped[i + 1].at : end).toISOString(),
  }))
  return { externalId: `polar:sleep:${s.date}`, date: s.date, segments }
}

/**
 * Nightly Recharge → vitals. `heart_rate_avg` is het nachtgemiddelde (4 uur
 * vanaf 30 min na inslapen) — geen klassieke rust-HR, maar hetzelfde signaal
 * dat Whoop/Oura als nachtelijke baseline gebruiken (besluit 2026-08-24).
 * HRV is RMSSD; die mag NOOIT met Apple's SDNN in één baseline belanden
 * (VitalsEntry.hrvType bewaakt dat).
 */
export function polarRechargeToVitals(r: PolarRecharge): VitalsDay | null {
  if (!r.date) return null
  const v: VitalsDay = { date: r.date }
  if (r.heart_rate_avg != null) v.restingHeartRate = Math.round(r.heart_rate_avg)
  if (r.heart_rate_variability_avg != null) {
    v.hrv = r.heart_rate_variability_avg
    v.hrvType = 'RMSSD'
  }
  if (r.breathing_rate_avg != null) v.respiratoryRate = r.breathing_rate_avg
  return v.restingHeartRate == null && v.hrv == null && v.respiratoryRate == null ? null : v
}

/** Dagactiviteit → vitals (stappen + kcal; basaal = totaal − actief). */
export function polarActivityToVitals(a: PolarActivity): VitalsDay | null {
  const date = a.start_time?.slice(0, 10)
  if (!date) return null
  const v: VitalsDay = { date }
  if (a.steps != null) v.steps = Math.round(a.steps)
  if (a.active_calories != null) v.activeEnergyKcal = Math.round(a.active_calories)
  if (a.calories != null && a.active_calories != null && a.calories > a.active_calories) {
    v.basalEnergyKcal = Math.round(a.calories - a.active_calories)
  }
  return v.steps == null && v.activeEnergyKcal == null ? null : v
}

/**
 * Continue HR (5-min-samples) → bpm-histogram voor de dagbelasting (exertion).
 * Duur per sample = afstand tot het volgende sample, geklemd op [60, 600] s
 * (Polar sampelt soms vaker dan elke 5 min); het laatste sample telt 300 s.
 * Bewust GEEN intraday-buckets voor de stress-meter: die verwacht
 * rust-periodes zonder workouts, en die scheiding kan hier niet betrouwbaar.
 */
export function polarContinuousHrToDay(d: PolarHrDay): HrIntradayDay | null {
  if (!d.date) return null
  const samples = (d.heart_rate_samples ?? [])
    .filter(s => s.heart_rate != null && s.heart_rate >= 20 && s.heart_rate <= 240 && !!s.sample_time)
    .map(s => {
      const [h, m, sec] = (s.sample_time as string).split(':').map(Number)
      return { bpm: s.heart_rate as number, t: (h ?? 0) * 3600 + (m ?? 0) * 60 + (sec ?? 0) }
    })
    .sort((a, b) => a.t - b.t)
  if (samples.length === 0) return null

  const histogram: Record<string, number> = {}
  for (let i = 0; i < samples.length; i++) {
    const next = samples[i + 1]
    const dt = next ? Math.min(600, Math.max(60, next.t - samples[i].t)) : 300
    const bin = String(Math.floor(samples[i].bpm / 5) * 5)
    histogram[bin] = Math.min(86_400, (histogram[bin] ?? 0) + dt)
  }
  return { date: d.date, buckets: [], histogram }
}

type WellnessDb = Parameters<typeof ingestWearableData>[0] &
  Pick<PrismaClient, 'polarConnection'> &
  Parameters<typeof computeAndStoreReadiness>[0]

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Sync slaap, Nightly Recharge, dagactiviteit en continue HR (max 28 dagen —
 * de Polar-lijstvensters) en verwerk alles via de bestaande ingest-pijplijn.
 * Herrekent readiness voor elke geraakte dag en geeft het IngestResult terug
 * zodat de webhook er de herstelmelding aan kan hangen.
 */
export async function syncPolarWellness(prisma: WellnessDb, userId: string): Promise<IngestResult> {
  const token = await getPolarAccessToken(prisma, userId)
  const to = new Date()
  const from = new Date(to.getTime() - 27 * 86_400_000)
  const range = `from=${isoDay(from)}&to=${isoDay(to)}`

  let nights: { nights?: PolarSleep[] } | null
  let recharges: { recharges?: PolarRecharge[] } | null
  let activities: PolarActivity[] | null
  let hrRaw: unknown
  try {
    ;[nights, recharges, activities, hrRaw] = await Promise.all([
      polarGet<{ nights?: PolarSleep[] }>(token, '/users/sleep'),
      polarGet<{ recharges?: PolarRecharge[] }>(token, '/users/nightly-recharge'),
      polarGet<PolarActivity[]>(token, `/users/activities?${range}`),
      polarGet<unknown>(token, `/users/continuous-heart-rate?${range}`),
    ])
  } catch (err) {
    if (err instanceof PolarAuthError) {
      await markNeedsReauth(prisma, userId)
      throw new Error('polar_needs_reauth')
    }
    throw err
  }

  // Het swagger-schema belooft hier één dag-object; in de praktijk kan het
  // ook een array of een `{ heart_rates: [...] }`-omslag zijn. Normaliseer
  // alle drie de vormen (les uit de Kinvent-koppeling: verifieer tegen echte
  // responses, en wees hier alvast tolerant).
  const hrDays: PolarHrDay[] = Array.isArray(hrRaw)
    ? (hrRaw as PolarHrDay[])
    : hrRaw && Array.isArray((hrRaw as { heart_rates?: PolarHrDay[] }).heart_rates)
      ? ((hrRaw as { heart_rates: PolarHrDay[] }).heart_rates)
      : hrRaw
        ? [hrRaw as PolarHrDay]
        : []

  const sleep = (nights?.nights ?? []).map(polarSleepToNight).filter((n): n is SleepNight => n !== null)

  // Vitals per datum mergen: recharge (nacht) + activiteit (dag) horen in
  // dezelfde rij.
  const vitalsByDate = new Map<string, VitalsDay>()
  for (const src of [
    ...(recharges?.recharges ?? []).map(polarRechargeToVitals),
    ...(activities ?? []).map(polarActivityToVitals),
  ]) {
    if (!src) continue
    vitalsByDate.set(src.date, { ...(vitalsByDate.get(src.date) ?? { date: src.date }), ...src })
  }

  const hrIntraday = hrDays.map(polarContinuousHrToDay).filter((d): d is HrIntradayDay => d !== null)

  // Eerste bron wint: nachten/dagen die al door een ándere bron gevuld zijn
  // (Apple Watch bij dubbeldragers) niet overschrijven — anders flip-flopt
  // dezelfde nacht tussen bronnen bij elke sync.
  const gte = new Date(from.getTime() - 86_400_000)
  const [takenSleep, takenVitals, takenExertion] = await Promise.all([
    prisma.sleepEntry.findMany({
      where: { userId, date: { gte }, source: { not: 'POLAR' } }, select: { date: true },
    }),
    prisma.vitalsEntry.findMany({
      where: { userId, date: { gte }, source: { not: 'POLAR' } }, select: { date: true },
    }),
    prisma.exertionEntry.findMany({
      where: { userId, date: { gte }, source: { not: 'POLAR' } }, select: { date: true },
    }),
  ])
  const asKeySet = (rows: { date: Date }[]) => new Set(rows.map(r => localDayKey(r.date)))
  const sleepTaken = asKeySet(takenSleep)
  const vitalsTaken = asKeySet(takenVitals)
  const exertionTaken = asKeySet(takenExertion)

  const payload: SyncPayload = {
    device: { model: 'Polar' },
    workouts: [],
    sleep: sleep.filter(n => !sleepTaken.has(n.date)),
    vitals: [...vitalsByDate.values()].filter(v => !vitalsTaken.has(v.date)),
    hrIntraday: hrIntraday.filter(d => !exertionTaken.has(d.date)),
  }

  const result = await ingestWearableData(prisma, userId, payload, {
    source: 'POLAR',
    provider: 'POLAR',
    deviceModel: 'Polar',
  })
  for (const date of result.affectedDates) {
    await computeAndStoreReadiness(prisma, userId, date)
  }
  await prisma.polarConnection.update({ where: { userId }, data: { lastWellnessSyncAt: new Date() } })
  return result
}

/**
 * Dag-sleutel in LOKALE tijd, spiegelbeeld van `startOfDayUTCLocal` in de
 * ingest: die parseert 'yyyy-mm-dd' als lokale start-of-day, dus hier moet
 * dezelfde lokale kalenderdag uit de opgeslagen Date terugrollen.
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
