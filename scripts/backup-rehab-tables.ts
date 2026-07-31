/**
 * Dumpt de vijf rehab-tabellen naar scripts/backups/ vóór de episode-migratie.
 * Vangnet voor de PatientRehabTracker-primary-key-verhuizing: als die
 * migratie misgaat, valt de hersteloperatie terug op dit bestand.
 *
 * Gebruik:
 *   npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts           # dry-run (default)
 *   npx tsx --env-file=.env.local scripts/backup-rehab-tables.ts --apply   # echt wegschrijven
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { prisma } from '../src/lib/prisma'

const APPLY = process.argv.includes('--apply')

async function main() {
  const data = {
    takenOp: new Date().toISOString(),
    protocols: await prisma.rehabProtocol.findMany(),
    phases: await prisma.rehabPhase.findMany(),
    criteria: await prisma.rehabCriterion.findMany(),
    trackers: await prisma.patientRehabTracker.findMany(),
    statuses: await prisma.rehabCriterionStatus.findMany(),
  }
  const telling = Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
    .join(', ')

  if (!APPLY) {
    console.log(`Dry-run. Zou wegschrijven: ${telling}`)
    console.log('Draai opnieuw met --apply om het bestand te maken.')
    return
  }
  const dir = resolve(process.cwd(), 'scripts/backups')
  mkdirSync(dir, { recursive: true })
  const dag = new Date().toISOString().slice(0, 10)
  const pad = resolve(dir, `rehab-tables-${dag}.json`)
  writeFileSync(pad, JSON.stringify(data, null, 2))
  console.log(`Geschreven naar ${pad}: ${telling}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
