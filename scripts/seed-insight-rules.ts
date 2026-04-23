/**
 * Seed CIE insight_rules catalog into prod.
 * Idempotent — upserts by signalType. Safe to run multiple times.
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

const INSIGHT_RULES = [
  {
    signalType: 'pain_flare',
    category: 'pain',
    defaultUrgency: 'HIGH' as const,
    defaultConfig: {
      deltaAbove: 2,
      recentSessions: 3,
      baselineWindowDays: 14,
    },
    evidenceRefs: [
      'Silbernagel KG et al. Scand J Med Sci Sports 2001 — pain-monitoring model.',
      'Smith BE et al. BJSM 2017 — pain-monitoring model for exercise prescription.',
    ],
  },
  {
    signalType: 'pain_red_flag',
    category: 'pain',
    defaultUrgency: 'CRITICAL' as const,
    defaultConfig: {
      singleSessionThreshold: 8,
      consecutiveSessionsThreshold: 6,
      consecutiveSessionsCount: 2,
      dedupHours: 24,
    },
    evidenceRefs: [
      'Thomeé R. Phys Ther 1997 — patellofemoral pain treatment approach.',
    ],
  },
  {
    signalType: 'ready_for_progression',
    category: 'progression',
    defaultUrgency: 'LOW' as const,
    defaultConfig: {
      painBelow: 3,
      feedbackPositiveThreshold: 2,
      recentSessions: 3,
      adherencePct: 80,
      adherenceWindowDays: 7,
    },
    evidenceRefs: [
      'Saragiotto BT et al. Cochrane 2016 — progressive overload principle.',
    ],
  },
  {
    signalType: 'plateau',
    category: 'progression',
    defaultUrgency: 'LOW' as const,
    defaultConfig: {
      daysWithoutChange: 14,
      metrics: ['pain', 'smiley', 'load'],
    },
    evidenceRefs: [
      'Bourdon PC et al. IJSPP 2017 — athlete load monitoring consensus.',
    ],
  },
  {
    signalType: 'adherence_drop',
    category: 'adherence',
    defaultUrgency: 'MEDIUM' as const,
    defaultConfig: {
      recentWindowDays: 7,
      baselineWindowDays: 14,
      dropRatio: 0.5,
      silentDays: 5,
    },
    evidenceRefs: [
      'Jack K et al. Man Ther 2010 — barriers to physiotherapy adherence.',
    ],
  },
  {
    signalType: 'exercise_specific_pain',
    category: 'pattern',
    defaultUrgency: 'MEDIUM' as const,
    defaultConfig: {
      deltaAbove: 2,
      minExecutions: 3,
    },
    evidenceRefs: [
      'Cook JL, Purdam CR. BJSM 2009 — tendon pathology continuum.',
    ],
  },
]

async function main() {
  let created = 0
  let updated = 0
  for (const rule of INSIGHT_RULES) {
    const existing = await prisma.insightRule.findUnique({ where: { signalType: rule.signalType } })
    if (existing) {
      await prisma.insightRule.update({
        where: { signalType: rule.signalType },
        data: {
          category: rule.category,
          defaultUrgency: rule.defaultUrgency,
          defaultConfig: rule.defaultConfig,
          evidenceRefs: rule.evidenceRefs,
        },
      })
      updated++
    } else {
      await prisma.insightRule.create({
        data: {
          signalType: rule.signalType,
          category: rule.category,
          defaultUrgency: rule.defaultUrgency,
          defaultConfig: rule.defaultConfig,
          evidenceRefs: rule.evidenceRefs,
          enabledGlobally: true,
        },
      })
      created++
    }
  }
  console.log(`Insight rules: ${created} created, ${updated} updated`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
