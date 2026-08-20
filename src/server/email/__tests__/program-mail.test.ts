import { describe, expect, it } from 'vitest'

import { resolveSender } from '../sender'
import { programMail } from '../program-mail'

/**
 * Deze mail droeg tot 2026-08-20 nog de wordmark "MBT · GYM" terwijl de rest
 * van de app al BASE heette. Wat hier vastligt: de afzender is de praktijk,
 * de optionele blokken verschijnen alleen als ze gevuld zijn, en het bericht
 * van de therapeut wordt ge-escaped maar behoudt zijn regelovergangen.
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
  sender,
  patientName: 'Sam de Vries',
  programName: 'Achillespees fase 2',
  loginUrl: 'https://getbase.coach/login',
}

describe('programMail', () => {
  it('noemt programma en praktijk', () => {
    const mail = programMail(basis)
    expect(mail.html).toContain('Achillespees fase 2')
    expect(mail.html).toContain('Praktijk Voorbeeld')
  })

  it('draagt de oude MBT-wordmark niet meer', () => {
    const mail = programMail(basis)
    expect(mail.html).not.toContain('MBT · GYM')
    expect(mail.html).not.toContain('MBT&#183;Gym')
  })

  it('toont het codeblok alleen als er een code is', () => {
    expect(programMail(basis).html).not.toContain('JOUW CODE')
    expect(programMail({ ...basis, accessCode: '481920' }).html).toContain('481920')
  })

  it('toont het therapeutbericht alleen als het gevuld is', () => {
    expect(programMail(basis).html).not.toContain('BERICHT VAN JE THERAPEUT')
    const met = programMail({ ...basis, extraInstructions: 'Rustig opbouwen.' })
    expect(met.html).toContain('Rustig opbouwen.')
  })

  it('behoudt regelovergangen in het therapeutbericht maar escapet de rest', () => {
    const mail = programMail({ ...basis, extraInstructions: 'Regel 1\nRegel <b>2</b>' })
    expect(mail.html).toContain('Regel 1<br/>Regel &lt;b&gt;2&lt;/b&gt;')
  })

  it('houdt regelovergangen uit het onderwerp', () => {
    const mail = programMail({ ...basis, programName: 'Fase 2\r\nBcc: x@y.nl' })
    expect(mail.subject).not.toContain('\n')
    expect(mail.subject).not.toContain('\r')
  })
})
