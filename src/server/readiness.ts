/**
 * Server-helper voor readiness v2: haalt vitals + slaap + wellness van een
 * gebruiker op, draait het hybride model uit src/lib/readiness.ts en bewaart
 * een dagelijkse momentopname (ReadinessSnapshot) voor trends/cohort.
 *
 * Gedeeld door de sync-route (na ingestie), de wearables-router (on-the-fly)
 * en de cron.
 */
import type { PrismaClient } from '@prisma/client'
import {
  computeReadiness,
  type ReadinessLocale,
  type ReadinessResult,
  type SleepDay,
  type VitalsDay,
} from '@/lib/readiness'
import { personalSleepNeed, sleepQualityScore } from '@/lib/sleep-metrics'

type Db = Pick<PrismaClient, 'vitalsEntry' | 'sleepEntry' | 'wellnessCheck' | 'readinessSnapshot'>

const HISTORY_DAYS = 70 // genoeg voor de 60-daagse normaal-band + marge

/**
 * Venster (dagen terug vanaf `date`) dat computeReadinessFor nodig heeft.
 * Geëxporteerd zodat callers die rows voorladen (wearables-router) weten hoe
 * ver terug ze minimaal moeten ophalen.
 */
export const READINESS_HISTORY_DAYS = HISTORY_DAYS

/** Minimale rij-vormen voor voorgeladen data (zie computeReadinessFor). */
export type ReadinessVitalsRow = {
  date: Date
  hrv: number | null
  restingHeartRate: number | null
  respiratoryRate: number | null
  wristTempDeviation: number | null
}
export type ReadinessSleepRow = {
  date: Date
  qualityScore: number | null
  asleepMin: number | null
  deepMin: number | null
  remMin: number | null
  efficiency: number | null
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d = new Date()): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/**
 * Bereken readiness voor `date` (default vandaag) zonder op te slaan.
 *
 * `preloaded`: al-opgehaalde sleep/vitals-rijen (oplopend op datum gesorteerd,
 * minimaal READINESS_HISTORY_DAYS terug dekkend) — de wearables-router geeft
 * die mee zodat dezelfde tabellen niet dubbel gelezen worden. Het datumvenster
 * wordt hier alsnog toegepast, dus een ruimere set is prima.
 *
 * `locale`: taal van de LEZER (niet van de patiënt) voor de uitleg-teksten.
 * De iOS-app zet 'm via `User.locale`; de web-app laat 'm leeg en blijft NL.
 */
export async function computeReadinessFor(
  prisma: Db,
  userId: string,
  date: Date = new Date(),
  preloaded?: { vitals: ReadinessVitalsRow[]; sleep: ReadinessSleepRow[] },
  locale: ReadinessLocale = 'nl',
): Promise<ReadinessResult> {
  const target = startOfDay(date)
  const since = new Date(target)
  since.setDate(since.getDate() - HISTORY_DAYS)
  const inWindow = (d: Date) => d >= since && d <= target

  const [vitalsRows, sleepRows, wellness] = await Promise.all([
    preloaded
      ? preloaded.vitals.filter(v => inWindow(v.date))
      : prisma.vitalsEntry.findMany({
          where: { userId, date: { gte: since, lte: target } },
          orderBy: { date: 'asc' },
          select: {
            date: true, hrv: true, restingHeartRate: true,
            respiratoryRate: true, wristTempDeviation: true,
          },
        }),
    preloaded
      ? preloaded.sleep.filter(s => inWindow(s.date))
      : prisma.sleepEntry.findMany({
          where: { userId, date: { gte: since, lte: target } },
          orderBy: { date: 'asc' },
          select: {
            date: true, qualityScore: true,
            asleepMin: true, deepMin: true, remMin: true, efficiency: true,
          },
        }),
    prisma.wellnessCheck.findUnique({
      where: { userId_date: { userId, date: target } },
      select: { sleep: true, soreness: true, fatigue: true, mood: true, stress: true },
    }),
  ])

  const vitals: VitalsDay[] = vitalsRows.map(v => ({
    date: isoDay(v.date),
    hrv: v.hrv,
    restingHeartRate: v.restingHeartRate,
    respiratoryRate: v.respiratoryRate,
    wristTempDeviation: v.wristTempDeviation,
  }))
  // Slaapscore relatief aan de eigen behoefte (p75 laatste 30 nachten,
  // geclampt 6-9u): een structurele korte slaper wordt beoordeeld op zijn
  // eigen normaal i.p.v. elke ochtend rood op de 8u-populatienorm. Herberekend
  // bij het lezen — de opgeslagen qualityScore blijft de absolute score voor
  // de slaap-detailschermen.
  const needMin = personalSleepNeed(sleepRows.map(s => s.asleepMin ?? 0))
  const sleep: SleepDay[] = sleepRows.map(s => ({
    date: isoDay(s.date),
    qualityScore:
      s.asleepMin != null && s.asleepMin > 0
        ? sleepQualityScore(
            {
              asleepMin: s.asleepMin,
              deepMin: s.deepMin ?? 0,
              remMin: s.remMin ?? 0,
              efficiency: s.efficiency,
            },
            needMin,
          )
        : s.qualityScore,
  }))

  return computeReadiness(vitals, sleep, wellness, isoDay(target), locale)
}

/** Bereken én bewaar de momentopname voor `date`. Idempotent (upsert op dag). */
export async function computeAndStoreReadiness(
  prisma: Db,
  userId: string,
  date: Date = new Date(),
): Promise<ReadinessResult> {
  const result = await computeReadinessFor(prisma, userId, date)
  const target = startOfDay(date)

  // LEARNING-dagen hebben geen score; sla ze niet op als snapshot (anders
  // vervuilt het cohort-aggregaat met null-scores).
  if (result.score == null) return result

  await prisma.readinessSnapshot.upsert({
    where: { userId_date: { userId, date: target } },
    update: {
      score: result.score,
      band: result.band,
      contributors: result.contributors as unknown as object,
    },
    create: {
      userId,
      date: target,
      score: result.score,
      band: result.band,
      contributors: result.contributors as unknown as object,
    },
  })
  return result
}
