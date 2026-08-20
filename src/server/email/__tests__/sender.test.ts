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

  it('valt terug op het losse naamveld als voor- en achternaam leeg zijn', () => {
    const sender = resolveSender({
      therapist: { firstName: null, lastName: null, jobTitle: null, name: 'A. Jansen' },
      practice: complete,
    })
    if (sender.kind !== 'practice') throw new Error('verwachtte praktijk')
    expect(sender.therapistName).toBe('A. Jansen')
  })
})
