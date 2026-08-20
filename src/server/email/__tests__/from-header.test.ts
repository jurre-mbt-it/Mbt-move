import { describe, expect, it } from 'vitest'

import { BASE_SENDER, resolveSender } from '../sender'
import { buildFromHeader } from '../from-header'

/**
 * De weergavenaam wisselt per praktijk, het adres nooit. Een praktijknaam met
 * een komma of een aanhalingsteken moet ge-quote worden, anders leest een
 * mailserver de komma als scheiding tussen twee ontvangers.
 */

describe('buildFromHeader', () => {
  it('gebruikt de praktijknaam als weergavenaam', () => {
    const sender = resolveSender({
      therapist: { firstName: 'Anna', lastName: 'Jansen' },
      practice: {
        name: 'Praktijk Voorbeeld',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
      },
    })
    expect(buildFromHeader(sender)).toBe('"Praktijk Voorbeeld" <noreply@getbase.coach>')
  })

  it('gebruikt BASE als er geen praktijk is', () => {
    expect(buildFromHeader(BASE_SENDER)).toBe('"BASE" <noreply@getbase.coach>')
  })

  it('escapet aanhalingstekens in de naam', () => {
    const sender = resolveSender({
      therapist: { firstName: 'Anna', lastName: 'Jansen' },
      practice: {
        name: 'Praktijk "De Beweging"',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
      },
    })
    expect(buildFromHeader(sender)).toBe('"Praktijk \\"De Beweging\\"" <noreply@getbase.coach>')
  })

  it('stript regelovergangen uit de naam', () => {
    const sender = resolveSender({
      therapist: { firstName: 'Anna', lastName: 'Jansen' },
      practice: {
        name: 'Praktijk\r\nBcc: aanvaller@voorbeeld.nl',
        addressLine1: 'Teststraat 1',
        city: 'Testdorp',
        email: 'info@voorbeeld.nl',
      },
    })
    expect(buildFromHeader(sender)).not.toContain('\n')
    expect(buildFromHeader(sender)).not.toContain('\r')
  })
})
