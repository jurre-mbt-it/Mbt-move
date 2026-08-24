import { describe, expect, it } from 'vitest'

import { computeReadiness, type SleepDay, type VitalsDay } from '../readiness'

/**
 * Vangnet rond de readiness-baseline. Deze module was tot 2026-08-01 onbeproefd
 * terwijl hij puur en dependency-vrij is, en de Oura-integratie raakt precies
 * de baseline-opbouw. Een off-by-one in een slice-venster verschuift ieders
 * score zonder te gooien, dus die vensters staan hier vast.
 */

function day(offset: number): string {
  // Vaste ankerdatum: de tests mogen niet van de wandklok afhangen.
  const d = new Date(Date.UTC(2026, 0, 1))
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

type NightOpts = {
  hrv: number
  hrvType: 'SDNN' | 'RMSSD' | null
  rhr?: number
  resp?: number
  temp?: number
}

/** `count` opeenvolgende nachten, eindigend op dagindex `endOffset`. */
function nights(count: number, endOffset: number, o: NightOpts): VitalsDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: day(endOffset - (count - 1 - i)),
    hrv: o.hrv,
    hrvType: o.hrvType,
    restingHeartRate: o.rhr ?? 55,
    respiratoryRate: o.resp ?? 14,
    wristTempDeviation: o.temp ?? 0,
  }))
}

function sleepFor(vitals: VitalsDay[], score = 70): SleepDay[] {
  return vitals.map(v => ({ date: v.date, qualityScore: score }))
}

const contributor = (r: ReturnType<typeof computeReadiness>, key: string) =>
  r.contributors.find(c => c.key === key)!

describe('computeReadiness · LEARNING-grens', () => {
  it('blijft LEARNING bij 6 voorgaande nachten', () => {
    const v = nights(7, 6, { hrv: 45, hrvType: 'SDNN' }) // 6 prior + vandaag
    const r = computeReadiness(v, sleepFor(v), null, day(6))
    expect(r.baselineNights).toBe(6)
    expect(r.band).toBe('LEARNING')
    expect(r.score).toBeNull()
  })

  it('scoort vanaf 7 voorgaande nachten', () => {
    const v = nights(8, 7, { hrv: 45, hrvType: 'SDNN' }) // 7 prior + vandaag
    const r = computeReadiness(v, sleepFor(v), null, day(7))
    expect(r.baselineNights).toBe(7)
    expect(r.band).not.toBe('LEARNING')
    expect(r.score).toBeGreaterThan(0)
  })
})

describe('computeReadiness · hrvType-segmentatie', () => {
  it('negeert de HRV-bijdrage als de nieuwe metriek nog te weinig nachten heeft', () => {
    // 30 nachten Apple (SDNN ~45 ms), daarna één Oura-nacht (RMSSD ~90 ms).
    // Ongesegmenteerd zou die 90 een enorme positieve afwijking van de
    // SDNN-baseline zijn en de zwaarste bijdrage (0.35) omhoog rammen.
    const sdnn = nights(30, 29, { hrv: 45, hrvType: 'SDNN' })
    const rmssd = nights(1, 30, { hrv: 90, hrvType: 'RMSSD' })
    const v = [...sdnn, ...rmssd]
    const r = computeReadiness(v, sleepFor(v), null, day(30))

    const hrv = contributor(r, 'hrv')
    expect(hrv.status).toBe('na')
    expect(hrv.points).toBeNull()
    expect(hrv.baseline).toBeNull() // geen vergelijking met een vreemde metriek
    // De score leeft door op de overige bijdragen in plaats van uit te vallen.
    expect(r.band).not.toBe('LEARNING')
    expect(r.score).not.toBeNull()
  })

  it('scoort HRV weer zodra de nieuwe metriek zelf 7 nachten heeft', () => {
    const sdnn = nights(30, 22, { hrv: 45, hrvType: 'SDNN' })
    const rmssd = nights(8, 30, { hrv: 90, hrvType: 'RMSSD' })
    const v = [...sdnn, ...rmssd]
    const r = computeReadiness(v, sleepFor(v), null, day(30))

    const hrv = contributor(r, 'hrv')
    expect(hrv.points).not.toBeNull()
    expect(hrv.baseline).toBe(90) // baseline uit de RMSSD-nachten, niet uit SDNN
  })

  it('laat een reeks van één metriek ongemoeid', () => {
    const v = nights(30, 29, { hrv: 45, hrvType: 'SDNN' })
    const r = computeReadiness(v, sleepFor(v), null, day(29))
    const hrv = contributor(r, 'hrv')
    expect(hrv.points).not.toBeNull()
    expect(hrv.baseline).toBe(45)
  })

  it('valt terug op de volledige historie als het type onbekend is', () => {
    // Legacy-rijen zonder hrvType mogen niet ineens hun baseline kwijtraken.
    const v = nights(30, 29, { hrv: 45, hrvType: null })
    const r = computeReadiness(v, sleepFor(v), null, day(29))
    expect(contributor(r, 'hrv').points).not.toBeNull()
  })
})

describe('computeReadiness · wellness-override', () => {
  it('kan de score alleen omlaag trekken, nooit omhoog', () => {
    const v = nights(30, 29, { hrv: 45, hrvType: 'SDNN' })
    const s = sleepFor(v, 90)
    const zonder = computeReadiness(v, s, null, day(29))
    const best = computeReadiness(v, s, { sleep: 5, soreness: 5, fatigue: 5, mood: 5, stress: 5 }, day(29))
    const slecht = computeReadiness(v, s, { sleep: 1, soreness: 1, fatigue: 1, mood: 1, stress: 1 }, day(29))

    expect(best.score).toBe(zonder.score)
    expect(slecht.score!).toBeLessThan(zonder.score!)
  })
})

describe('computeReadiness · ziektevlag', () => {
  it('forceert RED bij ademhaling +3/min én temperatuurafwijking 0.8', () => {
    const basis = nights(30, 29, { hrv: 45, hrvType: 'SDNN', resp: 14 })
    const vandaag = nights(1, 30, { hrv: 45, hrvType: 'SDNN', resp: 17.5, temp: 0.9 })
    const v = [...basis, ...vandaag]
    const r = computeReadiness(v, sleepFor(v, 90), null, day(30))
    expect(r.illnessFlag).toBe(true)
    expect(r.band).toBe('RED')
  })

  it('vlagt niet als alleen de ademhaling verhoogd is', () => {
    const basis = nights(30, 29, { hrv: 45, hrvType: 'SDNN', resp: 14 })
    const vandaag = nights(1, 30, { hrv: 45, hrvType: 'SDNN', resp: 17.5, temp: 0 })
    const v = [...basis, ...vandaag]
    const r = computeReadiness(v, sleepFor(v, 90), null, day(30))
    expect(r.illnessFlag).toBe(false)
  })
})
