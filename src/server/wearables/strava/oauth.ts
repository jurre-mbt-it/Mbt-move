/**
 * Strava OAuth 2.0 token-uitwisseling + refresh, en een helper die altijd een
 * geldig access-token teruggeeft (refresht + persisteert bij verlopen).
 */
import type { PrismaClient } from '@prisma/client'
import { getStravaConfig, STRAVA_ENDPOINTS } from './config'

export type StravaTokens = {
  access_token: string
  refresh_token: string
  expires_at: number // unix-seconden
  athlete?: { id: number }
}

async function tokenRequest(body: Record<string, string>): Promise<StravaTokens> {
  const res = await fetch(STRAVA_ENDPOINTS.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`strava_token_${res.status}`)
  return (await res.json()) as StravaTokens
}

/** Ruil de OAuth-code in voor tokens (na de autorisatie-redirect). */
export function exchangeCode(code: string): Promise<StravaTokens> {
  const cfg = getStravaConfig()
  return tokenRequest({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
  })
}

/** Vernieuw het access-token met het refresh-token. */
export function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const cfg = getStravaConfig()
  return tokenRequest({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

type Db = Pick<PrismaClient, 'stravaConnection'>

/**
 * Geef een geldig access-token voor een user; refresht + persisteert als het
 * verlopen is (of binnen 60s verloopt). Gooit als er geen koppeling is.
 */
export async function getValidAccessToken(prisma: Db, userId: string): Promise<string> {
  const conn = await prisma.stravaConnection.findUnique({ where: { userId } })
  if (!conn) throw new Error('strava_not_connected')

  if (conn.expiresAt.getTime() - Date.now() > 60_000) return conn.accessToken

  const t = await refreshTokens(conn.refreshToken)
  await prisma.stravaConnection.update({
    where: { userId },
    data: {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: new Date(t.expires_at * 1000),
    },
  })
  return t.access_token
}

/** Geauthenticeerde GET naar de Strava-API (v3). */
export async function stravaGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${STRAVA_ENDPOINTS.api}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`strava_api_${res.status}_${path}`)
  return (await res.json()) as T
}
