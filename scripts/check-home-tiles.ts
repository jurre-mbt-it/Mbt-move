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

import { pickLastActivity } from '../src/server/lib/training-totals'

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

  // ── Drift tussen server en app ──────────────────────────────────────────
  // `LastActivity` staat in beide repo's, want er is geen gedeeld package.
  // Een commentaarregel dat ze elkaar spiegelen is geen bewaking, dus voeren
  // we hier de ECHTE serverfunctie uit en stoppen haar uitvoer in de ECHTE
  // formatters van de app. Hernoemt de server een veld, dan valt dit om.
  console.log('\nserver-uitvoer past in de app-formatters')

  check('krachtsessie van pickLastActivity is te renderen', () => {
    const vanServer = pickLastActivity(
      {
        id: 's1',
        completedAt: new Date('2026-08-21T12:39:04Z'),
        duration: 4769,
        exertionLevel: 9,
        painLevel: 3,
        completedAll: false,
        program: { name: 'Schema B' },
        _count: { exerciseLogs: 8 },
      },
      null,
    )
    assert.ok(vanServer, 'server gaf null terug')
    assert.equal(lastActivityName(vanServer), 'Schema B')
    assert.equal(lastActivitySub(vanServer), 'Schema B · 8 oef · 79 min')
    assert.equal(dayLabel(vanServer.completedAt, nu), 'VANDAAG')
  })

  check('cardio van pickLastActivity is te renderen', () => {
    const vanServer = pickLastActivity(null, {
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
    })
    assert.ok(vanServer, 'server gaf null terug')
    assert.equal(lastActivityName(vanServer), 'Hardlopen')
    assert.equal(lastActivitySub(vanServer), 'Hardlopen · 40 min')
    assert.equal(dayLabel(vanServer.completedAt, nu), '19 AUG')
  })

  check('de app leest geen velden die de server niet stuurt', () => {
    // Alles wat de app van een cardio-activiteit gebruikt om een CalEvent te
    // bouwen, moet de server ook echt meesturen.
    const vanServer = pickLastActivity(null, {
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
    })
    const nodig = [
      'kind', 'id', 'completedAt', 'activity', 'durationSec', 'distanceM',
      'avgHeartRate', 'zone', 'rpe', 'pain', 'paceSecPerKm', 'notes',
    ]
    for (const veld of nodig) {
      assert.ok(veld in (vanServer as object), `server stuurt "${veld}" niet mee`)
    }
  })

  console.log(fouten === 0 ? '\nOpmaak klopt.\n' : `\n${fouten} controle(s) gefaald.\n`)
  process.exit(fouten === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
