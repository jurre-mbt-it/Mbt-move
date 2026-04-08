import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { to, patientName, programName, accessCode, startDate } = body

  if (!to || !patientName || !programName || !accessCode) {
    return NextResponse.json({ error: 'Ontbrekende velden' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Graceful failure: log + return success so the UI flow continues
    console.warn('[email/send] RESEND_API_KEY niet geconfigureerd — e-mail niet verstuurd')
    return NextResponse.json({ success: true, sent: false, reason: 'no_api_key' })
  }

  const startFormatted = startDate
    ? new Date(startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Zo snel mogelijk'

  const html = `
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
      <img src="https://mbt-move.nl/Logo.jpg" alt="MBT Gym" style="height: 36px; margin-bottom: 24px;" />
      <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 8px;">Hoi ${patientName} 👋</h2>
      <p style="color: #52525b; margin: 0 0 24px;">
        Jouw therapeut heeft een revalidatieprogramma voor je klaarstaan.
      </p>

      <div style="background: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Programma</p>
        <p style="font-weight: 600; margin: 0 0 12px;">${programName}</p>
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Startdatum</p>
        <p style="font-weight: 600; margin: 0 0 12px;">${startFormatted}</p>
        <p style="font-size: 13px; color: #71717a; margin: 0 0 4px;">Jouw toegangscode</p>
        <p style="font-family: monospace; font-size: 28px; font-weight: 700; color: #1a1a1a; margin: 0; letter-spacing: 2px;">${accessCode}</p>
      </div>

      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mbt-move.nl'}/login/code"
         style="display: inline-block; background: #3ECF6A; color: white; font-weight: 600; padding: 12px 24px; border-radius: 10px; text-decoration: none;">
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
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@mbt-move.nl',
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
