import { describe, it, expect } from 'vitest'
import { beoordeelLid, sorteerRijen, tellers, isDonderdagOfLater, type LidInvoer } from '../group-dashboard'

const basis: LidInvoer = {
  patientId: 'p1', naam: 'Sam', pijn: [], injuryInfo: null, readiness: { band: 'GREEN', score: 80 },
  vorm: { form: 5, statusKey: 'neutraal', statusLabel: 'Neutraal', weekLoad: 900, calibrated: true },
  gepland: 3, gedaan: 1, laatste: null, volgende: null, notitie: null,
}

describe('beoordeelLid', () => {
  it('is ok zonder signalen', () => {
    const r = beoordeelLid(basis, '2026-10-06')
    expect(r.status).toBe('ok')
    expect(r.aandacht).toBe(false)
    expect(r.aandachtRedenen).toEqual([])
  })
  it('geblesseerd bij pijn vanaf NRS 4, met locatie in het detail', () => {
    const r = beoordeelLid({ ...basis, pijn: [{ nrs: 2, location: 'Kuit', reportedAt: '2026-10-05' }, { nrs: 6, location: 'Knie links', reportedAt: '2026-10-04' }] }, '2026-10-06')
    expect(r.status).toBe('geblesseerd')
    expect(r.statusDetail).toBe('Knie links · NRS 6')
    expect(r.aandachtRedenen).toContain('Geblesseerd')
  })
  it('geblesseerd bij een blessurenotitie op het profiel', () => {
    const r = beoordeelLid({ ...basis, injuryInfo: ' Hamstring rechts ' }, '2026-10-06')
    expect(r.status).toBe('geblesseerd')
    expect(r.statusDetail).toBe('Hamstring rechts')
  })
  it('vraagt aandacht bij rood herstel en bij overreaching, maar niet zonder ijking', () => {
    expect(beoordeelLid({ ...basis, readiness: { band: 'RED', score: 30 } }, '2026-10-06').aandachtRedenen).toEqual(['Herstel rood'])
    expect(beoordeelLid({ ...basis, vorm: { ...basis.vorm!, statusKey: 'overreaching' } }, '2026-10-06').aandachtRedenen).toEqual(['Overreaching-risico'])
    expect(beoordeelLid({ ...basis, vorm: { ...basis.vorm!, statusKey: 'overreaching', calibrated: false } }, '2026-10-06').aandacht).toBe(false)
  })
  it('nog niets gedaan telt pas vanaf donderdag en bij minstens twee geplande trainingen', () => {
    const niets = { ...basis, gedaan: 0, gepland: 2 }
    expect(beoordeelLid(niets, '2026-10-06').aandacht).toBe(false) // dinsdag
    expect(beoordeelLid(niets, '2026-10-08').aandachtRedenen).toEqual(['Nog niets gedaan deze week']) // donderdag
    expect(beoordeelLid({ ...niets, gepland: 1 }, '2026-10-08').aandacht).toBe(false)
    expect(beoordeelLid(niets, '2026-10-11').aandacht).toBe(true) // zondag
  })
})

describe('sorteerRijen en tellers', () => {
  it('zet wie aandacht vraagt bovenaan, daarna op naam', () => {
    const rijen = [
      beoordeelLid({ ...basis, naam: 'Zoë' }, '2026-10-06'),
      beoordeelLid({ ...basis, naam: 'Anna', readiness: null }, '2026-10-06'),
      beoordeelLid({ ...basis, naam: 'Bram', pijn: [{ nrs: 5, location: 'Enkel', reportedAt: '2026-10-05' }] }, '2026-10-06'),
    ]
    expect(sorteerRijen(rijen).map(r => r.naam)).toEqual(['Bram', 'Anna', 'Zoë'])
    expect(tellers(rijen)).toEqual({ aandacht: 1, geblesseerd: 1, geenWearable: 1 })
  })
  it('kent de weekdag', () => {
    expect(isDonderdagOfLater('2026-10-07')).toBe(false)
    expect(isDonderdagOfLater('2026-10-09')).toBe(true)
  })
})
