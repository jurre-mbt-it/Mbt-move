/**
 * Controleert `computeSessionStats` (de aggregatie achter `patient.getSessionStats`)
 * op echte data, door de gedeelde functie zelf aan te roepen — niet door de
 * queries hier te herbouwen. Zo toetst dit script of de router klopt, in
 * plaats van of een eigen kopie intern consistent is.
 *
 * Er is geen test-database (zie AGENTS.md), dus dit draait `computeSessionStats`
 * over alle gebruikers met activiteit en toetst invarianten. Bewust geen vaste
 * getallen: die gaan rood zodra iemand traint, en dan leert niemand er nog
 * iets van.
 *
 * Twee invarianten halen zelf rauwe rijen op en vergelijken die met wat
 * `computeSessionStats` teruggeeft (4 en 8) — dat zijn de enige echte
 * onafhankelijke controles. De rest leest uitsluitend de uitvoer van
 * `computeSessionStats`.
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
import { computeSessionStats, weekWindow } from '../src/server/lib/training-totals'

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
    const cardioBasis = { patientId: id }

    const [stats, cardioTotal, krachtWeekRijen, cardioWeekRijen, lk, lc] = await Promise.all([
      // De functie die ook de router aanroept. Alles hieronder toetst zijn
      // uitvoer, niets herbouwt zijn berekening.
      computeSessionStats(prisma, id, nu),
      prisma.cardioLog.count({ where: cardioBasis }),
      // Rauwe rijen voor de hertelling (invariant 4): onafhankelijk van
      // computeSessionStats, dus een bug daarin (zoals de cardio-term
      // vergeten in week.seconds) wordt hier wel zichtbaar.
      prisma.sessionLog.findMany({
        where: { ...krachtBasis, completedAt: { gte: from, lt: to } },
        select: { programId: true, duration: true },
      }),
      prisma.cardioLog.findMany({
        where: { ...cardioBasis, completedAt: { gte: from, lt: to } },
        select: { durationSec: true },
      }),
      // Rauwe rijen voor de hertelling (invariant 8): los van wat `last`
      // aanwijst.
      prisma.sessionLog.findFirst({
        where: { ...krachtBasis, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
      prisma.cardioLog.findFirst({
        where: cardioBasis,
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
    ])

    const { total, week, allTime, last } = stats

    // ── Invariant 2: cardio kan er alleen bij optellen ─────────────────────
    // Nu echt: total en allTime.count komen allebei uit computeSessionStats,
    // niet uit een lokale `total + cardioTotal`-optelling van het script zelf.
    eis(allTime.count >= total, `${id}: all-time (${allTime.count}) lager dan de krachtteller (${total})`)

    // ── Invariant 3: DE BUG. Wie alleen cardio doet mag geen nul zien ──────
    if (total === 0 && cardioTotal > 0) {
      cardioOnly++
      eis(allTime.count > 0, `${id}: cardio-only gebruiker komt op 0 uit`)
      eis(last?.kind === 'cardio', `${id}: cardio-only gebruiker heeft geen cardio als laatste`)
    }

    // ── Invariant 4: de weektelling klopt met een hertelling ───────────────
    // Volledige onafhankelijke som (kracht + cardio) uit rauwe rijen, exact
    // vergeleken met wat computeSessionStats teruggeeft.
    const hertellingCount = krachtWeekRijen.length + cardioWeekRijen.length
    const hertellingSec =
      krachtWeekRijen.reduce((a, r) => a + (r.duration ?? 0), 0) +
      cardioWeekRijen.reduce((a, r) => a + r.durationSec, 0)
    eis(
      week.count === hertellingCount,
      `${id}: weekteller (${week.count}) wijkt af van hertelling (${hertellingCount})`,
    )
    eis(
      week.seconds === hertellingSec,
      `${id}: weeksom (${week.seconds}) wijkt af van hertelling (${hertellingSec})`,
    )

    // ── Invariant 5: DE ANDERE BUG. Meerdere programma's tellen allemaal ───
    const programmasDezeWeek = new Set(krachtWeekRijen.map((r) => r.programId).filter(Boolean))
    if (programmasDezeWeek.size > 1) {
      meerdereProgrammasDezeWeek++
      eis(
        week.count >= programmasDezeWeek.size,
        `${id}: trainde in ${programmasDezeWeek.size} programma's maar de weekteller staat op ${week.count}`,
      )
    }

    // ── Invariant 6: week past binnen all-time, en tijd hoort bij telling ──
    eis(week.count <= allTime.count, `${id}: week (${week.count}) groter dan all-time (${allTime.count})`)
    eis(week.count > 0 || week.seconds === 0, `${id}: weektijd zonder weeksessies`)

    // ── Invariant 7: last is er precies dan als er activiteit is ───────────
    eis(
      (last === null) === (allTime.count === 0),
      `${id}: last=${last === null ? 'null' : last.kind} bij all-time ${allTime.count}`,
    )

    // ── Invariant 8: last is echt de recentste van de twee ─────────────────
    // lk/lc zijn hier los opgehaald, dus dit toetst `pickLastActivity`'s keuze
    // binnen computeSessionStats, niet een aanname die het script zelf maakt.
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
