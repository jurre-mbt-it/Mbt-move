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

  // Valideer CTA-URL tegen http(s)-schema. Een niet-http URL kan alleen een
  // programmeerfout zijn. Een mail die niet verstuurd wordt is beter dan een
  // mail met een javascript: of data: link erin.
  if (cta && !/^https?:\/\//i.test(cta.url)) {
    throw new Error(`emailShell: cta.url moet met http:// of https:// beginnen, kreeg "${cta.url}"`)
  }

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
