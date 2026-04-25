/**
 * Eenmalige cleanup: verwijder alle users met een gegeven mail-domain
 * en de auteurs-content die hun delete blokkeert.
 *
 * Run: DOMAIN=@example.com PREVIEW=1 npx tsx scripts/cleanup-mock-patients.ts
 *      DOMAIN=@example.com           npx tsx scripts/cleanup-mock-patients.ts
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
const DOMAIN = process.env.DOMAIN ?? '@example.com'

async function main() {
  console.log(`Domain: ${DOMAIN}`)
  const targets = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  if (targets.length === 0) {
    console.log('Geen users gevonden met @example.com.')
    return
  }

  console.log(`\nGevonden: ${targets.length} user(s)`)
  for (const u of targets) {
    console.log(`  - ${u.email}  (${u.role})  ${u.name ?? ''}`)
  }

  const ids = targets.map(u => u.id)

  // Auteurs-content tellen
  const [exCount, prCount, wsCount, ecCount, iaCount, paCount, asTherapist, asPatient] = await Promise.all([
    prisma.exercise.count({ where: { createdById: { in: ids } } }),
    prisma.program.count({ where: { creatorId: { in: ids } } }),
    prisma.weekSchedule.count({ where: { creatorId: { in: ids } } }),
    prisma.exerciseCollection.count({ where: { therapistId: { in: ids } } }),
    prisma.insightAction.count({ where: { therapistId: { in: ids } } }),
    prisma.patientAssessment.count({ where: { therapistId: { in: ids } } }),
    prisma.patientTherapist.count({ where: { therapistId: { in: ids } } }),
    prisma.patientTherapist.count({ where: { patientId: { in: ids } } }),
  ])

  console.log('\nAuteurs-content die ook weg gaat:')
  console.log(`  exercises:            ${exCount}`)
  console.log(`  programs:             ${prCount}`)
  console.log(`  week_schedules:       ${wsCount}`)
  console.log(`  exercise_collections: ${ecCount}`)
  console.log(`  insight_actions:      ${iaCount}`)
  console.log(`  patient_assessments:  ${paCount}`)
  console.log('\nGekoppelde relaties (worden gecascadet via FK):')
  console.log(`  patient-therapist (als therapist): ${asTherapist}`)
  console.log(`  patient-therapist (als patient):   ${asPatient}`)

  if (PREVIEW) {
    console.log('\n[PREVIEW] niets verwijderd. Run zonder PREVIEW=1 om te bevestigen.')
    return
  }

  console.log('\nVerwijderen…')
  await prisma.$transaction([
    prisma.exercise.deleteMany({ where: { createdById: { in: ids } } }),
    prisma.program.deleteMany({ where: { creatorId: { in: ids } } }),
    prisma.weekSchedule.deleteMany({ where: { creatorId: { in: ids } } }),
    prisma.exerciseCollection.deleteMany({ where: { therapistId: { in: ids } } }),
    prisma.insightAction.deleteMany({ where: { therapistId: { in: ids } } }),
    prisma.patientAssessment.deleteMany({ where: { therapistId: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ])
  console.log('Klaar.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
