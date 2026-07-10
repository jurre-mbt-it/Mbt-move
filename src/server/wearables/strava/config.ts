/**
 * Strava-integratie-config: env-secrets, endpoints, OAuth-state-signing en het
 * verzegelen van de token-handoff.
 *
 * Koppel-flow (claim-model): de app vraagt via tRPC een authorize-URL op
 * (state = HMAC-getekend, TTL) en opent die in de browser. Strava redirect naar
 * onze callback; die wisselt de code om maar slaat NIETS op — de tokens gaan
 * AES-versleuteld (sealTokens) via de deep-link terug naar de app, die ze als
 * ingelogde gebruiker claimt (`wearables.stravaClaim`). Zo landen tokens altijd
 * onder het account dat de flow in de app doorloopt, en kan een doorgestuurde
 * authorize-link nooit andermans Strava onder een aanvaller-account hangen.
 *
 * Env (zet in Vercel + .env.local):
 *   STRAVA_CLIENT_ID     — publieke client-id van de Strava-API-app
 *   STRAVA_CLIENT_SECRET — geheim; nooit naar de client
 *   NEXT_PUBLIC_APP_URL  — basis voor de callback-URL (moet matchen met de
 *                          "Authorization Callback Domain" in de Strava-app)
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

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
  // .trim() vangt een per ongeluk meegekopieerde enter/spatie in de env-waarde
  // op — die zou anders de redirect_uri breken (Strava geeft dan "unexpected error").
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
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

// ── Token-handoff: verzegelde blob callback → app (AES-256-GCM) ─────────────

export type SealedStravaTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number // unix-seconden
  athleteId: string
  scope: string | null
}

const BLOB_TTL_MS = 10 * 60 * 1000

function sealKey(): Buffer {
  return createHash('sha256').update(getStravaConfig().clientSecret).digest()
}

/** Versleutel de tokens voor de deep-link terug naar de app. */
export function sealTokens(t: SealedStravaTokens): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sealKey(), iv)
  const plain = JSON.stringify({ ...t, exp: Date.now() + BLOB_TTL_MS })
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

/** Ontsleutel + valideer de blob; null bij ongeldig/verlopen/geknoeid. */
export function openTokens(blob: string | null | undefined): SealedStravaTokens | null {
  if (!blob) return null
  try {
    const raw = Buffer.from(blob, 'base64url')
    if (raw.length < 12 + 16 + 2) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plain) as SealedStravaTokens & { exp: number }
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.athleteId) return null
    if (!parsed.exp || Date.now() > parsed.exp) return null
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      athleteId: parsed.athleteId,
      scope: parsed.scope ?? null,
    }
  } catch {
    return null
  }
}
