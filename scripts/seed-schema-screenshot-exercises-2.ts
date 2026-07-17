/**
 * Seed de ontbrekende oefeningen uit het tweede aangeleverde schema
 * (screenshot 15-6 t/m 21-6). Van dat schema zat alles al in de library,
 * behalve één variant.
 *
 * Reeds aanwezig (overgeslagen): Deadlift (=Conventional Deadlift),
 * Overhead Press, Lying hamstring curl (=Lying Leg Curl (Machine)),
 * Dumbbell Chest Press, Rear delt fly machine (=Rear Delt Fly /
 * Reverse Pec Deck), Single Leg RDL, Hanging Leg Raise, Squats,
 * Pull ups (=Pull-Up), Leg Press, Leg Extension, Bicep curls cable
 * (=Cable Biceps Curl / Cable Curl), Hip Thrust (=Barbell Hip Thrust),
 * Landmine shoulder press (=Landmine Press), Reverse Lunge, Single arm
 * bent over row (=Dumbbell Row (single arm)), Abductor machine
 * (=Hip Abduction (Machine)), hardlopen (=Easy run / Kwaliteitsrun).
 *
 * Idempotent: skip als de naam (case-insensitive) al bestaat.
 * Run: `pnpm tsx scripts/seed-schema-screenshot-exercises-2.ts`
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

const NEW_EXERCISES = [
  {
    name: 'Close-Grip Lat Pulldown',
    description: 'Lat pulldown met nauwe (vaak neutrale) grip. Nadruk op de onderste latissimus en meer biceps-betrokkenheid dan de brede variant.',
    category: 'STRENGTH',
    bodyRegion: ['BACK'],
    difficulty: 'BEGINNER',
    loadType: 'MACHINE',
    isUnilateral: false,
    movementPattern: 'PULL_VERTICAL',
    tags: ['rug', 'lats', 'machine', 'close-grip'],
    instructions: ['Nauwe of neutrale grip op het handvat', 'Trek de stang/handvat naar de bovenborst', 'Houd de borst omhoog en de ellebogen langs het lichaam', 'Laat gecontroleerd terug'],
    muscleLoads: { Lats: 4, Biceps: 3, Bovenrug: 3, Onderarmen: 2 } as Record<string, number>,
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
