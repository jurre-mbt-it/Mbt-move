import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local'), override: true })
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const muscles = await prisma.muscleLoad.findMany({
    select: { muscle: true },
    distinct: ['muscle'],
    orderBy: { muscle: 'asc' },
  })
  console.log('Unieke muscle-namen in DB:')
  for (const m of muscles) console.log('  ', m.muscle)

  const sample = await prisma.exercise.findMany({
    where: { OR: [
      { name: { contains: 'glute', mode: 'insensitive' } },
      { name: { contains: 'hip', mode: 'insensitive' } },
      { name: { contains: 'kopen', mode: 'insensitive' } },
      { name: { contains: 'adduct', mode: 'insensitive' } },
    ] },
    include: { muscleLoads: { select: { muscle: true, load: true } } },
    take: 8,
  })
  console.log('\nBestaande hip/glute/adductor oefeningen:')
  for (const ex of sample) {
    console.log(`\n  ${ex.name} (${ex.category}, ${ex.difficulty}, regions=${ex.bodyRegion.join('/')}, mvtP=${ex.movementPattern ?? '-'}, unilat=${ex.isUnilateral})`)
    for (const ml of ex.muscleLoads) console.log(`    ${ml.muscle}: ${ml.load}`)
  }
}
main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
