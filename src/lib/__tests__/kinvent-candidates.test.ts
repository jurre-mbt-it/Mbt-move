import { describe, it, expect } from 'vitest'
import { buildCandidates } from '@/lib/kinvent/candidates'
import type { KinventAnalysis, KinventProtocol } from '@/lib/kinvent/client'

/**
 * Van lichte protocollen plus analyses naar een voorstel voor de therapeut.
 * Pure functie, dus zonder database: de router voert de sets bekende codes en
 * het laatst bekende gewicht aan.
 */

const DAG = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 1)

function protocol(code: string, activityCode: string, exerciseType: string, at: number, title = 'test'): KinventProtocol {
  return {
    code,
    updatedOn: at,
    createdOn: at,
    activities: [{ code: activityCode, startTime: at, config: { exerciseType, title } }],
  }
}

function analysis(protocolCode: string, activityCode: string, exerciseType: string, at: number, results: unknown): KinventAnalysis {
  return {
    protocolCode,
    activitiesResults: [{ activityCode, startTime: at, activityResults: JSON.stringify(results), config: { exerciseType, title: 'test' } }],
  }
}

const sprongModel = (mass: number, over: Record<string, unknown> = {}) => ({
  _repCode: 'rep-1',
  repOrdinal: 1,
  bodySide: 'BOTH',
  mass,
  weight: mass * 9.81,
  netMaxForce: 980,
  reactiveStrengthIndex: 0.7,
  jump: { _ordinal: 1, _jumpHeight: 0.31, _timeOnAir: 500, _maxForce: 1600 },
  ...over,
})

const kracht = {
  _resultsPerRep: [
    { _repSide: 'LEFT', _maxValue: 20, _device: 'LINK' },
    { _repSide: 'RIGHT', _maxValue: 25, _device: 'LINK' },
  ],
}

const leeg = { knownActivityCodes: new Set<string>(), knownProtocolCodes: new Set<string>(), deletedProtocolCodes: [], referenceWeightKg: null }

describe('buildCandidates', () => {
  it('maakt van een sprong een kandidaat met de beste hoogte en een geslaagde eenheidscontrole', () => {
    const out = buildCandidates({
      ...leeg,
      protocols: [protocol('p1', 'a1', 'JUMP_ANALYSIS', T0)],
      analyses: [analysis('p1', 'a1', 'JUMP_ANALYSIS', T0, { jumpType: 'CMJ', _resultsModels: [sprongModel(64.6), sprongModel(64.6, { _repCode: 'rep-2', repOrdinal: 2, jump: { _ordinal: 2, _jumpHeight: 0.33, _maxForce: 1650 } })] })],
    })
    expect(out.candidates).toHaveLength(1)
    const c = out.candidates[0]
    expect(c.kind).toBe('JUMP')
    expect(c.protocolCode).toBe('p1')
    expect(c.jumpHeightCm).toBeCloseTo(33, 5)
    expect(c.rsi).toBe(0.7)
    expect(c.unit.status).toBe('ok')
    expect(c.performedAt.getTime()).toBe(T0)
  })

  it('draagt de sprongmeting zelf mee, zodat het wegschrijven niets hoeft te herberekenen', () => {
    const out = buildCandidates({
      ...leeg,
      protocols: [protocol('p1', 'a1', 'JUMP_ANALYSIS', T0), protocol('p2', 'a2', 'METER', T0)],
      analyses: [
        analysis('p1', 'a1', 'JUMP_ANALYSIS', T0, { _resultsModels: [sprongModel(64.6), sprongModel(64.6, { _repCode: 'rep-2', repOrdinal: 2 })] }),
        analysis('p2', 'a2', 'METER', T0, kracht),
      ],
    })
    const sprong = out.candidates.find((c) => c.kind === 'JUMP')
    const meting = out.candidates.find((c) => c.kind === 'STRENGTH')
    expect(sprong?.jump?.reps).toHaveLength(2)
    expect(sprong?.jump?.bodyWeightKg).toBe(64.6)
    expect(meting?.jump).toBeNull()
    expect(meting?.strength?.reps).toHaveLength(2)
    expect(sprong?.strength).toBeNull()
  })

  it('maakt van een krachtmeting een kandidaat met LSI', () => {
    const out = buildCandidates({
      ...leeg,
      protocols: [protocol('p1', 'a1', 'METER', T0)],
      analyses: [analysis('p1', 'a1', 'METER', T0, kracht)],
    })
    const c = out.candidates[0]
    expect(c.kind).toBe('STRENGTH')
    expect(c.left).toBe(20)
    expect(c.right).toBe(25)
    expect(c.lsi).toBe(80)
    expect(c.deviceType).toBe('LINK')
    expect(c.unit.status).toBe('unverified')
  })

  it('gebruikt een gewichtsmeting van Kinvent als ijkpunt en maakt er geen kandidaat van', () => {
    const out = buildCandidates({
      ...leeg,
      protocols: [protocol('p1', 'a1', 'TOTAL_EVALUATION', T0), protocol('p2', 'a2', 'JUMP_ANALYSIS', T0 + DAG)],
      analyses: [
        analysis('p1', 'a1', 'TOTAL_EVALUATION', T0, { includeAllFields: false, weight: 64.6 }),
        // Sprong een dag later met een massa die precies de omrekening naar ponden is.
        analysis('p2', 'a2', 'JUMP_ANALYSIS', T0 + DAG, { _resultsModels: [sprongModel(142.4)] }),
      ],
    })
    expect(out.candidates.map((c) => c.protocolCode)).toEqual(['p2'])
    expect(out.candidates[0].unit.status).toBe('suspect')
    expect(out.referenceWeightKg).toBe(64.6)
  })

  it('laat het gewicht dat bij een IMTP meekomt buiten de eenheidscontrole', () => {
    // In de praktijk stond daar 24,4 en 55,8 bij iemand van 78 kg: geen
    // lichaamsgewicht, dus geen ijkpunt en geen reden om de meting af te keuren.
    const out = buildCandidates({
      ...leeg,
      referenceWeightKg: 78.2,
      protocols: [protocol('p1', 'a1', 'TOTAL_EVALUATION', T0)],
      analyses: [analysis('p1', 'a1', 'TOTAL_EVALUATION', T0, { _resultsPerRep: [{ _repSide: 'BOTH', _maxValue: 139, _maxLeftValue: 68.7, _weight: 24.4 }] })],
    })
    expect(out.candidates[0].kind).toBe('STRENGTH')
    expect(out.candidates[0].unit.status).toBe('unverified')
    expect(out.referenceWeightKg).toBe(78.2)
  })

  it('laat het gewicht van een geslaagde sprong het ijkpunt worden', () => {
    const out = buildCandidates({
      ...leeg,
      referenceWeightKg: 70,
      protocols: [protocol('p1', 'a1', 'JUMP_ANALYSIS', T0)],
      analyses: [analysis('p1', 'a1', 'JUMP_ANALYSIS', T0, { _resultsModels: [sprongModel(68.2)] })],
    })
    expect(out.candidates[0].unit.status).toBe('ok')
    expect(out.referenceWeightKg).toBe(68.2)
  })

  it('markeert wat al geïmporteerd is en wat Kinvent inmiddels verwijderd heeft', () => {
    const out = buildCandidates({
      protocols: [protocol('p1', 'a1', 'METER', T0)],
      analyses: [analysis('p1', 'a1', 'METER', T0, kracht)],
      knownActivityCodes: new Set(['a1']),
      knownProtocolCodes: new Set(['p1', 'p-oud']),
      deletedProtocolCodes: ['p-oud', 'p-onbekend'],
      referenceWeightKg: null,
    })
    expect(out.candidates[0].alreadyImported).toBe(true)
    expect(out.removedProtocolCodes).toEqual(['p-oud'])
  })

  it('zet de nieuwste meting bovenaan en slaat protocollen zonder analyse over', () => {
    const out = buildCandidates({
      ...leeg,
      protocols: [protocol('oud', 'a1', 'METER', T0), protocol('nieuw', 'a2', 'METER', T0 + DAG), protocol('zonder', 'a3', 'METER', T0 + 2 * DAG)],
      analyses: [analysis('oud', 'a1', 'METER', T0, kracht), analysis('nieuw', 'a2', 'METER', T0 + DAG, kracht)],
    })
    expect(out.candidates.map((c) => c.protocolCode)).toEqual(['nieuw', 'oud'])
  })
})
