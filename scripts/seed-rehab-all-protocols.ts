/**
 * Seed alle 6 extra revalidatie-protocollen tegen productie DB.
 * Idempotent — upsert per `key` / `(protocolId, order)`.
 *
 * Protocollen:
 *   - achillespees-ruptuur-postop
 *   - laterale-enkelbandreconstructie
 *   - heuparthroscopie-fai
 *   - totale-heupprothese
 *   - bankart-reparatie
 *   - rotatorcuff-reparatie
 *
 * Melbourne VKB staat in seed-rehab-melbourne-acl.ts.
 */
import { PrismaClient, RehabCriterionInputType } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'
import {
  HIP_ARTHROPLASTY_PROTOCOL,
  BANKART_PROTOCOL,
  ROTATOR_CUFF_PROTOCOL,
} from './rehab-protocols-batch1'
import {
  ACHILLES_RUPTURE_PROTOCOL,
  LATERAL_ANKLE_RECONSTRUCTION_PROTOCOL,
  HIP_FAI_PROTOCOL,
} from './rehab-protocols-batch2'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

type CriterionSeed = {
  name: string
  testDescription: string
  reference?: string
  targetValue: string
  targetUnit?: string
  inputType: string
  isBonus?: boolean
}

type PhaseSeed = {
  order: number
  shortName: string
  name: string
  description?: string
  keyGoals: string[]
  typicalStartWeek: number | null
  typicalEndWeek: number | null
  criteria: CriterionSeed[]
}

type ProtocolBundle = {
  protocol: {
    key: string
    name: string
    description?: string
    specialty: string
    sourceReference?: string
  }
  phases: PhaseSeed[]
}

const ALL_PROTOCOLS: ProtocolBundle[] = [
  ACHILLES_RUPTURE_PROTOCOL as ProtocolBundle,
  LATERAL_ANKLE_RECONSTRUCTION_PROTOCOL as ProtocolBundle,
  HIP_FAI_PROTOCOL as ProtocolBundle,
  HIP_ARTHROPLASTY_PROTOCOL as ProtocolBundle,
  BANKART_PROTOCOL as ProtocolBundle,
  ROTATOR_CUFF_PROTOCOL as ProtocolBundle,
]

async function seedProtocol(bundle: ProtocolBundle) {
  const { protocol: p, phases } = bundle
  console.log(`\n[${p.key}] ${p.name}`)

  const protocol = await prisma.rehabProtocol.upsert({
    where: { key: p.key },
    update: {
      name: p.name,
      description: p.description,
      specialty: p.specialty,
      sourceReference: p.sourceReference,
      isActive: true,
    },
    create: {
      key: p.key,
      name: p.name,
      description: p.description,
      specialty: p.specialty,
      sourceReference: p.sourceReference,
      isActive: true,
    },
  })

  let phasesUpserted = 0
  let criteriaCreated = 0
  let criteriaUpdated = 0

  for (const phase of phases) {
    const existingPhase = await prisma.rehabPhase.findUnique({
      where: { protocolId_order: { protocolId: protocol.id, order: phase.order } },
    })
    const phaseRow = existingPhase
      ? await prisma.rehabPhase.update({
          where: { id: existingPhase.id },
          data: {
            shortName: phase.shortName,
            name: phase.name,
            description: phase.description,
            keyGoals: phase.keyGoals,
            typicalStartWeek: phase.typicalStartWeek,
            typicalEndWeek: phase.typicalEndWeek,
          },
        })
      : await prisma.rehabPhase.create({
          data: {
            protocolId: protocol.id,
            order: phase.order,
            shortName: phase.shortName,
            name: phase.name,
            description: phase.description,
            keyGoals: phase.keyGoals,
            typicalStartWeek: phase.typicalStartWeek,
            typicalEndWeek: phase.typicalEndWeek,
          },
        })
    phasesUpserted++

    for (let i = 0; i < phase.criteria.length; i++) {
      const c = phase.criteria[i]
      const existingCrit = await prisma.rehabCriterion.findUnique({
        where: { phaseId_order: { phaseId: phaseRow.id, order: i } },
      })
      if (existingCrit) {
        await prisma.rehabCriterion.update({
          where: { id: existingCrit.id },
          data: {
            name: c.name,
            testDescription: c.testDescription,
            reference: c.reference ?? null,
            targetValue: c.targetValue,
            targetUnit: c.targetUnit ?? null,
            inputType: c.inputType as RehabCriterionInputType,
            isBonus: c.isBonus ?? false,
          },
        })
        criteriaUpdated++
      } else {
        await prisma.rehabCriterion.create({
          data: {
            phaseId: phaseRow.id,
            order: i,
            name: c.name,
            testDescription: c.testDescription,
            reference: c.reference ?? null,
            targetValue: c.targetValue,
            targetUnit: c.targetUnit ?? null,
            inputType: c.inputType as RehabCriterionInputType,
            isBonus: c.isBonus ?? false,
          },
        })
        criteriaCreated++
      }
    }
  }
  console.log(`  phases: ${phasesUpserted} · criteria: ${criteriaCreated} created, ${criteriaUpdated} updated`)
}

async function main() {
  console.log(`Seeding ${ALL_PROTOCOLS.length} rehabilitation protocols...`)
  for (const bundle of ALL_PROTOCOLS) {
    await seedProtocol(bundle)
  }
  console.log('\nDone.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
