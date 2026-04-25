import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

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

  const caller = await prisma.user.findUnique({ where: { email: authUser.email } })
  if (!caller || (caller.role !== 'THERAPIST' && caller.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { to, patientName, programName, accessCode, startDate } = body

  if (!to || !patientName || !programName || !accessCode) {
    return NextResponse.json({ error: 'Ontbrekende velden' }, { status: 400 })
  }
  if (typeof to !== 'string' || typeof patientName !== 'string' ||
      typeof programName !== 'string' || typeof accessCode !== 'string') {
    return NextResponse.json({ error: 'Ongeldige velden' }, { status: 400 })
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
  const safeCode = escapeHtml(accessCode)
  const safeStart = escapeHtml(startFormatted)

  const html = `
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
      <img src="https://mbt-gym.nl/Logo.jpg" alt="MBT Gym" style="height: 36px; margin-bottom: 24px;" />
      <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 8px;">Hoi ${safePatient}</h2>
      <p style="color: #52525b; margin: 0 0 24px;">
        Jouw therapeut heeft een revalidatieprogramma voor je klaarstaan.
      </p>

      <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Programma</p>
        <p style="font-weight: 600; margin: 0 0 12px;">${safeProgram}</p>
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Startdatum</p>
        <p style="font-weight: 600; margin: 0 0 12px;">${safeStart}</p>
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Jouw toegangscode</p>
        <p style="font-family: monospace; font-size: 28px; font-weight: 700; color: #1a1a1a; margin: 0; letter-spacing: 2px;">${safeCode}</p>
      </div>

      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mbt-gym.nl'}/login/code"
         style="display: inline-block; background: #4ECDC4; color: white; font-weight: 600; padding: 12px 24px; border-radius: 10px; text-decoration: none;">
        Inloggen met toegangscode
      </a>

      <p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;">
        MBT Gym · Clinician Portal · Neem contact op met je therapeut voor vragen.
      </p>
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
