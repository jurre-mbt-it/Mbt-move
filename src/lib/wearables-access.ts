/**
 * Uitrol-gate voor de wearable-integratie.
 *
 * De native iOS-bridge is live, dus de Apple-Watch-functie staat nu open voor
 * ADMIN, THERAPEUT en ATLEET — elk voor de eigen watch-data (readiness, slaap,
 * vitals, belasting, stress). Voor THERAPEUT geldt daarnaast de bestaande
 * per-patiënt-autorisatie (`hasWearableAccess`: PatientTherapist-koppeling OF
 * zelfde praktijk) voor het inzien van patiëntdata — die staat los van deze gate.
 * Dit is de ÉNE plek om te verbreden: voeg 'PATIENT' toe zodra patiënten hun
 * eigen watch mogen koppelen. Server (router + API-routes) én client
 * (dashboard-tegels, therapeut-tab, mobiele health-tab) lezen allemaal deze gate.
 */
export const WEARABLES_ALLOWED_ROLES = ['ADMIN', 'THERAPIST', 'ATHLETE'] as const

export function wearablesEnabledForRole(role: string | null | undefined): boolean {
  return !!role && (WEARABLES_ALLOWED_ROLES as readonly string[]).includes(role)
}
