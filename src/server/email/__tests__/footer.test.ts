import { describe, expect, it } from 'vitest'

import { BASE_SENDER, resolveSender } from '../sender'
import { renderFooter } from '../footer'

/**
 * De footer is de plek waar de ontvanger ziet van wie de mail komt. Twee
 * dingen moeten kloppen: praktijkgegevens komen erin, en alles wat een
 * gebruiker heeft ingetypt wordt ge-escaped. Een praktijknaam met een
 * apostrof of een kleiner-dan-teken mag de mail niet openbreken.
 */

const practiceSender = resolveSender({
  therapist: { firstName: 'Anna', lastName: 'Jansen', jobTitle: 'fysiotherapeut', name: null },
  practice: {
    name: 'Praktijk Voorbeeld',
    addressLine1: 'Teststraat 1',
    postalCode: '1234 AB',
    city: 'Testdorp',
    phone: '0612345678',
    email: 'info@voorbeeld.nl',
    website: 'voorbeeld.nl',
    agbCodePractice: '0412345',
  },
})

describe('renderFooter', () => {
  it('zet naam, therapeut, adres en contact in de praktijk-footer', () => {
    const html = renderFooter(practiceSender)
    expect(html).toContain('Praktijk Voorbeeld')
    expect(html).toContain('Anna Jansen')
    expect(html).toContain('fysiotherapeut')
    expect(html).toContain('Teststraat 1')
    expect(html).toContain('1234 AB Testdorp')
    expect(html).toContain('info@voorbeeld.nl')
    expect(html).toContain('0412345')
  })

  it('maakt van een website zonder protocol een bruikbare link', () => {
    const html = renderFooter(practiceSender)
    expect(html).toContain('href="https://voorbeeld.nl"')
  })

  it('rendert de BASE-footer als er geen praktijk is', () => {
    const html = renderFooter(BASE_SENDER)
    expect(html).toContain('BASE')
    expect(html).not.toContain('Praktijk Voorbeeld')
  })

  it('rendert het logo als afbeelding en toont de privacy-disclaimer', () => {
    const sender = resolveSender({
      therapist: { firstName: 'Anna', lastName: 'Jansen', jobTitle: 'fysiotherapeut', name: null },
      practice: {
        name: 'Praktijk Met Logo',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
        logoUrl: 'https://voorbeeld.nl/logo.png',
        privacyDisclaimer: 'Wij delen je gegevens niet met derden.',
      },
    })
    const html = renderFooter(sender)
    expect(html).toContain('<img src="https://voorbeeld.nl/logo.png"')
    expect(html).toContain('Wij delen je gegevens niet met derden.')
  })

  it('escapet gebruikersinvoer in de praktijknaam', () => {
    const sender = resolveSender({
      therapist: { firstName: 'Anna', lastName: 'Jansen' },
      practice: {
        name: 'Praktijk <script>alert(1)</script>',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
      },
    })
    const html = renderFooter(sender)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
