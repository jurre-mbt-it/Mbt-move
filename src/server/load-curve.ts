/**
 * Server-helper voor de belasting-curve: haalt alle gelogde training van een
 * patiënt/atleet op (kracht + cardio), zet ze om naar dagelijkse sRPE-loads
 * en draait het fitness-fatigue model uit src/lib/training-load.ts.
 *
 * Sinds de kracht/cardio-splitsing geeft hij DRIE curves terug: kracht (alleen
 * SessionLog), cardio (alleen CardioLog) en gecombineerd (beide). De
 * gecombineerde curve staat op de top-level velden zodat bestaande consumers
 * (LoadCurveChart, insights/aggregates) ongewijzigd blijven werken; `strength`
 * en `cardio` zijn de nieuwe onderverdeling.
 *
 * Eenheid van de curves is overal sRPE (Foster), óók cardio — dat is de
 * gevalideerde gemeenschappelijke munt en blijft continu zonder wearable. De
 * HR-gebaseerde Edwards-TRIMP komt er als losse cardio-readout (`cardio.trimp`)
 * bij zodra `CardioLog.timeInZones` gevuld is; hij drijft de curve NIET aan.
 *
 * Gedeeld door patient.loadCurve (eigen data) en patients.loadCurve
 * (therapeut, na hasPatientAccess-check).
 */
import type { PrismaClient } from '@prisma/client'
import {
  baselineSeed,
  buildLoadCurve,
  CALIBRATION_MIN_DAYS,
  CALIBRATION_MIN_SESSIONS,
  clampSessionDurationSec,
  computeConsistency,
  edwardsTrimp,
  ewmaAcwr,
  loadStatus,
  sessionLoad,
  trainingMonotony,
  trainingStrain,
  weekToWeekChange,
  type Consistency,
  type DailyLoad,
  type LoadPoint,
  type LoadStatus,
} from '@/lib/training-load'

const WARMUP_DAYS = 42 // EWMA-inloop vóór het weergavevenster

/** Eén gelogde workout achter een dagpunt, voor de tik-inzage in de app:
 *  tik op een punt in de LOAD-grafiek en zie welke training dat punt maakte
 *  en hoeveel belasting hij bijdroeg (dezelfde sessionLoad als de curve). */
export type LoadSession = {
  date: string
  /** Programmanaam (kracht); cardio draagt zijn naam via `activity`. */
  label: string | null
  /** CardioActivity-enum; de app vertaalt hem naar de activiteitsnaam. */
  activity: string | null
  load: number
  durationMin: number
  rpe: number | null
}

/** Eén modaliteit-curve (kracht of cardio) of de gecombineerde. */
export type ModalityCurve = {
  points: LoadPoint[]        // alleen het weergavevenster
  acwr: number | null        // EWMA 7d/28d — stil trend-cijfer, stuurt niets
  status: LoadStatus         // puur o.b.v. vorm (TSB) vandaag
  today: LoadPoint | null
  sessionCount: number       // aantal gelogde sessies in het venster
  /** Week-op-week %-sprong t.o.v. de 3 weken ervoor (spike-detectie). */
  weekChange: number | null
  /** Foster monotony (afwisseling) over de laatste 7 dagen; > ~2.0 = eentonig. */
  monotony: number | null
  /** Foster strain: weektotaal × monotony. */
  strain: number | null
  /** Workouts in het venster, voor de punt-inzage. Alleen op de per-modaliteit
   *  curves gezet; de gecombineerde heeft ze niet nodig. */
  sessions?: LoadSession[]
}

/** Cardio-curve + optionele HR-gebaseerde load (Edwards TRIMP). */
export type CardioCurve = ModalityCurve & {
  /**
   * Som van Edwards' TRIMP over cardio-sessies mét gemeten HR (tijd-in-zone),
   * binnen het venster. null zolang er geen wearable-HR is — de curve zelf
   * blijft dan gewoon op sRPE draaien.
   */
  trimp: number | null
  hrSessionCount: number     // cardio-sessies in het venster met HR-data
}

/**
 * IJkperiode: pas na genoeg kalenderdagen én sessies is een zone-oordeel
 * zinvol. Status 'building' = alle consumers (web + iOS) tonen de gelogde
 * belasting zonder oordeel (geen zones, geen dagadvies, geen overload-insight)
 * en leggen uit dat we eerst het startniveau bepalen. Eén centrale definitie,
 * zodat de drempels niet per scherm uiteenlopen.
 */
export type LoadCalibration = {
  status: 'building' | 'ready'
  daysLogged: number       // = historyDays (dagen sinds eerste log)
  daysNeeded: number       // CALIBRATION_MIN_DAYS
  sessionsLogged: number   // gelogde sessies (kracht + cardio, volledige fetch)
  sessionsNeeded: number   // CALIBRATION_MIN_SESSIONS
}

export type LoadCurveResult = ModalityCurve & {
  /**
   * Vroegste gelogde sessie binnen de opgehaalde periode (incl. warm-up), ISO.
   * null als er niets gelogd is.
   */
  firstSessionAt: string | null
  /**
   * Dagen historie = vandaag − eerste log. Server-side berekend (deterministisch,
   * geen client-klok) voor betrouwbaarheids-drempels in de UI: de ACWR/vorm is
   * pas zinvol als de chronische basis grotendeels gevuld is.
   */
  historyDays: number
  strength: ModalityCurve    // alleen krachttraining (SessionLog)
  cardio: CardioCurve        // alleen cardio (CardioLog)
  /** Adherentie over het volledige venster (kracht + cardio samen). */
  consistency: Consistency
  calibration: LoadCalibration
}

// Prisma-client of transaction-client — alleen de twee findMany's nodig.
type Db = Pick<PrismaClient, 'sessionLog' | 'cardioLog'>

export async function computeLoadCurve(
  prisma: Db,
  patientId: string,
  days: number,
): Promise<LoadCurveResult> {
  const to = new Date()
  to.setHours(0, 0, 0, 0)
  const windowStart = new Date(to)
  windowStart.setDate(windowStart.getDate() - (days - 1))
  const from = new Date(windowStart)
  from.setDate(from.getDate() - WARMUP_DAYS)

  const [sessions, cardio] = await Promise.all([
    prisma.sessionLog.findMany({
      where: {
        patientId,
        completedAt: { gte: from },
        status: 'COMPLETED',
      },
      select: { completedAt: true, duration: true, exertionLevel: true, program: { select: { name: true } } },
    }),
    prisma.cardioLog.findMany({
      where: { patientId, completedAt: { gte: from } },
      select: { completedAt: true, durationSec: true, rpe: true, timeInZones: true, activity: true },
    }),
  ])

  const windowStartIso = isoDay(windowStart)

  // ── Kracht: sRPE per krachtsessie ──────────────────────────────────────
  const strengthLoads: DailyLoad[] = []
  const strengthSessions: LoadSession[] = []
  for (const s of sessions) {
    if (!s.completedAt) continue
    const dateIso = isoDay(s.completedAt)
    // Duur defensief afkappen: legacy-rijen met een doorgelopen timer mogen
    // de curve niet vergiftigen, ook vóór ze in de DB gecorrigeerd zijn.
    const durMin = clampSessionDurationSec(s.duration) / 60
    const load = sessionLoad(durMin, s.exertionLevel)
    strengthLoads.push({ date: dateIso, load })
    if (dateIso >= windowStartIso) {
      strengthSessions.push({
        date: dateIso,
        label: s.program?.name ?? null,
        activity: null,
        load: Math.round(load),
        durationMin: Math.round(durMin),
        rpe: s.exertionLevel ?? null,
      })
    }
  }

  // ── Cardio: sRPE per cardiosessie + losse Edwards-TRIMP waar HR is ──────
  const cardioLoads: DailyLoad[] = []
  const cardioSessions: LoadSession[] = []
  let cardioTrimp = 0
  let hrSessionCount = 0
  for (const c of cardio) {
    const dateIso = isoDay(c.completedAt)
    const durMin = clampSessionDurationSec(c.durationSec) / 60
    const load = sessionLoad(durMin, c.rpe)
    cardioLoads.push({ date: dateIso, load })
    if (dateIso >= windowStartIso) {
      cardioSessions.push({
        date: dateIso,
        label: null,
        activity: c.activity,
        load: Math.round(load),
        durationMin: Math.round(durMin),
        rpe: c.rpe ?? null,
      })
    }
    // TRIMP alleen meetellen voor het zichtbare venster (niet de warm-up).
    if (dateIso >= windowStartIso) {
      const t = edwardsTrimp(c.timeInZones as Record<string, number> | null)
      if (t !== null) {
        cardioTrimp += t
        hrSessionCount++
      }
    }
  }

  const strengthCount = sessions.filter(
    (s) => s.completedAt && isoDay(s.completedAt) >= windowStartIso,
  ).length
  const cardioCount = cardio.filter((c) => isoDay(c.completedAt) >= windowStartIso).length

  // Vroegste log over beide modaliteiten (volledige fetch, incl. warm-up).
  let firstSessionAt: string | null = null
  for (const s of sessions) {
    if (s.completedAt && (!firstSessionAt || s.completedAt.toISOString() < firstSessionAt)) {
      firstSessionAt = s.completedAt.toISOString()
    }
  }
  for (const c of cardio) {
    if (!firstSessionAt || c.completedAt.toISOString() < firstSessionAt) {
      firstSessionAt = c.completedAt.toISOString()
    }
  }

  const strength = { ...buildModality(strengthLoads, from, to, strengthCount), sessions: strengthSessions.sort((a, b) => a.date.localeCompare(b.date)) }
  const cardioBase = { ...buildModality(cardioLoads, from, to, cardioCount), sessions: cardioSessions.sort((a, b) => a.date.localeCompare(b.date)) }
  const combined = buildModality([...strengthLoads, ...cardioLoads], from, to, strengthCount + cardioCount)

  const historyDays = firstSessionAt
    ? Math.max(0, Math.floor((to.getTime() - new Date(firstSessionAt).getTime()) / 86_400_000))
    : 0

  // Sessies over de volledige fetch (incl. warm-up), net als historyDays —
  // de ijk gaat over "hoeveel weten we van deze persoon", niet over het venster.
  const sessionsLogged = [...strengthLoads, ...cardioLoads].filter((l) => l.load > 0).length
  const calibration: LoadCalibration = {
    status:
      historyDays >= CALIBRATION_MIN_DAYS && sessionsLogged >= CALIBRATION_MIN_SESSIONS
        ? 'ready'
        : 'building',
    daysLogged: historyDays,
    daysNeeded: CALIBRATION_MIN_DAYS,
    sessionsLogged,
    sessionsNeeded: CALIBRATION_MIN_SESSIONS,
  }

  return {
    ...combined,
    firstSessionAt,
    historyDays,
    calibration,
    strength,
    cardio: {
      ...cardioBase,
      trimp: hrSessionCount > 0 ? cardioTrimp : null,
      hrSessionCount,
    },
    consistency: computeConsistency([...strengthLoads, ...cardioLoads], windowStart, to),
  }
}

/** Draai het fitness-fatigue model + afgeleide load-signalen over één stream. */
function buildModality(
  loads: DailyLoad[],
  from: Date,
  to: Date,
  sessionCount: number,
): ModalityCurve {
  // Seed: start fitness/fatigue op het eigen startniveau (gemiddelde dagload
  // van de eerste 14 dagen) i.p.v. op 0. Zonder seed leest de eerste
  // trainingsweek als een enorme piek (vorm diep negatief) terwijl het model
  // simpelweg het startniveau nog niet kende.
  const all = buildLoadCurve(loads, from, to, baselineSeed(loads, to))
  const points = all.slice(WARMUP_DAYS) // warm-up wegsnijden
  const today = points[points.length - 1] ?? null
  return {
    points,
    acwr: ewmaAcwr(loads, from, to), // stil trend-cijfer, stuurt de status niet
    status: loadStatus(today?.form ?? 0),
    today,
    sessionCount,
    weekChange: weekToWeekChange(loads, to),
    monotony: trainingMonotony(loads, to),
    strain: trainingStrain(loads, to),
  }
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
