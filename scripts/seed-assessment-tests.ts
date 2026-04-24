/**
 * Seed 42 Ready State mobility assessment tests + mobilisatie-mapping.
 *
 * Per test worden 3 voorgestelde mobilisaties gekoppeld obv archetype →
 * bestaande Supple Leopard oefeningen (al in de exercise-catalog).
 *
 * Idempotent op `key`.
 */
import { PrismaClient, AssessmentArchetype, AssessmentTestType } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'
import { ASSESSMENT_TESTS } from './assessment-tests-data'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

/**
 * Per archetype: pool van exercise-namen (uit Supple Leopard + protocol-set)
 * die als mobilisatie-suggesties voor falende tests dienen. De eerste 3 matchende
 * exercises worden gekoppeld per test.
 */
const MOBILIZATION_POOL: Record<AssessmentArchetype, string[]> = {
  LUMBAR_SPINE: ['Psoas Smash and Floss', 'Low Back Mobilization', 'Oblique Mobilization', 'Bird dog', 'Dead bug'],
  SQUAT_HINGE: ['Couch Stretch', 'Banded Hip Distraction', '90/90 Hip Stretch', 'Quad Smash', 'Hamstring Smash and Floss'],
  PISTOL: ['Banded Calf Mobilization', 'Ankle Mobilization', 'Couch Stretch', 'Banded Hip Distraction', '90/90 Hip Stretch'],
  LUNGE: ['Couch Stretch', 'Banded Hip Extension Lunge', 'Banded Hip Distraction', 'Quad Smash', 'Forefoot Mobilization'],
  THORACIC_SPINE: ['T-Spine Roller Extension Smash', 'T-Spine Overhead Extension Smash', 'Trap Scrub', 'Bird dog', 'Dead bug'],
  OVERHEAD: [
    'T-Spine Overhead Extension Smash',
    'Lat Mobilization',
    'Banded Shoulder Distraction',
    'Pec Mobilization',
    'Anterior Shoulder Mob (PVC / Light Bar)',
  ],
  FRONT_RACK: [
    'Anterior Shoulder Mob (PVC / Light Bar)',
    'Pec Mobilization',
    'Banded Shoulder Distraction',
    'Lat Mobilization',
    'Wrist Distraction with Banded Flossing',
  ],
  PRESS: ['Pec Mobilization', 'Banded Shoulder Distraction', 'Triceps Extension Smash', 'Lat Mobilization', 'Serratus Smash'],
  HANG: ['Sleeper stretch', 'Lat Mobilization', 'Pec Mobilization', 'Banded Shoulder Distraction', 'Serratus Smash'],
  BREATHING: ['T-Spine Roller Extension Smash', 'First Rib Mobilization', 'Psoas Smash and Floss', 'Dead bug', 'Bird dog'],
}

async function main() {
  console.log(`Seeding ${ASSESSMENT_TESTS.length} assessment tests...`)

  // Preload alle public exercises by lowercase-name voor snelle lookup
  const allExercises = await prisma.exercise.findMany({
    where: { isPublic: true },
    select: { id: true, name: true },
  })
  const exerciseIdByName = new Map(allExercises.map((e) => [e.name.toLowerCase(), e.id]))

  let testsCreated = 0
  let testsUpdated = 0
  let mobsCreated = 0
  let mobsSkipped = 0

  for (const t of ASSESSMENT_TESTS) {
    const existing = await prisma.assessmentTest.findUnique({ where: { key: t.key } })
    const testRow = existing
      ? await prisma.assessmentTest.update({
          where: { id: existing.id },
          data: {
            archetype: t.archetype as AssessmentArchetype,
            testType: t.testType as AssessmentTestType,
            name: t.name,
            description: t.description,
            criteria: t.criteria,
            order: t.order,
          },
        })
      : await prisma.assessmentTest.create({
          data: {
            key: t.key,
            archetype: t.archetype as AssessmentArchetype,
            testType: t.testType as AssessmentTestType,
            name: t.name,
            description: t.description,
            criteria: t.criteria,
            order: t.order,
          },
        })
    if (existing) testsUpdated++
    else testsCreated++

    // Zet de 3 voorgestelde mobilisaties (replace — idempotent)
    await prisma.assessmentTestMobilization.deleteMany({ where: { testId: testRow.id } })
    const pool = MOBILIZATION_POOL[t.archetype as AssessmentArchetype] ?? []
    let order = 0
    for (const name of pool) {
      if (order >= 3) break
      const exId = exerciseIdByName.get(name.toLowerCase())
      if (!exId) {
        mobsSkipped++
        continue
      }
      await prisma.assessmentTestMobilization.create({
        data: { testId: testRow.id, exerciseId: exId, order },
      })
      order++
      mobsCreated++
    }
  }

  console.log(`Tests: ${testsCreated} created, ${testsUpdated} updated`)
  console.log(`Mobilizations: ${mobsCreated} created, ${mobsSkipped} skipped (exercise niet gevonden in DB)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
