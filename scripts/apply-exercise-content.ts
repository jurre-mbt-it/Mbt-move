/**
 * Zet herschreven oefening-content (beschrijving, cues, spierbelasting) terug in de DB.
 *
 * Input: een JSON-array met {id, name, description, instructions[], muscleLoads{}, loadsChanged}.
 * Maakt eerst een backup van de huidige waarden, zodat terugdraaien altijd kan.
 *
 * Gebruik:
 *   npx tsx scripts/apply-exercise-content.ts <input.json> --dry-run
 *   npx tsx scripts/apply-exercise-content.ts <input.json>
 *   npx tsx scripts/apply-exercise-content.ts --restore <backup.json>
 *
 * muscleLoads worden alleen geschreven als loadsChanged true is; bestaande
 * therapeut-waarden blijven dus met rust.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import { readFileSync, writeFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { MUSCLE_REGIONS } from '../src/lib/exercise-constants'

type Entry = {
  id: string
  name: string
  description?: string
  instructions?: string[]
  muscleLoads?: Record<string, number>
  loadsChanged?: boolean
  note?: string
}

const args = process.argv.slice(2)
const RESTORE = args.includes('--restore')
const DRY_RUN = args.includes('--dry-run')
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Geef een input-bestand mee.')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

/** Blacklist-check uit docs/tone-of-voice.md, zodat AI-taal er niet doorheen glipt. */
const BANNED = [
  '—', '–', '--',
  'naadloos', 'moeiteloos', 'ontketen', 'duik in', 'in de wereld van',
  'hoger niveau', 'raadpleeg altijd', 'het is belangrijk om te vermelden',
  'ik begrijp hoe',
]
function toneIssues(e: Entry): string[] {
  const hay = [e.description ?? '', ...(e.instructions ?? [])].join(' ').toLowerCase()
  return BANNED.filter((b) => hay.includes(b.toLowerCase()))
}

async function restore() {
  const backup: Array<{ id: string; description: string | null; instructions: string[] }> = JSON.parse(
    readFileSync(file!, 'utf8'),
  )
  for (const b of backup) {
    await prisma.exercise.update({
      where: { id: b.id },
      data: { description: b.description, instructions: b.instructions },
    })
  }
  console.log(`Teruggezet: ${backup.length} oefeningen (alleen beschrijving + cues).`)
}

async function apply() {
  const entries: Entry[] = JSON.parse(readFileSync(file!, 'utf8'))
  const ids = entries.map((e) => e.id)
  const current = await prisma.exercise.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, description: true, instructions: true, muscleLoads: true },
  })
  const byId = new Map(current.map((c) => [c.id, c]))

  // Backup vóór elke schrijfactie.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = resolve(process.cwd(), `exercise-content-backup-${stamp}.json`)
  writeFileSync(
    backupPath,
    JSON.stringify(
      current.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        instructions: c.instructions,
        muscleLoads: Object.fromEntries(c.muscleLoads.map((m) => [m.muscle, m.load])),
      })),
      null,
      1,
    ),
  )

  let updated = 0
  let loadsWritten = 0
  const skipped: string[] = []
  const toneFlags: string[] = []

  for (const e of entries) {
    const cur = byId.get(e.id)
    if (!cur) {
      skipped.push(`${e.name} (id niet gevonden)`)
      continue
    }
    const issues = toneIssues(e)
    if (issues.length) toneFlags.push(`${e.name}: ${issues.join(', ')}`)

    const data: { description?: string; instructions?: string[] } = {}
    if (e.description && e.description.trim()) data.description = e.description.trim()
    if (e.instructions && e.instructions.length >= 2) data.instructions = e.instructions

    if (!DRY_RUN && Object.keys(data).length) {
      await prisma.exercise.update({ where: { id: e.id }, data })
    }
    if (Object.keys(data).length) updated++

    // Spierbelasting alleen schrijven als die nieuw is toegekend.
    if (e.loadsChanged && e.muscleLoads && Object.keys(e.muscleLoads).length) {
      const rows = Object.entries(e.muscleLoads)
        .filter(([m, v]) => (MUSCLE_REGIONS as readonly string[]).includes(m) && v >= 1 && v <= 5)
        .map(([muscle, load]) => ({ exerciseId: e.id, muscle, load: Math.round(load) }))
      const invalid = Object.keys(e.muscleLoads).filter(
        (m) => !(MUSCLE_REGIONS as readonly string[]).includes(m),
      )
      if (invalid.length) skipped.push(`${e.name}: onbekende regio(s) ${invalid.join(', ')}`)
      if (rows.length && !DRY_RUN) {
        await prisma.$transaction([
          prisma.muscleLoad.deleteMany({ where: { exerciseId: e.id } }),
          prisma.muscleLoad.createMany({ data: rows }),
        ])
      }
      if (rows.length) loadsWritten++
    }
  }

  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Oefening-content bijgewerkt`)
  console.log(`  invoer:                   ${entries.length}`)
  console.log(`  beschrijving/cues gezet:  ${updated}`)
  console.log(`  spierbelasting gezet:     ${loadsWritten}`)
  console.log(`  backup:                   ${backupPath}`)
  if (toneFlags.length) {
    console.log(`\n  TONE-OF-VOICE FLAGS (${toneFlags.length}):`)
    toneFlags.forEach((t) => console.log(`    - ${t}`))
  }
  if (skipped.length) {
    console.log(`\n  overgeslagen/aandacht (${skipped.length}):`)
    skipped.forEach((s) => console.log(`    - ${s}`))
  }
  if (DRY_RUN) console.log('\n  (dry-run: niets geschreven)')
}

async function main() {
  if (RESTORE) await restore()
  else await apply()
  await prisma.$disconnect()
}
main()
