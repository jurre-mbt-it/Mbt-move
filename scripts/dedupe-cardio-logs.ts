/**
 * Opruimen van dubbel gesyncte cardio-activiteiten.
 *
 * Dezelfde training kan meerdere keren in Apple Health landen: schrijft een
 * tweede app zijn eigen workout naast die van de watch, dan levert HealthKit
 * twee records met verschillende UUID's. Op één dag stonden er zo drie
 * identieke wandelingen van vijf uur in de kalender, die alle drie meetelden in
 * de belastingscurve.
 *
 * De oorzaak zit sinds 2026-08-23 dicht (`findDuplicate` kijkt niet langer
 * alleen naar ándere bronnen). Dit script ruimt op wat er vóór die fix al
 * stond.
 *
 * Draaien:
 *   npx tsx scripts/dedupe-cardio-logs.ts                  # droogloop
 *   npx tsx scripts/dedupe-cardio-logs.ts --apply          # echt verwijderen
 *   npx tsx scripts/dedupe-cardio-logs.ts --user <userId>  # één gebruiker
 *
 * Zonder --apply verandert er niets; dan zie je alleen wát er zou verdwijnen.
 */
import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { overlapsAsDuplicate } from '../src/server/wearables/dedupe'

const APPLY = process.argv.includes('--apply')
const userArg = process.argv.indexOf('--user')
const ONLY_USER = userArg >= 0 ? process.argv[userArg + 1] : null

type Row = {
  id: string
  patientId: string
  externalId: string | null
  source: string
  activity: string
  completedAt: Date
  durationSec: number
  distanceM: number | null
  avgHeartRate: number | null
  ratedAt: Date | null
  sessionLogId: string | null
  timeInZones: unknown
  series: unknown
}

/**
 * Welke rij houden we? Wat een mens heeft aangeraakt wint altijd; daarna wint
 * de rij met de meeste inhoud. Zo verliezen we bij het opruimen geen
 * beoordeling, koppeling of hartslagcurve die maar op één van de kopieën staat.
 */
function score(r: Row): number {
  let n = 0
  if (r.ratedAt) n += 100
  if (r.sessionLogId) n += 50
  if (r.series) n += 10
  if (r.timeInZones) n += 5
  if (r.avgHeartRate != null) n += 2
  if (r.distanceM != null) n += 1
  return n
}

function fmt(r: Row): string {
  const min = Math.round(r.durationSec / 60)
  const km = r.distanceM != null ? `${(r.distanceM / 1000).toFixed(1)} km` : 'geen afstand'
  return `${r.completedAt.toISOString().slice(0, 16).replace('T', ' ')} · ${r.activity} · ${min}m · ${km} · ${r.source} · score ${score(r)}`
}

async function main() {
  // .env.local is waar DIRECT_URL staat; los draaien laadt die niet vanzelf.
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL of DATABASE_URL ontbreekt')
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  const rows = (await prisma.cardioLog.findMany({
    where: {
      externalId: { not: null }, // handmatige logs blijven met rust
      ...(ONLY_USER ? { patientId: ONLY_USER } : {}),
    },
    orderBy: [{ patientId: 'asc' }, { completedAt: 'asc' }],
    select: {
      id: true, patientId: true, externalId: true, source: true, activity: true,
      completedAt: true, durationSec: true, distanceM: true, avgHeartRate: true,
      ratedAt: true, sessionLogId: true, timeInZones: true, series: true,
    },
  })) as Row[]

  // Per patiënt in tijdvolgorde groeperen op overlap.
  const perPatient = new Map<string, Row[]>()
  for (const r of rows) {
    const list = perPatient.get(r.patientId) ?? []
    list.push(r)
    perPatient.set(r.patientId, list)
  }

  const teVerwijderen: Row[] = []
  let groepen = 0

  for (const [, list] of perPatient) {
    const gebruikt = new Set<string>()
    for (let i = 0; i < list.length; i++) {
      if (gebruikt.has(list[i].id)) continue
      const groep = [list[i]]
      for (let j = i + 1; j < list.length; j++) {
        if (gebruikt.has(list[j].id)) continue
        // Buiten bereik → de rest ook, want de lijst is op tijd gesorteerd.
        if (list[j].completedAt.getTime() - list[i].completedAt.getTime() > (list[i].durationSec + 3600) * 1000) break
        if (overlapsAsDuplicate(list[i].completedAt, list[i].durationSec, list[j].completedAt, list[j].durationSec)) {
          groep.push(list[j])
          gebruikt.add(list[j].id)
        }
      }
      gebruikt.add(list[i].id)
      if (groep.length < 2) continue

      groepen++
      const gesorteerd = [...groep].sort((a, b) => score(b) - score(a) || a.completedAt.getTime() - b.completedAt.getTime())
      const houden = gesorteerd[0]
      const weg = gesorteerd.slice(1)
      console.log(`\ngroep van ${groep.length}:`)
      console.log(`  HOUDEN  ${fmt(houden)}`)
      for (const r of weg) console.log(`  weg     ${fmt(r)}`)
      teVerwijderen.push(...weg)
    }
  }

  console.log(`\n${groepen} groep(en) met duplicaten, ${teVerwijderen.length} rij(en) te verwijderen.`)

  // Id-lijst wegschrijven zodat er vóór het verwijderen een terugzetbare kopie
  // van gemaakt kan worden. Gaat naar de scratch, niet de repo: dit zijn
  // patiëntgegevens.
  if (process.env.DEDUPE_IDS_OUT) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(process.env.DEDUPE_IDS_OUT, JSON.stringify(teVerwijderen.map((r) => r.id)))
    console.log(`Id's weggeschreven naar ${process.env.DEDUPE_IDS_OUT}`)
  }

  if (!APPLY) {
    console.log('Droogloop: er is niets gewijzigd. Draai opnieuw met --apply om dit door te voeren.')
  } else if (teVerwijderen.length > 0) {
    const res = await prisma.cardioLog.deleteMany({ where: { id: { in: teVerwijderen.map((r) => r.id) } } })
    console.log(`${res.count} rij(en) verwijderd.`)
    console.log('Let op: de dagbelasting van die dagen komt uit het HR-histogram en verandert hier niet door; de belastingscurve (sRPE) wel.')
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
