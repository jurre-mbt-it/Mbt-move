import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { renderEmailFooter } from '@/server/email/footer'

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

  const safePatient = escapeHtml(patientName)
  const safeProgram = escapeHtml(programName)
  const safeStart = escapeHtml(startFormatted)
  const safeCode = accessCode ? escapeHtml(accessCode) : null
  const safeInstructions = extraInstructions && extraInstructions.trim()
    ? escapeHtml(extraInstructions.trim()).replace(/\n/g, '<br/>')
    : null

  const accessCodeBlock = safeCode
    ? `
        <p style="font-size: 13px; color: #71717a; margin: 12px 0 4px;">Jouw toegangscode</p>
        <p style="font-family: monospace; font-size: 28px; font-weight: 700; color: #1a1a1a; margin: 0; letter-spacing: 2px;">${safeCode}</p>`
    : ''

  const instructionsBlock = safeInstructions
    ? `
      <div style="background: rgba(78,205,196,0.10); border-left: 3px solid #4ECDC4; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
        <p style="font-size: 12px; color: #4ECDC4; font-weight: 600; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Bericht van je therapeut</p>
        <p style="color: #1a1a1a; margin: 0; line-height: 1.5;">${safeInstructions}</p>
      </div>`
    : ''

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mbt-gym.nl'}/${safeCode ? 'login/code' : 'login'}`
  const ctaLabel = safeCode ? 'Inloggen met toegangscode' : 'Inloggen en programma openen'

  // Praktijk-footer — leeg als praktijk-gegevens onvolledig zijn (per spec).
  // Mail wordt dan zonder footer verstuurd; therapeut ziet daarvoor een
  // waarschuwing in de UI.
  const practiceFooter = renderEmailFooter({
    therapist: {
      firstName: caller.firstName,
      lastName: caller.lastName,
      jobTitle: caller.jobTitle,
      name: caller.name,
    },
    practice: caller.practice,
  })

  const html = `
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
      <img src="https://mbt-gym.nl/Logo.jpg" alt="MBT Gym" style="height: 36px; margin-bottom: 24px;" />
      <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 8px;">Hoi ${safePatient}</h2>
      <p style="color: #52525b; margin: 0 0 24px;">
        Jouw therapeut heeft een revalidatieprogramma voor je klaarstaan.
      </p>

      ${instructionsBlock}

      <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Programma</p>
        <p style="font-weight: 600; margin: 0 0 12px;">${safeProgram}</p>
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Startdatum</p>
        <p style="font-weight: 600; margin: 0;">${safeStart}</p>${accessCodeBlock}
      </div>

      <a href="${loginUrl}"
         style="display: inline-block; background: #4ECDC4; color: white; font-weight: 600; padding: 12px 24px; border-radius: 10px; text-decoration: none;">
        ${ctaLabel}
      </a>

      ${practiceFooter || `
      <p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;">
        Neem contact op met je therapeut voor vragen.
      </p>
      `}
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@mbt-gym.nl',
        to,
        subject: `Je revalidatieprogramma is klaar — ${programName}`,
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
