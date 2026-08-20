/**
 * Mail-helper.
 *
 * Gebruikt Resend als `RESEND_API_KEY` gezet is. Anders log alleen naar console.
 * Supabase's eigen OTP-mail is een separate kanaal en blijft werken
 * onafhankelijk van deze helper.
 *
 * Setup:
 *   1. Maak gratis account op resend.com
 *   2. Koppel domein (of gebruik resend.dev voor dev/test)
 *   3. Set env-vars in Vercel:
 *        RESEND_API_KEY=re_...
 *        RESEND_FROM="Movement Based Therapy <noreply@mbt-gym.nl>"
 */

import { buildFromHeader } from './email/from-header'
import { emailShell, EMAIL_PALETTE } from './email/shell'
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

export interface MailResult {
  ok: boolean
  provider: 'resend' | 'console'
  id?: string
  error?: string
}

/** Verzend e-mail via Resend of log naar console bij ontbrekende config. */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = msg.sender
    ? buildFromHeader(msg.sender)
    : (process.env.RESEND_FROM ?? 'BASE <noreply@getbase.coach>')

  const replyTo =
    msg.replyTo ?? (msg.sender?.kind === 'practice' ? msg.sender.replyTo ?? undefined : undefined)

  if (!apiKey) {
    // Dev / ontbrekende config — log voor traceability, faal niet
    if (process.env.NODE_ENV !== 'production') {
      console.log('[mail] (dev) to:', msg.to, 'subject:', msg.subject)
    }
    return { ok: true, provider: 'console' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: replyTo,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.warn('[mail] Resend API error:', res.status, errText)
      return { ok: false, provider: 'resend', error: `${res.status}` }
    }

    const body = (await res.json()) as { id?: string }
    return { ok: true, provider: 'resend', id: body.id }
  } catch (err) {
    console.warn('[mail] Resend fetch failed:', (err as Error).message)
    return { ok: false, provider: 'resend', error: (err as Error).message }
  }
}

// ─── Branded templates ──────────────────────────────────────────────────────

/**
 * Invite-mail die de patiënt verwijst naar `/login/code`. De 6-cijfer code
 * zelf komt uit Supabase's eigen OTP-mail (apart kanaal); deze mail is
 * puur onboarding-instructie + branding. Loopt over de gedeelde shell, zodat
 * de therapeut en praktijk consistent met de andere app-mails getoond worden.
 */
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
      heading: `Hallo ${firstName}`,
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

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(d: Date): string {
  return d.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
