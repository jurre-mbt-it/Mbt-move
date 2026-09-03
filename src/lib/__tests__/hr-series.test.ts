import { describe, expect, it } from 'vitest'
import { bpmHistogramFromSeries, computeExertionDay, HR_BIN_BPM } from '../exertion'

/** 1-minuut-buckets, zoals de HealthKit-brug ze aanlevert. */
const minutes = (hrs: (number | null)[]) =>
  hrs.map((hr, i) => ({ t: i * 60, hr, spd: null }))

describe('bpmHistogramFromSeries', () => {
  it('geeft null zonder bruikbare reeks', () => {
    expect(bpmHistogramFromSeries(null)).toBeNull()
    expect(bpmHistogramFromSeries([])).toBeNull()
    expect(bpmHistogramFromSeries(minutes([120]))).toBeNull()
    expect(bpmHistogramFromSeries(minutes([null, null]))).toBeNull()
  })

  it('bucket op HR_BIN_BPM en telt seconden per bin', () => {
    // 4 minuten op 122 bpm → bin 120, 4×60 s.
    const hist = bpmHistogramFromSeries(minutes([122, 122, 122, 122]))
    expect(hist).toEqual({ '120': 240 })
    expect(HR_BIN_BPM).toBe(5)
  })

  it('verdeelt over meerdere bins', () => {
    const hist = bpmHistogramFromSeries(minutes([100, 100, 160, 160]))
    expect(hist).toEqual({ '100': 120, '160': 120 })
  })

  it('slaat metingen zonder hartslag over zonder de tijd te verschuiven', () => {
    // Minuut 2 mist een meting; die tijd hoort bij niemand.
    const hist = bpmHistogramFromSeries(minutes([120, null, 120]))
    expect(hist).toEqual({ '120': 120 })
  })

  it('rekent een pauze niet als meettijd', () => {
    // Vier minuten meten, dan een gat van een uur, dan nog een meting. Zonder
    // begrenzing zou die ene meting een vol uur in de zwaarste zone opleveren.
    const series = [
      { t: 0, hr: 120, spd: null },
      { t: 60, hr: 120, spd: null },
      { t: 120, hr: 120, spd: null },
      { t: 3720, hr: 190, spd: null },
    ]
    const hist = bpmHistogramFromSeries(series)!
    expect(hist['190']).toBe(60)
    expect(Object.values(hist).reduce((a, b) => a + b, 0)).toBe(240)
  })

  it('sluit aan op computeExertionDay: dezelfde zone-regels als de dagbelasting', () => {
    const profile = { maxHeartRate: 200, restingHeartRate: 50, dateOfBirth: null }
    // 30 minuten op 150 bpm = 75% HRmax = zone 3 → 30 × 3 = 90 AU.
    const hist = bpmHistogramFromSeries(minutes(Array(30).fill(150)))!
    const day = computeExertionDay(hist, profile)!
    expect(day.trimp).toBe(90)
    expect(day.activeSec).toBe(1800)
  })
})
