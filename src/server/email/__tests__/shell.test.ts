import { describe, expect, it } from 'vitest'

import { BASE_SENDER, resolveSender } from '../sender'
import { emailShell } from '../shell'

/**
 * De shell is de enige plek met een `<!doctype html>` voor app-mails. Wat hier
 * vastligt: het document is compleet, de afzender staat bovenaan, de knop is
 * optioneel, en de body-HTML gaat er ongewijzigd in. Die laatste is bewust
 * rauw: de aanroeper levert al ge-escapete HTML aan.
 */

const practiceSender = resolveSender({
  therapist: { firstName: 'Anna', lastName: 'Jansen', jobTitle: 'fysiotherapeut' },
  practice: {
    name: 'Praktijk Voorbeeld',
    addressLine1: 'Teststraat 1',
    city: 'Testdorp',
    email: 'info@voorbeeld.nl',
  },
})

describe('emailShell', () => {
  it('levert een compleet HTML-document', () => {
    const html = emailShell({ sender: practiceSender, heading: 'Hallo Sam', bodyHtml: '<p>Test</p>' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).toContain('lang="nl"')
  })

  it('toont de praktijknaam bovenaan, niet de BASE-wordmark', () => {
    const html = emailShell({ sender: practiceSender, heading: 'Hallo Sam', bodyHtml: '' })
    expect(html).toContain('Praktijk Voorbeeld')
  })

  it('toont de BASE-wordmark als er geen praktijk is', () => {
    const html = emailShell({ sender: BASE_SENDER, heading: 'Signaal', bodyHtml: '' })
    expect(html).toContain('BASE')
  })

  it('neemt de body ongewijzigd over', () => {
    const html = emailShell({ sender: BASE_SENDER, heading: 'Kop', bodyHtml: '<p id="x">Inhoud</p>' })
    expect(html).toContain('<p id="x">Inhoud</p>')
  })

  it('rendert een knop als er een cta is meegegeven', () => {
    const html = emailShell({
      sender: BASE_SENDER,
      heading: 'Kop',
      bodyHtml: '',
      cta: { url: 'https://getbase.coach/login', label: 'Inloggen' },
    })
    expect(html).toContain('href="https://getbase.coach/login"')
    expect(html).toContain('Inloggen')
  })

  it('rendert geen knop als er geen cta is', () => {
    const html = emailShell({ sender: BASE_SENDER, heading: 'Kop', bodyHtml: '' })
    expect(html).not.toContain('<a href')
  })

  it('escapet de kop', () => {
    const html = emailShell({ sender: BASE_SENDER, heading: '<script>alert(1)</script>', bodyHtml: '' })
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
