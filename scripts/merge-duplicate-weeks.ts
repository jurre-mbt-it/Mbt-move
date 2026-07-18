/**
 * Merge duplicaat week-rijen: meerdere WeekSchedule-rijen van dezelfde patiënt
 * op dezelfde maandag (in prod tot 9 per week). Ontstaan doordat de planners
 * per losse dag-actie `weekSchedules.create` aanriepen; de kalender-clients
 * voegen ze visueel samen, maar server-side week-operaties (duplicateWeek,
 * "plak week") pakten er maar één — vandaar "plakt alleen maandag".
 *
 * Per (patiënt, maandag)-groep met >1 rij:
 *  - primaire rij = oudste createdAt (zelfde winnaar als de create-dedupe);
 *  - items van duplicaat-dagen verhuizen naar de primaire dag (append-order);
 *  - legacy day.programId en week-meta (fase/deload/targetLoad/weekNote)
 *    worden overgenomen als de primaire ze mist;
 *  - lege duplicaat-rijen worden verwijderd (dagen cascaden mee).
 *
 * Er wordt vóór het aanpassen een JSON-backup van de betrokken rijen
 * geschreven naar scripts/backups/.
 *
 * Gebruik:
 *   npx tsx scripts/merge-duplicate-weeks.ts           # dry-run (default)
 *   npx tsx scripts/merge-duplicate-weeks.ts --apply   # echt mergen
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { mondayKeyOf } from '../src/lib/week-dates'

config({ path: resolve(process.cwd(), '.env.local') })
const pool = new Pool({ connectionString: process.env.DIRECT_URL!, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
const APPLY = process.argv.includes('--apply')

async function main() {
  const weeks = await prisma.weekSchedule.findMany({
    where: { isTemplate: false, startDate: { not: null } },
    include: {
      days: {
        include: { items: { select: { id: true, order: true }, orderBy: { order: 'asc' } } },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Groepeer op (patiënt, maandag in NL-tijd).
  const groups = new Map<string, typeof weeks>()
  for (const w of weeks) {
    if (!w.patientId) continue
    const key = `${w.patientId}::${mondayKeyOf(w.startDate!)}`
    const arr = groups.get(key) ?? []
    arr.push(w)
    groups.set(key, arr)
  }

  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1)
  console.log(`${weeks.length} niet-template weken · ${dupGroups.length} maandagen met duplicaten`)
  if (dupGroups.length === 0) return

  // Backup van alles wat we gaan aanraken.
  if (APPLY) {
    const dir = resolve(process.cwd(), 'scripts/backups')
    mkdirSync(dir, { recursive: true })
    const file = resolve(dir, `merge-duplicate-weeks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(file, JSON.stringify(Object.fromEntries(dupGroups), null, 2))
    console.log(`Backup: ${file}`)
  }

  let movedItems = 0
  let deletedWeeks = 0

  for (const [key, arr] of dupGroups) {
    const [primary, ...dups] = arr // oudste eerst (orderBy createdAt asc)
    const label = `${key.slice(0, 8)}… ${key.split('::')[1]}`
    console.log(`\n■ ${label}: ${arr.length} rijen → primair ${primary.id} ("${primary.name}")`)

    // Per dayOfWeek: primaire dag-id + volgende order (append achter bestaande).
    const primDay = new Map(primary.days.map(d => [d.dayOfWeek, d]))
    const nextOrder = new Map(
      primary.days.map(d => [d.dayOfWeek, d.items.length ? Math.max(...d.items.map(i => i.order)) + 1 : 0]),
    )

    for (const dup of dups) {
      for (const day of dup.days) {
        const heeftInhoud = day.items.length > 0 || day.programId !== null
        if (!heeftInhoud) continue

        let prim = primDay.get(day.dayOfWeek)
        if (!prim) {
          console.log(`  dag ${day.dayOfWeek}: primaire dag ontbreekt → aanmaken`)
          if (APPLY) {
            const created = await prisma.weekScheduleDay.create({
              data: { id: `mrg_${dup.id.slice(0, 8)}_${day.dayOfWeek}`, weekScheduleId: primary.id, dayOfWeek: day.dayOfWeek },
              include: { items: true },
            })
            prim = { ...created, items: [] } as typeof day
            primDay.set(day.dayOfWeek, prim)
            nextOrder.set(day.dayOfWeek, 0)
          }
        }

        for (const it of day.items) {
          const ord = nextOrder.get(day.dayOfWeek) ?? 0
          console.log(`  dag ${day.dayOfWeek}: item ${it.id} → primaire dag (order ${ord})`)
          if (APPLY && prim) {
            await prisma.weekScheduleDayItem.update({ where: { id: it.id }, data: { dayId: prim.id, order: ord } })
          }
          nextOrder.set(day.dayOfWeek, ord + 1)
          movedItems++
        }

        if (day.programId && prim && !prim.programId) {
          console.log(`  dag ${day.dayOfWeek}: legacy programId ${day.programId} → primaire dag`)
          if (APPLY) {
            await prisma.weekScheduleDay.update({ where: { id: prim.id }, data: { programId: day.programId } })
          }
          prim.programId = day.programId
        }
      }

      // Week-meta overnemen als primair die mist.
      const meta: Record<string, unknown> = {}
      if (!primary.phaseType && dup.phaseType) meta.phaseType = dup.phaseType
      if (!primary.isDeload && dup.isDeload) meta.isDeload = true
      if (primary.targetLoad == null && dup.targetLoad != null) meta.targetLoad = dup.targetLoad
      if (!primary.weekNote && dup.weekNote) meta.weekNote = dup.weekNote
      if (Object.keys(meta).length > 0) {
        console.log(`  meta van ${dup.id} → primair: ${JSON.stringify(meta)}`)
        if (APPLY) await prisma.weekSchedule.update({ where: { id: primary.id }, data: meta })
        Object.assign(primary, meta)
      }

      console.log(`  verwijder duplicaat-rij ${dup.id} ("${dup.name}")`)
      if (APPLY) await prisma.weekSchedule.delete({ where: { id: dup.id } })
      deletedWeeks++
    }
  }

  console.log(`\n${APPLY ? 'KLAAR' : 'DRY-RUN'}: ${movedItems} items verplaatst, ${deletedWeeks} duplicaat-rijen ${APPLY ? 'verwijderd' : 'te verwijderen'}`)
  if (!APPLY) console.log('Draai met --apply om echt te mergen.')
}

main()
  .catch(e => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
