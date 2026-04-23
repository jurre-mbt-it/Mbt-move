/**
 * Seed ONLY the new sport-specific exercises (10 rijen) tegen productie DB.
 * Laat demo-users (admin@mbtmove.com etc) ongemoeid.
 *
 * Idempotent — upserts by name (case-insensitive).
 */
import { PrismaClient, UserRole, ExerciseCategory, BodyRegion, LoadType, MovementPattern } from '@prisma/client'
import { STANDARD_EXERCISES } from '../prisma/seed-exercises'
import { PROGRESSION_CHAINS } from '../prisma/exercise-progressions'
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

// Alleen deze 10 namen (de sport-specifieke aanvullingen) komen in aanmerking.
const NEW_NAMES = new Set([
  'Static lunge',
  'Trapbar deadlift',
  'Sled push',
  'Sled pull',
  'Sled drag',
  'Triple extension hip lock drill',
  'Kettlebell deadlift',
  'Suitcase deadlift',
  'Single arm kettlebell deadlift',
  'Banded superman',
].map((n) => n.toLowerCase()))

async function main() {
  // Zoek een admin-user om als createdById te gebruiken. Als er geen admin is,
  // pakken we de eerste THERAPIST. Als er geen van beide is, faal.
  const owner = await prisma.user.findFirst({
    where: { role: { in: [UserRole.ADMIN, UserRole.THERAPIST] } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  if (!owner) {
    console.error('Geen ADMIN of THERAPIST user gevonden om createdById op te zetten.')
    process.exit(1)
  }
  console.log(`Using owner: ${owner.email} (${owner.role})`)

  const candidates = STANDARD_EXERCISES.filter((e) => NEW_NAMES.has(e.name.toLowerCase()))
  console.log(`Found ${candidates.length} candidate exercises in seed file.`)

  let created = 0
  let updated = 0
  for (const ex of candidates) {
    const existing = await prisma.exercise.findFirst({
      where: { name: { equals: ex.name, mode: 'insensitive' } },
    })
    if (existing) {
      // Alleen bijwerken als we de creator zijn (voorkom overschrijven user-created)
      if (existing.createdById === owner.id) {
        await prisma.muscleLoad.deleteMany({ where: { exerciseId: existing.id } })
        await prisma.exercise.update({
          where: { id: existing.id },
          data: {
            description: ex.description,
            category: ex.category as ExerciseCategory,
            bodyRegion: ex.bodyRegion as BodyRegion[],
            difficulty: ex.difficulty as never,
            loadType: ex.loadType as LoadType,
            isUnilateral: ex.isUnilateral,
            movementPattern: ex.movementPattern as MovementPattern | null,
            instructions: ex.instructions,
            tags: ex.tags,
            muscleLoads: {
              create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({
                muscle,
                load,
              })),
            },
          },
        })
        updated++
      } else {
        console.log(`Skipping "${ex.name}" — owned by someone else`)
      }
    } else {
      await prisma.exercise.create({
        data: {
          name: ex.name,
          description: ex.description,
          category: ex.category as ExerciseCategory,
          bodyRegion: ex.bodyRegion as BodyRegion[],
          difficulty: ex.difficulty as never,
          loadType: ex.loadType as LoadType,
          isUnilateral: ex.isUnilateral,
          movementPattern: ex.movementPattern as MovementPattern | null,
          instructions: ex.instructions,
          tags: ex.tags,
          isPublic: true,
          createdById: owner.id,
          muscleLoads: {
            create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({
              muscle,
              load,
            })),
          },
        },
      })
      created++
    }
  }
  console.log(`Exercises: ${created} created, ${updated} updated`)

  // Progression links (alleen voor deze 10)
  const allExercises = await prisma.exercise.findMany({
    where: { isPublic: true },
    select: { id: true, name: true },
  })
  const byName = new Map(allExercises.map((e) => [e.name.toLowerCase(), e.id]))

  let linksCreated = 0
  for (const chain of PROGRESSION_CHAINS) {
    // Alleen ketens waar minstens één van de nieuwe oefeningen in voorkomt
    const isNewChain = chain.some((n) => NEW_NAMES.has(n.toLowerCase()))
    if (!isNewChain) continue

    for (let i = 0; i < chain.length; i++) {
      const currentId = byName.get(chain[i].toLowerCase())
      if (!currentId) continue
      const easierId = i > 0 ? byName.get(chain[i - 1].toLowerCase()) ?? null : null
      const harderId = i < chain.length - 1 ? byName.get(chain[i + 1].toLowerCase()) ?? null : null
      await prisma.exercise.update({
        where: { id: currentId },
        data: {
          easierVariantId: easierId,
          harderVariantId: harderId,
        },
      })
      linksCreated++
    }
  }
  console.log(`Progression links: ${linksCreated} configured`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
