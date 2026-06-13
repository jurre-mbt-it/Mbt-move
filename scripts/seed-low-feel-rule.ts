/**
 * Eenmalige, idempotente upsert van ALLEEN de `low_feel` insight-regel.
 * Bewust los van de volledige `prisma/seed.ts` — die seedt ook test-users en
 * voorbeeld-oefeningen en mag dus NIET op productie draaien. Veilig om vaker
 * te draaien (upsert op signalType).
 *
 *   npx tsx scripts/seed-low-feel-rule.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

async function main() {
  const rule = {
    signalType: 'low_feel',
    category: 'pattern',
    defaultUrgency: 'MEDIUM' as const,
    defaultConfig: { feelBelow: 2, recentSessions: 3 },
    evidenceRefs: [
      'McLean BD et al. Neuromuscular, endocrine, and perceptual fatigue responses. IJSPP 2010 — subjectief welbevinden als herstelmarker.',
      'Saw AE, Main LC, Gastin PB. Monitoring the athlete training response: subjective self-report measures. BJSM 2016.',
    ],
  }
  const res = await prisma.insightRule.upsert({
    where: { signalType: rule.signalType },
    update: {
      category: rule.category,
      defaultUrgency: rule.defaultUrgency,
      defaultConfig: rule.defaultConfig,
      evidenceRefs: rule.evidenceRefs,
    },
    create: { ...rule, enabledGlobally: true },
  })
  console.log('low_feel rule upserted:', { signalType: res.signalType, urgency: res.defaultUrgency, enabled: res.enabledGlobally })
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
