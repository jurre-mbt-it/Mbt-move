import { describe, expect, it } from 'vitest'

import { resolveSender } from '../sender'

/**
 * `resolveSender` is de enige plek die beslist of een mail van de praktijk of
 * van BASE komt. Twee gevallen moeten op BASE uitkomen: een coach (die per
 * ontwerp `practiceId = null` heeft, zie AGENTS.md) en een therapeut van wie
 * de praktijkgegevens niet compleet zijn. Anders lekt er een half leeg
 * praktijkblok naar een patiënt.
 */

const complete = {
  name: 'Praktijk Voorbeeld',
  addressLine1: 'Teststraat 1',
  addressLine2: null,
  postalCode: '1234 AB',
  city: 'Testdorp',
  country: 'Nederland',
  phone: '0612345678',
  email: 'info@voorbeeld.nl',
  website: 'voorbeeld.nl',
  logoUrl: null,
  agbCodePractice: '0412345',
  privacyDisclaimer: null,
}

const therapist = { firstName: 'Anna', lastName: 'Jansen', jobTitle: 'fysiotherapeut', name: null }

describe('resolveSender', () => {
  it('levert de praktijk als de gegevens compleet zijn', () => {
    const sender = resolveSender({ therapist, practice: complete })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.displayName).toBe('Praktijk Voorbeeld')
    expect(sender.therapistName).toBe('Anna Jansen')
    expect(sender.replyTo).toBe('info@voorbeeld.nl')
  })

  it('valt terug op BASE als er geen praktijk is, zoals bij een coach', () => {
    const sender = resolveSender({ therapist, practice: null })
    expect(sender.kind).toBe('base')
    expect(sender.displayName).toBe('BASE')
  })

  it('valt terug op BASE als de praktijk geen adres heeft', () => {
    const sender = resolveSender({ therapist, practice: { ...complete, addressLine1: null } })
    expect(sender.kind).toBe('base')
  })

  it('valt terug op BASE als de praktijk geen telefoon en geen mailadres heeft', () => {
    const sender = resolveSender({ therapist, practice: { ...complete, phone: null, email: null } })
    expect(sender.kind).toBe('base')
  })

  it('gebruikt telefoon als er geen mailadres is, en heeft dan geen reply-to', () => {
    const sender = resolveSender({ therapist, practice: { ...complete, email: null } })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.replyTo).toBeNull()
  })

  it('levert een lege therapistName als alle drie de naamvelden leeg zijn', () => {
    // Bereikbaar: admin.ts maakt een therapeut aan met `name: input.name ?? ''`
    // zonder voor- of achternaam, en auth.updateProfile staat
    // firstName: null, lastName: null toe. De praktijk zelf kan dan nog wel
    // bruikbaar zijn.
    const sender = resolveSender({
      therapist: { firstName: null, lastName: null, jobTitle: null, name: null },
      practice: complete,
    })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.therapistName).toBe('')
  })

  it('valt terug op het losse naamveld als voor- en achternaam leeg zijn', () => {
    const sender = resolveSender({
      therapist: { firstName: null, lastName: null, jobTitle: null, name: 'A. Jansen' },
      practice: complete,
    })
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.therapistName).toBe('A. Jansen')
  })

  it('controleert alle doorgeefvelden van practice op PracticeSender', () => {
    const practice = {
      name: 'Praktijk Volledig',
      addressLine1: 'Straatweg 42',
      addressLine2: null,
      postalCode: '5678 CD',
      city: 'Volledigsstad',
      country: 'Nederland',
      phone: '0123456789',
      email: 'contact@volledig.nl',
      website: 'volledig.nl',
      logoUrl: 'https://example.com/logo.png',
      agbCodePractice: '0512345',
      privacyDisclaimer: 'Onze privacybeleid',
    }
    const sender = resolveSender({ therapist, practice })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.phone).toBe('0123456789')
    expect(sender.email).toBe('contact@volledig.nl')
    expect(sender.website).toBe('volledig.nl')
    expect(sender.logoUrl).toBe('https://example.com/logo.png')
    expect(sender.agbCodePractice).toBe('0512345')
    expect(sender.privacyDisclaimer).toBe('Onze privacybeleid')
    expect(sender.jobTitle).toBe('fysiotherapeut')
  })

  it('bouwt adresregels correct op met alle velden', () => {
    const practice = {
      name: 'Praktijk Met Volledig Adres',
      addressLine1: 'Rijksstraat 123',
      addressLine2: 'Begane grond',
      postalCode: '9999 ZZ',
      city: 'Amsterdam',
      country: 'Nederland',
      phone: '0111111111',
      email: 'info@volledig.nl',
      website: null,
      logoUrl: null,
      agbCodePractice: null,
      privacyDisclaimer: null,
    }
    const sender = resolveSender({ therapist, practice })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.addressLines).toEqual(['Rijksstraat 123', 'Begane grond', '9999 ZZ Amsterdam'])
  })

  it('sluit "Nederland" uit van adresregels, met hoofdletterloze variant', () => {
    const practiceWithNederland = {
      name: 'Praktijk Nederland',
      addressLine1: 'Straat 1',
      addressLine2: null,
      postalCode: '1111 AA',
      city: 'Stad',
      country: 'Nederland',
      phone: '0222222222',
      email: 'test@ned.nl',
      website: null,
      logoUrl: null,
      agbCodePractice: null,
      privacyDisclaimer: null,
    }
    const senderNed = resolveSender({ therapist, practice: practiceWithNederland })
    expect(senderNed.kind).toBe('practice')
    if (senderNed.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(senderNed.addressLines).toEqual(['Straat 1', '1111 AA Stad'])

    const practiceWithMinuscule = {
      ...practiceWithNederland,
      country: 'nederland',
    }
    const senderMin = resolveSender({ therapist, practice: practiceWithMinuscule })
    expect(senderMin.kind).toBe('practice')
    if (senderMin.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(senderMin.addressLines).toEqual(['Straat 1', '1111 AA Stad'])

    const practiceWithBuitenland = {
      ...practiceWithNederland,
      country: 'Duitsland',
    }
    const senderBuitenland = resolveSender({ therapist, practice: practiceWithBuitenland })
    expect(senderBuitenland.kind).toBe('practice')
    if (senderBuitenland.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(senderBuitenland.addressLines).toEqual(['Straat 1', '1111 AA Stad', 'Duitsland'])
  })

  it('bouwt adresregels op met alleen straat en plaats', () => {
    const practice = {
      name: 'Praktijk Minimaal',
      addressLine1: 'Minimalweg 1',
      addressLine2: null,
      postalCode: null,
      city: 'Minimalstad',
      country: 'Nederland',
      phone: '0333333333',
      email: 'min@min.nl',
      website: null,
      logoUrl: null,
      agbCodePractice: null,
      privacyDisclaimer: null,
    }
    const sender = resolveSender({ therapist, practice })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.addressLines).toEqual(['Minimalweg 1', 'Minimalstad'])
  })

  it('controleert jobTitle doorgeefveld', () => {
    const practice = {
      name: 'Praktijk Beroep',
      addressLine1: 'Beroepstraat 1',
      addressLine2: null,
      postalCode: '2222 BB',
      city: 'Beroepstad',
      country: 'Nederland',
      phone: '0444444444',
      email: 'job@beroep.nl',
      website: null,
      logoUrl: null,
      agbCodePractice: null,
      privacyDisclaimer: null,
    }
    const therapistSpeciaal = { firstName: 'Peter', lastName: 'Specialist', jobTitle: 'osteopaat', name: null }
    const sender = resolveSender({ therapist: therapistSpeciaal, practice })
    expect(sender.kind).toBe('practice')
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.jobTitle).toBe('osteopaat')
  })
})
