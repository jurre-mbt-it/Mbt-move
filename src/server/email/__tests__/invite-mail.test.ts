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
})
