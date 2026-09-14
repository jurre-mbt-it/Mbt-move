import { describe, it, expect } from 'vitest'
import { asymmetryPct, formatAsymmetry, metingOpties, trendSeries, type JumpMeting, type KrachtMeting } from '@/lib/kinvent/measurements'

/**
 * De rekenlaag onder de metingenpagina: links-rechtsverschil als percentage
 * met richting, en de reeksen voor de grafiek over de tijd. Puur, zonder
 * database, op de vorm die de router teruggeeft.
 */
const T = (d: string) => new Date(`${d}T10:00:00Z`)

function sprong(id: string, datum: string, over: Partial<JumpMeting> = {}, reps: JumpMeting['reps'] = []): JumpMeting {
  return { id, performedAt: T(datum), jumpType: 'CMJ', variant: 'SINGLE', peakJumpHeightCm: null, rsi: null, bodyWeightKg: 78, reps, ...over }
}
const rep = (over: Partial<JumpMeting['reps'][number]>): JumpMeting['reps'][number] => ({
  ordinal: 1, side: 'BOTH', jumpHeightCm: null, flightTimeMs: null, contactTimeMs: null, peakForceN: null, peakForceLeftN: null, peakForceRightN: null,
  netMaxForceN: null, maxPowerW: null, rsi: null, timeToStabilizeMs: null, propulsiveImpulsePhase1: null, propulsiveImpulsePhase2: null,
  rfdTotal: null, rfdLeft: null, rfdRight: null, ...over,
})
function kracht(id: string, datum: string, title: string, left: number | null, right: number | null, single: number | null = null): KrachtMeting {
  return { id, performedAt: T(datum), title, exerciseType: 'METER', deviceType: 'LINK', leftMaxKg: left, rightMaxKg: right, singleMaxKg: single, reps: [] }
}

describe('asymmetryPct', () => {
  it('is positief als rechts hoger is en negatief als rechts lager is', () => {
    expect(asymmetryPct(100, 108)).toBeCloseTo(7.4, 1)
    expect(asymmetryPct(100, 92)).toBeCloseTo(-8, 1)
    expect(asymmetryPct(null, 92)).toBeNull()
    expect(asymmetryPct(0, 0)).toBeNull()
  })
})

describe('formatAsymmetry', () => {
  it('zegt welke kant lager is', () => {
    expect(formatAsymmetry(-8)).toBe('rechts 8% lager')
    expect(formatAsymmetry(5.4)).toBe('links 5% lager')
    expect(formatAsymmetry(0.3)).toBe('gelijk')
    expect(formatAsymmetry(null)).toBe('–')
  })
})

describe('metingOpties', () => {
  it('biedt alleen aan wat er gemeten is, sprongen eerst', () => {
    const jumps = [
      sprong('a', '2025-06-10', { jumpType: 'CMJ' }, [rep({ side: 'BOTH', jumpHeightCm: 30 })]),
      sprong('b', '2025-06-10', { jumpType: 'CMJ' }, [rep({ side: 'LEFT', jumpHeightCm: 14 })]),
      sprong('c', '2024-10-02', { jumpType: 'DROP' }, [rep({ side: 'BOTH', jumpHeightCm: 28 })]),
    ]
    const strength = [kracht('k', '2025-06-10', 'exercise_template_builtin_leg_knee_extension_60_text', 40, 38)]
    const opties = metingOpties(jumps, strength)
    expect(opties.map((o) => o.label)).toEqual(['CMJ bilateral', 'CMJ unilateral', 'Drop jump bilateral', 'Knee extension 60°'])
  })
})

describe('trendSeries', () => {
  const jumps = [
    sprong('a', '2025-06-10', { peakJumpHeightCm: 31.1, rsi: 1.13 }, [rep({ jumpHeightCm: 30.3, peakForceLeftN: 992, peakForceRightN: 935, rsi: 1.18 }), rep({ ordinal: 2, jumpHeightCm: 31.1, peakForceLeftN: 993, peakForceRightN: 943, rsi: 1.13 })]),
    sprong('b', '2024-10-02', { peakJumpHeightCm: 37.1, rsi: 1.28 }, [rep({ jumpHeightCm: 37.1, peakForceLeftN: 1051, peakForceRightN: 1056, rsi: 1.28 })]),
    sprong('u', '2025-06-10', {}, [rep({ side: 'LEFT', jumpHeightCm: 13.8, peakForceN: 1665, rsi: 0.78 }), rep({ ordinal: 2, side: 'LEFT', jumpHeightCm: 18.3, peakForceN: 1522, rsi: 0.8 })]),
    sprong('v', '2025-06-10', {}, [rep({ side: 'RIGHT', jumpHeightCm: 16.6, peakForceN: 1657, rsi: 0.56 })]),
  ]
  const strength = [
    kracht('k1', '2025-06-10', 'exercise_template_builtin_leg_knee_extension_60_text', 40, 38),
    kracht('k2', '2024-03-06', 'exercise_template_builtin_leg_knee_extension_60_text', 35, 30),
  ]

  it('zet de tweebenige CMJ-hoogte in tijdsvolgorde, oud naar nieuw', () => {
    const r = trendSeries({ soort: 'sprong', jumpType: 'CMJ', eenbenig: false }, 'hoogte', jumps, strength)
    expect(r.unit).toBe('cm')
    expect(r.series).toHaveLength(1)
    expect(r.series[0].points.map((p) => p.v)).toEqual([37.1, 31.1])
    expect(r.series[0].points[0].t).toBeLessThan(r.series[0].points[1].t)
  })

  it('geeft piekkracht als twee reeksen, links en rechts, van de beste sprong', () => {
    const r = trendSeries({ soort: 'sprong', jumpType: 'CMJ', eenbenig: false }, 'piek', jumps, strength)
    expect(r.unit).toBe('N')
    expect(r.series.map((s) => s.label)).toEqual(['Links', 'Rechts'])
    expect(r.series[0].points.map((p) => p.v)).toEqual([1051, 993])
    expect(r.series[1].points.map((p) => p.v)).toEqual([1056, 943])
  })

  it('berekent het verschil in procent per meting', () => {
    const r = trendSeries({ soort: 'sprong', jumpType: 'CMJ', eenbenig: false }, 'verschil', jumps, strength)
    expect(r.unit).toBe('%')
    expect(r.series[0].points.map((p) => Math.round(p.v * 10) / 10)).toEqual([0.5, -5])
  })

  it('zet eenbenige sprongen per been naast elkaar', () => {
    const r = trendSeries({ soort: 'sprong', jumpType: 'CMJ', eenbenig: true }, 'hoogte', jumps, strength)
    expect(r.series.map((s) => s.label)).toEqual(['Links', 'Rechts'])
    expect(r.series[0].points.map((p) => p.v)).toEqual([18.3])
    expect(r.series[1].points.map((p) => p.v)).toEqual([16.6])
  })

  it('geeft RSI van de tweebenige sprong', () => {
    const r = trendSeries({ soort: 'sprong', jumpType: 'CMJ', eenbenig: false }, 'rsi', jumps, strength)
    expect(r.series[0].points.map((p) => p.v)).toEqual([1.28, 1.13])
  })

  it('zet een krachttest op titel uit, in kg, met verschil', () => {
    const piek = trendSeries({ soort: 'kracht', title: 'exercise_template_builtin_leg_knee_extension_60_text' }, 'piek', jumps, strength)
    expect(piek.unit).toBe('kg')
    expect(piek.series[0].points.map((p) => p.v)).toEqual([35, 40])
    expect(piek.series[1].points.map((p) => p.v)).toEqual([30, 38])
    const verschil = trendSeries({ soort: 'kracht', title: 'exercise_template_builtin_leg_knee_extension_60_text' }, 'verschil', jumps, strength)
    expect(verschil.series[0].points.map((p) => Math.round(p.v))).toEqual([-14, -5])
    expect(trendSeries({ soort: 'kracht', title: 'exercise_template_builtin_leg_knee_extension_60_text' }, 'hoogte', jumps, strength).series).toEqual([])
  })
})
