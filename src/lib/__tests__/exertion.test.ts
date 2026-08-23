import { describe, it, expect } from 'vitest'

import { exertionScore } from '../exertion'

/**
 * Negen dagen op 100 AU en één op 200: de p90-index (floor(10 × 0,9) = 9)
 * pakt daarmee 200 als referentie. Zo staat het ankerpunt vast en gaan de
 * verwachte waarden hieronder over de curve, niet over de percentiel-keuze.
 */
const REF_200 = [100, 100, 100, 100, 100, 100, 100, 100, 100, 200]

describe('exertionScore', () => {
  it('geeft null onder de zeven bruikbare dagen', () => {
    expect(exertionScore(150, [100, 100, 100, 100, 100, 100])).toBeNull()
    expect(exertionScore(150, [])).toBeNull()
  })

  it('telt alleen dagen met een positieve TRIMP als referentie', () => {
    // Zes bruikbare dagen plus rommel blijft onder de drempel.
    expect(exertionScore(150, [100, 100, 100, 100, 100, 100, 0, -5, NaN])).toBeNull()
  })

  it('zet de eigen p90-dag op 6,3 van de 10', () => {
    expect(exertionScore(200, REF_200)).toBe(63)
  })

  it('houdt de onderkant van de schaal waar hij stond', () => {
    // De ijking tegen Athlytic (juli 2026) zit hier: een rustige ochtend rond
    // 8% van de p90-dag las 0,8 en moet dat blijven lezen. Bij kleine ratio's
    // valt de curve samen met de oude lineaire schaal.
    expect(exertionScore(16, REF_200)).toBe(8)
    expect(exertionScore(40, REF_200)).toBe(18)
  })

  it('houdt zware dagen onderling onderscheidbaar', () => {
    // De reden voor deze curve: hiervoor liep alles vanaf de p90 vast op 100
    // en las een dag van 200 AU hetzelfde als een van 600.
    const p90 = exertionScore(200, REF_200)!
    const dubbel = exertionScore(400, REF_200)!
    const drievoud = exertionScore(600, REF_200)!

    expect(dubbel).toBe(86)
    expect(drievoud).toBe(95)
    expect(p90).toBeLessThan(dubbel)
    expect(dubbel).toBeLessThan(drievoud)
  })

  it('blijft binnen 0-100 en geeft 0 bij een lege dag', () => {
    expect(exertionScore(0, REF_200)).toBe(0)
    expect(exertionScore(100_000, REF_200)).toBe(100)
  })
})
