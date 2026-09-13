import { describe, expect, it } from 'vitest'
import {
  dominantCategory, durationFromBlocks, formatBlockPrescription, fmtMmSs,
  newBlock, nextFreeGroupLetter, parseGroups, paramValue, withParam, groupLabel,
  toBlockPayload, isExerciseBlock,
} from '../planner-blocks'

const oef = (patch: Parameters<typeof newBlock>[1] = {}) =>
  newBlock('EXERCISE', { exerciseId: 'x', exerciseName: 'Squat', exerciseCategory: 'STRENGTH', ...patch })

describe('formatBlockPrescription', () => {
  it('toont sets × reps', () => {
    expect(formatBlockPrescription(oef({ sets: 3, reps: 8 }))).toBe('3 × 8')
  })
  it('toont een per-set-schema met schuine strepen', () => {
    expect(formatBlockPrescription(oef({ sets: 4, reps: 8, repsPerSet: [8, 6, 6, 4] }))).toBe('4 × 8/6/6/4')
  })
  it('zet een plus bij AMRAP', () => {
    expect(formatBlockPrescription(oef({ sets: 3, reps: 5, amrap: true }))).toBe('3 × 5+')
  })
  it('toont bereiken en tijd-eenheden', () => {
    expect(formatBlockPrescription(oef({ sets: 2, setsMax: 3, reps: 8, repsMax: 12 }))).toBe('2-3 × 8-12')
    expect(formatBlockPrescription(oef({ sets: 3, reps: 30, repUnit: 'sec' }))).toBe('3 × 30 sec')
  })
  it('markeert per zijde met L+R en laat /zijde uit de eenheid', () => {
    expect(formatBlockPrescription(oef({ sets: 3, reps: 12, repUnit: 'reps/zijde' }))).toBe('3 × 12 L+R')
    expect(formatBlockPrescription(oef({ sets: 3, reps: 30, repUnit: 'sec/zijde' }))).toBe('3 × 30 sec L+R')
  })
  it('afvinken, pauze en notitie', () => {
    expect(formatBlockPrescription(oef({ completionOnly: true }))).toBe('Afvinken')
    expect(formatBlockPrescription(newBlock('BREAK', { durationSec: 180 }))).toBe('Pauze 3:00')
    expect(formatBlockPrescription(newBlock('NOTE', { text: 'hoi' }))).toBe('')
  })
})

describe('fmtMmSs', () => {
  it('formatteert seconden als m:ss', () => {
    expect(fmtMmSs(90)).toBe('1:30')
    expect(fmtMmSs(5)).toBe('0:05')
    expect(fmtMmSs(720)).toBe('12:00')
  })
})

describe('dominantCategory', () => {
  it('kiest de meest voorkomende categorie van oefeningsrijen', () => {
    const blocks = [
      oef({ exerciseCategory: 'STRENGTH' }), oef({ exerciseCategory: 'MOBILITY' }), oef({ exerciseCategory: 'STRENGTH' }),
      newBlock('NOTE', { text: 'x' }),
    ]
    expect(dominantCategory(blocks, 'MOBILITY')).toBe('STRENGTH')
  })
  it('laat de huidige staan bij gelijkspel en zonder oefeningen', () => {
    expect(dominantCategory([oef({ exerciseCategory: 'STRENGTH' }), oef({ exerciseCategory: 'MOBILITY' })], 'MOBILITY')).toBe('MOBILITY')
    expect(dominantCategory([newBlock('BREAK', { durationSec: 60 })], 'CARDIO')).toBe('CARDIO')
    expect(dominantCategory([], null)).toBe(null)
  })
})

describe('durationFromBlocks', () => {
  it('telt pauzes mee en notities niet, per-set gebruikt het gemiddelde', () => {
    const alleenOef = durationFromBlocks([oef({ sets: 3, reps: 10, restTime: 60 })])
    const metPauze = durationFromBlocks([oef({ sets: 3, reps: 10, restTime: 60 }), newBlock('BREAK', { durationSec: 120 }), newBlock('NOTE', { text: 'x' })])
    expect(metPauze).toBe(alleenOef + 120)
    expect(durationFromBlocks([oef({ sets: 4, reps: 8, repsPerSet: [8, 6, 6, 4], restTime: 60 })]))
      .toBe(durationFromBlocks([oef({ sets: 4, reps: 6, restTime: 60 })]))
  })
})

describe('groepen', () => {
  it('parseGroups accepteert alleen geldige letters en soorten', () => {
    expect(parseGroups(null)).toEqual({})
    expect(parseGroups({ A: { kind: 'CIRCUIT', rounds: 3 }, Z: { kind: 'CIRCUIT' }, B: { kind: 'RAAR' } }))
      .toEqual({ A: { kind: 'CIRCUIT', rounds: 3 } })
  })
  it('nextFreeGroupLetter slaat gebruikte letters over', () => {
    expect(nextFreeGroupLetter([oef({ supersetGroup: 'A' })], { B: { kind: 'CIRCUIT' } })).toBe('C')
    expect(nextFreeGroupLetter([], {})).toBe('A')
    const vol = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map(l => [l, { kind: 'SUPERSET' as const }]))
    expect(nextFreeGroupLetter([], vol)).toBe(null)
  })
  it('groupLabel beschrijft superset en circuit', () => {
    expect(groupLabel('A', {})).toBe('A · Superset')
    expect(groupLabel('B', { B: { kind: 'CIRCUIT', rounds: 3 } })).toBe('B · Circuit 3 rondes')
    expect(groupLabel('C', { C: { kind: 'CIRCUIT', rounds: 1, name: 'Finisher' } })).toBe('C · Finisher, 1 ronde')
  })
})

describe('params', () => {
  it('withParam voegt toe, vervangt en verwijdert op id', () => {
    const p1 = withParam([], 'tempo', '3-1-2-0')
    expect(p1).toEqual([{ id: 'tempo', label: 'Tempo', type: 'text', unit: '', value: '3-1-2-0' }])
    const p2 = withParam(p1, 'tempo', '2-0-2-0')
    expect(p2).toHaveLength(1)
    expect(paramValue(p2, 'tempo')).toBe('2-0-2-0')
    expect(withParam(p2, 'tempo', null)).toEqual([])
  })
  it('paramValue vindt legacy RIR op label', () => {
    expect(paramValue([{ id: 'rir', label: 'RIR', type: 'number', value: 2 }], 'rir')).toBe(2)
    expect(paramValue([{ label: 'RIR', value: '3' }], 'rir')).toBe(3)
    expect(paramValue([], 'rir')).toBe(null)
  })
})

describe('toBlockPayload en isExerciseBlock', () => {
  it('geeft alle velden terug en laat naam en categorie weg', () => {
    const p = toBlockPayload(oef({ repsPerSet: [8, 6, 6], sets: 3, amrap: true, phase: 'WARMUP', trackMax: false }))
    expect(p).toMatchObject({ blockKind: 'EXERCISE', exerciseId: 'x', repsPerSet: [8, 6, 6], amrap: true, phase: 'WARMUP', trackMax: false, intensityType: 'NONE' })
    expect('exerciseName' in p).toBe(false)
  })
  it('isExerciseBlock eist soort en oefening', () => {
    expect(isExerciseBlock({ blockKind: 'EXERCISE', exerciseId: 'x' })).toBe(true)
    expect(isExerciseBlock({ blockKind: 'EXERCISE', exerciseId: null })).toBe(false)
    expect(isExerciseBlock({ blockKind: 'NOTE', exerciseId: null })).toBe(false)
  })
})
