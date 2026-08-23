/**
 * Koppel een op de watch gemeten workout aan de krachtsessie die de sporter in
 * de app logde.
 *
 * Wie zijn oefeningen in de app bijhoudt én op zijn horloge een workout start,
 * legt dezelfde training twee keer vast: op het horloge de tijd en de hartslag,
 * in de app de sets en reps. Die twee wisten niets van elkaar. Gevolg: twee
 * kaarten in de kalender voor één training, en twee keer sRPE in de
 * belastingscurve — de training telde dubbel.
 *
 * Gekoppeld is de watch-rij de MÉTING bij die sessie: geen eigen kaart, geen
 * eigen sRPE, wel de hartslagcurve, de tijd-in-zone en de strain.
 */
import type { CardioActivity, PrismaClient } from '@prisma/client'

import { overlapsAsDuplicate } from './dedupe'

/**
 * Alleen workout-typen die géén eigen uithoudingstraining zijn. Een hardloop
 * die toevallig over een krachtsessie heen valt is een meetfout, geen match;
 * die hoort een zelfstandige activiteit te blijven.
 */
const LINKABLE = new Set<CardioActivity>(['STRENGTH', 'HIIT', 'YOGA', 'OTHER'])

export function isLinkableActivity(activity: CardioActivity): boolean {
  return LINKABLE.has(activity)
}

export type SessionWindow = {
  id: string
  /** Einde van de sessie. */
  completedAt: Date
  /** Duur in seconden; null wanneer de sessie geen timer had. */
  duration: number | null
  scheduledAt: Date
  /** Al gekoppeld aan een andere meting → niet meer beschikbaar. */
  hasCardioLog: boolean
}

/**
 * Een sessie zonder timer waarvan het venster hier bovenuit komt, doet niet
 * mee. De overlapregel eist 50% van de KÓRTSTE van de twee, dus een sessie die
 * 's ochtends gestart en 's avonds afgerond is zou anders elke losse workout
 * uit die acht uur naar zich toe trekken — inclusief een fietstocht die er
 * niets mee te maken heeft. Een krachttraining van meer dan vier uur bestaat
 * niet; zo'n rij zegt "iemand vergat af te ronden", en dan is geen koppeling
 * beter dan een gegokte.
 */
const MAX_UNTIMED_WINDOW_SEC = 4 * 3600

/**
 * Tijdvenster van een sessie. Met een gelogde duur rekenen we terug vanaf het
 * afronden — dat is het betrouwbare signaal. Zonder duur nemen we het venster
 * tussen starten en afronden, mits dat geloofwaardig kort is.
 */
function windowOf(s: SessionWindow): { start: Date; durationSec: number } | null {
  const end = s.completedAt.getTime()
  if (s.duration && s.duration > 0) {
    return { start: new Date(end - s.duration * 1000), durationSec: s.duration }
  }
  const start = s.scheduledAt.getTime()
  const durationSec = Math.round((end - start) / 1000)
  if (durationSec <= 0 || durationSec > MAX_UNTIMED_WINDOW_SEC) return null
  return { start: new Date(start), durationSec }
}

/**
 * Welke sessie beschrijft deze meting? Null wanneer er geen overtuigende match
 * is — liever twee losse regels dan een hartslagcurve onder de verkeerde
 * training. Bij meerdere kandidaten wint de sessie waarvan het midden het
 * dichtst bij dat van de meting ligt.
 */
export function pickMatchingSession(
  /**
   * `startAt` is het BEGIN van de meting. Let op: op `CardioLog` heet dat veld
   * `completedAt`, maar de ingest zet daar `w.startAt` in en de ontdubbeling
   * rekent er ook mee als starttijd. Hier staat de goede naam, zodat het
   * verschil niet stilletjes een half uur verschuift.
   */
  measurement: { activity: CardioActivity; startAt: Date; durationSec: number },
  sessions: SessionWindow[],
): SessionWindow | null {
  if (!isLinkableActivity(measurement.activity)) return null
  if (!(measurement.durationSec > 0)) return null

  const mStart = measurement.startAt
  const mMid = mStart.getTime() + (measurement.durationSec * 1000) / 2

  let best: { session: SessionWindow; delta: number } | null = null
  for (const s of sessions) {
    if (s.hasCardioLog) continue
    const w = windowOf(s)
    if (!w) continue
    if (!overlapsAsDuplicate(mStart, measurement.durationSec, w.start, w.durationSec)) continue
    const delta = Math.abs(w.start.getTime() + (w.durationSec * 1000) / 2 - mMid)
    if (!best || delta < best.delta) best = { session: s, delta }
  }
  return best?.session ?? null
}

type Db = Pick<PrismaClient, 'cardioLog' | 'sessionLog'>

/**
 * Ruime greep rond de meting; `pickMatchingSession` doet daarna het echte werk.
 * Zes uur speling vangt sessies die pas later zijn afgerond.
 */
const SEARCH_MARGIN_MS = 6 * 3600 * 1000

/**
 * Zoek de sessie bij een zojuist binnengekomen meting en leg de koppeling.
 * Geeft het sessie-id terug, of null als er geen match was.
 */
export async function linkMeasurementToSession(
  prisma: Db,
  patientId: string,
  measurement: { id: string; activity: CardioActivity; startAt: Date; durationSec: number },
): Promise<string | null> {
  if (!isLinkableActivity(measurement.activity)) return null

  const from = new Date(measurement.startAt.getTime() - SEARCH_MARGIN_MS)
  const to = new Date(measurement.startAt.getTime() + measurement.durationSec * 1000 + SEARCH_MARGIN_MS)
  const rows = await prisma.sessionLog.findMany({
    where: { patientId, completedAt: { not: null, gte: from, lte: to } },
    select: {
      id: true, completedAt: true, duration: true, scheduledAt: true,
      cardioLog: { select: { id: true } },
    },
    take: 20,
  })

  const hit = pickMatchingSession(
    measurement,
    rows.map((r) => ({
      id: r.id,
      completedAt: r.completedAt as Date,
      duration: r.duration,
      scheduledAt: r.scheduledAt,
      // Al gekoppeld aan een ándere meting; deze meting zelf telt niet mee.
      hasCardioLog: r.cardioLog != null && r.cardioLog.id !== measurement.id,
    })),
  )
  if (!hit) return null

  await prisma.cardioLog.update({
    where: { id: measurement.id },
    data: { sessionLogId: hit.id },
  })
  return hit.id
}

/**
 * Andersom: de sporter rondt zijn sessie in de app af terwijl de meting al
 * binnen was (of pas daarna binnenkomt via de eerstvolgende sync). Zonder deze
 * kant zou het puur van de volgorde afhangen of een training gekoppeld raakt.
 */
export async function linkSessionToMeasurement(
  prisma: Db,
  patientId: string,
  session: { id: string; completedAt: Date; duration: number | null; scheduledAt: Date },
): Promise<string | null> {
  const anchor = session.completedAt.getTime()
  const rows = await prisma.cardioLog.findMany({
    where: {
      patientId,
      sessionLogId: null,
      source: { in: ['APPLE_WATCH', 'STRAVA'] },
      activity: { in: [...LINKABLE] },
      completedAt: { gte: new Date(anchor - SEARCH_MARGIN_MS), lte: new Date(anchor + SEARCH_MARGIN_MS) },
    },
    select: { id: true, activity: true, completedAt: true, durationSec: true },
    take: 20,
  })

  const window = { id: session.id, completedAt: session.completedAt, duration: session.duration, scheduledAt: session.scheduledAt, hasCardioLog: false }
  for (const r of rows) {
    // `completedAt` op CardioLog is het STARTmoment — zie pickMatchingSession.
    const hit = pickMatchingSession(
      { activity: r.activity, startAt: r.completedAt, durationSec: r.durationSec },
      [window],
    )
    if (hit) {
      await prisma.cardioLog.update({ where: { id: r.id }, data: { sessionLogId: session.id } })
      return r.id
    }
  }
  return null
}
