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

export interface MailMessage {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
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
  const from = process.env.RESEND_FROM ?? 'Movement Based Therapy <noreply@mbt-gym.nl>'

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
        reply_to: msg.replyTo,
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

const MBT_BRAND = {
  bg: '#0A0E0F',
  surface: '#141A1B',
  ink: '#F5F7F6',
  inkMuted: '#7B8889',
  lime: '#BEF264',
  line: 'rgba(255,255,255,0.12)',
}

function layout(innerHtml: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>MBT·Gym</title>
</head>
<body style="margin:0;padding:0;background:${MBT_BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MBT_BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${MBT_BRAND.surface};border:1px solid ${MBT_BRAND.line};border-radius:20px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px 28px;">
          <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:11px;letter-spacing:0.2em;color:${MBT_BRAND.lime};font-weight:900;">● MBT · GYM</div>
        </td></tr>
        ${innerHtml}
        <tr><td style="padding:20px 28px 28px 28px;border-top:1px solid ${MBT_BRAND.line};">
          <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${MBT_BRAND.inkMuted};text-transform:uppercase;font-weight:700;">
            MOVEMENT BASED THERAPY · movementbasedtherapy.nl
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Invite-mail die de patiënt verwijst naar `/login/code`. De 6-cijfer code
 * zelf komt uit Supabase's eigen OTP-mail (apart kanaal); deze mail is
 * puur onboarding-instructie + branding.
 */
export function inviteMail({
  recipientName,
  codeUrl,
  therapistName,
  expiresAt,
}: {
  recipientName: string
  codeUrl: string
  therapistName?: string
  expiresAt: Date
}): MailMessage {
  const therapistLine = therapistName
    ? `<strong style="color:${MBT_BRAND.ink};">${escapeHtml(therapistName)}</strong> heeft je uitgenodigd`
    : 'Je bent uitgenodigd'

  const inner = `
    <tr><td style="padding:8px 28px 0 28px;">
      <h1 style="margin:0;padding:4px 0 0 0;font-size:32px;line-height:38px;font-weight:900;letter-spacing:-1.5px;color:${MBT_BRAND.ink};text-transform:uppercase;">
        HALLO ${escapeHtml(recipientName.split(' ')[0] || '')}
      </h1>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${MBT_BRAND.inkMuted};font-size:15px;line-height:22px;">
        ${therapistLine} voor MBT·Gym — onze begeleide trainings-app.
      </p>
    </td></tr>
    <tr><td style="padding:24px 28px 0 28px;">
      <a href="${codeUrl}" style="display:block;background:${MBT_BRAND.lime};color:${MBT_BRAND.bg};text-decoration:none;text-align:center;padding:16px 24px;border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">
        START ONBOARDING →
      </a>
    </td></tr>
    <tr><td style="padding:20px 28px 0 28px;">
      <p style="margin:0;color:${MBT_BRAND.inkMuted};font-size:13px;line-height:19px;">
        Klik op de knop en vul je <strong style="color:${MBT_BRAND.ink};">geboortejaar</strong> in. We sturen dan direct een 6-cijfer code naar deze mail. Die code heb je nodig om in te loggen.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <div style="background:rgba(255,255,255,0.04);border:1px solid ${MBT_BRAND.line};border-radius:10px;padding:12px;">
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.14em;color:${MBT_BRAND.inkMuted};font-weight:700;text-transform:uppercase;margin-bottom:6px;">VERLOOPT</div>
        <div style="color:${MBT_BRAND.ink};font-size:14px;font-weight:700;">${formatDate(expiresAt)}</div>
      </div>
    </td></tr>
    <tr><td style="padding:16px 28px 20px 28px;">
      <p style="margin:0;color:${MBT_BRAND.inkMuted};font-size:11px;line-height:17px;">
        Knop werkt niet? Kopieer deze link:<br/>
        <span style="color:${MBT_BRAND.ink};word-break:break-all;">${escapeHtml(codeUrl)}</span>
      </p>
    </td></tr>
  `

  return {
    to: '', // gevuld door caller
    subject: therapistName
      ? `${therapistName} heeft je uitgenodigd voor MBT·Gym`
      : 'Welkom bij MBT·Gym',
    html: layout(inner),
    text:
      `Hallo ${recipientName},\n\n` +
      `${therapistName ? `${therapistName} heeft je uitgenodigd` : 'Je bent uitgenodigd'} voor MBT·Gym.\n\n` +
      `Open deze link en vul je geboortejaar in:\n${codeUrl}\n\n` +
      `We sturen daarna een 6-cijfer code naar deze mail.\n\n` +
      `Verloopt: ${formatDate(expiresAt)}\n\n` +
      `Movement Based Therapy — movementbasedtherapy.nl`,
  }
}

function escapeHtml(s: string): string {
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
