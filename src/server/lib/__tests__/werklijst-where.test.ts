import { describe, expect, it } from 'vitest'

import { werklijstAnd } from '../werklijst-where'
import { nietUitbehandeld, welUitbehandeld } from '../care-scope'

const therapeut = { id: 't1', role: 'THERAPIST' as const, practiceId: 'p1' }

/**
 * De scope-takken zoals `patients.list` en `caseload` ze opbouwen: eigen
 * koppeling OF dezelfde praktijk.
 */
const scopeTakken = [
  { patientTherapists: { some: { therapistId: 't1', isActive: true } } },
  { practiceId: 'p1' },
]

/**
 * Deze tests gaan over de VORM van de where, niet over de inhoud. Het lek van
 * 27 juli (audit H1) was precies een vormfout: het zoekfilter kwam als tweede
 * `OR`-sleutel naast de toegangscontrole terecht, de spread schreef de scoping
 * weg en naam plus e-mail van patiënten uit elke praktijk kwamen bij elke
 * therapeut terug. Vouwt iemand dit later terug naar één `OR`, dan valt hier
 * een test om.
 */
describe('werklijstAnd', () => {
  it('zet de scope-takken samen in tak 1 en het archieffilter in tak 2', () => {
    const takken = werklijstAnd(scopeTakken, nietUitbehandeld(therapeut))
    expect(takken).toHaveLength(2)
    expect(takken[0]).toEqual({ OR: scopeTakken })
    expect(takken[1]).toEqual(nietUitbehandeld(therapeut))
  })

  it('laat geen enkele scope-tak vallen', () => {
    const takken = werklijstAnd(scopeTakken, nietUitbehandeld(therapeut))
    expect(takken[0]).toHaveProperty('OR')
    expect((takken[0] as { OR: unknown[] }).OR).toHaveLength(scopeTakken.length)
  })

  it('zet het archieffilter NIET in de scope-OR', () => {
    // Als extra OR-tak zou het archieffilter de scoping juist verruimen: een
    // patiënt zonder markering matcht dan de OR, ongeacht praktijk.
    const takken = werklijstAnd(scopeTakken, nietUitbehandeld(therapeut))
    const or = (takken[0] as { OR: unknown[] }).OR
    expect(or).toEqual(scopeTakken)
    expect(JSON.stringify(or)).not.toContain('careStatuses')
  })

  it('geeft het archief dezelfde vorm, met some in plaats van none', () => {
    const takken = werklijstAnd(scopeTakken, welUitbehandeld(therapeut))
    expect(takken[0]).toEqual({ OR: scopeTakken })
    expect(takken[1]).toEqual({
      careStatuses: { some: { practiceId: 'p1', reactivatedAt: null } },
    })
  })

  it('houdt de scope-tak intact bij include: all (leeg archieffilter)', () => {
    // Een lege tak onder AND matcht alles. De scope blijft staan, dus 'all'
    // verruimt het archief en niet de toegang.
    const takken = werklijstAnd(scopeTakken, {})
    expect(takken[0]).toEqual({ OR: scopeTakken })
    expect(takken[1]).toEqual({})
  })
})
