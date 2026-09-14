import { describe, it, expect } from 'vitest'
import { hqRatio, kiesHqPaar } from '@/lib/kinvent/hq-ratio'

/**
 * Hamstring-quadricepsratio uit twee rapportregels: per zijde hamstring
 * gedeeld door quadriceps, als verhouding (0,62), zoals de catalogustest
 * "H:Q ratio" hem plot (as 0,4 tot 0,9, oranje vanaf 0,5, groen vanaf 0,6).
 */
const regel = (name: string, left: number | null, right: number | null, importedAt: string | null = '2026-09-14') => ({
  id: name.toLowerCase(),
  catalogItemName: name,
  leftPrimary: left,
  rightPrimary: right,
  unitPrimary: 'N',
  importedAt: importedAt ? new Date(importedAt) : null,
})

describe('hqRatio', () => {
  it('deelt hamstring door quadriceps per zijde, op twee decimalen', () => {
    expect(hqRatio({ left: 410, right: 380 }, { left: 250, right: 210 })).toEqual({ left: 0.61, right: 0.55 })
  })

  it('geeft null voor een zijde zonder beide waarden', () => {
    expect(hqRatio({ left: 410, right: null }, { left: 250, right: 210 })).toEqual({ left: 0.61, right: null })
    expect(hqRatio({ left: 0, right: 380 }, { left: 250, right: 210 })).toEqual({ left: null, right: 0.55 })
  })
})

describe('kiesHqPaar', () => {
  it('pakt de quadriceps- en hamstringregel uit het rapport', () => {
    const paar = kiesHqPaar([regel('Quadriceps', 410, 380), regel('Hamstrings', 250, 210), regel('Kuit', 900, 880)])
    expect(paar?.quad.id).toBe('quadriceps')
    expect(paar?.ham.id).toBe('hamstrings')
  })

  it('geeft null als een van de twee ontbreekt', () => {
    expect(kiesHqPaar([regel('Quadriceps', 410, 380)])).toBeNull()
  })

  it('kiest bij dubbele regels de laatst geïmporteerde', () => {
    const paar = kiesHqPaar([
      { ...regel('Quadriceps', 300, 300, '2026-01-01'), id: 'oud' },
      { ...regel('Quadriceps', 410, 380, '2026-09-14'), id: 'nieuw' },
      regel('Hamstrings', 250, 210),
    ])
    expect(paar?.quad.id).toBe('nieuw')
  })
})
