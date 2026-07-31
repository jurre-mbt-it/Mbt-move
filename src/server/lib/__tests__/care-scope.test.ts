import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'

import { careScopeKey, careScopeWhere, careScopeWhereForRead } from '../care-scope'

const therapeut = { id: 't1', role: 'THERAPIST' as const, practiceId: 'p1' }
const coach = { id: 'c1', role: 'COACH' as const, practiceId: null }
const losseTherapeut = { id: 't2', role: 'THERAPIST' as const, practiceId: null }
const admin = { id: 'a1', role: 'ADMIN' as const, practiceId: 'p1' }
const patient = { id: 'p9', role: 'PATIENT' as const, practiceId: 'p1' }
const atleet = { id: 'a9', role: 'ATHLETE' as const, practiceId: 'p1' }

/** De tRPC-foutcode van een gooiende aanroep, of null als hij niet gooide. */
function foutcode(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof TRPCError ? e.code : `geen TRPCError: ${String(e)}`
  }
}

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

  it('weigert een therapeut zonder praktijk met PRECONDITION_FAILED, niet met een 500', () => {
    expect(foutcode(() => careScopeKey(losseTherapeut))).toBe('PRECONDITION_FAILED')
  })

  it('laat een admin met praktijk in de praktijk-tak vallen', () => {
    // Bewust afwijkend van practiceScope(), dat alleen THERAPIST toelaat. Een
    // admin beheert hier vanuit zijn eigen praktijk; zonder praktijk gooit hij.
    expect(careScopeKey(admin)).toEqual({ practiceId: 'p1', coachId: null })
  })

  it('weigert een patiënt, ook al deelt die de practiceId van zijn therapeut', () => {
    // De lekklasse uit AGENTS.md: patiënten en atleten erven de practiceId van
    // hun therapeut. Zou de praktijk-tak op practiceId hangen in plaats van op
    // rol, dan zag elke patiënt het dossier van elke medepatiënt.
    expect(foutcode(() => careScopeKey(patient))).toBe('FORBIDDEN')
  })

  it('weigert een atleet om dezelfde reden', () => {
    expect(foutcode(() => careScopeKey(atleet))).toBe('FORBIDDEN')
  })
})

describe('careScopeWhere', () => {
  it('geeft nooit een lege where terug', () => {
    // Een lege where zou in een OR-tak de scoping volledig laten wegvallen.
    expect(careScopeWhere(coach)).toEqual({ coachId: 'c1' })
    expect(careScopeWhere(therapeut)).toEqual({ practiceId: 'p1' })
  })
})

describe('careScopeWhereForRead', () => {
  it('scopet net als de schrijfvariant zolang er een geldige scope is', () => {
    expect(careScopeWhereForRead(therapeut)).toEqual({ practiceId: 'p1' })
    expect(careScopeWhereForRead(coach)).toEqual({ coachId: 'c1' })
    expect(careScopeWhereForRead(admin)).toEqual({ practiceId: 'p1' })
  })

  it('gooit niet bij een therapeut zonder praktijk maar matcht niets', () => {
    // Anders levert één verkeerde onboarding een 500 op de hele patiëntenlijst.
    expect(careScopeWhereForRead(losseTherapeut)).toEqual({ practiceId: { in: [] } })
  })

  it('matcht ook niets voor een rol die hier niets te zoeken heeft', () => {
    expect(careScopeWhereForRead(patient)).toEqual({ practiceId: { in: [] } })
    expect(careScopeWhereForRead(atleet)).toEqual({ practiceId: { in: [] } })
  })

  it('geeft elke aanroep een vers object, zodat een caller het kan uitbreiden', () => {
    const a = careScopeWhereForRead(losseTherapeut)
    const b = careScopeWhereForRead(losseTherapeut)
    expect(a).not.toBe(b)
  })
})
