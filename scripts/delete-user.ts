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

/**
 * Elke foreign key naar `users` die de delete blokkeert, en die dit script dus
 * moet overzetten. Tabel.kolom zoals Postgres ze kent.
 *
 * Deze lijst is twee keer achtergelopen op de database, allebei de keren
 * onopgemerkt: de gdpr-cleanup-cron doet een kale `user.delete` in een
 * try/catch per gebruiker, dus de foreign-key-fout verdwijnt in de logs en het
 * AVG-verzoek blijft hangen zonder dat iemand het ziet. Eén testrapport of één
 * afgevinkt criterium is genoeg. Vandaar `controleerDekking()` hieronder: die
 * vraagt het de database in plaats van het geheugen.
 */
const GEDEKT = new Set([
  'educational_resources.createdById',
  'exercise_collections.therapistId',
  'exercises.createdById',
  'insight_actions.therapistId',
  'patient_assessments.therapistId',
  'patient_care_status.dischargedById',
  'patient_rehab_trackers.activatedById',
  'patient_test_assignments.assignedById',
  'patient_test_results.performedById',
  'programs.creatorId',
  'rehab_criterion_status.updatedById',
  'running_analyses.therapistId',
  'test_reports.therapistId',
  'week_plan_templates.creatorId',
  'week_schedules.creatorId',
])

/**
 * Vraag de database welke relaties de delete blokkeren en vergelijk dat met
 * wat dit script overzet. Draait vóór er iets gebeurt, ook in PREVIEW, want de
 * hele bedoeling is dat je het hóórt in plaats van dat het stil misgaat.
 *
 * Alleen NO ACTION ('a') en RESTRICT ('r') blokkeren. CASCADE en SET NULL
 * regelt Postgres zelf, dus die horen hier niet bij.
 */
async function controleerDekking() {
  const rows = await prisma.$queryRaw<{ tabel: string; kolom: string }[]>`
    SELECT t.relname AS tabel, a.attname AS kolom
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND rt.relname = 'users'
      AND n.nspname = 'public'
      AND c.confdeltype IN ('a', 'r')`

  const gevonden = rows.map((r) => `${r.tabel}.${r.kolom}`)
  const onbekend = gevonden.filter((k) => !GEDEKT.has(k)).sort()
  const verdwenen = [...GEDEKT].filter((k) => !gevonden.includes(k)).sort()

  if (onbekend.length > 0) {
    console.error('\nSTOP. De database heeft blokkerende relaties die dit script niet overzet:')
    for (const k of onbekend) console.error(`  ${k}`)
    console.error(
      '\nZonder die erbij faalt de delete met een foreign-key-fout, en in de' +
        '\ngdpr-cron gebeurt dat stil. Voeg ze toe aan GEDEKT en aan de transactie' +
        '\nhieronder, met dezelfde reassign-vorm als de rest.',
    )
    process.exit(1)
  }

  if (verdwenen.length > 0) {
    console.log('\nOpmerking: deze relaties staan in GEDEKT maar blokkeren niet meer')
    console.log('(op CASCADE of SET NULL gezet, of de tabel is weg). Ze overzetten kan')
    console.log('geen kwaad, maar ze mogen uit de lijst:')
    for (const k of verdwenen) console.log(`  ${k}`)
  }

  console.log(`\nDekkingscheck: ${gevonden.length} blokkerende relaties, allemaal afgedekt.`)
}

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

  await controleerDekking()

  const [ex, pr, ws, ec, ia, pa, cs, rt, rc, er, ta, tr, ra, rp, wp] = await Promise.all([
    prisma.exercise.count({ where: { createdById: target.id } }),
    prisma.program.count({ where: { creatorId: target.id } }),
    prisma.weekSchedule.count({ where: { creatorId: target.id } }),
    prisma.exerciseCollection.count({ where: { therapistId: target.id } }),
    prisma.insightAction.count({ where: { therapistId: target.id } }),
    prisma.patientAssessment.count({ where: { therapistId: target.id } }),
    prisma.patientCareStatus.count({ where: { dischargedById: target.id } }),
    prisma.patientRehabTracker.count({ where: { activatedById: target.id } }),
    prisma.rehabCriterionStatus.count({ where: { updatedById: target.id } }),
    prisma.educationalResource.count({ where: { createdById: target.id } }),
    prisma.patientTestAssignment.count({ where: { assignedById: target.id } }),
    prisma.patientTestResult.count({ where: { performedById: target.id } }),
    prisma.runningAnalysis.count({ where: { therapistId: target.id } }),
    prisma.testReport.count({ where: { therapistId: target.id } }),
    prisma.weekPlanTemplate.count({ where: { creatorId: target.id } }),
  ])
  console.log('\nOver te zetten:')
  console.log(`  exercises:                 ${ex}`)
  console.log(`  programs:                  ${pr}`)
  console.log(`  week_schedules:            ${ws}`)
  console.log(`  week_plan_templates:       ${wp}`)
  console.log(`  exercise_collections:      ${ec}`)
  console.log(`  educational_resources:     ${er}`)
  console.log(`  insight_actions:           ${ia}`)
  console.log(`  patient_assessments:       ${pa}`)
  console.log(`  patient_care_status:       ${cs}`)
  console.log(`  patient_rehab_trackers:    ${rt}`)
  console.log(`  rehab_criterion_status:    ${rc}`)
  console.log(`  patient_test_assignments:  ${ta}`)
  console.log(`  patient_test_results:      ${tr}`)
  console.log(`  test_reports:              ${rp}`)
  console.log(`  running_analyses:          ${ra}`)

  const klinisch = pa + cs + rt + rc + ta + tr + rp + ra
  if (klinisch > 0) {
    console.log(
      `\n  LET OP: ${klinisch} van deze rijen zijn klinische vastleggingen. Het` +
        `\n  auteurschap verschuift naar ${reassignTo.email}, wat betekent dat het` +
        `\n  dossier straks iemand noemt die de handeling niet heeft verricht. Dat` +
        `\n  is geen keuze maar een gevolg: de kolommen zijn NOT NULL, dus de rij` +
        `\n  bewaren en de naam wissen kan niet zonder migratie. De rijen zelf` +
        `\n  weggooien mag niet, want daar zit een bewaarplicht op.`,
    )
  }

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
    prisma.patientCareStatus.updateMany({ where: { dischargedById: target.id }, data: { dischargedById: reassignTo.id } }),
    prisma.patientRehabTracker.updateMany({ where: { activatedById: target.id }, data: { activatedById: reassignTo.id } }),
    prisma.rehabCriterionStatus.updateMany({ where: { updatedById: target.id }, data: { updatedById: reassignTo.id } }),
    prisma.educationalResource.updateMany({ where: { createdById: target.id }, data: { createdById: reassignTo.id } }),
    prisma.patientTestAssignment.updateMany({ where: { assignedById: target.id }, data: { assignedById: reassignTo.id } }),
    prisma.patientTestResult.updateMany({ where: { performedById: target.id }, data: { performedById: reassignTo.id } }),
    prisma.runningAnalysis.updateMany({ where: { therapistId: target.id }, data: { therapistId: reassignTo.id } }),
    prisma.testReport.updateMany({ where: { therapistId: target.id }, data: { therapistId: reassignTo.id } }),
    prisma.weekPlanTemplate.updateMany({ where: { creatorId: target.id }, data: { creatorId: reassignTo.id } }),
    prisma.user.delete({ where: { id: target.id } }),
  ])
  console.log('Klaar.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
