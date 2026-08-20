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
