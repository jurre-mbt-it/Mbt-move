import { describe, expect, it } from 'vitest'

import { mergeCriterionStatuses, statussenVanTraject } from '../rehab-traject'

const criteria = [
  { id: 'c1', name: 'Knieflexie' },
  { id: 'c2', name: 'Hop test' },
]
const criterionIds = criteria.map((c) => c.id)

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

  it('negeert een status van een criterium buiten dit protocol', () => {
    // Let op wat dit WEL en NIET dekt. Deze functie kent geen trajecten, dus
    // hij beschermt alleen tegen een criterium dat niet in de lijst staat, bv.
    // na een protocolwissel. Kruisbesmetting tussen twee trajecten op HETZELFDE
    // protocol kan hij per definitie niet zien: die delen dezelfde criterionIds.
    // Dat geval staat hieronder bij statussenVanTraject.
    const uit = mergeCriterionStatuses(criteria, [
      { criterionId: 'onbekend', status: 'MET', measurementValue: '99', measurementDate: null },
    ])
    expect(uit.every((c) => c.status === 'NOT_MET')).toBe(true)
  })
})

describe('statussenVanTraject', () => {
  // Dit is de regressie waar het om gaat: twee trajecten van dezelfde patiënt
  // op hetzelfde protocol, dus met exact dezelfde criterionIds. Filteren op
  // criterium helpt daar niets; alleen de trackerId onderscheidt ze.
  const status = (trackerId: string, criterionId: string) => ({
    trackerId,
    criterionId,
    status: 'MET',
  })

  it('laat de vinkjes van een afgesloten traject niet in het nieuwe traject vallen', () => {
    const alles = [
      status('traject-oud', 'c1'),
      status('traject-oud', 'c2'),
      status('traject-nieuw', 'c1'),
    ]
    const uit = statussenVanTraject(alles, 'traject-nieuw', criterionIds)
    expect(uit).toEqual([status('traject-nieuw', 'c1')])
  })

  it('geeft niets terug voor een traject dat nog geen status heeft', () => {
    const uit = statussenVanTraject([status('traject-oud', 'c1')], 'traject-nieuw', criterionIds)
    expect(uit).toEqual([])
  })

  it('begrenst op de criteria van het protocol', () => {
    // Zonder deze grens kan een status van een criterium buiten het protocol
    // meetellen en komt `met` op topniveau hoger uit dan `total`.
    const alles = [status('traject-nieuw', 'c1'), status('traject-nieuw', 'c-ander-protocol')]
    const uit = statussenVanTraject(alles, 'traject-nieuw', criterionIds)
    expect(uit.map((s) => s.criterionId)).toEqual(['c1'])
  })

  it('houdt de merge schoon als beide trajecten hetzelfde criterium hebben', () => {
    // De twee functies samen, zoals rehab-data.ts ze gebruikt.
    const alles = [
      { ...status('traject-oud', 'c1'), measurementValue: '128°', measurementDate: null },
      { ...status('traject-oud', 'c2'), measurementValue: '95%', measurementDate: null },
    ]
    const uit = mergeCriterionStatuses(
      criteria,
      statussenVanTraject(alles, 'traject-nieuw', criterionIds),
    )
    expect(uit.map((c) => c.status)).toEqual(['NOT_MET', 'NOT_MET'])
    expect(uit.map((c) => c.measurementValue)).toEqual([null, null])
  })
})
