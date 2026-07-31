import { describe, expect, it } from 'vitest'

import { mergeCriterionStatuses } from '../rehab-traject'

const criteria = [
  { id: 'c1', name: 'Knieflexie' },
  { id: 'c2', name: 'Hop test' },
]

describe('mergeCriterionStatuses', () => {
  it('koppelt een status aan zijn criterium', () => {
    const uit = mergeCriterionStatuses(criteria, [
      { criterionId: 'c1', status: 'MET', measurementValue: '128°', measurementDate: null },
    ])
    expect(uit[0].status).toBe('MET')
    expect(uit[0].measurementValue).toBe('128°')
  })

  it('geeft NOT_MET voor een criterium zonder status', () => {
    const uit = mergeCriterionStatuses(criteria, [])
    expect(uit.map((c) => c.status)).toEqual(['NOT_MET', 'NOT_MET'])
  })

  it('negeert een status die niet bij deze criteria hoort', () => {
    // Dit is de regressie: een status uit een ander traject mag nooit
    // opduiken, ook niet als hij per ongeluk in de lijst belandt.
    const uit = mergeCriterionStatuses(criteria, [
      { criterionId: 'onbekend', status: 'MET', measurementValue: '99', measurementDate: null },
    ])
    expect(uit.every((c) => c.status === 'NOT_MET')).toBe(true)
  })
})
