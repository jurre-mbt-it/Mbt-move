/**
 * GET /api/wearable/strava/callback — wisselt de Strava OAuth-code om.
 *
 * Slaat bewust NIETS op: de tokens gaan AES-verzegeld (sealTokens) via de
 * deep-link terug naar de app, die ze als ingelogde gebruiker claimt via
 * `wearables.stravaClaim`. Zo bepaalt de app-sessie — niet een doorstuurbare
 * URL — onder welk account de koppeling landt, en is er geen fire-and-forget
 * werk meer ná de redirect (serverless kan dan bevriezen).
 *
 * De state (HMAC + TTL, uitgegeven aan een ingelogde gebruiker) blijft de
 * geldigheids-poort tegen junk/vervalste callbacks.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isStravaConfigured, sealTokens, verifyState } from '@/server/wearables/strava/config'
import { exchangeCode } from '@/server/wearables/strava/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_SCHEME = 'mbtgym'

function deepLink(params: Record<string, string>): NextResponse {
  const q = new URLSearchParams(params).toString()
  // Custom scheme → NextResponse.redirect kan lastig doen; zet de header direct.
  return new NextResponse(null, { status: 302, headers: { Location: `${APP_SCHEME}://strava?${q}` } })
}

export async function GET(req: NextRequest) {
  if (!isStravaConfigured()) return deepLink({ status: 'error', reason: 'not_configured' })

  const params = req.nextUrl.searchParams
  if (params.get('error')) return deepLink({ status: 'error', reason: 'denied' })

  const code = params.get('code')
  if (!code || !verifyState(params.get('state'))) {
    return deepLink({ status: 'error', reason: 'invalid_state' })
  }

  // Scope-check: zonder activity:read levert elke sync een 401 op — beter hier
  // al weigeren dan een "gekoppelde" maar permanent kapotte verbinding opleveren.
  const scope = params.get('scope')
  if (scope && !/activity:read/.test(scope)) {
    return deepLink({ status: 'error', reason: 'scope' })
  }

  try {
    const t = await exchangeCode(code)
    const athleteId = t.athlete?.id ? String(t.athlete.id) : null
    if (!athleteId) return deepLink({ status: 'error', reason: 'no_athlete' })

    const blob = sealTokens({
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: t.expires_at,
      athleteId,
      scope,
    })
    return deepLink({ status: 'pending', blob })
  } catch (err) {
    console.error('[strava/callback] failed', err)
    return deepLink({ status: 'error', reason: 'exchange_failed' })
  }
}
