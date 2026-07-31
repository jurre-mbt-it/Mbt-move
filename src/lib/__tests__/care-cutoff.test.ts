import { describe, expect, it } from 'vitest'
import { planningCutoff } from '../care-cutoff'

describe('planningCutoff', () => {
  it('geeft de eerstvolgende maandag, zodat de lopende week heel blijft', () => {
    // Woensdag 5 augustus 2026 -> maandag 10 augustus.
    const uit = planningCutoff(new Date('2026-08-05T09:00:00+02:00'))
    expect(uit.toISOString()).toBe('2026-08-09T22:00:00.000Z') // maandag 10 aug, NL-middernacht
  })

  it('schuift een maandag door naar de week erna', () => {
    const uit = planningCutoff(new Date('2026-08-10T09:00:00+02:00'))
    expect(uit.toISOString()).toBe('2026-08-16T22:00:00.000Z') // maandag 17 aug
  })

  it('rekent in NL-tijd, niet in UTC', () => {
    // Maandag 10 augustus 00:30 in Amsterdam is nog ZONDAG 9 augustus in UTC.
    // Wie op UTC rekent ziet een zondag, pakt de maandag ervóór en zet de knip
    // een hele week te vroeg (op 10 aug in plaats van 17 aug).
    const uit = planningCutoff(new Date('2026-08-09T22:30:00.000Z'))
    expect(uit.toISOString()).toBe('2026-08-16T22:00:00.000Z')
  })

  it('houdt de wintertijd-offset aan als het ontslag in de zomer valt', () => {
    // Zondag 25 oktober 2026 valt nog in CEST; de maandag erna (26 oktober)
    // staat als 23:00Z omdat de klok in dat weekend terugloopt.
    const uit = planningCutoff(new Date('2026-10-21T12:00:00+02:00'))
    expect(uit.toISOString()).toBe('2026-10-25T23:00:00.000Z') // maandag 26 okt
  })
})
