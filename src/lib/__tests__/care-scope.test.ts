import { describe, expect, it } from 'vitest'

import { careScopeKey, careScopeWhere } from '../care-scope'

const therapeut = { id: 't1', role: 'THERAPIST' as const, practiceId: 'p1' }
const coach = { id: 'c1', role: 'COACH' as const, practiceId: null }
const losseTherapeut = { id: 't2', role: 'THERAPIST' as const, practiceId: null }

describe('careScopeKey', () => {
  it('scopet een therapeut op zijn praktijk', () => {
    expect(careScopeKey(therapeut)).toEqual({ practiceId: 'p1', coachId: null })
  })

  it('scopet een coach op zichzelf, niet op practiceId null', () => {
    // Een coach heeft altijd practiceId null. Zonder eigen sleutel zouden
    // twee coaches elkaars gearchiveerde atleten zien.
    expect(careScopeKey(coach)).toEqual({ practiceId: null, coachId: 'c1' })
  })

  it('weigert een therapeut zonder praktijk', () => {
    expect(() => careScopeKey(losseTherapeut)).toThrow(/praktijk/i)
  })
})

describe('careScopeWhere', () => {
  it('geeft nooit een lege where terug', () => {
    // Een lege where zou in een OR-tak de scoping volledig laten wegvallen.
    expect(careScopeWhere(coach)).toEqual({ coachId: 'c1' })
    expect(careScopeWhere(therapeut)).toEqual({ practiceId: 'p1' })
  })
})
