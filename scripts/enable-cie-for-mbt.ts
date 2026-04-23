/**
 * Enable CIE (cieEnabled=true) for "Movement Based Therapy" practice.
 * Idempotent.
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

async function main() {
  const practices = await prisma.practice.findMany({
    where: {
      OR: [
        { name: { contains: 'Movement Based Therapy', mode: 'insensitive' } },
        { name: { contains: 'MBT', mode: 'insensitive' } },
      ],
    },
  })
  if (practices.length === 0) {
    console.log('Geen Movement Based Therapy / MBT praktijk gevonden. Niets gewijzigd.')
    return
  }
  for (const p of practices) {
    await prisma.practice.update({
      where: { id: p.id },
      data: { cieEnabled: true },
    })
    console.log(`CIE enabled for practice: ${p.name} (${p.id})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
