import { describe, it, expect } from 'vitest'
import { parseActivityResults, parseStrength, parseJump } from '@/lib/kinvent/parse'
import { checkUnit, kgToNewton, lsi, type UnitCheck } from '@/lib/kinvent/units'

/**
 * De vormen hieronder komen uit echte metingen van de praktijk (waarden
 * afgerond, geen patiëntgegevens). Ze staan er juist in omdat Kinvent geen
 * schema publiceert: dit bestand is onze vastlegging van hoe die payloads
 * eruitzien, en het faalt zodra Kinvent er iets aan verandert.
 */

const meterEndurance = JSON.stringify({
  includeAllFields: false,
  _resultsPerRep: [
    { _repOrdinal: 1, _repSide: 'LEFT', _maxValue: 17.95, _netMaxForce: 17.95, _device: 'MUSCLE_CONTROLLER' },
    { _repOrdinal: 2, _repSide: 'LEFT', _maxValue: 20.75, _netMaxForce: 20.75, _device: 'MUSCLE_CONTROLLER' },
    { _repOrdinal: 1, _repSide: 'RIGHT', _maxValue: 22.4, _netMaxForce: 22.4, _device: 'MUSCLE_CONTROLLER' },
  ],
})

const totalEvaluation = JSON.stringify({
  includeAllFields: false,
  _resultsPerRep: [
    { _repOrdinal: 1, _repSide: 'BOTH', _maxValue: 135.7, _maxLeftValue: 23.69 },
    { _repOrdinal: 2, _repSide: 'BOTH', _maxValue: 138.09, _maxLeftValue: 26.29 },
  ],
})

const jump = JSON.stringify({
  includeAllFields: false,
  weight: 65.6,
  jumpType: 'CMJ',
  _numberOfJumps: 3,
  _peakJumpHeight: 23.74,
  _heightAverage: 22.7,
  _rsi: 0.41,
  _repResults: [
    { ordinal: 1, bodySide: 'BOTH', jumpHeight: 23.74, peakForceTotal: 251.8, peakForceLeft: 139.87, peakForceRight: 111.93 },
    { ordinal: 2, bodySide: 'BOTH', jumpHeight: 21.73, peakForceTotal: 232.74, peakForceLeft: 132.49, peakForceRight: 100.25 },
    // Afgebroken sprong: staat gewoon in de data, alles nul.
    { ordinal: 3, bodySide: 'BOTH', jumpHeight: 0, peakForceTotal: 0, peakForceLeft: 0, peakForceRight: 0 },
  ],
})

describe('parseActivityResults', () => {
  it('geeft null bij lege of kapotte JSON in plaats van te gooien', () => {
    expect(parseActivityResults(null)).toBeNull()
    expect(parseActivityResults('')).toBeNull()
    expect(parseActivityResults('{niet eens json')).toBeNull()
  })
})

describe('parseStrength', () => {
  it('neemt per zijde de hoogste poging', () => {
    const r = parseStrength('METER_ENDURANCE', parseActivityResults(meterEndurance))
    expect(r).not.toBeNull()
    expect(r!.left).toBeCloseTo(20.75)
    expect(r!.right).toBeCloseTo(22.4)
    expect(r!.deviceType).toBe('MUSCLE_CONTROLLER')
    expect(r!.repCount).toBe(3)
  })

  it('splitst TOTAL_EVALUATION niet in links en rechts', () => {
    // `_repSide` is hier BOTH met een losse `_maxLeftValue`. Daaruit is de
    // rechterzijde niet betrouwbaar af te leiden, dus komt het als enkele
    // waarde terug in plaats van als verzonnen paar.
    const r = parseStrength('TOTAL_EVALUATION', parseActivityResults(totalEvaluation))
    expect(r!.left).toBeNull()
    expect(r!.right).toBeNull()
    expect(r!.single).toBeCloseTo(138.09)
  })

  it('geeft null als er geen bruikbare poging in zit', () => {
    const leeg = JSON.stringify({ _resultsPerRep: [{ _repOrdinal: 1, _repSide: 'LEFT', _maxValue: 0 }] })
    expect(parseStrength('METER', parseActivityResults(leeg))).toBeNull()
  })
})

describe('parseJump', () => {
  it('laat afgebroken sprongen buiten de reeks', () => {
    const r = parseJump(parseActivityResults(jump))
    expect(r!.reps).toHaveLength(2)
    expect(r!.reps.map((x) => x.ordinal)).toEqual([1, 2])
  })

  it('leest de samenvatting en het lichaamsgewicht', () => {
    const r = parseJump(parseActivityResults(jump))
    expect(r!.jumpType).toBe('CMJ')
    expect(r!.bodyWeightKg).toBeCloseTo(65.6)
    expect(r!.peakJumpHeight).toBeCloseTo(23.74)
  })
})

/** `reason` bestaat alleen op de niet-ok varianten. */
const reasonOf = (r: UnitCheck) => ('reason' in r ? r.reason : '')

describe('checkUnit', () => {
  it('accepteert een plausibel gewicht zonder vorige meting', () => {
    expect(checkUnit(65.6)).toEqual({ status: 'ok', unit: 'kg' })
  })

  it('accepteert normale schommeling tussen twee metingen', () => {
    expect(checkUnit(67.2, 65.6).status).toBe('ok')
  })

  it('herkent Newton aan een onmogelijk gewicht', () => {
    const r = checkUnit(643)
    expect(r.status).toBe('suspect')
    expect(reasonOf(r)).toContain('Newton')
  })

  it('herkent de omschakeling naar ponden aan de sprong', () => {
    // 66 kg wordt 145 lb: plausibel op zichzelf, onmogelijk als verandering.
    const r = checkUnit(145, 66)
    expect(r.status).toBe('suspect')
    expect(reasonOf(r)).toContain('ponden')
  })

  it('herkent ook de omschakeling terug', () => {
    expect(reasonOf(checkUnit(66, 145))).toContain('ponden')
  })

  it('is voorzichtig als de meting geen gewicht draagt', () => {
    expect(checkUnit(null).status).toBe('unverified')
  })
})

describe('rekenhulpjes', () => {
  it('rekent kilogramkracht om naar Newton', () => {
    expect(kgToNewton(10)).toBeCloseTo(98.0665)
  })

  it('berekent LSI als zwakste gedeeld door sterkste', () => {
    expect(lsi(80, 100)).toBeCloseTo(80)
    expect(lsi(100, 80)).toBeCloseTo(80)
    expect(lsi(null, 100)).toBeNull()
  })
})
