import { describe, expect, it } from 'vitest'

import { formatPlotted, roundTestValue, type TestSpec } from '@/lib/test-report/compute'
import { bepaalCriteriumStatus } from '@/lib/rehab-criterion-status'

const spec = (over: Partial<TestSpec>): TestSpec => ({
  kind: 'SINGLE', metric: 'VALUE', plotUnit: 'cm', axisMin: 0, axisMax: 50,
  zoneOrangeMin: 20, zoneGreenMin: 30, higherIsBetter: true, ...over,
})

describe('roundTestValue', () => {
  it('rondt kracht, sprongen, graden en seconden af op hele getallen', () => {
    expect(roundTestValue(444.39300000000003, 'kg')).toBe(444)
    expect(roundTestValue(4357.8, 'N')).toBe(4358)
    expect(roundTestValue(31.1487120000001, 'cm')).toBe(31)
    expect(roundTestValue(12.5, 'sec')).toBe(13)
    expect(roundTestValue(138.4, '°')).toBe(138)
  })

  it('houdt twee decimalen voor verhoudingen zonder eenheid en waarden per kilo', () => {
    expect(roundTestValue(0.6234, null)).toBe(0.62)
    expect(roundTestValue(0.6234, '')).toBe(0.62)
    expect(roundTestValue(3.1249, 'Nm/kg')).toBe(3.12)
  })

  it('laat een lege waarde leeg', () => {
    expect(roundTestValue(null, 'kg')).toBeNull()
    expect(roundTestValue(undefined, 'kg')).toBeNull()
  })
})

describe('afgeronde weergave in rapport en criteria', () => {
  it('toont een sprong als hele centimeters', () => {
    expect(formatPlotted(spec({}), 31.1487120000001)).toBe('31 cm')
  })

  it('toont een H:Q-ratio met twee decimalen', () => {
    expect(formatPlotted(spec({ kind: 'BILATERAL', metric: 'RIGHT', plotUnit: '' }), 0.6234)).toBe('0,62')
  })

  it('zet hele getallen in de criteriumsamenvatting', () => {
    const lsiSpec = spec({ kind: 'BILATERAL', metric: 'LSI', plotUnit: '%', axisMin: 60, axisMax: 100, zoneOrangeMin: 80, zoneGreenMin: 90 })
    const drempels = { isBilateral: false, newtonMinGreen: null, newtonMinOrange: null, lsiMinGreen: 90, lsiMinOrange: 80 }
    const r = bepaalCriteriumStatus(drempels, lsiSpec, { leftPrimary: 444.39300000000003, rightPrimary: 402.943001392705 }, 'kg')
    expect(r?.samenvatting).toBe('L 444 · R 403 · LSI 91%')
  })
})
