# Beginscherm-tegels: LAATSTE en DEZE WEEK

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de twee tegels op het beginscherm van sporter en patiënt door LAATSTE (je meest recente training, tikbaar naar het detail) en DEZE WEEK (aantal trainingen deze week over alle programma's plus cardio, tikbaar naar het Weekschema).

**Architecture:** Eén bestaande serveraanroep, `patient.getSessionStats`, krijgt er velden bij en levert voortaan ook weekcijfers, een all-time teller inclusief cardio, en de laatste activiteit. Alle rekenwerk zit in `count`- en `sum`-aggregaties plus twee `findFirst`-queries; er gaan geen rijen over de lijn. De app rendert de twee tegels en hergebruikt de bestaande `EventDetailSheet` uit de kalender voor het detail.

**Tech Stack:** Web-repo (`/Users/eva/mbt-gym`): Next.js, tRPC, Prisma, vitest. Mobiele repo (`/Users/eva/mbt-gym-mobile`): Expo/React Native, expo-router, geen test-runner.

**Spec:** `docs/superpowers/specs/2026-08-21-beginscherm-tegels-design.md`

## Global Constraints

- **Weekgrens altijd in `Europe/Amsterdam`.** Gebruik `mondayKeyOf`, `addDaysKey` en `amsMidnight` uit `src/lib/week-dates.ts`. Nooit `getDay()` of `getUTCDay()` op de server: die draait op Vercel in UTC, en maandag 00:30 NL is zondag 22:30 UTC, dus dat levert een week ernaast.
- **`patient.getSessionStats` moet `total` blijven teruggeven, met exact de huidige betekenis** (aantal `SessionLog` met `status: 'COMPLETED'`, zonder tendinopathie-dagrondes). Build 82 en ouder staan in TestFlight en lezen dat veld. Nieuwe velden worden door oude clients genegeerd, dus dit is een puur additieve wijziging en er is geen version-gate nodig.
- **Krachtsessies tellen mee met:** `status: 'COMPLETED'` en `NOT: { program: { tendinopathyMode: true, dailyTarget: { not: null } } }`.
- **Cardio telt altijd mee**, ongeacht `source` (MANUAL, APPLE_WATCH, STRAVA).
- **Leg geen extra klem op de duur bij het optellen.** Er staan vergeten timers in de data (een krachtsessie van 326 minuten, één van 180). `clampSessionDurationSec` begrenst al bij het schrijven; een tweede klem bij het tonen laat het weektotaal afwijken van de sessies die je kunt openen. Die twee sessies horen in de data rechtgezet te worden, niet in de weergave verstopt.
- **Geen em-dashes in UI-copy of commit-teksten.** Zie `docs/tone-of-voice.md`.
- **De mobiele repo heeft geen test-runner.** Pure functies uit die repo worden getoetst met een tsx-script in de web-repo onder `scripts/`, zoals `check:mirror` en `check:session-payload` al doen.
- **Raak `lib/cardio-workout.ts` en `lib/prescription-mirror.ts` in de mobiele repo niet aan.** Dat zijn gespiegelde bestanden; wijzig je die, dan moet `npm run check:mirror` draaien.
- **Niet met de hand aan `app.json` buildNumber komen.** `eas.json` doet `autoIncrement`.

## File Structure

**Web-repo (`/Users/eva/mbt-gym`)**

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/server/lib/training-totals.ts` (nieuw) | Puur: weekvenster in NL-tijd, payload-typen, kiezen van de laatste activiteit |
| `src/server/lib/__tests__/training-totals.test.ts` (nieuw) | Vitest op bovenstaande |
| `src/server/routers/patient.ts` (wijzigen) | `getSessionStats` doet de aggregaties en zet de payload samen |
| `scripts/check-home-tiles.ts` (nieuw) | Toetst de pure formatters uit de mobiele repo |
| `scripts/verify-home-tiles-live.ts` (nieuw) | Draait de aggregatie op productiedata en vergelijkt met bekende cijfers |
| `package.json` (wijzigen) | Twee npm-scripts erbij |

**Mobiele repo (`/Users/eva/mbt-gym-mobile`)**

| Bestand | Verantwoordelijkheid |
|---|---|
| `lib/home-tiles.ts` (nieuw) | Puur: daglabel, subregels, duur-opmaak, `CARDIO_LABEL` |
| `components/dark-ui.tsx` (wijzigen) | `MetricTile` krijgt optionele `onPress` |
| `components/schedule-calendar.tsx` (wijzigen) | `CalEvent` en `EventDetailSheet` exporteren, `CARDIO_LABEL` uit `lib/home-tiles.ts` halen |
| `app/(tabs)/index.tsx` (wijzigen) | Beide dashboards renderen de nieuwe tegels |

---

### Task 1: Weekvenster en payload-vorm (web, puur)

**Files:**
- Create: `src/server/lib/training-totals.ts`
- Test: `src/server/lib/__tests__/training-totals.test.ts`

**Interfaces:**
- Consumes: `mondayKeyOf`, `addDaysKey`, `amsMidnight` uit `src/lib/week-dates.ts`
- Produces: `weekWindow(now: Date): { from: Date; to: Date }`, `pickLastActivity(session: SessionRow | null, cardio: CardioRow | null): LastActivity | null`, en de typen `LastActivity`, `SessionStats`, `SessionRow`, `CardioRow`. Task 2 gebruikt alle vijf.

- [ ] **Step 1: Write the failing test**

Maak `src/server/lib/__tests__/training-totals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { pickLastActivity, weekWindow, type CardioRow, type SessionRow } from '../training-totals'

/**
 * De weekgrens is de val uit AGENTS.md: de server draait in UTC, dus maandag
 * 00:30 in Amsterdam is zondag 22:30 in UTC. Wie hier `getUTCDay()` gebruikt
 * schuift een hele week terug.
 */
describe('weekWindow', () => {
  it('geeft maandag 00:00 NL als start, in zomertijd', () => {
    // vrijdag 21 augustus 2026, 17:39 NL
    const { from, to } = weekWindow(new Date('2026-08-21T15:39:53Z'))
    expect(from.toISOString()).toBe('2026-08-16T22:00:00.000Z') // ma 17 aug 00:00 NL
    expect(to.toISOString()).toBe('2026-08-23T22:00:00.000Z')   // ma 24 aug 00:00 NL
  })

  it('geeft maandag 00:00 NL als start, in wintertijd', () => {
    // donderdag 15 januari 2026, 12:00 NL
    const { from } = weekWindow(new Date('2026-01-15T11:00:00Z'))
    expect(from.toISOString()).toBe('2026-01-11T23:00:00.000Z') // ma 12 jan 00:00 NL
  })

  it('rekent maandagnacht NL niet terug naar de week ervoor', () => {
    // zondag 22:30 UTC = maandag 17 augustus 00:30 in Amsterdam
    const { from } = weekWindow(new Date('2026-08-16T22:30:00Z'))
    expect(from.toISOString()).toBe('2026-08-16T22:00:00.000Z')
  })

  it('houdt zondagavond NL binnen dezelfde week', () => {
    // zondag 23 augustus 23:30 NL
    const { from } = weekWindow(new Date('2026-08-23T21:30:00Z'))
    expect(from.toISOString()).toBe('2026-08-16T22:00:00.000Z')
  })
})

const kracht: SessionRow = {
  id: 's1',
  completedAt: new Date('2026-08-21T12:39:04Z'),
  duration: 4769,
  exertionLevel: 9,
  painLevel: 3,
  completedAll: false,
  program: { name: 'Schema B' },
  _count: { exerciseLogs: 8 },
}

const cardio: CardioRow = {
  id: 'c1',
  completedAt: new Date('2026-08-19T16:13:00Z'),
  activity: 'RUNNING',
  durationSec: 2400,
  distanceM: 8200,
  avgHeartRate: 148,
  zone: 3,
  rpe: 6,
  painLevel: null,
  avgPaceSecPerKm: 293,
  notes: null,
}

describe('pickLastActivity', () => {
  it('geeft null als er niets is', () => {
    expect(pickLastActivity(null, null)).toBeNull()
  })

  it('kiest de krachtsessie als die recenter is', () => {
    const last = pickLastActivity(kracht, cardio)
    expect(last).toEqual({
      kind: 'session',
      id: 's1',
      completedAt: '2026-08-21T12:39:04.000Z',
      programName: 'Schema B',
      durationSec: 4769,
      rpe: 9,
      pain: 3,
      exerciseCount: 8,
      completedAll: false,
    })
  })

  it('kiest de cardio-log als die recenter is', () => {
    const ouder: SessionRow = { ...kracht, completedAt: new Date('2026-08-02T08:10:00Z') }
    const last = pickLastActivity(ouder, cardio)
    expect(last).toEqual({
      kind: 'cardio',
      id: 'c1',
      completedAt: '2026-08-19T16:13:00.000Z',
      activity: 'RUNNING',
      durationSec: 2400,
      distanceM: 8200,
      avgHeartRate: 148,
      zone: 3,
      rpe: 6,
      pain: null,
      paceSecPerKm: 293,
      notes: null,
    })
  })

  it('werkt met alleen cardio', () => {
    expect(pickLastActivity(null, cardio)?.kind).toBe('cardio')
  })

  it('werkt met alleen kracht', () => {
    expect(pickLastActivity(kracht, null)?.kind).toBe('session')
  })

  it('negeert een krachtsessie zonder completedAt', () => {
    const zonder: SessionRow = { ...kracht, completedAt: null }
    expect(pickLastActivity(zonder, cardio)?.kind).toBe('cardio')
    expect(pickLastActivity(zonder, null)).toBeNull()
  })

  it('kiest bij een gelijke tijd de krachtsessie', () => {
    const gelijk: CardioRow = { ...cardio, completedAt: new Date('2026-08-21T12:39:04Z') }
    expect(pickLastActivity(kracht, gelijk)?.kind).toBe('session')
  })

  it('laat een programmaloze sessie als null door', () => {
    const los: SessionRow = { ...kracht, program: null }
    const last = pickLastActivity(los, null)
    expect(last).toMatchObject({ kind: 'session', programName: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/server/lib/__tests__/training-totals.test.ts
```

Verwacht: FAIL, "Failed to resolve import ../training-totals".

- [ ] **Step 3: Write the implementation**

Maak `src/server/lib/training-totals.ts`:

```ts
/**
 * Tellingen voor de tegels op het beginscherm: wat deed je deze week, en wat
 * was je laatste training.
 *
 * De vorm zit hier los van `patient.getSessionStats` zodat de weekgrens en de
 * keuze van de laatste activiteit te testen zijn zonder database.
 */
import { addDaysKey, amsMidnight, mondayKeyOf } from '@/lib/week-dates'

/** Krachtsessie zoals de router hem selecteert. */
export type SessionRow = {
  id: string
  completedAt: Date | null
  duration: number | null
  exertionLevel: number | null
  painLevel: number | null
  completedAll: boolean
  program: { name: string } | null
  _count: { exerciseLogs: number }
}

/** Cardio-log zoals de router hem selecteert. */
export type CardioRow = {
  id: string
  completedAt: Date
  activity: string
  durationSec: number
  distanceM: number | null
  avgHeartRate: number | null
  zone: number | null
  rpe: number | null
  painLevel: number | null
  avgPaceSecPerKm: number | null
  notes: string | null
}

/**
 * De laatste activiteit, in de velden die de app nodig heeft om er een
 * `CalEvent` van te maken en de bestaande detailweergave te openen. De naam
 * blijft rauw (`programName`, `activity`): de app vertaalt die, zodat de
 * labels op één plek staan.
 */
export type LastActivity =
  | {
      kind: 'session'
      id: string
      completedAt: string
      programName: string | null
      durationSec: number | null
      rpe: number | null
      pain: number | null
      exerciseCount: number
      completedAll: boolean
    }
  | {
      kind: 'cardio'
      id: string
      completedAt: string
      activity: string
      durationSec: number
      distanceM: number | null
      avgHeartRate: number | null
      zone: number | null
      rpe: number | null
      pain: number | null
      paceSecPerKm: number | null
      notes: string | null
    }

export type SessionStats = {
  /** ONGEWIJZIGD: krachtsessies all-time. Build 82 en ouder lezen dit veld. */
  total: number
  /** Kracht plus cardio, maandag tot en met zondag in NL-tijd. */
  week: { count: number; seconds: number }
  /** Kracht plus cardio, all-time. */
  allTime: { count: number }
  last: LastActivity | null
}

/**
 * Maandag 00:00 tot de maandag erna, in Amsterdamse tijd.
 *
 * Niet met `getDay()` of `getUTCDay()`: de server draait in UTC en maandag
 * 00:30 in Amsterdam is daar zondag 22:30, wat een week terug zou schuiven.
 * Zie de kop van `src/lib/week-dates.ts`.
 */
export function weekWindow(now: Date): { from: Date; to: Date } {
  const maandag = mondayKeyOf(now)
  return {
    from: amsMidnight(maandag),
    to: amsMidnight(addDaysKey(maandag, 7)),
  }
}

/**
 * De recentste van de twee. Bij een gelijke tijd wint de krachtsessie, zodat
 * het antwoord deterministisch is.
 */
export function pickLastActivity(
  session: SessionRow | null,
  cardio: CardioRow | null,
): LastActivity | null {
  const sTijd = session?.completedAt?.getTime() ?? null
  const cTijd = cardio?.completedAt.getTime() ?? null

  if (sTijd == null && cTijd == null) return null

  const neemCardio = cardio != null && cTijd != null && (sTijd == null || cTijd > sTijd)
  if (neemCardio) {
    return {
      kind: 'cardio',
      id: cardio.id,
      completedAt: cardio.completedAt.toISOString(),
      activity: cardio.activity,
      durationSec: cardio.durationSec,
      distanceM: cardio.distanceM,
      avgHeartRate: cardio.avgHeartRate,
      zone: cardio.zone,
      rpe: cardio.rpe,
      pain: cardio.painLevel,
      paceSecPerKm: cardio.avgPaceSecPerKm,
      notes: cardio.notes,
    }
  }

  if (!session || !session.completedAt) return null
  return {
    kind: 'session',
    id: session.id,
    completedAt: session.completedAt.toISOString(),
    programName: session.program?.name ?? null,
    durationSec: session.duration,
    rpe: session.exertionLevel,
    pain: session.painLevel,
    exerciseCount: session._count.exerciseLogs,
    completedAll: session.completedAll,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/server/lib/__tests__/training-totals.test.ts
```

Verwacht: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/training-totals.ts src/server/lib/__tests__/training-totals.test.ts
git commit -m "feat(stats): weekvenster in NL-tijd en vorm van de laatste activiteit"
```

---

### Task 2: getSessionStats levert week, all-time en laatste activiteit

**Files:**
- Modify: `src/server/routers/patient.ts` (procedure `getSessionStats`, nu rond regel 2062)
- Create: `scripts/verify-home-tiles-live.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `weekWindow`, `pickLastActivity`, `SessionStats` uit Task 1
- Produces: `patient.getSessionStats` retourneert `SessionStats`. Task 6 leest `total`, `week.count`, `week.seconds`, `allTime.count` en `last`.

- [ ] **Step 1: Vervang de procedure**

Zoek in `src/server/routers/patient.ts` de procedure `getSessionStats` en vervang het hele blok, inclusief de bestaande commentaarkop, door:

```ts
  /**
   * Cijfers voor de twee tegels op het beginscherm.
   *
   * `total` blijft precies wat het was (krachtsessies all-time, zonder de
   * tendinopathie-dagrondes) omdat build 82 en ouder in TestFlight dat veld
   * lezen. De rest is erbij gekomen; oude clients negeren die velden.
   *
   * Waarom de tellers hier zitten en niet in `getTodayExercises`: die telt
   * `completedThisWeek` binnen één programma. Wie meerdere actieve programma's
   * heeft ziet zijn sessie in het andere programma dan niet terug, en cardio
   * telt daar sowieso niet mee.
   */
  getSessionStats: protectedProcedure.query(async ({ ctx }): Promise<SessionStats> => {
    const krachtBasis = {
      patientId: ctx.user.id,
      status: 'COMPLETED' as const,
      NOT: { program: { tendinopathyMode: true, dailyTarget: { not: null } } },
    }
    const cardioBasis = { patientId: ctx.user.id }
    const { from, to } = weekWindow(new Date())

    const [total, cardioTotal, weekKracht, weekCardio, laatsteKracht, laatsteCardio] =
      await Promise.all([
        ctx.prisma.sessionLog.count({ where: krachtBasis }),
        ctx.prisma.cardioLog.count({ where: cardioBasis }),
        ctx.prisma.sessionLog.aggregate({
          where: { ...krachtBasis, completedAt: { gte: from, lt: to } },
          _count: { _all: true },
          _sum: { duration: true },
        }),
        ctx.prisma.cardioLog.aggregate({
          where: { ...cardioBasis, completedAt: { gte: from, lt: to } },
          _count: { _all: true },
          _sum: { durationSec: true },
        }),
        ctx.prisma.sessionLog.findFirst({
          where: { ...krachtBasis, completedAt: { not: null } },
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            completedAt: true,
            duration: true,
            exertionLevel: true,
            painLevel: true,
            completedAll: true,
            program: { select: { name: true } },
            _count: { select: { exerciseLogs: true } },
          },
        }),
        ctx.prisma.cardioLog.findFirst({
          where: cardioBasis,
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            completedAt: true,
            activity: true,
            durationSec: true,
            distanceM: true,
            avgHeartRate: true,
            zone: true,
            rpe: true,
            painLevel: true,
            avgPaceSecPerKm: true,
            notes: true,
          },
        }),
      ])

    return {
      total,
      week: {
        count: weekKracht._count._all + weekCardio._count._all,
        seconds: (weekKracht._sum.duration ?? 0) + (weekCardio._sum.durationSec ?? 0),
      },
      allTime: { count: total + cardioTotal },
      last: pickLastActivity(laatsteKracht, laatsteCardio),
    }
  }),
```

- [ ] **Step 2: Voeg de import toe**

Bovenin `src/server/routers/patient.ts`, bij de andere `@/server/lib`-imports:

```ts
import { pickLastActivity, weekWindow, type SessionStats } from '@/server/lib/training-totals'
```

Staat er nog geen import uit `@/server/lib`, zet hem dan onder de laatste bestaande import.

- [ ] **Step 3: Typecheck en testsuite**

```bash
npx tsc --noEmit && npm test
```

Verwacht: geen tsc-fouten, alle vitest-tests groen.

- [ ] **Step 4: Schrijf het verificatiescript**

De repo heeft geen test-database, dus de aggregatie wordt tegen productiedata gecontroleerd. De verwachte waarden zijn op 21 augustus 2026 handmatig nageteld.

Maak `scripts/verify-home-tiles-live.ts`:

```ts
/**
 * Controleert de aggregatie achter `patient.getSessionStats` op echte data.
 *
 * Er is geen test-database (zie AGENTS.md), dus dit script draait dezelfde
 * queries als de procedure en vergelijkt ze met cijfers die op 21 augustus
 * 2026 met de hand zijn nageteld. Loopt er iets uiteen, dan is de aggregatie
 * of het weekvenster stuk.
 *
 * Draaien:  npm run verify:home-tiles
 * Alleen lezen; dit script schrijft niets.
 */
import { prisma } from '../src/lib/prisma'
import { pickLastActivity, weekWindow } from '../src/server/lib/training-totals'

// E-mail → verwacht all-time totaal (kracht + cardio), stand 21 aug 2026.
const VERWACHT_ALLTIME: Record<string, number> = {
  'frank@hkventures.nl': 4,
  'jurre@movementbasedtherapy.nl': 56,
}

async function main() {
  const { from, to } = weekWindow(new Date())
  console.log('weekvenster:', from.toISOString(), '→', to.toISOString())

  let fouten = 0
  const users = await prisma.user.findMany({
    where: { email: { in: Object.keys(VERWACHT_ALLTIME) } },
    select: { id: true, email: true },
  })

  for (const u of users) {
    const krachtBasis = {
      patientId: u.id,
      status: 'COMPLETED' as const,
      NOT: { program: { tendinopathyMode: true, dailyTarget: { not: null } } },
    }
    const [total, cardioTotal, weekKracht, weekCardio, lk, lc] = await Promise.all([
      prisma.sessionLog.count({ where: krachtBasis }),
      prisma.cardioLog.count({ where: { patientId: u.id } }),
      prisma.sessionLog.aggregate({
        where: { ...krachtBasis, completedAt: { gte: from, lt: to } },
        _count: { _all: true }, _sum: { duration: true },
      }),
      prisma.cardioLog.aggregate({
        where: { patientId: u.id, completedAt: { gte: from, lt: to } },
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
        where: { patientId: u.id },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true, completedAt: true, activity: true, durationSec: true, distanceM: true,
          avgHeartRate: true, zone: true, rpe: true, painLevel: true,
          avgPaceSecPerKm: true, notes: true,
        },
      }),
    ])

    const allTime = total + cardioTotal
    const weekCount = weekKracht._count._all + weekCardio._count._all
    const weekSec = (weekKracht._sum.duration ?? 0) + (weekCardio._sum.durationSec ?? 0)
    const last = pickLastActivity(lk, lc)
    const verwacht = VERWACHT_ALLTIME[u.email]
    const ok = allTime === verwacht

    if (!ok) fouten++
    console.log(
      `${ok ? '✓' : '✗'} ${u.email} | all-time ${allTime} (verwacht ${verwacht}) ` +
      `| deze week ${weekCount} sessies, ${Math.round(weekSec / 60)} min ` +
      `| laatste ${last ? `${last.kind} ${last.completedAt.slice(0, 10)}` : 'geen'}`
    )
  }

  // Niemand mag nul all-time zien terwijl er cardio ligt: dat was de fout.
  const cardioZonderKracht = await prisma.cardioLog.groupBy({
    by: ['patientId'],
    _count: { _all: true },
  })
  for (const rij of cardioZonderKracht) {
    const kracht = await prisma.sessionLog.count({
      where: {
        patientId: rij.patientId,
        status: 'COMPLETED',
        NOT: { program: { tendinopathyMode: true, dailyTarget: { not: null } } },
      },
    })
    if (kracht === 0 && rij._count._all > 0) {
      console.log(`  (cardio-only gebruiker: ${rij._count._all} activiteiten, oude tegel toonde 0)`)
    }
  }

  console.log(fouten === 0 ? '\nAggregatie klopt.\n' : `\n${fouten} afwijking(en).\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 5: Voeg het npm-script toe**

In `package.json`, direct onder `"check:session-payload"`:

```json
    "verify:home-tiles": "tsx --env-file=.env.local scripts/verify-home-tiles-live.ts",
```

- [ ] **Step 6: Draai de verificatie**

```bash
npm run verify:home-tiles
```

Verwacht: beide regels met een vinkje, "Aggregatie klopt."

Frank's weekregel hoort `2 sessies, 151 min` te tonen (4299 plus 4769 seconden). **Dat is meteen de belangrijkste dekking van dit script:** Frank heeft twee actieve programma's en trainde deze week in allebei. De oude teller kwam op 1 uit omdat hij binnen één programma bleef. Staat hier 1, dan is de programma-scoping teruggeslopen.

De regel van `jurre@movementbasedtherapy.nl` dekt de andere fout: 56 all-time terwijl de oude tegel 20 toonde, want die telde de 36 cardio-activiteiten niet mee.

Wijkt het af doordat er sinds 21 augustus nieuwe sessies zijn gelogd, werk dan `VERWACHT_ALLTIME` bij naar de dan geldende stand en noteer de datum in het commentaar. Wijkt het af zonder nieuwe data, dan is de aggregatie stuk.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/patient.ts scripts/verify-home-tiles-live.ts package.json
git commit -m "feat(stats): getSessionStats telt cardio mee en geeft week plus laatste training"
```

---

### Task 3: Opmaak-functies voor de tegels (mobiel, puur)

**Files:**
- Create: `/Users/eva/mbt-gym-mobile/lib/home-tiles.ts`
- Create: `scripts/check-home-tiles.ts` (web-repo)
- Modify: `package.json` (web-repo)

**Interfaces:**
- Consumes: het `LastActivity`-type uit Task 1, hier opnieuw gedeclareerd omdat de repo's geen gedeeld package hebben
- Produces: `CARDIO_LABEL`, `dayLabel(iso, now)`, `formatSessionDuration(sec)`, `formatWeekDuration(sec)`, `lastActivityName(last)`, `lastActivitySub(last)`, `weekSub(seconds, allTimeCount)`. Task 5 importeert `CARDIO_LABEL`, Task 6 de rest.

- [ ] **Step 1: Write the failing test**

Maak `scripts/check-home-tiles.ts` in de web-repo:

```ts
/**
 * Controle op de opmaak van de beginscherm-tegels in de mobiele app.
 *
 * De mobiele repo heeft geen test-runner, dus laadt dit script het echte
 * `lib/home-tiles.ts` uit die repo. Zelfde patroon als `check:mirror` en
 * `check:session-payload`.
 *
 * Draaien:  npm run check:home-tiles
 * De mobiele repo wordt gezocht naast deze repo (../mbt-gym-mobile) of via
 * MOBILE_REPO=/pad/naar/mbt-gym-mobile.
 */
import path from 'node:path'
import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'

const MOBILE = process.env.MOBILE_REPO
  ?? path.resolve(__dirname, '..', '..', 'mbt-gym-mobile')

let fouten = 0
const check = (naam: string, fn: () => void) => {
  try {
    fn()
    console.log(`  ✓ ${naam}`)
  } catch (err) {
    fouten++
    const msg = err instanceof Error ? err.message.split('\n').slice(0, 3).join(' | ') : String(err)
    console.error(`  ✗ ${naam}\n      ${msg}`)
  }
}

async function main() {
  if (!existsSync(MOBILE)) {
    console.error(`Mobiele repo niet gevonden op ${MOBILE} — zet MOBILE_REPO.`)
    process.exit(2)
  }
  const ht = await import(path.join(MOBILE, 'lib', 'home-tiles.ts'))
  const {
    CARDIO_LABEL, dayLabel, formatSessionDuration, formatWeekDuration,
    lastActivityName, lastActivitySub, weekSub,
  } = ht

  const nu = new Date('2026-08-21T17:39:00+02:00')
  const sessie = {
    kind: 'session', id: 's1', completedAt: '2026-08-21T12:39:04.000Z',
    programName: 'Schema B', durationSec: 4769, rpe: 9, pain: 3,
    exerciseCount: 8, completedAll: false,
  }
  const rit = {
    kind: 'cardio', id: 'c1', completedAt: '2026-08-19T16:13:00.000Z',
    activity: 'RUNNING', durationSec: 2400, distanceM: 8200, avgHeartRate: 148,
    zone: 3, rpe: 6, pain: null, paceSecPerKm: 293, notes: null,
  }

  console.log('\ndayLabel')

  check('vandaag', () => assert.equal(dayLabel('2026-08-21T12:39:04.000Z', nu), 'VANDAAG'))
  check('gisteren', () => assert.equal(dayLabel('2026-08-20T09:00:00.000Z', nu), 'GISTEREN'))
  check('eerder deze maand', () => assert.equal(dayLabel('2026-08-19T16:13:00.000Z', nu), '19 AUG'))
  check('vorig jaar', () => assert.equal(dayLabel('2025-12-03T10:00:00.000Z', nu), '3 DEC'))
  check('vlak na middernacht telt als vandaag', () => {
    assert.equal(dayLabel('2026-08-21T00:05:00+02:00', nu), 'VANDAAG')
  })

  console.log('\nduur-opmaak')

  check('sessieduur blijft in minuten', () => {
    assert.equal(formatSessionDuration(4769), '79 min')
    assert.equal(formatSessionDuration(2400), '40 min')
    assert.equal(formatSessionDuration(30), '1 min', 'nooit "0 min" voor iets dat gebeurd is')
  })

  check('weekduur wordt uren zodra het kan', () => {
    assert.equal(formatWeekDuration(9068), '2u31')
    assert.equal(formatWeekDuration(2400), '40 min')
    assert.equal(formatWeekDuration(3600), '1u00')
    assert.equal(formatWeekDuration(0), '0 min')
  })

  console.log('\nnaam en subregel')

  check('naam van een krachtsessie is het programma', () => {
    assert.equal(lastActivityName(sessie), 'Schema B')
    assert.equal(lastActivityName({ ...sessie, programName: null }), 'Workout')
  })

  check('naam van cardio komt uit het label', () => {
    assert.equal(lastActivityName(rit), 'Hardlopen')
    assert.equal(lastActivityName({ ...rit, activity: 'ONBEKEND' }), 'Cardio')
    assert.equal(CARDIO_LABEL.CYCLING, 'Fietsen')
  })

  check('subregel krachtsessie', () => {
    assert.equal(lastActivitySub(sessie), 'Schema B · 8 oef · 79 min')
    assert.equal(lastActivitySub({ ...sessie, exerciseCount: 1 }), 'Schema B · 1 oef · 79 min')
  })

  check('subregel cardio', () => {
    assert.equal(lastActivitySub(rit), 'Hardlopen · 40 min')
  })

  check('subregel laat lege delen weg', () => {
    assert.equal(lastActivitySub({ ...sessie, durationSec: null }), 'Schema B · 8 oef')
    assert.equal(lastActivitySub({ ...sessie, exerciseCount: 0, durationSec: null }), 'Schema B')
  })

  console.log('\nweek-subregel')

  check('tijd plus all-time teller', () => {
    assert.equal(weekSub(9068, 4), '2u31 · 4 totaal')
    assert.equal(weekSub(2400, 56), '40 min · 56 totaal')
  })

  check('lege week toont alleen de teller', () => {
    assert.equal(weekSub(0, 56), '56 totaal')
    assert.equal(weekSub(0, 0), 'nog niets gelogd')
  })

  console.log(fouten === 0 ? '\nOpmaak klopt.\n' : `\n${fouten} controle(s) gefaald.\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

Voeg in `package.json` onder `"check:session-payload"` toe:

```json
    "check:home-tiles": "tsx scripts/check-home-tiles.ts",
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run check:home-tiles
```

Verwacht: FAIL, "Cannot find module .../mbt-gym-mobile/lib/home-tiles.ts".

- [ ] **Step 3: Write the implementation**

Maak `/Users/eva/mbt-gym-mobile/lib/home-tiles.ts`:

```ts
/**
 * Opmaak voor de twee tegels op het beginscherm: LAATSTE en DEZE WEEK.
 *
 * Los van het scherm zodat het zonder React te toetsen is; de controle staat
 * in de web-repo als `npm run check:home-tiles`.
 */

/** Nederlandse namen van de cardio-activiteiten. Woont hier zodat zowel het
 *  beginscherm als de kalender dezelfde labels gebruikt. */
export const CARDIO_LABEL: Record<string, string> = {
  RUNNING: 'Hardlopen',
  CYCLING: 'Fietsen',
  ROWING: 'Roeien',
  SWIMMING: 'Zwemmen',
  WALKING: 'Wandelen',
  CROSSTRAINER: 'Crosstrainer',
  SKIERG: 'SkiErg',
  ASSAULT_BIKE: 'Assault Bike',
  WATTBIKE: 'Wattbike',
  STAIRCLIMBER: 'Stairclimber',
  OTHER: 'Cardio',
};

/** Spiegelt `LastActivity` uit src/server/lib/training-totals.ts in de web-repo. */
export type LastActivity =
  | {
      kind: 'session';
      id: string;
      completedAt: string;
      programName: string | null;
      durationSec: number | null;
      rpe: number | null;
      pain: number | null;
      exerciseCount: number;
      completedAll: boolean;
    }
  | {
      kind: 'cardio';
      id: string;
      completedAt: string;
      activity: string;
      durationSec: number;
      distanceM: number | null;
      avgHeartRate: number | null;
      zone: number | null;
      rpe: number | null;
      pain: number | null;
      paceSecPerKm: number | null;
      notes: string | null;
    };

const MAAND = ['JAN', 'FEB', 'MRT', 'APR', 'MEI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];

const dagStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * "VANDAAG", "GISTEREN" of "19 AUG". Rekent in de tijdzone van het toestel;
 * die staat bij deze gebruikers op Amsterdam en is wat zij als "vandaag" zien.
 */
export function dayLabel(completedAtIso: string, now: Date): string {
  const d = new Date(completedAtIso);
  const dagen = Math.round((dagStart(now) - dagStart(d)) / 86_400_000);
  if (dagen === 0) return 'VANDAAG';
  if (dagen === 1) return 'GISTEREN';
  return `${d.getDate()} ${MAAND[d.getMonth()]}`;
}

/** Duur van één sessie: minuten lezen daar prettiger dan uren ("79 min"). */
export function formatSessionDuration(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

/** Duur over een week: uren zodra het een uur of meer is ("2u31"). */
export function formatWeekDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}u${String(min % 60).padStart(2, '0')}`;
}

/** Wat er groot in de detailweergave en op de tegel staat. */
export function lastActivityName(last: LastActivity): string {
  if (last.kind === 'cardio') return CARDIO_LABEL[last.activity] ?? 'Cardio';
  return last.programName ?? 'Workout';
}

/** "Schema B · 8 oef · 79 min" of "Hardlopen · 40 min". */
export function lastActivitySub(last: LastActivity): string {
  const delen: string[] = [lastActivityName(last)];
  if (last.kind === 'session' && last.exerciseCount > 0) {
    delen.push(`${last.exerciseCount} oef`);
  }
  const sec = last.durationSec;
  if (sec != null && sec > 0) delen.push(formatSessionDuration(sec));
  return delen.join(' · ');
}

/** "2u31 · 4 totaal", of alleen de teller als er deze week nog niets is. */
export function weekSub(seconds: number, allTimeCount: number): string {
  const teller = allTimeCount > 0 ? `${allTimeCount} totaal` : null;
  const tijd = seconds > 0 ? formatWeekDuration(seconds) : null;
  const delen = [tijd, teller].filter((s): s is string => s !== null);
  return delen.length > 0 ? delen.join(' · ') : 'nog niets gelogd';
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm run check:home-tiles
```

Verwacht: PASS, alle regels met een vinkje, "Opmaak klopt."

- [ ] **Step 5: Typecheck de mobiele repo**

```bash
cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit -p tsconfig.json
```

Verwacht: geen uitvoer.

- [ ] **Step 6: Commit, in beide repo's**

```bash
cd /Users/eva/mbt-gym-mobile
git add lib/home-tiles.ts
git commit -m "feat(beginscherm): opmaak-functies voor de tegels laatste en deze week"

cd /Users/eva/mbt-gym
git add scripts/check-home-tiles.ts package.json
git commit -m "chore(checks): controle op de opmaak van de beginscherm-tegels"
```

---

### Task 4: MetricTile wordt tikbaar

**Files:**
- Modify: `/Users/eva/mbt-gym-mobile/components/dark-ui.tsx` (`MetricTile`, nu rond regel 300)

**Interfaces:**
- Consumes: `TapScale` uit hetzelfde bestand
- Produces: `MetricTile` accepteert `onPress?: () => void`. Task 6 gebruikt dat.

- [ ] **Step 1: Pas MetricTile aan**

Vervang de hele `MetricTile`-functie door:

```tsx
export function MetricTile({
  label,
  value,
  unit,
  sub,
  tint = P.ink,
  flex = 1,
  onPress,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tint?: string;
  flex?: number;
  /** Tikbaar maken. Zonder dit gedraagt de tegel zich als voorheen. */
  onPress?: () => void;
}) {
  const inhoud = (
    <GlassSurface radius={16} style={[tileStyles.metric, { flex: onPress ? 1 : flex }]}>
      <MetaLabel>{String(label).toUpperCase()}</MetaLabel>
      <View style={tileStyles.metricValueRow}>
        <ThemedText style={[tileStyles.metricValue, { color: tint }]}>{value}</ThemedText>
        {unit && <MetaLabel style={{ marginLeft: 4 }}>{unit}</MetaLabel>}
      </View>
      {sub && <ThemedText style={tileStyles.metricSub}>{sub}</ThemedText>}
    </GlassSurface>
  );

  if (!onPress) return inhoud;

  // `flex` hoort op de wrapper, niet op de Pressable: binnen TapScale lost een
  // breedte op de Pressable niet op tegen de rij. Zie de toelichting bij
  // wrapperStyle in TapScale.
  return (
    <TapScale onPress={onPress} wrapperStyle={{ flex }}>
      {inhoud}
    </TapScale>
  );
}
```

`TapScale` staat verderop in hetzelfde bestand gedefinieerd; een functie-declaratie is gehoist, dus er hoeft niets verplaatst te worden.

- [ ] **Step 2: Typecheck en lint**

```bash
cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit -p tsconfig.json && npx expo lint 2>&1 | grep -A5 "dark-ui.tsx"
```

Verwacht: geen tsc-uitvoer. Lint toont voor `dark-ui.tsx` alleen de twee bestaande waarschuwingen over ongebruikte `Platform` en `Radius`; niets nieuws.

- [ ] **Step 3: Commit**

```bash
git add components/dark-ui.tsx
git commit -m "feat(dark-ui): MetricTile kan tikbaar zijn"
```

---

### Task 5: EventDetailSheet en CalEvent exporteren

**Files:**
- Modify: `/Users/eva/mbt-gym-mobile/components/schedule-calendar.tsx` (`CARDIO_LABEL` rond regel 45, `CalEvent` rond regel 159, `EventDetailSheet` rond regel 588)

**Interfaces:**
- Consumes: `CARDIO_LABEL` uit `lib/home-tiles.ts` (Task 3)
- Produces: `export type CalEvent` en `export function EventDetailSheet({ event, eventDate, isToday, onClose })`. Task 6 gebruikt beide.

- [ ] **Step 1: Haal CARDIO_LABEL uit de component**

Verwijder in `components/schedule-calendar.tsx` de lokale `const CARDIO_LABEL: Record<string, string> = { ... };` en importeer hem in plaats daarvan, bij de andere `@/lib`-imports:

```ts
import { CARDIO_LABEL } from '@/lib/home-tiles';
```

De inhoud is identiek aan wat er stond; het gebruik op de plek waar de cardio-`CalEvent` wordt gebouwd blijft ongewijzigd.

- [ ] **Step 2: Exporteer het type en de component**

Zet `export` voor de typedeclaratie:

```ts
export type CalEvent =
```

En voor de component:

```ts
export function EventDetailSheet({
```

Verder verandert er niets aan die twee.

- [ ] **Step 3: Typecheck en lint**

```bash
cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit -p tsconfig.json && npx expo lint 2>&1 | grep -A5 "schedule-calendar.tsx"
```

Verwacht: geen tsc-uitvoer, en geen nieuwe lint-meldingen op `schedule-calendar.tsx`.

- [ ] **Step 4: Controleer dat de kalender nog werkt**

Start de app in de simulator en open het Weekschema. Tik op een gelogde krachtsessie en op een cardio-activiteit. Beide detailweergaven horen te openen zoals voorheen, met de juiste Nederlandse activiteitsnaam in de kop.

```bash
cd /Users/eva/mbt-gym-mobile && npx expo start --ios
```

- [ ] **Step 5: Commit**

```bash
git add components/schedule-calendar.tsx
git commit -m "refactor(kalender): detailweergave en activiteitslabels herbruikbaar gemaakt"
```

---

### Task 6: De tegels op beide dashboards

**Files:**
- Modify: `/Users/eva/mbt-gym-mobile/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `patient.getSessionStats` (Task 2), `lib/home-tiles.ts` (Task 3), `MetricTile` met `onPress` (Task 4), `CalEvent` en `EventDetailSheet` (Task 5)
- Produces: eindresultaat, niets voor latere taken

- [ ] **Step 1: Breid het datatype en de fetch uit**

Vervang bovenin `app/(tabs)/index.tsx` het type `DashData`:

```ts
type SessionStatsResponse = {
  total: number;
  week: { count: number; seconds: number };
  allTime: { count: number };
  last: LastActivity | null;
};

type DashData = {
  today: TodayResponse | null;
  history: SessionItem[];
  programs: ActiveProgram[];
  stats: SessionStatsResponse | null;
};
```

`totalSessions` vervalt helemaal. Dat veld voedde alleen de oude TOTAL-tegel; `stats.allTime.count` neemt die rol over. Laat je het staan, dan is het dode code en klaagt lint erover.

Voeg bij de imports toe:

```ts
import {
  dayLabel,
  lastActivityName,
  lastActivitySub,
  weekSub,
  type LastActivity,
} from '@/lib/home-tiles';
import { EventDetailSheet, type CalEvent } from '@/components/schedule-calendar';
```

Pas in `useDashboardData` de state aan. Vervang de regel `const [totalSessions, setTotalSessions] = useState<number | null>(null);` door:

```ts
  const [stats, setStats] = useState<SessionStatsResponse | null>(null);
```

Vervang in de cache-hydratie de regel `setTotalSessions(c.totalSessions);` door:

```ts
        setStats(c.stats ?? null);
```

Vervang de vierde fetch-regel (die nu `trpcQuery<{ total: number }>` doet) door:

```ts
        trpcQuery<SessionStatsResponse>('patient.getSessionStats').catch(() => null),
```

Hernoem in de `.then`-tak de vierde destructurering van `stats` naar `s`, zodat hij niet botst met de nieuwe state:

```ts
        .then(([t, h, p, s]) => {
```

En vervang binnen die tak de regel `setTotalSessions(stats?.total ?? null);` plus de `writeCache`-aanroep door:

```ts
          setStats(s ?? null);
          writeCache('dashboard.home', {
            today: t,
            history: h,
            programs: p,
            stats: s ?? null,
          } satisfies DashData);
```

En geef `stats` mee in de return:

```ts
  return { today, history, programs, stats, loading };
```

Een cache-object van vóór deze wijziging heeft geen `stats`; `c.stats ?? null` vangt dat af en de tegels staan dan een fractie op nul tot de verse fetch binnen is.

- [ ] **Step 2: Maak de gedeelde tegelrij**

Voeg boven `PatientDashboard` een component toe die beide dashboards gebruiken:

```tsx
/**
 * De twee tegels onder de dagbelasting: wat deed je laatst, en waar sta je
 * deze week.
 *
 * Links opent de sessie zelf via de detailweergave uit de kalender, zodat
 * afronden en terugzien in elkaars verlengde liggen. Dat ontbrak, en daardoor
 * leek een gelogde workout verdwenen. Rechts opent het Weekschema, want dat
 * toont dezelfde kracht plus cardio waar dit getal over gaat.
 */
function TrainingTiles({ stats }: { stats: SessionStatsResponse | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<CalEvent | null>(null);

  const last = stats?.last ?? null;
  const now = new Date();

  const openLast = () => {
    if (!last) return;
    setDetail(
      last.kind === 'cardio'
        ? {
            kind: 'cardio',
            id: last.id,
            name: lastActivityName(last),
            category: 'CARDIO',
            durationSec: last.durationSec,
            distanceM: last.distanceM,
            avgHeartRate: last.avgHeartRate,
            zone: last.zone,
            rpe: last.rpe,
            pain: last.pain,
            paceSecPerKm: last.paceSecPerKm,
            notes: last.notes,
          }
        : {
            kind: 'session',
            id: last.id,
            name: lastActivityName(last),
            category: 'STRENGTH',
            status: last.completedAll === false ? 'partial' : 'done',
            durationSec: last.durationSec,
            rpe: last.rpe,
            pain: last.pain,
            exerciseCount: last.exerciseCount,
          },
    );
  };

  const lastDate = last ? new Date(last.completedAt) : now;

  return (
    <>
      <View style={screenStyles.metricRow}>
        <MetricTile
          label="LAATSTE"
          value={last ? dayLabel(last.completedAt, now) : '—'}
          sub={last ? lastActivitySub(last) : 'nog niets gelogd'}
          onPress={last ? openLast : undefined}
        />
        <MetricTile
          label="DEZE WEEK"
          value={stats?.week.count ?? 0}
          unit={(stats?.week.count ?? 0) === 1 ? 'TRAINING' : 'TRAININGEN'}
          sub={weekSub(stats?.week.seconds ?? 0, stats?.allTime.count ?? 0)}
          onPress={() => router.push('/kalender' as never)}
        />
      </View>
      <EventDetailSheet
        event={detail}
        eventDate={lastDate}
        isToday={last ? dayLabel(last.completedAt, now) === 'VANDAAG' : false}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
```

- [ ] **Step 3: Zet de rij in het sporter-dashboard**

In `AthleteDashboard`: haal `stats` uit `useDashboardData` en vervang het blok dat begint met `<View style={screenStyles.metricRow}>` en de tegels TOTAL en THIS WEEK bevat, door:

```tsx
              <TrainingTiles stats={stats} />
```

De destructurering wordt:

```ts
  const { today, history, programs, stats, loading } = useDashboardData();
```

In dit dashboard werden `flexibel`, `weekDone` en `weekTotal` **alleen** door de THIS WEEK-tegel gebruikt. Verwijder die drie berekeningen dus ook. `history` blijft nodig, want `useDashboardData` levert hem en andere onderdelen lezen hem; laat lint bepalen of hij hier nog gebruikt wordt en haal hem anders uit de destructurering.

- [ ] **Step 4: Zet de rij in het patiënt-dashboard**

In `PatientDashboard`: vervang het blok met de tegels TOTAL en AVG PAIN door dezelfde regel:

```tsx
              <TrainingTiles stats={stats} />
```

Pas de destructurering aan naar `const { today, history, programs, stats, loading } = useDashboardData();` en verwijder de `painScores`- en `avgPain`-berekeningen, want die worden hier niet meer gebruikt. Pijn blijft staan in Resultaten en Geschiedenis.

**Let op, hier ligt het anders dan bij de sporter.** `flexibel`, `weekDone`, `weekTotal`, `weekCompleet` en `todayDone` blijven hier wél in gebruik: de hero toont `WEEK COMPLEET · ${weekDone}/${weekTotal}` en kiest zijn label op `todayDone`. Verwijder daar niets van. Alleen `painScores` en `avgPain` gaan weg, en `history` blijft nodig omdat `todayDone` erop leunt.

- [ ] **Step 5: Typecheck en lint**

```bash
cd /Users/eva/mbt-gym-mobile && npx tsc --noEmit -p tsconfig.json && npx expo lint 2>&1 | grep -A8 "(tabs)/index.tsx"
```

Verwacht: geen tsc-uitvoer, en geen nieuwe lint-meldingen. Blijft er een waarschuwing over een ongebruikte variabele staan, verwijder die variabele dan alsnog.

- [ ] **Step 6: Draai de app en controleer**

```bash
cd /Users/eva/mbt-gym-mobile && npx expo start --ios
```

Log in als een sporter met recente data en controleer op het beginscherm:

1. Links staat `LAATSTE` met een dag en een leesbare subregel.
2. Tikken op die tegel opent de detailweergave met de oefeningen erin; sluiten werkt.
3. Rechts staat `DEZE WEEK` met het aantal trainingen en eronder tijd plus totaal.
4. Tikken opent het Weekschema.
5. Beide tegels schalen even kort in bij aanraking, gelijk aan de gezondheidstegels.
6. Op een patiënt-account staat dezelfde rij, en de pijntegel is weg.

Log daarna in als een account zonder enige gelogde training. Links hoort `—` met "nog niets gelogd" te staan en niet tikbaar te zijn; rechts `0 TRAININGEN`.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat(beginscherm): tegels tonen je laatste training en je week"
```

---

## Na afloop

Draai in de web-repo `npm test`, `npm run check:home-tiles` en `npm run verify:home-tiles`, en in de mobiele repo `npx tsc --noEmit`. Push beide repo's pas als alles groen is.

De wijziging is pas zichtbaar voor gebruikers na een nieuwe EAS-build met auto-submit naar TestFlight. De serverkant kan vooruit: hij is additief, dus oudere builds blijven werken op het bestaande `total`-veld.
