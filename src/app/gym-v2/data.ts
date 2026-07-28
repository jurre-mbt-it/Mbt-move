/**
 * Voorbeelddata voor de landingspagina.
 *
 * Dit zijn géén echte patiëntgegevens: het is een uitgewerkt scenario van een
 * opbouw van twaalf weken na een kuitblessure, plus een fictieve caseload van
 * vijf sporters. De cijfers zijn zo gekozen dat het belastingmodel er iets mee
 * laat zien: in week 7 springt de belasting van 340 naar 420 AU (+24% ten
 * opzichte van de vier weken ervoor) en de week erna wordt teruggeschakeld.
 */

export type Week = {
  w: number
  /** weekbelasting in AU (som van sRPE per set) */
  load: number
  /** voortschrijdend gemiddelde over zes weken */
  fit: number
  /** voortschrijdend gemiddelde over zeven dagen */
  fat: number
  flag?: boolean
}

export const WEEKS: Week[] = [
  { w: 1, load: 180, fit: 22, fat: 30 },
  { w: 2, load: 240, fit: 30, fat: 44 },
  { w: 3, load: 260, fit: 38, fat: 48 },
  { w: 4, load: 150, fit: 40, fat: 30 },
  { w: 5, load: 300, fit: 48, fat: 56 },
  { w: 6, load: 340, fit: 57, fat: 66 },
  { w: 7, load: 420, fit: 68, fat: 88, flag: true },
  { w: 8, load: 190, fit: 68, fat: 46 },
  { w: 9, load: 360, fit: 74, fat: 70 },
  { w: 10, load: 400, fit: 82, fat: 78 },
  { w: 11, load: 430, fit: 90, fat: 84 },
  { w: 12, load: 300, fit: 92, fat: 62 },
]

export type PainLevel = 'ok' | 'let' | 'hoog'

export type CaseRow = {
  who: string
  fase: string
  /** weekbelasting over de laatste zes weken, voor de sparkline */
  series: number[]
  week: number
  pijn: [PainLevel, string]
  adh: number
  last: string
}

export const CASELOAD: CaseRow[] = [
  { who: 'Sanne V.', fase: 'Fase 3 · achillespees', series: [210, 260, 290, 250, 320, 360], week: 360, pijn: ['ok', '1/10'], adh: 96, last: 'gisteren' },
  { who: 'Tim B.', fase: 'Fase 2 · VKB rechts', series: [180, 220, 240, 300, 340, 420], week: 420, pijn: ['hoog', '5/10'], adh: 88, last: '2 dagen' },
  { who: 'Noor D.', fase: 'Fase 4 · hardlopen', series: [300, 330, 310, 360, 380, 400], week: 400, pijn: ['ok', '0/10'], adh: 100, last: 'vandaag' },
  { who: 'Ruben K.', fase: 'Fase 1 · schouder', series: [90, 120, 140, 150, 160, 180], week: 180, pijn: ['let', '3/10'], adh: 71, last: '5 dagen' },
  { who: 'Iris M.', fase: 'Fase 3 · lies', series: [240, 260, 250, 280, 300, 290], week: 290, pijn: ['ok', '1/10'], adh: 93, last: 'gisteren' },
]

export const PAIN_LABEL: Record<PainLevel, string> = {
  ok: 'stabiel',
  let: 'let op',
  hoog: 'gestegen',
}

export const MAILTO_TESTFLIGHT =
  'mailto:jurre@movementbasedtherapy.nl?subject=MBT-Gym%20TestFlight%20toegang&body=Hoi%20Jurre%2C%20ik%20zou%20graag%20toegang%20tot%20de%20MBT-Gym%20beta.'

export const MAILTO_DEMO =
  'mailto:jurre@movementbasedtherapy.nl?subject=MBT-Gym%20demo%20praktijk'
