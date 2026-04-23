import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const pool = new Pool({ connectionString: process.env.DIRECT_URL!, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const all = await prisma.practice.findMany()
  console.log('Practices:', all.length)
  all.forEach((p) => console.log(' -', p.id, p.name, 'cieEnabled=', p.cieEnabled))
}

main().finally(() => prisma.$disconnect())
