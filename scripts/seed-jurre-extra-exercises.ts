/**
 * Seed ONLY de 5 nieuwe oefeningen die Jurre op 2026-05-18 vroeg:
 *   - Air Squat
 *   - Squat met Mini Band
 *   - Hamstring Bridge
 *   - Single Leg Hamstring Bridge
 *   - Standing Side Abduction
 *
 * (Clamshell uit zijn lijst bestaat al — daarom 5 i.p.v. 6.)
 *
 * Idempotent: skip als naam al bestaat. Laat andere oefeningen ongemoeid.
 * Run: `pnpm tsx scripts/seed-jurre-extra-exercises.ts`
 */
import { PrismaClient, UserRole, ExerciseCategory, BodyRegion, LoadType, MovementPattern } from '@prisma/client'
import { STANDARD_EXERCISES } from '../prisma/seed-exercises'
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

const NEW_NAMES = new Set([
  'Air Squat',
  'Squat met Mini Band',
  'Hamstring Bridge',
  'Single Leg Hamstring Bridge',
  'Standing Side Abduction',
].map((n) => n.toLowerCase()))

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

  const candidates = STANDARD_EXERCISES.filter((e) => NEW_NAMES.has(e.name.toLowerCase()))
  console.log(`Found ${candidates.length} candidate exercises in seed file.`)

  let created = 0
  let skipped = 0
  for (const ex of candidates) {
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
        category: ex.category as ExerciseCategory,
        bodyRegion: ex.bodyRegion as BodyRegion[],
        difficulty: ex.difficulty as never,
        loadType: ex.loadType as LoadType,
        isUnilateral: ex.isUnilateral,
        movementPattern: ex.movementPattern as MovementPattern | null,
        instructions: ex.instructions,
        tags: ex.tags,
        isPublic: true,
        defaultRepUnit: ex.defaultRepUnit ?? 'reps',
        defaultExtraParams: (ex.defaultExtraParams ?? []) as unknown as object,
        createdById: owner.id,
        muscleLoads: {
          create: Object.entries(ex.muscleLoads).map(([muscle, load]) => ({
            muscle,
            load,
          })),
        },
      },
    })
    console.log(`Created "${ex.name}"`)
    created++
  }
  console.log(`Done. Created ${created}, skipped ${skipped}.`)
}

main().finally(() => prisma.$disconnect())
