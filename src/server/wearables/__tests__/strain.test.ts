import { describe, expect, it } from 'vitest'
import { estimateTrimpFromSrpe } from '../strain'

describe('estimateTrimpFromSrpe', () => {
  it('volgt de RPE-zone-tabel van de app: minuten × (RPE / 2)', () => {
    // HR_ZONES koppelt zone 3 aan "RPE 5-6", zone 4 aan "RPE 7-8". Een uur op
    // RPE 6 is dus een uur in zone 3 = 60 × 3 = 180 AU.
    expect(estimateTrimpFromSrpe(3600, 6)).toBe(180)
    expect(estimateTrimpFromSrpe(3600, 8)).toBe(240)
    expect(estimateTrimpFromSrpe(1800, 4)).toBe(60)
  })

  it('geeft null zonder RPE of zonder duur', () => {
    expect(estimateTrimpFromSrpe(3600, null)).toBeNull()
    expect(estimateTrimpFromSrpe(null, 6)).toBeNull()
    expect(estimateTrimpFromSrpe(0, 6)).toBeNull()
    expect(estimateTrimpFromSrpe(3600, 0)).toBeNull()
  })

  it('kapt een doorgelopen timer af', () => {
    // Zelfde begrenzing als de belastingscurve: een sessie die uren open bleef
    // staan mag geen duizenden AU opleveren.
    const negenUur = estimateTrimpFromSrpe(9 * 3600, 6)!
    const vierUur = estimateTrimpFromSrpe(4 * 3600, 6)!
    expect(negenUur).toBe(vierUur)
  })
})
