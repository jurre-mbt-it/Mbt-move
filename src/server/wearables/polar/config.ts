/**
 * Polar AccessLink-integratie-config: env-secrets, endpoints, OAuth-state en
 * het verzegelen van de token-handoff.
 *
 * Koppel-flow (claim-model, identiek aan Strava): de app vraagt via tRPC een
 * authorize-URL op (state = HMAC-getekend, TTL) en opent die in de browser.
 * Polar redirect naar onze callback; die wisselt de code om maar slaat NIETS
 * op — de tokens gaan AES-verzegeld (sealPolarTokens) via de deep-link terug
 * naar de app, die ze als ingelogde gebruiker claimt (`wearables.polarClaim`).
 * Zo landen tokens altijd onder het account dat de flow in de app doorloopt.
 *
 * Polar-eigenaardigheid: het access-token is langlevend (~1 jaar) en er is
 * GEEN refresh-token. Verloopt of vervalt het (401/403), dan moet de
 * gebruiker opnieuw koppelen (PolarConnection.needsReauth).
 *
 * Env (zet in Vercel + .env.local):
 *   POLAR_CLIENT_ID     — client-id uit admin.polaraccesslink.com
 *   POLAR_CLIENT_SECRET — geheim; nooit naar de client
 *   NEXT_PUBLIC_APP_URL — basis voor de callback-URL (moet exact matchen met
 *                         de "Authorization redirect URL" in de Polar-admin)
 */
import {
  decryptAtRest,
  encryptAtRest,
  openJson,
  sealJson,
  sha256Key,
  signState,
  verifyState,
} from '@/server/wearables/token-crypto'

export const POLAR_ENDPOINTS = {
  authorize: 'https://flow.polar.com/oauth2/authorization',
  token: 'https://polarremote.com/v2/oauth2/token',
  api: 'https://www.polaraccesslink.com/v3',
} as const

export const POLAR_SCOPE = 'accesslink.read_all'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minuten tussen connect en callback
const BLOB_TTL_MS = 10 * 60 * 1000

export function isPolarConfigured(): boolean {
  return !!process.env.POLAR_CLIENT_ID && !!process.env.POLAR_CLIENT_SECRET
}

export function getPolarConfig() {
  const clientId = process.env.POLAR_CLIENT_ID
  const clientSecret = process.env.POLAR_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('polar_not_configured')
  // .trim() vangt een per ongeluk meegekopieerde enter/spatie in de env-waarde
  // op — die zou anders de redirect_uri breken (zelfde valkuil als bij Strava).
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '')
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/wearable/polar/callback`,
  }
}

/** Bouw de Polar authorize-URL met getekende state (draagt de userId). */
export function buildAuthorizeUrl(userId: string): string {
  const cfg = getPolarConfig()
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: POLAR_SCOPE,
    state: signState(cfg.clientSecret, userId, STATE_TTL_MS),
  })
  return `${POLAR_ENDPOINTS.authorize}?${params.toString()}`
}

/** Verifieer de state en geef de userId terug, of null bij ongeldig/verlopen. */
export function verifyPolarState(state: string | null | undefined): string | null {
  return verifyState(getPolarConfig().clientSecret, state)
}

// ── Token-handoff: verzegelde blob callback → app ───────────────────────────

export type SealedPolarTokens = {
  accessToken: string
  expiresAt: number // unix-seconden (~1 jaar na koppelen)
  polarUserId: string // x_user_id uit de token-respons
}

function sealKey(): Buffer {
  return sha256Key(getPolarConfig().clientSecret)
}

/** Versleutel de tokens voor de deep-link terug naar de app. */
export function sealPolarTokens(t: SealedPolarTokens): string {
  return sealJson(sealKey(), { ...t }, BLOB_TTL_MS)
}

/** Ontsleutel + valideer de blob; null bij ongeldig/verlopen/geknoeid. */
export function openPolarTokens(blob: string | null | undefined): SealedPolarTokens | null {
  const parsed = openJson(sealKey(), blob) as (SealedPolarTokens & { exp: number }) | null
  if (!parsed) return null
  if (!parsed.accessToken || !parsed.polarUserId || !parsed.expiresAt) return null
  return {
    accessToken: parsed.accessToken,
    expiresAt: parsed.expiresAt,
    polarUserId: parsed.polarUserId,
  }
}

// ── Token-versleuteling AT REST ─────────────────────────────────────────────

function atRestKey(): Buffer {
  // Andere afleiding dan sealKey() (en dan Strava's sleutels) zodat de
  // at-rest-sleutel en de in-transit-handoff-sleutel niet identiek zijn.
  return sha256Key(`polar-at-rest:${getPolarConfig().clientSecret}`)
}

/** Versleutel een token voor opslag in de DB. */
export function encryptPolarToken(plain: string): string {
  return encryptAtRest(atRestKey(), plain)
}

/** Ontsleutel een uit de DB gelezen token (plaintext passthrough voor legacy). */
export function decryptPolarToken(stored: string): string {
  return decryptAtRest(atRestKey(), stored)
}
