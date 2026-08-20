# Transactionele mails herzien: implementatieplan

> **Voor agentic workers:** VERPLICHTE SUB-SKILL: gebruik superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak voor taak uit te voeren. Stappen gebruiken checkbox-syntax (`- [ ]`) voor tracking.

**Doel:** De app-mails van BASE terugbrengen tot één gedeelde template, met de praktijk als afzender voor patiëntmails en BASE als terugval.

**Architectuur:** Twee nieuwe modules onder `src/server/email/`. `sender.ts` beslist wie de afzender is en is de enige plek die het onderscheid praktijk/BASE kent. `shell.ts` rendert het complete document. De drie bestaande templates verliezen hun eigen `<!doctype html>` en paletkopie en roepen de shell aan.

**Tech stack:** TypeScript, Next.js App Router, Prisma, Vitest, Resend HTTP-API.

**Spec:** `docs/superpowers/specs/2026-08-20-transactionele-mails-design.md`

## Globale randvoorwaarden

- Tests draaien met `npm test` (`vitest run`). Alleen bestanden die matchen op `src/**/*.test.ts` worden opgepikt (zie `vitest.config.ts`). Plaats tests in een `__tests__/`-map naast de bron, zoals de rest van de repo.
- Testomgeving is `node`. Geen DOM, geen React in deze tests.
- Alle mail-HTML is tabelgebaseerd. Geen flex, geen grid, geen CSS-variabelen: Outlook rendert die niet.
- Elke waarde die van een gebruiker komt, gaat door `escapeHtml()` voordat hij in HTML belandt.
- Teksten volgen `docs/tone-of-voice.md`. De blacklist is hard: geen em-dashes (—), geen en-dashes (–), geen dubbele streepjes, geen emoji, volledige zinnen, geen holle woorden.
- Het afzenderadres blijft `noreply@getbase.coach`. Alleen de weergavenaam wisselt. Wijzig niets aan DNS of aan `RESEND_API_KEY`.
- Raak `src/lib/shop/email/order-emails.ts` niet aan. De shop valt buiten scope.
- Deze repo is publiek. Zet geen praktijkgegevens, patiëntnamen of andere PII in code, tests of commit-berichten. Gebruik verzonnen voorbeelden.

---

## Bestandsindeling

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/server/email/sender.ts` (nieuw) | Bepaalt uit een gebruiker wie de afzender is: praktijk of BASE. Enige plek met die beslissing. |
| `src/server/email/palette.ts` (nieuw) | Kleuren en `escapeHtml`, gedeeld door shell en footer. Voorkomt een cirkelimport. |
| `src/server/email/shell.ts` (nieuw) | Palet plus `emailShell()`: het complete HTML-document. Enige `<!doctype html>` voor app-mails. |
| `src/server/email/footer.ts` (wijzigen) | Rendert de voettekst voor een afzender. Verliest zijn eigen praktijk-validatie, die verhuist naar `sender.ts`. |
| `src/server/mail.ts` (wijzigen) | `sendMail()` krijgt afzendernaam en reply-to. `layout()` verdwijnt, `inviteMail()` gaat over de shell. |
| `src/app/api/email/send/route.ts` (wijzigen) | Verliest inline layout en paletkopie. |
| `src/server/insights/dispatcher.ts` (wijzigen) | `renderCriticalEmail()` over de shell, met BASE als afzender. |
| `src/server/routers/invite.ts` (wijzigen) | Geeft de echte therapeutnaam en de praktijk door. |

---

## Taak 1: Afzender-resolutie

**Bestanden:**
- Aanmaken: `src/server/email/sender.ts`
- Test: `src/server/email/__tests__/sender.test.ts`

**Interfaces:**
- Consumeert: niets. Dit is de fundering.
- Produceert: `EmailSender`, `PracticeSender`, `BaseSender`, `BASE_SENDER`, `resolveSender()`. Taken 2, 3, 5, 6 en 7 bouwen hierop.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/sender.test.ts`:

```ts
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
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/sender.test.ts`
Verwacht: FAIL, met een melding dat `../sender` niet gevonden wordt.

- [ ] **Stap 3: Schrijf de implementatie**

Maak `src/server/email/sender.ts`:

```ts
/**
 * Bepaalt wie de afzender van een app-mail is.
 *
 * Besluit uit het ontwerp van 2026-08-20: patiëntgerichte mails komen van de
 * praktijk, met BASE als terugval. Die terugval is niet optioneel. Een coach
 * heeft per ontwerp geen praktijk (`practiceId = null`, zie AGENTS.md), en een
 * therapeut kan zijn praktijkgegevens half ingevuld hebben laten staan.
 *
 * Dit is de enige plek die dat onderscheid maakt. De templates krijgen een
 * `EmailSender` en hoeven niet te weten waar die vandaan komt.
 */

export interface PracticeForSender {
  name?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  logoUrl?: string | null
  agbCodePractice?: string | null
  privacyDisclaimer?: string | null
}

export interface TherapistForSender {
  firstName?: string | null
  lastName?: string | null
  jobTitle?: string | null
  name?: string | null
}

export interface PracticeSender {
  kind: 'practice'
  /** Weergavenaam in het `From`-veld en boven in de mail. */
  displayName: string
  logoUrl: string | null
  therapistName: string
  jobTitle: string | null
  /** Adres, al opgesplitst in regels. Leeg als er geen adres is. */
  addressLines: string[]
  phone: string | null
  email: string | null
  website: string | null
  agbCodePractice: string | null
  privacyDisclaimer: string | null
  /** Waar een antwoord heen moet. Null als de praktijk geen mailadres heeft. */
  replyTo: string | null
}

export interface BaseSender {
  kind: 'base'
  displayName: 'BASE'
}

export type EmailSender = PracticeSender | BaseSender

export const BASE_SENDER: BaseSender = { kind: 'base', displayName: 'BASE' }

function trimmed(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t && t.length > 0 ? t : null
}

/**
 * Minimale set voor een bruikbaar praktijkblok: naam, straat, plaats, en een
 * manier om contact op te nemen. Zonder die vier is het blok een halve
 * ondertekening en ziet de patiënt beter BASE.
 */
function isPracticeUsable(p: PracticeForSender | null | undefined): boolean {
  if (!p) return false
  if (!trimmed(p.name)) return false
  if (!trimmed(p.addressLine1)) return false
  if (!trimmed(p.city)) return false
  if (!trimmed(p.email) && !trimmed(p.phone)) return false
  return true
}

function therapistDisplayName(t: TherapistForSender): string {
  const first = trimmed(t.firstName)
  const last = trimmed(t.lastName)
  if (first || last) return [first, last].filter(Boolean).join(' ')
  return trimmed(t.name) ?? ''
}

function addressLines(p: PracticeForSender): string[] {
  const lines: string[] = []
  const street = trimmed(p.addressLine1)
  if (street) lines.push(street)
  const extra = trimmed(p.addressLine2)
  if (extra) lines.push(extra)
  const cityLine = [trimmed(p.postalCode), trimmed(p.city)].filter(Boolean).join(' ')
  if (cityLine) lines.push(cityLine)
  const country = trimmed(p.country)
  if (country && country.toLowerCase() !== 'nederland') lines.push(country)
  return lines
}

export function resolveSender(input: {
  therapist: TherapistForSender
  practice: PracticeForSender | null | undefined
}): EmailSender {
  const { therapist, practice } = input
  if (!isPracticeUsable(practice)) return BASE_SENDER

  const p = practice!
  return {
    kind: 'practice',
    displayName: trimmed(p.name)!,
    logoUrl: trimmed(p.logoUrl),
    therapistName: therapistDisplayName(therapist),
    jobTitle: trimmed(therapist.jobTitle),
    addressLines: addressLines(p),
    phone: trimmed(p.phone),
    email: trimmed(p.email),
    website: trimmed(p.website),
    agbCodePractice: trimmed(p.agbCodePractice),
    privacyDisclaimer: trimmed(p.privacyDisclaimer),
    replyTo: trimmed(p.email),
  }
}
```

- [ ] **Stap 4: Draai de test en bevestig dat hij slaagt**

Draai: `npm test -- src/server/email/__tests__/sender.test.ts`
Verwacht: PASS, zes tests.

- [ ] **Stap 5: Commit**

```bash
git add src/server/email/sender.ts src/server/email/__tests__/sender.test.ts
git commit -m "feat(mail): afzender-resolutie met terugval op BASE"
```

---

## Taak 2: Voettekst per afzender

**Bestanden:**
- Aanmaken: `src/server/email/palette.ts`
- Wijzigen: `src/server/email/footer.ts` (volledig herschreven)
- Test: `src/server/email/__tests__/footer.test.ts`

**Interfaces:**
- Consumeert: `EmailSender` uit taak 1.
- Produceert: `renderFooter(sender: EmailSender): string`. Taak 3 roept dit aan vanuit de shell.

De bestaande `renderEmailFooter()` neemt therapeut plus praktijk en doet zijn eigen validatie. Die validatie zit nu in `sender.ts`, dus de footer wordt simpeler: hij krijgt een afzender en rendert.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/footer.test.ts`:

```ts
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
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/footer.test.ts`
Verwacht: FAIL, `renderFooter` bestaat niet.

- [ ] **Stap 3a: Maak het gedeelde palet**

`shell.ts` gaat straks `renderFooter` uit `footer.ts` importeren, en `footer.ts`
heeft het palet nodig. Zet die gedeelde waarden daarom in een eigen bestand, dan
ontstaat er geen cirkelimport. Maak `src/server/email/palette.ts`:

```ts
/**
 * Kleuren en escaping die zowel de shell als de footer nodig heeft.
 *
 * Staat apart zodat `shell.ts` en `footer.ts` elkaar niet circulair hoeven te
 * importeren. Vóór 2026-08-20 had elk mailtype zijn eigen kopie van deze
 * kleuren, en waren ze al uit elkaar gelopen.
 */

export const EMAIL_PALETTE = {
  bg: '#0E2729',
  surface: '#15363A',
  surfaceHi: '#1C4448',
  ink: '#F5F2ED',
  inkMuted: '#9EB5B3',
  inkDim: '#86A3A1',
  accent: '#E87A55',
  danger: '#E2574C',
  line: 'rgba(212,232,230,0.20)',
} as const

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

- [ ] **Stap 3b: Schrijf de footer**

Vervang de inhoud van `src/server/email/footer.ts`. Behoud de tabelgebaseerde tweekolomsopbouw van de oude versie, want die is getest in Outlook. Verwijder de oude `renderEmailFooter`, `isPracticeUsable`, `PracticeForFooter` en `TherapistForFooter`: die rol zit nu in `sender.ts`.

```ts
/**
 * Voettekst van een app-mail.
 *
 * Krijgt een `EmailSender` en rendert. De beslissing of het de praktijk of
 * BASE wordt is al genomen in `sender.ts`, dus hier staat geen validatie meer.
 *
 * Tafelgebaseerde tweekolomsopbouw (therapeut links, praktijk rechts) omdat
 * Outlook geen flex of grid rendert.
 */
import { EMAIL_PALETTE as P, escapeHtml } from './palette'
import type { EmailSender } from './sender'

function baseFooter(): string {
  return `
    <div style="margin-top:24px;padding-top:18px;border-top:2px solid ${P.accent};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${P.inkMuted};text-transform:uppercase;font-weight:700;">
        BASE
      </div>
    </div>`
}

export function renderFooter(sender: EmailSender): string {
  if (sender.kind === 'base') return baseFooter()

  const name = escapeHtml(sender.displayName)
  const therapistName = sender.therapistName ? escapeHtml(sender.therapistName) : ''
  const jobTitle = sender.jobTitle ? escapeHtml(sender.jobTitle) : ''
  const addressHtml = sender.addressLines.map(escapeHtml).join('<br/>')

  const contactParts: string[] = []
  if (sender.phone) {
    const safe = escapeHtml(sender.phone)
    contactParts.push(`<a href="tel:${safe}" style="color:${P.ink};text-decoration:none;">${safe}</a>`)
  }
  if (sender.email) {
    const safe = escapeHtml(sender.email)
    contactParts.push(`<a href="mailto:${safe}" style="color:${P.ink};text-decoration:none;">${safe}</a>`)
  }
  if (sender.website) {
    const url = sender.website.match(/^https?:\/\//i) ? sender.website : `https://${sender.website}`
    const safeHref = escapeHtml(url)
    const safeLabel = escapeHtml(url.replace(/^https?:\/\//i, '').replace(/\/$/, ''))
    contactParts.push(`<a href="${safeHref}" style="color:${P.ink};text-decoration:none;">${safeLabel}</a>`)
  }
  const contactHtml = contactParts.join(' &nbsp;&#183;&nbsp; ')

  const logoBlock = sender.logoUrl
    ? `<img src="${escapeHtml(sender.logoUrl)}" alt="${name}" style="max-height:48px;max-width:120px;height:auto;width:auto;display:block;margin:0 0 10px;border:0;" />`
    : ''

  const agb = sender.agbCodePractice
    ? `<p style="margin:8px 0 0;font-size:11px;color:${P.inkMuted};">AGB-praktijk: ${escapeHtml(sender.agbCodePractice)}</p>`
    : ''

  const disclaimer = sender.privacyDisclaimer
    ? `<p style="margin:14px 0 0;font-size:11px;color:${P.inkDim};line-height:1.5;">${escapeHtml(sender.privacyDisclaimer).replace(/\n/g, '<br/>')}</p>`
    : ''

  return `
    <div style="margin-top:24px;padding-top:18px;border-top:2px solid ${P.accent};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${P.ink};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td valign="top" style="padding-right:14px;width:50%;">
            ${logoBlock}
            ${therapistName ? `<p style="margin:0;font-size:14px;font-weight:700;color:${P.ink};">${therapistName}</p>` : ''}
            ${jobTitle ? `<p style="margin:2px 0 0;font-size:12px;color:${P.inkMuted};">${jobTitle}</p>` : ''}
          </td>
          <td valign="top" style="padding-left:14px;width:50%;border-left:1px solid ${P.line};">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${P.ink};">${name}</p>
            ${addressHtml ? `<p style="margin:0 0 8px;font-size:12px;color:${P.inkMuted};line-height:1.5;">${addressHtml}</p>` : ''}
            ${contactHtml ? `<p style="margin:0;font-size:12px;color:${P.ink};">${contactHtml}</p>` : ''}
            ${agb}
          </td>
        </tr>
      </table>
      ${disclaimer}
    </div>`
}
```

- [ ] **Stap 4: Draai de test en bevestig dat hij slaagt**

Draai: `npm test -- src/server/email/__tests__/footer.test.ts`
Verwacht: PASS, vier tests. `footer.ts` importeert alleen uit `palette.ts` en `sender.ts`, dus deze taak staat op zichzelf en heeft taak 3 niet nodig.

- [ ] **Stap 5: Commit**

```bash
git add src/server/email/palette.ts src/server/email/footer.ts src/server/email/__tests__/footer.test.ts
git commit -m "refactor(mail): gedeeld palet en footer op basis van een afzender"
```

---

## Taak 3: De gedeelde shell

**Bestanden:**
- Aanmaken: `src/server/email/shell.ts`
- Test: `src/server/email/__tests__/shell.test.ts`

**Interfaces:**
- Consumeert: `EmailSender` uit taak 1, `renderFooter()` uit taak 2.
- Produceert: `EMAIL_PALETTE` en `emailShell(opts): string`. Taken 5, 6 en 7 gebruiken dit.

Let op: `shell.ts` importeert `renderFooter` uit `footer.ts`, en `footer.ts` heeft het palet nodig. Zet het palet en `escapeHtml` daarom in een derde bestand `src/server/email/palette.ts`, waar beide uit importeren. Dat vermijdt een cirkelimport. Dit bestand is al aangemaakt in taak 2.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/shell.test.ts`:

```ts
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
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/shell.test.ts`
Verwacht: FAIL, `../shell` bestaat niet.

- [ ] **Stap 3: Schrijf de implementatie**

Maak `src/server/email/shell.ts`:

```ts
/**
 * De gedeelde huls van elke app-mail.
 *
 * Vóór 2026-08-20 bouwde elk mailtype zijn eigen document, met een eigen
 * paletkopie. Ze waren al uit elkaar gelopen: de uitnodiging zei "BASE", de
 * programma-mail nog "MBT · GYM". Dit is nu de enige plek met een doctype en
 * de enige plek met kleuren.
 *
 * Tabelgebaseerd met width-attributen, want Outlook rendert geen flex of grid.
 */
import { renderFooter } from './footer'
import { EMAIL_PALETTE, escapeHtml } from './palette'
import type { EmailSender } from './sender'

/** Herexport zodat aanroepers één import nodig hebben: shell plus palet. */
export { EMAIL_PALETTE } from './palette'

const P = EMAIL_PALETTE

export interface EmailShellOptions {
  sender: EmailSender
  /** Kop bovenin. Wordt ge-escaped. */
  heading: string
  /** Al ge-escapete HTML van de aanroeper. Gaat rauw in het document. */
  bodyHtml: string
  cta?: { url: string; label: string }
}

export function emailShell(opts: EmailShellOptions): string {
  const { sender, heading, bodyHtml, cta } = opts

  const wordmark = escapeHtml(sender.displayName)

  const ctaBlock = cta
    ? `
        <tr><td style="padding:24px 28px 0 28px;">
          <a href="${escapeHtml(cta.url)}" style="display:block;background:${P.accent};color:${P.bg};text-decoration:none;text-align:center;padding:16px 24px;border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">
            ${escapeHtml(cta.label)}
          </a>
        </td></tr>`
    : ''

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${wordmark}</title>
</head>
<body style="margin:0;padding:0;background:${P.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${P.surface};border:1px solid ${P.line};border-radius:20px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px 28px;">
          <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:11px;letter-spacing:0.2em;color:${P.accent};font-weight:900;">&#9679; ${wordmark}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 0 28px;">
          <h1 style="margin:0;padding:4px 0 0 0;font-size:30px;line-height:36px;font-weight:900;letter-spacing:-1.2px;color:${P.ink};">${escapeHtml(heading)}</h1>
        </td></tr>
        ${bodyHtml}
        ${ctaBlock}
        <tr><td style="padding:4px 28px 28px 28px;">${renderFooter(sender)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
```

- [ ] **Stap 4: Draai beide tests en bevestig dat ze slagen**

Draai: `npm test -- src/server/email/`
Verwacht: PASS, alle tests uit taak 1, 2 en 3.

- [ ] **Stap 5: Commit**

```bash
git add src/server/email/shell.ts src/server/email/__tests__/shell.test.ts
git commit -m "feat(mail): gedeelde shell voor alle app-mails"
```

---

## Taak 4: Afzendernaam en reply-to in sendMail

**Bestanden:**
- Wijzigen: `src/server/mail.ts:31-73` (de `sendMail`-functie)
- Test: `src/server/email/__tests__/from-header.test.ts`

**Interfaces:**
- Consumeert: `EmailSender` uit taak 1.
- Produceert: `buildFromHeader(sender): string`, en `sendMail()` accepteert nu `sender` in `MailMessage`.

Het adres blijft `noreply@getbase.coach`. Alleen de weergavenaam wisselt. Dat vraagt geen DNS-werk: de weergavenaam is vrij op een geverifieerd domein.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/from-header.test.ts`:

```ts
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
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/from-header.test.ts`
Verwacht: FAIL, `../from-header` bestaat niet.

- [ ] **Stap 3: Schrijf de implementatie**

Maak `src/server/email/from-header.ts`:

```ts
/**
 * Bouwt het `From`-veld.
 *
 * Het adres ligt vast op het geverifieerde domein. Alleen de weergavenaam
 * wisselt, en die komt uit gebruikersinvoer: een praktijknaam die iemand zelf
 * heeft ingetypt. Vandaar het quoten en het strippen van regelovergangen. Een
 * newline in een headerveld is de klassieke header-injectie bij mail-API's.
 */
import type { EmailSender } from './sender'

export const MAIL_FROM_ADDRESS = 'noreply@getbase.coach'

export function buildFromHeader(sender: EmailSender): string {
  const name = sender.displayName
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim()
  return `"${name}" <${MAIL_FROM_ADDRESS}>`
}
```

- [ ] **Stap 4: Draai de test en bevestig dat hij slaagt**

Draai: `npm test -- src/server/email/__tests__/from-header.test.ts`
Verwacht: PASS, vier tests.

- [ ] **Stap 5: Koppel het aan sendMail**

Pas `MailMessage` en `sendMail()` in `src/server/mail.ts` aan. Voeg een optionele `sender` toe. Blijft die weg, dan geldt de bestaande `RESEND_FROM`-env als voorheen, zodat de shop-mails en bestaande aanroepen niet breken.

```ts
import { buildFromHeader } from './email/from-header'
import type { EmailSender } from './email/sender'

export interface MailMessage {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  /** Zet afzendernaam en reply-to. Zonder deze valt hij terug op RESEND_FROM. */
  sender?: EmailSender
}
```

En in `sendMail()`, waar nu `const from = process.env.RESEND_FROM ?? ...` staat:

```ts
  const from = msg.sender
    ? buildFromHeader(msg.sender)
    : (process.env.RESEND_FROM ?? 'BASE <noreply@getbase.coach>')

  const replyTo =
    msg.replyTo ?? (msg.sender?.kind === 'practice' ? msg.sender.replyTo ?? undefined : undefined)
```

Gebruik vervolgens `reply_to: replyTo` in de body van het `fetch`-verzoek in plaats van `msg.replyTo`.

- [ ] **Stap 6: Controleer dat het typecheckt**

Draai: `npx tsc --noEmit`
Verwacht: geen fouten.

- [ ] **Stap 7: Commit**

```bash
git add src/server/email/from-header.ts src/server/email/__tests__/from-header.test.ts src/server/mail.ts
git commit -m "feat(mail): afzendernaam per praktijk en reply-to"
```

---

## Taak 5: Uitnodiging over de shell

**Bestanden:**
- Wijzigen: `src/server/mail.ts` (`layout()` verwijderen, `inviteMail()` herschrijven)
- Wijzigen: `src/server/routers/invite.ts:239-246` en `:371-378`
- Test: `src/server/email/__tests__/invite-mail.test.ts`

**Interfaces:**
- Consumeert: `emailShell()` uit taak 3, `EmailSender` uit taak 1.
- Produceert: `inviteMail(opts)` met een nieuwe signatuur. Alleen `invite.ts` roept dit aan.

De tekst komt uit de spec, sectie "Uitnodiging". De therapeut wordt bij naam en functietitel genoemd, en de praktijk erbij. Nu staat er `ctx.user!.email.split('@')[0]`, waardoor een patiënt "jurre heeft je uitgenodigd" leest.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/invite-mail.test.ts`:

```ts
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
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/invite-mail.test.ts`
Verwacht: FAIL, `inviteMail` accepteert nog geen `sender`.

- [ ] **Stap 3: Herschrijf inviteMail**

Verwijder `layout()` en de constante `MBT_BRAND` uit `src/server/mail.ts`. Herschrijf `inviteMail()`:

```ts
export function inviteMail({
  recipientName,
  codeUrl,
  sender,
  expiresAt,
}: {
  recipientName: string
  codeUrl: string
  sender: EmailSender
  expiresAt: Date
}): MailMessage {
  const firstName = recipientName.trim().split(' ')[0] || recipientName.trim()

  const intro =
    sender.kind === 'practice'
      ? `${escapeHtml(sender.therapistName)}${sender.jobTitle ? `, ${escapeHtml(sender.jobTitle)}` : ''} bij ${escapeHtml(sender.displayName)}, heeft een account voor je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het gaat.`
      : 'Er is een account voor je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het gaat.'

  const body = `
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:15px;line-height:22px;">${intro}</p>
    </td></tr>
    <tr><td style="padding:20px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:13px;line-height:19px;">
        Klik op de knop en vul je geboortejaar in. Je krijgt daarna een code van zes cijfers in deze mailbox. Met die code log je in.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <div style="background:rgba(255,255,255,0.04);border:1px solid ${EMAIL_PALETTE.line};border-radius:10px;padding:12px;">
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.14em;color:${EMAIL_PALETTE.inkMuted};font-weight:700;text-transform:uppercase;margin-bottom:6px;">VERLOOPT</div>
        <div style="color:${EMAIL_PALETTE.ink};font-size:14px;font-weight:700;">${formatDate(expiresAt)}</div>
      </div>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:11px;line-height:17px;">
        Werkt de knop niet? Kopieer deze link:<br/>
        <span style="color:${EMAIL_PALETTE.ink};word-break:break-all;">${escapeHtml(codeUrl)}</span>
      </p>
    </td></tr>`

  const subject =
    sender.kind === 'practice' && sender.therapistName
      ? `${sender.therapistName} heeft je uitgenodigd voor BASE`
      : 'Je account voor BASE staat klaar'

  return {
    to: '',
    subject,
    sender,
    html: emailShell({
      sender,
      heading: `Hallo ${escapeHtml(firstName)}`,
      bodyHtml: body,
      cta: { url: codeUrl, label: 'Start onboarding' },
    }),
    text:
      `Hallo ${firstName},\n\n` +
      `${sender.kind === 'practice' ? `${sender.therapistName} van ${sender.displayName} heeft` : 'Er is'} een account voor je klaargezet in BASE.\n\n` +
      `Open deze link en vul je geboortejaar in:\n${codeUrl}\n\n` +
      `Je krijgt daarna een code van zes cijfers in deze mailbox.\n\n` +
      `Verloopt: ${formatDate(expiresAt)}`,
  }
}
```

Voeg bovenaan `mail.ts` toe: `import { emailShell, EMAIL_PALETTE } from './email/shell'` en `import type { EmailSender } from './email/sender'`.

- [ ] **Stap 4: Draai de test en bevestig dat hij slaagt**

Draai: `npm test -- src/server/email/__tests__/invite-mail.test.ts`
Verwacht: PASS, zes tests.

- [ ] **Stap 5: Werk de aanroepers in invite.ts bij**

Op beide plekken (`:239` en `:371`) moet de praktijk meegeladen worden en de echte naam doorgegeven. De query die `ctx.user` ophaalt heeft de praktijk nu niet. Laad die erbij en vervang de aanroep:

```ts
const actor = await ctx.prisma.user.findUnique({
  where: { id: ctx.user!.id },
  select: {
    firstName: true, lastName: true, jobTitle: true, name: true,
    practice: true,
  },
})

const sender = resolveSender({
  therapist: actor ?? {},
  practice: actor?.practice ?? null,
})

const mail = inviteMail({
  recipientName: input.name.trim(),
  codeUrl: instructionUrl,
  sender,
  expiresAt: invite.expiresAt,
})
```

Verwijder de regel `therapistName: ctx.user!.email.split('@')[0],`.

- [ ] **Stap 6: Controleer dat het typecheckt en dat alle tests slagen**

Draai: `npx tsc --noEmit && npm test`
Verwacht: geen typefouten, alle tests groen.

- [ ] **Stap 7: Commit**

```bash
git add src/server/mail.ts src/server/routers/invite.ts src/server/email/__tests__/invite-mail.test.ts
git commit -m "feat(mail): uitnodiging over de gedeelde shell, met echte therapeutnaam"
```

---

## Taak 6: Programma-mail over de shell

**Bestanden:**
- Wijzigen: `src/app/api/email/send/route.ts:120-280` (het hele HTML-blok en de `BRAND`-constante)
- Test: `src/server/email/__tests__/program-mail.test.ts`

**Interfaces:**
- Consumeert: `emailShell()` uit taak 3, `resolveSender()` uit taak 1.
- Produceert: `programMail(opts): { subject: string; html: string }` in een nieuw bestand `src/server/email/program-mail.ts`.

De route bouwt de HTML nu inline, wat hem onnodig lang maakt en niet te testen zonder een HTTP-verzoek. Haal de opbouw eruit naar een pure functie en laat de route alleen nog autoriseren, valideren en versturen.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/program-mail.test.ts`:

```ts
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
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/program-mail.test.ts`
Verwacht: FAIL, `../program-mail` bestaat niet.

- [ ] **Stap 3: Schrijf program-mail.ts**

Maak `src/server/email/program-mail.ts` met een pure functie. Neem de bestaande blokken uit `route.ts` over (`PROGRAMMA`, `STARTDATUM`, `JOUW CODE`, `BERICHT VAN JE THERAPEUT`), maar zonder eigen doctype en zonder eigen palet:

```ts
import { emailShell, EMAIL_PALETTE as P } from './shell'
import { escapeHtml } from './palette'
import type { EmailSender } from './sender'

export interface ProgramMailOptions {
  sender: EmailSender
  patientName: string
  programName: string
  loginUrl: string
  accessCode?: string
  startDate?: string
  extraInstructions?: string
}

export function programMail(opts: ProgramMailOptions): { subject: string; html: string } {
  const { sender, patientName, programName, loginUrl, accessCode, startDate, extraInstructions } = opts

  const firstName = patientName.trim().split(' ')[0] || patientName.trim()
  const startFormatted = startDate
    ? new Date(startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Zo snel mogelijk'

  const instructionsBlock = extraInstructions?.trim()
    ? `
    <tr><td style="padding:20px 28px 0 28px;">
      <div style="background:rgba(232,122,85,0.06);border-left:3px solid ${P.accent};border-radius:8px;padding:14px 16px;">
        <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${P.accent};font-weight:700;text-transform:uppercase;margin-bottom:6px;">BERICHT VAN JE THERAPEUT</div>
        <div style="color:${P.ink};font-size:14px;line-height:1.5;">${escapeHtml(extraInstructions.trim()).replace(/\n/g, '<br/>')}</div>
      </div>
    </td></tr>`
    : ''

  const codeBlock = accessCode
    ? `
    <tr><td style="padding:16px 28px 0 28px;">
      <div style="background:rgba(255,255,255,0.04);border:1px solid ${P.line};border-radius:10px;padding:14px 16px;">
        <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${P.inkMuted};font-weight:700;text-transform:uppercase;margin-bottom:6px;">JOUW CODE</div>
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:24px;font-weight:900;color:${P.ink};letter-spacing:4px;">${escapeHtml(accessCode)}</div>
      </div>
    </td></tr>`
    : ''

  const intro =
    sender.kind === 'practice' && sender.therapistName
      ? `${escapeHtml(sender.therapistName)} heeft een programma voor je klaargezet.`
      : 'Er staat een programma voor je klaar.'

  const body = `
    <tr><td style="padding:14px 28px 0 28px;">
      <p style="margin:0;color:${P.inkMuted};font-size:15px;line-height:22px;">${intro}</p>
    </td></tr>
    ${instructionsBlock}
    <tr><td style="padding:20px 28px 0 28px;">
      <div style="background:${P.surfaceHi};border:1px solid ${P.line};border-radius:12px;padding:16px;">
        <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${P.inkMuted};text-transform:uppercase;font-weight:700;">PROGRAMMA</div>
        <div style="color:${P.ink};font-size:16px;font-weight:700;margin-top:4px;">${escapeHtml(programName)}</div>
        <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${P.inkMuted};text-transform:uppercase;font-weight:700;margin-top:14px;">STARTDATUM</div>
        <div style="color:${P.ink};font-size:14px;font-weight:700;margin-top:4px;">${escapeHtml(startFormatted)}</div>
      </div>
    </td></tr>
    ${codeBlock}`

  return {
    subject: `Je programma staat klaar · ${programName.replace(/[\r\n]+/g, ' ').trim()}`,
    html: emailShell({
      sender,
      heading: `Hallo ${escapeHtml(firstName)}`,
      bodyHtml: body,
      cta: { url: loginUrl, label: accessCode ? 'Inloggen met code' : 'Programma openen' },
    }),
  }
}
```

- [ ] **Stap 4: Draai de test en bevestig dat hij slaagt**

Draai: `npm test -- src/server/email/__tests__/program-mail.test.ts`
Verwacht: PASS, zes tests.

- [ ] **Stap 5: Laat de route de nieuwe functie gebruiken**

In `src/app/api/email/send/route.ts`: verwijder de `BRAND`-constante, de `accessCodeBlock`, `instructionsBlock`, `fallbackFooter`, `footerCell`, de hele `html`-template en de lokale `escapeHtml`. Verwijder ook de import `import { renderEmailFooter } from '@/server/email/footer'`: die functie bestaat niet meer na taak 2, de footer hangt nu onder de shell. Voeg toe: `import { resolveSender } from '@/server/email/sender'`, `import { programMail } from '@/server/email/program-mail'` en `import { sendMail } from '@/server/mail'`. Laat de autorisatie, de rate limit en de zod-validatie ongewijzigd staan. Vervang het opbouw- en verzendgedeelte:

```ts
const sender = resolveSender({ therapist: caller, practice: caller.practice })
const { subject, html } = programMail({
  sender,
  patientName,
  programName,
  loginUrl: `${getAppUrl()}/${accessCode ? 'login/code' : 'login'}`,
  accessCode,
  startDate,
  extraInstructions,
})
const result = await sendMail({ to, subject, html, sender })
if (!result.ok) {
  return NextResponse.json({ success: true, sent: false, reason: 'resend_error' })
}
return NextResponse.json({ success: true, sent: true })
```

Verwijder de directe `fetch` naar `api.resend.com` uit deze route: die loopt nu via `sendMail()`, zodat er één plek is die met Resend praat.

- [ ] **Stap 6: Controleer typecheck en volledige testrun**

Draai: `npx tsc --noEmit && npm test`
Verwacht: geen typefouten, alle tests groen.

- [ ] **Stap 7: Commit**

```bash
git add src/server/email/program-mail.ts src/server/email/__tests__/program-mail.test.ts src/app/api/email/send/route.ts
git commit -m "refactor(mail): programma-mail over de gedeelde shell"
```

---

## Taak 7: Insight-alert over de shell

**Bestanden:**
- Wijzigen: `src/server/insights/dispatcher.ts:14-88` (de `BRAND`-constante en `renderCriticalEmail()`)
- Test: `src/server/email/__tests__/insight-mail.test.ts`

**Interfaces:**
- Consumeert: `emailShell()` uit taak 3, `BASE_SENDER` uit taak 1.
- Produceert: niets voor latere taken. Dit is de laatste.

Besluit uit de spec: deze mail komt van BASE, niet van de praktijk. Hij gaat naar de therapeut zelf en is een werksignaal. De query in `dispatchInsightNotifications` blijft dus ongewijzigd: er is geen praktijk nodig.

- [ ] **Stap 1: Schrijf de falende test**

Maak `src/server/email/__tests__/insight-mail.test.ts`:

```ts
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
  })

  it('houdt de afbakening dat dit geen diagnose is', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.html).toContain('geen diagnose')
  })

  it('levert een tekstversie', () => {
    const mail = renderCriticalEmail(insight, 'Sam de Vries')
    expect(mail.text).toContain('Pijnscore drie sessies boven 5')
  })
})
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

Draai: `npm test -- src/server/email/__tests__/insight-mail.test.ts`
Verwacht: FAIL, `renderCriticalEmail` wordt niet geëxporteerd.

- [ ] **Stap 3: Herschrijf renderCriticalEmail**

Verwijder de `BRAND`-constante uit `dispatcher.ts`. Exporteer `renderCriticalEmail` (nu is het een lokale functie) en laat hem de shell gebruiken:

```ts
import { emailShell, EMAIL_PALETTE as P } from '@/server/email/shell'
import { BASE_SENDER } from '@/server/email/sender'

export function renderCriticalEmail(insight: Insight, patientName: string): {
  subject: string
  html: string
  text: string
} {
  const dashboardUrl = `${getAppUrl()}/therapist/signals`
  const safeTitle = escapeHtml(insight.title)
  const safeSuggestion = escapeHtml(insight.suggestion)
  const safePatientName = escapeHtml(patientName)

  const body = `
    <tr><td style="padding:0 28px 0 28px;">
      <div style="color:${P.danger};font-size:11px;letter-spacing:0.16em;font-weight:900;text-transform:uppercase;margin-bottom:8px;">Kritiek klinisch signaal</div>
      <p style="color:${P.ink};font-size:16px;font-weight:700;margin:0 0 12px 0;">${safeTitle}</p>
      <p style="color:${P.inkMuted};font-size:14px;line-height:1.55;margin:0 0 16px 0;">${safeSuggestion}</p>
      <p style="color:${P.inkMuted};font-size:12px;margin:0 0 16px 0;">Patiënt: <strong style="color:${P.ink};">${safePatientName}</strong></p>
      <p style="color:${P.inkMuted};font-size:12px;line-height:1.55;margin:0;padding:10px 14px;border-left:3px solid ${P.inkMuted};background:${P.surfaceHi};border-radius:6px;">
        Dit is een geautomatiseerd attentiesignaal op basis van vaste regels, geen diagnose en geen behandeladvies. Je eigen klinische oordeel prevaleert.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="color:${P.inkMuted};font-size:11px;line-height:1.55;margin:0;">
        Je krijgt deze melding omdat je behandelend therapeut bent van deze patiënt. Voorkeuren pas je aan via Instellingen, Signalen.
      </p>
    </td></tr>`

  return {
    subject: `[KRITIEK] ${insight.title}`,
    html: emailShell({
      sender: BASE_SENDER,
      heading: 'Kritiek signaal',
      bodyHtml: body,
      cta: { url: dashboardUrl, label: 'Bekijk in dashboard' },
    }),
    text:
      `[KRITIEK] ${insight.title}\n\n${insight.suggestion}\n\nPatiënt: ${patientName}\n\n` +
      `Dit is een geautomatiseerd attentiesignaal op basis van vaste regels, geen diagnose en geen behandeladvies. Je eigen klinische oordeel prevaleert.\n\n` +
      `Bekijk in dashboard: ${dashboardUrl}`,
  }
}
```

De aanroep in `dispatchInsightNotifications` blijft staan zoals hij is, met één toevoeging: geef `sender: BASE_SENDER` mee aan `sendMail()`.

- [ ] **Stap 4: Draai de test en bevestig dat hij slaagt**

Draai: `npm test -- src/server/email/__tests__/insight-mail.test.ts`
Verwacht: PASS, vijf tests.

- [ ] **Stap 5: Controleer dat er geen paletkopieën meer zijn**

Draai: `grep -rn "0E2729" src --include="*.ts" | grep -v "src/lib/shop" | grep -v "src/server/email/shell.ts" | grep -v "src/lib/palette.ts"`
Verwacht: geen resultaten uit `mail.ts`, `dispatcher.ts` of `api/email/send/route.ts`. Componenten onder `src/components` mogen blijven staan, die gaan niet over mail.

- [ ] **Stap 6: Volledige controle**

Draai: `npx tsc --noEmit && npm test && npm run lint`
Verwacht: geen typefouten, alle tests groen, geen lintfouten.

- [ ] **Stap 7: Commit**

```bash
git add src/server/insights/dispatcher.ts src/server/email/__tests__/insight-mail.test.ts
git commit -m "refactor(mail): insight-alert over de gedeelde shell, afzender BASE"
```

---

## Na afloop

Deze stappen zitten bewust niet in de taken hierboven, want ze raken productie of documenten buiten de repo.

- **Prod-env omzetten.** `RESEND_FROM` staat nog op de oude waarde. Na deze wijziging bepaalt `sender` de afzendernaam voor app-mails, maar de shop-mails en eventuele losse aanroepen vallen nog op de env terug. Zet hem op `BASE <noreply@getbase.coach>` en deploy opnieuw. Volgens afspraak gebeurt dat pas op expliciet startsein.
- **Testmail sturen** vanaf een praktijkaccount en vanaf een coachaccount, om beide takken van `resolveSender` één keer echt door Gmail te halen. Let op: Resend meldt op dit domein tijdelijke bounces terwijl de mail wel aankomt, dus controleer de inbox en niet het dashboard.
- **Compliance bijwerken**, buiten deze repo want `compliance/` is gitignored: de omschrijving van de Resend-stroom in `avg-verwerkers.md` regel 27, en het afzenderdomein in de DPIA.
