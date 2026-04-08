/**
 * Workload Monitoring based on Tim Gabbett's ACWR model
 *
 * Key concepts:
 * - sRPE (session Rating of Perceived Exertion) = RPE × duration (minutes)
 * - Acute workload = total sRPE of the current week
 * - Chronic workload = rolling 4-week average of weekly sRPE (EWMA or simple average)
 * - ACWR = Acute / Chronic
 *
 * "Sweet spot" for injury prevention: ACWR between 0.8 and 1.3 (Gabbett 2016)
 * - Below 0.8: undertraining, potential detraining
 * - 0.8-1.3: optimal training zone
 * - 1.3-1.5: danger zone, increased injury risk
 * - Above 1.5: high injury risk
 *
 * References:
 * - Gabbett TJ (2016) The training—injury prevention paradox
 * - Hulin et al. (2016) The acute:chronic workload ratio predicts injury
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionWorkload {
  date: Date
  durationMinutes: number
  rpe: number        // 1-10
  /** Computed: RPE × duration */
  sRPE: number
}

export interface WeeklyWorkload {
  weekNumber: number
  weekLabel: string
  startDate: Date
  endDate: Date
  totalSRPE: number
  sessionCount: number
  avgRPE: number
  avgDuration: number
}

export interface ACWRResult {
  acuteWorkload: number      // Current week sRPE
  chronicWorkload: number    // 4-week rolling average
  acwr: number               // Acute / Chronic ratio
  zone: ACWRZone
  weeklyHistory: WeeklyWorkload[]
  weekOverWeekChange: number // % change from last week
}

export type ACWRZone = 'undertrained' | 'optimal' | 'danger' | 'high_risk'

// ── Zone classification ──────────────────────────────────────────────────────

export function classifyACWR(acwr: number): ACWRZone {
  if (acwr < 0.8) return 'undertrained'
  if (acwr <= 1.3) return 'optimal'
  if (acwr <= 1.5) return 'danger'
  return 'high_risk'
}

export const ACWR_ZONE_CONFIG: Record<ACWRZone, {
  label: string
  color: string
  bg: string
  description: string
}> = {
  undertrained: {
    label: 'Onderbelast',
    color: '#3b82f6',
    bg: '#dbeafe',
    description: 'Trainingsbelasting is te laag. Risico op detraining.',
  },
  optimal: {
    label: 'Optimaal',
    color: '#14B8A6',
    bg: '#ccfbf1',
    description: 'Trainingsbelasting in de sweet spot. Laagste blessurerisico.',
  },
  danger: {
    label: 'Verhoogd risico',
    color: '#f59e0b',
    bg: '#fef3c7',
    description: 'Belasting stijgt snel. Let op tekenen van overbelasting.',
  },
  high_risk: {
    label: 'Hoog risico',
    color: '#ef4444',
    bg: '#fee2e2',
    description: 'Acute belasting veel hoger dan chronisch. Blessurerisico sterk verhoogd.',
  },
}

// ── Workload calculation ─────────────────────────────────────────────────────

/**
 * Calculate sRPE (session RPE × duration in minutes)
 * Foster et al. (2001) method
 */
export function calculateSRPE(rpe: number, durationMinutes: number): number {
  return rpe * durationMinutes
}

/**
 * Group sessions into ISO weeks and calculate weekly totals
 */
export function groupByWeek(sessions: SessionWorkload[]): WeeklyWorkload[] {
  if (sessions.length === 0) return []

  // Sort by date
  const sorted = [...sessions].sort((a, b) => a.date.getTime() - b.date.getTime())

  // Get Monday of a given date (ISO week start)
  function getMonday(d: Date): Date {
    const date = new Date(d)
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diff)
    date.setHours(0, 0, 0, 0)
    return date
  }

  // Get ISO week number
  function getWeekNumber(d: Date): number {
    const date = new Date(d)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
    const week1 = new Date(date.getFullYear(), 0, 4)
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  }

  // Group
  const weekMap = new Map<string, SessionWorkload[]>()
  for (const session of sorted) {
    const monday = getMonday(session.date)
    const key = monday.toISOString().split('T')[0]
    if (!weekMap.has(key)) weekMap.set(key, [])
    weekMap.get(key)!.push(session)
  }

  // Convert to WeeklyWorkload[]
  const weeks: WeeklyWorkload[] = []
  for (const [mondayStr, sessions] of weekMap) {
    const monday = new Date(mondayStr)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)

    const totalSRPE = sessions.reduce((sum, s) => sum + s.sRPE, 0)
    const avgRPE = sessions.reduce((sum, s) => sum + s.rpe, 0) / sessions.length
    const avgDuration = sessions.reduce((sum, s) => sum + s.durationMinutes, 0) / sessions.length

    weeks.push({
      weekNumber: getWeekNumber(monday),
      weekLabel: `W${getWeekNumber(monday)}`,
      startDate: monday,
      endDate: sunday,
      totalSRPE,
      sessionCount: sessions.length,
      avgRPE: Math.round(avgRPE * 10) / 10,
      avgDuration: Math.round(avgDuration),
    })
  }

  return weeks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
}

/**
 * Calculate ACWR using the uncoupled rolling average method (Gabbett 2016)
 * Acute = current week, Chronic = average of previous 4 weeks (excluding current)
 */
export function calculateACWR(sessions: SessionWorkload[]): ACWRResult {
  const weeks = groupByWeek(sessions)

  if (weeks.length === 0) {
    return {
      acuteWorkload: 0,
      chronicWorkload: 0,
      acwr: 0,
      zone: 'undertrained',
      weeklyHistory: [],
      weekOverWeekChange: 0,
    }
  }

  const currentWeek = weeks[weeks.length - 1]
  const acuteWorkload = currentWeek.totalSRPE

  // Chronic workload: previous 4 weeks (excluding current)
  const previousWeeks = weeks.slice(-5, -1) // up to 4 weeks before current
  const chronicWorkload = previousWeeks.length > 0
    ? previousWeeks.reduce((sum, w) => sum + w.totalSRPE, 0) / previousWeeks.length
    : acuteWorkload // First week: use acute as chronic to get ACWR of 1.0

  const acwr = chronicWorkload > 0 ? acuteWorkload / chronicWorkload : 1.0

  // Week-over-week change
  const prevWeek = weeks.length >= 2 ? weeks[weeks.length - 2] : null
  const weekOverWeekChange = prevWeek && prevWeek.totalSRPE > 0
    ? ((acuteWorkload - prevWeek.totalSRPE) / prevWeek.totalSRPE) * 100
    : 0

  return {
    acuteWorkload: Math.round(acuteWorkload),
    chronicWorkload: Math.round(chronicWorkload),
    acwr: Math.round(acwr * 100) / 100,
    zone: classifyACWR(acwr),
    weeklyHistory: weeks,
    weekOverWeekChange: Math.round(weekOverWeekChange),
  }
}

// ── Mock data for testing ────────────────────────────────────────────────────

export function getMockWorkloadSessions(): SessionWorkload[] {
  // Simulate 5 weeks of training data
  const sessions: SessionWorkload[] = []

  // Week 1 (4 weeks ago) — building up
  sessions.push(
    { date: new Date('2026-03-09'), durationMinutes: 35, rpe: 5, sRPE: 175 },
    { date: new Date('2026-03-11'), durationMinutes: 40, rpe: 6, sRPE: 240 },
    { date: new Date('2026-03-13'), durationMinutes: 30, rpe: 5, sRPE: 150 },
  )

  // Week 2 — gradual increase
  sessions.push(
    { date: new Date('2026-03-16'), durationMinutes: 40, rpe: 6, sRPE: 240 },
    { date: new Date('2026-03-18'), durationMinutes: 45, rpe: 6, sRPE: 270 },
    { date: new Date('2026-03-20'), durationMinutes: 35, rpe: 7, sRPE: 245 },
  )

  // Week 3 — peak week
  sessions.push(
    { date: new Date('2026-03-23'), durationMinutes: 45, rpe: 7, sRPE: 315 },
    { date: new Date('2026-03-25'), durationMinutes: 40, rpe: 7, sRPE: 280 },
    { date: new Date('2026-03-27'), durationMinutes: 50, rpe: 7, sRPE: 350 },
  )

  // Week 4 — deload
  sessions.push(
    { date: new Date('2026-03-30'), durationMinutes: 30, rpe: 5, sRPE: 150 },
    { date: new Date('2026-04-01'), durationMinutes: 35, rpe: 5, sRPE: 175 },
    { date: new Date('2026-04-03'), durationMinutes: 30, rpe: 6, sRPE: 180 },
  )

  // Week 5 (current) — building back up
  sessions.push(
    { date: new Date('2026-04-06'), durationMinutes: 38, rpe: 6, sRPE: 228 },
    { date: new Date('2026-04-08'), durationMinutes: 42, rpe: 7, sRPE: 294 },
  )

  return sessions
}
