/**
 * Eenmalig: verwijder een user op email. Auteurs-content wordt eerst
 * overgezet naar de admin (jurre@movementbasedtherapy.nl) zodat
 * cascade-deletes geen programma's of oefeningen weghalen.
 *
 * Run: EMAIL=foo@bar.com PREVIEW=1 npx tsx scripts/delete-user.ts
 *      EMAIL=foo@bar.com           npx tsx scripts/delete-user.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const pool = new Pool({
  connectionString: process.env.DIRECT_URL!,
  ssl: { rejectUnauthorized: false },
})
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
const PREVIEW = process.env.PREVIEW === '1'
const EMAIL = process.env.EMAIL
const REASSIGN_TO_EMAIL = process.env.REASSIGN_TO ?? 'jurre@movementbasedtherapy.nl'

async function main() {
  if (!EMAIL) {
    console.error('EMAIL env var is verplicht')
    process.exit(1)
  }

  const target = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true, role: true, name: true },
  })
  if (!target) {
    console.log(`Geen user gevonden voor ${EMAIL}`)
    return
  }

  const reassignTo = await prisma.user.findUnique({
    where: { email: REASSIGN_TO_EMAIL },
    select: { id: true, email: true },
  })
  if (!reassignTo) {
    console.error(`Reassign-target ${REASSIGN_TO_EMAIL} niet gevonden — abort.`)
    process.exit(1)
  }
  if (reassignTo.id === target.id) {
    console.error('Kan niet aan zichzelf reassignen — abort.')
    process.exit(1)
  }

  console.log(`Te verwijderen: ${target.email} (${target.role}) "${target.name ?? ''}"`)
  console.log(`Eigenaarschap gaat naar: ${reassignTo.email}`)

  const [ex, pr, ws, ec, ia, pa] = await Promise.all([
    prisma.exercise.count({ where: { createdById: target.id } }),
    prisma.program.count({ where: { creatorId: target.id } }),
    prisma.weekSchedule.count({ where: { creatorId: target.id } }),
    prisma.exerciseCollection.count({ where: { therapistId: target.id } }),
    prisma.insightAction.count({ where: { therapistId: target.id } }),
    prisma.patientAssessment.count({ where: { therapistId: target.id } }),
  ])
  console.log('\nOver te zetten:')
  console.log(`  exercises:            ${ex}`)
  console.log(`  programs:             ${pr}`)
  console.log(`  week_schedules:       ${ws}`)
  console.log(`  exercise_collections: ${ec}`)
  console.log(`  insight_actions:      ${ia}`)
  console.log(`  patient_assessments:  ${pa}`)

  if (PREVIEW) {
    console.log('\n[PREVIEW] niets veranderd. Run zonder PREVIEW=1 om door te zetten.')
    return
  }

  console.log('\nReassignen + delete in transactie…')
  await prisma.$transaction([
    prisma.exercise.updateMany({ where: { createdById: target.id }, data: { createdById: reassignTo.id } }),
    prisma.program.updateMany({ where: { creatorId: target.id }, data: { creatorId: reassignTo.id } }),
    prisma.weekSchedule.updateMany({ where: { creatorId: target.id }, data: { creatorId: reassignTo.id } }),
    prisma.exerciseCollection.updateMany({ where: { therapistId: target.id }, data: { therapistId: reassignTo.id } }),
    prisma.insightAction.updateMany({ where: { therapistId: target.id }, data: { therapistId: reassignTo.id } }),
    prisma.patientAssessment.updateMany({ where: { therapistId: target.id }, data: { therapistId: reassignTo.id } }),
    prisma.user.delete({ where: { id: target.id } }),
  ])
  console.log('Klaar.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
