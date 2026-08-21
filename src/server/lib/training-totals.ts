/**
 * Tellingen voor de tegels op het beginscherm: wat deed je deze week, wat all-
 * time, en wat je laatste training was.
 *
 * `weekWindow` en `pickLastActivity` zijn puur en blijven dat, zodat de
 * weekgrens en de keuze van de laatste activiteit te testen zijn zonder
 * database. `computeSessionStats` erbij is dat niet meer: dat is de ene plek
 * die de aggregatie tegen de database uitvoert, zodat `patient.getSessionStats`
 * en `scripts/verify-home-tiles-live.ts` dezelfde code aanroepen in plaats van
 * hem allebei te herbouwen.
 */
import type { PrismaClient } from '@prisma/client'
import { addDaysKey, amsMidnight, mondayKeyOf } from '@/lib/week-dates'

/** Krachtsessie zoals de router hem selecteert. */
export type SessionRow = {
  id: string
  completedAt: Date | null
  duration: number | null
  exertionLevel: number | null
  painLevel: number | null
  completedAll: boolean
  program: { name: string } | null
  _count: { exerciseLogs: number }
}

/** Cardio-log zoals de router hem selecteert. */
export type CardioRow = {
  id: string
  completedAt: Date
  activity: string
  durationSec: number
  distanceM: number | null
  avgHeartRate: number | null
  zone: number | null
  rpe: number | null
  painLevel: number | null
  avgPaceSecPerKm: number | null
  notes: string | null
}

/**
 * De laatste activiteit, in de velden die de app nodig heeft om er een
 * `CalEvent` van te maken en de bestaande detailweergave te openen. De naam
 * blijft rauw (`programName`, `activity`): de app vertaalt die, zodat de
 * labels op één plek staan.
 */
export type LastActivity =
  | {
      kind: 'session'
      id: string
      completedAt: string
      programName: string | null
      durationSec: number | null
      rpe: number | null
      pain: number | null
      exerciseCount: number
      completedAll: boolean
    }
  | {
      kind: 'cardio'
      id: string
      completedAt: string
      activity: string
      durationSec: number
      distanceM: number | null
      avgHeartRate: number | null
      zone: number | null
      rpe: number | null
      pain: number | null
      paceSecPerKm: number | null
      notes: string | null
    }

export type SessionStats = {
  /** ONGEWIJZIGD: krachtsessies all-time. Build 82 en ouder lezen dit veld. */
  total: number
  /** Kracht plus cardio, maandag tot en met zondag in NL-tijd. */
  week: { count: number; seconds: number }
  /** Kracht plus cardio, all-time. */
  allTime: { count: number }
  last: LastActivity | null
}

/**
 * Maandag 00:00 tot de maandag erna, in Amsterdamse tijd.
 *
 * Niet met `getDay()` of `getUTCDay()`: de server draait in UTC en maandag
 * 00:30 in Amsterdam is daar zondag 22:30, wat een week terug zou schuiven.
 * Zie de kop van `src/lib/week-dates.ts`.
 */
export function weekWindow(now: Date): { from: Date; to: Date } {
  const maandag = mondayKeyOf(now)
  return {
    from: amsMidnight(maandag),
    to: amsMidnight(addDaysKey(maandag, 7)),
  }
}

/**
 * De recentste van de twee. Bij een gelijke tijd wint de krachtsessie, zodat
 * het antwoord deterministisch is.
 */
export function pickLastActivity(
  session: SessionRow | null,
  cardio: CardioRow | null,
): LastActivity | null {
  const sTijd = session?.completedAt?.getTime() ?? null
  const cTijd = cardio?.completedAt.getTime() ?? null

  if (sTijd == null && cTijd == null) return null

  const neemCardio = cardio != null && cTijd != null && (sTijd == null || cTijd > sTijd)
  if (neemCardio) {
    return {
      kind: 'cardio',
      id: cardio.id,
      completedAt: cardio.completedAt.toISOString(),
      activity: cardio.activity,
      durationSec: cardio.durationSec,
      distanceM: cardio.distanceM,
      avgHeartRate: cardio.avgHeartRate,
      zone: cardio.zone,
      rpe: cardio.rpe,
      pain: cardio.painLevel,
      paceSecPerKm: cardio.avgPaceSecPerKm,
      notes: cardio.notes,
    }
  }

  if (!session || !session.completedAt) return null
  return {
    kind: 'session',
    id: session.id,
    completedAt: session.completedAt.toISOString(),
    programName: session.program?.name ?? null,
    durationSec: session.duration,
    rpe: session.exertionLevel,
    pain: session.painLevel,
    exerciseCount: session._count.exerciseLogs,
    completedAll: session.completedAll,
  }
}

/**
 * De aggregatie achter de twee tegels op het beginscherm. Draait zes queries
 * parallel: all-time-tellers, weektellers (kracht + cardio) en de meest
 * recente van elk voor `last`.
 *
 * `total` blijft precies wat het was (krachtsessies all-time, zonder de
 * tendinopathie-dagrondes) omdat build 82 en ouder in TestFlight dat veld
 * lezen. De rest is erbij gekomen; oude clients negeren die velden.
 *
 * Geen extra klem op duur bij het optellen: `clampSessionDurationSec`
 * begrenst al bij het schrijven, en een tweede klem hier zou het weektotaal
 * laten afwijken van de sessies die je in de app kunt openen.
 */
export async function computeSessionStats(
  prisma: Pick<PrismaClient, 'sessionLog' | 'cardioLog'>,
  patientId: string,
  now: Date,
): Promise<SessionStats> {
  const krachtBasis = {
    patientId,
    status: 'COMPLETED' as const,
    NOT: { program: { tendinopathyMode: true, dailyTarget: { not: null } } },
  }
  const cardioBasis = { patientId }
  const { from, to } = weekWindow(now)

  const [total, cardioTotal, weekKracht, weekCardio, laatsteKracht, laatsteCardio] =
    await Promise.all([
      prisma.sessionLog.count({ where: krachtBasis }),
      prisma.cardioLog.count({ where: cardioBasis }),
      prisma.sessionLog.aggregate({
        where: { ...krachtBasis, completedAt: { gte: from, lt: to } },
        _count: { _all: true },
        _sum: { duration: true },
      }),
      prisma.cardioLog.aggregate({
        where: { ...cardioBasis, completedAt: { gte: from, lt: to } },
        _count: { _all: true },
        _sum: { durationSec: true },
      }),
      prisma.sessionLog.findFirst({
        where: { ...krachtBasis, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          completedAt: true,
          duration: true,
          exertionLevel: true,
          painLevel: true,
          completedAll: true,
          program: { select: { name: true } },
          _count: { select: { exerciseLogs: true } },
        },
      }),
      prisma.cardioLog.findFirst({
        where: cardioBasis,
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          completedAt: true,
          activity: true,
          durationSec: true,
          distanceM: true,
          avgHeartRate: true,
          zone: true,
          rpe: true,
          painLevel: true,
          avgPaceSecPerKm: true,
          notes: true,
        },
      }),
    ])

  return {
    total,
    week: {
      count: weekKracht._count._all + weekCardio._count._all,
      seconds: (weekKracht._sum.duration ?? 0) + (weekCardio._sum.durationSec ?? 0),
    },
    allTime: { count: total + cardioTotal },
    last: pickLastActivity(laatsteKracht, laatsteCardio),
  }
}
