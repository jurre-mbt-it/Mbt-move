import type { CustomParameter } from '@/components/programs/types'

// Let op: geen "Pauze"-param hier — rusttijd is een vast veld op de kaart
// (restTime). Een tweede "Pauze" als extra param zorgde voor dubbele,
// tegenstrijdige invoer. Bestaande programma's met een oude Pauze-param
// blijven gewoon renderen (params zijn data, dit is alleen het aanbod).
export const STANDARD_PARAMS = [
  { label: 'Tempo',        type: 'text'   as const, unit: '',     placeholder: '3-1-2-0' },
  { label: 'RPE',          type: 'slider' as const, unit: '/10',  min: 1, max: 10 },
  { label: 'Gewicht',      type: 'number' as const, unit: 'kg',   min: 0 },
  { label: 'Afstand',      type: 'number' as const, unit: 'm',    min: 0 },
  { label: 'Hartslag',     type: 'number' as const, unit: 'bpm',  min: 0 },
  { label: 'Moeite',       type: 'select' as const, options: ['Makkelijk', 'Matig', 'Zwaar', 'Maximaal'] },
  { label: 'Band kleur',   type: 'select' as const, options: ['Geel', 'Rood', 'Groen', 'Blauw', 'Zwart'] },
]

export const REP_UNITS = [
  { value: 'reps',       label: 'reps'       },
  { value: 'reps/zijde', label: 'reps/zijde' },
  { value: 'sec',        label: 'sec'        },
  { value: 'min',        label: 'min'        },
  { value: 'm',          label: 'm'          },
]

/**
 * Eenheid voor "per zijde" (unilateraal): het opgegeven aantal geldt per kant,
 * de patiënt doet links én rechts. Eén keer "set voltooien" dekt beide zijden.
 * Symmetrisch — geen aparte links/rechts-registratie (bewust simpel gehouden).
 */
export const PER_SIDE_UNIT = 'reps/zijde'

/** Telt de eenheid als herhalingen (reps of reps/zijde), niet tijd/afstand? null = legacy = reps. */
export function isRepBasedUnit(unit: string | null | undefined): boolean {
  return unit == null || unit === 'reps' || unit === PER_SIDE_UNIT
}

/** Wordt de oefening per zijde uitgevoerd (links + rechts)? */
export function isPerSideUnit(unit: string | null | undefined): boolean {
  return unit === PER_SIDE_UNIT
}

/** Volumefactor: per zijde telt dubbel (L+R = 2×), anders 1×. 1RM blíjft de per-zijde-waarde gebruiken. */
export function sideVolumeFactor(unit: string | null | undefined): number {
  return isPerSideUnit(unit) ? 2 : 1
}

// Visual colors per superset group letter — athletic-dark palette: subtiele
// gekleurde overlay op dark base, rand in accent-tint, tekst in lichte tint.
export const SUPERSET_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  A: { bg: 'rgba(96,165,250,0.06)',  border: 'rgba(96,165,250,0.35)',  text: '#93C5FD' },
  B: { bg: 'rgba(244,194,97,0.06)',  border: 'rgba(244,194,97,0.35)',  text: '#F4C261' },
  C: { bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.35)', text: '#C4B5FD' },
  D: { bg: 'rgba(251,113,133,0.06)', border: 'rgba(251,113,133,0.35)', text: '#FDA4AF' },
  E: { bg: 'rgba(134,239,172,0.06)', border: 'rgba(134,239,172,0.35)', text: '#86EFAC' },
  F: { bg: 'rgba(251,146,60,0.06)',  border: 'rgba(251,146,60,0.35)',  text: '#FDBA74' },
}

export const SUPERSET_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export const DEFAULT_CUSTOM_PARAMS: CustomParameter[] = [
  { id: 'cp1', label: 'Kabelgewicht', type: 'number', unit: 'kg', min: 0, defaultValue: 0, isGlobal: true, order: 0 },
  { id: 'cp2', label: 'Elastiek kleur', type: 'select', options: ['Geel', 'Rood', 'Groen', 'Blauw', 'Zwart'], isGlobal: true, order: 1 },
  { id: 'cp3', label: 'Pijnniveau',   type: 'slider', unit: '/10', min: 0, max: 10, defaultValue: 0, isGlobal: false, order: 2 },
]

// MOCK_PROGRAMS en buildMockProgram verwijderd — programma's komen uit de database
