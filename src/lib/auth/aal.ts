/**
 * Lees de `aal`-claim ("authenticator assurance level") uit een Supabase
 * access-token. `aal2` = de tweede factor is in déze sessie doorlopen.
 *
 * Geen signature-check hier, en dat mag alleen onder één harde voorwaarde: de
 * aanroeper moet het token al hebben laten verifiëren door `supabase.auth
 * .getUser()` (die vraagt het na bij de Auth-server). Volgorde is dus altijd
 * getUser() → dan getSession() voor het token → dan deze functie.
 *
 * Gebruik NOOIT `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` voor een
 * beveiligingsbeslissing: die leidt het niveau af uit `session.user.factors`,
 * en dat komt rechtstreeks uit de cookie zonder enige verificatie. Iemand die
 * zijn eigen cookie bewerkt kan daarmee "geen tweede factor nodig" claimen.
 */
export function decodeAalClaim(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof json.aal === 'string' ? json.aal : null
  } catch {
    return null
  }
}
