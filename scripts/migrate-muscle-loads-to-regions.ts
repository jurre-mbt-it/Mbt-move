/**
 * Data-backfill: bestaande muscle_loads (22 granulaire groepen) → 12 regio's.
 *
 * Voor elke Exercise: lees de muscle_loads-rijen, map elke `muscle` via de
 * migratiemap (§1.0) naar een regio, collapse per regio naar MAX van de leden,
 * en vervang de rijen. Idempotent: twee keer draaien geeft dezelfde 12-regio-
 * rijen (regio's mappen op zichzelf).
 *
 * NIET tegen de echte/prod-DB draaien zonder overleg. Draai eerst op een kopie.
 *
 * Flags:
 *   --dry-run   niets schrijven; alleen samenvatting + audit tonen/schrijven.
 *   --audit-only   alias voor --dry-run.
 *
 * Genereert altijd muscle-loads-audit.json ter menselijke review: oefeningen
 * waar de auto-estimatie (strain-estimation, regio's) ≥2 afwijkt van de
 * gecollapste waarde op een regio, of waar de collapse een lege map opleverde,
 * of waar bron-sleutels niet gemapt konden worden.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import { writeFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { collapseMuscleLoadsToRegions, regionForMuscle } from '../src/lib/muscle-region-map'
import { estimateMuscleStrain, type LoadType, type MovementPattern } from '../src/lib/strain-estimation'
import { MUSCLE_REGIONS, type MuscleRegion } from '../src/lib/exercise-constants'

const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--audit-only')

const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

interface AuditEntry {
  exerciseId: string
  name: string
  reason: 'divergence' | 'empty' | 'unmapped'
  before: Record<string, number>
  after: Partial<Record<MuscleRegion, number>>
  estimate?: Partial<Record<MuscleRegion, number>>
  divergentRegions?: string[]
  unmapped?: string[]
}

async function main() {
  const exercises = await prisma.exercise.findMany({
    include: { muscleLoads: { select: { muscle: true, load: true } } },
  })

  let touched = 0
  let rowsBefore = 0
  let rowsAfter = 0
  let alreadyRegional = 0
  const audit: AuditEntry[] = []

  for (const ex of exercises) {
    const before: Record<string, number> = {}
    for (const ml of ex.muscleLoads) before[ml.muscle] = ml.load
    rowsBefore += ex.muscleLoads.length

    const { regions, unmapped } = collapseMuscleLoadsToRegions(before)
    const afterEntries = Object.entries(regions) as Array<[MuscleRegion, number]>
    rowsAfter += afterEntries.length

    // Idempotentie-check: is dit al exact de gecollapste 12-regio-vorm?
    const beforeKeys = Object.keys(before).sort()
    const afterKeys = afterEntries.map(([k]) => k).sort()
    const isAlreadyRegional =
      beforeKeys.length === afterKeys.length &&
      beforeKeys.every((k, i) => k === afterKeys[i]) &&
      beforeKeys.every((k) => before[k] === regions[k as MuscleRegion]) &&
      beforeKeys.every((k) => (MUSCLE_REGIONS as readonly string[]).includes(k))

    if (isAlreadyRegional) {
      alreadyRegional++
    } else {
      touched++
      if (!DRY_RUN) {
        await prisma.$transaction([
          prisma.muscleLoad.deleteMany({ where: { exerciseId: ex.id } }),
          prisma.muscleLoad.createMany({
            data: afterEntries.map(([muscle, load]) => ({ exerciseId: ex.id, muscle, load })),
          }),
        ])
      }
    }

    // ── Audit ──────────────────────────────────────────────────────────────
    if (unmapped.length > 0) {
      audit.push({ exerciseId: ex.id, name: ex.name, reason: 'unmapped', before, after: regions, unmapped })
    }
    if (afterEntries.length === 0 && ex.muscleLoads.length > 0) {
      audit.push({ exerciseId: ex.id, name: ex.name, reason: 'empty', before, after: regions, unmapped })
      continue
    }

    // Vergelijk met de auto-estimatie (regio's). Flag ≥2 verschil op een regio.
    const estimate = estimateMuscleStrain({
      movementPattern: (ex.movementPattern as MovementPattern | null) ?? null,
      loadType: (ex.loadType as LoadType) ?? 'BODYWEIGHT',
      isUnilateral: ex.isUnilateral,
      difficulty: (ex.difficulty as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED') ?? 'INTERMEDIATE',
      category: ex.category,
      bodyRegions: ex.bodyRegion,
    }) as Partial<Record<MuscleRegion, number>>

    const divergent: string[] = []
    const allRegions = new Set<string>([...Object.keys(regions), ...Object.keys(estimate)])
    for (const r of allRegions) {
      const a = regions[r as MuscleRegion] ?? 0
      const e = estimate[r as MuscleRegion] ?? 0
      if (Math.abs(a - e) >= 2) divergent.push(`${r}: backfill=${a} est=${e}`)
    }
    if (divergent.length > 0) {
      audit.push({
        exerciseId: ex.id,
        name: ex.name,
        reason: 'divergence',
        before,
        after: regions,
        estimate,
        divergentRegions: divergent,
      })
    }
  }

  const auditPath = resolve(process.cwd(), 'muscle-loads-audit.json')
  writeFileSync(
    auditPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun: DRY_RUN,
        summary: {
          exercisesTotal: exercises.length,
          exercisesTouched: touched,
          exercisesAlreadyRegional: alreadyRegional,
          rowsBefore,
          rowsAfter,
          auditFlags: audit.length,
          flaggedDivergence: audit.filter((a) => a.reason === 'divergence').length,
          flaggedEmpty: audit.filter((a) => a.reason === 'empty').length,
          flaggedUnmapped: audit.filter((a) => a.reason === 'unmapped').length,
        },
        entries: audit,
      },
      null,
      2,
    ),
  )

  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Backfill muscle_loads → regio's`)
  console.log(`  oefeningen totaal:        ${exercises.length}`)
  console.log(`  aangepast:                ${touched}`)
  console.log(`  al in regio-vorm:         ${alreadyRegional}`)
  console.log(`  rijen voor → na:          ${rowsBefore} → ${rowsAfter}`)
  console.log(`  audit-flags:              ${audit.length} (div=${audit.filter(a => a.reason === 'divergence').length}, leeg=${audit.filter(a => a.reason === 'empty').length}, ongemapt=${audit.filter(a => a.reason === 'unmapped').length})`)
  console.log(`  audit weggeschreven:      ${auditPath}`)
  if (DRY_RUN) console.log('  (dry-run: geen schrijfacties uitgevoerd)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
