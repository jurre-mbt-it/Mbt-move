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
import { clampSessionDurationSec, edwardsTrimp } from '@/lib/training-load'

/** Zelfde venster als `wearables.overview` voor de dagbelasting. */
const REFERENCE_DAYS = 60

type Db = Pick<PrismaClient, 'exertionEntry' | 'sessionLog'>

/**
 * TRIMP-schatting uit duur en RPE, voor trainingen zonder hartslagmeting.
 *
 * De meeste krachttrainingen worden zónder horloge gedaan; dat is de regel en
 * niet de uitzondering. Zonder deze schatting blijft de strain daar leeg,
 * terwijl duur en RPE gewoon gelogd zijn en samen prima zeggen hoe zwaar het
 * was.
 *
 * De omrekening komt uit onze eigen zone-tabel: `HR_ZONES` koppelt zone 1 aan
 * "RPE 1-2", zone 2 aan "RPE 3-4", zone 3 aan "RPE 5-6", zone 4 aan "RPE 7-8"
 * en zone 5 aan "RPE 9-10". Dat is RPE gedeeld door twee. Edwards-TRIMP is
 * minuten × zone, dus:
 *
 *   trimp ≈ minuten × (RPE / 2)
 *
 * Het resultaat staat daarmee in dezelfde eenheid als de gemeten TRIMP en kan
 * door dezelfde curve en hetzelfde ankerpunt. Bewust NIET de sRPE zelf
 * (minuten × RPE): dat is een andere eenheid en zou tegen een TRIMP-anker
 * ongeveer het dubbele opleveren.
 *
 * Bij kracht is deze schatting inhoudelijk vaak eerlijker dan de gemeten
 * variant, omdat hartslag de mechanische belasting van tillen slecht volgt.
 * Toch wint een echte meting als die er is: dan hoeven we niet te schatten.
 *
 * De duur wordt afgekapt met dezelfde grens als de belastingscurve, zodat een
 * doorgelopen timer hier ook geen absurde uitschieter oplevert.
 */
export function estimateTrimpFromSrpe(
  durationSec: number | null | undefined,
  rpe: number | null | undefined,
): number | null {
  if (rpe == null || !Number.isFinite(rpe) || rpe <= 0) return null
  const sec = clampSessionDurationSec(durationSec)
  if (sec <= 0) return null
  return Math.round((sec / 60) * (rpe / 2))
}

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
 * Samen opgehaald omdat ze samen gelezen worden ("deze training 5,1 van je 6,3
 * vandaag") en omdat ze dan gegarandeerd op dezelfde referentiedagen geankerd
 * zijn. Twee losse aanroepen zouden dat per ongeluk uit elkaar kunnen laten
 * lopen.
 *
 * `date` is de dag van de training zelf; die telt bewust niet mee in zijn eigen
 * anker, precies zoals bij de dagbelasting.
 *
 * Twee ankerpunten, in deze volgorde:
 *
 * 1. De dag-TRIMP's van de voorgaande dagen. Dan is de strain rechtstreeks te
 *    vergelijken met de dagbelasting die ernaast staat.
 * 2. Heeft iemand geen wearable, dan bestaan die dagen niet en zou de strain
 *    voorgoed leeg blijven. Dan ankeren we op de geschatte TRIMP van zijn eigen
 *    voorgaande trainingen. Er staat dan ook geen dagcijfer naast, dus er is
 *    niets om mee in tegenspraak te zijn.
 */
export async function strainForSession(
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
  const dagRefs = rows.filter((r) => r.date.getTime() < day.getTime()).map((r) => r.trimp)
  const today = rows.find((r) => r.date.getTime() === day.getTime())
  const dayStrain = today ? sessionStrain(today.trimp, dagRefs) : null

  if (trimp == null) return { strain: null, dayStrain }

  const opDagen = sessionStrain(trimp, dagRefs)
  if (opDagen != null) return { strain: opDagen, dayStrain }

  // Geen bruikbare dag-historie: ankeren op de eigen trainingen.
  const sessies = await prisma.sessionLog.findMany({
    where: {
      patientId: userId,
      completedAt: { gte: since, lt: date },
      exertionLevel: { not: null },
      duration: { not: null },
    },
    orderBy: { completedAt: 'asc' },
    select: { duration: true, exertionLevel: true },
  })
  const sessieRefs = sessies
    .map((s) => estimateTrimpFromSrpe(s.duration, s.exertionLevel))
    .filter((t): t is number => t != null)

  return { strain: sessionStrain(trimp, sessieRefs), dayStrain }
}
