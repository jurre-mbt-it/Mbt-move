/**
 * Twee aanpassingen aan de assessment-catalog:
 *
 * 1. BREATHING-archetype tests verhuizen naar LUMBAR_SPINE (horen bij elkaar
 *    volgens de Ready State sheet).
 * 2. Twee nieuwe segmental-motion tests toevoegen aan LUMBAR_SPINE:
 *    - Standing Forward Roll-Down (segmentele flexie)
 *    - Standing Extension (segmentele extensie)
 *
 * Evidence-base:
 * - Sahrmann SA. Diagnosis and Treatment of Movement Impairment Syndromes
 *   (Mosby, 2002) — segmentele dominantie-patronen als basis voor classificatie
 *   van lumbale disfunctie.
 * - McGill SM. Low Back Disorders: Evidence-Based Prevention and Rehabilitation
 *   (Human Kinetics, 2015) — lumbale flexie/extensie patronen voorspellen
 *   blessure-risico.
 * - Van Dillen LR et al. Relationship between muscle function and impairment
 *   in low back pain. J Orthop Sports Phys Ther 2003 — beweeg-patroon
 *   subgroepen bij chronische lage rugklachten.
 * - Greenman PE. Principles of Manual Medicine (3rd ed, 2003) — segmentele
 *   motion palpation als klinische standaard voor identificatie van
 *   restricted levels.
 * - Hodges PW, Richardson CA. Inefficient muscular stabilization of the
 *   lumbar spine. Spine 1996;21(22):2640-2650 — lumbale segmentele controle
 *   bij bewegingsinitiatie.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

async function main() {
  // 1. Verplaats alle BREATHING archetype-tests naar LUMBAR_SPINE
  const breathingTests = await prisma.assessmentTest.findMany({
    where: { archetype: 'BREATHING' },
  })
  if (breathingTests.length > 0) {
    await prisma.assessmentTest.updateMany({
      where: { archetype: 'BREATHING' },
      data: { archetype: 'LUMBAR_SPINE' },
    })
    console.log(`${breathingTests.length} breathing-tests verhuisd naar LUMBAR_SPINE`)
  }

  // 2. Haal mobilizations op voor LUMBAR_SPINE pool (al geseed)
  const poolNames = [
    'Psoas Smash and Floss',
    'Low Back Mobilization',
    'Oblique Mobilization',
    'Bird dog',
    'Dead bug',
  ]
  const exercises = await prisma.exercise.findMany({
    where: {
      isPublic: true,
      name: { in: poolNames },
    },
    select: { id: true, name: true },
  })
  const exerciseIdByName = new Map(exercises.map((e) => [e.name.toLowerCase(), e.id]))

  // Find highest existing order in LUMBAR_SPINE + MOTOR_CONTROL for seamless appending
  const existing = await prisma.assessmentTest.findFirst({
    where: { archetype: 'LUMBAR_SPINE', testType: 'MOTOR_CONTROL' },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  let nextOrder = (existing?.order ?? -1) + 1

  // 3. Nieuwe tests toevoegen
  const newTests = [
    {
      key: 'standing-forward-roll-down-segmental-flexion',
      archetype: 'LUMBAR_SPINE' as const,
      testType: 'MOTOR_CONTROL' as const,
      name: 'Standing Forward Roll-Down (Segmentele Flexie)',
      description:
        'Patiënt staat rechtop met voeten op heupbreedte, armen ontspannen naast het lichaam. Cue: "Rol langzaam naar voren, laat je hoofd als eerste zakken, dan wervel voor wervel — alsof je je wervelkolom segment voor segment losmaakt". Observeer vanaf zij en achter. Vraag patiënt om daarna in dezelfde sequentiële manier weer terug te rollen (cascaderend van lumbaal → thoracaal → cervicaal). Minimaal 2-3 herhalingen voor consistente observatie.',
      criteria: [
        '• Soepele cascaderende beweging: cervicaal → thoracaal → lumbaal',
        '• Elk segment draagt evenredig bij (geen hinge-punten of blokken)',
        '• Geen zichtbare regionale restrictie (bv thoracolumbale junction die "blijft staan")',
        '• Ribkast blijft uitgelijnd met bekken tijdens de beweging',
        '• Ademhaling blijft rustig (geen breath-hold als compensatie)',
        '• Terugkomen gebeurt even gecontroleerd en symmetrisch als naar beneden',
      ].join('\n'),
      order: nextOrder++,
    },
    {
      key: 'standing-extension-segmental-extension',
      archetype: 'LUMBAR_SPINE' as const,
      testType: 'MOTOR_CONTROL' as const,
      name: 'Standing Extension (Segmentele Extensie)',
      description:
        'Patiënt staat rechtop met voeten op heupbreedte, handen op het os sacrum (of op de heupen). Cue: "Strek langzaam achterover, laat de beweging geleidelijk door de hele wervelkolom gaan". Observeer vanaf zij voor hinge-punten. Herhaal 2-3 keer. Stop bij pijn of duizeligheid. Let specifiek op disproportionele lumbale extensie (L5-hinge) — een veel voorkomende anti-archetype presentatie.',
      criteria: [
        '• Extensie verdeeld over cervicaal, thoracaal én lumbaal — geen enkel segment doet disproportioneel veel',
        '• Geen zichtbare lumbale hinge (bv L5 doet 80% van de beweging)',
        '• Thoracale extensie is waarneembaar (niet alleen lumbale kanteling)',
        '• Ribkast blijft uitgelijnd met bekken; geen voorwaartse ribkast-protrusie',
        '• Patiënt kan gecontroleerd terugkomen zonder balansverlies',
        '• Pijnvrij en symmetrisch (links-rechts observatie)',
      ].join('\n'),
      order: nextOrder++,
    },
  ]

  for (const t of newTests) {
    const existing = await prisma.assessmentTest.findUnique({ where: { key: t.key } })
    const testRow = existing
      ? await prisma.assessmentTest.update({
          where: { id: existing.id },
          data: {
            archetype: t.archetype,
            testType: t.testType,
            name: t.name,
            description: t.description,
            criteria: t.criteria,
            order: t.order,
          },
        })
      : await prisma.assessmentTest.create({
          data: {
            key: t.key,
            archetype: t.archetype,
            testType: t.testType,
            name: t.name,
            description: t.description,
            criteria: t.criteria,
            order: t.order,
          },
        })
    console.log(`${existing ? 'Updated' : 'Created'}: ${t.name}`)

    // Koppel 3 mobilisaties (lumbar-pool)
    await prisma.assessmentTestMobilization.deleteMany({ where: { testId: testRow.id } })
    let moOrder = 0
    for (const name of poolNames) {
      if (moOrder >= 3) break
      const exId = exerciseIdByName.get(name.toLowerCase())
      if (!exId) continue
      await prisma.assessmentTestMobilization.create({
        data: { testId: testRow.id, exerciseId: exId, order: moOrder },
      })
      moOrder++
    }
    console.log(`  → ${moOrder} mobilisaties gekoppeld`)
  }

  // Samenvatting
  const finalCount = await prisma.assessmentTest.groupBy({
    by: ['archetype'],
    _count: { _all: true },
    orderBy: { archetype: 'asc' },
  })
  console.log('\nEindstand per archetype:')
  finalCount.forEach((c) => console.log(`  ${c.archetype}: ${c._count._all}`))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
