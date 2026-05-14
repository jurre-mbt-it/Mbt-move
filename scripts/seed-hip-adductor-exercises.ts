/**
 * Eenmalig seed-script: voegt 11 oefeningen toe voor heup / adductor / glute /
 * core stabiliteit met realistische muscle-loads + parameters.
 *
 * Uitgevoerd als ADMIN — oefeningen worden globaal (`isPublic=true`) zonder
 * praktijk-scope. Variant-chain (Kopenhagen progressie) wordt in een tweede
 * pass gelegd zodat de IDs bestaan.
 *
 * Idempotent: skipt op exacte naam-match (case-insensitive).
 *
 * Run: npx tsx scripts/seed-hip-adductor-exercises.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
type BodyRegion = 'KNEE' | 'SHOULDER' | 'BACK' | 'ANKLE' | 'HIP' | 'FULL_BODY' | 'CERVICAL' | 'THORACIC' | 'LUMBAR' | 'ELBOW' | 'WRIST' | 'FOOT'
type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
type LoadType = 'BODYWEIGHT' | 'WEIGHTED' | 'MACHINE' | 'BAND'
type MovementPattern =
  | 'SQUAT' | 'LUNGE' | 'HINGE'
  | 'PUSH_HORIZONTAL' | 'PUSH_VERTICAL'
  | 'PULL_HORIZONTAL' | 'PULL_VERTICAL'
  | 'HIP_THRUST' | 'CALF_RAISE'
  | 'CORE' | 'ROTATION'
  | 'ISOLATION_UPPER' | 'ISOLATION_LOWER'
  | 'CARRY' | 'FULL_BODY'

type Spec = {
  name: string
  description: string
  category: Category
  bodyRegion: BodyRegion[]
  difficulty: Difficulty
  loadType: LoadType
  isUnilateral: boolean
  movementPattern: MovementPattern | null
  muscleLoads: Record<string, number>
  instructions: string[]
  tips: string[]
  tags: string[]
  /** Voor variant-chain in 2e pass — naam van een eerder gecreëerde oefening. */
  easierVariantName?: string
  harderVariantName?: string
}

const SPECS: Spec[] = [
  {
    name: 'Straight Leg Raise',
    description: 'Ruglig, één been gestrekt heffen tot ~30°. Activeert heupbuigers en quadriceps zonder belasting op de wervelkolom.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Hip Flexors': 4, 'Quadriceps': 3, 'Core': 2 },
    instructions: [
      'Ga op je rug liggen, één been gebogen, ander been gestrekt.',
      'Span je quadriceps aan en til het gestrekte been ~30° op.',
      'Houd 1-2 sec vast, laat gecontroleerd zakken.',
    ],
    tips: ['Houd onderrug plat tegen de mat.', 'Niet hoger dan ~30° — daarboven nemen heupbuigers het over.'],
    tags: ['heupbuiger', 'quadriceps', 'revalidatie', 'rugligging', 'rectus femoris'],
  },
  {
    name: 'Standing Side Abduction (Banded)',
    description: 'Staand been zijwaarts heffen met weerstandsband om de enkels. Gericht op gluteus medius en abductoren.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BAND',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Gluteus Medius': 5, 'Abductoren': 4, 'Core': 2 },
    instructions: [
      'Plaats een weerstandsband om je enkels.',
      'Sta rechtop, lichte bocht in standbeen.',
      'Hef het andere been zijwaarts, knie gestrekt.',
      'Laat gecontroleerd terug naar binnen, herhaal.',
    ],
    tips: ['Romp recht houden — niet leunen.', 'Beweging vanuit de heup, niet vanuit de heupkanteling.'],
    tags: ['glute med', 'abductie', 'zijwaarts heffen', 'band', 'heupspier'],
  },
  {
    name: 'Standing Glute Extension',
    description: 'Staand been naar achter strekken zonder rompbeweging. Activeert gluteus maximus en hamstrings.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Gluteus Maximus': 4, 'Glutes': 4, 'Hamstrings': 3, 'Core': 2 },
    instructions: [
      'Sta rechtop, eventueel licht houvast voor balans.',
      'Beweeg één been naar achter zonder romp te kantelen.',
      'Knijp de bil aan op het topmoment, kort vasthouden.',
      'Gecontroleerd terug, herhaal.',
    ],
    tips: ['Geen holle onderrug — gebruik de bil, niet de rug.', 'Korte ROM is voldoende voor maximale activatie.'],
    tags: ['glute', 'bilspier', 'heupextensie', 'staand', 'achterketen'],
  },
  {
    name: 'Standing Hip Flexion',
    description: 'Staand knie omhoog naar borsthoogte, gericht op iliopsoas en rectus femoris.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'ISOLATION_LOWER',
    muscleLoads: { 'Hip Flexors': 4, 'Psoas': 4, 'Iliacus': 3, 'Quadriceps': 2 },
    instructions: [
      'Sta rechtop, lichte bocht in standbeen.',
      'Til de knie actief op tot ~90° heupflexie.',
      'Korte pauze op het topmoment.',
      'Gecontroleerd terug, herhaal.',
    ],
    tips: ['Niet de rug kantelen — beweging vanuit de heup.', 'Bovenbeen parallel aan de grond is het doel.'],
    tags: ['heupbuiger', 'psoas', 'iliacus', 'heupflexie', 'knie heffen'],
  },
  {
    name: 'Psoas March',
    description: 'Ruglig, beide knieën in heup-/knieflexie (90/90), afwisselend één been laten zakken zonder onderrug te bewegen. Uithoudingsoefening voor de heupbuigers en core-stabiliteit.',
    category: 'STRENGTH',
    bodyRegion: ['HIP', 'LUMBAR'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    muscleLoads: { 'Psoas': 5, 'Iliacus': 4, 'Hip Flexors': 5, 'Core': 4, 'Transversus Abdominis': 3 },
    instructions: [
      'Ga op je rug liggen, beide knieën in 90/90 positie.',
      'Activeer transversus abdominis (kantel bekken licht).',
      'Laat één hak tot net boven de grond zakken en breng terug.',
      'Wissel been af, blijf rustig ademen.',
    ],
    tips: ['Houd de onderrug PLAT — als hij optilt, beperk de ROM.', 'Tempo is belangrijker dan range.'],
    tags: ['psoas', 'march', 'core', 'heupbuiger uithoudingsvermogen', '90/90'],
  },
  {
    name: 'Single Leg Hip Flexor Plank',
    description: 'Plankhouding met één been opgetild en heup in flexie. Combineert core-stabiliteit met isometrische heupbuiger-belasting.',
    category: 'STABILITY',
    bodyRegion: ['HIP', 'FULL_BODY'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    muscleLoads: { 'Hip Flexors': 4, 'Psoas': 3, 'Core': 5, 'Obliques': 4, 'Glutes': 3 },
    instructions: [
      'Ga in een onderarm-plank houding.',
      'Til één been ~30-45° op, knie kan licht gebogen.',
      'Houd de heupen vierkant t.o.v. de grond.',
      'Houd de positie isometrisch vast volgens prescriptie.',
    ],
    tips: ['Geen hangende heupen of opgetrokken billen.', 'Wissel zijden voor balans.'],
    tags: ['plank', 'core', 'heupbuiger', 'stabiliteit', 'isometric'],
  },
  {
    name: 'Kopenhagen Plank Short Lever (Isometric)',
    description: 'Adductor-isometric in zijwaartse plank-houding met onderste been gebogen (korte hefboom — minst zwaar van de Kopenhagen progressie).',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    muscleLoads: { 'Adductoren': 4, 'Core': 3, 'Obliques': 3, 'Glutes': 2 },
    instructions: [
      'Plaats het bovenste been (knie of bovenbeen) op een bank.',
      'Onderste been onder de bank, knie gebogen (korte hefboom).',
      'Ondersteun je romp op de onderarm.',
      'Houd het lichaam in een rechte lijn — isometrisch.',
    ],
    tips: ['Heupen recht naar voren — niet doorzakken.', 'Korte hefboom = minder load op de adductoren.'],
    tags: ['kopenhagen', 'adductor', 'isometric', 'zijplank', 'liesblessure'],
    harderVariantName: 'Kopenhagen Plank Long Lever (Isometric)',
  },
  {
    name: 'Kopenhagen Plank Long Lever (Isometric)',
    description: 'Adductor-isometric in zijwaartse plank-houding met onderste been gestrekt (lange hefboom — zwaarder dan short lever).',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    muscleLoads: { 'Adductoren': 5, 'Core': 4, 'Obliques': 4, 'Glutes': 3 },
    instructions: [
      'Plaats het bovenste been (enkel of voet) op een bank.',
      'Onderste been gestrekt, gesteund door de adductoren.',
      'Ondersteun je romp op de onderarm.',
      'Houd het lichaam in een rechte lijn — isometrisch.',
    ],
    tips: ['Hoe verder de voet ligt, hoe langer de hefboom en zwaarder.', 'Sleutelhouding bij liesblessure preventie.'],
    tags: ['kopenhagen', 'adductor', 'isometric', 'long lever', 'liesblessure'],
    easierVariantName: 'Kopenhagen Plank Short Lever (Isometric)',
    harderVariantName: 'Kopenhagen Plank Short Lever (Dynamic)',
  },
  {
    name: 'Kopenhagen Plank Short Lever (Dynamic)',
    description: 'Dynamische versie: onderste been omhoog/omlaag bewegen vanuit een korte-hefboom Kopenhagen positie.',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'INTERMEDIATE',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    muscleLoads: { 'Adductoren': 5, 'Core': 4, 'Obliques': 4, 'Glutes': 3 },
    instructions: [
      'Start in de short lever Kopenhagen plank positie.',
      'Hef het onderste been langzaam op tot het de bank raakt.',
      'Laat gecontroleerd zakken zonder de grond te raken.',
      'Herhaal volgens prescriptie.',
    ],
    tips: ['Beweging vanuit de adductoren, niet vanuit de heup zwaaien.', 'Stop bij verlies van rompvorm.'],
    tags: ['kopenhagen', 'adductor', 'dynamic', 'zijplank', 'liesblessure'],
    easierVariantName: 'Kopenhagen Plank Long Lever (Isometric)',
    harderVariantName: 'Kopenhagen Plank Long Lever (Dynamic)',
  },
  {
    name: 'Kopenhagen Plank Long Lever (Dynamic)',
    description: 'Zwaarste Kopenhagen-variant: dynamische beweging met gestrekte onderste been (lange hefboom).',
    category: 'STRENGTH',
    bodyRegion: ['HIP'],
    difficulty: 'ADVANCED',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: 'CORE',
    muscleLoads: { 'Adductoren': 5, 'Core': 5, 'Obliques': 4, 'Glutes': 3 },
    instructions: [
      'Start in de long lever Kopenhagen plank positie.',
      'Laat het onderste been zakken tot net boven de grond.',
      'Hef het terug op tot horizontaal of net erboven.',
      'Herhaal langzaam en gecontroleerd.',
    ],
    tips: ['Topvariant — alleen inzetten bij goede beheersing van de isometrische versie.', 'Liefst beperkte reps met hoge kwaliteit.'],
    tags: ['kopenhagen', 'adductor', 'dynamic', 'long lever', 'liesblessure', 'gevorderd'],
    easierVariantName: 'Kopenhagen Plank Short Lever (Dynamic)',
  },
  {
    name: 'Glute Stretch',
    description: 'Stretching voor de glutes en heup-externe rotatoren. Variant op figure-4 of pigeon stretch.',
    category: 'MOBILITY',
    bodyRegion: ['HIP'],
    difficulty: 'BEGINNER',
    loadType: 'BODYWEIGHT',
    isUnilateral: true,
    movementPattern: null,
    muscleLoads: { 'Glutes': 3, 'Gluteus Maximus': 3, 'Piriformis': 3, 'Hip External Rotators': 2 },
    instructions: [
      'Ga op je rug liggen, beide knieën gebogen.',
      'Plaats de enkel van het te stretchen been op de tegenoverliggende knie (figure-4).',
      'Trek het ondersteunende been naar je borst tot je rek in de bil voelt.',
      'Houd ~30 sec vast, wissel zijden.',
    ],
    tips: ['Houd onderrug plat tegen de mat.', 'Rek mag voelbaar zijn, niet pijnlijk.'],
    tags: ['glute stretch', 'piriformis', 'mobiliteit', 'heup rek', 'figure-4'],
  },
]

async function main() {
  const me = await prisma.user.findUnique({
    where: { email: 'jurre@movementbasedtherapy.nl' },
    select: { id: true, role: true, practiceId: true },
  })
  if (!me) throw new Error('Jurre niet gevonden — pas email aan in script')
  console.log(`Creator: ${me.id} (${me.role})`)
  const isAdmin = me.role === 'ADMIN'

  console.log(`\n— Pas 1: ${SPECS.length} oefeningen aanmaken —`)
  const createdIdByName = new Map<string, string>()
  let created = 0, skipped = 0
  for (const spec of SPECS) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: spec.name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) {
      console.log(`  = ${spec.name} bestaat al — skip`)
      createdIdByName.set(spec.name, existing.id)
      skipped++
      continue
    }
    const id = crypto.randomUUID()
    await prisma.exercise.create({
      data: {
        id,
        name: spec.name,
        description: spec.description,
        category: spec.category,
        bodyRegion: spec.bodyRegion,
        difficulty: spec.difficulty,
        loadType: spec.loadType,
        isUnilateral: spec.isUnilateral,
        movementPattern: spec.movementPattern,
        instructions: spec.instructions,
        tips: spec.tips,
        tags: spec.tags,
        isPublic: isAdmin,
        practiceId: isAdmin ? null : me.practiceId ?? null,
        createdById: me.id,
        muscleLoads: {
          create: Object.entries(spec.muscleLoads).map(([muscle, load]) => ({
            id: crypto.randomUUID(),
            muscle,
            load,
          })),
        },
      },
    })
    createdIdByName.set(spec.name, id)
    console.log(`  ✓ ${spec.name}`)
    created++
  }
  console.log(`Pas 1 klaar: ${created} aangemaakt, ${skipped} bestaand.`)

  console.log(`\n— Pas 2: variant-chain leggen voor Kopenhagen progressie —`)
  let linked = 0
  for (const spec of SPECS) {
    const id = createdIdByName.get(spec.name)
    if (!id) continue
    const easier = spec.easierVariantName ? createdIdByName.get(spec.easierVariantName) ?? null : null
    const harder = spec.harderVariantName ? createdIdByName.get(spec.harderVariantName) ?? null : null
    if (easier === null && harder === null) continue
    await prisma.exercise.update({
      where: { id },
      data: {
        easierVariantId: easier,
        harderVariantId: harder,
      },
    })
    console.log(`  ↔ ${spec.name}: easier=${easier ? '✓' : '-'} harder=${harder ? '✓' : '-'}`)
    linked++
  }
  console.log(`Pas 2 klaar: ${linked} variant-links gelegd.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
