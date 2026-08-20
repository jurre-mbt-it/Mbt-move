import { describe, expect, it } from 'vitest'

import { renderCriticalEmail } from '../../insights/dispatcher'

/**
 * Register 4 uit de stijlgids: cijfers voorop, compact, geen aanloop. De
 * afbakening dat dit geen diagnose is blijft staan, want dat is inhoudelijke
 * informatie over wat de engine wel en niet doet.
 *
 * Deze mail komt van BASE en niet van de praktijk: hij gaat naar de therapeut
 * zelf en is een werksignaal.
 */

const insight = {
  title: 'Pijnscore drie sessies boven 5',
  suggestion: 'Overweeg de belasting een stap terug te zetten en volgende week opnieuw te meten.',
  signalType: 'pain_trend',
  urgency: 'CRITICAL',
  id: 'test-id',
} as never

describe('renderCriticalEmail', () => {
  it('zet de titel in het onderwerp met een scanbaar label', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.subject).toBe('[KRITIEK] Pijnscore drie sessies boven 5')
  })

  it('noemt de patiënt en de suggestie', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.html).toContain('Sam de Vries')
    expect(mail.html).toContain('Overweeg de belasting')
  })

  it('komt van BASE, zonder praktijkblok', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.html).toContain('BASE')
    // De praktijk-footer is een tweekolomstabel (therapeut links, praktijk
    // rechts); `valign="top"` komt alleen daaruit. Zonder deze tegencheck
    // slaagt de test ook als renderCriticalEmail per ongeluk een
    // praktijkblok zou gaan renderen.
    expect(mail.html).not.toContain('valign="top"')
  })

  it('houdt de afbakening dat dit geen diagnose is', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.html).toContain('geen diagnose')
  })

  it('levert een tekstversie', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.text).toContain('Pijnscore drie sessies boven 5')
  })

  it('strip regelovergangen uit het onderwerp', () => {
    const insightWithNewlines = {
      title: 'Pijnscore hoog\nBcc: attacker@example.com',
      suggestion: 'Controleer de situatie.',
      signalType: 'pain_trend',
      urgency: 'CRITICAL',
      id: 'test-id',
    } as never

    const mail = renderCriticalEmail(insightWithNewlines, 'Fictieve Patient')
    expect(mail.subject).not.toContain('\n')
    expect(mail.subject).not.toContain('\r')
    expect(mail.subject).toContain('[KRITIEK]')
    expect(mail.subject).toContain('Pijnscore hoog')
  })

  it('bevat de afsluitende zin in de tekstversie', () => {
    const mail = renderCriticalEmail(insight, 'Fictieve Patient')
    expect(mail.text).toContain('Je krijgt deze melding omdat je behandelend therapeut bent')
    expect(mail.text).toContain('Voorkeuren pas je aan via Instellingen, Signalen')
  })
})
