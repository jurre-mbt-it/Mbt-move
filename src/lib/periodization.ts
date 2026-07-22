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

/**
 * LET OP: de kalender in de weekplanner gebruikt deze kleuren NIET meer. Vier
 * van de vijf waren identiek aan iets anders op datzelfde scherm (Opbouw =
 * "voltooid", Intensivering = "bezig", Deload = mobiliteit, Taper = cardio),
 * waardoor één kalender veertien tinten telde en geen enkele nog iets zei. De
 * fase staat daar nu als naam in de weekrail. Deze kleuren blijven voor
 * grafieken en rapporten, waar ze wél de enige kleurtaal zijn.
 */
export const PHASE_META: Record<PhaseType, PhaseMeta> = {
  ACCUMULATION: {
    label: 'Opbouw',
    short: 'Opbouw',
    color: '#5FD08A', // groen — volume opbouwen
    description: 'Volume opbouwen, matige intensiteit',
  },
  INTENSIFICATION: {
    label: 'Intensivering',
    short: 'Intens.',
    color: '#F5B942', // goud — intensiteit omhoog
    description: 'Intensiteit omhoog, volume omlaag',
  },
  REALIZATION: {
    label: 'Realisatie',
    short: 'Piek',
    color: '#E87A55', // brand — pieken/testen
    description: 'Pieken, testen, wedstrijdvorm',
  },
  DELOAD: {
    label: 'Deload',
    short: 'Deload',
    color: '#7FB0D8', // staalblauw — herstel
    description: 'Herstelweek, minder volume en intensiteit',
  },
  TAPER: {
    label: 'Taper',
    short: 'Taper',
    color: '#45A8A2', // turquoise — afbouwen richting piek
    description: 'Afbouwen richting een piekmoment',
  },
}

export function phaseMeta(type: string | null | undefined): PhaseMeta | null {
  if (!type) return null
  return PHASE_META[type as PhaseType] ?? null
}

/** Fractie waarmee een deload de geplande belasting typisch verlaagt (~60%). */
export const DELOAD_LOAD_FRACTION = 0.6
