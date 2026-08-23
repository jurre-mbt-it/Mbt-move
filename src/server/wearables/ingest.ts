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
import type { PrismaClient, CardioActivity, Prisma } from '@prisma/client'
import { aggregateNight, sleepQualityScore, type SleepSegment } from '@/lib/sleep-metrics'
import { resolveMaxHr } from '@/lib/cardio-zones'
import { bpmHistogramFromSeries, computeExertionDay, type SeriesPoint } from '@/lib/exertion'
import { computeStressDay } from '@/lib/stress'
import { findDuplicate, enrichExistingLog } from '@/server/wearables/dedupe'
import { linkMeasurementToSession } from '@/server/wearables/session-match'

const createId = () => crypto.randomUUID()

// HealthKit-workout-typen → onze CardioActivity. De bridge mag ook direct een
// CardioActivity-waarde sturen; onbekend → OTHER.
//
// Alleen typen die de app ÁNDERS behandelt staan hier. Alles daarbuiten is
// bewust OTHER en leest zijn naam uit `sourceActivity`; dat scheelt een
// migratie per sport en houdt de enum klein genoeg om over na te denken.
const ACTIVITY_MAP: Record<string, CardioActivity> = {
  running: 'RUNNING',
  cycling: 'CYCLING',
  rowing: 'ROWING',
  swimming: 'SWIMMING',
  walking: 'WALKING',
  hiking: 'HIKING',
  elliptical: 'CROSSTRAINER',
  stairClimbing: 'STAIRCLIMBER',
  stairs: 'STAIRCLIMBER',
  // Kracht komt in twee smaken uit HealthKit; voor de belasting is dat één ding.
  traditionalStrengthTraining: 'STRENGTH',
  functionalStrengthTraining: 'STRENGTH',
  coreTraining: 'STRENGTH',
  highIntensityIntervalTraining: 'HIIT',
  yoga: 'YOGA',
  pilates: 'YOGA',
  flexibility: 'YOGA',
  mindAndBody: 'YOGA',
  // directe enum-waarden (idempotent door uppercasing hieronder)
}
const VALID_ACTIVITIES = new Set<CardioActivity>([
  'RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'CROSSTRAINER', 'WALKING',
  'HIKING', 'SKIERG', 'ASSAULT_BIKE', 'WATTBIKE', 'STAIRCLIMBER',
  'STRENGTH', 'HIIT', 'YOGA', 'OTHER',
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

/**
 * Tijd-in-zone uit de hartslagcurve, voor bronnen die het niet meesturen.
 * Null wanneer er geen bruikbare curve of geen HR-profiel is.
 */
export function zonesFromSeries(
  series: SeriesPoint[] | undefined,
  profile: { maxHeartRate: number | null; restingHeartRate: number | null; dateOfBirth: Date | null } | null,
): Record<string, number> | null {
  if (!series || !profile) return null
  const hist = bpmHistogramFromSeries(series)
  if (!hist) return null
  const day = computeExertionDay(hist, {
    maxHeartRate: profile.maxHeartRate,
    restingHeartRate: profile.restingHeartRate,
    dateOfBirth: profile.dateOfBirth,
  })
  return day?.timeInZones ?? null
}

const workoutSchema = z.object({
  externalId: z.string().min(1),
  activity: z.string().min(1),
  /** Ruw type van de bron, zoals HealthKit het noemt ("hiking", "padel"). */
  sourceActivity: z.string().min(1).max(64).optional(),
  startAt: z.string(),
  endAt: z.string().optional(),
  durationSec: z.number().int().positive(),
  distanceM: z.number().int().nonnegative().optional(),
  avgHeartRate: z.number().int().min(30).max(240).optional(),
  maxHeartRate: z.number().int().min(30).max(240).optional(),
  activeEnergyKcal: z.number().nonnegative().optional(),
  timeInZones: z.record(z.string(), z.number()).optional(),
  // Per-minuut HR/tempo-tijdreeks voor de grafiek + decoupling. Gecapt op 240
  // punten (≈4u bij 1-min buckets); nul-tijdreeksen worden genegeerd.
  series: z
    .array(
      z.object({
        t: z.number().int().nonnegative(),
        hr: z.number().int().min(20).max(240).nullable(),
        spd: z.number().nonnegative().max(30).nullable(),
      }),
    )
    .max(240)
    .optional(),
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
//
// `histogram` is een aparte, additieve kijk op dezelfde dag: seconden per
// bpm-bin over het HELE etmaal, workouts INBEGREPEN. Daaruit rekenen we de
// dag-belasting (exertion/TRIMP). Optioneel, zodat oudere app-versies blijven
// werken; die sturen alleen `buckets`.
const hrDaySchema = z.object({
  date: z.string(), // yyyy-mm-dd
  buckets: z
    .array(z.object({ m: z.number().int().min(0).max(1439), bpm: z.number().min(20).max(240) }))
    .max(96),
  histogram: z.record(z.string(), z.number().min(0).max(86_400)).optional(),
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

type Db = Pick<PrismaClient, 'wearableConnection' | 'cardioLog' | 'sessionLog' | 'sleepEntry' | 'vitalsEntry' | 'stressEntry' | 'exertionEntry' | 'user'>

/**
 * Max-HR bepalen met een extra vangnet. `resolveMaxHr` kent alleen het profiel
 * (expliciete max-HR) en de leeftijd; ontbreken die allebei, dan viel de hele
 * dag-hartslag stil weg en kreeg zo'n gebruiker nooit stress-data. Als laatste
 * redmiddel nemen we de hoogst GEMETEN workout-hartslag. Boven 210 bpm gaan we
 * uit van een sensor-artefact en negeren we de waarde.
 */
async function resolveMaxHrWithMeasured(
  prisma: Db,
  userId: string,
  profile: { maxHeartRate: number | null; restingHeartRate: number | null; dateOfBirth: Date | null } | null,
): Promise<{ maxHr: number; method: string } | null> {
  const fromProfile = resolveMaxHr({
    maxHeartRate: profile?.maxHeartRate,
    restingHeartRate: profile?.restingHeartRate,
    dateOfBirth: profile?.dateOfBirth,
  })
  if (fromProfile) return fromProfile

  const measured = await prisma.cardioLog.findFirst({
    where: { patientId: userId, maxHeartRate: { gte: 120, lte: 210 } },
    orderBy: { maxHeartRate: 'desc' },
    select: { maxHeartRate: true },
  })
  if (measured?.maxHeartRate) return { maxHr: measured.maxHeartRate, method: 'MEASURED' }
  return null
}

/**
 * Bestaande gesyncte cardio-rij bijwerken, met respect voor de twee
 * hand-gezette sloten op zo'n rij. Retourneert false als de rij niet bestaat
 * (dan volgt de dedupe/create-tak bij de aanroeper).
 *
 * - `ratedAt` → de gebruiker heeft zelf een RPE ingevuld; die blijft staan.
 * - `hrOverriddenAt` → de hartslag is handmatig gecorrigeerd omdat de sensor
 *   onzin mat; alle HR-velden blijven staan, inclusief de daaruit afgeleide rpe.
 *
 * De sloten zitten in de WHERE, niet in een lees-dan-schrijf, zodat een
 * gelijktijdige beoordeel-popup of parallelle sync ze niet kan overrijden. De
 * vier varianten sluiten elkaar uit, dus precies één raakt de rij.
 */
export async function updateExistingSyncedLog(
  prisma: Pick<PrismaClient, 'cardioLog'>,
  userId: string,
  externalId: string,
  // Bewust het GECONTROLEERDE Prisma-type en niet `Record<string, unknown>`:
  // dat laatste laat ook `patientId` toe, en `data` bepaalt wat de rij WORDT
  // (de WHERE bepaalt alleen wélke rij). Een toekomstige aanroeper die een
  // gevalideerd-maar-doorgegeven object spreadt, zou een workout zo in het
  // dossier van een andere patiënt kunnen schrijven — zonder type-fout.
  data: Prisma.CardioLogUpdateManyMutationInput,
): Promise<boolean> {
  // `undefined` = Prisma laat het veld ongemoeid.
  const hrUntouched = {
    avgHeartRate: undefined,
    maxHeartRate: undefined,
    series: undefined,
    timeInZones: undefined,
    rpe: undefined,
  }
  const variants = [
    { lock: { ratedAt: null, hrOverriddenAt: null }, data },
    { lock: { ratedAt: { not: null }, hrOverriddenAt: null }, data: { ...data, rpe: undefined } },
    { lock: { ratedAt: null, hrOverriddenAt: { not: null } }, data: { ...data, ...hrUntouched } },
    { lock: { ratedAt: { not: null }, hrOverriddenAt: { not: null } }, data: { ...data, ...hrUntouched } },
  ] as const

  for (const v of variants) {
    const res = await prisma.cardioLog.updateMany({
      where: { patientId: userId, externalId, ...v.lock },
      data: v.data,
    })
    if (res.count > 0) return true
  }
  return false
}

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
      // Een aankomende sync ís een actieve koppeling: de app synct alleen als
      // de gebruiker op het toestel gekoppeld heeft (loskoppelen wist die
      // lokale vlag éérst, dus daarna komt hier niets meer binnen). Zonder dit
      // bleef `enabled` na een oude ontkoppeling voorgoed false — builds ≤77
      // zetten hem bij opnieuw koppelen nooit terug — terwijl de data gewoon
      // doorstroomde: alle schermen zeiden "koppeling uit" en de
      // readiness-cron sloeg de gebruiker over. Zelfde patroon als de
      // Strava-claim (routers/wearables.ts).
      enabled: true,
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

    // Tijd-in-zone zelf afleiden als de bron het niet meestuurt. De
    // HealthKit-brug heeft dat veld nooit gevuld, waardoor `edwardsTrimp` op
    // vrijwel elke gesyncte activiteit null gaf en het TRIMP-deel van de
    // belastingscurve in de praktijk uit stond. De hartslagcurve is er wél,
    // dus we rekenen het hier uit — via hetzelfde histogram als de
    // dagbelasting, zodat training en dag dezelfde zone-regels volgen.
    const timeInZones =
      w.timeInZones ?? zonesFromSeries(w.series, profile) ?? undefined

    const data = {
      activity,
      sourceActivity: w.sourceActivity ?? w.activity,
      protocol: 'STEADY_STATE' as const,
      durationSec: w.durationSec,
      distanceM: w.distanceM ?? null,
      avgHeartRate: w.avgHeartRate ?? null,
      maxHeartRate: w.maxHeartRate ?? null,
      calories: w.activeEnergyKcal != null ? Math.round(w.activeEnergyKcal) : null,
      rpe,
      timeInZones,
      series: w.series ?? undefined,
      avgPaceSecPerKm,
      source: 'APPLE_WATCH' as const,
      completedAt,
    }

    // Key op (patientId, externalId): een door de client aangeleverde
    // HealthKit-UUID kan zo nooit de cardio-rij van een ándere patiënt raken.
    // `updateExistingSyncedLog` bewaakt de hand-gezette RPE en een handmatig
    // gecorrigeerde hartslag (anchor-reset levert workouts opnieuw aan).
    const existed = await updateExistingSyncedLog(prisma, userId, w.externalId, data)
    // Id van de rij waar deze workout uiteindelijk in landde, voor het koppelen
    // hieronder. Een rij die al aan een sessie hangt slaan we over: dat werk is
    // gedaan en hoeft niet bij elke sync opnieuw.
    let logId: string | null = null
    if (existed) {
      const row = await prisma.cardioLog.findUnique({
        where: { patientId_externalId: { patientId: userId, externalId: w.externalId } },
        select: { id: true, sessionLogId: true },
      })
      logId = row && row.sessionLogId == null ? row.id : null
    }
    if (!existed) {
      // Cross-source check: dezelfde workout kan al via Strava binnen zijn
      // (of andersom). Tijd-overlap = zelfde training → niet dupliceren,
      // alleen ontbrekende velden op de bestaande rij aanvullen.
      const dup = await findDuplicate(prisma, userId, completedAt, w.durationSec)
      if (dup) {
        await enrichExistingLog(prisma, dup, data)
        logId = dup.id
      } else {
        try {
          const created = await prisma.cardioLog.create({
            data: { id: createId(), patientId: userId, externalId: w.externalId, ...data },
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

    // Krachttraining die de sporter ook in de app logde: hang de meting aan die
    // sessie. Zonder dit staat dezelfde training twee keer in de kalender en
    // telt hij twee keer mee in de belastingscurve. Best-effort — een mislukte
    // koppeling mag de rest van de sync niet omver trekken.
    if (logId) {
      try {
        await linkMeasurementToSession(prisma, userId, {
          id: logId,
          activity,
          startAt: completedAt,
          durationSec: w.durationSec,
        })
      } catch {
        // Volgende sync probeert het opnieuw.
      }
    }

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
  // BELANGRIJK: de bridge levert een dag in deelbatches aan (anchored
  // queries) — de ochtend-sync heeft HRV/rust-HR, een latere sync alleen
  // stappen/energie. De update mag daarom ALLEEN meegeleverde velden raken;
  // afwezig veld = ongemoeid laten. Voorheen wiste `?? null` hier de
  // HRV/rust-HR/ademhaling van eerdere batches op dezelfde dag.
  for (const v of payload.vitals) {
    const date = startOfDayUTCLocal(v.date)
    const patch: Record<string, unknown> = { source: 'APPLE_WATCH' }
    if (v.restingHeartRate !== undefined) patch.restingHeartRate = v.restingHeartRate
    if (v.hrv !== undefined) patch.hrv = v.hrv
    if (v.hrvType !== undefined) patch.hrvType = v.hrvType
    if (v.respiratoryRate !== undefined) patch.respiratoryRate = v.respiratoryRate
    if (v.wristTempDeviation !== undefined) patch.wristTempDeviation = v.wristTempDeviation
    if (v.steps !== undefined) patch.steps = Math.round(v.steps)
    if (v.activeEnergyKcal !== undefined) patch.activeEnergyKcal = Math.round(v.activeEnergyKcal)
    if (v.basalEnergyKcal !== undefined) patch.basalEnergyKcal = Math.round(v.basalEnergyKcal)
    if (v.vo2Max !== undefined) patch.vo2Max = v.vo2Max
    await prisma.vitalsEntry.upsert({
      where: { userId_date: { userId, date } },
      update: patch,
      create: {
        id: createId(),
        userId,
        date,
        restingHeartRate: v.restingHeartRate ?? null,
        hrv: v.hrv ?? null,
        hrvType: v.hrvType ?? null,
        respiratoryRate: v.respiratoryRate ?? null,
        wristTempDeviation: v.wristTempDeviation ?? null,
        steps: v.steps != null ? Math.round(v.steps) : null,
        activeEnergyKcal: v.activeEnergyKcal != null ? Math.round(v.activeEnergyKcal) : null,
        basalEnergyKcal: v.basalEnergyKcal != null ? Math.round(v.basalEnergyKcal) : null,
        vo2Max: v.vo2Max ?? null,
        source: 'APPLE_WATCH',
      },
    })
    affected.add(date.getTime())
  }

  // ── Stress → StressEntry (server-side %HRR, HRmax uit profiel/leeftijd) ───
  // Zonder max-HR kunnen we geen %HRR rekenen. Dat is nu een expliciete,
  // zichtbare uitkomst i.p.v. stil verlies (zie resolveMaxHrWithMeasured).
  const maxHrRes = await resolveMaxHrWithMeasured(prisma, userId, profile)
  if (!maxHrRes && payload.hrIntraday.length > 0) {
    console.warn(
      '[wearables] dag-hartslag overgeslagen: geen max-HR te bepalen (geen profiel-max, geen geboortedatum, geen gemeten workout-HR)',
      { userId, days: payload.hrIntraday.length },
    )
  }
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

    // ── Exertion → ExertionEntry (dag-belasting uit het bpm-histogram) ──────
    // Andere bron dan stress hierboven: dit histogram bevat het HELE etmaal,
    // workout-minuten inbegrepen. Losse readout; gaat bewust NIET de sRPE-curve
    // in (andere eenheid + zou gelogde trainingen dubbel tellen).
    for (const day of payload.hrIntraday) {
      if (!day.histogram) continue
      // Ook een dag zonder meetbare belasting opslaan (trimp 0): dan blijft
      // het histogram bewaard en is de dag herberekenbaar bij een latere
      // formule-wijziging. Stil overslaan gooide eerder hele dagen weg.
      const ex = computeExertionDay(day.histogram, {
        maxHeartRate: maxHrRes.maxHr,
        restingHeartRate: restByDay.get(day.date) ?? profile?.restingHeartRate ?? null,
      }) ?? { trimp: 0, activeSec: 0, timeInZones: {} }
      const date = startOfDayUTCLocal(day.date)
      const data = {
        trimp: ex.trimp,
        activeSec: ex.activeSec,
        timeInZones: ex.timeInZones,
        hrHistogram: day.histogram,
        maxHrUsed: maxHrRes.maxHr,
        source: 'APPLE_WATCH' as const,
      }
      await prisma.exertionEntry.upsert({
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
