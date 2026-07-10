/**
 * Strava-integratie-config: env-secrets, endpoints en OAuth-state-signing.
 *
 * De koppeling start vanuit de mobiele app: die vraagt via tRPC een
 * geautoriseerde authorize-URL op (met een HMAC-getekende `state` die de userId
 * draagt), opent die in de browser, en Strava redirect naar onze callback-route.
 * De `state` laat de callback (die géén sessie heeft) veilig weten wélke user
 * koppelt — getekend met de client-secret, dus niet te vervalsen.
 *
 * Env (zet in Vercel + .env.local):
 *   STRAVA_CLIENT_ID     — publieke client-id van de Strava-API-app
 *   STRAVA_CLIENT_SECRET — geheim; nooit naar de client
 *   NEXT_PUBLIC_APP_URL  — basis voor de callback-URL (moet matchen met de
 *                          "Authorization Callback Domain" in de Strava-app)
 */
import { createHmac, timingSafeEqual } from 'crypto'

export const STRAVA_ENDPOINTS = {
  authorize: 'https://www.strava.com/oauth/authorize',
  token: 'https://www.strava.com/oauth/token',
  api: 'https://www.strava.com/api/v3',
} as const

/** Scopes: activiteiten + streams (incl. privé) lezen. */
export const STRAVA_SCOPE = 'activity:read_all'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minuten tussen connect en callback

export function isStravaConfigured(): boolean {
  return !!process.env.STRAVA_CLIENT_ID && !!process.env.STRAVA_CLIENT_SECRET
}

export function getStravaConfig() {
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('strava_not_configured')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/wearable/strava/callback`,
  }
}

/** Bouw de Strava authorize-URL met getekende state (draagt de userId). */
export function buildAuthorizeUrl(userId: string): string {
  const cfg = getStravaConfig()
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state: signState(userId),
  })
  return `${STRAVA_ENDPOINTS.authorize}?${params.toString()}`
}

// ── State signing (HMAC met de client-secret) ────────────────────────────────

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`
  const sig = createHmac('sha256', getStravaConfig().clientSecret).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

/** Verifieer de state en geef de userId terug, of null bij ongeldig/verlopen. */
export function verifyState(state: string | null | undefined): string | null {
  if (!state) return null
  const [payloadB64, sig] = state.split('.')
  if (!payloadB64 || !sig) return null
  let payload: string
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString()
  } catch {
    return null
  }
  const expected = createHmac('sha256', getStravaConfig().clientSecret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [userId, expStr] = payload.split('.')
  if (!userId || !expStr || Date.now() > Number(expStr)) return null
  return userId
}
