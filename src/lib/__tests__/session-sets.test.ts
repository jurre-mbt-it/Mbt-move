import { describe, it, expect } from 'vitest'
import { formatWeightsPerSet } from '@/lib/session-sets'

describe('formatWeightsPerSet', () => {
  it('toont elk gelogd gewicht als de sets verschillen', () => {
    expect(formatWeightsPerSet([40, 50, 60, 60], 60)).toBe('40-50-60-60 kg')
  })

  it('comprimeert tot één getal als alle sets gelijk zijn', () => {
    expect(formatWeightsPerSet([60, 60, 60, 60], 60)).toBe('60 kg')
  })

  it('gebruikt de komma als decimaalteken', () => {
    expect(formatWeightsPerSet([12.5, 15], 15)).toBe('12,5-15 kg')
    expect(formatWeightsPerSet([12.5, 12.5], 12.5)).toBe('12,5 kg')
  })

  it('markeert een overgeslagen set middenin', () => {
    expect(formatWeightsPerSet([40, null, 60], 60)).toBe('40-—-60 kg')
  })

  it('laat niet-ingevulde sets aan het eind weg', () => {
    expect(formatWeightsPerSet([40, 50, null, null], 50)).toBe('40-50 kg')
    // Trailing gaten wegstrepen mag de compressie niet blokkeren.
    expect(formatWeightsPerSet([60, 60, null], 60)).toBe('60 kg')
  })

  it('valt terug op het losse weight-veld zonder per-set data', () => {
    expect(formatWeightsPerSet(null, 42.5)).toBe('42,5 kg')
    expect(formatWeightsPerSet([], 20)).toBe('20 kg')
    expect(formatWeightsPerSet([null, null], 20)).toBe('20 kg')
  })

  it('toont niets als er helemaal geen gewicht gelogd is', () => {
    expect(formatWeightsPerSet(null, null)).toBeNull()
    expect(formatWeightsPerSet([null, null], null)).toBeNull()
    expect(formatWeightsPerSet(undefined, undefined)).toBeNull()
  })
})
