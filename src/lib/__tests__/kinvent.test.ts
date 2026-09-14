import { describe, it, expect } from 'vitest'
import { parseActivityResults, parseStrength, parseJump, parseBodyWeight } from '@/lib/kinvent/parse'
import { checkUnit, kgToNewton, lsi, rond, type UnitCheck } from '@/lib/kinvent/units'

/**
 * De vormen hieronder volgen Kinvents "Analysis response reference" (september
 * 2026), met waarden uit hun gedeïdentificeerde voorbeelden en uit eigen
 * praktijkmetingen (afgerond, geen patiëntgegevens). Dit bestand is onze
 * vastlegging van hoe die payloads eruitzien en faalt zodra Kinvent er iets
 * aan verandert.
 */

const meterEndurance = JSON.stringify({
  includeAllFields: false,
  _resultsPerRep: [
    { _repCode: 'r1', _repOrdinal: 1, _repSide: 'LEFT', _maxValue: 17.95, _averageValue: 12.1, _rfdToMax: 50.3, _averageRfd: 31.2, _timeToMax: 1092, _impulse: 88.4, _netMaxForce: 17.95, _device: 'MUSCLE_CONTROLLER' },
    { _repCode: 'r2', _repOrdinal: 2, _repSide: 'LEFT', _maxValue: 20.75, _averageValue: 14.0, _rfdToMax: 61.0, _averageRfd: 35.5, _timeToMax: 980, _impulse: 95.1, _netMaxForce: 20.75, _device: 'MUSCLE_CONTROLLER' },
    { _repCode: 'r3', _repOrdinal: 1, _repSide: 'RIGHT', _maxValue: 22.4, _averageValue: 15.2, _rfdToMax: 70.2, _averageRfd: 40.1, _timeToMax: 900, _impulse: 101.0, _netMaxForce: 22.4, _device: 'MUSCLE_CONTROLLER' },
  ],
})

// IMTP: beide platen samen in `_maxValue`, links apart, rechts NIET
// geserialiseerd. Kinvent documenteert: rechts = _maxValue − _maxLeftValue.
const totalEvaluation = JSON.stringify({
  includeAllFields: false,
  _resultsPerRep: [
    { _repOrdinal: 1, _repSide: 'BOTH', _maxValue: 135.7, _maxLeftValue: 23.69, _weight: 71.3 },
    { _repOrdinal: 2, _repSide: 'BOTH', _maxValue: 138.09, _maxLeftValue: 26.29, _weight: 71.3 },
  ],
})

// De variant "Body weight" van dezelfde familie: alleen een gewicht, geen reps.
const bodyWeight = JSON.stringify({ includeAllFields: false, weight: 71.3 })

const nordic = JSON.stringify({
  includeAllFields: false,
  _resultsPerRep: [
    { _leftMaxForce: 13.965, _rightMaxForce: 7.214, _fatigue: -0.07 },
    { _leftMaxForce: 12.1, _rightMaxForce: 8.4, _fatigue: -0.05 },
  ],
})

/** Eén sprong in het gedocumenteerde model (Newton, massa in kg). */
function sprong(over: Record<string, unknown>) {
  return {
    _repCode: 'rep-1',
    repOrdinal: 1,
    bodySide: 'BOTH',
    mass: 64.642,
    weight: 634.14,
    netMaxForce: 987.509,
    maxPower: 1709.796,
    reactiveStrengthIndex: 0.665,
    contactTime: 0,
    timeToStabilize: 894.1,
    propulsiveImpulsePhase1: 20.5,
    propulsiveImpulsePhase2: 63.9,
    totalRfd: 8123.4,
    leftRfd: 4100.2,
    rightRfd: 4023.2,
    jump: {
      _ordinal: 1,
      _jumpHeight: 0.06487,
      _jumpHeightByTakeOffVelocity: 0.07799,
      _timeOnAir: 226.3,
      _maxForce: 1621.65,
      _maxLeftForce: 823.83,
      _maxRightForce: 797.82,
    },
    ...over,
  }
}

const cmj = JSON.stringify({
  includeAllFields: false,
  // Top-level samenvatting: relatief (veelvouden lichaamsgewicht) en meestal
  // een gemiddelde. Mag de parser niet gebruiken.
  jumpType: 'CMJ',
  jumpHeight: 6.291,
  peakForceTotal: 2.483,
  weight: 64.642,
  _repResults: [{ ordinal: 1, jumpHeight: 6.487, peakForceTotal: 165.306 }],
  _resultsModels: [
    sprong({}),
    sprong({ _repCode: 'rep-2', repOrdinal: 2, jump: { _ordinal: 2, _jumpHeight: 0.0611, _timeOnAir: 220.1, _maxForce: 1580.2, _maxLeftForce: 800.1, _maxRightForce: 780.1 } }),
    // Afgebroken sprong: staat gewoon in de lijst, alles nul.
    sprong({ _repCode: 'rep-3', repOrdinal: 3, netMaxForce: 0, jump: { _ordinal: 3, _jumpHeight: 0, _timeOnAir: 0, _maxForce: 0, _maxLeftForce: 0, _maxRightForce: 0 } }),
  ],
})

// Eenbenig: geen `_repResults`, wel `_resultsModels` met één zijde en de
// per-plaat-velden op nul.
const unipodal = JSON.stringify({
  includeAllFields: false,
  jumpType: 'CMJ',
  _resultsPerRep: [{ _bodySide: 'LEFT', _repOrdinal: 1, _peakForce: 1.61 }],
  _resultsModels: [
    sprong({ bodySide: 'LEFT', mass: 57.78, weight: 566.83, netMaxForce: 345.51, jump: { _ordinal: 1, _jumpHeight: 0.1295, _timeOnAir: 0, _maxForce: 912.35, _maxLeftForce: 0, _maxRightForce: 0 } }),
  ],
})

const multiple = JSON.stringify({
  includeAllFields: false,
  jumpType: 'MULTIPLE_JUMPS',
  _numberOfJumps: 2,
  _rsi: 2.013,
  _mrsi: 0.955,
  _fatigueIndex: 1.015,
  _jumps: [
    { _ordinal: 1, _jumpHeight: 0.201, _timeOnAir: 404.9, _maxForce: 342.6 },
    { _ordinal: 2, _jumpHeight: 0.171, _timeOnAir: 372.0, _maxForce: 330.1 },
  ],
})

describe('parseActivityResults', () => {
  it('geeft null bij lege of kapotte JSON in plaats van te gooien', () => {
    expect(parseActivityResults(null)).toBeNull()
    expect(parseActivityResults('')).toBeNull()
    expect(parseActivityResults('{niet json')).toBeNull()
    expect(parseActivityResults('"string"')).toBeNull()
  })
})

describe('parseStrength', () => {
  it('neemt per zijde de hoogste poging', () => {
    const r = parseStrength('METER_ENDURANCE', parseActivityResults(meterEndurance))
    expect(r).not.toBeNull()
    expect(r!.left).toBe(20.75)
    expect(r!.right).toBe(22.4)
    expect(r!.single).toBeNull()
    expect(r!.deviceType).toBe('MUSCLE_CONTROLLER')
    expect(r!.repCount).toBe(3)
  })

  it('bewaart elke herhaling met RFD, gemiddelde, tijd tot piek en impuls', () => {
    const r = parseStrength('METER_ENDURANCE', parseActivityResults(meterEndurance))
    expect(r!.reps).toHaveLength(3)
    expect(r!.reps[1]).toEqual({ repCode: 'r2', ordinal: 2, side: 'LEFT', maxKg: 20.75, averageKg: 14.0, rfdToMax: 61.0, rfdAverage: 35.5, timeToMaxMs: 980, impulseNs: 95.1 })
  })

  it('geeft een Nordic per been als aparte herhalingen terug', () => {
    const r = parseStrength('NORDIC_HAMSTRING', parseActivityResults(nordic))
    expect(r!.reps.map((x) => `${x.side}:${x.maxKg}`)).toEqual(['LEFT:13.965', 'RIGHT:7.214', 'LEFT:12.1', 'RIGHT:8.4'])
  })

  it('geeft een IMTP-herhaling terug als beide platen samen', () => {
    const r = parseStrength('TOTAL_EVALUATION', parseActivityResults(totalEvaluation))
    expect(r!.reps).toHaveLength(2)
    expect(r!.reps[0].side).toBe('BOTH')
    expect(r!.reps[0].maxKg).toBe(135.7)
  })

  it('splitst een IMTP in links en rechts, met rechts als totaal min links', () => {
    const r = parseStrength('TOTAL_EVALUATION', parseActivityResults(totalEvaluation))
    expect(r).not.toBeNull()
    expect(r!.left).toBe(26.29)
    expect(r!.right).toBeCloseTo(112.01, 2)
    expect(r!.single).toBeNull()
    expect(r!.bodyWeightKg).toBe(71.3)
  })

  it('leest een Nordic hamstring per been', () => {
    const r = parseStrength('NORDIC_HAMSTRING', parseActivityResults(nordic))
    expect(r).not.toBeNull()
    expect(r!.left).toBe(13.965)
    expect(r!.right).toBe(8.4)
  })

  it('geeft null als er geen bruikbare poging in zit', () => {
    expect(parseStrength('METER', parseActivityResults('{"_resultsPerRep":[]}'))).toBeNull()
    expect(parseStrength('METER', parseActivityResults('{"_resultsPerRep":[{"_maxValue":0}]}'))).toBeNull()
    expect(parseStrength('METER', null)).toBeNull()
  })

  it('ziet een gewichtsmeting niet aan voor een krachtmeting', () => {
    expect(parseStrength('TOTAL_EVALUATION', parseActivityResults(bodyWeight))).toBeNull()
  })
})

describe('parseBodyWeight', () => {
  it('leest de variant met alleen een gewicht', () => {
    expect(parseBodyWeight(parseActivityResults(bodyWeight))).toBe(71.3)
  })

  it('geeft null zodra er reps in zitten of het gewicht ontbreekt', () => {
    expect(parseBodyWeight(parseActivityResults(totalEvaluation))).toBeNull()
    expect(parseBodyWeight(parseActivityResults('{"includeAllFields":false}'))).toBeNull()
    expect(parseBodyWeight(null)).toBeNull()
  })
})

describe('parseJump', () => {
  it('leest sprongen uit het gedocumenteerde model, in Newton en centimeter', () => {
    const r = parseJump(parseActivityResults(cmj))
    expect(r).not.toBeNull()
    expect(r!.variant).toBe('SINGLE')
    expect(r!.jumpType).toBe('CMJ')
    expect(r!.reps).toHaveLength(2)
    const eerste = r!.reps[0]
    expect(eerste.repCode).toBe('rep-1')
    expect(eerste.side).toBe('BOTH')
    expect(eerste.jumpHeightCm).toBeCloseTo(6.487, 3)
    expect(eerste.jumpHeightByVelocityCm).toBeCloseTo(7.799, 3)
    expect(eerste.flightTimeMs).toBe(226.3)
    expect(eerste.peakForceN).toBe(1621.65)
    expect(eerste.peakForceLeftN).toBe(823.83)
    expect(eerste.peakForceRightN).toBe(797.82)
    expect(eerste.netMaxForceN).toBe(987.509)
    expect(eerste.maxPowerW).toBe(1709.796)
    expect(eerste.rsi).toBe(0.665)
    expect(eerste.timeToStabilizeMs).toBe(894.1)
    expect(eerste.propulsiveImpulsePhase1).toBe(20.5)
    expect(eerste.rfdTotal).toBe(8123.4)
    expect(eerste.rfdLeft).toBe(4100.2)
    expect(eerste.rfdRight).toBe(4023.2)
  })

  it('laat afgebroken sprongen buiten de reeks', () => {
    const r = parseJump(parseActivityResults(cmj))
    expect(r!.reps.map((x) => x.ordinal)).toEqual([1, 2])
  })

  it('haalt lichaamsgewicht en de zwaartekrachtsverhouding uit het model', () => {
    const r = parseJump(parseActivityResults(cmj))
    expect(r!.bodyWeightKg).toBe(64.642)
    expect(r!.gravityRatio).toBeCloseTo(9.81, 2)
  })

  it('negeert de relatieve samenvatting bovenin', () => {
    const r = parseJump(parseActivityResults(cmj))
    // 2.483 is het top-level `peakForceTotal` in veelvouden lichaamsgewicht.
    expect(r!.reps.some((x) => x.peakForceN === 2.483)).toBe(false)
    expect(Math.max(...r!.reps.map((x) => x.jumpHeightCm ?? 0))).toBeCloseTo(6.487, 3)
  })

  it('leest een eenbenige sprong als één zijde zonder plaatsplitsing', () => {
    const r = parseJump(parseActivityResults(unipodal))
    expect(r).not.toBeNull()
    expect(r!.reps).toHaveLength(1)
    expect(r!.reps[0].side).toBe('LEFT')
    expect(r!.reps[0].peakForceN).toBe(912.35)
    expect(r!.reps[0].peakForceLeftN).toBeNull()
    expect(r!.reps[0].peakForceRightN).toBeNull()
    expect(r!.reps[0].jumpHeightCm).toBeCloseTo(12.95, 2)
  })

  it('leest herhaalde sprongen uit _jumps met de reeksmaten', () => {
    const r = parseJump(parseActivityResults(multiple))
    expect(r).not.toBeNull()
    expect(r!.variant).toBe('MULTIPLE')
    expect(r!.reps).toHaveLength(2)
    expect(r!.reps[1].jumpHeightCm).toBeCloseTo(17.1, 2)
    expect(r!.reps[1].peakForceN).toBe(330.1)
    expect(r!.numberOfJumps).toBe(2)
    expect(r!.peakJumpHeightCm).toBeCloseTo(20.1, 2)
    expect(r!.heightAverageCm).toBeCloseTo(18.6, 1)
    expect(r!.rsi).toBe(2.013)
    expect(r!.mrsi).toBe(0.955)
    expect(r!.fatigueIndex).toBe(1.015)
  })

  it('geeft null zonder gedocumenteerd model, ook als de oude kg-laag er wel is', () => {
    const alleenOud = JSON.stringify({ jumpType: 'CMJ', _repResults: [{ ordinal: 1, jumpHeight: 23.7, peakForceTotal: 251.8 }] })
    expect(parseJump(parseActivityResults(alleenOud))).toBeNull()
    expect(parseJump(null)).toBeNull()
  })
})

describe('checkUnit', () => {
  it('accepteert een plausibel gewicht zonder vorige meting', () => {
    expect(checkUnit(72.4)).toEqual<UnitCheck>({ status: 'ok', unit: 'kg' })
  })

  it('accepteert normale schommeling tussen twee metingen', () => {
    expect(checkUnit(72.4, 70.1).status).toBe('ok')
  })

  it('herkent Newton aan een onmogelijk gewicht', () => {
    const r = checkUnit(710)
    expect(r.status).toBe('suspect')
    expect(r.status === 'suspect' && r.reason).toMatch(/Newton/)
  })

  it('herkent de omschakeling naar ponden aan de sprong', () => {
    const r = checkUnit(159.6, 72.4)
    expect(r.status).toBe('suspect')
    expect(r.status === 'suspect' && r.reason).toMatch(/ponden/)
  })

  it('herkent ook de omschakeling terug', () => {
    expect(checkUnit(72.4, 159.6).status).toBe('suspect')
  })

  it('is voorzichtig als de meting geen gewicht draagt', () => {
    expect(checkUnit(null).status).toBe('unverified')
  })

  it('vertrouwt een sprongmodel waarin gewicht gedeeld door massa 9,81 is', () => {
    expect(checkUnit(64.6, null, 9.81).status).toBe('ok')
  })

  it('wantrouwt een sprongmodel waarin die verhouding klopt met een andere eenheid', () => {
    const r = checkUnit(64.6, null, 1.0)
    expect(r.status).toBe('suspect')
    expect(r.status === 'suspect' && r.reason).toMatch(/9,81/)
  })
})

describe('rekenhulpjes', () => {
  it('rekent kilogramkracht om naar Newton', () => {
    expect(kgToNewton(10)).toBeCloseTo(98.0665, 4)
  })

  it('rondt een meetwaarde af op één decimaal voor het dossier', () => {
    expect(rond(236.44862501)).toBe(236.4)
    expect(rond(111.05)).toBe(111.1)
    expect(rond(null)).toBeNull()
  })

  it('berekent LSI als zwakste gedeeld door sterkste', () => {
    expect(lsi(80, 100)).toBe(80)
    expect(lsi(100, 80)).toBe(80)
    expect(lsi(0, 80)).toBeNull()
    expect(lsi(null, 80)).toBeNull()
  })
})
