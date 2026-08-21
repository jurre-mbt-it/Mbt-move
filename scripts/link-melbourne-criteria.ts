/**
 * Koppelt de Melbourne VKB-criteria aan globale catalogus-testen.
 *
 * Gecureerde mapping, GEEN fuzzy matching: alleen paren waarvan doel en
 * meetmethode echt hetzelfde zijn. Combinatie-criteria (bv. "Kracht —
 * quadriceps & hamstrings", één criterium over twee testen) blijven bewust
 * ongekoppeld; splitsen is een inhoudelijke beslissing voor de praktijk.
 * ROM-criteria blijven ongekoppeld: hun fase-doelen (>120°, 135°) wijken af
 * van de generieke zones op het catalogus-item.
 *
 * Idempotent: opnieuw draaien is veilig.
 *
 *   npx tsx scripts/link-melbourne-criteria.ts
 */
import type { PrismaClient } from '@prisma/client'
import { PrismaClient as PrismaClientCtor } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'node:path'

const PROTOCOL_KEY = 'melbourne-acl-2'

/**
 * criterium-naam (exact zoals geseed) → catalogus-key. Geldt voor ALLE fases
 * waarin een criterium met die naam voorkomt; de hop-doelen zijn in elke fase
 * LSI-gebaseerd en passen bij de catalogus-zones (oranje ≥ 80, groen ≥ 90).
 */
const MAPPING: Record<string, string> = {
  'Single Hop Test': 'single-leg-hop',
  'Triple Hop Test': 'triple-hop',
  'Side Hop Test': 'side-hop',
}

export async function linkMelbourneCriteria(prisma: PrismaClient): Promise<void> {
  const items = await prisma.testCatalogItem.findMany({
    where: { key: { in: Object.values(MAPPING) }, practiceId: null },
    select: { id: true, key: true, name: true },
  })
  const itemPerKey = new Map(items.map((i) => [i.key!, i]))

  for (const [criteriumNaam, catalogKey] of Object.entries(MAPPING)) {
    const item = itemPerKey.get(catalogKey)
    if (!item) {
      console.warn(`! catalogus-test '${catalogKey}' niet gevonden, overslaan`)
      continue
    }
    const res = await prisma.rehabCriterion.updateMany({
      where: {
        name: criteriumNaam,
        phase: { protocol: { key: PROTOCOL_KEY } },
      },
      data: { catalogItemId: item.id },
    })
    console.log(`✓ '${criteriumNaam}' → ${item.name} (${res.count} criteria, alle fases)`)
  }

  const totaal = await prisma.rehabCriterion.count({ where: { catalogItemId: { not: null } } })
  console.log(`\nGekoppelde criteria in totaal: ${totaal}`)
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
  linkMelbourneCriteria(prisma)
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
