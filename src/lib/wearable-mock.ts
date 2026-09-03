/**
 * Mock-HealthKit-data — voor het verifiëren van de wearable-dashboards zónder
 * de native bridge, en als levende documentatie van het sync-contract.
 *
 * `mockSyncPayload()` levert exact de body die de iOS-bridge naar
 * POST /api/wearable/sync stuurt. `mockOverview()` levert de DTO die de
 * wearables-router teruggeeft (zelfde shape als `wearables.overview`), zodat
 * de dev-preview-pagina de echte componenten kan renderen.
 *
 * Deterministisch (seeded RNG) → stabiele screenshots, geen Math.random.
 */
import {
  aggregateNight,
  sleepQualityScore,
  type SleepSegment,
} from '@/lib/sleep-metrics'
import {
  computeReadiness,
  type SleepDay,
  type VitalsDay,
} from '@/lib/readiness'

// ── seeded RNG (mulberry32) ──────────────────────────────
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type GenDay = {
  date: string // yyyy-mm-dd
  dayStart: Date
  hrv: number
  restingHeartRate: number
  respiratoryRate: number
  wristTempDeviation: number
  segments: SleepSegment[]
}

const STRESS_DAYS = 3 // laatste N dagen: opgebouwde vermoeidheid (HRV-dip, RHR↑)

/**
 * Genereer `days` dagen vitals + slaap, eindigend op `end` (default vandaag).
 * De laatste paar dagen tonen bewust een herstel-dip zodat de readiness-tegel
 * een AMBER/RED-staat laat zien i.p.v. een vlakke groene lijn.
 */
function genDays(days: number, end: Date): GenDay[] {
  const r = rng(20260612)
  const out: GenDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(end)
    dayStart.setHours(0, 0, 0, 0)
    dayStart.setDate(dayStart.getDate() - i)
    const fromEnd = i // 0 = vandaag
    const stress = fromEnd < STRESS_DAYS ? (STRESS_DAYS - fromEnd) / STRESS_DAYS : 0

    const wave = Math.sin((days - i) / 5) * 3
    const hrv = Math.round(48 + wave + (r() - 0.5) * 8 - stress * 12)
    const restingHeartRate = Math.round(53 + (r() - 0.5) * 4 + stress * 6)
    const respiratoryRate = round1(14.3 + (r() - 0.5) * 1.2 + stress * 1.5)
    const wristTempDeviation = round1((r() - 0.5) * 0.3 + (fromEnd === 1 ? 0.7 : 0))

    out.push({
      date: isoDay(dayStart),
      dayStart,
      hrv: Math.max(20, hrv),
      restingHeartRate,
      respiratoryRate,
      wristTempDeviation,
      segments: genNight(dayStart, r, stress),
    })
  }
  return out
}

/** Bouw een geloofwaardig hypnogram: in-bed-wrap + afwisselende stage-blokken. */
function genNight(morning: Date, r: () => number, stress: number): SleepSegment[] {
  // Bedtijd vorige avond ~23:00 ± jitter; wektijd ~07:00.
  const bed = new Date(morning)
  bed.setDate(bed.getDate() - 1)
  bed.setHours(23, Math.round((r() - 0.5) * 50), 0, 0)

  const totalMin = Math.round(450 + (r() - 0.5) * 60 - stress * 60) // ~7.5u, korter bij stress
  const wake = new Date(bed.getTime() + (totalMin + 25) * 60000)

  const segs: SleepSegment[] = [
    { stage: 'inBed', startAt: bed.toISOString(), endAt: wake.toISOString() },
  ]

  // Doelverdeling: deep vroeg, REM later, met awake-onderbrekingen.
  const deepTarget = Math.round(totalMin * (0.2 - stress * 0.05))
  const remTarget = Math.round(totalMin * (0.22 - stress * 0.04))
  const awakeTarget = Math.round(18 + stress * 22)
  let remaining = totalMin
  let t = new Date(bed.getTime() + 12 * 60000) // ~12 min inslaaplatentie

  const push = (stage: SleepSegment['stage'], min: number) => {
    if (min <= 0) return
    const startAt = t.toISOString()
    t = new Date(t.getTime() + min * 60000)
    segs.push({ stage, startAt, endAt: t.toISOString() })
    remaining -= min
  }

  // 5 cycli: deep front-loaded, REM back-loaded.
  const cycles = 5
  for (let c = 0; c < cycles; c++) {
    const frac = c / (cycles - 1)
    const deep = Math.round((deepTarget / cycles) * (1.6 - frac)) // meer deep vroeg
    const rem = Math.round((remTarget / cycles) * (0.4 + frac * 1.2)) // meer REM laat
    push('light', Math.round((remaining / (cycles - c)) * 0.28))
    push('deep', deep)
    push('light', Math.round((remaining / (cycles - c)) * 0.18))
    push('rem', rem)
    if (c < cycles - 1) push('awake', Math.round(awakeTarget / (cycles - 1) * r()))
  }
  // Rest opvullen met light.
  if (remaining > 0) push('light', remaining)

  return segs
}

export type WearableOverview = ReturnType<typeof mockOverview>

const ACTIVITIES = [
  { activity: 'RUNNING' as const, dist: 8200, dur: 2700, hr: 152 },
  { activity: 'CYCLING' as const, dist: 24000, dur: 3600, hr: 138 },
  { activity: 'RUNNING' as const, dist: 5400, dur: 1680, hr: 146 },
  { activity: 'RUNNING' as const, dist: 12000, dur: 3900, hr: 158 },
  { activity: 'ROWING' as const, dist: 6000, dur: 1500, hr: 142 },
  { activity: 'CYCLING' as const, dist: 31000, dur: 5400, hr: 134 },
  { activity: 'RUNNING' as const, dist: 6800, dur: 2100, hr: 149 },
  { activity: 'WALKING' as const, dist: 4200, dur: 2700, hr: 102 },
]

/** Overview-DTO (zelfde shape als wearables.overview), volledig client-side. */
export function mockOverview(days = 30, end: Date = new Date()) {
  const gen = genDays(days, end)

  const vitals = gen.map((g, i) => ({
    date: g.date,
    hrv: g.hrv,
    hrvType: 'SDNN' as const,
    restingHeartRate: g.restingHeartRate,
    respiratoryRate: g.respiratoryRate,
    wristTempDeviation: g.wristTempDeviation,
    // Deterministische mock-waarden (geen rng nodig): stappen ~7-12k, kcal ~500-900.
    steps: 7000 + ((i * 997) % 5000),
    activeEnergyKcal: 500 + ((i * 379) % 400),
    basalEnergyKcal: 1500 + ((i * 131) % 300),
    vo2Max: round1(44 + ((i * 17) % 60) / 10),
  }))

  const sleep = gen.map(g => {
    const night = aggregateNight(g.segments)
    const sorted = [...g.segments].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
    return {
      date: g.date,
      startAt: sorted[0].startAt,
      endAt: sorted[sorted.length - 1].endAt,
      inBedMin: night.inBedMin,
      asleepMin: night.asleepMin,
      awakeMin: night.awakeMin,
      lightMin: night.lightMin,
      deepMin: night.deepMin,
      remMin: night.remMin,
      efficiency: night.efficiency,
      latencyMin: night.latencyMin,
      qualityScore: sleepQualityScore(night),
      stages: g.segments as unknown,
    }
  })

  // Readiness vandaag + trend (per dag het model draaien).
  const vitalsDays: VitalsDay[] = vitals.map(v => ({
    date: v.date, hrv: v.hrv, hrvType: 'SDNN', restingHeartRate: v.restingHeartRate,
    respiratoryRate: v.respiratoryRate, wristTempDeviation: v.wristTempDeviation,
  }))
  const sleepDays: SleepDay[] = sleep.map(s => ({ date: s.date, qualityScore: s.qualityScore }))
  const readiness = computeReadiness(vitalsDays, sleepDays, { sleep: 4, soreness: 3, fatigue: 3, mood: 4, stress: 3 })

  const readinessTrend = gen
    .map(g => {
      const res = computeReadiness(vitalsDays, sleepDays, null, g.date)
      return res.score == null ? null : { date: g.date, score: res.score, band: res.band }
    })
    .filter((x): x is { date: string; score: number; band: 'GREEN' | 'AMBER' | 'RED' } => x != null)

  const activities = ACTIVITIES.map((a, i) => {
    const d = new Date(end)
    d.setHours(7, 30, 0, 0)
    d.setDate(d.getDate() - i * 3 - 1)
    return {
      id: `mock-${i}`,
      activity: a.activity,
      sourceActivity: null,
      protocol: 'STEADY_STATE' as const,
      durationSec: a.dur,
      distanceM: a.dist,
      avgHeartRate: a.hr,
      maxHeartRate: a.hr + 14,
      calories: Math.round((a.dur / 60) * 11),
      rpe: Math.round(((a.hr - 53) / (185 - 53)) * 10),
      avgPaceSecPerKm: Math.round(a.dur / (a.dist / 1000)),
      timeInZones: null as unknown,
      series: null as unknown,
      source: 'APPLE_WATCH' as const,
      feelScore: null as number | null,
      ratedAt: null as string | null,
      hrDismissedAt: null as string | null,
      hrSuspect: false,
      completedAt: d.toISOString(),
    }
  })

  return {
    connection: {
      connected: true as const,
      provider: 'APPLE_HEALTH' as const,
      deviceModel: 'Apple Watch Series 9',
      enabled: true,
      lastSyncAt: new Date(end.getTime() - 42 * 60000).toISOString(),
      connectedAt: gen[0].dayStart.toISOString(),
    },
    readiness,
    readinessTrend,
    sleep,
    vitals,
    activities,
    stress: [],
    exertion: [],
    exertionTarget: null,
  }
}

/** Sync-payload (body voor POST /api/wearable/sync). */
export function mockSyncPayload(days = 30, end: Date = new Date()) {
  const gen = genDays(days, end)
  return {
    device: { model: 'Apple Watch Series 9' },
    anchors: { workouts: 'mock-anchor', sleep: 'mock-anchor', hrv: 'mock-anchor' },
    workouts: ACTIVITIES.map((a, i) => {
      const d = new Date(end)
      d.setHours(7, 30, 0, 0)
      d.setDate(d.getDate() - i * 3 - 1)
      return {
        externalId: `mock-workout-${isoDay(d)}-${i}`,
        activity: a.activity,
        startAt: d.toISOString(),
        durationSec: a.dur,
        distanceM: a.dist,
        avgHeartRate: a.hr,
        maxHeartRate: a.hr + 14,
        activeEnergyKcal: Math.round((a.dur / 60) * 11),
      }
    }),
    sleep: gen.map(g => ({
      externalId: `mock-sleep-${g.date}`,
      date: g.date,
      segments: g.segments,
    })),
    vitals: gen.map(g => ({
      date: g.date,
      hrv: g.hrv,
      hrvType: 'SDNN' as const,
      restingHeartRate: g.restingHeartRate,
      respiratoryRate: g.respiratoryRate,
      wristTempDeviation: g.wristTempDeviation,
    })),
    // Intraday HR (30-min buckets, 06:00–22:30) → voedt de stress-meter. Rustig
    // 's ochtends/avonds, hoger midden op de dag, met sporadische verhogingen.
    hrIntraday: gen.map((g, gi) => {
      const rest = g.restingHeartRate ?? 58
      const buckets: { m: number; bpm: number }[] = []
      for (let m = 6 * 60; m <= 22 * 60; m += 30) {
        const hour = m / 60
        let bpm = rest + 6 + Math.round(8 * Math.sin(((hour - 6) / 16) * Math.PI))
        if ((gi * 7 + m) % 190 < 30) bpm += 28 // af en toe een stress-piek
        buckets.push({ m, bpm })
      }
      return { date: g.date, buckets }
    }),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
