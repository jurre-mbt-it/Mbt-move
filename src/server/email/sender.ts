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
