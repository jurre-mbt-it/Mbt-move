/**
 * GET /api/wearable/polar/callback — wisselt de Polar OAuth-code om.
 *
 * Slaat bewust NIETS op: de tokens gaan AES-verzegeld (sealPolarTokens) via de
 * deep-link terug naar de app, die ze als ingelogde gebruiker claimt via
 * `wearables.polarClaim`. Zo bepaalt de app-sessie — niet een doorstuurbare
 * URL — onder welk account de koppeling landt (zelfde claim-model als Strava).
 *
 * De state (HMAC + TTL, uitgegeven aan een ingelogde gebruiker) blijft de
 * geldigheids-poort tegen junk/vervalste callbacks.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isPolarConfigured, sealPolarTokens, verifyPolarState } from '@/server/wearables/polar/config'
import { exchangeCode } from '@/server/wearables/polar/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_SCHEME = 'mbtgym'

function deepLink(params: Record<string, string>): NextResponse {
  const q = new URLSearchParams(params).toString()
  // Custom scheme → NextResponse.redirect kan lastig doen; zet de header direct.
  return new NextResponse(null, { status: 302, headers: { Location: `${APP_SCHEME}://polar?${q}` } })
}

export async function GET(req: NextRequest) {
  if (!isPolarConfigured()) return deepLink({ status: 'error', reason: 'not_configured' })

  const params = req.nextUrl.searchParams
  if (params.get('error')) return deepLink({ status: 'error', reason: 'denied' })

  const code = params.get('code')
  if (!code || !verifyPolarState(params.get('state'))) {
    return deepLink({ status: 'error', reason: 'invalid_state' })
  }

  try {
    const t = await exchangeCode(code)
    // x_user_id is de sleutel voor webhook-lookups; zonder is de koppeling
    // onbruikbaar — beter hier al weigeren.
    if (!t.x_user_id) return deepLink({ status: 'error', reason: 'no_user' })

    const blob = sealPolarTokens({
      accessToken: t.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + t.expires_in,
      polarUserId: String(t.x_user_id),
    })
    return deepLink({ status: 'pending', blob })
  } catch (err) {
    console.error('[polar/callback] failed', err)
    return deepLink({ status: 'error', reason: 'exchange_failed' })
  }
}
