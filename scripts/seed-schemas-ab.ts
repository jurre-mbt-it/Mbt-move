/**
 * Seed Schema A (Ochtend) en Schema B (Middag) als templates in de
 * programma-bibliotheek. Idempotent: oefeningen worden alleen aangemaakt als
 * ze nog niet bestaan binnen de practice; programma's worden alleen
 * aangemaakt als er nog geen template met dezelfde naam bestaat voor de creator.
 */
import 'dotenv/config'
import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!connectionString) throw new Error('DATABASE_URL/DIRECT_URL ontbreekt')
const poolUrl = connectionString.includes('pgbouncer=true')
  ? connectionString
  : connectionString + (connectionString.includes('?') ? '&' : '?') + 'pgbouncer=true'
const pool = new Pool({ connectionString: poolUrl, ssl: { rejectUnauthorized: false }, max: 3 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

type ExSpec = {
  name: string
  description: string
  category: 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
  bodyRegion: ('KNEE' | 'SHOULDER' | 'BACK' | 'ANKLE' | 'HIP' | 'FULL_BODY' | 'CERVICAL' | 'THORACIC' | 'LUMBAR' | 'ELBOW' | 'WRIST' | 'FOOT')[]
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  instructions: string[]
  defaultRepUnit?: string
}

const EXERCISES: ExSpec[] = [
  {
    name: 'Ankle pumps',
    description: 'Op- en neerwaartse beweging van de enkels voor circulatie.',
    category: 'MOBILITY',
    bodyRegion: ['ANKLE'],
    difficulty: 'BEGINNER',
    instructions: ['Beide benen tegelijk', 'Trek tenen omhoog en duw daarna door naar beneden', 'Rustig tempo'],
  },
  {
    name: 'Quad set rechts',
    description: 'Isometrische aanspanning van de quadriceps van het rechter been.',
    category: 'STRENGTH',
    bodyRegion: ['KNEE'],
    difficulty: 'BEGINNER',
    instructions: ['Lig op je rug of zit met gestrekt been', 'Span dijbeen rechts aan, druk knieholte richting bed', '5 seconden vasthouden, daarna ontspannen'],
    defaultRepUnit: 'reps',
  },
  {
    name: 'Heel slide rechts',
    description: 'Hiel over bed omhoog trekken richting kont — actieve flexie knie/heup rechts.',
    category: 'MOBILITY',
    bodyRegion: ['KNEE', 'HIP'],
    difficulty: 'BEGINNER',
    instructions: ['Lig op je rug', 'Trek de hiel rustig over het bed richting je kont', 'Binnen pijngrens, terug naar gestrekt'],
  },
  {
    name: 'Pendulum rechter schouder',
    description: 'Passieve/actief-ondersteunde mobilisatie van de rechter schouder.',
    category: 'MOBILITY',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    instructions: ['Leun voorover, steun met andere arm op een tafel', 'Laat de rechter arm vrij hangen', 'Maak kleine cirkels met het gewicht van de arm'],
  },
  {
    name: 'Diepe borstademhaling',
    description: 'Ademhalingsoefening: ribben uitzetten en vasthouden.',
    category: 'MOBILITY',
    bodyRegion: ['THORACIC'],
    difficulty: 'BEGINNER',
    instructions: ['Adem rustig diep in door de neus, voel de ribben uitzetten', '3 seconden vasthouden', 'Rustig uitademen door de mond'],
    defaultRepUnit: 'reps',
  },
  {
    name: 'Linker schouder elevatie voor',
    description: 'Actieve flexie van de linker schouder binnen pijngrens.',
    category: 'MOBILITY',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    instructions: ['Sta of zit rechtop', 'Til linker arm gestrekt naar voren omhoog', 'Stop bij de pijngrens — niet doorduwen'],
  },
  {
    name: 'Hand- en polsbewegingen rechts',
    description: 'Knijpen en draaibewegingen van de rechter hand en pols.',
    category: 'MOBILITY',
    bodyRegion: ['WRIST'],
    difficulty: 'BEGINNER',
    instructions: ['Maak een vuist en open de hand wijd', 'Draai de pols rustig rond, beide richtingen', 'Geen pijn forceren'],
  },
  {
    name: 'Opstaan van stoel',
    description: 'Functioneel opstaan vanuit een stoel met kruk ter ondersteuning.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'KNEE'],
    difficulty: 'BEGINNER',
    instructions: ['Zit op de rand van de stoel', 'Gebruik de kruk voor balans', 'Sta langzaam op en ga gecontroleerd weer zitten'],
  },
]

async function ensureExercise(spec: ExSpec, creatorId: string, practiceId: string | null) {
  const existing = await prisma.exercise.findFirst({
    where: {
      name: spec.name,
      OR: [{ practiceId }, { practiceId: null, isPublic: true }],
    },
    select: { id: true, name: true },
  })
  if (existing) return existing
  return prisma.exercise.create({
    data: {
      name: spec.name,
      description: spec.description,
      category: spec.category,
      bodyRegion: spec.bodyRegion,
      difficulty: spec.difficulty,
      instructions: spec.instructions,
      tips: [],
      tags: ['post-op', 'vroege fase'],
      isPublic: false,
      defaultRepUnit: spec.defaultRepUnit ?? 'reps',
      createdById: creatorId,
      practiceId,
    },
    select: { id: true, name: true },
  })
}

type ProgEx = {
  exerciseName: string
  sets: number
  reps: number
  repUnit?: string
  restTime?: number
  notes?: string
}

const SCHEMA_A: ProgEx[] = [
  { exerciseName: 'Ankle pumps', sets: 2, reps: 20, restTime: 30, notes: 'Beide benen' },
  { exerciseName: 'Quad set rechts', sets: 3, reps: 10, restTime: 30, notes: 'Dijbeen aanspannen, 5 sec vasthouden' },
  { exerciseName: 'Heel slide rechts', sets: 2, reps: 10, restTime: 30, notes: 'Hiel over bed omhoog trekken naar kont' },
  { exerciseName: 'Pendulum rechter schouder', sets: 2, reps: 10, restTime: 30, notes: 'Voorover leunen, arm vrij hangen, kleine cirkels' },
]

const SCHEMA_B: ProgEx[] = [
  { exerciseName: 'Diepe borstademhaling', sets: 2, reps: 5, restTime: 30, notes: '3 sec vasthouden, ribben uitzetten' },
  { exerciseName: 'Linker schouder elevatie voor', sets: 2, reps: 10, restTime: 30, notes: 'Actief, binnen pijngrens' },
  { exerciseName: 'Hand- en polsbewegingen rechts', sets: 2, reps: 15, restTime: 30, notes: 'Knijpen, draaien' },
  { exerciseName: 'Opstaan van stoel', sets: 3, reps: 5, restTime: 45, notes: 'Langzaam, kruk gebruiken' },
]

async function ensureProgram(opts: {
  name: string
  description: string
  creatorId: string
  practiceId: string | null
  type: 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
  items: ProgEx[]
  exerciseIdByName: Map<string, string>
}) {
  const existing = await prisma.program.findFirst({
    where: { name: opts.name, isTemplate: true, creatorId: opts.creatorId },
    select: { id: true, name: true },
  })
  if (existing) {
    console.log('SKIP_PROGRAM_EXISTS', existing.name, existing.id)
    return existing
  }
  const data: Prisma.ProgramCreateInput = {
    name: opts.name,
    description: opts.description,
    status: 'DRAFT',
    type: opts.type,
    isTemplate: true,
    weeks: 1,
    daysPerWeek: 1,
    flexibleSchedule: true,
    weeklyTarget: 7,
    creator: { connect: { id: opts.creatorId } },
    practiceId: opts.practiceId,
    exercises: {
      create: opts.items.map((it, i) => {
        const exId = opts.exerciseIdByName.get(it.exerciseName)
        if (!exId) throw new Error(`Missing exercise id for ${it.exerciseName}`)
        return {
          exercise: { connect: { id: exId } },
          week: 1,
          day: 1,
          order: i,
          sets: it.sets,
          reps: it.reps,
          repUnit: it.repUnit ?? 'reps',
          restTime: it.restTime ?? 60,
          notes: it.notes ?? null,
        }
      }),
    },
  }
  const created = await prisma.program.create({ data, select: { id: true, name: true } })
  console.log('CREATED_PROGRAM', created.name, created.id)
  return created
}

async function main() {
  const creator = await prisma.user.findFirst({
    where: { email: 'jurre@movementbasedtherapy.nl' },
    select: { id: true, name: true, practiceId: true, role: true },
  })
  if (!creator) throw new Error('Creator jurre@movementbasedtherapy.nl niet gevonden in DB')
  if (creator.role !== 'THERAPIST' && creator.role !== 'ADMIN') {
    throw new Error(`Creator heeft rol ${creator.role}, verwacht THERAPIST of ADMIN`)
  }
  console.log('CREATOR', creator.id, creator.name, 'practice=', creator.practiceId)

  const exerciseIdByName = new Map<string, string>()
  for (const spec of EXERCISES) {
    const ex = await ensureExercise(spec, creator.id, creator.practiceId)
    exerciseIdByName.set(spec.name, ex.id)
    console.log('EXERCISE_OK', ex.name, ex.id)
  }

  await ensureProgram({
    name: 'Schema A — Ochtend (liggend/zittend, 15 min)',
    description: 'Focus: rechter been activeren, circulatie. Vroege fase, liggend/zittend.',
    creatorId: creator.id,
    practiceId: creator.practiceId,
    type: 'MOBILITY',
    items: SCHEMA_A,
    exerciseIdByName,
  })

  await ensureProgram({
    name: 'Schema B — Middag (zittend/staand, 15 min)',
    description: 'Focus: bovenlichaam en functioneel. Vroege fase, zittend/staand met kruk.',
    creatorId: creator.id,
    practiceId: creator.practiceId,
    type: 'MOBILITY',
    items: SCHEMA_B,
    exerciseIdByName,
  })

  console.log('DONE')
}

main()
  .catch((err) => {
    console.error('FAIL', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
