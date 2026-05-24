/**
 * Seed-script voor de ClinicalTest library.
 *
 * Idempotent: upsert per `key`. Re-runs zijn veilig en geven exact
 * dezelfde state als run #1. Aanroepbaar via `prisma db seed` (de root
 * `prisma/seed.ts` calls `seedClinicalTests`) of standalone:
 *
 *   npx tsx scripts/seed-clinical-tests.ts
 */
import type { PrismaClient } from '@prisma/client'
import { PrismaClient as PrismaClientCtor } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { CLINICAL_TESTS } from './clinical-tests-data'

export async function seedClinicalTests(prisma: PrismaClient): Promise<void> {
  let created = 0
  let updated = 0

  for (const t of CLINICAL_TESTS) {
    const result = await prisma.clinicalTest.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        name: t.name,
        alternativeNames: t.alternativeNames ?? [],
        bodyRegion: t.bodyRegion,
        tags: t.tags ?? [],
        construct: t.construct,
        shortGoal: t.shortGoal,
        execution: t.execution,
        benchmark: t.benchmark,
        applicableTo: t.applicableTo,
        phases: t.phases,
        sourcePmids: t.sourcePmids,
        loE: t.loE,
        materialRequired: t.materialRequired ?? [],
        estimatedTimeMin: t.estimatedTimeMin ?? null,
      },
      update: {
        name: t.name,
        alternativeNames: t.alternativeNames ?? [],
        bodyRegion: t.bodyRegion,
        tags: t.tags ?? [],
        construct: t.construct,
        shortGoal: t.shortGoal,
        execution: t.execution,
        benchmark: t.benchmark,
        applicableTo: t.applicableTo,
        phases: t.phases,
        sourcePmids: t.sourcePmids,
        loE: t.loE,
        materialRequired: t.materialRequired ?? [],
        estimatedTimeMin: t.estimatedTimeMin ?? null,
      },
      select: { createdAt: true, updatedAt: true },
    })
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++
    else updated++
  }

  console.log(`✓ Clinical tests: ${created} created, ${updated} updated (${CLINICAL_TESTS.length} total)`)
}

/**
 * Bouw een PrismaClient die werkt voor zowel localhost (puur driver) als
 * remote/Supabase (via @prisma/adapter-pg, want de pgbouncer-pooler accepteert
 * geen prepared statements). Zelfde patroon als prisma/seed.ts.
 */
function createStandalonePrisma(): PrismaClient {
  config({ path: resolve(process.cwd(), '.env.local') })
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClientCtor()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClientCtor({ adapter: new PrismaPg(pool) })
}

// Standalone-runner — alleen actief als dit script direct wordt aangeroepen.
if (require.main === module) {
  const prisma = createStandalonePrisma()
  seedClinicalTests(prisma)
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
