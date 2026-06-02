/**
 * PREVIEW-demo: maakt een schema met echte video-oefeningen (4 weken × 2 dagen)
 * en koppelt het aan het product 'hardloop-kracht-beginner', zodat de
 * post-aankoop UI ("mijn programma's" + workout-player) echte inhoud toont.
 * Idempotent. Later vervangt Jurre dit door een echt schema via /admin/shop.
 *
 * Draaien:  npx tsx scripts/seed-demo-program.ts
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
const PROG_NAME = 'Hardloop Krachtschema (Beginner) — shop-demo'

async function main() {
  const product = await prisma.shopProduct.findUnique({ where: { slug: 'hardloop-kracht-beginner' } })
  if (!product) throw new Error('product hardloop-kracht-beginner niet gevonden')

  const creator = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'THERAPIST'] } },
    select: { id: true, practiceId: true },
  })
  if (!creator) throw new Error('geen admin/therapist user gevonden als creator')

  const exs = await prisma.exercise.findMany({
    where: { videoUrl: { not: null }, mediaType: 'YOUTUBE' },
    take: 10,
    orderBy: { createdAt: 'asc' },
  })
  if (exs.length < 4) throw new Error('te weinig video-oefeningen voor een demo')

  // Programma upsert op naam-marker.
  let program = await prisma.program.findFirst({ where: { name: PROG_NAME } })
  if (!program) {
    program = await prisma.program.create({
      data: {
        name: PROG_NAME,
        description: 'Demo-inhoud voor de shop-preview.',
        isTemplate: true,
        type: 'STRENGTH',
        status: 'ACTIVE',
        weeks: 4,
        daysPerWeek: 2,
        creatorId: creator.id,
        practiceId: creator.practiceId ?? undefined,
      },
    })
  } else {
    await prisma.program.update({ where: { id: program.id }, data: { weeks: 4, daysPerWeek: 2 } })
  }

  await prisma.programExercise.deleteMany({ where: { programId: program.id } })

  const half = Math.ceil(exs.length / 2)
  const days = [exs.slice(0, half), exs.slice(half)]
  const repsByWeek = [10, 12, 12, 15]

  const rows = [] as Array<{
    programId: string; exerciseId: string; week: number; day: number; order: number
    sets: number; reps: number; repUnit: string; restTime: number
  }>
  for (let w = 1; w <= 4; w++) {
    days.forEach((list, di) => {
      list.forEach((ex, idx) => {
        rows.push({
          programId: program!.id,
          exerciseId: ex.id,
          week: w,
          day: di + 1,
          order: idx,
          sets: 3,
          reps: repsByWeek[w - 1],
          repUnit: ex.defaultRepUnit ?? 'reps',
          restTime: 60,
        })
      })
    })
  }
  await prisma.programExercise.createMany({ data: rows })
  await prisma.shopProduct.update({ where: { id: product.id }, data: { programId: program.id } })

  console.log(`OK demo-programma "${PROG_NAME}" met ${rows.length} oefening-slots gekoppeld aan ${product.slug}.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
