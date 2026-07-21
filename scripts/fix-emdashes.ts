/**
 * Vervangt em-dashes in oefening-beschrijvingen en cues.
 * De tone-of-voice verbiedt em-dashes; ze worden een komma of een punt,
 * afhankelijk van of er een nieuwe zin achter begint.
 *
 *   npx tsx scripts/fix-emdashes.ts --dry-run
 *   npx tsx scripts/fix-emdashes.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local'), override: true })
import { writeFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DRY = process.argv.includes('--dry-run')

/** " — " wordt ". " als er een hoofdletter volgt, anders ", ". */
export function stripEmDash(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, (_m, off: number, full: string) => {
      const rest = full.slice(off).replace(/^\s*[—–]\s*/, '')
      return /^[A-Z]/.test(rest) ? '. ' : ', '
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim()
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  const ex = await prisma.exercise.findMany({
    select: { id: true, name: true, description: true, instructions: true },
  })
  const changes: { id: string; name: string; before: string; after: string }[] = []
  let touched = 0
  for (const e of ex) {
    const desc = e.description ?? ''
    const cues = (e.instructions as string[]) ?? []
    const hasDash = /[—–]/.test(desc) || cues.some((c) => /[—–]/.test(c))
    if (!hasDash) continue
    const newDesc = stripEmDash(desc)
    const newCues = cues.map(stripEmDash)
    changes.push({ id: e.id, name: e.name, before: desc || cues.find((c) => /[—–]/.test(c)) || '', after: newDesc || newCues.find((c) => c) || '' })
    if (!DRY) {
      await prisma.exercise.update({
        where: { id: e.id },
        data: { description: newDesc || e.description, instructions: newCues },
      })
    }
    touched++
  }
  writeFileSync('emdash-changes.json', JSON.stringify(changes, null, 1))
  console.log(`${DRY ? '[DRY-RUN] ' : ''}em-dashes hersteld in ${touched} oefeningen`)
  console.log('  overzicht: emdash-changes.json')
  await prisma.$disconnect()
}
main()
