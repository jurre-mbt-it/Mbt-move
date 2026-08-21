import { describe, it, expect } from 'vitest'
import { bepaalCriteriumStatus, type CriteriumDrempels } from '../rehab-criterion-status'
import type { TestSpec } from '../test-report/compute'

const lsiSpec: TestSpec = {
  kind: 'BILATERAL', metric: 'LSI', plotUnit: '%',
  axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90, higherIsBetter: true,
}
const valueSpec: TestSpec = {
  kind: 'SINGLE', metric: 'VALUE', plotUnit: 'cm',
  axisMin: 0, axisMax: 15, zoneOrangeMin: 8, zoneGreenMin: 10, higherIsBetter: true,
}
const geenDrempels: CriteriumDrempels = {
  isBilateral: false, newtonMinGreen: null, newtonMinOrange: null,
  lsiMinGreen: null, lsiMinOrange: null,
}
const bilateraal: CriteriumDrempels = {
  isBilateral: true, newtonMinGreen: 400, newtonMinOrange: 350,
  lsiMinGreen: 90, lsiMinOrange: 80,
}

describe('bepaalCriteriumStatus', () => {
  it('geeft null zonder bruikbare waarden', () => {
    expect(bepaalCriteriumStatus(geenDrempels, lsiSpec, {})).toBeNull()
    expect(bepaalCriteriumStatus(geenDrempels, lsiSpec, { leftPrimary: 400 })).toBeNull()
  })

  it('bilaterale drempels: MET als beide zijden en LSI groen halen', () => {
    const r = bepaalCriteriumStatus(bilateraal, lsiSpec, { leftPrimary: 420, rightPrimary: 450 })
    expect(r?.status).toBe('MET') // LSI 93,3 >= 90, beide >= 400
    expect(r?.samenvatting).toContain('LSI')
  })

  it('bilaterale drempels: IN_PROGRESS als alleen oranje gehaald wordt', () => {
    const r = bepaalCriteriumStatus(bilateraal, lsiSpec, { leftPrimary: 360, rightPrimary: 440 })
    expect(r?.status).toBe('IN_PROGRESS') // links onder 400, boven 350; LSI 81,8 >= 80
  })

  it('bilaterale drempels: NOT_MET onder oranje', () => {
    const r = bepaalCriteriumStatus(bilateraal, lsiSpec, { leftPrimary: 300, rightPrimary: 450 })
    expect(r?.status).toBe('NOT_MET')
  })

  it('alleen LSI-drempels (geen newton): oordeelt op LSI alleen', () => {
    const alleenLsi: CriteriumDrempels = { ...geenDrempels, lsiMinGreen: 90, lsiMinOrange: 80 }
    const r = bepaalCriteriumStatus(alleenLsi, lsiSpec, { leftPrimary: 85, rightPrimary: 100 })
    expect(r?.status).toBe('IN_PROGRESS') // LSI 85
  })

  it('zonder eigen drempels: valt terug op de catalogus-zone', () => {
    const groen = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 12 })
    expect(groen?.status).toBe('MET')
    const oranje = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 9 })
    expect(oranje?.status).toBe('IN_PROGRESS')
    const rood = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 3 })
    expect(rood?.status).toBe('NOT_MET')
  })

  it('zoneOverride van de therapeut wint van de berekening', () => {
    const r = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 3, zoneOverride: 'GREEN' })
    expect(r?.status).toBe('MET')
  })

  it('samenvatting is leesbaar Nederlands met eenheid', () => {
    const r = bepaalCriteriumStatus(geenDrempels, valueSpec, { singleValue: 12 })
    expect(r?.samenvatting).toBe('12 cm')
  })
})
