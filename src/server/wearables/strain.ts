/**
 * Strain van één training, op dezelfde schaal als de dagbelasting.
 *
 * Het rekenwerk zelf staat in `lib/exertion` (`sessionStrain`); wat hier
 * gebeurt is het ophalen van de juiste referentie. En dat luistert nauw: de
 * dagbelasting ankert op de p90 van de dagen vóór die dag, dus een training
 * moet op precies diezelfde verzameling geankerd worden. Doe je dat niet, dan
 * kan er "training 7,1 · dag 6,3" op één scherm komen te staan.
 */
import type { PrismaClient } from '@prisma/client'

import { bpmHistogramFromSeries, computeExertionDay, sessionStrain, type SeriesPoint } from '@/lib/exertion'
import { edwardsTrimp } from '@/lib/training-load'

/** Zelfde venster als `wearables.overview` voor de dagbelasting. */
const REFERENCE_DAYS = 60

type Db = Pick<PrismaClient, 'exertionEntry'>

/**
 * TRIMP van één meting. Eerst de opgeslagen tijd-in-zone; ontbreekt die (oude
 * rijen van vóór de curve-afleiding), dan alsnog uit de hartslagcurve.
 */
export function trimpOfMeasurement(
  measurement: {
    timeInZones?: unknown
    series?: unknown
  },
  profile: { maxHeartRate: number | null; restingHeartRate: number | null; dateOfBirth: Date | null } | null,
): number | null {
  const stored = edwardsTrimp(measurement.timeInZones as Record<string, number> | null)
  if (stored != null) return stored
  if (!profile) return null
  const hist = bpmHistogramFromSeries(measurement.series as SeriesPoint[] | null)
  if (!hist) return null
  return computeExertionDay(hist, profile)?.trimp ?? null
}

/**
 * Strain van de training én de dagbelasting van diezelfde dag, allebei 0-100.
 *
 * Samen opgehaald omdat ze samen gelezen worden ("deze training 5,1 van je
 * 6,3 vandaag") en omdat ze dan gegarandeerd op dezelfde referentiedagen
 * geankerd zijn. Twee losse aanroepen zouden dat per ongeluk uit elkaar kunnen
 * laten lopen.
 *
 * `date` is de dag van de training zelf; die telt bewust niet mee in zijn
 * eigen anker, precies zoals bij de dagbelasting.
 */
export async function strainForMeasurement(
  prisma: Db,
  userId: string,
  date: Date,
  trimp: number | null,
): Promise<{ strain: number | null; dayStrain: number | null }> {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const since = new Date(day.getTime() - REFERENCE_DAYS * 24 * 3600 * 1000)
  const rows = await prisma.exertionEntry.findMany({
    where: { userId, date: { gte: since, lte: day } },
    orderBy: { date: 'asc' },
    select: { date: true, trimp: true },
  })
  // De dag zelf hoort niet in zijn eigen referentie.
  const refs = rows.filter((r) => r.date.getTime() < day.getTime()).map((r) => r.trimp)
  const today = rows.find((r) => r.date.getTime() === day.getTime())
  return {
    strain: trimp == null ? null : sessionStrain(trimp, refs),
    dayStrain: today ? sessionStrain(today.trimp, refs) : null,
  }
}
