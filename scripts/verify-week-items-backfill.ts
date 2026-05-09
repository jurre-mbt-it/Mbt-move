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
  const totalDays = await prisma.weekScheduleDay.count()
  const daysWithProgram = await prisma.weekScheduleDay.count({ where: { programId: { not: null } } })
  const totalItems = await prisma.weekScheduleDayItem.count()
  const itemsWithProgram = await prisma.weekScheduleDayItem.count({ where: { programId: { not: null } } })

  console.log(`week_schedule_days: ${totalDays} totaal, ${daysWithProgram} met programId`)
  console.log(`week_schedule_day_items: ${totalItems} totaal, ${itemsWithProgram} met programId`)

  // Check 1-op-1 mapping: elke dag met programId moet ten minste 1 item hebben
  const orphanDays = await prisma.weekScheduleDay.findMany({
    where: { programId: { not: null }, items: { none: {} } },
    select: { id: true, programId: true },
  })
  if (orphanDays.length === 0) {
    console.log('✅ Alle dagen met programId hebben minstens 1 item.')
  } else {
    console.log(`⚠ ${orphanDays.length} dagen met programId zonder item:`)
    for (const d of orphanDays.slice(0, 5)) console.log(`  • day ${d.id} → program ${d.programId}`)
  }
}
main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end() })
