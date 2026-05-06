#!/usr/bin/env tsx
/**
 * Validation script voor STANDARD_EXERCISES.
 *
 * Doel: catch issues vóór commit / re-seed:
 * - Dubbele namen (exact + fuzzy via Levenshtein)
 * - Naam-clashes met productie-DB (admin én user-aangemaakt)
 * - Muscle keys buiten de canonieke lijst (typo-detectie)
 * - Muscle loads buiten 1-5
 * - Lege velden (instructions, description)
 * - Ontbrekende EMG-citatie pattern `[Naam YYYY]` in description
 * - Onbekende bodyRegion / movementPattern enums
 *
 * Run: `npx tsx scripts/validate-exercises.ts`
 * Exit-code 0 = clean, 1 = issues. Geschikt voor pre-commit hook.
 */

import { STANDARD_EXERCISES } from '../prisma/seed-exercises'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

// ─── Canonieke referenties ────────────────────────────────────────────────────

// Canonieke spierlijst — afgeleid uit de bestaande 152 oefeningen in
// STANDARD_EXERCISES (geëxtract met scripts/extract-muscles.ts) plus enkele
// veelgebruikte synoniemen die we expliciet wél/niet willen toestaan.
//
// Bewust dubbel: 'Forearms' (1×) wordt eigenlijk altijd 'Onderarmen' (18×)
// genoemd. Toekomst: consolideren naar één.
const CANONICAL_MUSCLES = new Set([
  // Onderlichaam
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Abductoren',
  'Adductoren',
  'Calves',
  'Hip flexors',
  'Tibialis anterior',
  'Intrinsieke voetspieren',
  // Core / spine
  'Core',
  'Obliques',
  'ErectorSpinae',
  'Onderrug',
  'Diepe halsflexoren',
  // Bovenlichaam
  'Bovenrug',
  'Lats',
  'Trapezius',
  'Rhomboids',
  'Borst',
  'Schouders anterieur',
  'Schouders lateraal',
  'Schouders posterieur',
  'Triceps',
  'Biceps',
  'Rotatorcuff',
  'Forearms',
  'Onderarmen',
])

const CANONICAL_BODY_REGIONS = new Set([
  'KNEE', 'SHOULDER', 'BACK', 'ANKLE', 'HIP', 'FULL_BODY',
  'CERVICAL', 'THORACIC', 'LUMBAR', 'ELBOW', 'WRIST', 'FOOT',
])

const CANONICAL_MOVEMENT_PATTERNS = new Set([
  'SQUAT', 'LUNGE', 'HINGE',
  'PUSH_HORIZONTAL', 'PUSH_VERTICAL', 'PULL_HORIZONTAL', 'PULL_VERTICAL',
  'HIP_THRUST', 'CALF_RAISE', 'CORE', 'ROTATION',
  'ISOLATION_UPPER', 'ISOLATION_LOWER', 'CARRY', 'FULL_BODY',
])

const CANONICAL_CATEGORIES = new Set([
  'STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY',
])

const CANONICAL_DIFFICULTIES = new Set(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'])
const CANONICAL_LOAD_TYPES = new Set(['BODYWEIGHT', 'WEIGHTED', 'MACHINE', 'BAND'])

// EMG-citatie pattern: `[Auteur YYYY]` of `[Auteur YYYY, Auteur YYYY]`
const EMG_CITATION_RE = /\[[A-Z][\w\-]+ (19|20)\d{2}/

// ─── Levenshtein voor fuzzy duplicate detection ───────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }
  return dp[m][n]
}

const normalize = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, ' ')

// ─── Validators ───────────────────────────────────────────────────────────────

type Issue = {
  level: 'error' | 'warn'
  exercise: string
  message: string
}

function validateLocal(): Issue[] {
  const issues: Issue[] = []
  const seenNames = new Map<string, number>() // normalized name → first index

  STANDARD_EXERCISES.forEach((ex, idx) => {
    // Required fields
    if (!ex.name?.trim()) {
      issues.push({ level: 'error', exercise: `[${idx}]`, message: 'Lege name' })
      return
    }
    if (!ex.description?.trim()) {
      issues.push({ level: 'warn', exercise: ex.name, message: 'Lege description' })
    }
    if (!ex.instructions || ex.instructions.length === 0) {
      issues.push({ level: 'warn', exercise: ex.name, message: 'Geen instructions' })
    }

    // Enum checks
    if (!CANONICAL_CATEGORIES.has(ex.category)) {
      issues.push({ level: 'error', exercise: ex.name, message: `Onbekende category: ${ex.category}` })
    }
    if (!CANONICAL_DIFFICULTIES.has(ex.difficulty)) {
      issues.push({ level: 'error', exercise: ex.name, message: `Onbekende difficulty: ${ex.difficulty}` })
    }
    if (!CANONICAL_LOAD_TYPES.has(ex.loadType)) {
      issues.push({ level: 'error', exercise: ex.name, message: `Onbekende loadType: ${ex.loadType}` })
    }
    if (ex.movementPattern && !CANONICAL_MOVEMENT_PATTERNS.has(ex.movementPattern)) {
      issues.push({ level: 'error', exercise: ex.name, message: `Onbekend movementPattern: ${ex.movementPattern}` })
    }
    for (const region of ex.bodyRegion ?? []) {
      if (!CANONICAL_BODY_REGIONS.has(region)) {
        issues.push({ level: 'error', exercise: ex.name, message: `Onbekend bodyRegion: ${region}` })
      }
    }

    // Muscle loads
    if (!ex.muscleLoads || Object.keys(ex.muscleLoads).length === 0) {
      issues.push({ level: 'warn', exercise: ex.name, message: 'Geen muscleLoads — spier-balans wordt leeg' })
    } else {
      for (const [muscle, load] of Object.entries(ex.muscleLoads)) {
        if (!CANONICAL_MUSCLES.has(muscle)) {
          // Suggest closest canonical via Levenshtein
          const candidates = [...CANONICAL_MUSCLES]
            .map((c) => ({ c, d: levenshtein(muscle.toLowerCase(), c.toLowerCase()) }))
            .sort((a, b) => a.d - b.d)
          const suggestion = candidates[0].d <= 3 ? ` (bedoel je "${candidates[0].c}"?)` : ''
          issues.push({
            level: 'error',
            exercise: ex.name,
            message: `Onbekende muscle: "${muscle}"${suggestion}`,
          })
        }
        if (typeof load !== 'number' || load < 1 || load > 5 || !Number.isInteger(load)) {
          issues.push({
            level: 'error',
            exercise: ex.name,
            message: `Muscle load voor ${muscle} moet integer 1-5, kreeg: ${load}`,
          })
        }
      }
    }

    // EMG citation in description
    if (ex.description && !EMG_CITATION_RE.test(ex.description)) {
      issues.push({
        level: 'warn',
        exercise: ex.name,
        message: 'Geen EMG-citatie pattern `[Auteur YYYY]` in description',
      })
    }

    // Duplicate within seed
    const norm = normalize(ex.name)
    if (seenNames.has(norm)) {
      issues.push({
        level: 'error',
        exercise: ex.name,
        message: `Dubbele naam in seed (zelfde als index ${seenNames.get(norm)})`,
      })
    } else {
      seenNames.set(norm, idx)
    }
  })

  // Fuzzy dedup binnen seed (Levenshtein <= 2 met andere genormaliseerde naam)
  const names = STANDARD_EXERCISES.map((e) => normalize(e.name))
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const d = levenshtein(names[i], names[j])
      if (d > 0 && d <= 2 && Math.min(names[i].length, names[j].length) >= 6) {
        issues.push({
          level: 'warn',
          exercise: STANDARD_EXERCISES[i].name,
          message: `Lijkt erg op "${STANDARD_EXERCISES[j].name}" (Levenshtein ${d}) — bedoeld?`,
        })
      }
    }
  }

  return issues
}

async function validateAgainstDb(): Promise<Issue[]> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url) {
    return [{ level: 'warn', exercise: '*', message: 'Geen DATABASE_URL — DB-clash check overgeslagen' }]
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  try {
    const dbExercises = await prisma.exercise.findMany({
      select: { id: true, name: true, createdById: true },
    })
    const adminEmail = 'admin@mbtmove.com'
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } })
    const adminId = adminUser?.id ?? null

    const dbByName = new Map<string, typeof dbExercises[0]>()
    for (const ex of dbExercises) dbByName.set(normalize(ex.name), ex)

    const issues: Issue[] = []
    for (const seed of STANDARD_EXERCISES) {
      const norm = normalize(seed.name)
      const match = dbByName.get(norm)
      if (match && match.createdById !== adminId) {
        issues.push({
          level: 'warn',
          exercise: seed.name,
          message: `Bestaat al in DB als USER-AANGEMAAKTE oefening (id ${match.id}) — wordt overgeslagen bij seed (geen overschrijving)`,
        })
      }
    }
    return issues
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Valideren ${STANDARD_EXERCISES.length} oefeningen...\n`)

  const localIssues = validateLocal()
  const dbIssues = await validateAgainstDb().catch((err) => {
    console.warn(`DB-check faalde: ${err instanceof Error ? err.message : String(err)}`)
    return [] as Issue[]
  })

  const all = [...localIssues, ...dbIssues]
  const errors = all.filter((i) => i.level === 'error')
  const warnings = all.filter((i) => i.level === 'warn')

  if (errors.length > 0) {
    console.log(`\n🚨 ERRORS (${errors.length}):`)
    for (const e of errors) console.log(`  ✕ ${e.exercise}: ${e.message}`)
  }
  if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`)
    for (const w of warnings) console.log(`  ! ${w.exercise}: ${w.message}`)
  }

  console.log(
    `\nResultaat: ${errors.length} errors, ${warnings.length} warnings, ${STANDARD_EXERCISES.length} oefeningen totaal.`,
  )
  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(2)
})
