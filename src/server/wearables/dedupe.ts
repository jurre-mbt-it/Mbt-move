/**
 * Cross-source ontdubbeling van gesyncte workouts.
 *
 * Dezelfde training kan via meerdere integraties binnenkomen (Apple Watch →
 * HealthKit-sync én dezelfde workout ge-upload naar Strava). Binnen één bron
 * dedupliceert (patientId, externalId), maar over bronnen heen verschillen de
 * externalId's. Twee workouts van dezelfde persoon kunnen niet tegelijk
 * plaatsvinden, dus significante tijd-overlap = zelfde training.
 *
 * Regel: overlap van de tijdvensters ≥ 50% van de kortste duur, of starts
 * binnen 2 minuten met vergelijkbare duur. Handmatig gelogde cardio (source
 * MANUAL, geen externalId) laten we met rust — een handmatige log kan bewust
 * naast een watch-workout bestaan (bv. nagelogd met eigen RPE) en de
 * beoordeel-popup koppelt die al.
 */
import type { PrismaClient } from '@prisma/client'

type Db = Pick<PrismaClient, 'cardioLog'>

export type OverlapCandidate = {
  id: string
  externalId: string | null
  source: string
  completedAt: Date
  durationSec: number
  ratedAt: Date | null
}

export function overlapsAsDuplicate(
  aStart: Date, aDurSec: number,
  bStart: Date, bDurSec: number,
): boolean {
  const aS = aStart.getTime()
  const aE = aS + aDurSec * 1000
  const bS = bStart.getTime()
  const bE = bS + bDurSec * 1000
  const overlapMs = Math.min(aE, bE) - Math.max(aS, bS)
  const minDurMs = Math.min(aDurSec, bDurSec) * 1000
  if (minDurMs <= 0) return false
  if (overlapMs >= 0.5 * minDurMs) return true
  // Klok-skew tussen bronnen: zelfde start (±2 min) en duur die ±20% matcht.
  const startDiffMs = Math.abs(aS - bS)
  const durDiffSec = Math.abs(aDurSec - bDurSec)
  return startDiffMs <= 120_000 && durDiffSec <= Math.max(120, 0.2 * Math.min(aDurSec, bDurSec))
}

/**
 * Zoek een bestaande gesyncte CardioLog van een ÁNDERE integratie die dezelfde
 * training beschrijft. Null = geen duplicaat.
 */
export async function findCrossSourceDuplicate(
  prisma: Db,
  patientId: string,
  completedAt: Date,
  durationSec: number,
  sourceOfNew: string,
): Promise<OverlapCandidate | null> {
  // Kandidaten binnen een ruim venster rond de workout (duur + 30 min marge);
  // de precieze overlap-check gebeurt in JS.
  const windowMs = (durationSec + 1800) * 1000
  const candidates = await prisma.cardioLog.findMany({
    where: {
      patientId,
      source: { not: sourceOfNew as never },
      externalId: { not: null }, // alleen gesyncte rijen — handmatige logs met rust laten
      completedAt: {
        gte: new Date(completedAt.getTime() - windowMs),
        lte: new Date(completedAt.getTime() + windowMs),
      },
    },
    select: {
      id: true, externalId: true, source: true,
      completedAt: true, durationSec: true, ratedAt: true,
    },
    take: 10,
  })
  for (const c of candidates) {
    if (overlapsAsDuplicate(completedAt, durationSec, c.completedAt, c.durationSec)) return c
  }
  return null
}

/**
 * Vul ontbrekende velden op de bestaande (winnende) rij aan met data uit de
 * duplicaat-payload — bv. Strava heeft tempo/afstand, de watch heeft HR-zones.
 * Bestaande waarden en de bron/externalId blijven onaangetast; rpe alleen als
 * de rij niet handmatig beoordeeld is.
 *
 * Is de hartslag handmatig gecorrigeerd (`hrOverriddenAt`), dan blijven álle
 * HR-velden leeg-of-niet met rust. Een leeggemaakte `series` is daar een
 * bewuste keuze — zonder deze check zou de andere bron hem gewoon weer vullen
 * met dezelfde onbruikbare meting.
 */
export async function enrichExistingLog(
  prisma: Db,
  existing: OverlapCandidate,
  incoming: {
    distanceM?: number | null
    avgHeartRate?: number | null
    maxHeartRate?: number | null
    calories?: number | null
    rpe?: number | null
    timeInZones?: unknown
    series?: unknown
    avgPaceSecPerKm?: number | null
  },
): Promise<void> {
  const row = await prisma.cardioLog.findUnique({
    where: { id: existing.id },
    select: {
      distanceM: true, avgHeartRate: true, maxHeartRate: true, calories: true,
      rpe: true, timeInZones: true, series: true, avgPaceSecPerKm: true,
      ratedAt: true, hrOverriddenAt: true,
    },
  })
  if (!row) return
  const hrLocked = row.hrOverriddenAt != null
  const patch: Record<string, unknown> = {}
  if (row.distanceM == null && incoming.distanceM != null) patch.distanceM = incoming.distanceM
  if (!hrLocked && row.avgHeartRate == null && incoming.avgHeartRate != null) patch.avgHeartRate = incoming.avgHeartRate
  if (!hrLocked && row.maxHeartRate == null && incoming.maxHeartRate != null) patch.maxHeartRate = incoming.maxHeartRate
  if (row.calories == null && incoming.calories != null) patch.calories = incoming.calories
  if (row.avgPaceSecPerKm == null && incoming.avgPaceSecPerKm != null) patch.avgPaceSecPerKm = incoming.avgPaceSecPerKm
  if (!hrLocked && row.timeInZones == null && incoming.timeInZones != null) patch.timeInZones = incoming.timeInZones
  if (!hrLocked && row.series == null && incoming.series != null) patch.series = incoming.series
  if (!hrLocked && row.rpe == null && row.ratedAt == null && incoming.rpe != null) patch.rpe = incoming.rpe
  if (Object.keys(patch).length > 0) {
    await prisma.cardioLog.update({ where: { id: existing.id }, data: patch })
  }
}
