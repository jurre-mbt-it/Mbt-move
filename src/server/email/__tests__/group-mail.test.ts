import { describe, expect, it } from 'vitest'

import { resolveSender, BASE_SENDER } from '../sender'
import { groupAddedMail, groupLeftMail } from '../../mail'

/**
 * Wie aan een groep wordt toegevoegd hoort dat van ons, met de naam van wie
 * het deed en één knop om er weer uit te stappen. De eigenaar hoort het als
 * iemand eruit stapt. Wat hier vastligt: de namen staan erin, de uitstaplink
 * staat in de knop én als tekst, en vrije invoer wordt ge-escaped.
 */

const sender = resolveSender({
  therapist: { firstName: 'Anna', lastName: 'Jansen', jobTitle: 'coach' },
  practice: { name: 'Praktijk Voorbeeld', addressLine1: 'Teststraat 1', city: 'Testdorp', email: 'info@voorbeeld.nl' },
})

const basis = {
  recipientName: 'Sam de Vries',
  groupName: 'Selectie 1',
  planName: 'Periodisering 2026/27',
  byName: 'Anna Jansen',
  leaveUrl: 'https://getbase.coach/groep/verlaten/abc.def',
}

describe('groupAddedMail', () => {
  it('noemt wie toevoegde, de groep en de programmanaam in de kalender', () => {
    const mail = groupAddedMail({ ...basis, sender })
    expect(mail.subject).toBe('Anna Jansen heeft je toegevoegd aan Selectie 1')
    expect(mail.html).toContain('Hallo Sam')
    expect(mail.html).toContain('Selectie 1')
    expect(mail.html).toContain('Onderdeel van Periodisering 2026/27')
  })

  it('zet de uitstaplink in de knop en als tekst', () => {
    const mail = groupAddedMail({ ...basis, sender })
    expect(mail.html).toContain('href="https://getbase.coach/groep/verlaten/abc.def"')
    expect(mail.text).toContain('https://getbase.coach/groep/verlaten/abc.def')
  })

  it('valt terug op de groepsnaam als er geen programmanaam is', () => {
    const mail = groupAddedMail({ ...basis, planName: null, sender: BASE_SENDER })
    expect(mail.html).toContain('Onderdeel van Selectie 1')
  })

  it('escapet groepsnaam en naam van de toevoeger', () => {
    const mail = groupAddedMail({ ...basis, groupName: '<b>Groep</b>', byName: 'A & B', sender })
    expect(mail.html).not.toContain('<b>Groep</b>')
    expect(mail.html).toContain('&lt;b&gt;Groep&lt;/b&gt;')
    expect(mail.html).toContain('A &amp; B')
  })

  it('haalt regelovergangen uit het onderwerp', () => {
    const mail = groupAddedMail({ ...basis, byName: 'Anna\r\nBcc: x', sender })
    expect(mail.subject).not.toMatch(/[\r\n]/)
  })
})

describe('groupLeftMail', () => {
  it('meldt de eigenaar wie eruit stapte', () => {
    const mail = groupLeftMail({ ownerName: 'Anna Jansen', memberName: 'Sam de Vries', groupName: 'Selectie 1', groupUrl: 'https://getbase.coach/coach/groups/g1' })
    expect(mail.subject).toBe('Sam de Vries is uit Selectie 1 gestapt')
    expect(mail.html).toContain('Hallo Anna')
    expect(mail.html).toContain('href="https://getbase.coach/coach/groups/g1"')
    expect(mail.text).toContain('Sam de Vries')
  })
})
