/**
 * Seed bilaterale HHD-kracht criteria met Newton + LSI auto-stoplicht
 * naar de 5 onderlichaam revalidatie-protocollen.
 *
 * Benchmarks gebaseerd op peer-reviewed literatuur:
 *   - Thorborg K et al. BJSM 2010 — Reference values hip muscle strength HHD
 *     (gemiddelde 2.0-3.0 N/kg; 70kg adult → 140-210N)
 *   - Mentiplay BF et al. PLoS One 2015 — HHD lower limb normative
 *     (quadriceps ~3.5-5.0 N/kg; hamstring ~2.0-2.5 N/kg)
 *   - Grindem H et al. BJSM 2016 — LSI ≥90% als RTS-drempel reduceert
 *     re-injury risk met 84% na ACL
 *   - Harøy J et al. BJSM 2019 — Copenhagen adductor protocol,
 *     adductor:abductor ratio ~1:1 gezond
 *
 * Per criterium:
 *   - Green:  ≥150N per zijde + LSI ≥90%  (RTS / sport-ready)
 *   - Orange: ≥120N per zijde + LSI ≥80%  (bijna / rehab-ready)
 *   - Red:    onder dat = deficiet
 *
 * Quadriceps heeft hogere Newton-drempels (200/160) omdat quad-kracht
 * hoger ligt bij gezonde adults.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

type HHDCriterion = {
  name: string
  testDescription: string
  reference: string
  targetValue: string
  newtonMinGreen: number
  newtonMinOrange: number
  lsiMinGreen: number
  lsiMinOrange: number
}

// Vijf HHD-kracht criteria; worden aan elke onderlichaam-protocol in de
// strength-fase toegevoegd.
const HHD_CRITERIA: HHDCriterion[] = [
  {
    name: 'Knie extensie — isometrische kracht (HHD)',
    testDescription:
      'Hand-held dynamometer, zit op tafel met heup en knie 90°. HHD op voorzijde scheenbeen, proximaal van de enkel. "Maximaal strekken" — 3-5 sec isometrische contractie, beste van 3 pogingen per zijde.',
    reference: 'Mentiplay et al. (2015) PLoS One · Thorborg et al. (2010) BJSM',
    targetValue: 'Beide zijden ≥200N + LSI ≥90%',
    newtonMinGreen: 200,
    newtonMinOrange: 160,
    lsiMinGreen: 90,
    lsiMinOrange: 80,
  },
  {
    name: 'Knie flexie — isometrische kracht (HHD)',
    testDescription:
      'HHD, zit op tafel met heup en knie 90°. HHD op achterkant kuit, proximaal van de hiel. "Maximaal buigen" — 3-5 sec isometrische contractie, beste van 3 pogingen per zijde.',
    reference: 'Mentiplay et al. (2015) PLoS One · Thorborg et al. (2010) BJSM',
    targetValue: 'Beide zijden ≥150N + LSI ≥90%',
    newtonMinGreen: 150,
    newtonMinOrange: 120,
    lsiMinGreen: 90,
    lsiMinOrange: 80,
  },
  {
    name: 'Heup flexie (ruglig) — isometrische kracht (HHD)',
    testDescription:
      'HHD, ruglig met heup 90° geflecteerd en knie 90°. HHD op voorzijde dijbeen, distaal (5 cm boven knie). "Duw het been naar je borst" — 3-5 sec isometrisch.',
    reference: 'Thorborg et al. (2010) BJSM — Hip reference values',
    targetValue: 'Beide zijden ≥150N + LSI ≥90%',
    newtonMinGreen: 150,
    newtonMinOrange: 120,
    lsiMinGreen: 90,
    lsiMinOrange: 80,
  },
  {
    name: 'Heup abductie (zijlig) — isometrische kracht (HHD)',
    testDescription:
      'HHD, zijlig met te testen been boven. Heup neutraal, knie gestrekt. HHD 5 cm boven laterale malleolus. "Til been van de tafel" — 3-5 sec isometrisch tegen de HHD.',
    reference: 'Thorborg et al. (2010) BJSM · Whittaker et al. (2018) BJSM',
    targetValue: 'Beide zijden ≥150N + LSI ≥90% (1:1 ratio met adductoren)',
    newtonMinGreen: 150,
    newtonMinOrange: 120,
    lsiMinGreen: 90,
    lsiMinOrange: 80,
  },
  {
    name: 'Heup adductie (zijlig, long-lever) — isometrische kracht (HHD)',
    testDescription:
      'HHD, zijlig met te testen been ONDER (bovenste been gesteund op bank of partner). Knie gestrekt. HHD 5 cm boven mediale malleolus. "Squeeze been naar de tafel omhoog" — 3-5 sec isometrisch.',
    reference: 'Thorborg et al. (2011) AJSM · Harøy et al. (2019) BJSM — Copenhagen protocol',
    targetValue: 'Beide zijden ≥150N + LSI ≥90% (1:1 ratio met abductoren)',
    newtonMinGreen: 150,
    newtonMinOrange: 120,
    lsiMinGreen: 90,
    lsiMinOrange: 80,
  },
]

// Per protocol: de fase-order waaraan we deze 5 criteria toevoegen.
// Fase-order verwijst naar RehabPhase.order binnen dat specifieke protocol.
const TARGETS: { protocolKey: string; phaseOrder: number }[] = [
  { protocolKey: 'melbourne-acl-2', phaseOrder: 2 }, // Fase 2 — Kracht en NM Controle
  { protocolKey: 'achillespees-ruptuur-postop', phaseOrder: 3 }, // Fase 3 — Functionele Kracht
  { protocolKey: 'laterale-enkelbandreconstructie', phaseOrder: 3 }, // Fase 3 — NM Controle & Functionele Kracht
  { protocolKey: 'heuparthroscopie-fai', phaseOrder: 3 }, // Fase 3 — Functionele Kracht
  { protocolKey: 'totale-heupprothese', phaseOrder: 3 }, // Fase 3 — Functionele Kracht
]

async function main() {
  for (const target of TARGETS) {
    const protocol = await prisma.rehabProtocol.findUnique({
      where: { key: target.protocolKey },
    })
    if (!protocol) {
      console.warn(`Protocol niet gevonden: ${target.protocolKey} — skip`)
      continue
    }
    const phase = await prisma.rehabPhase.findUnique({
      where: { protocolId_order: { protocolId: protocol.id, order: target.phaseOrder } },
    })
    if (!phase) {
      console.warn(`Fase order ${target.phaseOrder} niet gevonden voor ${protocol.key} — skip`)
      continue
    }

    console.log(`\n[${protocol.key}] fase ${phase.shortName} — ${phase.name}`)
    let created = 0
    let updated = 0

    // Start order na laatste bestaande criterium in deze fase
    const existingMaxOrder = await prisma.rehabCriterion.findFirst({
      where: { phaseId: phase.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    let nextOrder = (existingMaxOrder?.order ?? -1) + 1

    for (const hc of HHD_CRITERIA) {
      // Upsert op naam binnen deze fase
      const existing = await prisma.rehabCriterion.findFirst({
        where: { phaseId: phase.id, name: hc.name },
      })
      if (existing) {
        await prisma.rehabCriterion.update({
          where: { id: existing.id },
          data: {
            testDescription: hc.testDescription,
            reference: hc.reference,
            targetValue: hc.targetValue,
            targetUnit: 'N',
            inputType: 'NUMERIC',
            isBonus: false,
            isBilateral: true,
            newtonMinGreen: hc.newtonMinGreen,
            newtonMinOrange: hc.newtonMinOrange,
            lsiMinGreen: hc.lsiMinGreen,
            lsiMinOrange: hc.lsiMinOrange,
          },
        })
        updated++
      } else {
        await prisma.rehabCriterion.create({
          data: {
            phaseId: phase.id,
            order: nextOrder++,
            name: hc.name,
            testDescription: hc.testDescription,
            reference: hc.reference,
            targetValue: hc.targetValue,
            targetUnit: 'N',
            inputType: 'NUMERIC',
            isBonus: false,
            isBilateral: true,
            newtonMinGreen: hc.newtonMinGreen,
            newtonMinOrange: hc.newtonMinOrange,
            lsiMinGreen: hc.lsiMinGreen,
            lsiMinOrange: hc.lsiMinOrange,
          },
        })
        created++
      }
    }
    console.log(`  ${created} created, ${updated} updated`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
