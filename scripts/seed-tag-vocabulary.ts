/**
 * Seed-script voor de globale hashtag-woordenlijst (TagVocabularyItem met
 * practiceId = NULL). Voedt de #-suggesties bij het loggen zodat gebruikers
 * vanaf de eerste keer een bestaande term aantikken i.p.v. een variant typen.
 *
 * Idempotent: upsert op (practiceId=NULL, name). Standalone:
 *   npx tsx scripts/seed-tag-vocabulary.ts
 */
import type { PrismaClient } from '@prisma/client'
import { PrismaClient as PrismaClientCtor } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { normalizeTag } from '../src/lib/tags'

// Veelvoorkomende klacht-/regio-termen (fysio/sport). display = nette vorm.
const VOCAB = [
  'achillespees', 'kuit', 'hamstring', 'quadriceps', 'lies', 'adductoren',
  'knie', 'patellapees', 'voorste-kruisband', 'meniscus', 'enkel', 'voet',
  'plantaire-fascie', 'scheenbeen', 'heup', 'bilspier', 'lage-rug',
  'onderrug', 'nek', 'schouder', 'rotatorcuff', 'bicepspees', 'elleboog',
  'tenniselleboog', 'golferselleboog', 'pols', 'hand', 'bovenrug',
]

export async function seedTagVocabulary(prisma: PrismaClient): Promise<void> {
  let created = 0
  let skipped = 0
  for (const display of VOCAB) {
    const name = normalizeTag(display)
    const existing = await prisma.tagVocabularyItem.findFirst({
      where: { practiceId: null, name },
      select: { id: true },
    })
    if (existing) {
      skipped++
      continue
    }
    await prisma.tagVocabularyItem.create({
      data: { id: crypto.randomUUID(), practiceId: null, name, display },
    })
    created++
  }
  console.log(`✓ Tag-woordenlijst: ${created} nieuw, ${skipped} bestond al (${VOCAB.length} totaal)`)
}

function createStandalonePrisma(): PrismaClient {
  config({ path: resolve(process.cwd(), '.env.local') })
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClientCtor()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClientCtor({ adapter: new PrismaPg(pool) })
}

if (require.main === module) {
  const prisma = createStandalonePrisma()
  seedTagVocabulary(prisma)
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
