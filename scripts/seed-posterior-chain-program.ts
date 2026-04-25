/**
 * Seed: 6-weken programma "Posterieure keten — A/B split".
 *
 * Sessie A — hamstring-dominant.
 * Sessie B — full chain compound.
 *
 * Idempotent:
 *   - Oefeningen worden case-insensitive gematcht op naam; nieuwe worden
 *     aangemaakt, bestaande blijven ongemoeid.
 *   - Het programma-template wordt geüpsert op naam.
 *
 * Run:
 *   npx tsx scripts/seed-posterior-chain-program.ts
 */
import { PrismaClient, UserRole, ExerciseCategory, BodyRegion, LoadType, MovementPattern, ProgramStatus } from '@prisma/client'
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

type ExerciseDef = {
  name: string
  description: string
  category: ExerciseCategory
  bodyRegion: BodyRegion[]
  loadType: LoadType
  isUnilateral: boolean
  movementPattern: MovementPattern | null
  instructions: string[]
  muscleLoads: Record<string, number>
  tags: string[]
}

const EXERCISES: ExerciseDef[] = [
  // ─── Sessie A ────────────────────────────────────────────────────────────
  {
    name: 'Romanian Deadlift (barbell)',
    description: 'Hip-hinge met barbell, hamstring-dominant. Romp parallel houden.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'LUMBAR'],
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'HINGE',
    instructions: [
      'Begin staand met barbell tegen de heupen',
      'Hinge vanuit de heup — knieën licht gebogen, niet doorzakken',
      'Laat de bar langs de benen zakken tot mid-shin',
      '3 seconden gecontroleerde excentriek',
      'Krachtige extensie terug naar staand',
    ],
    muscleLoads: { Hamstrings: 5, Glutes: 4, Onderrug: 3, Bovenrug: 2 },
    tags: ['hamstring', 'hinge', 'compound'],
  },
  {
    name: 'GHD Hamstring Curl',
    description: 'Hamstring curl op GHD — knie-flexie met heup gefixeerd.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: null,
    instructions: [
      'Plaats voeten onder de pads, knieën op de pad',
      'Romp gestrekt en strak',
      'Maximaal excentrische controle naar beneden',
      'Gecontroleerd terug naar startpositie',
    ],
    muscleLoads: { Hamstrings: 5, Glutes: 2, Calves: 2 },
    tags: ['hamstring', 'eccentric', 'isolation'],
  },
  {
    name: 'Barbell Hip Thrust',
    description: 'Hip-extensie tegen weerstand met bovenrug op bank.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'HINGE',
    instructions: [
      'Bovenrug tegen bank, voeten plat op de grond',
      'Bar op de heup-vouw met pad',
      'Knijp glutes en strek volledig naar boven',
      'Gecontroleerd zakken',
    ],
    muscleLoads: { Glutes: 5, Hamstrings: 3, Core: 2 },
    tags: ['glutes', 'hinge'],
  },
  {
    name: 'Single Leg RDL (dumbbell)',
    description: 'Single-leg hip hinge met dumbbell — balans + hamstring.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    loadType: 'WEIGHTED',
    isUnilateral: true,
    movementPattern: 'HINGE',
    instructions: [
      'Staand op één been, dumbbell in tegenovergestelde hand',
      'Hinge vanuit heup, achterste been blijft in lijn met romp',
      '3 seconden gecontroleerde excentriek',
      'Druk door de hiel terug omhoog',
    ],
    muscleLoads: { Hamstrings: 4, Glutes: 4, Core: 3 },
    tags: ['unilateral', 'balance', 'hamstring'],
  },
  {
    name: 'Single Leg Calf Raise',
    description: 'Kuit-flexie op één been, full ROM met excentriek.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: null,
    instructions: [
      'Sta op de bal van één voet op een rand',
      'Volledige strekking omhoog',
      '3 seconden gecontroleerde excentriek',
      'Volledige stretch onderin',
    ],
    muscleLoads: { Calves: 5 },
    tags: ['calves', 'unilateral'],
  },
  {
    name: 'Pallof Press (band)',
    description: 'Anti-rotatie core stability met elastiek.',
    category: 'STABILITY',
    bodyRegion: ['LUMBAR', 'FULL_BODY'],
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: null,
    instructions: [
      'Sta zijdelings van het ankerpunt, band op borsthoogte',
      'Druk de band recht voor je uit',
      'Weersta de rotatiekracht — heupen en schouders blijven gericht',
      'Gecontroleerd terug',
    ],
    muscleLoads: { Core: 5 },
    tags: ['anti-rotation', 'core', 'stability'],
  },

  // ─── Sessie B ────────────────────────────────────────────────────────────
  {
    name: 'Conventionele Deadlift (barbell)',
    description: 'Klassieke deadlift — heup + knie extensie tegelijk.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'LUMBAR'],
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'HINGE',
    instructions: [
      'Voeten heup-breedte, bar over mid-foot',
      'Hinge en pak de bar — schouders iets voor de bar',
      'Romp strak, neutrale rug',
      'Explosief omhoog door heup en knieën',
      '3 seconden gecontroleerde excentriek',
    ],
    muscleLoads: { Hamstrings: 4, Glutes: 5, Onderrug: 4, Bovenrug: 3, Quadriceps: 2 },
    tags: ['compound', 'hinge', 'powerlift'],
  },
  {
    name: 'Bulgarian Split Squat (dumbbells)',
    description: 'Single-leg squat met achterste voet verhoogd.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'KNEE'],
    loadType: 'WEIGHTED',
    isUnilateral: true,
    movementPattern: 'LUNGE',
    instructions: [
      'Achterste voet op bank, voorste voet ver genoeg om verticaal scheenbeen te krijgen',
      'Dumbbells langs het lichaam',
      'Zak recht omlaag, knie boven de tweede teen',
      'Druk door de hiel van het voorste been omhoog',
    ],
    muscleLoads: { Quadriceps: 4, Glutes: 4, Hamstrings: 3, Core: 2 },
    tags: ['unilateral', 'squat', 'lunge'],
  },
  {
    name: 'Nordic Hamstring Curl',
    description: 'Pure excentrische hamstring-belasting — knee flexor breaking.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    loadType: 'BODYWEIGHT',
    isUnilateral: false,
    movementPattern: null,
    instructions: [
      'Knielend, enkels gefixeerd onder pad of door partner',
      'Romp en heup gestrekt — beweging puur in de knie',
      'Laat jezelf langzaam zakken naar voren',
      'Maximaal excentrisch — vang jezelf op met de handen indien nodig',
    ],
    muscleLoads: { Hamstrings: 5 },
    tags: ['eccentric', 'hamstring', 'injury-prevention'],
  },
  {
    name: 'Kettlebell Swing (bilateraal)',
    description: 'Heup-driven swing met kettlebell — explosief.',
    category: 'PLYOMETRICS',
    bodyRegion: ['HIP', 'FULL_BODY'],
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'HINGE',
    instructions: [
      'Kettlebell tussen de voeten, hinge en pak met beide handen',
      'Snap heupen explosief naar voren — bel zwaait door',
      'Geen squat — de kracht komt uit de heup',
      'Laat de bel terug zwaaien tussen de benen',
    ],
    muscleLoads: { Glutes: 5, Hamstrings: 4, Core: 3, Onderrug: 3 },
    tags: ['power', 'hinge', 'conditioning'],
  },
  {
    name: 'Single Leg Glute Bridge (banded)',
    description: 'Single-leg bridge met elastiek om de knieën — abductie + extensie.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: 'HINGE',
    instructions: [
      'Lig op de rug, band om de knieën',
      'Eén voet plat, andere been gestrekt',
      'Druk knieën uit elkaar tegen de band',
      'Strek de heup volledig — knijp glute',
    ],
    muscleLoads: { Glutes: 5, Hamstrings: 3, Core: 2 },
    tags: ['unilateral', 'glutes', 'activation'],
  },
  {
    name: 'Seated Calf Raise (dumbbell)',
    description: 'Soleus-focus calf raise zittend met dumbbell op de knie.',
    category: 'STRENGTH',
    bodyRegion: ['ANKLE', 'FOOT'],
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: null,
    instructions: [
      'Zit op een bank, voeten plat, ballen van de voet op een verhoging',
      'Dumbbell verticaal op de knie',
      'Druk omhoog door de bal van de voet',
      '2 seconden gecontroleerde excentriek',
    ],
    muscleLoads: { Calves: 5 },
    tags: ['calves', 'soleus', 'isolation'],
  },
]

type Block = {
  exerciseName: string
  sets: number
  reps: number
  repUnit: string
  restTime: number
  notes: string | null
  supersetGroup?: string
}

const SESSIE_A: Block[] = [
  { exerciseName: 'Romanian Deadlift (barbell)', sets: 4, reps: 6, repUnit: 'reps', restTime: 120, notes: '3 sec neer, zwaar' },
  { exerciseName: 'GHD Hamstring Curl', sets: 4, reps: 6, repUnit: 'reps', restTime: 90, notes: 'maximaal excentrisch, gecontroleerd terug' },
  { exerciseName: 'Barbell Hip Thrust', sets: 3, reps: 10, repUnit: 'reps', restTime: 90, notes: 'volledig strekken' },
  { exerciseName: 'Single Leg RDL (dumbbell)', sets: 3, reps: 8, repUnit: 'reps/zijde', restTime: 60, notes: '3 sec neer' },
  { exerciseName: 'Single Leg Calf Raise', sets: 3, reps: 12, repUnit: 'reps/zijde', restTime: 45, notes: '3 sec neer, volledig strekken omhoog' },
  { exerciseName: 'Pallof Press (band)', sets: 3, reps: 12, repUnit: 'reps/zijde', restTime: 45, notes: null },
]

const SESSIE_B: Block[] = [
  { exerciseName: 'Conventionele Deadlift (barbell)', sets: 4, reps: 5, repUnit: 'reps', restTime: 150, notes: 'explosief omhoog, 3 sec neer' },
  { exerciseName: 'Bulgarian Split Squat (dumbbells)', sets: 3, reps: 8, repUnit: 'reps/zijde', restTime: 90, notes: null },
  { exerciseName: 'Nordic Hamstring Curl', sets: 3, reps: 5, repUnit: 'reps', restTime: 90, notes: 'puur excentrisch' },
  { exerciseName: 'Kettlebell Swing (bilateraal)', sets: 4, reps: 10, repUnit: 'reps', restTime: 60, notes: 'explosief' },
  { exerciseName: 'Single Leg Glute Bridge (banded)', sets: 3, reps: 12, repUnit: 'reps/zijde', restTime: 45, notes: null },
  { exerciseName: 'Seated Calf Raise (dumbbell)', sets: 3, reps: 15, repUnit: 'reps', restTime: 45, notes: 'soleus focus, 2 sec neer' },
]

const PROGRAM_NAME = 'Posterieure keten — A/B split (6 weken)'
const PROGRAM_DESCRIPTION =
  'Hamstring + glute focus, 2 sessies per week. Sessie A: hamstring-dominant. Sessie B: full chain compound. Progressie via belasting (gewicht omhoog bij goede techniek).'

async function main() {
  // 1. Eigenaar (therapeut) zoeken
  const owner = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'jurre@movementbasedtherapy.nl' },
        { role: { in: [UserRole.ADMIN, UserRole.THERAPIST] } },
      ],
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  if (!owner) {
    console.error('Geen ADMIN of THERAPIST user gevonden.')
    process.exit(1)
  }
  console.log(`Owner: ${owner.email} (${owner.role})`)

  // 2. Oefeningen — alleen ontbrekende toevoegen
  const exerciseIdByName = new Map<string, string>()
  let created = 0
  let existing = 0

  for (const ex of EXERCISES) {
    const found = await prisma.exercise.findFirst({
      where: { name: { equals: ex.name, mode: 'insensitive' } },
    })
    if (found) {
      existing++
      exerciseIdByName.set(ex.name.toLowerCase(), found.id)
      continue
    }
    const newEx = await prisma.exercise.create({
      data: {
        name: ex.name,
        description: ex.description,
        category: ex.category,
        bodyRegion: ex.bodyRegion,
        loadType: ex.loadType,
        isUnilateral: ex.isUnilateral,
        movementPattern: ex.movementPattern,
        instructions: ex.instructions,
        tags: ex.tags,
        isPublic: true,
        createdById: owner.id,
        muscleLoads: {
          create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({ muscle, load })),
        },
      },
    })
    exerciseIdByName.set(ex.name.toLowerCase(), newEx.id)
    created++
  }
  console.log(`Oefeningen: ${created} nieuw, ${existing} al aanwezig`)

  // 3. Programma-template upserten op naam (per owner)
  const existingProgram = await prisma.program.findFirst({
    where: { name: PROGRAM_NAME, creatorId: owner.id, isTemplate: true },
  })
  if (existingProgram) {
    // Verwijder bestaande exercises zodat we kunnen herbouwen
    await prisma.programExercise.deleteMany({ where: { programId: existingProgram.id } })
    await prisma.program.delete({ where: { id: existingProgram.id } })
    console.log('Bestaand template verwijderd — wordt opnieuw opgebouwd.')
  }

  const program = await prisma.program.create({
    data: {
      name: PROGRAM_NAME,
      description: PROGRAM_DESCRIPTION,
      type: 'STRENGTH',
      status: ProgramStatus.DRAFT,
      isTemplate: true,
      weeks: 6,
      daysPerWeek: 2,
      trackOneRepMax: true,
      creatorId: owner.id,
      practiceId: owner.practiceId,
    },
  })
  console.log(`Programma aangemaakt: ${program.id}`)

  // 4. ProgramExercise rijen — 6 weken × (Sessie A op dag 1, Sessie B op dag 2)
  const rows: Array<{
    programId: string
    exerciseId: string
    week: number
    day: number
    order: number
    sets: number
    reps: number
    repUnit: string
    restTime: number
    notes: string | null
    supersetGroup: string | null
    supersetOrder: number
  }> = []

  for (let week = 1; week <= 6; week++) {
    SESSIE_A.forEach((b, i) => {
      const exId = exerciseIdByName.get(b.exerciseName.toLowerCase())
      if (!exId) throw new Error(`Oefening niet gevonden: ${b.exerciseName}`)
      rows.push({
        programId: program.id,
        exerciseId: exId,
        week,
        day: 1,
        order: i,
        sets: b.sets,
        reps: b.reps,
        repUnit: b.repUnit,
        restTime: b.restTime,
        notes: b.notes,
        supersetGroup: b.supersetGroup ?? null,
        supersetOrder: 0,
      })
    })
    SESSIE_B.forEach((b, i) => {
      const exId = exerciseIdByName.get(b.exerciseName.toLowerCase())
      if (!exId) throw new Error(`Oefening niet gevonden: ${b.exerciseName}`)
      rows.push({
        programId: program.id,
        exerciseId: exId,
        week,
        day: 2,
        order: i,
        sets: b.sets,
        reps: b.reps,
        repUnit: b.repUnit,
        restTime: b.restTime,
        notes: b.notes,
        supersetGroup: b.supersetGroup ?? null,
        supersetOrder: 0,
      })
    })
  }

  await prisma.programExercise.createMany({ data: rows })
  console.log(`ProgramExercises: ${rows.length} rijen aangemaakt (6 weken × 2 dagen × 6 oefeningen)`)
  console.log(`\n✓ Klaar. Template "${PROGRAM_NAME}" staat in de bibliotheek voor ${owner.email}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
