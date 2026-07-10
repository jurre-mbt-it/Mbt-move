/**
 * GET /api/wearable/strava/callback — rondt de Strava OAuth 2.0-koppeling af.
 *
 * Strava redirect hierheen met ?code, ?state (onze HMAC-getekende userId) en
 * ?scope. We verifiëren de state, ruilen de code in voor tokens, bewaren de
 * StravaConnection + WearableConnection(STRAVA), trappen een best-effort eerste
 * sync af, en redirecten via het app-scheme terug naar de app.
 *
 * De sessie zit NIET in deze (browser-)request — daarom draagt de state de
 * userId, getekend met de client-secret. Zie config.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isStravaConfigured, verifyState } from '@/server/wearables/strava/config'
import { exchangeCode } from '@/server/wearables/strava/oauth'
import { syncStravaActivities } from '@/server/wearables/strava/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_SCHEME = 'mbtgym'

function deepLink(status: string, reason?: string): NextResponse {
  const q = reason ? `status=${status}&reason=${reason}` : `status=${status}`
  // Custom scheme → NextResponse.redirect kan lastig doen; zet de header direct.
  return new NextResponse(null, { status: 302, headers: { Location: `${APP_SCHEME}://strava?${q}` } })
}

export async function GET(req: NextRequest) {
  if (!isStravaConfigured()) return deepLink('error', 'not_configured')

  const params = req.nextUrl.searchParams
  if (params.get('error')) return deepLink('error', 'denied')

  const code = params.get('code')
  const userId = verifyState(params.get('state'))
  if (!code || !userId) return deepLink('error', 'invalid_state')

  try {
    const t = await exchangeCode(code)
    const athleteId = t.athlete?.id ? String(t.athlete.id) : null
    if (!athleteId) return deepLink('error', 'no_athlete')
    const expiresAt = new Date(t.expires_at * 1000)
    const scope = params.get('scope')

    await prisma.$transaction([
      prisma.stravaConnection.upsert({
        where: { userId },
        update: { athleteId, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt, scope },
        create: { userId, athleteId, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt, scope },
      }),
      prisma.wearableConnection.upsert({
        where: { userId_provider: { userId, provider: 'STRAVA' } },
        update: { enabled: true },
        create: { userId, provider: 'STRAVA', enabled: true, deviceModel: 'Strava' },
      }),
    ])

    // Best-effort eerste sync; de app triggert 'm ook nog na terugkeer.
    syncStravaActivities(prisma, userId, { days: 30 }).catch(err =>
      console.warn('[strava/callback] initial sync failed', err),
    )

    return deepLink('connected')
  } catch (err) {
    console.error('[strava/callback] failed', err)
    return deepLink('error', 'exchange_failed')
  }
}
