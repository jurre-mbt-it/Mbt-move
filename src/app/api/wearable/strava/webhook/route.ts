/**
 * /api/wearable/strava/webhook — Strava Webhook Events.
 *
 *   GET  — subscription-validatie (hub.challenge), eenmalig bij het aanmaken
 *          van de subscription via scripts/strava-webhook-setup.ts.
 *   POST — activity/athlete-events. Strava wil binnen 2 s een 200; we
 *          antwoorden direct en verwerken het event in `after()`. Dispatch
 *          zit in src/server/wearables/strava/webhook.ts (testbaar). De
 *          dagelijkse strava-sync-cron is het vangnet voor gemiste events.
 *
 * Env: STRAVA_WEBHOOK_VERIFY_TOKEN (zelfgekozen geheim, zie strava/config.ts).
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RATE_LIMITS, rateLimit } from '@/server/ratelimit'
import {
  handleStravaWebhookEvent,
  stravaSubscriptionChallenge,
  type StravaWebhookEvent,
} from '@/server/wearables/strava/webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const r = stravaSubscriptionChallenge(req.nextUrl.searchParams, process.env.STRAVA_WEBHOOK_VERIFY_TOKEN)
  return NextResponse.json(r.body, { status: r.status })
}

export async function POST(req: NextRequest) {
  let ev: StravaWebhookEvent
  try {
    ev = (await req.json()) as StravaWebhookEvent
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (ev.owner_id == null) return NextResponse.json({ ok: true, handled: false })

  // Events zijn ongesigneerd: een verzonnen owner_id kan hooguit een sync
  // van die atleet triggeren (met diens eigen token, idempotent), maar wél
  // Strava's applicatie-brede quota opbranden. Per atleet begrenzen.
  const rl = await rateLimit('wearables.stravaWebhook', String(ev.owner_id), RATE_LIMITS.stravaWebhook)
  if (!rl.ok) return NextResponse.json({ ok: true, handled: false, throttled: true })

  after(async () => {
    try {
      const res = await handleStravaWebhookEvent(prisma, ev)
      if (res.handled) console.info('[strava/webhook]', ev.object_type, ev.aspect_type, res.action)
    } catch (err) {
      // Detail blijft server-side; de cron haalt de activiteit later alsnog op.
      console.error('[strava/webhook] failed', ev.object_type, ev.aspect_type, err)
    }
  })
  return NextResponse.json({ ok: true })
}
