/**
 * Seed de oefeningen uit het door Jurre aangeleverde trainingsschema
 * (screenshots, DAG 1-4). Alleen de oefeningen die nog NIET in de library
 * zaten worden aangemaakt; bestaande (evt. onder een andere spelling) worden
 * overgeslagen.
 *
 * Reeds aanwezig (overgeslagen) — voor de volledigheid gedocumenteerd:
 *   Lat Pulldown, Chest-Supported Row, Straight-Arm Pulldown,
 *   Leg Extension (machine), Face Pull, Dumbbell Curl (=Bicep Curl),
 *   Incline Dumbbell Curl, Dumbbell Shoulder Press,
 *   Pectoral machine (=Pec Deck / Butterfly), Dumbbell Lateral Raise
 *   (=Lateral Raise), Lunges (=Walking/Static Lunge), Romanian Deadlift,
 *   Rope Pushdown (=Triceps Pushdown), Chin-ups (=Chin-Up),
 *   Seated Cable Row, Shoulder Press (=Shoulder Press Machine),
 *   Cable Lateral Raise, Skull Crushers (=Skull Crusher), Hammer Curl,
 *   Preacher Curl, Overhead Cable Extension (=Overhead Triceps Extension),
 *   Incline (of) Preacher Curl (=Preacher Curl / Incline Dumbbell Curl).
 * "buik" is geen specifieke oefening en is genegeerd.
 *
 * Idempotent: skip als de naam (case-insensitive) al bestaat.
 * Run: `pnpm tsx scripts/seed-schema-screenshot-exercises.ts`
 */
import { PrismaClient, UserRole } from '@prisma/client'
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

type NewExercise = {
  name: string
  description: string
  category: 'STRENGTH'
  bodyRegion: string[]
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  loadType: 'BODYWEIGHT' | 'WEIGHTED' | 'MACHINE' | 'BAND'
  isUnilateral: boolean
  movementPattern: string
  trackOneRepMax?: boolean
  tags: string[]
  instructions: string[]
  muscleLoads: Record<string, number>
}

const NEW_EXERCISES: NewExercise[] = [
  {
    name: 'Weighted Pull-Up',
    description: 'Pull-up met extra gewicht (dip belt/dumbbell). Progressieve overload voor de rug wanneer bodyweight pull-ups te makkelijk worden.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'ADVANCED',
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'PULL_VERTICAL',
    trackOneRepMax: true,
    tags: ['rug', 'lats', 'compound', 'weighted'],
    instructions: ['Bevestig gewicht aan dip belt', 'Brede overhandse grip', 'Trek kin over de stang', 'Laat gecontroleerd zakken tot volledige extensie'],
    muscleLoads: { Lats: 5, Biceps: 3, Bovenrug: 3, Onderarmen: 3 },
  },
  {
    name: 'T-Bar Row',
    description: 'Bent-over row op een landmine/T-bar. Ondersteunt zware belasting voor de midden-rug met neutrale grip.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'INTERMEDIATE',
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'PULL_HORIZONTAL',
    tags: ['rug', 'row', 'compound'],
    instructions: ['Hinge voorover met rechte rug', 'Grijp het handvat neutraal', 'Trek naar de onderborst', 'Knijp schouderbladen samen en laat gecontroleerd zakken'],
    muscleLoads: { Bovenrug: 5, Lats: 4, Biceps: 3, 'Schouders posterieur': 2, Onderarmen: 3, Onderrug: 3 },
  },
  {
    name: 'Single-Arm Cable Row',
    description: 'Eenarmige kabel-row. Constante spanning door de ROM en corrigeert links-rechts asymmetrie.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: true,
    movementPattern: 'PULL_HORIZONTAL',
    tags: ['rug', 'row', 'kabel', 'unilateraal'],
    instructions: ['Grijp het handvat met één hand', 'Trek de elleboog langs het lichaam naar achter', 'Knijp het schouderblad samen', 'Laat gecontroleerd terug'],
    muscleLoads: { Bovenrug: 4, Lats: 4, Biceps: 3, Onderarmen: 2 },
  },
  {
    name: 'Wide-Grip Lat Pulldown',
    description: 'Lat pulldown met brede overhandse grip. Nadruk op de latissimus dorsi breedte.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_VERTICAL',
    tags: ['rug', 'lats', 'machine', 'wide-grip'],
    instructions: ['Brede overhandse grip op de stang', 'Trek de stang naar de bovenborst', 'Houd de borst omhoog', 'Laat gecontroleerd terug'],
    muscleLoads: { Lats: 5, Biceps: 2, Bovenrug: 3, Onderarmen: 2 },
  },
  {
    name: 'Incline Dumbbell Press',
    description: 'Schuine dumbbell press (30-45°). Nadruk op de bovenste (claviculaire) pectoralis en anterieure deltoid.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'INTERMEDIATE',
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'PUSH_HORIZONTAL',
    tags: ['borst', 'incline', 'bovenborst', 'dumbbell'],
    instructions: ['Bank op 30-45 graden', 'Dumbbells op borsthoogte', 'Druk omhoog tot bijna volledige extensie', 'Laat gecontroleerd zakken'],
    muscleLoads: { Borst: 4, 'Schouders anterieur': 4, Triceps: 3 },
  },
  {
    name: 'Front Raise',
    description: 'Frontale raise voor de anterieure deltoid. Isolatie-oefening voor de voorste schouder.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    tags: ['schouders', 'anterieur', 'isolatie'],
    instructions: ['Dumbbells voor de dijen', 'Hef gestrekt naar voren tot schouderhoogte', 'Laat gecontroleerd zakken'],
    muscleLoads: { 'Schouders anterieur': 4, Borst: 1 },
  },
  {
    name: 'Rear Delt Fly',
    description: 'Reverse fly voor de posterieure deltoid. Voorovergebogen of op een incline bank uitgevoerd; belangrijk voor schouderbalans en houding.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'WEIGHTED',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    tags: ['schouders', 'posterieur', 'isolatie', 'houding'],
    instructions: ['Hinge voorover of lig op een incline bank', 'Lichte buiging in de ellebogen', 'Open de armen zijwaarts tot schouderlijn', 'Knijp de schouderbladen samen'],
    muscleLoads: { 'Schouders posterieur': 4, Bovenrug: 3 },
  },
  {
    name: 'Cable Curl',
    description: 'Biceps curl aan de kabel. Constante spanning door de volledige ROM, ideaal voor drop sets.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    tags: ['biceps', 'isolatie', 'kabel'],
    instructions: ['Kabel op laagste stand met stang/handvat', 'Ellebogen langs het lichaam', 'Curl omhoog en knijp de biceps', 'Laat gecontroleerd terug'],
    muscleLoads: { Biceps: 4, Onderarmen: 2 },
  },
  // Op verzoek toegevoegd als aparte entry, naast de reeds bestaande varianten.
  {
    name: 'Overhead Cable Extension',
    description: 'Triceps extension boven het hoofd aan de kabel (rope). Constante spanning en nadruk op de lange triceps-kop door de gestrekte schouderpositie.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    tags: ['triceps', 'isolatie', 'kabel', 'overhead'],
    instructions: ['Kabel op lage stand, rope-handvat', 'Draai weg van de kabel, handen achter het hoofd', 'Strek de ellebogen volledig omhoog', 'Laat gecontroleerd terug tot rek op de triceps'],
    muscleLoads: { Triceps: 4 },
  },
  {
    name: 'Rope Pushdown',
    description: 'Triceps pushdown aan de kabel met rope-handvat. Spreid de uiteinden uiteen in het eindpunt voor extra triceps-contractie.',
    category: 'STRENGTH',
    bodyRegion: ['ELBOW'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'ISOLATION_UPPER',
    tags: ['triceps', 'isolatie', 'kabel', 'rope'],
    instructions: ['Kabel op hoge stand, rope-handvat', 'Ellebogen langs het lichaam gefixeerd', 'Duw omlaag en spreid de uiteinden', 'Laat gecontroleerd terug'],
    muscleLoads: { Triceps: 4 },
  },
  {
    name: 'Butterfly (Machine)',
    description: 'Pectoralis-isolatie op de butterfly/pec-deck machine. Constante spanning door de ROM voor borstcontractie.',
    category: 'STRENGTH',
    bodyRegion: ['SHOULDER'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PUSH_HORIZONTAL',
    tags: ['borst', 'isolatie', 'machine', 'butterfly', 'pec deck'],
    instructions: ['Rug tegen het kussen, onderarmen tegen de pads', 'Breng de armen samen voor de borst', 'Knijp de borst kort samen', 'Laat gecontroleerd openen tot lichte rek'],
    muscleLoads: { Borst: 4, 'Schouders anterieur': 2 },
  },
]

async function main() {
  const owner = await prisma.user.findFirst({
    where: { role: { in: [UserRole.ADMIN, UserRole.THERAPIST] } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  if (!owner) {
    console.error('Geen ADMIN of THERAPIST user gevonden om createdById op te zetten.')
    process.exit(1)
  }
  console.log(`Using owner: ${owner.email} (${owner.role})`)

  let created = 0
  let skipped = 0
  for (const ex of NEW_EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: ex.name, mode: 'insensitive' } },
      select: { id: true, name: true },
    })
    if (existing) {
      console.log(`Skipping "${ex.name}" — already exists`)
      skipped++
      continue
    }
    await prisma.exercise.create({
      data: {
        name: ex.name,
        description: ex.description,
        category: ex.category as never,
        bodyRegion: ex.bodyRegion as never,
        difficulty: ex.difficulty as never,
        loadType: ex.loadType as never,
        isUnilateral: ex.isUnilateral,
        movementPattern: ex.movementPattern as never,
        trackOneRepMax: ex.trackOneRepMax ?? false,
        instructions: ex.instructions,
        tags: ex.tags,
        isPublic: true,
        createdById: owner.id,
        muscleLoads: {
          create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({ muscle, load })),
        },
      },
    })
    console.log(`Created "${ex.name}"`)
    created++
  }
  console.log(`Done. Created ${created}, skipped ${skipped}.`)
}

main().finally(() => prisma.$disconnect())
