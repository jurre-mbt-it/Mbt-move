/**
 * Groepsdashboard: per atleet één rij met de status in één oogopslag. Pure
 * beoordeling zonder database, zodat de regels (geblesseerd, aandacht,
 * volgorde) getest zijn los van het ophalen. De router in
 * routers/athleteGroups.ts verzamelt de invoer, dit bestand oordeelt.
 * Zie docs/superpowers/specs/2026-09-14-atletengroepen-design.md (Dashboard).
 */

import type { LoadStatusKey } from './training-load'

export type ReadinessBand = 'GREEN' | 'AMBER' | 'RED' | 'LEARNING'

export type LidInvoer = {
  patientId: string
  naam: string
  /** Pijnmeldingen van de laatste 7 dagen, nieuwste eerst. */
  pijn: { nrs: number; location: string; reportedAt: string }[]
  /** Blessurenotitie op het profiel. */
  injuryInfo: string | null
  /** null = geen wearable-data in de laatste 14 dagen. */
  readiness: { band: ReadinessBand; score: number | null } | null
  /** null = nog niets gelogd. */
  vorm: { form: number; statusKey: LoadStatusKey; statusLabel: string; weekLoad: number; calibrated: boolean } | null
  gepland: number
  gedaan: number
  laatste: { at: string; rpe: number | null; feel: number | null; soort: 'kracht' | 'cardio'; sessionId: string | null } | null
  volgende: { at: string; name: string } | null
  notitie: string | null
}

export type LidRij = LidInvoer & {
  status: 'geblesseerd' | 'ok'
  /** Bijv. "Knie links · NRS 6" of de blessurenotitie. */
  statusDetail: string | null
  aandacht: boolean
  aandachtRedenen: string[]
}

/** NRS vanaf dit getal telt als blessure-signaal. */
export const PIJN_DREMPEL = 4

/** Donderdag of later in de week (zondag telt ook): dan is "nog niets gedaan" een signaal. */
export function isDonderdagOfLater(dateKey: string): boolean {
  const dag = new Date(`${dateKey}T12:00:00`).getDay() // 0 = zondag
  return dag === 0 || dag >= 4
}

export function beoordeelLid(i: LidInvoer, vandaag: string): LidRij {
  const pijnlijk = i.pijn.find(p => p.nrs >= PIJN_DREMPEL) ?? null
  const geblesseerd = !!pijnlijk || !!(i.injuryInfo && i.injuryInfo.trim())
  const statusDetail = pijnlijk
    ? `${pijnlijk.location} · NRS ${pijnlijk.nrs}`
    : i.injuryInfo && i.injuryInfo.trim()
      ? i.injuryInfo.trim()
      : null
  const redenen: string[] = []
  if (geblesseerd) redenen.push('Geblesseerd')
  if (i.readiness?.band === 'RED') redenen.push('Herstel rood')
  if (i.vorm?.calibrated && i.vorm.statusKey === 'overreaching') redenen.push('Overreaching-risico')
  if (i.gedaan === 0 && i.gepland >= 2 && isDonderdagOfLater(vandaag)) redenen.push('Nog niets gedaan deze week')
  return { ...i, status: geblesseerd ? 'geblesseerd' : 'ok', statusDetail, aandacht: redenen.length > 0, aandachtRedenen: redenen }
}

/** Wie aandacht vraagt bovenaan, daarbinnen op naam. */
export function sorteerRijen(rijen: LidRij[]): LidRij[] {
  return [...rijen].sort((a, b) => {
    if (a.aandacht !== b.aandacht) return a.aandacht ? -1 : 1
    return a.naam.localeCompare(b.naam, 'nl')
  })
}

export function tellers(rijen: LidRij[]): { aandacht: number; geblesseerd: number; geenWearable: number } {
  return {
    aandacht: rijen.filter(r => r.aandacht).length,
    geblesseerd: rijen.filter(r => r.status === 'geblesseerd').length,
    geenWearable: rijen.filter(r => r.readiness === null).length,
  }
}
