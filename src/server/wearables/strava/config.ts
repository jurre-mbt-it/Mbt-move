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
import {
  decryptAtRest,
  encryptAtRest,
  openJson,
  sealJson,
  sha256Key,
  signState as signStateShared,
  verifyState as verifyStateShared,
} from '@/server/wearables/token-crypto'

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

// ── State signing (HMAC met de client-secret; gedeelde implementatie) ────────

export function signState(userId: string): string {
  return signStateShared(getStravaConfig().clientSecret, userId, STATE_TTL_MS)
}

/** Verifieer de state en geef de userId terug, of null bij ongeldig/verlopen. */
export function verifyState(state: string | null | undefined): string | null {
  return verifyStateShared(getStravaConfig().clientSecret, state)
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
  return sha256Key(getStravaConfig().clientSecret)
}

/** Versleutel de tokens voor de deep-link terug naar de app. */
export function sealTokens(t: SealedStravaTokens): string {
  return sealJson(sealKey(), { ...t }, BLOB_TTL_MS)
}

// ── Token-versleuteling AT REST (AES-256-GCM) ───────────────────────────────
// Strava access/refresh-tokens worden versleuteld in de DB opgeslagen zodat een
// database-dump of backup-lek geen bruikbare `activity:read_all`-tokens
// prijsgeeft. De sleutel leeft alleen in de app-env (afgeleid van de
// client-secret), niet in de database — een DB-lek zonder de env is dus waardeloos.

function atRestKey(): Buffer {
  // Andere afleiding dan sealKey() zodat de at-rest-sleutel en de
  // in-transit-handoff-sleutel niet identiek zijn.
  return sha256Key(`strava-at-rest:${getStravaConfig().clientSecret}`)
}

/** Versleutel een token voor opslag in de DB. */
export function encryptToken(plain: string): string {
  return encryptAtRest(atRestKey(), plain)
}

/**
 * Ontsleutel een uit de DB gelezen token. Backward-compat: rijen van vóór deze
 * wijziging staan als plaintext opgeslagen (geen prefix) en worden ongewijzigd
 * teruggegeven — ze versleutelen vanzelf bij de eerstvolgende token-refresh.
 */
export function decryptToken(stored: string): string {
  return decryptAtRest(atRestKey(), stored)
}

/** Ontsleutel + valideer de blob; null bij ongeldig/verlopen/geknoeid. */
export function openTokens(blob: string | null | undefined): SealedStravaTokens | null {
  const parsed = openJson(sealKey(), blob) as (SealedStravaTokens & { exp: number }) | null
  if (!parsed) return null
  if (!parsed.accessToken || !parsed.refreshToken || !parsed.athleteId) return null
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    athleteId: parsed.athleteId,
    scope: parsed.scope ?? null,
  }
}
