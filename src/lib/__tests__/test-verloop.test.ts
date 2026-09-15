import { describe, expect, it } from 'vitest'

import {
  bouwTestVerloop,
  doelLijn,
  hoofdUitslag,
  metEenheid,
  zijdenTekst,
  type VerloopCriterium,
  type VerloopRegel,
} from '@/lib/test-report/verloop'

let teller = 0
const regel = (over: Partial<VerloopRegel>): VerloopRegel => ({
  reportId: `r${++teller}`,
  datum: '2026-06-01T10:00:00.000Z',
  definitief: true,
  catalogItemId: 'cat-quad',
  name: 'Quadriceps',
  subtitle: 'isometrisch',
  category: 'Kracht',
  categoryOrder: 1,
  source: null,
  kind: 'BILATERAL',
  metric: 'LSI',
  unitPrimary: 'N',
  plotUnit: '%',
  axisMin: 60,
  axisMax: 100,
  zoneOrangeMin: 80,
  zoneGreenMin: 90,
  higherIsBetter: true,
  leftPrimary: 400,
  rightPrimary: 440,
  singleValue: null,
  textValue: null,
  plottedValueOverride: null,
  zoneOverride: null,
  ...over,
})

const criterium = (over: Partial<VerloopCriterium>): VerloopCriterium => ({
  id: 'c1',
  catalogItemId: 'cat-quad',
  name: 'Quadriceps LSI',
  phaseOrder: 2,
  phaseName: 'Fase 2',
  status: 'NOT_MET',
  isBilateral: true,
  lsiMinGreen: 90,
  newtonMinGreen: null,
  ...over,
})

describe('bouwTestVerloop', () => {
  it('koppelt dezelfde catalogustest over rapporten heen, oud naar nieuw', () => {
    const reeksen = bouwTestVerloop(
      [
        regel({ datum: '2026-08-01T10:00:00.000Z', leftPrimary: 430, rightPrimary: 450 }),
        regel({ datum: '2026-06-01T10:00:00.000Z', leftPrimary: 380, rightPrimary: 450 }),
      ],
      [],
    )
    expect(reeksen).toHaveLength(1)
    expect(reeksen[0].key).toBe('cat-cat-quad')
    expect(reeksen[0].punten.map((p) => p.links)).toEqual([380, 430])
    expect(reeksen[0].laatste.links).toBe(430)
  })

  it('groepeert regels zonder catalogustest op naam, soort en eenheid', () => {
    const reeksen = bouwTestVerloop(
      [
        regel({ catalogItemId: null, name: 'Knee extension 60°', unitPrimary: 'kg' }),
        regel({ catalogItemId: null, name: 'knee extension  60°', unitPrimary: 'kg', datum: '2026-07-01T10:00:00.000Z' }),
        regel({ catalogItemId: null, name: 'Knee extension 60°', unitPrimary: 'N' }),
      ],
      [],
    )
    expect(reeksen).toHaveLength(2)
    const kg = reeksen.find((r) => r.eenheid === 'kg')
    expect(kg?.punten).toHaveLength(2)
  })

  it('houdt een catalogustest en een losse regel met dezelfde naam gescheiden', () => {
    const reeksen = bouwTestVerloop([regel({}), regel({ catalogItemId: null, unitPrimary: 'kg' })], [])
    expect(reeksen).toHaveLength(2)
  })

  it('rondt waarden en LSI af en berekent geplotte waarde en zone', () => {
    const [r] = bouwTestVerloop([regel({ leftPrimary: 402.943, rightPrimary: 444.393 })], [])
    expect(r.laatste).toMatchObject({ links: 403, rechts: 444, lsi: 91, geplot: 91, zone: 'GREEN' })
  })

  it('laat een handmatige override winnen', () => {
    const [r] = bouwTestVerloop([regel({ plottedValueOverride: 70, zoneOverride: 'RED' })], [])
    expect(r.laatste).toMatchObject({ geplot: 70, zone: 'RED' })
  })

  it('slaat lege regels over en laat een test zonder uitslag weg', () => {
    const reeksen = bouwTestVerloop(
      [regel({ leftPrimary: null, rightPrimary: null }), regel({ catalogItemId: 'cat-hop', leftPrimary: null, rightPrimary: null })],
      [],
    )
    expect(reeksen).toHaveLength(0)
  })

  it('neemt een tekstuitslag mee', () => {
    const [r] = bouwTestVerloop(
      [regel({ kind: 'SINGLE', metric: 'VALUE', leftPrimary: null, rightPrimary: null, textValue: 'negatief' })],
      [],
    )
    expect(r.laatste.tekst).toBe('negatief')
  })

  it('toont alleen definitieve rapporten als dat gevraagd is', () => {
    const reeksen = bouwTestVerloop([regel({ definitief: false }), regel({ catalogItemId: 'cat-hop' })], [], { alleenDefinitief: true })
    expect(reeksen.map((r) => r.catalogItemId)).toEqual(['cat-hop'])
  })

  it('kiest maten per soort test', () => {
    const reeksen = bouwTestVerloop(
      [
        regel({}),
        regel({ catalogItemId: 'cat-cmj', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', plotUnit: 'cm', leftPrimary: null, rightPrimary: null, singleValue: 31 }),
        regel({ catalogItemId: 'cat-hq', metric: 'RIGHT', unitPrimary: null, plotUnit: '', leftPrimary: 0.58, rightPrimary: 0.62 }),
      ],
      [],
    )
    const per = Object.fromEntries(reeksen.map((r) => [r.catalogItemId, r]))
    expect(per['cat-quad']).toMatchObject({ maten: ['lsi', 'zijden'], standaardMaat: 'lsi' })
    expect(per['cat-cmj']).toMatchObject({ maten: ['waarde'], standaardMaat: 'waarde' })
    expect(per['cat-hq']).toMatchObject({ maten: ['zijden'], standaardMaat: 'zijden' })
    expect(per['cat-hq'].laatste.rechts).toBe(0.62)
  })

  it('hangt criteria aan de test en kiest het eerste niet-gehaalde als standaard', () => {
    const [r] = bouwTestVerloop(
      [regel({})],
      [
        criterium({ id: 'c3', phaseOrder: 3, lsiMinGreen: 95 }),
        criterium({ id: 'c2', phaseOrder: 2, status: 'MET' }),
        criterium({ id: 'hop', catalogItemId: 'cat-hop' }),
      ],
    )
    expect(r.criteria.map((c) => c.id)).toEqual(['c2', 'c3'])
    expect(r.standaardCriteriumId).toBe('c3')
  })

  it('kiest het laatste criterium als alles gehaald is', () => {
    const [r] = bouwTestVerloop(
      [regel({})],
      [criterium({ id: 'c2', phaseOrder: 2, status: 'MET' }), criterium({ id: 'c3', phaseOrder: 3, status: 'MET' })],
    )
    expect(r.standaardCriteriumId).toBe('c3')
  })
})

describe('beste uitslag per dag voor de grafiek', () => {
  it('neemt per dag de hoogste geplotte waarde en houdt de lijst compleet', () => {
    const [r] = bouwTestVerloop(
      [
        regel({ catalogItemId: 'cat-cmj', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', plotUnit: 'cm', leftPrimary: null, rightPrimary: null, singleValue: 28, datum: '2026-06-01T08:00:00.000Z' }),
        regel({ catalogItemId: 'cat-cmj', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', plotUnit: 'cm', leftPrimary: null, rightPrimary: null, singleValue: 31, datum: '2026-06-01T08:05:00.000Z' }),
        regel({ catalogItemId: 'cat-cmj', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', plotUnit: 'cm', leftPrimary: null, rightPrimary: null, singleValue: 30, datum: '2026-07-01T08:00:00.000Z' }),
      ],
      [],
    )
    expect(r.punten).toHaveLength(3)
    expect(r.perDag.map((p) => p.waarde)).toEqual([31, 30])
  })

  it('neemt als laatste uitslag de beste poging van de laatste testdag', () => {
    const [r] = bouwTestVerloop(
      [
        regel({ catalogItemId: 'cat-cmj', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', plotUnit: 'cm', leftPrimary: null, rightPrimary: null, singleValue: 35, datum: '2026-07-01T08:00:00.000Z' }),
        regel({ catalogItemId: 'cat-cmj', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'cm', plotUnit: 'cm', leftPrimary: null, rightPrimary: null, singleValue: 30, datum: '2026-07-01T08:10:00.000Z' }),
      ],
      [],
    )
    expect(r.laatste.waarde).toBe(35)
  })

  it('neemt de laagste waarde als lager beter is', () => {
    const [r] = bouwTestVerloop(
      [
        regel({ catalogItemId: 'cat-tijd', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'sec', plotUnit: 'sec', higherIsBetter: false, leftPrimary: null, rightPrimary: null, singleValue: 12, datum: '2026-06-01T08:00:00.000Z' }),
        regel({ catalogItemId: 'cat-tijd', kind: 'SINGLE', metric: 'VALUE', unitPrimary: 'sec', plotUnit: 'sec', higherIsBetter: false, leftPrimary: null, rightPrimary: null, singleValue: 10, datum: '2026-06-01T09:00:00.000Z' }),
      ],
      [],
    )
    expect(r.perDag.map((p) => p.waarde)).toEqual([10])
  })
})

describe('doelLijn', () => {
  const [quad] = bouwTestVerloop([regel({})], [])

  it('gebruikt de LSI-drempel van het criterium op de LSI-maat', () => {
    expect(doelLijn(quad, 'lsi', criterium({ lsiMinGreen: 95 }))).toBe(95)
  })

  it('gebruikt de Newton-drempel van het criterium op links/rechts', () => {
    expect(doelLijn(quad, 'zijden', criterium({ newtonMinGreen: 450 }))).toBe(450)
  })

  it('valt terug op de groene zonegrens van de catalogustest', () => {
    expect(doelLijn(quad, 'lsi', null)).toBe(90)
    expect(doelLijn(quad, 'zijden', null)).toBeNull()
  })

  it('tekent geen doellijn voor een regel zonder catalogustest', () => {
    const [los] = bouwTestVerloop([regel({ catalogItemId: null, unitPrimary: 'kg' })], [])
    expect(doelLijn(los, 'lsi', null)).toBeNull()
  })
})

describe('weergave', () => {
  it('zet getal en eenheid neer zoals in het rapport', () => {
    expect(metEenheid(31, 'cm')).toBe('31 cm')
    expect(metEenheid(91, '%')).toBe('91%')
    expect(metEenheid(0.62, '')).toBe('0,62')
    expect(metEenheid(null, 'kg')).toBe('–')
  })

  it('vat een bilaterale test samen met LSI en zijden', () => {
    const [r] = bouwTestVerloop([regel({ leftPrimary: 403, rightPrimary: 444 })], [])
    expect(hoofdUitslag(r, r.laatste)).toBe('91%')
    expect(zijdenTekst(r, r.laatste)).toBe('L 403 · R 444 N')
  })

  it('valt terug op de tekstuitslag', () => {
    const [r] = bouwTestVerloop([regel({ kind: 'SINGLE', metric: 'VALUE', leftPrimary: null, rightPrimary: null, textValue: 'negatief' })], [])
    expect(hoofdUitslag(r, r.laatste)).toBe('negatief')
    expect(zijdenTekst(r, r.laatste)).toBeNull()
  })
})
