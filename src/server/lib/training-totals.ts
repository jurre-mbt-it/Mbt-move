/**
 * Tellingen voor de tegels op het beginscherm: wat deed je deze week, en wat
 * was je laatste training.
 *
 * De vorm zit hier los van `patient.getSessionStats` zodat de weekgrens en de
 * keuze van de laatste activiteit te testen zijn zonder database.
 */
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
