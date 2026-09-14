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

import {
  meetKolommenVoor,
  meetParamsUitSets,
  prevMeetFor,
  formatMeetParams,
  seedParamsZonderMeetvelden,
} from '../session-sets'

describe('metingen per set (staafsnelheid, piekvermogen)', () => {
  const voorschrift = [
    { id: 'tempo', label: 'Tempo', type: 'text', value: '3-1-1' },
    { id: 'bar_speed', label: 'Staafsnelheid', type: 'number', value: 0, unit: 'm/s' },
    { id: 'peak_power', label: 'Piekvermogen', type: 'number', value: 0, unit: 'W' },
  ]

  it('haalt alleen de meetkolommen uit het voorschrift, in volgorde', () => {
    expect(meetKolommenVoor(voorschrift)).toEqual([
      { label: 'Staafsnelheid', unit: 'm/s' },
      { label: 'Piekvermogen', unit: 'W' },
    ])
    expect(meetKolommenVoor(null)).toEqual([])
  })

  it('bewaart elke set en vat samen: snelheid gemiddeld, vermogen maximaal', () => {
    const kolommen = meetKolommenVoor(voorschrift)
    const sets = [
      { kg: '80', reps: '5', done: true, meet: { Staafsnelheid: '0,45', Piekvermogen: '600' } },
      { kg: '80', reps: '5', done: true, meet: { Staafsnelheid: '0.41', Piekvermogen: '640' } },
      { kg: '80', reps: '5', done: false },
    ]
    expect(meetParamsUitSets(kolommen, sets)).toEqual([
      { label: 'Staafsnelheid', type: 'number', value: 0.43, unit: 'm/s', perSet: [0.45, 0.41, null] },
      { label: 'Piekvermogen', type: 'number', value: 640, unit: 'W', perSet: [600, 640, null] },
    ])
  })

  it('laat een kolom weg als geen enkele set is ingevuld', () => {
    const kolommen = meetKolommenVoor(voorschrift)
    expect(meetParamsUitSets(kolommen, [{ kg: '', reps: '', done: false }])).toEqual([])
  })

  it('geeft de vorige meting per set als ghost-waarde', () => {
    const last = {
      weight: null, weightsPerSet: null, repsPerSet: null, repsCompleted: null, setsCompleted: null, completedAt: null,
      extraParams: [{ label: 'Staafsnelheid', type: 'number', value: 0.43, unit: 'm/s', perSet: [0.45, 0.41] }],
    }
    expect(prevMeetFor(last, 'Staafsnelheid', 0)).toBe(0.45)
    expect(prevMeetFor(last, 'Staafsnelheid', 5)).toBe(0.43)
    expect(prevMeetFor(last, 'Piekvermogen', 0)).toBeNull()
    expect(prevMeetFor(undefined, 'Staafsnelheid', 0)).toBeNull()
  })

  it('toont metingen per set in historie en dossier', () => {
    expect(formatMeetParams([
      { label: 'Tempo', type: 'text', value: '3-1-1' },
      { label: 'Staafsnelheid', type: 'number', value: 0.43, unit: 'm/s', perSet: [0.45, 0.41, null] },
      { label: 'Piekvermogen', type: 'number', value: 640, unit: 'W' },
    ])).toBe('Staafsnelheid 0,45-0,41 m/s · Piekvermogen 640 W')
    expect(formatMeetParams([{ label: 'Tempo', type: 'text', value: '3-1-1' }])).toBeNull()
  })

  it('zet geen los meetveld meer naast de set-rijen', () => {
    const params = seedParamsZonderMeetvelden(
      [{ label: 'Tempo', type: 'text', value: '3-1-1' }],
      [{ label: 'Staafsnelheid', type: 'number', value: 0.4 }, { label: 'Tempo', type: 'text', value: '2-0-2' }],
      false,
    )
    expect(params.map(p => p.label)).toEqual(['Tempo'])
    expect(params[0].value).toBe('2-0-2')
  })
})
