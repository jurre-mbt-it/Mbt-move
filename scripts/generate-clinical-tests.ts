/**
 * One-shot generator: parse docs/clinical-tests-reference.md → CLINICAL_TESTS
 * array. Output gaat naar scripts/clinical-tests-data.ts. Re-run als de
 * markdown verandert; output is idempotent en deterministisch.
 *
 * Run: pnpm tsx scripts/generate-clinical-tests.ts   (of: npx tsx ...)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Region =
  | 'KNEE'
  | 'SHOULDER'
  | 'BACK'
  | 'ANKLE'
  | 'HIP'
  | 'FULL_BODY'
  | 'CERVICAL'
  | 'THORACIC'
  | 'LUMBAR'
  | 'ELBOW'
  | 'WRIST'
  | 'FOOT'

type Construct =
  | 'STRENGTH'
  | 'ROM'
  | 'POWER'
  | 'BALANCE'
  | 'ENDURANCE'
  | 'PROVOCATION'
  | 'NEURODYNAMIC'
  | 'MOVEMENT_QUALITY'
  | 'SENSORIMOTOR'
  | 'FUNCTIONAL'
  | 'SPORT_SPECIFIC'
  | 'SENSIBILITY'
  | 'RESPIRATORY'
  | 'EFFUSION'
  | 'DECISION_RULE'

type RegionMapping = {
  /** Heading text exact zoals in markdown (na `## REGIO N — `) */
  match: string
  bodyRegion: Region[]
  /** Vrije-tekst tags (SI_JOINT, GROIN, CORE) — buiten BodyRegion-enum */
  tags?: string[]
}

const REGION_MAP: RegionMapping[] = [
  { match: 'KNIE', bodyRegion: ['KNEE'] },
  { match: 'HEUP', bodyRegion: ['HIP'], tags: ['GROIN'] }, // incl. lies/adductoren
  { match: 'ENKEL & VOET', bodyRegion: ['ANKLE', 'FOOT'] },
  { match: 'SCHOUDER', bodyRegion: ['SHOULDER'] },
  { match: 'LUMBALE WERVELKOLOM', bodyRegion: ['LUMBAR', 'BACK'] },
  { match: 'CERVICALE WERVELKOLOM', bodyRegion: ['CERVICAL'] },
  { match: 'ELLEBOOG', bodyRegion: ['ELBOW'] },
  { match: 'POLS & HAND', bodyRegion: ['WRIST'] },
  { match: 'THORACAAL & RIBBEN', bodyRegion: ['THORACIC', 'BACK'] },
  { match: 'BEKKEN & SI-GEWRICHT', bodyRegion: ['BACK'], tags: ['SI_JOINT'] },
  { match: 'ROMP / CORE', bodyRegion: ['FULL_BODY'], tags: ['CORE'] },
]

const VALID_CONSTRUCTS: Construct[] = [
  'STRENGTH', 'ROM', 'POWER', 'BALANCE', 'ENDURANCE', 'PROVOCATION',
  'NEURODYNAMIC', 'MOVEMENT_QUALITY', 'SENSORIMOTOR', 'FUNCTIONAL',
  'SPORT_SPECIFIC', 'SENSIBILITY', 'RESPIRATORY', 'EFFUSION', 'DECISION_RULE',
]

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[°⁰¹²³₀-₉]/g, '')         // strip super/subscripts
    .replace(/[(){}\[\]<>'"`]/g, '')    // strip brackets/quotes
    .replace(/[\/\\]/g, ' ')            // slashes → space
    .replace(/[^a-z0-9]+/g, '-')        // collapse non-alphanum
    .replace(/^-+|-+$/g, '')            // trim
    .replace(/-+/g, '-')                // collapse dashes
}

/** "1, 3–5"  →  [1, 3, 4, 5]   ;   "1–5" → [1,2,3,4,5]    */
function parsePhases(s: string): number[] {
  const out = new Set<number>()
  const norm = s.replace(/–|—/g, '-').replace(/\s+/g, '')
  for (const part of norm.split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) {
      if (n >= 1 && n <= 5) out.add(n)
    }
  }
  return [...out].sort((x, y) => x - y)
}

function parsePmids(s: string): string[] {
  return [...s.matchAll(/\d{6,9}/g)].map(m => m[0])
}

function parseLoe(s: string): number {
  const m = s.trim().match(/^(\d)/)
  return m ? parseInt(m[1], 10) : 5
}

function parseApplicable(s: string): string[] {
  return s
    .split(/[,;]/)
    .map(p => p.trim())
    .filter(Boolean)
}

function parseConstruct(s: string): Construct {
  const cleaned = s.trim().toUpperCase().replace(/\s+/g, '_')
  if ((VALID_CONSTRUCTS as readonly string[]).includes(cleaned)) return cleaned as Construct
  throw new Error(`Unknown construct: "${s}"`)
}

/** Extract alternative names from "Name (alt1; alt2)" or "Name / alt"  */
function splitNameAndAlternatives(raw: string): { name: string; alternativeNames: string[] } {
  let name = raw.trim()
  const alts: string[] = []

  // Eichhoff-form: "Finkelstein / Eichhoff Test"
  if (name.includes(' / ')) {
    const parts = name.split(' / ').map(p => p.trim())
    name = parts[0]
    for (const p of parts.slice(1)) {
      // Indien laatste deel een gemeenschappelijk suffix-woord deelt (zoals "Test")
      // dan is dit een alternative full-name; we voegen toe als is.
      alts.push(p)
    }
  }

  // Sub-name in haakjes: "Modified Trendelenburg (1-been + pijn)" — laat staan in name.
  // Maar als de haakjes een eponym bevatten ("(Patrick)", "(Gerber)", "(Jobe)") dan
  // is dat geen alt-name maar een toelichting bij de hoofdnaam.
  // → Geen splitsing op haakjes. Houd het simpel.

  return { name, alternativeNames: alts }
}

type ParsedRow = {
  name: string
  alternativeNames: string[]
  construct: Construct
  shortGoal: string
  execution: string
  benchmark: string
  applicableTo: string[]
  phases: number[]
  sourcePmids: string[]
  loE: number
}

function parseRow(cells: string[]): ParsedRow | null {
  // cells: [#, Test, Construct, Doel, Uitvoering, Cut-off, Toepasbaar, Fase, PMID, LoE]
  if (cells.length < 10) return null
  const [, testCol, constructCol, doelCol, uitvCol, cutoffCol, toepasCol, faseCol, pmidCol, loeCol] = cells

  // Skip separator / header rows
  if (/^[-:|\s]+$/.test(testCol)) return null

  const { name, alternativeNames } = splitNameAndAlternatives(testCol)
  try {
    return {
      name,
      alternativeNames,
      construct: parseConstruct(constructCol),
      shortGoal: doelCol.trim(),
      execution: uitvCol.trim(),
      benchmark: cutoffCol.trim(),
      applicableTo: parseApplicable(toepasCol),
      phases: parsePhases(faseCol),
      sourcePmids: parsePmids(pmidCol),
      loE: parseLoe(loeCol),
    }
  } catch (e) {
    console.warn(`Skip row "${testCol}": ${(e as Error).message}`)
    return null
  }
}

function parseMarkdownTables(md: string) {
  const lines = md.split('\n')
  const out: Array<ParsedRow & { bodyRegion: Region[]; tags: string[]; key: string }> = []
  const usedKeys = new Set<string>()

  let currentRegion: RegionMapping | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    // Region heading: "## REGIO N — KNIE (...)"
    const headingMatch = line.match(/^##\s+REGIO\s+\d+\s+[—–-]\s+(.+?)(?:\s+\(|\s*$)/i)
    if (headingMatch) {
      const head = headingMatch[1].trim()
      currentRegion = REGION_MAP.find(r => head.toUpperCase().includes(r.match)) ?? null
      if (!currentRegion) {
        console.warn(`Geen region-mapping voor heading "${head}"`)
      }
      continue
    }

    if (!currentRegion) continue
    if (!line.startsWith('|')) continue

    const cells = line
      .split('|')
      .map(c => c.trim())
      // strip leading/trailing empty cells (pipe-delimited)
      .filter((_, i, arr) => !(i === 0 && _ === '') && !(i === arr.length - 1 && _ === ''))

    const parsed = parseRow(cells)
    if (!parsed) continue

    let key = slugify(parsed.name)
    let suffix = 2
    while (usedKeys.has(key)) {
      key = `${slugify(parsed.name)}-${suffix++}`
    }
    usedKeys.add(key)

    out.push({
      ...parsed,
      bodyRegion: currentRegion.bodyRegion,
      tags: currentRegion.tags ?? [],
      key,
    })
  }

  return out
}

function emitArray(
  rows: Array<ParsedRow & { bodyRegion: Region[]; tags: string[]; key: string }>,
): string {
  // Group by region in original markdown order
  const byRegionName = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = r.bodyRegion.join('+') + (r.tags.length > 0 ? `|${r.tags.join(',')}` : '')
    const list = byRegionName.get(k) ?? []
    list.push(r)
    byRegionName.set(k, list)
  }

  const blocks: string[] = []
  for (const [regionKey, list] of byRegionName.entries()) {
    blocks.push(
      `  // ─── ${regionKey} (${list.length} tests) ───────────────────────────────────────`,
    )
    for (const r of list) {
      const fields: Array<[string, string]> = []
      fields.push(['key', JSON.stringify(r.key)])
      fields.push(['name', JSON.stringify(r.name)])
      if (r.alternativeNames.length > 0) {
        fields.push(['alternativeNames', JSON.stringify(r.alternativeNames)])
      }
      fields.push(['bodyRegion', JSON.stringify(r.bodyRegion)])
      if (r.tags.length > 0) fields.push(['tags', JSON.stringify(r.tags)])
      fields.push(['construct', JSON.stringify(r.construct)])
      fields.push(['shortGoal', JSON.stringify(r.shortGoal)])
      fields.push(['execution', JSON.stringify(r.execution)])
      fields.push(['benchmark', JSON.stringify(r.benchmark)])
      fields.push(['applicableTo', JSON.stringify(r.applicableTo)])
      fields.push(['phases', JSON.stringify(r.phases)])
      fields.push(['sourcePmids', JSON.stringify(r.sourcePmids)])
      fields.push(['loE', String(r.loE)])
      blocks.push(`  {\n${fields.map(([k, v]) => `    ${k}: ${v},`).join('\n')}\n  },`)
    }
  }
  return blocks.join('\n')
}

function main() {
  const root = resolve(__dirname, '..')
  const mdPath = resolve(root, 'docs/clinical-tests-reference.md')
  const outPath = resolve(root, 'scripts/clinical-tests-data.ts')

  const md = readFileSync(mdPath, 'utf8')
  const rows = parseMarkdownTables(md)
  console.log(`Parsed ${rows.length} clinical tests from ${mdPath}`)

  const arrayBody = emitArray(rows)

  const file = `/**
 * Seed data voor de ClinicalTest library (MBT-app).
 *
 * Bron: docs/clinical-tests-reference.md (${rows.length} tests, 11 regio's, PubMed-geverifieerd).
 *
 * AUTO-GEGENEREERD door scripts/generate-clinical-tests.ts. Rerun na changes
 * aan de markdown-bron; aanpassingen aan deze file worden overschreven.
 *
 * Architectuur-keuze: ClinicalTest is een eigenstandig model parallel
 * aan RehabProtocol/RehabCriterion. Een test kan los aan een patient
 * worden toegewezen via PatientTestAssignment, of als criterium binnen
 * een protocol-fase worden gebruikt (toekomstig: optionele relatie
 * RehabCriterion.clinicalTestId).
 */

// Body region — sluit aan op bestaande Prisma enum BodyRegion.
// LET OP: huidige enum bevat geen SI_JOINT/GROIN/CORE; voor die regio's
// gebruiken we de dichtstbijzijnde (BACK voor SI/core, HIP voor groin)
// en taggen specificiteit in \`tags\` array.
export type ClinicalTestBodyRegion =
  | 'KNEE'
  | 'SHOULDER'
  | 'BACK'
  | 'ANKLE'
  | 'HIP'
  | 'FULL_BODY'
  | 'CERVICAL'
  | 'THORACIC'
  | 'LUMBAR'
  | 'ELBOW'
  | 'WRIST'
  | 'FOOT'

export type ClinicalTestConstruct =
  | 'STRENGTH'
  | 'ROM'
  | 'POWER'
  | 'BALANCE'
  | 'ENDURANCE'
  | 'PROVOCATION'
  | 'NEURODYNAMIC'
  | 'MOVEMENT_QUALITY'
  | 'SENSORIMOTOR'
  | 'FUNCTIONAL'
  | 'SPORT_SPECIFIC'
  | 'SENSIBILITY'
  | 'RESPIRATORY'
  | 'EFFUSION'
  | 'DECISION_RULE'

export type ClinicalTestSeed = {
  key: string
  name: string
  alternativeNames?: string[]
  bodyRegion: ClinicalTestBodyRegion[]
  tags?: string[]
  construct: ClinicalTestConstruct
  shortGoal: string
  execution: string
  benchmark: string
  applicableTo: string[]
  phases: number[]
  sourcePmids: string[]
  loE: number
  materialRequired?: string[]
  estimatedTimeMin?: number
}

export const CLINICAL_TESTS: ClinicalTestSeed[] = [
${arrayBody}
]
`

  writeFileSync(outPath, file, 'utf8')
  console.log(`Wrote ${outPath}`)
}

main()
