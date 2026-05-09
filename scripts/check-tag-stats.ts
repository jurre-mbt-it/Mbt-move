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
  const total = await prisma.exercise.count()
  const taggedRows = await prisma.exercise.findMany({ select: { tags: true } })
  const tagged = taggedRows.filter(e => e.tags.length > 0)
  const tagCounts: number[] = tagged.map(e => e.tags.length)
  const avg = tagCounts.length ? (tagCounts.reduce((a, b) => a + b, 0) / tagCounts.length) : 0
  console.log(`Totaal oefeningen:    ${total}`)
  console.log(`Getagd:               ${tagged.length}  (${((tagged.length / total) * 100).toFixed(0)}%)`)
  console.log(`Niet getagd:          ${total - tagged.length}`)
  console.log(`Gem. tags/oefening:   ${avg.toFixed(1)}`)
  console.log(`\n5 voorbeelden van bestaande tags:`)
  const sample = await prisma.exercise.findMany({
    where: { tags: { isEmpty: false } },
    select: { name: true, tags: true },
    take: 5,
  })
  for (const ex of sample) console.log(`  • ${ex.name}\n    → [${ex.tags.join(', ')}]`)
}
main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
