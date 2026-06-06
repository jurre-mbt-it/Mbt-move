/**
 * Vaste catalogus voor de Hardloopanalyse (2D videoanalyse).
 *
 * Het formulier is een standaardformulier: deze 6 achteraanzicht-beoordelingen,
 * 6 zijaanzicht-hoekmetingen en 6 loopmetrics liggen vast. Bij het aanmaken van
 * een analyse worden de items hieruit als rijen aangemaakt; de behandelaar vult
 * alleen waarden + opmerkingen in. As-grenzen en ideale ranges van het
 * zijaanzicht zijn afgestemd op de MBT-template.
 */

export type RearItemDef = {
  key: string
  label: string
  defaultComment: string
}

export type SideItemDef = {
  key: string
  label: string
  idealMin: number
  idealMax: number
  axisMin: number
  axisMax: number
  unit: string
}

export type MetricDef = {
  key: 'cadence' | 'strideLength' | 'stepLength' | 'groundContact' | 'flightTime' | 'dutyFactor'
  label: string
  unit: string
}

/** Achteraanzicht — score 0-100 (rood <70, oranje 70-85, groen ≥85). */
export const REAR_ITEMS: RearItemDef[] = [
  { key: 'linker-heup', label: 'Linker heup', defaultComment: 'Bekken uitgebalanceerd bij landing' },
  { key: 'rechter-heup', label: 'Rechter heup', defaultComment: 'Bekken uitgebalanceerd bij landing' },
  { key: 'linker-onderbeen', label: 'Linker onderbeen', defaultComment: 'Knie uitgebalanceerd, mooie lijn' },
  { key: 'rechter-onderbeen', label: 'Rechter onderbeen', defaultComment: '' },
  { key: 'linker-voet', label: 'Linker voet', defaultComment: 'Neutrale voetlanding' },
  { key: 'rechter-voet', label: 'Rechter voet', defaultComment: 'Neutrale voetlanding' },
]

/** Zijaanzicht — hoek (°) met ideale range (groene band). */
export const SIDE_ITEMS: SideItemDef[] = [
  { key: 'overstride', label: 'Overstride', idealMin: -10, idealMax: 10, axisMin: -30, axisMax: 40, unit: '°' },
  { key: 'armpositie', label: 'Armpositie', idealMin: 75, idealMax: 85, axisMin: 30, axisMax: 110, unit: '°' },
  { key: 'voorste-knie', label: 'Voorste knie bij landing', idealMin: 140, idealMax: 180, axisMin: 100, axisMax: 200, unit: '°' },
  { key: 'achterste-knie', label: 'Achterste knie bij landing', idealMin: 0, idealMax: 105, axisMin: 0, axisMax: 160, unit: '°' },
  { key: 'hoofdpositie', label: 'Hoofdpositie', idealMin: -14, idealMax: -4, axisMin: -30, axisMax: 20, unit: '°' },
  { key: 'romppositie', label: 'Romppositie', idealMin: 6, idealMax: 12, axisMin: -10, axisMax: 30, unit: '°' },
]

/** Loopmetrics — gemiddelde over de analyse (opgeslagen als velden op de parent). */
export const METRICS: MetricDef[] = [
  { key: 'cadence', label: 'Cadans', unit: 'stappen/min' },
  { key: 'strideLength', label: 'Paslengte', unit: 'meter' },
  { key: 'stepLength', label: 'Staplengte', unit: 'meter (stride)' },
  { key: 'groundContact', label: 'Grondcontact', unit: 'seconde' },
  { key: 'flightTime', label: 'Zweeftijd', unit: 'seconde' },
  { key: 'dutyFactor', label: 'Duty factor', unit: 'ratio' },
]

export const REAR_SOURCE = 'BEKKEN · ONDERBEEN · VOET'
export const DEFAULT_SUBTITLE = 'Beoordeling van houding, beweging en loopmetrics'
export const DEFAULT_VIEW_LABEL = 'Achteraanzicht & zijaanzicht'
