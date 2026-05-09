/**
 * Email-footer voor outgoing mails — rendert praktijk + therapeut info.
 *
 * Stijl-keuze: light background + lime-accent (#BEF264) divider.
 * Reden: bestaande programma-assign mail (de vaakst-verstuurde flow) is
 * lichtgrijs/wit en dat geeft de beste compatibility in Gmail/Outlook/Apple
 * Mail. Dark themes in mail werken nog te onbetrouwbaar (Outlook negeert
 * background-colors, Gmail dwingt soms eigen colors af). De accent-kleur
 * komt uit het MBT brand-palette.
 *
 * Fallback: als de praktijk geen MINIMALE set velden heeft (`name` +
 * `addressLine1` + `city` + (email of phone)), retourneert de helper een
 * lege string. De mail wordt dan zonder footer verstuurd — per spec.
 */

export interface PracticeForFooter {
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

export interface TherapistForFooter {
  firstName?: string | null
  lastName?: string | null
  jobTitle?: string | null
  name?: string | null  // fallback als first/last leeg zijn
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isPracticeUsable(p: PracticeForFooter | null | undefined): p is PracticeForFooter {
  if (!p) return false
  if (!p.name?.trim()) return false
  if (!p.addressLine1?.trim()) return false
  if (!p.city?.trim()) return false
  if (!p.email?.trim() && !p.phone?.trim()) return false
  return true
}

export function renderEmailFooter(opts: {
  therapist: TherapistForFooter
  practice: PracticeForFooter | null | undefined
}): string {
  const { therapist, practice } = opts
  if (!isPracticeUsable(practice)) return ''

  const therapistName = (() => {
    const first = therapist.firstName?.trim()
    const last = therapist.lastName?.trim()
    if (first || last) return [first, last].filter(Boolean).join(' ')
    return therapist.name?.trim() ?? ''
  })()

  const safeTherapistName = therapistName ? escapeHtml(therapistName) : ''
  const safeJobTitle = therapist.jobTitle?.trim() ? escapeHtml(therapist.jobTitle.trim()) : ''
  const safePracticeName = escapeHtml(practice.name!.trim())

  // Adresregel: "addressLine1, postalCode city, country"
  const addressParts: string[] = []
  if (practice.addressLine1) addressParts.push(escapeHtml(practice.addressLine1.trim()))
  if (practice.addressLine2?.trim()) addressParts.push(escapeHtml(practice.addressLine2.trim()))
  const cityLineRaw = [practice.postalCode?.trim(), practice.city?.trim()].filter(Boolean).join(' ')
  if (cityLineRaw) addressParts.push(escapeHtml(cityLineRaw))
  if (practice.country?.trim() && practice.country.trim().toLowerCase() !== 'nederland') {
    addressParts.push(escapeHtml(practice.country.trim()))
  }
  const addressHtml = addressParts.join('<br/>')

  // Contact-regel: telefoon + email + website (alle optional, gescheiden door bullet)
  const contactParts: string[] = []
  if (practice.phone?.trim()) {
    const safe = escapeHtml(practice.phone.trim())
    contactParts.push(`<a href="tel:${safe}" style="color:#0F1516;text-decoration:none;">${safe}</a>`)
  }
  if (practice.email?.trim()) {
    const safe = escapeHtml(practice.email.trim())
    contactParts.push(`<a href="mailto:${safe}" style="color:#0F1516;text-decoration:none;">${safe}</a>`)
  }
  if (practice.website?.trim()) {
    let url = practice.website.trim()
    if (!url.match(/^https?:\/\//i)) url = `https://${url}`
    const safeHref = escapeHtml(url)
    const safeLabel = escapeHtml(url.replace(/^https?:\/\//i, '').replace(/\/$/, ''))
    contactParts.push(`<a href="${safeHref}" style="color:#0F1516;text-decoration:none;">${safeLabel}</a>`)
  }
  const contactHtml = contactParts.join(' &nbsp;·&nbsp; ')

  const safeAgb = practice.agbCodePractice?.trim() ? escapeHtml(practice.agbCodePractice.trim()) : ''
  const safeDisclaimer = practice.privacyDisclaimer?.trim()
    ? escapeHtml(practice.privacyDisclaimer.trim()).replace(/\n/g, '<br/>')
    : ''

  const logoBlock = practice.logoUrl?.trim()
    ? `<img src="${escapeHtml(practice.logoUrl.trim())}" alt="${safePracticeName}" style="max-height:56px;max-width:140px;display:block;margin:0 0 12px;border:0;" />`
    : ''

  // Layout: 2px lime-divider boven, dan logo + therapeut-blok links, praktijk-blok rechts.
  // Gebruik table-layout voor maximale email-client compat (geen flex/grid).
  return `
    <div style="margin-top:32px;padding-top:20px;border-top:2px solid #BEF264;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F1516;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td valign="top" style="padding-right:16px;width:50%;">
            ${logoBlock}
            ${safeTherapistName ? `<p style="margin:0;font-size:14px;font-weight:700;color:#0F1516;">${safeTherapistName}</p>` : ''}
            ${safeJobTitle ? `<p style="margin:2px 0 0;font-size:13px;color:#566060;">${safeJobTitle}</p>` : ''}
          </td>
          <td valign="top" style="padding-left:16px;width:50%;border-left:1px solid #E5E7EB;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0F1516;">${safePracticeName}</p>
            ${addressHtml ? `<p style="margin:0 0 8px;font-size:13px;color:#566060;line-height:1.5;">${addressHtml}</p>` : ''}
            ${contactHtml ? `<p style="margin:0;font-size:13px;color:#0F1516;">${contactHtml}</p>` : ''}
            ${safeAgb ? `<p style="margin:8px 0 0;font-size:12px;color:#7B8889;">AGB-praktijk: ${safeAgb}</p>` : ''}
          </td>
        </tr>
      </table>
      ${safeDisclaimer ? `<p style="margin:16px 0 0;font-size:11px;color:#9CA3AF;line-height:1.5;">${safeDisclaimer}</p>` : ''}
    </div>
  `
}
