import { describe, expect, it } from 'vitest'

import { shouldOfferRatingMute } from '../rating'

describe('shouldOfferRatingMute', () => {
  it('biedt aan bij elke derde overgeslagen rit van een type (3, 6, 9)', () => {
    expect(shouldOfferRatingMute(3, false)).toBe(true)
    expect(shouldOfferRatingMute(6, false)).toBe(true)
    expect(shouldOfferRatingMute(9, false)).toBe(true)
  })

  it('biedt niet aan onder de drie of tussen veelvouden in', () => {
    expect(shouldOfferRatingMute(0, false)).toBe(false)
    expect(shouldOfferRatingMute(1, false)).toBe(false)
    expect(shouldOfferRatingMute(2, false)).toBe(false)
    expect(shouldOfferRatingMute(4, false)).toBe(false)
    expect(shouldOfferRatingMute(5, false)).toBe(false)
  })

  it('biedt nooit aan als het type al gedempt is', () => {
    expect(shouldOfferRatingMute(3, true)).toBe(false)
    expect(shouldOfferRatingMute(9, true)).toBe(false)
  })
})
