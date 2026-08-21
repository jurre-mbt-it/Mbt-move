/**
 * Controleert de aggregatie achter `patient.getSessionStats` op echte data.
 *
 * Er is geen test-database (zie AGENTS.md), dus dit draait dezelfde queries
 * als de procedure over alle gebruikers met activiteit en toetst invarianten.
 * Bewust geen vaste getallen: die gaan rood zodra iemand traint, en dan leert
 * niemand er nog iets van.
 *
 * De twee fouten die dit moet vangen:
 *   - cardio telde niet mee, waardoor cardio-only gebruikers nul zagen
 *   - de weekteller bleef binnen een programma, waardoor een tweede programma
 *     wegviel
 *
 * Draaien:  npm run verify:home-tiles
 * Alleen lezen; dit script schrijft niets.
 */
import { prisma } from '../src/lib/prisma'
import { pickLastActivity, weekWindow } from '../src/server/lib/training-totals'

let fouten = 0
const eis = (ok: boolean, bericht: string) => {
  if (!ok) {
    fouten++
    console.error(`  ✗ ${bericht}`)
  }
}

const KRACHT_FILTER = {
  status: 'COMPLETED' as const,
  NOT: { program: { tendinopathyMode: true, dailyTarget: { not: null } } },
}

async function main() {
  const nu = new Date()
  const { from, to } = weekWindow(nu)

  console.log('weekvenster:', from.toISOString(), '→', to.toISOString())

  // ── Invariant 1: het venster is een hele week en bevat nu ────────────────
  eis(to.getTime() - from.getTime() === 7 * 864e5, 'venster is geen 7 dagen')
  eis(from <= nu && nu < to, 'nu valt buiten het eigen weekvenster')
  eis(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', weekday: 'long' }).format(from) === 'Monday',
    'venster begint niet op maandag in NL-tijd',
  )
  eis(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(from) === '00:00',
    'venster begint niet om 00:00 NL-tijd',
  )

  // ── Per gebruiker met activiteit ─────────────────────────────────────────
  const ids = new Set<string>()
  for (const r of await prisma.sessionLog.groupBy({ by: ['patientId'] })) ids.add(r.patientId)
  for (const r of await prisma.cardioLog.groupBy({ by: ['patientId'] })) ids.add(r.patientId)

  let cardioOnly = 0
  let meerdereProgrammasDezeWeek = 0

  for (const id of ids) {
    const krachtBasis = { patientId: id, ...KRACHT_FILTER }

    const [total, cardioTotal, weekKracht, weekCardio, lk, lc, weekRijen] = await Promise.all([
      prisma.sessionLog.count({ where: krachtBasis }),
      prisma.cardioLog.count({ where: { patientId: id } }),
      prisma.sessionLog.aggregate({
        where: { ...krachtBasis, completedAt: { gte: from, lt: to } },
        _count: { _all: true }, _sum: { duration: true },
      }),
      prisma.cardioLog.aggregate({
        where: { patientId: id, completedAt: { gte: from, lt: to } },
        _count: { _all: true }, _sum: { durationSec: true },
      }),
      prisma.sessionLog.findFirst({
        where: { ...krachtBasis, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true, completedAt: true, duration: true, exertionLevel: true,
          painLevel: true, completedAll: true,
          program: { select: { name: true } }, _count: { select: { exerciseLogs: true } },
        },
      }),
      prisma.cardioLog.findFirst({
        where: { patientId: id },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true, completedAt: true, activity: true, durationSec: true, distanceM: true,
          avgHeartRate: true, zone: true, rpe: true, painLevel: true,
          avgPaceSecPerKm: true, notes: true,
        },
      }),
      // Rauwe rijen voor de hertelling: onafhankelijk van de aggregatie.
      prisma.sessionLog.findMany({
        where: { ...krachtBasis, completedAt: { gte: from, lt: to } },
        select: { programId: true, duration: true },
      }),
    ])

    const allTime = total + cardioTotal
    const weekCount = weekKracht._count._all + weekCardio._count._all
    const weekSec = (weekKracht._sum.duration ?? 0) + (weekCardio._sum.durationSec ?? 0)
    const last = pickLastActivity(lk, lc)

    // ── Invariant 2: cardio kan er alleen bij optellen ─────────────────────
    eis(allTime >= total, `${id}: all-time (${allTime}) lager dan de krachtteller (${total})`)

    // ── Invariant 3: DE BUG. Wie alleen cardio doet mag geen nul zien ──────
    if (total === 0 && cardioTotal > 0) {
      cardioOnly++
      eis(allTime > 0, `${id}: cardio-only gebruiker komt op 0 uit`)
      eis(last?.kind === 'cardio', `${id}: cardio-only gebruiker heeft geen cardio als laatste`)
    }

    // ── Invariant 4: de weektelling klopt met een hertelling ───────────────
    eis(
      weekKracht._count._all === weekRijen.length,
      `${id}: weekaggregatie (${weekKracht._count._all}) wijkt af van hertelling (${weekRijen.length})`,
    )
    eis(
      (weekKracht._sum.duration ?? 0) === weekRijen.reduce((a, r) => a + (r.duration ?? 0), 0),
      `${id}: weeksom duur wijkt af van hertelling`,
    )

    // ── Invariant 5: DE ANDERE BUG. Meerdere programma's tellen allemaal ───
    const programmasDezeWeek = new Set(weekRijen.map((r) => r.programId).filter(Boolean))
    if (programmasDezeWeek.size > 1) {
      meerdereProgrammasDezeWeek++
      eis(
        weekCount >= programmasDezeWeek.size,
        `${id}: trainde in ${programmasDezeWeek.size} programma's maar de weekteller staat op ${weekCount}`,
      )
    }

    // ── Invariant 6: week past binnen all-time, en tijd hoort bij telling ──
    eis(weekCount <= allTime, `${id}: week (${weekCount}) groter dan all-time (${allTime})`)
    eis(weekCount > 0 || weekSec === 0, `${id}: weektijd zonder weeksessies`)

    // ── Invariant 7: last is er precies dan als er activiteit is ───────────
    eis(
      (last === null) === (allTime === 0),
      `${id}: last=${last === null ? 'null' : last.kind} bij all-time ${allTime}`,
    )

    // ── Invariant 8: last is echt de recentste van de twee ─────────────────
    if (last) {
      const kandidaten = [lk?.completedAt?.getTime(), lc?.completedAt.getTime()]
        .filter((t): t is number => typeof t === 'number')
      eis(
        new Date(last.completedAt).getTime() === Math.max(...kandidaten),
        `${id}: last is niet de recentste activiteit`,
      )
    }
  }

  console.log(`gecontroleerd: ${ids.size} gebruikers`)
  console.log(`  cardio-only (zagen voorheen 0): ${cardioOnly}`)
  console.log(`  trainden deze week in meerdere programma's: ${meerdereProgrammasDezeWeek}`)

  // De twee bugs moeten aantoonbaar dekking hebben. Is er geen enkele
  // cardio-only gebruiker meer, dan bewijst dit script de fix niet en moet
  // iemand daar met de hand naar kijken.
  if (cardioOnly === 0) {
    console.warn('  ! geen cardio-only gebruiker in de data: invariant 3 is niet uitgeoefend')
  }

  console.log(fouten === 0 ? '\nAlle invarianten houden.\n' : `\n${fouten} schending(en).\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main().finally(() => prisma.$disconnect())
