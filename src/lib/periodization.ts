/**
 * Periodiserings-fases voor de week-planner. Een fase/blok wordt per week
 * (WeekSchedule.phaseType) opgeslagen; opeenvolgende weken met dezelfde fase
 * vormen visueel één blok-band boven de kalender.
 *
 * Bewust een vaste, kleine set: het dekt de klassieke blok-periodisering
 * (accumulatie → intensivering → realisatie) plus deload en taper. De DB slaat
 * het als vrije string op zodat toevoegen later geen migratie vergt.
 */

export type PhaseType =
  | 'ACCUMULATION'
  | 'INTENSIFICATION'
  | 'REALIZATION'
  | 'DELOAD'
  | 'TAPER'

export const PHASE_TYPES: PhaseType[] = [
  'ACCUMULATION',
  'INTENSIFICATION',
  'REALIZATION',
  'DELOAD',
  'TAPER',
]

type PhaseMeta = { label: string; short: string; color: string; description: string }

export const PHASE_META: Record<PhaseType, PhaseMeta> = {
  ACCUMULATION: {
    label: 'Opbouw',
    short: 'Opbouw',
    color: '#86EFAC', // groen — volume opbouwen
    description: 'Volume opbouwen, matige intensiteit',
  },
  INTENSIFICATION: {
    label: 'Intensivering',
    short: 'Intens.',
    color: '#F4C261', // amber — intensiteit omhoog
    description: 'Intensiteit omhoog, volume omlaag',
  },
  REALIZATION: {
    label: 'Realisatie',
    short: 'Piek',
    color: '#e87a55', // brand — pieken/testen
    description: 'Pieken, testen, wedstrijdvorm',
  },
  DELOAD: {
    label: 'Deload',
    short: 'Deload',
    color: '#60a5fa', // blauw — herstel
    description: 'Herstelweek, minder volume en intensiteit',
  },
  TAPER: {
    label: 'Taper',
    short: 'Taper',
    color: '#a78bfa', // paars — afbouwen richting piek
    description: 'Afbouwen richting een piekmoment',
  },
}

export function phaseMeta(type: string | null | undefined): PhaseMeta | null {
  if (!type) return null
  return PHASE_META[type as PhaseType] ?? null
}

/** Fractie waarmee een deload de geplande belasting typisch verlaagt (~60%). */
export const DELOAD_LOAD_FRACTION = 0.6
