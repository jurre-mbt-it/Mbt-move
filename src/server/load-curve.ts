/**
 * Server-helper voor de belasting-curve: haalt alle gelogde training van een
 * patiënt/atleet op (kracht + cardio), zet ze om naar dagelijkse sRPE-loads
 * en draait het fitness-fatigue model uit src/lib/training-load.ts.
 *
 * Gedeeld door patient.loadCurve (eigen data) en patients.loadCurve
 * (therapeut, na hasPatientAccess-check).
 */
import type { PrismaClient } from '@prisma/client'
import {
  buildLoadCurve,
  ewmaAcwr,
  loadStatus,
  sessionLoad,
  type DailyLoad,
  type LoadPoint,
  type LoadStatus,
} from '@/lib/training-load'

const WARMUP_DAYS = 42 // EWMA-inloop vóór het weergavevenster

export type LoadCurveResult = {
  points: LoadPoint[]        // alleen het weergavevenster
  acwr: number | null        // EWMA 7d/28d op vandaag
  status: LoadStatus         // o.b.v. vorm vandaag + ACWR
  today: LoadPoint | null
  sessionCount: number       // aantal gelogde sessies in het venster (kracht + cardio)
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
      select: { completedAt: true, duration: true, exertionLevel: true },
    }),
    prisma.cardioLog.findMany({
      where: { patientId, completedAt: { gte: from } },
      select: { completedAt: true, durationSec: true, rpe: true },
    }),
  ])

  const loads: DailyLoad[] = []
  for (const s of sessions) {
    if (!s.completedAt) continue
    loads.push({
      date: isoDay(s.completedAt),
      load: sessionLoad((s.duration ?? 0) / 60, s.exertionLevel),
    })
  }
  for (const c of cardio) {
    loads.push({
      date: isoDay(c.completedAt),
      load: sessionLoad(c.durationSec / 60, c.rpe),
    })
  }

  const all = buildLoadCurve(loads, from, to)
  const points = all.slice(WARMUP_DAYS) // warm-up wegsnijden
  const today = points[points.length - 1] ?? null
  const acwr = ewmaAcwr(loads, from, to)

  const windowStartIso = isoDay(windowStart)
  const sessionCount =
    sessions.filter(s => s.completedAt && isoDay(s.completedAt) >= windowStartIso).length +
    cardio.filter(c => isoDay(c.completedAt) >= windowStartIso).length

  return {
    points,
    acwr,
    status: loadStatus(today?.form ?? 0, acwr),
    today,
    sessionCount,
  }
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
