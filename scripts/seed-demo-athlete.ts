/**
 * Vult het Apple-demo-account (ATLEET, productie) met 60 dagen samenhangende
 * mock data, zodat elk atleet-scherm gevuld is voor productfoto's van de website.
 *
 * Het verhaal loopt in twee bedrijven: vier weken late knie-revalidatie, een
 * overgangsweek, en vier weken opbouw naar hardlopen. De laatste drie dagen
 * zakt het herstel bewust weg, anders staat elke tegel op groen en bestaat er
 * geen foto van een waarschuwingsstaat.
 *
 * Alles is deterministisch (seeded RNG): een herhaalde run geeft exact dezelfde
 * grafieken, dus een mislukte foto is over te doen zonder dat de curve verspringt.
 * Elke run wist eerst de eigen rijen en bouwt opnieuw op — daarmee is hij
 * idempotent zonder op upserts te leunen.
 *
 * De wearable-laag gaat door de ECHTE ingestiepijplijn (`ingestWearableData`),
 * niet via losse inserts, zodat slaap, vitals, stress, dagbelasting en cardio
 * exact zo landen als bij een echte Apple Watch.
 *
 * Draaien:        npx tsx scripts/seed-demo-athlete.ts
 * Terugdraaien:   npx tsx scripts/seed-demo-athlete.ts --wipe
 *
 * LET OP: dit schrijft naar de productiedatabase (DIRECT_URL uit .env.local).
 * Alles is gescoped op dit ene user-id; geen enkele rij van een andere
 * gebruiker wordt aangeraakt.
 */
import { PrismaClient } from '@prisma/client'
import type { CardioActivity, CardioProtocol } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

import { ingestWearableData, type SyncPayload } from '@/server/wearables/ingest'
import { computeAndStoreReadiness } from '@/server/readiness'

config({ path: resolve(process.cwd(), '.env.local') })

// ── Constanten ───────────────────────────────────────────────────────────────

// Repo is publiek: het adres van het demo-account staat niet hardcoded maar
// in .env.local (DEMO_EMAIL), dat hierboven al geladen is.
const EMAIL = process.env.DEMO_EMAIL ?? ''
if (!EMAIL) {
  console.error('Zet DEMO_EMAIL in .env.local (e-mail van het demo-account).')
  process.exit(1)
}
const DAYS = 60
const DIP_DAYS = 3 // laatste N dagen: herstel zakt weg (HRV omlaag, rust-HR omhoog)
const SEED = 20260824

const DISPLAY_NAME = 'Sam'
const MAX_HR = 188
const REST_HR = 52
const BIRTH_DATE = new Date(1994, 2, 12) // 12 maart 1994

/** Het kale programma uit create-apple-test-account.ts. Blijft bestaan, maar
 *  gaat naar ARCHIVED zodat het niet naast de twee echte schema's op de foto komt. */
const APPLE_STUB_PROGRAM = 'App Review Demo — Krachtschema'

const PROGRAM_REHAB = 'Knie-opbouw fase 3'
const PROGRAM_BUILD = 'Terug naar hardlopen'
const DEMO_PROGRAMS = [PROGRAM_REHAB, PROGRAM_BUILD]

/** Prefix op elke externalId die dit script aanmaakt — de sleutel voor --wipe. */
const EXT = 'demo-seed-'

// ── Prisma (zelfde opzet als create-apple-test-account.ts) ───────────────────

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

// ── Kleine hulpjes ───────────────────────────────────────────────────────────

/** mulberry32 — zelfde deterministische RNG als src/lib/wearable-mock.ts. */
function makeRng(seed: number) {
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

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function at(day: Date, hour: number, minute = 0): Date {
  const out = new Date(day)
  out.setHours(hour, minute, 0, 0)
  return out
}

/** Maandag van de week waar `d` in valt (lokale tijd, week begint maandag). */
function mondayOf(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const shift = (out.getDay() + 6) % 7 // zo=0 → 6, ma=1 → 0
  out.setDate(out.getDate() - shift)
  return out
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

// ── Het verhaal ──────────────────────────────────────────────────────────────

type Phase = 'REHAB' | 'TRANSITION' | 'BUILD'

type Day = {
  i: number // 0 = oudste dag, DAYS-1 = vandaag; negatief/≥DAYS = buiten het venster
  date: Date // lokale start-of-day
  iso: string
  weekday: number // 0 = zondag … 6 = zaterdag
  /** Hoeveel hele kalenderweken terug (0 = de week waar vandaag in valt). */
  weeksAgo: number
  phase: Phase
  deload: boolean
  /** 0 = normaal, 1 = diepste punt van de herstel-dip aan het eind. */
  dip: number
  /** Hoeveelste week binnen het huidige blok (voor progressie in gewicht/volume). */
  weekInBlock: number
}

/** Deload valt twee kalenderweken terug: buiten de twee weken die de planner
 *  toont, maar wél zichtbaar als dal in de belastingcurve. */
const DELOAD_WEEKS_AGO = 2

/**
 * Eén dag beschrijven. Weken lopen bewust gelijk met de kalender (maandag tot
 * zondag), niet met blokken van 7 dagen vanaf de oudste dag: anders valt een
 * deload half over een planner-week heen en spreken de weekplanner en de
 * belastingcurve elkaar tegen.
 */
function makeDay(date: Date, i: number, thisMonday: Date): Day {
  const dayDiff = Math.round((mondayOf(date).getTime() - thisMonday.getTime()) / 86_400_000)
  const weeksAgo = -dayDiff / 7
  const phase: Phase = weeksAgo <= 3 ? 'BUILD' : weeksAgo === 4 ? 'TRANSITION' : 'REHAB'
  const dipStart = DAYS - DIP_DAYS
  return {
    i,
    date,
    iso: isoDay(date),
    weekday: date.getDay(),
    weeksAgo,
    phase,
    deload: phase === 'BUILD' && weeksAgo === DELOAD_WEEKS_AGO,
    dip: i >= dipStart && i < DAYS ? (i - dipStart + 1) / DIP_DAYS : 0,
    weekInBlock:
      phase === 'BUILD' ? clamp(3 - weeksAgo, 0, 3)
      : phase === 'TRANSITION' ? 0
      : clamp(8 - weeksAgo, 0, 3),
  }
}

function buildDays(): Day[] {
  const today = startOfToday()
  const thisMonday = mondayOf(today)
  return Array.from({ length: DAYS }, (_, i) => makeDay(addDays(today, -(DAYS - 1 - i)), i, thisMonday))
}

// ── Cardio-planning ──────────────────────────────────────────────────────────

type CardioPlan = {
  activity: CardioActivity
  protocol: CardioProtocol
  durationSec: number
  distanceM: number | null
  avgHr: number
  hour: number
  label: string
}

function cardioFor(d: Day): CardioPlan | null {
  const shrink = d.deload ? 0.65 : 1

  // Hartslagen zijn bewust laag gehouden: met een max van 188 en een rust-HR
  // van 52 zit een "rustige duurloop" op ~63% HRR, niet op 80%. Zonder dat
  // klopt de zoneverdeling niet en leest elke duurloop als een tempoloop.
  if (d.phase === 'REHAB') {
    // Fietsen draagt in deze fase de conditie: lopen mag nog niet, maar de
    // basis moet er wél zijn, anders leest de latere loopopbouw als een
    // veel te steile sprong.
    if (d.weekday === 2) return { activity: 'WALKING', protocol: 'STEADY_STATE', durationSec: 2700, distanceM: 4200, avgHr: 104, hour: 18, label: 'Wandeling' }
    if (d.weekday === 3) return { activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: 3300, distanceM: 18500, avgHr: 114, hour: 19, label: 'Rustige rit' }
    if (d.weekday === 4) return { activity: 'WALKING', protocol: 'STEADY_STATE', durationSec: 2100, distanceM: 3300, avgHr: 102, hour: 18, label: 'Wandeling' }
    if (d.weekday === 6) return { activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: 3900, distanceM: 22500, avgHr: 118, hour: 10, label: 'Duurrit' }
    if (d.weekday === 0) return { activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: 2400, distanceM: 13000, avgHr: 110, hour: 11, label: 'Herstelrit' }
    return null
  }

  if (d.phase === 'TRANSITION') {
    if (d.weekday === 3) return { activity: 'RUNNING', protocol: 'WALK_RUN', durationSec: 1200, distanceM: 3200, avgHr: 130, hour: 7, label: 'Eerste loop-wandel' }
    if (d.weekday === 6) return { activity: 'RUNNING', protocol: 'STEADY_STATE', durationSec: 1560, distanceM: 4200, avgHr: 134, hour: 9, label: 'Rustige duurloop' }
    if (d.weekday === 0) return { activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: 3600, distanceM: 21000, avgHr: 116, hour: 10, label: 'Duurrit' }
    if (d.weekday === 2) return { activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: 2700, distanceM: 15500, avgHr: 114, hour: 19, label: 'Rustige rit' }
    return null
  }

  // BUILD
  if (d.weekday === 1) {
    return { activity: 'RUNNING', protocol: 'STEADY_STATE', durationSec: Math.round(2100 * shrink), distanceM: Math.round(6000 * shrink), avgHr: 127, hour: 7, label: 'Rustige duurloop' }
  }
  if (d.weekday === 3 && !d.deload) {
    return { activity: 'RUNNING', protocol: 'INTERVALS', durationSec: 2700, distanceM: 8100, avgHr: 151, hour: 18, label: 'Intervaltraining' }
  }
  if (d.weekday === 6) {
    const grow = d.weekInBlock * 480 // elke week 8 minuten langer
    const durationSec = Math.round((3000 + grow) * shrink)
    return { activity: 'RUNNING', protocol: 'LONG_SLOW_DISTANCE', durationSec, distanceM: Math.round((durationSec / 350) * 1000), avgHr: 130, hour: 9, label: 'Lange duurloop' }
  }
  if (d.weekday === 0) {
    return { activity: 'CYCLING', protocol: 'STEADY_STATE', durationSec: Math.round(2700 * shrink), distanceM: Math.round(14500 * shrink), avgHr: 110, hour: 10, label: 'Herstelrit' }
  }
  return null
}

// ── Kracht-planning ──────────────────────────────────────────────────────────

type StrengthBlock = 'REHAB' | 'BUILD'

function strengthFor(d: Day): StrengthBlock | null {
  if (d.phase === 'REHAB') return [1, 3, 5].includes(d.weekday) ? 'REHAB' : null
  if (d.phase === 'TRANSITION') return [1, 4].includes(d.weekday) ? 'REHAB' : null
  if (d.deload) return d.weekday === 2 ? 'BUILD' : null
  return [2, 5].includes(d.weekday) ? 'BUILD' : null
}

/**
 * Oefeningen per blok. Opgezocht op naam in de bestaande catalogus, niet op
 * hardgecodeerd id, zodat het script een herseeding van de oefeningen overleeft.
 */
type ExSpec = {
  name: string
  sets: number
  reps: number
  repUnit: string
  /** Startgewicht in kg; null = lichaamsgewicht. */
  baseWeight: number | null
  /** Toename per week binnen het blok. */
  weeklyStep: number
  rest: number
}

const REHAB_EXERCISES: ExSpec[] = [
  { name: 'Leg Press', sets: 3, reps: 12, repUnit: 'reps', baseWeight: 80, weeklyStep: 5, rest: 90 },
  { name: 'Bulgarian Split Squat', sets: 3, reps: 10, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 60 },
  { name: 'Nordic Hamstring Curl', sets: 3, reps: 6, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 90 },
  { name: 'Calf Raise (staand)', sets: 3, reps: 15, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 60 },
  { name: 'Wall Sit', sets: 3, reps: 45, repUnit: 'sec', baseWeight: null, weeklyStep: 0, rest: 60 },
  { name: 'Dead Bug', sets: 3, reps: 12, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 45 },
]

const BUILD_EXERCISES: ExSpec[] = [
  { name: 'Back Squat', sets: 4, reps: 6, repUnit: 'reps', baseWeight: 70, weeklyStep: 2.5, rest: 150 },
  { name: 'Romanian Deadlift (barbell)', sets: 3, reps: 8, repUnit: 'reps', baseWeight: 60, weeklyStep: 2.5, rest: 120 },
  { name: 'Bulgarian Split Squat (dumbbells)', sets: 3, reps: 8, repUnit: 'reps', baseWeight: 16, weeklyStep: 2, rest: 90 },
  { name: 'Nordic Hamstring Curl', sets: 3, reps: 7, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 90 },
  { name: 'Calf Raise (staand)', sets: 3, reps: 15, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 60 },
  { name: 'Box Jump', sets: 4, reps: 5, repUnit: 'reps', baseWeight: null, weeklyStep: 0, rest: 120 },
]

/** Epley. */
function oneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

// ── Wearable-payload ─────────────────────────────────────────────────────────

type SleepSegment = { stage: 'awake' | 'light' | 'deep' | 'rem' | 'inBed'; startAt: string; endAt: string }

/** Hypnogram voor één nacht. `strain` 0..1 = slechter slapen. */
function genNight(morning: Date, r: () => number, strain: number): SleepSegment[] {
  const bed = addDays(morning, -1)
  bed.setHours(22, 40 + Math.round(r() * 45), 0, 0)

  const totalMin = Math.round(462 + (r() - 0.5) * 40 - strain * 75)
  const wake = new Date(bed.getTime() + (totalMin + 24) * 60000)

  const segs: SleepSegment[] = [
    { stage: 'inBed', startAt: bed.toISOString(), endAt: wake.toISOString() },
  ]

  const deepTarget = Math.round(totalMin * (0.21 - strain * 0.06))
  const remTarget = Math.round(totalMin * (0.23 - strain * 0.05))
  const awakeTarget = Math.round(15 + strain * 28)
  let remaining = totalMin
  let t = new Date(bed.getTime() + (10 + Math.round(strain * 14)) * 60000)

  const push = (stage: SleepSegment['stage'], min: number) => {
    if (min <= 0) return
    const startAt = t.toISOString()
    t = new Date(t.getTime() + min * 60000)
    segs.push({ stage, startAt, endAt: t.toISOString() })
    remaining -= min
  }

  const cycles = 5
  for (let c = 0; c < cycles; c++) {
    const frac = c / (cycles - 1)
    push('light', Math.round((remaining / (cycles - c)) * 0.28))
    push('deep', Math.round((deepTarget / cycles) * (1.6 - frac)))
    push('light', Math.round((remaining / (cycles - c)) * 0.18))
    push('rem', Math.round((remTarget / cycles) * (0.4 + frac * 1.2)))
    if (c < cycles - 1) push('awake', Math.round((awakeTarget / (cycles - 1)) * r()))
  }
  if (remaining > 0) push('light', remaining)

  return segs
}

/**
 * Hartslag per minuut over het hele etmaal. Levert zowel de 30-minuten-buckets
 * (voor de stress-meter, die zelf de actieve periodes eruit filtert) als het
 * bpm-histogram in seconden (voor de dagbelasting/TRIMP).
 */
function genHeartRateDay(
  d: Day,
  restHr: number,
  cardio: CardioPlan | null,
  strengthAt: { hour: number; durationSec: number } | null,
  r: () => number,
): { buckets: { m: number; bpm: number }[]; histogram: Record<string, number> } {
  const perMinute: number[] = []
  // Volgorde telt: een latere vensters overschrijft een eerdere. Alledaagse
  // activiteit staat dus vooraan, training wint daarvan.
  const windows: { from: number; to: number; hr: number }[] = [
    // Woon-werk, trap, boodschappen. Zonder deze pieken blijft het hele etmaal
    // onder de zone-1-drempel (94 bpm bij een max van 188) en toont de
    // dagbelasting een nul — ook op de dag die je fotografeert.
    { from: 8 * 60 + 10, to: 8 * 60 + 32, hr: 108 },
    { from: 12 * 60 + 45, to: 13 * 60 + 4, hr: 101 },
    { from: 17 * 60 + 40, to: 17 * 60 + 58, hr: 105 },
  ]
  if (cardio) {
    const from = cardio.hour * 60 + 15
    windows.push({ from, to: from + Math.round(cardio.durationSec / 60), hr: cardio.avgHr })
  }
  if (strengthAt) {
    const from = strengthAt.hour * 60
    // Krachttraining: veel lagere gemiddelde hartslag dan de piek-sets suggereren.
    windows.push({ from, to: from + Math.round(strengthAt.durationSec / 60), hr: restHr + 46 })
  }

  for (let m = 0; m < 1440; m++) {
    let bpm: number
    if (m < 6 * 60 + 45) {
      bpm = restHr - 4 + r() * 3 // slaap
    } else if (m > 22 * 60 + 30) {
      bpm = restHr + 2 + r() * 4
    } else {
      const hour = m / 60
      bpm = restHr + 12 + 7 * Math.sin(((hour - 7) / 15) * Math.PI) + r() * 5
    }
    for (const w of windows) {
      if (m >= w.from && m < w.to) {
        const into = (m - w.from) / Math.max(1, w.to - w.from)
        const ramp = into < 0.12 ? into / 0.12 : 1 // opwarmen
        bpm = w.hr * ramp + (restHr + 15) * (1 - ramp) + (r() - 0.5) * 8
      }
    }
    perMinute.push(clamp(Math.round(bpm), 38, 205))
  }

  const histogram: Record<string, number> = {}
  for (const bpm of perMinute) {
    const bin = String(Math.floor(bpm / 5) * 5)
    histogram[bin] = (histogram[bin] ?? 0) + 60
  }

  const buckets: { m: number; bpm: number }[] = []
  for (let m = 6 * 60; m <= 22 * 60; m += 30) {
    buckets.push({ m, bpm: perMinute[m] })
  }

  return { buckets, histogram }
}

/**
 * Per-minuut hartslag- en snelheidsreeks voor één workout, plus de daaruit
 * afgeleide tijd-in-zone. Zonder deze twee blijft het activiteitenscherm leeg:
 * geen hartslag/tempo-grafiek en geen zoneverdeling.
 *
 * De vorm volgt het protocol. Duurtrainingen krijgen bewust wat cardiac drift
 * (hartslag kruipt omhoog bij gelijk tempo), want dat is precies wat de
 * decoupling-uitslag op dat scherm laat zien.
 */
function genWorkoutSeries(plan: CardioPlan, r: () => number) {
  const minutes = Math.max(1, Math.round(plan.durationSec / 60))
  const baseSpeed = plan.distanceM ? plan.distanceM / plan.durationSec : null
  const series: { t: number; hr: number | null; spd: number | null }[] = []

  for (let m = 0; m < minutes; m++) {
    const into = m / minutes
    let hr: number
    let effort = 1

    if (plan.protocol === 'INTERVALS') {
      // 10 min inlopen, dan blokken van 4 min hard / 3 min dravend, 8 min uit.
      if (m < 10) { effort = 0.82; hr = plan.avgHr * 0.84 }
      else if (m >= minutes - 8) { effort = 0.78; hr = plan.avgHr * 0.8 }
      else {
        const hard = (m - 10) % 7 < 4
        effort = hard ? 1.2 : 0.8
        hr = plan.avgHr * (hard ? 1.07 : 0.86)
      }
    } else if (plan.protocol === 'WALK_RUN') {
      const running = m % 5 < 3
      effort = running ? 1.25 : 0.6
      hr = plan.avgHr * (running ? 1.08 : 0.87)
    } else {
      // Duur: opwarmen, dan vlak met lichte drift omhoog.
      const warmup = into < 0.12 ? 0.86 + (into / 0.12) * 0.14 : 1
      hr = plan.avgHr * warmup * (1 + into * 0.03)
    }

    series.push({
      t: m * 60,
      hr: clamp(Math.round(hr + (r() - 0.5) * 5), 60, 205),
      spd: baseSpeed != null ? Math.round(baseSpeed * effort * (0.97 + r() * 0.06) * 100) / 100 : null,
    })
  }

  // Edwards-banden op %HRmax; alles onder 50% telt niet mee als belasting.
  const timeInZones: Record<string, number> = {}
  for (const point of series) {
    if (point.hr == null) continue
    const pct = point.hr / MAX_HR
    const zone = pct >= 0.9 ? 5 : pct >= 0.8 ? 4 : pct >= 0.7 ? 3 : pct >= 0.6 ? 2 : pct >= 0.5 ? 1 : null
    if (zone == null) continue
    timeInZones[String(zone)] = (timeInZones[String(zone)] ?? 0) + 60
  }

  return { series, timeInZones }
}

function buildWearablePayload(days: Day[]): SyncPayload {
  const r = makeRng(SEED)

  const workouts: SyncPayload['workouts'] = []
  const sleep: SyncPayload['sleep'] = []
  const vitals: SyncPayload['vitals'] = []
  const hrIntraday: SyncPayload['hrIntraday'] = []

  for (const d of days) {
    const cardio = cardioFor(d)
    const strength = strengthFor(d)
    const strengthAt = strength ? { hour: strength === 'REHAB' ? 17 : 18, durationSec: strength === 'REHAB' ? 2700 : 3600 } : null

    // Herstel-signalen. In de revalidatie ligt de HRV wat lager en de rust-HR
    // wat hoger; naarmate de opbouw vordert draait dat om. De dip aan het eind
    // duwt beide bewust de verkeerde kant op.
    const trend = d.i / (DAYS - 1) // 0 → 1 over de hele reeks
    const baseHrv = 54 + trend * 12
    const wave = Math.sin(d.i / 4.5) * 3.5
    const hrv = Math.round(baseHrv + wave + (r() - 0.5) * 6 - d.dip * 14)
    const restingHeartRate = Math.round(REST_HR + 2 - trend * 2 + (r() - 0.5) * 3 + d.dip * 5)
    const respiratoryRate = round1(14.1 + (r() - 0.5) * 1.0 + d.dip * 1.4)
    const wristTempDeviation = round1((r() - 0.5) * 0.3 + d.dip * 0.35)

    const strain = clamp(d.dip * 0.9 + (d.phase === 'REHAB' ? 0.18 : 0) + (cardio?.protocol === 'INTERVALS' ? 0.1 : 0), 0, 1)

    sleep.push({
      externalId: `${EXT}sleep-${d.iso}`,
      date: d.iso,
      segments: genNight(d.date, r, strain),
    })

    const trainingDay = !!cardio || !!strength
    vitals.push({
      date: d.iso,
      hrv: Math.max(22, hrv),
      hrvType: 'SDNN',
      restingHeartRate,
      respiratoryRate,
      wristTempDeviation,
      steps: Math.round((trainingDay ? 11200 : 7400) + (r() - 0.5) * 2400),
      activeEnergyKcal: Math.round((trainingDay ? 720 : 420) + (r() - 0.5) * 160),
      basalEnergyKcal: Math.round(1620 + (r() - 0.5) * 90),
      // VO2max kruipt omhoog zodra het hardlopen begint.
      vo2Max: round1(46.5 + (d.phase === 'BUILD' ? (3 - d.weeksAgo) * 0.5 : 0)),
    })

    const hr = genHeartRateDay(d, restingHeartRate, cardio, strengthAt, r)
    hrIntraday.push({ date: d.iso, buckets: hr.buckets, histogram: hr.histogram })

    if (cardio) {
      const { series, timeInZones } = genWorkoutSeries(cardio, r)
      const hrs = series.map((x) => x.hr!).filter((x) => x != null)
      workouts.push({
        externalId: `${EXT}w-${d.iso}-${cardio.activity.toLowerCase()}`,
        activity: cardio.activity,
        startAt: at(d.date, cardio.hour, 15).toISOString(),
        durationSec: cardio.durationSec,
        distanceM: cardio.distanceM ?? undefined,
        // Gemiddelde en piek uit de reeks zelf, zodat de kop van het scherm
        // niet iets anders zegt dan de grafiek eronder.
        avgHeartRate: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
        maxHeartRate: Math.max(...hrs),
        activeEnergyKcal: Math.round((cardio.durationSec / 60) * (cardio.activity === 'WALKING' ? 5.5 : 11)),
        timeInZones,
        series,
      })
    }
  }

  return {
    device: { model: 'Apple Watch Series 9' },
    anchors: { workouts: `${EXT}anchor`, sleep: `${EXT}anchor`, hrv: `${EXT}anchor` },
    workouts,
    sleep,
    vitals,
    hrIntraday,
  }
}

// ── Opruimen ─────────────────────────────────────────────────────────────────

async function wipe(userId: string): Promise<Record<string, number>> {
  const programs = await prisma.program.findMany({
    where: { patientId: userId, name: { in: DEMO_PROGRAMS } },
    select: { id: true },
  })
  const programIds = programs.map((p) => p.id)

  const counts: Record<string, number> = {}
  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    counts[label] = (await fn()).count
  }

  // Hashtag-gebruik hangt aan de logs; HashTag zelf cascadeert de usages weg.
  await del('hashtags', () => prisma.hashTag.deleteMany({ where: { patientId: userId } }))
  // ExerciseLog cascadeert vanuit SessionLog.
  // Nooit breder dan onze eigen programma's: staan die er niet, dan is er ook
  // geen sessie van ons om weg te halen. Een losser filter zou de sessies van
  // het Apple-stubprogramma meenemen, en die zijn niet van dit script.
  if (programIds.length > 0) {
    await del('sessionLogs', () =>
      prisma.sessionLog.deleteMany({ where: { patientId: userId, programId: { in: programIds } } }),
    )
  } else {
    counts.sessionLogs = 0
  }
  await del('cardioLogs', () =>
    prisma.cardioLog.deleteMany({ where: { patientId: userId, externalId: { startsWith: EXT } } }),
  )
  await del('weekSchedules', () => prisma.weekSchedule.deleteMany({ where: { patientId: userId } }))
  await del('programs', () => prisma.program.deleteMany({ where: { patientId: userId, name: { in: DEMO_PROGRAMS } } }))
  await del('sleep', () => prisma.sleepEntry.deleteMany({ where: { userId } }))
  await del('vitals', () => prisma.vitalsEntry.deleteMany({ where: { userId } }))
  await del('exertion', () => prisma.exertionEntry.deleteMany({ where: { userId } }))
  await del('stress', () => prisma.stressEntry.deleteMany({ where: { userId } }))
  await del('readiness', () => prisma.readinessSnapshot.deleteMany({ where: { userId } }))
  await del('wellness', () => prisma.wellnessCheck.deleteMany({ where: { userId } }))
  await del('pain', () => prisma.painEntry.deleteMany({ where: { userId } }))
  // RehabCriterionStatus cascadeert vanuit de tracker.
  await del('rehabTrackers', () => prisma.patientRehabTracker.deleteMany({ where: { patientId: userId } }))
  await del('wearableConnection', () => prisma.wearableConnection.deleteMany({ where: { userId } }))
  await del('dailyGoal', () => prisma.dailyGoal.deleteMany({ where: { userId } }))

  // Het Apple-stubprogramma weer zichtbaar maken; dat hoort niet bij ons.
  const restored = await prisma.program.updateMany({
    where: { patientId: userId, name: APPLE_STUB_PROGRAM, status: 'ARCHIVED' },
    data: { status: 'ACTIVE' },
  })
  if (restored.count > 0) counts.appleStubHersteld = restored.count

  return counts
}

// ── Vullen ───────────────────────────────────────────────────────────────────

async function resolveExercises(specs: ExSpec[]) {
  const out = new Map<string, string>()
  for (const spec of specs) {
    if (out.has(spec.name)) continue
    const exact = await prisma.exercise.findFirst({ where: { name: spec.name }, select: { id: true } })
    const found =
      exact ??
      (await prisma.exercise.findFirst({
        where: { name: { contains: spec.name, mode: 'insensitive' } },
        select: { id: true },
        orderBy: { name: 'asc' },
      }))
    if (!found) throw new Error(`Oefening niet gevonden in de catalogus: "${spec.name}"`)
    out.set(spec.name, found.id)
  }
  return out
}

async function main() {
  const wipeOnly = process.argv.includes('--wipe')

  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, role: true, name: true, practiceId: true },
  })
  if (!user) throw new Error(`Account ${EMAIL} bestaat niet. Draai eerst scripts/create-apple-test-account.ts`)
  if (user.role !== 'ATHLETE') throw new Error(`Account heeft rol ${user.role}, verwacht ATHLETE. Gestopt.`)

  console.log(`Account: ${EMAIL} (${user.id}), rol ${user.role}`)

  const removed = await wipe(user.id)
  const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0)
  console.log(`· opgeruimd: ${removedTotal} rijen`, removed)

  if (wipeOnly) {
    console.log('\n✅ Alleen opgeruimd (--wipe). Het account zelf blijft bestaan.')
    return
  }

  const therapist = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'THERAPIST'] }, deletedAt: null },
    select: { id: true },
  })
  if (!therapist) throw new Error('Geen admin/therapeut gevonden om als maker te gebruiken.')

  const days = buildDays()
  const r = makeRng(SEED + 1)

  // ── 1. Profiel ─────────────────────────────────────────────────────────────
  // Moet vóór de wearable-ingestie: die leidt de RPE per workout af uit de
  // hartslag t.o.v. dit profiel, en zonder max-HR valt de dagbelasting weg.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: DISPLAY_NAME,
      firstName: DISPLAY_NAME,
      lastName: null,
      locale: 'NL',
      dateOfBirth: BIRTH_DATE,
      maxHeartRate: MAX_HR,
      restingHeartRate: REST_HR,
    },
  })
  console.log(`· profiel bijgewerkt (${DISPLAY_NAME}, NL, max-HR ${MAX_HR}, rust-HR ${REST_HR})`)

  await prisma.dailyGoal.create({
    data: { userId: user.id, kcalGoal: 650, trainMinGoal: 45, stepsGoal: 9000, sleepMinGoal: 480 },
  })

  // ── 2. Wearable-laag via de echte ingestiepijplijn ──────────────────────────
  const payload = buildWearablePayload(days)
  const ingested = await ingestWearableData(prisma, user.id, payload)
  console.log(`· wearable-ingestie: ${ingested.workouts} workouts, ${ingested.sleep} nachten, ${ingested.vitals} dagen vitals`)

  for (const date of ingested.affectedDates) {
    await computeAndStoreReadiness(prisma, user.id, date)
  }
  const readinessCount = await prisma.readinessSnapshot.count({ where: { userId: user.id } })
  console.log(`· readiness berekend voor ${ingested.affectedDates.length} dagen (${readinessCount} momentopnames bewaard)`)

  // ── 2b. Het oude Apple-stubprogramma uit beeld halen ───────────────────────
  // Blijft bestaan (alleen de status verandert), maar staat niet meer naast de
  // twee echte schema's. De smoke-testsessie erop duurde 14 seconden en zou als
  // "laatste training" op het beginscherm belanden; die gaat wel echt weg.
  const archived = await prisma.program.updateMany({
    where: { patientId: user.id, name: APPLE_STUB_PROGRAM, status: { not: 'ARCHIVED' } },
    data: { status: 'ARCHIVED' },
  })
  const stubSessions = await prisma.sessionLog.deleteMany({
    where: {
      patientId: user.id,
      program: { name: APPLE_STUB_PROGRAM },
      OR: [{ duration: null }, { duration: { lt: 300 } }],
    },
  })
  if (archived.count || stubSessions.count) {
    console.log(`· Apple-stubprogramma gearchiveerd (${archived.count}), ${stubSessions.count} smoke-testsessie(s) verwijderd`)
  }

  // ── 3. Programma's + krachtsessies ─────────────────────────────────────────
  const exIds = await resolveExercises([...REHAB_EXERCISES, ...BUILD_EXERCISES])

  const rehabStart = days[0].date
  const rehabEnd = days.find((d) => d.phase === 'TRANSITION')!.date
  const buildStart = days.find((d) => d.phase === 'BUILD')!.date

  const mkProgramExercises = (specs: ExSpec[], weeks: number, dayNumbers: number[]) =>
    Array.from({ length: weeks }, (_, w) =>
      dayNumbers.flatMap((day) =>
        specs.map((spec, order) => ({
          exerciseId: exIds.get(spec.name)!,
          week: w + 1,
          day,
          order,
          sets: spec.sets,
          reps: spec.reps,
          repUnit: spec.repUnit,
          restTime: spec.rest,
        })),
      ),
    ).flat()

  const rehabProgram = await prisma.program.create({
    data: {
      name: PROGRAM_REHAB,
      description: 'Afsluitende krachtfase van het knietraject: eenbenige belasting, excentrische hamstrings en kuitwerk.',
      status: 'COMPLETED',
      type: 'STRENGTH',
      weeks: 5,
      daysPerWeek: 3,
      startDate: rehabStart,
      endDate: rehabEnd,
      creatorId: therapist.id,
      patientId: user.id,
      practiceId: user.practiceId ?? undefined,
      exercises: { create: mkProgramExercises(REHAB_EXERCISES, 5, [1, 3, 5]) },
    },
    select: { id: true },
  })

  const buildProgram = await prisma.program.create({
    data: {
      name: PROGRAM_BUILD,
      description: 'Krachtbasis naast de loopopbouw: zwaardere samengestelde oefeningen en de eerste sprongbelasting.',
      status: 'ACTIVE',
      type: 'STRENGTH',
      weeks: 6,
      daysPerWeek: 2,
      startDate: buildStart,
      creatorId: therapist.id,
      patientId: user.id,
      practiceId: user.practiceId ?? undefined,
      exercises: { create: mkProgramExercises(BUILD_EXERCISES, 6, [2, 5]) },
    },
    select: { id: true },
  })
  console.log('· 2 programma\'s aangemaakt')

  // Krachtsessies met oefeningregels.
  const rehabSessionIds: { id: string; date: Date }[] = []
  let sessionCount = 0

  for (const d of days) {
    const block = strengthFor(d)
    if (!block) continue

    const specs = block === 'REHAB' ? REHAB_EXERCISES : BUILD_EXERCISES
    const programId = block === 'REHAB' ? rehabProgram.id : buildProgram.id
    const hour = block === 'REHAB' ? 17 : 18
    const durationSec = block === 'REHAB' ? 2400 + Math.round(r() * 600) : 3300 + Math.round(r() * 900)

    // Pijn zakt van 3 naar 0 door de revalidatie heen; in de opbouw hooguit 1.
    const painLevel =
      block === 'REHAB' ? Math.max(0, 3 - Math.floor(d.weekInBlock * 0.8)) : r() < 0.25 ? 1 : 0
    const exertionLevel = block === 'REHAB' ? 5 + (r() < 0.4 ? 1 : 0) : d.deload ? 6 : 7 + (r() < 0.35 ? 1 : 0)
    const feelScore = block === 'REHAB' ? (r() < 0.3 ? 3 : 4) : d.dip > 0 ? 3 : r() < 0.35 ? 4 : 5

    const notes =
      block === 'REHAB'
        ? '#knie voelt stabiel, geen naschrijnen.'
        : d.deload
          ? 'Deload-week, bewust lichter gehouden.'
          : null

    const session = await prisma.sessionLog.create({
      data: {
        programId,
        patientId: user.id,
        status: 'COMPLETED',
        scheduledAt: at(d.date, hour),
        completedAt: at(d.date, hour),
        completedAll: true,
        duration: durationSec,
        notes,
        painLevel,
        exertionLevel,
        feelScore,
        exerciseLogs: {
          create: specs.map((spec) => {
            const weight = spec.baseWeight != null ? spec.baseWeight + spec.weeklyStep * d.weekInBlock : null
            const setWeight = weight != null ? Math.round(weight * (d.deload ? 0.8 : 1) * 2) / 2 : null
            const reps = spec.reps - (d.dip > 0.5 ? 1 : 0)
            return {
              exerciseId: exIds.get(spec.name)!,
              setsCompleted: spec.sets,
              repsCompleted: reps,
              repUnit: spec.repUnit,
              weight: setWeight,
              weightsPerSet: setWeight != null ? Array.from({ length: spec.sets }, () => setWeight) : undefined,
              repsPerSet: Array.from({ length: spec.sets }, (_, s) => Math.max(1, reps - (s === spec.sets - 1 ? 1 : 0))),
              painLevel: block === 'REHAB' ? painLevel : null,
              phase: 'MAIN',
              estimatedOneRepMax:
                setWeight != null && spec.repUnit === 'reps' ? oneRepMax(setWeight, reps) : null,
            }
          }),
        },
      },
      select: { id: true },
    })
    sessionCount++
    if (block === 'REHAB') rehabSessionIds.push({ id: session.id, date: at(d.date, hour) })
  }
  console.log(`· ${sessionCount} krachtsessies gelogd`)

  // ── 4. Weekplanner: deze week en vorige week ───────────────────────────────
  const thisMonday = mondayOf(startOfToday())
  const weeks = [
    { monday: addDays(thisMonday, -7), weekNumber: 1, note: 'Opbouwweek. Interval op woensdag, lange duurloop zaterdag.', target: 1750 },
    { monday: thisMonday, weekNumber: 2, note: 'Zelfde opzet, iets langere duurloop. Let op de landing bij de sprongen.', target: 1900 },
  ]

  let itemCount = 0

  for (const wk of weeks) {
    const scheduleId = crypto.randomUUID()
    await prisma.weekSchedule.create({
      data: {
        id: scheduleId,
        name: `Week ${wk.weekNumber} — opbouw`,
        creatorId: therapist.id,
        patientId: user.id,
        startDate: wk.monday,
        endDate: addDays(wk.monday, 6),
        weekNumber: wk.weekNumber,
        phaseType: 'ACCUMULATION',
        targetLoad: wk.target,
        weekNote: wk.note,
        practiceId: user.practiceId ?? undefined,
      },
    })

    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(wk.monday, offset)
      const dayId = crypto.randomUUID()
      await prisma.weekScheduleDay.create({
        data: { id: dayId, weekScheduleId: scheduleId, dayOfWeek: date.getDay() },
      })

      // Zelfde regels als voor het loggen, óók voor dagen die nog moeten komen.
      // `i: DAYS` zet de dag buiten het logvenster: strengthFor/cardioFor slaan
      // "vandaag" bewust over bij het loggen, maar in de planning hoort het item
      // er juist wél te staan.
      const planProbe = makeDay(date, DAYS, thisMonday)

      const strength = strengthFor(planProbe)
      const cardio = cardioFor(planProbe)
      let order = 0

      if (strength) {
        await prisma.weekScheduleDayItem.create({
          data: {
            dayId, order: order++, kind: 'PROGRAM',
            programId: strength === 'BUILD' ? buildProgram.id : rehabProgram.id,
            plannedDurationSec: 3600, plannedRpe: 7,
          },
        })
        itemCount++
      }
      if (cardio) {
        await prisma.weekScheduleDayItem.create({
          data: {
            dayId, order: order++, kind: 'WORKOUT',
            quickCategory: 'CARDIO', quickActivity: cardio.activity,
            quickName: cardio.label, quickDurationSec: cardio.durationSec,
            plannedDurationSec: cardio.durationSec,
            plannedRpe: cardio.protocol === 'INTERVALS' ? 8 : 5,
          },
        })
        itemCount++
      }
      if (!strength && !cardio) {
        await prisma.weekScheduleDayItem.create({
          data: { dayId, order: order++, kind: 'REST' },
        })
        itemCount++
      }
      // Eén therapeutnotitie in de lopende week.
      if (wk.weekNumber === 2 && date.getDay() === 3) {
        await prisma.weekScheduleDayItem.create({
          data: { dayId, order: order++, kind: 'NOTE', quickName: 'Knie boven de voet houden bij de landing. Bij zeurende pijn de sprongen overslaan.' },
        })
        itemCount++
      }
    }
  }
  console.log(`· weekplanner gevuld: 2 weken, ${itemCount} items`)

  // ── 5. Dagcheck en pijn ────────────────────────────────────────────────────
  let wellnessCount = 0
  for (const d of days) {
    const base = d.phase === 'REHAB' ? 3 : 4
    const pick = (extra = 0) => clamp(Math.round(base + extra + (r() - 0.5) * 1.2 - d.dip * 1.4), 1, 5)
    await prisma.wellnessCheck.create({
      data: {
        userId: user.id,
        date: d.date,
        sleep: pick(),
        soreness: pick(strengthFor(d) ? -0.5 : 0.3),
        fatigue: pick(),
        mood: pick(0.5),
        stress: pick(0.3),
        notes: d.dip >= 1 ? 'Slecht geslapen, benen voelen zwaar.' : null,
      },
    })
    wellnessCount++
  }
  console.log(`· ${wellnessCount} dagchecks`)

  let painCount = 0
  for (const d of days) {
    const isRehab = d.phase === 'REHAB'
    if (isRehab && d.weekday === 1) {
      await prisma.painEntry.create({
        data: {
          userId: user.id,
          nrs: Math.max(1, 3 - d.weekInBlock),
          location: 'Knie rechts',
          context: 'exercise',
          notes: d.weekInBlock === 0 ? 'Zeurend gevoel na de eenbenige oefeningen.' : null,
          reportedAt: at(d.date, 19),
        },
      })
      painCount++
    }
    if (!isRehab && d.weekday === 6 && d.weeksAgo % 2 === 0) {
      await prisma.painEntry.create({
        data: { userId: user.id, nrs: 1, location: 'Knie rechts', context: 'after', reportedAt: at(d.date, 12) },
      })
      painCount++
    }
  }
  console.log(`· ${painCount} pijnregistraties`)

  // ── 6. Revalidatietraject ──────────────────────────────────────────────────
  const protocol = await prisma.rehabProtocol.findFirst({
    where: { specialty: 'knee_acl', isActive: true },
    select: { id: true, name: true, phases: { orderBy: { order: 'asc' }, select: { id: true, order: true, criteria: { orderBy: { order: 'asc' }, select: { id: true, targetValue: true } } } } },
  })

  if (!protocol) {
    console.log('· geen knee_acl-protocol gevonden — revalidatietraject overgeslagen')
  } else {
    const tracker = await prisma.patientRehabTracker.create({
      data: {
        patientId: user.id,
        protocolId: protocol.id,
        activatedById: therapist.id,
        activatedAt: addDays(startOfToday(), -160),
        surgeryDate: addDays(startOfToday(), -165),
        injuryDate: addDays(startOfToday(), -195),
        notes: 'Terugkeer naar recreatief hardlopen als doel. Krachtwaarden links-rechts nog niet gelijk.',
      },
      select: { id: true },
    })

    // Fase 0 t/m 2 afgerond, fase 3 voor de helft, daarna nog niets gemeten:
    // dat is precies een atleet die midden in de terugkeer naar sport zit.
    let statusCount = 0
    for (const phase of protocol.phases) {
      if (phase.order > 3) continue
      const half = Math.ceil(phase.criteria.length / 2)
      for (const [idx, c] of phase.criteria.entries()) {
        const met = phase.order < 3 || idx < half
        await prisma.rehabCriterionStatus.create({
          data: {
            trackerId: tracker.id,
            criterionId: c.id,
            status: met ? 'MET' : 'IN_PROGRESS',
            measurementValue: met ? c.targetValue.replace(/^[<>≥≤~]\s*/, '') : null,
            measurementDate: addDays(startOfToday(), -Math.max(7, 170 - phase.order * 38 - idx)),
            notes: met ? null : 'Net onder de doelwaarde, volgende meting over twee weken.',
            updatedById: therapist.id,
          },
        })
        statusCount++
      }
    }
    console.log(`· revalidatietraject aangemaakt (${protocol.name}), ${statusCount} criteria gescoord`)
  }

  // ── 7. Hashtags op de revalidatiesessies ───────────────────────────────────
  if (rehabSessionIds.length > 0) {
    const tag = await prisma.hashTag.create({
      data: { patientId: user.id, name: 'knie', display: 'knie' },
      select: { id: true },
    })
    for (const s of rehabSessionIds) {
      await prisma.hashTagUsage.create({
        data: { tagId: tag.id, sessionLogId: s.id, taggedById: user.id, loggedAt: s.date },
      })
    }
    console.log(`· #knie gekoppeld aan ${rehabSessionIds.length} sessies`)
  }

  // ── Samenvatting ───────────────────────────────────────────────────────────
  const summary = {
    krachtsessies: await prisma.sessionLog.count({ where: { patientId: user.id } }),
    cardio: await prisma.cardioLog.count({ where: { patientId: user.id } }),
    slaap: await prisma.sleepEntry.count({ where: { userId: user.id } }),
    vitals: await prisma.vitalsEntry.count({ where: { userId: user.id } }),
    dagbelasting: await prisma.exertionEntry.count({ where: { userId: user.id } }),
    stress: await prisma.stressEntry.count({ where: { userId: user.id } }),
    readiness: await prisma.readinessSnapshot.count({ where: { userId: user.id } }),
    dagcheck: await prisma.wellnessCheck.count({ where: { userId: user.id } }),
    pijn: await prisma.painEntry.count({ where: { userId: user.id } }),
  }
  console.log('\n✅ Klaar.', summary)
}

main()
  .catch((e) => {
    console.error('❌ Mislukt:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
