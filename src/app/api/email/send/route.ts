import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getAppUrl } from '@/lib/app-url'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { resolveSender } from '@/server/email/sender'
import { programMail } from '@/server/email/program-mail'
import { sendMail } from '@/server/mail'

// Zelfde soort caps als de tRPC-inputs: begrensde velden zodat een
// gecompromitteerd account geen multi-megabyte-mails door Resend pompt.
const bodySchema = z.object({
  to: z.string().email().max(320),
  patientName: z.string().min(1).max(200),
  programName: z.string().min(1).max(200),
  accessCode: z.string().max(50).optional(),
  startDate: z.string().max(40).optional(),
  extraInstructions: z.string().max(2000).optional(),
})

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

  // Identiteit op supabaseUserId, niet op e-mailadres — anders kan iemand die
  // zich met een therapeut-adres registreert deze mail-relay gebruiken
  // (audit 2026-07-27, H2).
  const caller = await prisma.user.findUnique({
    where: { supabaseUserId: authUser.id },
    include: { practice: true },
  })
  if (!caller || (caller.role !== 'THERAPIST' && caller.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = await rateLimit('emailSend', caller.id, RATE_LIMITS.emailSend)
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldige of ontbrekende velden' }, { status: 400 })
  }
  const { to, patientName, programName, accessCode, startDate, extraInstructions } = parsed.data

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

  const sender = resolveSender({ therapist: caller, practice: caller.practice })
  const { subject, html } = programMail({
    sender,
    patientName,
    programName,
    loginUrl: `${getAppUrl()}/${accessCode ? 'login/code' : 'login'}`,
    accessCode,
    startDate,
    extraInstructions,
  })
  const result = await sendMail({ to, subject, html, sender })
  if (!result.ok) {
    return NextResponse.json({ success: true, sent: false, reason: 'resend_error' })
  }
  return NextResponse.json({ success: true, sent: true })
}
