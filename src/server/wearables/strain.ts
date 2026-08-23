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
 * Strain 0-100 voor een training op `date`, of null zonder genoeg
 * referentiedagen. `date` is de dag van de training zelf; die telt bewust niet
 * mee in zijn eigen anker, net als bij de dagbelasting.
 */
export async function strainForMeasurement(
  prisma: Db,
  userId: string,
  date: Date,
  trimp: number | null,
): Promise<number | null> {
  if (trimp == null) return null
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const since = new Date(day.getTime() - REFERENCE_DAYS * 24 * 3600 * 1000)
  const refs = await prisma.exertionEntry.findMany({
    where: { userId, date: { gte: since, lt: day } },
    orderBy: { date: 'asc' },
    select: { trimp: true },
  })
  return sessionStrain(trimp, refs.map((r) => r.trimp))
}
