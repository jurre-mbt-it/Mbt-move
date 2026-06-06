/**
 * Seed-script voor de Testrapport-catalogus + batterijen.
 *
 * Idempotent: upsert per `key`. Re-runs zijn veilig. Aanroepbaar via de root
 * `prisma/seed.ts` of standalone:
 *
 *   npx tsx scripts/seed-test-catalog.ts
 */
import type { PrismaClient } from '@prisma/client'
import { PrismaClient as PrismaClientCtor } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { TEST_CATALOG, TEST_BATTERIES } from './test-catalog-data'

export async function seedTestCatalog(prisma: PrismaClient): Promise<void> {
  let created = 0
  let updated = 0

  const idByKey = new Map<string, string>()
  for (const t of TEST_CATALOG) {
    const { key, ...data } = t
    const result = await prisma.testCatalogItem.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
      select: { id: true, createdAt: true, updatedAt: true },
    })
    idByKey.set(key, result.id)
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++
    else updated++
  }
  console.log(`✓ Test-catalogus: ${created} created, ${updated} updated (${TEST_CATALOG.length} total)`)

  for (const b of TEST_BATTERIES) {
    const battery = await prisma.testBattery.upsert({
      where: { key: b.key },
      create: { key: b.key, name: b.name, description: b.description ?? null },
      update: { name: b.name, description: b.description ?? null },
      select: { id: true },
    })
    // Items volledig vervangen (idempotent + reflecteert volgorde-wijzigingen).
    await prisma.testBatteryItem.deleteMany({ where: { batteryId: battery.id } })
    await prisma.testBatteryItem.createMany({
      data: b.itemKeys
        .map((k, order) => ({ batteryId: battery.id, catalogItemId: idByKey.get(k)!, order }))
        .filter((row) => row.catalogItemId),
    })
    console.log(`✓ Batterij "${b.name}": ${b.itemKeys.length} tests`)
  }
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
  seedTestCatalog(prisma)
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
