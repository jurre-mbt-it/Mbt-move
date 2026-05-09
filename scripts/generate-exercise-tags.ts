/**
 * Eenmalig: enricht `Exercise.tags` met NL synoniemen via Claude Haiku 4.5.
 *
 * Per oefening krijgt Claude de naam + bestaande tags. Hij geeft 3-5 NL
 * synoniemen die er NOG NIET in zitten. We mergen + dedupen + cappen op 8 tags.
 *
 * Idempotent-ish: skipt oefeningen die al ≥6 tags hebben (waarschijnlijk al
 * verrijkt). Override met `--force`. Voor alleen-leeg: `--empty-only`.
 *
 * Run:
 *   npx tsx scripts/generate-exercise-tags.ts [--dry-run] [--limit=N]
 *                                              [--empty-only] [--force]
 *
 * Vereist: ANTHROPIC_API_KEY + DATABASE_URL/DIRECT_URL in .env.local.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
// `override: true` omdat sommige shells (bv. Claude Code) ANTHROPIC_API_KEY
// als lege string vooraf zetten — zonder override leest de runtime alsnog
// dat lege veld ipv onze .env.local waarde.
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) throw new Error('DIRECT_URL of DATABASE_URL ontbreekt')
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('ANTHROPIC_API_KEY ontbreekt in .env.local')

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const emptyOnly = args.has('--empty-only')
const force = args.has('--force')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined

const SKIP_THRESHOLD = 6  // ≥6 tags = waarschijnlijk al verrijkt
const MAX_TAGS = 8        // cap na merge

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const SYSTEM_PROMPT = `Je bent een fysiotherapeut-assistent. Je krijgt de naam van een oefening (NL of EN) plus eventuele bestaande zoek-tags, en je geeft 3 tot 5 NL synoniemen of alternatieve zoektermen die er nog NIET in staan.

Regels:
- Geef ALLEEN een JSON-array van strings, geen uitleg, geen markdown-fences.
- Synoniemen zijn lowercase, zonder leestekens.
- Mix algemene anatomische termen ("zijwaarts heffen", "abductie", "heupspier") met spreektaal-varianten ("squatten", "side plank op knie").
- Voeg ALLEEN termen toe die nog niet in de bestaande tags staan.
- Geen exacte duplicaten van woorden uit de oefening-naam zelf.
- Ook geen Engelse termen tenzij die in NL fysio-context veel gebruikt worden (bv "side plank", "deadlift", "hinge").
- Maximaal 5 termen; liever 3 goede dan 5 met een rare bal.
- Als de bestaande tags al alle voor de hand liggende synoniemen dekken, mag je een lege array teruggeven: [].

Voorbeeld input: "Heupabductie - sideplank gebogen been" met bestaande tags ["abductie","heup"]
Voorbeeld output: ["zijwaarts heffen","glute medius","side plank op knie","heupspier"]

Voorbeeld input: "Back Squat" met bestaande tags ["squat","benen","compound"]
Voorbeeld output: ["kniebuiging","quadriceps","hurken met stang","lower body"]`

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

async function generateTagsFor(name: string, existingTags: string[]): Promise<string[]> {
  const userPayload = existingTags.length
    ? `Oefening: "${name}"\nBestaande tags: ${JSON.stringify(existingTags)}`
    : `Oefening: "${name}"`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPayload }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`)
  }
  const json = (await res.json()) as ClaudeResponse
  const text = json.content?.[0]?.text?.trim() ?? ''
  // Verwacht: ["term1","term2",...]. Soms zet 'ie alsnog wat extra prose;
  // pak het eerste JSON-array stuk eruit als safety net.
  const match = text.match(/\[[\s\S]*?\]/)
  const raw = match ? match[0] : text
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Geen geldige JSON-array van Claude: "${text.slice(0, 100)}"`)
  }
  if (!Array.isArray(parsed)) throw new Error(`Geen array maar ${typeof parsed}: ${text.slice(0, 80)}`)
  // Schoonmaken: strings only, lowercase, trim, dedupe, max 5.
  const cleaned = Array.from(new Set(
    parsed
      .filter((v): v is string => typeof v === 'string')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0 && s.length < 50)
  )).slice(0, 5)
  return cleaned
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const mode = emptyOnly ? 'alleen lege' : force ? 'alle (force)' : 'alle (skip ≥6 tags)'
  console.log(`\n🔍 Mode: ${mode}${limit ? ` · limit ${limit}` : ''}`)
  const all = await prisma.exercise.findMany({
    where: emptyOnly ? { tags: { isEmpty: true } } : {},
    select: { id: true, name: true, tags: true },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  })
  // Filter: skip al-verrijkte oefeningen tenzij --force
  const todo = all.filter(ex => emptyOnly || force || ex.tags.length < SKIP_THRESHOLD)
  const skipped = all.length - todo.length
  console.log(`📋 ${todo.length} te verwerken, ${skipped} overgeslagen (≥${SKIP_THRESHOLD} tags).`)

  if (dryRun) {
    console.log('🧪 DRY RUN — eerste 5 oefeningen die we zouden enrichen:')
    for (const ex of todo.slice(0, 5)) {
      console.log(`   • ${ex.name}  [huidige: ${ex.tags.join(', ') || '(leeg)'}]`)
    }
    return
  }

  let ok = 0
  let added = 0
  let unchanged = 0
  let failed = 0

  for (let i = 0; i < todo.length; i++) {
    const ex = todo[i]
    const progress = `[${i + 1}/${todo.length}]`
    try {
      const newTags = await generateTagsFor(ex.name, ex.tags)
      // Merge: bestaande + nieuwe, dedupe (case-insensitive), cap.
      const existingLower = new Set(ex.tags.map(t => t.toLowerCase()))
      const trulyNew = newTags.filter(t => !existingLower.has(t.toLowerCase()))
      if (trulyNew.length === 0) {
        console.log(`${progress} = ${ex.name} — geen nieuwe synoniemen`)
        unchanged++
      } else {
        const merged = [...ex.tags, ...trulyNew].slice(0, MAX_TAGS)
        await prisma.exercise.update({
          where: { id: ex.id },
          data: { tags: merged },
        })
        console.log(`${progress} ✓ ${ex.name}  +[${trulyNew.join(', ')}]`)
        ok++
        added += trulyNew.length
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${progress} ✗ ${ex.name} — ${msg}`)
      failed++
    }
    await sleep(350)  // ≈170 RPM, ruim onder Tier-1 limits
  }

  console.log(`\n✅ Klaar.`)
  console.log(`   ${ok} bijgewerkt (+${added} nieuwe tags totaal)`)
  console.log(`   ${unchanged} ongewijzigd (al goed)`)
  console.log(`   ${failed} mislukt`)
  console.log(`   ${skipped} overgeslagen (≥${SKIP_THRESHOLD} tags)`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
