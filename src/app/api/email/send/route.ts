import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { renderEmailFooter } from '@/server/email/footer'
import { getAppUrl } from '@/lib/app-url'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Verstuurt programma-onboarding mail naar een patient via Resend.
 *
 * SECURITY:
 *  - Vereist een ingelogde therapist (anders open mail-relay vanaf jouw domein).
 *  - Verifieert dat `to` matcht met een patient waar de caller actieve toegang
 *    tot heeft (anders kan een ingelogde therapist nog steeds willekeurige
 *    e-mailadressen aanschrijven via deze branding).
 *  - HTML-escape van alle user-controlled velden in de body.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser?.email) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const caller = await prisma.user.findUnique({
    where: { email: authUser.email },
    include: { practice: true },
  })
  if (!caller || (caller.role !== 'THERAPIST' && caller.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { to, patientName, programName, accessCode, startDate, extraInstructions } = body

  if (!to || !patientName || !programName) {
    return NextResponse.json({ error: 'Ontbrekende velden' }, { status: 400 })
  }
  if (typeof to !== 'string' || typeof patientName !== 'string' ||
      typeof programName !== 'string') {
    return NextResponse.json({ error: 'Ongeldige velden' }, { status: 400 })
  }
  if (accessCode !== undefined && typeof accessCode !== 'string') {
    return NextResponse.json({ error: 'Ongeldige toegangscode' }, { status: 400 })
  }
  if (extraInstructions !== undefined && typeof extraInstructions !== 'string') {
    return NextResponse.json({ error: 'Ongeldige instructies' }, { status: 400 })
  }

  // Caller mag alleen mailen naar een patient waar 'ie aan gekoppeld is
  // (admin mag alles).
  if (caller.role !== 'ADMIN') {
    const target = await prisma.user.findUnique({ where: { email: to } })
    if (!target) {
      return NextResponse.json({ error: 'Onbekende ontvanger' }, { status: 403 })
    }
    const link = await prisma.patientTherapist.findFirst({
      where: {
        therapistId: caller.id,
        patientId: target.id,
        isActive: true,
        status: { in: ['APPROVED', 'PENDING'] },
      },
    })
    if (!link) {
      return NextResponse.json({ error: 'Geen toegang tot deze patiënt' }, { status: 403 })
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email/send] RESEND_API_KEY niet geconfigureerd — e-mail niet verstuurd')
    return NextResponse.json({ success: true, sent: false, reason: 'no_api_key' })
  }

  const startFormatted = startDate
    ? new Date(startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Zo snel mogelijk'

  const safePatientFull = escapeHtml(patientName)
  const safePatientFirst = escapeHtml(patientName.split(' ')[0] || patientName)
  const safeProgram = escapeHtml(programName)
  const safeStart = escapeHtml(startFormatted)
  const safeCode = accessCode ? escapeHtml(accessCode) : null
  const safeInstructions = extraInstructions && extraInstructions.trim()
    ? escapeHtml(extraInstructions.trim()).replace(/\n/g, '<br/>')
    : null

  const loginUrl = `${getAppUrl()}/${safeCode ? 'login/code' : 'login'}`
  const ctaLabel = safeCode ? 'INLOGGEN MET CODE →' : 'PROGRAMMA OPENEN →'

  // Praktijk-footer — leeg als praktijk-gegevens onvolledig zijn (per spec).
  const practiceFooter = renderEmailFooter({
    therapist: {
      firstName: caller.firstName,
      lastName: caller.lastName,
      jobTitle: caller.jobTitle,
      name: caller.name,
    },
    practice: caller.practice,
  })

  // Brand-kleuren — exact dezelfde palette als de rest van de app + de
  // bestaande inviteMail (zie src/server/mail.ts).
  const BRAND = {
    bg: '#0E2729',
    surface: '#15363A',
    surfaceHi: '#1C4448',
    ink: '#F5F2ED',
    inkMuted: '#9EB5B3',
    lime: '#E87A55',
    line: 'rgba(212,232,230,0.20)',
  }

  const accessCodeBlock = safeCode
    ? `
              <tr><td style="padding:16px 28px 0 28px;">
                <div style="background:rgba(255,255,255,0.04);border:1px solid ${BRAND.line};border-radius:10px;padding:14px 16px;">
                  <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${BRAND.inkMuted};font-weight:700;text-transform:uppercase;margin-bottom:6px;">JOUW CODE</div>
                  <div style="font-family:ui-monospace,Menlo,monospace;font-size:24px;font-weight:900;color:${BRAND.ink};letter-spacing:4px;">${safeCode}</div>
                </div>
              </td></tr>`
    : ''

  const instructionsBlock = safeInstructions
    ? `
              <tr><td style="padding:20px 28px 0 28px;">
                <div style="background:rgba(232,122,85,0.06);border-left:3px solid ${BRAND.lime};border-radius:8px;padding:14px 16px;">
                  <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${BRAND.lime};font-weight:700;text-transform:uppercase;margin-bottom:6px;">BERICHT VAN JE THERAPEUT</div>
                  <div style="color:${BRAND.ink};font-size:14px;line-height:1.5;">${safeInstructions}</div>
                </div>
              </td></tr>`
    : ''

  const fallbackFooter = `
            <tr><td style="padding:24px 28px 28px 28px;border-top:1px solid ${BRAND.line};">
              <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${BRAND.inkMuted};text-transform:uppercase;font-weight:700;">
                MOVEMENT BASED THERAPY · movementbasedtherapy.nl
              </div>
            </td></tr>`

  const footerCell = practiceFooter
    ? `<tr><td style="padding:20px 28px 28px 28px;">${practiceFooter}</td></tr>`
    : fallbackFooter

  // Layout volgt dezelfde tafel-gebaseerde structuur als inviteMail in
  // src/server/mail.ts — table + width-attributen voor maximale compat in
  // Outlook / Gmail / Apple Mail. Geen <img> bovenaan: tekst-wordmark "● MBT · GYM"
  // ipv het bestaande Logo.jpg dat werd uitgerekt.
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>MBT·Gym</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:20px;overflow:hidden;">
        <tr><td style="padding:28px 28px 12px 28px;">
          <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:11px;letter-spacing:0.2em;color:${BRAND.lime};font-weight:900;">● MBT · GYM</div>
        </td></tr>

        <tr><td style="padding:8px 28px 0 28px;">
          <h1 style="margin:0;padding:4px 0 0 0;font-size:30px;line-height:36px;font-weight:900;letter-spacing:-1.2px;color:${BRAND.ink};text-transform:uppercase;">
            HALLO ${safePatientFirst}
          </h1>
        </td></tr>

        <tr><td style="padding:14px 28px 0 28px;">
          <p style="margin:0;color:${BRAND.inkMuted};font-size:15px;line-height:22px;">
            Je therapeut heeft een revalidatieprogramma voor je klaargezet.
          </p>
        </td></tr>

        ${instructionsBlock}

        <tr><td style="padding:20px 28px 0 28px;">
          <div style="background:${BRAND.surfaceHi};border:1px solid ${BRAND.line};border-radius:12px;padding:16px;">
            <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${BRAND.inkMuted};text-transform:uppercase;font-weight:700;">PROGRAMMA</div>
            <div style="color:${BRAND.ink};font-size:16px;font-weight:700;margin-top:4px;">${safeProgram}</div>
            <div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${BRAND.inkMuted};text-transform:uppercase;font-weight:700;margin-top:14px;">STARTDATUM</div>
            <div style="color:${BRAND.ink};font-size:14px;font-weight:700;margin-top:4px;">${safeStart}</div>
          </div>
        </td></tr>

        ${accessCodeBlock}

        <tr><td style="padding:24px 28px 0 28px;">
          <a href="${loginUrl}" style="display:block;background:${BRAND.lime};color:${BRAND.bg};text-decoration:none;text-align:center;padding:16px 24px;border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">
            ${ctaLabel}
          </a>
        </td></tr>

        <tr><td style="padding:20px 28px 4px 28px;">
          <p style="margin:0;color:${BRAND.inkMuted};font-size:11px;line-height:17px;">
            Knop werkt niet? Plak deze link in je browser:<br/>
            <span style="color:${BRAND.ink};word-break:break-all;">${escapeHtml(loginUrl)}</span>
          </p>
        </td></tr>

        ${footerCell}
      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Gebruik dezelfde env-var als src/server/mail.ts (RESEND_FROM) zodat
        // afzender-display 1-op-1 matcht met de invite-mail. Default: brand-naam,
        // niet bare email — dat zag de patient als "noreply@mbt-gym.nl".
        from:
          process.env.RESEND_FROM
          ?? process.env.RESEND_FROM_EMAIL
          ?? 'MBT Gym <noreply@mbt-gym.nl>',
        to,
        subject: `Je revalidatieprogramma is klaar · ${programName}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[email/send] Resend fout:', err)
      return NextResponse.json({ success: true, sent: false, reason: 'resend_error' })
    }

    return NextResponse.json({ success: true, sent: true })
  } catch (err) {
    console.error('[email/send] Fetch fout:', err)
    return NextResponse.json({ success: true, sent: false, reason: 'network_error' })
  }
}
