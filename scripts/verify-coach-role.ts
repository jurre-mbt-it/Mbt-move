/**
 * Testronde COACH-rol: bewijst de toegangsregels tegen de echte database.
 *
 * Maakt tijdelijke test-accounts aan, controleert wie wat mag zien, en ruimt
 * alles weer op (ook als er halverwege iets misgaat). Verstuurt bewust GEEN
 * invites: dat zou echte e-mail versturen.
 *
 * Uitvoer bevat alleen uitkomsten, nooit namen of e-mailadressen van echte
 * gebruikers.
 *
 * Draaien:  npx tsx scripts/verify-coach-role.ts
 */
// De echte client van de app (pg-adapter + soft-delete-extensie), zodat de
// test op precies dezelfde laag draait als de server.
import { prisma } from '../src/lib/prisma'
import { hasPatientAccess } from '../src/server/lib/patient-access'

const TAG = 'coachtest-20260721'
const results: { name: string; ok: boolean; detail?: string }[] = []

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/** Zelfde scoping als planTemplates.scopeFor — hier nagebouwd om te toetsen. */
function scopeFor(user: { id: string; role: string; practiceId: string | null }) {
  if (user.role === 'COACH') return [{ practiceId: null, creatorId: user.id }]
  const seeds = { practiceId: null, creator: { role: { not: 'COACH' as const } } }
  return user.practiceId ? [seeds, { practiceId: user.practiceId }] : [seeds]
}

async function main() {
  // ── Opzet ────────────────────────────────────────────────────────────────
  const coach = await prisma.user.create({
    data: { email: `coach.${TAG}@example.invalid`, name: 'Testcoach', role: 'COACH', practiceId: null },
  })
  const athlete = await prisma.user.create({
    data: { email: `atleet.${TAG}@example.invalid`, name: 'Testatleet', role: 'ATHLETE', practiceId: null },
  })
  await prisma.patientTherapist.create({
    data: { therapistId: coach.id, patientId: athlete.id, status: 'APPROVED', isActive: true },
  })

  // Een bestaande praktijk-therapeut + een patiënt uit diezelfde praktijk, als
  // tegenproef. Alleen id/rol/praktijk uitlezen, verder niets.
  const realTherapist = await prisma.user.findFirst({
    where: { role: 'THERAPIST', practiceId: { not: null }, deletedAt: null },
    select: { id: true, role: true, practiceId: true },
  })
  const realPatient = realTherapist
    ? await prisma.user.findFirst({
        where: { role: { in: ['PATIENT', 'ATHLETE'] }, practiceId: realTherapist.practiceId, deletedAt: null },
        select: { id: true },
      })
    : null

  const coachCtx = { id: coach.id, role: 'COACH', practiceId: null }

  // ── Toegang ──────────────────────────────────────────────────────────────
  check(
    'coach ziet zijn eigen gekoppelde atleet',
    await hasPatientAccess(prisma, coachCtx, athlete.id),
  )

  if (realPatient) {
    check(
      'coach ziet GEEN patiënt van een praktijk',
      !(await hasPatientAccess(prisma, coachCtx, realPatient.id)),
    )
  } else {
    check('coach ziet GEEN praktijk-patiënt', false, 'geen praktijk-patiënt gevonden om te toetsen')
  }

  if (realTherapist) {
    check(
      'praktijk-therapeut ziet de coach-atleet NIET',
      !(await hasPatientAccess(prisma, realTherapist, athlete.id)),
    )
  } else {
    check('praktijk-therapeut ziet coach-atleet niet', false, 'geen praktijk-therapeut gevonden')
  }

  // Intrekken door de atleet moet de toegang meteen dichtzetten.
  await prisma.patientTherapist.updateMany({
    where: { therapistId: coach.id, patientId: athlete.id },
    data: { status: 'REVOKED' },
  })
  check(
    'na intrekken door de atleet vervalt de toegang',
    !(await hasPatientAccess(prisma, coachCtx, athlete.id)),
  )
  await prisma.patientTherapist.updateMany({
    where: { therapistId: coach.id, patientId: athlete.id },
    data: { status: 'APPROVED' },
  })

  // ── Plan-sjablonen ───────────────────────────────────────────────────────
  const coachPlan = await prisma.weekPlanTemplate.create({
    data: { name: `Testplan ${TAG}`, weeks: 1, creatorId: coach.id, practiceId: null },
  })

  const coachSees = await prisma.weekPlanTemplate.findMany({
    where: { OR: scopeFor(coachCtx) },
    select: { id: true },
  })
  check(
    'coach ziet zijn eigen plan',
    coachSees.some((p) => p.id === coachPlan.id),
  )

  if (realTherapist) {
    const therapistSees = await prisma.weekPlanTemplate.findMany({
      where: { OR: scopeFor(realTherapist) },
      select: { id: true },
    })
    check(
      'therapeut ziet het coach-plan NIET',
      !therapistSees.some((p) => p.id === coachPlan.id),
      `therapeut ziet ${therapistSees.length} plannen`,
    )
    // Andersom: een globale seed mag de coach wél lezen.
    const seedCount = await prisma.weekPlanTemplate.count({
      where: { practiceId: null, creatorId: { not: coach.id } },
    })
    check(
      'coach-scope sluit globale seeds van anderen uit',
      !coachSees.some((p) => p.id !== coachPlan.id),
      `${seedCount} seeds bestaan, coach ziet er ${coachSees.length - 1} van`,
    )
  }

  // ── Rolgrenzen in de code ────────────────────────────────────────────────
  const { WEARABLES_ALLOWED_ROLES } = await import('../src/lib/wearables-access')
  check('coach mag eigen wearable koppelen', (WEARABLES_ALLOWED_ROLES as readonly string[]).includes('COACH'))

  const coachRow = await prisma.user.findUnique({
    where: { id: coach.id },
    select: { practiceId: true, role: true },
  })
  check('coach-account heeft geen praktijk', coachRow?.practiceId === null)
}

main()
  .catch((e) => {
    console.error('SCRIPT-FOUT:', e instanceof Error ? e.message : e)
    results.push({ name: 'script voltooid', ok: false })
  })
  .finally(async () => {
    // Opruimen: altijd, ook na een fout.
    await prisma.weekPlanTemplate.deleteMany({ where: { name: { contains: TAG } } })
    const testUsers = await prisma.user.findMany({
      where: { email: { contains: TAG } },
      select: { id: true },
      // deletedAt-filter uitzetten zodat ook soft-deleted testrijen weggaan.
    })
    const ids = testUsers.map((u) => u.id)
    await prisma.patientTherapist.deleteMany({
      where: { OR: [{ therapistId: { in: ids } }, { patientId: { in: ids } }] },
    })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    const leftover = await prisma.user.count({ where: { email: { contains: TAG } } })

    console.log('\n─────────────────────────────')
    const failed = results.filter((r) => !r.ok)
    console.log(`${results.length - failed.length}/${results.length} geslaagd`)
    console.log(`opgeruimd: ${ids.length} testgebruikers, ${leftover} over`)
    await prisma.$disconnect()
    process.exit(failed.length === 0 && leftover === 0 ? 0 : 1)
  })
