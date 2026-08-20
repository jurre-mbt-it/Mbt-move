/**
 * Programma-onboarding mail: de therapeut heeft een revalidatieprogramma
 * klaargezet en de patiënt krijgt een link (en eventueel een inlogcode) om
 * het te openen.
 *
 * Pure functie zodat de route (`/api/email/send`) alleen nog hoeft te
 * autoriseren, valideren en versturen. Bouwt verder op de gedeelde shell uit
 * taak 3 en de afzenderresolutie uit taak 1.
 */
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
      heading: `Hallo ${firstName}`,
      bodyHtml: body,
      cta: { url: loginUrl, label: accessCode ? 'Inloggen met code' : 'Programma openen' },
    }),
  }
}
