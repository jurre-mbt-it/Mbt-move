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
