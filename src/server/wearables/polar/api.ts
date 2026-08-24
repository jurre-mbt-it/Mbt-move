/**
 * Polar AccessLink API-client: token-exchange, gebruikersregistratie en de
 * geauthenticeerde GET-helper.
 *
 * Polar geeft GEEN refresh-token: het access-token leeft ~1 jaar en daarna
 * (of na intrekken) is opnieuw koppelen de enige route. 401/403 wordt daarom
 * als `PolarAuthError` onderscheiden zodat de sync `needsReauth` kan zetten
 * in plaats van eindeloos te blijven proberen.
 */
import { getPolarConfig, POLAR_ENDPOINTS } from './config'

/** Token verlopen/ingetrokken of consent ingetrokken — opnieuw koppelen nodig. */
export class PolarAuthError extends Error {}

export type PolarTokenResponse = {
  access_token: string
  expires_in: number // seconden (~31535999 ≈ 1 jaar)
  x_user_id: number // Polar Ecosystem user-id
}

/** Ruil de OAuth-code in voor een token (na de autorisatie-redirect). */
export async function exchangeCode(code: string): Promise<PolarTokenResponse> {
  const cfg = getPolarConfig()
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const res = await fetch(POLAR_ENDPOINTS.token, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json;charset=UTF-8',
    },
    // redirect_uri moet mee omdat hij ook in de authorize-stap is meegegeven.
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }),
  })
  if (!res.ok) throw new Error(`polar_token_${res.status}`)
  return (await res.json()) as PolarTokenResponse
}

/**
 * Registreer de gebruiker bij Polar (verplicht ná OAuth, vóór data-calls).
 * `memberId` is ons pseudoniem voor deze gebruiker (random UUID — bewust niet
 * het interne user-id). 409 = al geregistreerd bij ons → stil ok, gebeurt bij
 * opnieuw koppelen van dezelfde account.
 */
export async function registerPolarUser(accessToken: string, memberId: string): Promise<void> {
  const res = await fetch(`${POLAR_ENDPOINTS.api}/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ 'member-id': memberId }),
  })
  if (res.ok || res.status === 409) return
  if (res.status === 401 || res.status === 403) throw new PolarAuthError(`polar_auth_${res.status}`)
  throw new Error(`polar_register_${res.status}`)
}

/**
 * De-registreer de gebruiker bij Polar (trekt ook het token in). Best-effort:
 * loskoppelen in de app mag nooit stranden op een Polar-storing, dus fouten
 * worden alleen gelogd.
 */
export async function deregisterPolarUser(accessToken: string, polarUserId: string): Promise<void> {
  try {
    const res = await fetch(`${POLAR_ENDPOINTS.api}/users/${encodeURIComponent(polarUserId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      console.warn(`[polar] deregistratie gaf ${res.status} — token blijft mogelijk actief aan Polar-zijde`)
    }
  } catch (err) {
    console.warn('[polar] deregistratie mislukt', err)
  }
}

/**
 * Geauthenticeerde GET naar de AccessLink-API. 204/404 = geen data → null
 * (Polar geeft 204 op lege lijsten en 404 op datums zonder meting).
 */
export async function polarGet<T>(accessToken: string, path: string): Promise<T | null> {
  const res = await fetch(`${POLAR_ENDPOINTS.api}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (res.status === 204 || res.status === 404) return null
  // 401/403 → de aanroeper zet needsReauth zodat de UI "opnieuw koppelen" toont.
  if (res.status === 401 || res.status === 403) throw new PolarAuthError(`polar_auth_${res.status}`)
  if (!res.ok) throw new Error(`polar_api_${res.status}_${path}`)
  return (await res.json()) as T
}
