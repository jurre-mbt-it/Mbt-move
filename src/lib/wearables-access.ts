/**
 * Uitrol-gate voor de wearable-integratie.
 *
 * Voorlopig is de Apple-Watch-functie ALLEEN beschikbaar voor de admin —
 * de native iOS-bridge is nog niet live, dus we tonen 'm aan niemand anders.
 * Dit is de ÉNE plek om te verbreden: voeg rollen toe aan
 * `WEARABLES_ALLOWED_ROLES` (of laat de functie `true` teruggeven) zodra het
 * voor patiënt/atleet/therapeut open mag. Server (router + API-routes) én
 * client (dashboard-tegels, therapeut-tab) lezen allemaal deze gate.
 */
export const WEARABLES_ALLOWED_ROLES = ['ADMIN'] as const

export function wearablesEnabledForRole(role: string | null | undefined): boolean {
  return !!role && (WEARABLES_ALLOWED_ROLES as readonly string[]).includes(role)
}
