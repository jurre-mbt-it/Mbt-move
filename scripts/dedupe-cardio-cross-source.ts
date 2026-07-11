/**
 * Ruim bestaande cross-source duplicaten in cardio_logs op: dezelfde workout
 * die zowel via Apple Watch (HealthKit) als Strava is binnengekomen.
 *
 * Regels (zelfde overlap-definitie als src/server/wearables/dedupe.ts):
 *  - alleen gesyncte rijen (externalId != null); handmatige logs blijven staan;
 *  - per duplicaat-paar wint: beoordeeld (ratedAt) > rijkste data (series/HR) >
 *    oudste createdAt. De verliezer wordt verwijderd nadat zijn niet-lege
 *    velden in de winnaar zijn gemerged.
 *
 * Gebruik:
 *   npx tsx scripts/dedupe-cardio-cross-source.ts           # dry-run (default)
 *   npx tsx scripts/dedupe-cardio-cross-source.ts --apply   # echt verwijderen
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'
import { overlapsAsDuplicate } from '../src/server/wearables/dedupe'

config({ path: resolve(process.cwd(), '.env.local') })
const pool = new Pool({ connectionString: process.env.DIRECT_URL!, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
const APPLY = process.argv.includes('--apply')

type Row = {
  id: string
  patientId: string
  source: string
  externalId: string | null
  completedAt: Date
  durationSec: number
  ratedAt: Date | null
  createdAt: Date
  rpe: number | null
  distanceM: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  calories: number | null
  avgPaceSecPerKm: number | null
  timeInZones: unknown
  series: unknown
}

function richness(r: Row): number {
  let n = 0
  if (r.series != null) n += 4
  if (r.timeInZones != null) n += 2
  for (const v of [r.avgHeartRate, r.maxHeartRate, r.distanceM, r.calories, r.avgPaceSecPerKm]) {
    if (v != null) n += 1
  }
  return n
}

/** Winnaar binnen een paar: rated > rijker > oudst aangemaakt. */
function pickWinner(a: Row, b: Row): [winner: Row, loser: Row] {
  if (!!a.ratedAt !== !!b.ratedAt) return a.ratedAt ? [a, b] : [b, a]
  const ra = richness(a), rb = richness(b)
  if (ra !== rb) return ra > rb ? [a, b] : [b, a]
  return a.createdAt <= b.createdAt ? [a, b] : [b, a]
}

async function main() {
  const rows = (await prisma.cardioLog.findMany({
    where: { externalId: { not: null } },
    orderBy: [{ patientId: 'asc' }, { completedAt: 'asc' }],
    select: {
      id: true, patientId: true, source: true, externalId: true,
      completedAt: true, durationSec: true, ratedAt: true, createdAt: true,
      rpe: true, distanceM: true, avgHeartRate: true, maxHeartRate: true,
      calories: true, avgPaceSecPerKm: true, timeInZones: true, series: true,
    },
  })) as Row[]

  const removed = new Set<string>()
  let pairs = 0

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]
    if (removed.has(a.id)) continue
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j]
      if (removed.has(b.id)) continue
      if (b.patientId !== a.patientId) break
      // Rijen zijn op completedAt gesorteerd; buiten een ruim venster → klaar.
      if (b.completedAt.getTime() - a.completedAt.getTime() > (a.durationSec + 1800) * 1000) break
      if (b.source === a.source) continue
      if (!overlapsAsDuplicate(a.completedAt, a.durationSec, b.completedAt, b.durationSec)) continue

      const [winner, loser] = pickWinner(a, b)
      pairs++
      console.log(
        `${APPLY ? 'FIX' : 'DRY'} patient=${a.patientId.slice(0, 8)}… ` +
        `${loser.source}#${loser.id.slice(0, 8)} (${loser.completedAt.toISOString()}, ${Math.round(loser.durationSec / 60)}m) ` +
        `→ duplicaat van ${winner.source}#${winner.id.slice(0, 8)}`,
      )
      if (APPLY) {
        // Ontbrekende velden van de verliezer in de winnaar mergen.
        const patch: Record<string, unknown> = {}
        if (winner.distanceM == null && loser.distanceM != null) patch.distanceM = loser.distanceM
        if (winner.avgHeartRate == null && loser.avgHeartRate != null) patch.avgHeartRate = loser.avgHeartRate
        if (winner.maxHeartRate == null && loser.maxHeartRate != null) patch.maxHeartRate = loser.maxHeartRate
        if (winner.calories == null && loser.calories != null) patch.calories = loser.calories
        if (winner.avgPaceSecPerKm == null && loser.avgPaceSecPerKm != null) patch.avgPaceSecPerKm = loser.avgPaceSecPerKm
        if (winner.timeInZones == null && loser.timeInZones != null) patch.timeInZones = loser.timeInZones as never
        if (winner.series == null && loser.series != null) patch.series = loser.series as never
        if (winner.rpe == null && winner.ratedAt == null && loser.rpe != null) patch.rpe = loser.rpe
        if (Object.keys(patch).length > 0) {
          await prisma.cardioLog.update({ where: { id: winner.id }, data: patch })
        }
        await prisma.cardioLog.delete({ where: { id: loser.id } })
      }
      removed.add(loser.id)
    }
  }

  console.log(`\n${pairs} duplicaat-paren gevonden (${APPLY ? 'opgeruimd' : 'dry-run — niets gewijzigd'}).`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
