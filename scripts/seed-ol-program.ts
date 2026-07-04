/**
 * Zaait het Olympisch-gewichtheffen-schema van Jurre als deelbaar TEMPLATE
 * (isTemplate=true, praktijk-breed). Encodeert de nieuwe intensiteits-
 * voorschriften (RPE / back-off onder daily max / techniek / core-keuze).
 *
 * Idempotent: verwijdert een bestaand template met dezelfde naam en maakt het
 * opnieuw; oefeningen worden ge-upsert op naam binnen de praktijk.
 *
 * Run: npx tsx scripts/seed-ol-program.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}
const prisma = createPrisma()

const OWNER_EMAIL = 'jurre@movementbasedtherapy.nl'
const PROGRAM_NAME = 'Olympisch Gewichtheffen — Blokperiodisering'

type IntensityType = 'NONE' | 'RPE' | 'PERCENT_1RM' | 'RELATIVE_DAILY_MAX' | 'TECHNIQUE' | 'TEXT'
type Presc = { intensityType: IntensityType; intensityMin?: number | null; intensityMax?: number | null; intensityText?: string | null }
const rpe = (min: number, max?: number): Presc => ({ intensityType: 'RPE', intensityMin: min, intensityMax: max ?? null })
const rel = (off: number): Presc => ({ intensityType: 'RELATIVE_DAILY_MAX', intensityMin: off })
const tech = (text?: string): Presc => ({ intensityType: 'TECHNIQUE', intensityText: text ?? null })
const txt = (text: string): Presc => ({ intensityType: 'TEXT', intensityText: text })

// Oefeningen die nog niet bestaan → aanmaken. category + patroon + 1RM-flag.
const CREATE: Record<string, { category: string; movementPattern?: string; loadType?: string; track1rm?: boolean; repUnit?: string; region?: string[] }> = {
  'Snatch': { category: 'STRENGTH', movementPattern: 'FULL_BODY', loadType: 'WEIGHTED', track1rm: true },
  'Power Snatch': { category: 'STRENGTH', movementPattern: 'FULL_BODY', loadType: 'WEIGHTED', track1rm: true },
  'Snatch Pull': { category: 'STRENGTH', movementPattern: 'HINGE', loadType: 'WEIGHTED', track1rm: true },
  'Clean & Jerk': { category: 'STRENGTH', movementPattern: 'FULL_BODY', loadType: 'WEIGHTED', track1rm: true },
  'Power Clean': { category: 'STRENGTH', movementPattern: 'FULL_BODY', loadType: 'WEIGHTED', track1rm: true },
  'Split Jerk': { category: 'STRENGTH', movementPattern: 'PUSH_VERTICAL', loadType: 'WEIGHTED', track1rm: true },
  'Power Clean + Push Jerk': { category: 'STRENGTH', movementPattern: 'FULL_BODY', loadType: 'WEIGHTED', track1rm: true },
  'Clean Pull': { category: 'STRENGTH', movementPattern: 'HINGE', loadType: 'WEIGHTED', track1rm: true },
  'Snatch Balance': { category: 'STRENGTH', movementPattern: 'SQUAT', loadType: 'WEIGHTED', track1rm: true },
  'Hang Snatch': { category: 'STRENGTH', movementPattern: 'FULL_BODY', loadType: 'WEIGHTED', track1rm: true },
  'Easy run (zone 2)': { category: 'CARDIO', movementPattern: 'FULL_BODY', loadType: 'BODYWEIGHT', repUnit: 'min' },
  'Kwaliteitsrun (tempo/interval)': { category: 'CARDIO', movementPattern: 'FULL_BODY', loadType: 'BODYWEIGHT', repUnit: 'min' },
  'Core — eigen keuze': { category: 'STABILITY', movementPattern: 'CORE', loadType: 'BODYWEIGHT' },
}

type Row = {
  ex: string
  sets: number; setsMax?: number; reps: number; repsMax?: number
  repUnit?: string; rest: number
  b1: Presc; b2: Presc; notes: string
  top?: boolean // daily-max top set → in testweek een optionele max poging
}

const DAYS: { day: number; label: string; rows: Row[] }[] = [
  {
    day: 1, label: 'Snatch',
    rows: [
      { ex: 'Snatch', sets: 3, setsMax: 5, reps: 2, repsMax: 3, rest: 120, b1: tech('Techniek'), b2: tech('Techniek'), notes: 'Lege stang tot opwarmgewicht. Positie, timing, ontvangst.' },
      { ex: 'Snatch', sets: 1, reps: 1, rest: 180, b1: rpe(8), b2: rpe(9), top: true, notes: 'Daily max opbouwen. Stop als techniek wegvalt — dit is je top set.' },
      { ex: 'Snatch', sets: 3, reps: 2, rest: 150, b1: rel(-10), b2: rel(-5), notes: 'Back-off. Volume op gewicht dat zeker goed voelt.' },
      { ex: 'Power Snatch', sets: 3, reps: 3, rest: 120, b1: rpe(7), b2: rpe(7, 8), notes: 'Hogere ontvangst — snelheid en timing.' },
      { ex: 'Overhead Squat', sets: 3, reps: 5, rest: 90, b1: rpe(7), b2: rpe(7), notes: 'Mobiliteit en stabiliteit in de bodempositie.' },
      { ex: 'Snatch Pull', sets: 3, reps: 5, rest: 120, b1: rpe(7, 8), b2: rpe(8), notes: 'Tweede knie — hoek + explosiviteit.' },
      { ex: 'Back Squat', sets: 3, reps: 5, rest: 120, b1: rpe(7), b2: rpe(8), notes: 'Basissterkte voor de snatch.' },
      { ex: 'Core — eigen keuze', sets: 3, reps: 10, rest: 60, b1: txt('Anti-flexie — bv. Dead Bug, Hollow Body, RKC Plank'), b2: txt('Anti-flexie — bv. Dead Bug, Hollow Body, RKC Plank'), notes: 'Eigen keuze.' },
    ],
  },
  {
    day: 2, label: 'Hardlopen (easy)',
    rows: [
      { ex: 'Easy run (zone 2)', sets: 1, reps: 30, repsMax: 45, repUnit: 'min', rest: 0, b1: txt('Zone 2 — gesprekstempo, lage intensiteit'), b2: txt('Zone 2 — gesprekstempo, lage intensiteit'), notes: 'Herstel na snatch-dag.' },
    ],
  },
  {
    day: 3, label: 'Clean & Jerk',
    rows: [
      { ex: 'Clean & Jerk', sets: 3, setsMax: 5, reps: 1, rest: 120, b1: tech('Techniek'), b2: tech('Techniek'), notes: 'Lege stang tot opwarm. 1+1 (clean + jerk). Clean los, dan jerk, dan combineren.' },
      { ex: 'Clean & Jerk', sets: 1, reps: 1, rest: 180, b1: rpe(8), b2: rpe(9), top: true, notes: 'Daily max, 1+1. Stop als techniek wegvalt.' },
      { ex: 'Clean & Jerk', sets: 3, reps: 1, rest: 150, b1: rel(-10), b2: rel(-5), notes: 'Back-off, 1+1. Zeker en gecontroleerd.' },
      { ex: 'Power Clean', sets: 3, reps: 3, rest: 120, b1: rpe(7), b2: rpe(7, 8), notes: 'Hogere vangpositie — snelheid en timing.' },
      { ex: 'Split Jerk', sets: 3, reps: 3, rest: 120, b1: rpe(7), b2: rpe(8), notes: 'Jerk techniek los trainen op lager gewicht.' },
      { ex: 'Front Squat', sets: 4, reps: 3, rest: 120, b1: rpe(7, 8), b2: rpe(8, 9), notes: 'Specifiek voor clean-ontvangst en kracht uitdrukken.' },
      { ex: 'Clean Pull', sets: 3, reps: 5, rest: 120, b1: rpe(7, 8), b2: rpe(8), notes: 'Tweede knie en extensie.' },
      { ex: 'Core — eigen keuze', sets: 3, reps: 10, rest: 60, b1: txt('Anti-extensie — bv. Ab Wheel, Stir the Pot, L-sit'), b2: txt('Anti-extensie — bv. Ab Wheel, Stir the Pot, L-sit'), notes: 'Eigen keuze.' },
    ],
  },
  {
    day: 4, label: 'Hardlopen (kwaliteit)',
    rows: [
      { ex: 'Kwaliteitsrun (tempo/interval)', sets: 1, reps: 20, repsMax: 30, repUnit: 'min', rest: 0, b1: txt('Tempo of interval — matig-hoog, bv. 4-6x400m of 20 min drempel'), b2: txt('Tempo of interval — matig-hoog, bv. 4-6x400m of 20 min drempel'), notes: 'Uiterlijk 20:00 zodat herstel oké is voor vrijdag.' },
    ],
  },
  {
    day: 5, label: 'Power + Kracht + Upper',
    rows: [
      { ex: 'Power Snatch', sets: 4, reps: 3, rest: 120, b1: rpe(7, 8), b2: rpe(8), notes: 'Snelheid en techniek. Hogere ontvangst dan comp snatch.' },
      { ex: 'Power Clean + Push Jerk', sets: 4, reps: 2, rest: 150, b1: rpe(7, 8), b2: rpe(8), notes: 'Combo, 2+2 — timing en explosiviteit.' },
      { ex: 'Back Squat', sets: 4, reps: 4, rest: 150, b1: rpe(8), b2: rpe(8, 9), notes: 'Hoofd sterktepijler voor beide lifts.' },
      { ex: 'Romanian Deadlift', sets: 3, reps: 8, rest: 90, b1: rpe(7), b2: rpe(7), notes: 'Posterior chain en hamstring balans.' },
      { ex: 'Bench Press', sets: 3, reps: 6, repsMax: 8, rest: 90, b1: rpe(7), b2: rpe(7, 8), notes: 'Horizontaal duwen — balans tegenover overhead/trek.' },
      { ex: 'Barbell Row', sets: 3, reps: 10, rest: 90, b1: rpe(7), b2: rpe(7), notes: 'Rugbalans na veel overhead/trekwerk. (Of Lat Pulldown.)' },
      { ex: 'Core — eigen keuze', sets: 3, reps: 12, rest: 60, b1: txt('Anti-rotatie — bv. Pallof Press, Suitcase Carry, Copenhagen'), b2: txt('Anti-rotatie — bv. Pallof Press, Suitcase Carry, Copenhagen'), notes: 'Eigen keuze.' },
    ],
  },
  {
    day: 6, label: 'Techniek + Accessory',
    rows: [
      { ex: 'Snatch Balance', sets: 4, reps: 3, rest: 90, b1: tech('Licht — techniek'), b2: tech('Licht — techniek'), notes: 'Mobiliteit + snelheid in de vangpositie. Nooit zwaar.' },
      { ex: 'Hang Snatch', sets: 3, reps: 3, rest: 90, b1: rpe(7), b2: rpe(7, 8), notes: 'Tweede knie zonder eerste knieval.' },
      { ex: 'Front Squat', sets: 3, reps: 3, rest: 120, b1: rpe(7, 8), b2: rpe(8), notes: 'Clean-specifiek + beenstrekkerkracht.' },
      { ex: 'Dumbbell Shoulder Press', sets: 3, reps: 12, rest: 60, b1: rpe(7), b2: rpe(7), notes: 'Schouderstabiliteit voor jerk.' },
      { ex: 'Face Pull', sets: 3, reps: 15, rest: 45, b1: rpe(6, 7), b2: rpe(6, 7), notes: 'Rotator cuff health — altijd doen.' },
      { ex: 'Bicep Curl', sets: 3, reps: 15, rest: 45, b1: rpe(6, 7), b2: rpe(6, 7), notes: '+ triceps. Elleboogstabiliteit voor overhead bewegingen.' },
    ],
  },
]

const DESCRIPTION = [
  'Olympisch gewichtheffen — blokperiodisering met autoregulatie (Steffi Cohen Hybrid Performance principes).',
  '',
  'RPE bij OL: techniek is de limiter. RPE 8 = gecontroleerd en explosief. Een slechte lift bij RPE 9 telt niet — stop zodra techniek degradeert. Daily max = zwaarste gewicht met goede techniek op die dag, geen grinding.',
  '',
  'Blokstructuur: Blok 1 accumulatie (wk 1-3, meer variatie, techniek), Deload (wk 4, ~50% volume, licht), Blok 2 intensificatie (wk 5-7, comp lifts prioriteit, daily max omhoog), Test (wk 8, optionele max op snatch en/of C&J).',
  '',
  'Optioneel: 3e easy run (zone 2, 30-40 min) op za/zo als herstel het toelaat.',
  '',
  'Pees-protocol (naast de training): Achilles/soleus — Blok 1 wk1-2 isometrie 5x45s/been vóór training; wk3-4 HSR calf raise 4x8 (3s op/3s neer); Blok 2+ plyometrisch 3x10 enkelbots (alleen bij pijn <3/10). Patellapees — elke vrijdag leg-ext isometrie 5x45s (~70% MVIC). Rotator cuff — elke overhead-dag IR/ER band + face pull 3x15 in de warming-up.',
].join('\n')

function weekProfile(w: number): 'blok1' | 'deload' | 'blok2' | 'test' {
  if (w <= 3) return 'blok1'
  if (w === 4) return 'deload'
  if (w <= 7) return 'blok2'
  return 'test'
}

async function getOwner() {
  const u = await prisma.user.findFirst({ where: { email: OWNER_EMAIL }, select: { id: true, practiceId: true } })
  if (!u) throw new Error(`User ${OWNER_EMAIL} niet gevonden`)
  return u
}

async function resolveExercise(name: string, createdById: string, practiceId: string | null): Promise<string> {
  // Speciale reuse: RDL bestaat als "Romanian Deadlift (barbell)".
  const search = name === 'Romanian Deadlift' ? 'romanian deadlift' : name
  const existing = await prisma.exercise.findFirst({
    where: { name: { equals: search, mode: 'insensitive' } },
    select: { id: true },
  }) ?? (name === 'Romanian Deadlift'
    ? await prisma.exercise.findFirst({ where: { name: { contains: 'Romanian Deadlift', mode: 'insensitive' } }, select: { id: true } })
    : null)
  if (existing) return existing.id

  const spec = CREATE[name]
  if (!spec) throw new Error(`Oefening "${name}" bestaat niet en staat niet in CREATE-lijst`)
  const created = await prisma.exercise.create({
    data: {
      name,
      category: spec.category as never,
      difficulty: 'ADVANCED',
      loadType: (spec.loadType ?? 'WEIGHTED') as never,
      movementPattern: (spec.movementPattern ?? null) as never,
      trackOneRepMax: spec.track1rm ?? false,
      defaultRepUnit: spec.repUnit ?? 'reps',
      bodyRegion: (spec.region ?? []) as never,
      isPublic: false,
      createdById,
      practiceId,
    },
    select: { id: true },
  })
  console.log(`  + oefening aangemaakt: ${name} (${created.id})`)
  return created.id
}

async function main() {
  const owner = await getOwner()

  // Idempotent: bestaand template met deze naam weg (cascade ruimt exercises op).
  const dupes = await prisma.program.findMany({ where: { name: PROGRAM_NAME, creatorId: owner.id }, select: { id: true } })
  for (const d of dupes) {
    await prisma.program.delete({ where: { id: d.id } })
    console.log(`  - bestaand template verwijderd: ${d.id}`)
  }

  // Resolve alle oefeningen één keer.
  const names = [...new Set(DAYS.flatMap(d => d.rows.map(r => r.ex)))]
  const idByName: Record<string, string> = {}
  for (const n of names) idByName[n] = await resolveExercise(n, owner.id, owner.practiceId)

  // Bouw ProgramExercise-rijen voor 8 weken.
  const rowsCreate: Array<Record<string, unknown>> = []
  for (let week = 1; week <= 8; week++) {
    const profile = weekProfile(week)
    for (const d of DAYS) {
      d.rows.forEach((r, i) => {
        let p: Presc
        let sets = r.sets
        let setsMax = r.setsMax ?? null
        let notes = r.notes
        if (profile === 'blok1') p = r.b1
        else if (profile === 'blok2') p = r.b2
        else if (profile === 'deload') {
          p = tech('Deload — licht, alleen techniek')
          sets = Math.max(1, r.sets - 1)
          setsMax = null
          notes = `Deload (~50% volume). ${r.notes}`
        } else {
          // test
          if (r.top) { p = rpe(9, 10); notes = `Testweek — optionele max poging. ${r.notes}` }
          else { p = tech('Licht houden'); sets = Math.max(1, r.sets - 1); setsMax = null; notes = `Testweek — licht. ${r.notes}` }
        }
        rowsCreate.push({
          exerciseId: idByName[r.ex],
          week, day: d.day, order: i,
          sets, setsMax,
          reps: r.reps, repsMax: r.repsMax ?? null,
          repUnit: r.repUnit ?? 'reps',
          restTime: r.rest,
          supersetGroup: null, supersetOrder: 0,
          notes,
          intensityType: p.intensityType,
          intensityMin: p.intensityMin ?? null,
          intensityMax: p.intensityMax ?? null,
          intensityText: p.intensityText ?? null,
        })
      })
    }
  }

  const program = await prisma.program.create({
    data: {
      name: PROGRAM_NAME,
      description: DESCRIPTION,
      type: 'MIXED' as never,
      status: 'DRAFT',
      isTemplate: true,
      weeks: 8,
      daysPerWeek: 6,
      reviewAfterWeeks: 8,
      tendinopathyMode: true,
      trackOneRepMax: true,
      creatorId: owner.id,
      practiceId: owner.practiceId,
      exercises: { create: rowsCreate as never },
    },
    select: { id: true, _count: { select: { exercises: true } } },
  })
  console.log(`\n✔ Template aangemaakt: ${program.id} — ${program._count.exercises} oefening-rijen over 8 weken × 6 dagen.`)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
