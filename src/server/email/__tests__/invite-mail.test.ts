import { describe, expect, it } from 'vitest'

import { resolveSender, BASE_SENDER } from '../sender'
import { inviteMail } from '../../mail'

/**
 * De uitnodiging is het eerste contact met de app. Wat hier vastligt: de
 * therapeut wordt bij naam genoemd (nu staat er nog het lokale deel van zijn
 * mailadres), de code-URL komt er ongeschonden in, en de verloopdatum staat
 * er leesbaar bij.
 */

const sender = resolveSender({
  therapist: { firstName: 'Anna', lastName: 'Jansen', jobTitle: 'fysiotherapeut' },
  practice: {
    name: 'Praktijk Voorbeeld',
    addressLine1: 'Teststraat 1',
    city: 'Testdorp',
    email: 'info@voorbeeld.nl',
  },
})

const basis = {
  recipientName: 'Sam de Vries',
  codeUrl: 'https://getbase.coach/login/code?email=sam%40voorbeeld.nl',
  expiresAt: new Date('2026-09-01T10:00:00Z'),
}

describe('inviteMail', () => {
  it('noemt de therapeut bij naam en functietitel, plus de praktijk', () => {
    const mail = inviteMail({ ...basis, sender })
    expect(mail.html).toContain('Anna Jansen')
    expect(mail.html).toContain('fysiotherapeut')
    expect(mail.html).toContain('Praktijk Voorbeeld')
  })

  it('spreekt de ontvanger aan met de voornaam', () => {
    const mail = inviteMail({ ...basis, sender })
    expect(mail.html).toContain('Hallo Sam')
  })

  it('zet de code-URL in de knop en als terugvallink', () => {
    const mail = inviteMail({ ...basis, sender })
    expect(mail.html).toContain('href="https://getbase.coach/login/code?email=sam%40voorbeeld.nl"')
  })

  it('werkt zonder praktijk, zoals bij een coach', () => {
    const mail = inviteMail({ ...basis, sender: BASE_SENDER })
    expect(mail.html).toContain('BASE')
    expect(mail.html).not.toContain('Praktijk Voorbeeld')
    expect(mail.subject).toBeTruthy()
  })

  it('levert een tekstversie die de link bevat', () => {
    const mail = inviteMail({ ...basis, sender })
    expect(mail.text).toContain('https://getbase.coach/login/code')
  })

  it('escapet de naam van de ontvanger', () => {
    const mail = inviteMail({ ...basis, recipientName: '<script>x</script> Vries', sender })
    expect(mail.html).not.toContain('<script>x</script>')
  })

  it('escapet de voornaam precies een keer', () => {
    // emailShell escapet de heading zelf. Doet inviteMail dat ook, dan leest
    // een naam als D'Hondt in de mailclient als "D&#39;Hondt".
    const mail = inviteMail({ ...basis, recipientName: "D'Hondt", sender })
    expect(mail.html).toContain('Hallo D&#39;Hondt')
    expect(mail.html).not.toContain('&amp;#39;')
  })

  it('houdt regelovergangen uit het onderwerp, ook als de therapeutnaam ze bevat', () => {
    // firstName komt uit auth.updateProfile, waar het schema alleen
    // voor- en naloopwitruimte trimt. Interne regelovergangen kunnen dus
    // gewoon een profielveld in, en gingen tot deze fix rauw het
    // onderwerp in (header-injectierisico).
    const senderMetRegelovergang = resolveSender({
      therapist: { firstName: 'Anna\nBcc: kwaadwillende@voorbeeld.nl', lastName: 'Jansen' },
      practice: {
        name: 'Praktijk Voorbeeld',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
      },
    })
    const mail = inviteMail({ ...basis, sender: senderMetRegelovergang })
    expect(mail.subject).not.toContain('\n')
    expect(mail.subject).not.toContain('\r')
  })

  it('levert een kloppende zin als de therapeut geen naam heeft ingevuld', () => {
    const senderZonderNaam = resolveSender({
      therapist: { firstName: null, lastName: null, jobTitle: null, name: null },
      practice: {
        name: 'Praktijk Voorbeeld',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
      },
    })
    const mail = inviteMail({ ...basis, sender: senderZonderNaam })
    expect(mail.html).not.toContain('">, ')
    expect(mail.html).toContain('Praktijk Voorbeeld heeft een account voor je klaargezet in BASE')
    expect(mail.text).not.toContain('van Praktijk Voorbeeld heeft')
    expect(mail.text).toContain('Praktijk Voorbeeld heeft een account voor je klaargezet in BASE')
  })
})
