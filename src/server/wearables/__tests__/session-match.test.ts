import { describe, expect, it } from 'vitest'
import { isLinkableActivity, pickMatchingSession } from '../session-match'

const at = (iso: string) => new Date(iso)

/** Krachtsessie van 18:00 tot 19:00, zelf gelogd met een timer. */
const sessie = (over: Partial<Parameters<typeof pickMatchingSession>[1][number]> = {}) => ({
  id: 's1',
  completedAt: at('2026-08-22T19:00:00Z'),
  duration: 3600,
  scheduledAt: at('2026-08-22T18:00:00Z'),
  hasCardioLog: false,
  ...over,
})

describe('isLinkableActivity', () => {
  it('koppelt kracht, HIIT, yoga en onbekend', () => {
    for (const a of ['STRENGTH', 'HIIT', 'YOGA', 'OTHER'] as const) {
      expect(isLinkableActivity(a)).toBe(true)
    }
  })

  it('laat uithoudingstrainingen zelfstandig', () => {
    for (const a of ['RUNNING', 'CYCLING', 'SWIMMING', 'HIKING', 'WALKING'] as const) {
      expect(isLinkableActivity(a)).toBe(false)
    }
  })
})

describe('pickMatchingSession', () => {
  const meting = { activity: 'STRENGTH' as const, startAt: at('2026-08-22T18:02:00Z'), durationSec: 3480 }

  it('koppelt een watch-workout aan de sessie eromheen', () => {
    expect(pickMatchingSession(meting, [sessie()])?.id).toBe('s1')
  })

  it('koppelt geen hardloop aan een krachtsessie', () => {
    expect(pickMatchingSession({ ...meting, activity: 'RUNNING' }, [sessie()])).toBeNull()
  })

  it('slaat een sessie over die al een meting heeft', () => {
    expect(pickMatchingSession(meting, [sessie({ hasCardioLog: true })])).toBeNull()
  })

  it('koppelt niet aan een training van een ander moment', () => {
    const ochtend = sessie({
      id: 's2',
      scheduledAt: at('2026-08-22T07:00:00Z'),
      completedAt: at('2026-08-22T08:00:00Z'),
    })
    expect(pickMatchingSession(meting, [ochtend])).toBeNull()
  })

  it('kiest bij twee kandidaten de sessie die het dichtst ligt', () => {
    const vroeg = sessie({ id: 'vroeg', scheduledAt: at('2026-08-22T17:30:00Z'), completedAt: at('2026-08-22T18:30:00Z') })
    const raak = sessie({ id: 'raak' })
    expect(pickMatchingSession(meting, [vroeg, raak])?.id).toBe('raak')
  })

  it('werkt ook zonder gelogde duur, via start en afronding', () => {
    const zonderTimer = sessie({ duration: null })
    expect(pickMatchingSession(meting, [zonderTimer])?.id).toBe('s1')
  })

  it('trekt met een openstaand venster van uren geen losse workout naar zich toe', () => {
    // Sessie die om 12:00 begon en pas om 20:00 werd afgerond, zonder timer.
    const blijvenStaan = sessie({ duration: null, scheduledAt: at('2026-08-22T12:00:00Z'), completedAt: at('2026-08-22T20:00:00Z') })
    const kort = { activity: 'STRENGTH' as const, startAt: at('2026-08-22T12:05:00Z'), durationSec: 1200 }
    expect(pickMatchingSession(kort, [blijvenStaan])).toBeNull()
  })
})
