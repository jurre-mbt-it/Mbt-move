import { describe, expect, it } from 'vitest'

import {
  laatsteAfgeslotenTraject,
  mergeCriterionStatuses,
  statussenVanTraject,
  trajectOutcomeTekst,
  trajectPeriode,
} from '../rehab-traject'

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

describe('trajectOutcomeTekst', () => {
  it('vertaalt een bekende uitkomst', () => {
    expect(trajectOutcomeTekst('COMPLETED')).toBe('criteria behaald')
  })

  it('leest een leeg uitkomst-veld als onbekend en niet als een lege regel', () => {
    // Trajecten die via deactivateForPatient zijn dichtgezet (de app doet dat
    // nog) hebben outcome null. Dat is hetzelfde verhaal als UNKNOWN.
    expect(trajectOutcomeTekst(null)).toBe('geen uitkomst vastgelegd')
    expect(trajectOutcomeTekst(undefined)).toBe('geen uitkomst vastgelegd')
    expect(trajectOutcomeTekst('UNKNOWN')).toBe('geen uitkomst vastgelegd')
  })

  it('valt terug op de ruwe waarde bij een uitkomst die deze bundel niet kent', () => {
    expect(trajectOutcomeTekst('IETS_NIEUWS')).toBe('IETS_NIEUWS')
  })
})

describe('laatsteAfgeslotenTraject', () => {
  const traject = (id: string, activatedAt: string, deactivatedAt: string | null) => ({
    id,
    activatedAt: new Date(activatedAt),
    deactivatedAt: deactivatedAt ? new Date(deactivatedAt) : null,
  })

  it('geeft null als de patiënt nooit een traject heeft gehad', () => {
    expect(laatsteAfgeslotenTraject([])).toBeNull()
  })

  it('geeft null zodra er een lopend traject is, ook als er afgesloten trajecten liggen', () => {
    const trajecten = [
      traject('oud', '2026-01-01', '2026-02-01'),
      traject('nieuw', '2026-03-01', null),
    ]
    expect(laatsteAfgeslotenTraject(trajecten)).toBeNull()
  })

  it('geeft het enige afgesloten traject als er maar één is', () => {
    const trajecten = [traject('t1', '2026-01-01', '2026-02-01')]
    expect(laatsteAfgeslotenTraject(trajecten)?.id).toBe('t1')
  })

  it('kiest van meerdere afgesloten trajecten het meest recent afgeslotene', () => {
    // Expres niet op activatedAt-volgorde aangeleverd: de functie mag niet op
    // invoervolgorde leunen.
    const trajecten = [
      traject('recent', '2026-05-01', '2026-06-01'),
      traject('oud', '2026-01-01', '2026-02-01'),
      traject('middelste', '2026-03-01', '2026-04-01'),
    ]
    expect(laatsteAfgeslotenTraject(trajecten)?.id).toBe('recent')
  })

  it('gebruikt het id als tweede sleutel bij een gelijke deactivatedAt', () => {
    const trajecten = [
      traject('a', '2026-01-01', '2026-02-01'),
      traject('b', '2026-01-02', '2026-02-01'),
    ]
    expect(laatsteAfgeslotenTraject(trajecten)?.id).toBe('b')
  })
})

describe('trajectPeriode', () => {
  it('zet begin en eind in één regel', () => {
    expect(trajectPeriode('2026-05-04T00:00:00Z', '2026-07-20T00:00:00Z')).toBe(
      '4 mei 2026 tot 20 juli 2026',
    )
  })

  it('zegt van een lopend traject dat het nog loopt', () => {
    expect(trajectPeriode('2026-05-04T00:00:00Z', null)).toBe('4 mei 2026, loopt nog')
  })

  it('slikt onbruikbare datums zonder NaN in beeld te zetten', () => {
    expect(trajectPeriode(null, null)).toBe('periode onbekend')
    expect(trajectPeriode('geen datum', null)).toBe('periode onbekend')
  })
})
