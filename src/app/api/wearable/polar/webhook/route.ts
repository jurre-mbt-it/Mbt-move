/**
 * POST /api/wearable/polar/webhook — push-notificaties van Polar AccessLink.
 *
 * Polar stuurt hier events (EXERCISE, SLEEP, CONTINUOUS_HEART_RATE,
 * ACTIVITY_SUMMARY) zodra een gebruiker synct; wij pullen dan gericht de
 * verse data. Signatuur-verificatie en dispatch zitten in
 * src/server/wearables/polar/webhook.ts (testbaar). De dagelijkse
 * polar-sync-cron is het vangnet voor gemiste events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePolarWebhookEvent, verifyPolarSignature, type PolarWebhookBody } from '@/server/wearables/polar/webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let body: PolarWebhookBody
  try {
    body = JSON.parse(raw) as PolarWebhookBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // PING komt bij het aanmaken van de webhook, vóórdat wij het secret kennen —
  // moet altijd 200 krijgen, anders weigert Polar de webhook te registreren.
  if (body.event === 'PING') return NextResponse.json({ ok: true })

  const secret = process.env.POLAR_WEBHOOK_SECRET
  if (!secret) {
    // Webhook bestaat maar het secret is (nog) niet geconfigureerd: niets
    // verwerken, wel 200 — anders deactiveert Polar de webhook na 7 dagen.
    console.warn('[polar/webhook] POLAR_WEBHOOK_SECRET ontbreekt; event genegeerd')
    return NextResponse.json({ ok: true })
  }
  if (!verifyPolarSignature(raw, req.headers.get('polar-webhook-signature'), secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  try {
    const result = await handlePolarWebhookEvent(prisma, body)
    return NextResponse.json({ ok: true, handled: result.handled })
  } catch (err) {
    // 500 → Polar probeert opnieuw; detail blijft server-side (geen
    // info-disclosure van interne foutstrings).
    console.error('[polar/webhook] failed', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
