/**
 * Tijd-in-zone afleiden uit de opgeslagen hartslagcurve.
 *
 * De HealthKit-brug heeft `timeInZones` nooit meegestuurd, en Strava stuurt het
 * ook niet. Op 297 activiteiten stonden er zes gevuld. Gevolg: `edwardsTrimp`
 * gaf overal null, het TRIMP-deel van de belastingscurve stond in de praktijk
 * uit, en de zone-uitsplitsing op het activiteiten- en trainingsscherm rendert
 * niet omdat er niets te tonen is.
 *
 * Sinds 2026-08-23 leidt de ingest het zelf af uit `series`. Dit script doet
 * datzelfde met terugwerkende kracht, via exact dezelfde functie, zodat oude en
 * nieuwe rijen dezelfde zone-regels volgen.
 *
 * Draaien:
 *   npx tsx scripts/backfill-time-in-zones.ts            # droogloop
 *   npx tsx scripts/backfill-time-in-zones.ts --apply    # wegschrijven
 *
 * Rijen die al tijd-in-zone hebben blijven ongemoeid: een meting van de bron
 * wint van onze afleiding.
 */
import { existsSync } from 'node:fs'

import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { zonesFromSeries } from '../src/server/wearables/ingest'
import { edwardsTrimp } from '../src/lib/training-load'

const APPLY = process.argv.includes('--apply')

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL of DATABASE_URL ontbreekt')
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  const rijen = await prisma.cardioLog.findMany({
    where: { timeInZones: { equals: Prisma.DbNull }, NOT: { series: { equals: Prisma.DbNull } } },
    select: { id: true, patientId: true, series: true, activity: true, completedAt: true },
    orderBy: { completedAt: 'asc' },
  })
  console.log(`${rijen.length} rij(en) met een curve maar zonder tijd-in-zone.`)

  // HR-profiel per patiënt; zones hangen van de max-hartslag af.
  const patientIds = [...new Set(rijen.map((r) => r.patientId))]
  const profielen = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, maxHeartRate: true, restingHeartRate: true, dateOfBirth: true },
      })
    ).map((u) => [u.id, u]),
  )

  let gelukt = 0
  let geenProfiel = 0
  let geenCurve = 0

  for (const r of rijen) {
    const profiel = profielen.get(r.patientId)
    if (!profiel) {
      geenProfiel++
      continue
    }
    const zones = zonesFromSeries(r.series as never, profiel)
    if (!zones) {
      geenCurve++
      continue
    }
    gelukt++
    if (APPLY) {
      await prisma.cardioLog.update({ where: { id: r.id }, data: { timeInZones: zones } })
    } else if (gelukt <= 5) {
      const trimp = edwardsTrimp(zones)
      console.log(
        `  ${r.completedAt.toISOString().slice(0, 10)} · ${r.activity} · ` +
          `zones ${JSON.stringify(zones)} · TRIMP ${trimp}`,
      )
    }
  }

  console.log(
    `\n${gelukt} af te leiden, ${geenProfiel} zonder HR-profiel, ${geenCurve} met een onbruikbare curve.`,
  )
  if (!APPLY) console.log('Droogloop: er is niets gewijzigd. Draai opnieuw met --apply.')
  else console.log('Weggeschreven.')

  await prisma.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
