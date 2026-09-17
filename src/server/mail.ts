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
    // Dev / ontbrekende config: log voor traceability, faal niet
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
 * Uitnodigingsmail met één ondertekende link (`/uitnodiging/<token>`). Op een
 * telefoon opent die de BASE-app en logt de patiënt meteen in; op een
 * computer kan hij in de browser verder. Geen code en geen geboortejaar meer
 * in dit pad: dat bleef als terugvaloptie bestaan op `/login/code`.
 * Loopt over de gedeelde shell, zodat de therapeut en praktijk consistent met
 * de andere app-mails getoond worden.
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
    sender.kind === 'practice' && sender.therapistName
      ? `${escapeHtml(sender.therapistName)}${sender.jobTitle ? `, ${escapeHtml(sender.jobTitle)}` : ''} bij ${escapeHtml(sender.displayName)}, heeft een account voor je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het gaat.`
      : sender.kind === 'practice'
        ? `${escapeHtml(sender.displayName)} heeft een account voor je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het gaat.`
        : 'Er is een account voor je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het gaat.'

  const body = `
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:15px;line-height:22px;">${intro}</p>
    </td></tr>
    <tr><td style="padding:20px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:13px;line-height:19px;">
        Open deze mail op je telefoon en klik op de knop. De link opent de BASE-app en je bent meteen ingelogd. Nog geen app? De pagina achter de knop wijst je naar de App Store. Op een computer kun je in de browser verder.
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

  // Strip regelovergangen uit de therapeutnaam: die komt uit een vrij
  // invulbaar profielveld en gaat rauw het onderwerp in. Regelovergangen in
  // een headerveld kunnen header-injectie mogelijk maken.
  const subject =
    sender.kind === 'practice' && sender.therapistName
      ? `${sender.therapistName.replace(/[\r\n]+/g, ' ').trim()} heeft je uitgenodigd voor BASE`
      : 'Je account voor BASE staat klaar'

  return {
    to: '',
    subject,
    sender,
    html: emailShell({
      sender,
      heading: `Hallo ${firstName}`,
      bodyHtml: body,
      cta: { url: codeUrl, label: 'Open de uitnodiging' },
    }),
    text:
      `Hallo ${firstName},\n\n` +
      `${
        sender.kind === 'practice' && sender.therapistName
          ? `${sender.therapistName} van ${sender.displayName} heeft`
          : sender.kind === 'practice'
            ? `${sender.displayName} heeft`
            : 'Er is'
      } een account voor je klaargezet in BASE.\n\n` +
      `Open deze link op je telefoon; hij opent de BASE-app en logt je meteen in:\n${codeUrl}\n\n` +
      `Op een computer kun je in de browser verder.\n\n` +
      `Verloopt: ${formatDate(expiresAt)}`,
  }
}

/**
 * Mail aan een atleet die aan een groep is toegevoegd. Eén knop: eruit
 * stappen. Wie erin wil blijven hoeft niets te doen. De knop werkt zonder
 * login (ondertekende link), en in de app en het portaal kan het later ook.
 */
export function groupAddedMail({
  recipientName,
  groupName,
  planName,
  byName,
  leaveUrl,
  sender,
}: {
  recipientName: string
  groupName: string
  planName: string | null
  byName: string
  leaveUrl: string
  sender: EmailSender
}): MailMessage {
  const firstName = recipientName.trim().split(' ')[0] || recipientName.trim()
  const kalenderNaam = (planName ?? '').trim() || groupName
  const door = byName.replace(/[\r\n]+/g, ' ').trim()

  const body = `
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:15px;line-height:22px;">
        ${escapeHtml(door)} heeft je toegevoegd aan de groep <strong style="color:${EMAIL_PALETTE.ink};">${escapeHtml(groupName)}</strong>.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:13px;line-height:19px;">
        Trainingen die voor deze groep worden gepland, komen in je kalender te staan als
        <strong style="color:${EMAIL_PALETTE.ink};">Onderdeel van ${escapeHtml(kalenderNaam)}</strong>.
        Je eigen schema blijft gewoon staan.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:13px;line-height:19px;">
        Wil je niet in deze groep? Dan haal je jezelf eruit met de knop hieronder. Dat kan later ook altijd via je profiel in de app. Wil je erin blijven, dan hoef je niets te doen.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:11px;line-height:17px;">
        Werkt de knop niet? Kopieer deze link:<br/>
        <span style="color:${EMAIL_PALETTE.ink};word-break:break-all;">${escapeHtml(leaveUrl)}</span>
      </p>
    </td></tr>`

  return {
    to: '',
    subject: `${door} heeft je toegevoegd aan ${groupName.replace(/[\r\n]+/g, ' ').trim()}`,
    sender,
    html: emailShell({
      sender,
      heading: `Hallo ${firstName}`,
      bodyHtml: body,
      cta: { url: leaveUrl, label: 'Uit de groep stappen' },
    }),
    text:
      `Hallo ${firstName},\n\n` +
      `${door} heeft je toegevoegd aan de groep ${groupName}.\n\n` +
      `Trainingen die voor deze groep worden gepland, komen in je kalender te staan als "Onderdeel van ${kalenderNaam}". Je eigen schema blijft gewoon staan.\n\n` +
      `Wil je niet in deze groep? Haal jezelf eruit via deze link:\n${leaveUrl}\n\n` +
      `Dat kan later ook altijd via je profiel in de app. Wil je erin blijven, dan hoef je niets te doen.`,
  }
}

/** Korte melding aan de eigenaar van de groep als een lid zichzelf eruit haalt. Altijd namens BASE. */
export function groupLeftMail({
  ownerName,
  memberName,
  groupName,
  groupUrl,
}: {
  ownerName: string
  memberName: string
  groupName: string
  groupUrl: string
}): MailMessage {
  const firstName = ownerName.trim().split(' ')[0] || ownerName.trim()
  const lid = memberName.replace(/[\r\n]+/g, ' ').trim()
  const groep = groupName.replace(/[\r\n]+/g, ' ').trim()
  const sender: EmailSender = { kind: 'base', displayName: 'BASE' }

  const body = `
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:15px;line-height:22px;">
        ${escapeHtml(lid)} heeft zichzelf uit de groep <strong style="color:${EMAIL_PALETTE.ink};">${escapeHtml(groep)}</strong> gehaald.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      <p style="margin:0;color:${EMAIL_PALETTE.inkMuted};font-size:13px;line-height:19px;">
        De trainingen die al in de kalender stonden, blijven staan. Nieuwe groepsverzendingen gaan niet meer naar dit lid.
      </p>
    </td></tr>`

  return {
    to: '',
    subject: `${lid} is uit ${groep} gestapt`,
    sender,
    html: emailShell({ sender, heading: `Hallo ${firstName}`, bodyHtml: body, cta: { url: groupUrl, label: 'Bekijk de groep' } }),
    text:
      `Hallo ${firstName},\n\n` +
      `${lid} heeft zichzelf uit de groep ${groep} gehaald. De trainingen die al in de kalender stonden, blijven staan. Nieuwe groepsverzendingen gaan niet meer naar dit lid.\n\n` +
      `Bekijk de groep: ${groupUrl}`,
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
