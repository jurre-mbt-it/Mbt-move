/**
 * Behandelstatus in gewone taal.
 *
 * De reden waarom een patiënt op inactief staat komt als enum uit de database
 * (`CareDischargeReason`). Die woorden staan op drie plekken in beeld: de
 * keuzelijst in de afsluitdialoog, de badge in de patiëntenlijst en de banner
 * op het dossier. Eén bron zodat die drie niet uit elkaar lopen.
 *
 * BEHANDELSTATUS IS NIET PROGRAMMASTATUS. Een programma kan afgerond of
 * gearchiveerd zijn terwijl de behandeling gewoon loopt, en andersom. De
 * woorden hieronder gaan uitsluitend over de behandeling.
 */

export const DISCHARGE_REASONS = [
  'COMPLETED',
  'DISCONTINUED',
  'TRANSFERRED',
  'NO_SHOW',
  'OTHER',
] as const

export type DischargeReason = (typeof DISCHARGE_REASONS)[number]

/** Label voor de keuzelijst: wat je kiest bij het afsluiten. */
export const DISCHARGE_REASON_LABEL: Record<DischargeReason, string> = {
  COMPLETED: 'Behandeling afgerond',
  DISCONTINUED: 'Voortijdig gestopt',
  TRANSFERRED: 'Doorverwezen of overgedragen',
  NO_SHOW: 'Niet meer verschenen',
  OTHER: 'Anders',
}

/**
 * Zelfde reden, maar teruglezend geformuleerd voor de banner en de lijst. In de
 * keuzelijst kies je een handeling, in het dossier lees je een stand van zaken.
 */
export const DISCHARGE_REASON_TERUGLEZEND: Record<DischargeReason, string> = {
  COMPLETED: 'behandeling afgerond',
  DISCONTINUED: 'voortijdig gestopt',
  TRANSFERRED: 'doorverwezen of overgedragen',
  NO_SHOW: 'niet meer verschenen',
  OTHER: 'reden: anders',
}

/**
 * De enum-waarde uit de database omzetten naar tekst. Onbekende waarden (een
 * nieuwe reden die de server al kent en deze bundel nog niet) vallen terug op
 * de ruwe waarde in plaats van op een lege badge.
 */
export function dischargeReasonTekst(reason: string | null | undefined): string | null {
  if (!reason) return null
  return DISCHARGE_REASON_TERUGLEZEND[reason as DischargeReason] ?? reason
}

/** Datum zoals hij in de banner en de archieflijst staat: 4 mei 2026. */
export function formatDischargeDate(at: Date | string | null | undefined): string | null {
  if (!at) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}
