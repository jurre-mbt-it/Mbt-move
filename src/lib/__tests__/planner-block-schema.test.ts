import { describe, expect, it } from 'vitest'
import { blockInputSchema, itemGroupsSchema } from '@/server/lib/planner-block-schema'

const basis = { blockKind: 'EXERCISE', exerciseId: 'x', sets: 3, reps: 8, repUnit: 'reps' }

describe('blockInputSchema', () => {
  it('accepteert een gewone oefening en vult defaults', () => {
    const r = blockInputSchema.safeParse(basis)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ amrap: false, isBodyweight: false, completionOnly: false, intensityType: 'NONE', supersetOrder: 0 })
  })
  it('weigert een oefening zonder exerciseId', () => {
    expect(blockInputSchema.safeParse({ ...basis, exerciseId: null }).success).toBe(false)
  })
  it('eist tekst bij een notitie en duur bij een pauze', () => {
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: '  ' }).success).toBe(false)
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: 'Verzamelen bij zaal 1' }).success).toBe(true)
    expect(blockInputSchema.safeParse({ blockKind: 'BREAK' }).success).toBe(false)
    expect(blockInputSchema.safeParse({ blockKind: 'BREAK', durationSec: 120 }).success).toBe(true)
  })
  it('eist precies sets elementen in repsPerSet', () => {
    expect(blockInputSchema.safeParse({ ...basis, sets: 4, repsPerSet: [8, 6, 6] }).success).toBe(false)
    expect(blockInputSchema.safeParse({ ...basis, sets: 4, repsPerSet: [8, 6, 6, 4] }).success).toBe(true)
  })
  it('accepteert alleen http(s)-videolinks', () => {
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: 'x', videoUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: 'x', videoUrl: 'https://youtu.be/abc' }).success).toBe(true)
  })
})

describe('itemGroupsSchema', () => {
  it('accepteert letters A..F met geldige velden', () => {
    expect(itemGroupsSchema.safeParse({ A: { kind: 'CIRCUIT', rounds: 3, timeCapSec: 720, restSec: 60 } }).success).toBe(true)
    expect(itemGroupsSchema.safeParse({ G: { kind: 'CIRCUIT' } }).success).toBe(false)
    expect(itemGroupsSchema.safeParse({ A: { kind: 'CIRCUIT', rounds: 11 } }).success).toBe(false)
  })
})
