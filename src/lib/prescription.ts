/**
 * Intensiteits-voorschrift op een program-oefening.
 *
 * Een schema kan een oefening voorschrijven op RPE ("werk naar RPE 8"),
 * percentage van 1RM ("70-75% 1RM") of relatief t.o.v. de daily-max top-set
 * ("-10 kg onder daily max"). Deze helper vertaalt zo'n voorschrift naar (a)
 * een leesbaar label voor de UI en (b) — waar mogelijk — een concreet kg-doel
 * dat de session-runner als richtwaarde toont.
 *
 * Bewust géén Prisma-import: dit draait ook client-side. De enum-waarden
 * spiegelen `IntensityType` in schema.prisma (deny drift met een cast op de
 * grens; de zod-enum in de router is de runtime-bewaker).
 */

export type IntensityType =
  | 'NONE'
  | 'RPE'
  | 'PERCENT_1RM'
  | 'RELATIVE_DAILY_MAX'
  | 'TECHNIQUE'
  | 'TEXT'

export const INTENSITY_TYPES: IntensityType[] = [
  'NONE',
  'RPE',
  'PERCENT_1RM',
  'RELATIVE_DAILY_MAX',
  'TECHNIQUE',
  'TEXT',
]

/** Minimale vorm van een voorschrift — subset van ProgramExercise. */
export type Prescription = {
  intensityType: IntensityType
  intensityMin: number | null
  intensityMax: number | null
  intensityText: string | null
}

/** Korte, menselijke labels per type — voor keuzemenu's in de builder. */
export const INTENSITY_TYPE_LABELS: Record<IntensityType, string> = {
  NONE: 'Geen',
  RPE: 'RPE',
  PERCENT_1RM: '% van 1RM',
  RELATIVE_DAILY_MAX: 'Onder daily max',
  TECHNIQUE: 'Techniek',
  TEXT: 'Vrije tekst',
}

function isType(t: unknown): t is IntensityType {
  return typeof t === 'string' && (INTENSITY_TYPES as string[]).includes(t)
}

/** Parse onbekende JSON/DB-waarde naar een veilige Prescription. */
export function toPrescription(input: unknown): Prescription {
  const p = (input ?? {}) as Record<string, unknown>
  const intensityType = isType(p.intensityType) ? p.intensityType : 'NONE'
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  return {
    intensityType,
    intensityMin: num(p.intensityMin),
    intensityMax: num(p.intensityMax),
    intensityText: typeof p.intensityText === 'string' ? p.intensityText : null,
  }
}

/** True als er iets tastbaars voor te schrijven valt (voor conditionele UI). */
export function hasPrescription(p: Prescription): boolean {
  if (p.intensityType === 'NONE') return false
  if (p.intensityType === 'TEXT' || p.intensityType === 'TECHNIQUE') {
    return p.intensityType === 'TECHNIQUE' || !!p.intensityText?.trim()
  }
  return p.intensityMin != null || p.intensityMax != null
}

/** "7" of "7–8" — een min..max range met en-dash, of één waarde. */
function rangeLabel(min: number | null, max: number | null, unit = ''): string {
  const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',')
  if (min != null && max != null && max !== min) return `${fmt(min)}–${fmt(max)}${unit}`
  const one = min ?? max
  return one != null ? `${fmt(one)}${unit}` : ''
}

/**
 * Leesbaar voorschrift-label, bv. "RPE 7–8", "70–75% 1RM",
 * "−10 kg onder daily max", "Techniek", of de vrije tekst. Leeg = niets.
 */
export function formatPrescription(p: Prescription): string {
  switch (p.intensityType) {
    case 'RPE': {
      const r = rangeLabel(p.intensityMin, p.intensityMax)
      return r ? `RPE ${r}` : ''
    }
    case 'PERCENT_1RM': {
      const r = rangeLabel(p.intensityMin, p.intensityMax)
      return r ? `${r}% 1RM` : ''
    }
    case 'RELATIVE_DAILY_MAX': {
      const off = p.intensityMin
      if (off == null || off === 0) return 'Op daily max'
      const abs = Math.abs(off)
      return off < 0 ? `−${abs} kg onder daily max` : `+${abs} kg boven daily max`
    }
    case 'TECHNIQUE':
      return p.intensityText?.trim() || 'Techniek'
    case 'TEXT':
      return p.intensityText?.trim() || ''
    default:
      return ''
  }
}

/** Rond af op de dichtstbijzijnde 0,5 kg (praktisch met kleine schijven). */
export function roundToHalfKg(kg: number): number {
  return Math.round(kg * 2) / 2
}

export type TargetKg = { min: number | null; max: number | null }

/**
 * Concreet kg-doel uit een voorschrift, gegeven referenties uit de sessie:
 *  - `oneRepMax`  : (geschatte) 1RM van de atleet voor deze oefening — voor PERCENT_1RM.
 *  - `dailyMaxKg` : zwaarste set die al in deze sessie voor deze oefening is
 *                   gelogd — voor RELATIVE_DAILY_MAX.
 * Ontbreekt de nodige referentie, dan is het doel (deels) null en toont de UI
 * alleen het tekst-label. RPE/TECHNIQUE/TEXT leveren geen kg op.
 */
export function computeTargetKg(
  p: Prescription,
  refs: { oneRepMax?: number | null; dailyMaxKg?: number | null },
): TargetKg {
  if (p.intensityType === 'PERCENT_1RM') {
    const orm = refs.oneRepMax
    if (!orm || orm <= 0) return { min: null, max: null }
    const fromPct = (pct: number | null) =>
      pct != null ? roundToHalfKg((orm * pct) / 100) : null
    return { min: fromPct(p.intensityMin), max: fromPct(p.intensityMax) }
  }
  if (p.intensityType === 'RELATIVE_DAILY_MAX') {
    const dm = refs.dailyMaxKg
    if (!dm || dm <= 0) return { min: null, max: null }
    const off = p.intensityMin ?? 0
    const kg = roundToHalfKg(dm + off)
    return { min: kg > 0 ? kg : null, max: null }
  }
  return { min: null, max: null }
}

/** "68 kg" of "70–75 kg" uit een TargetKg; leeg als er geen doel is. */
export function formatTargetKg(t: TargetKg): string {
  const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',')
  if (t.min != null && t.max != null && t.max !== t.min) return `${fmt(t.min)}–${fmt(t.max)} kg`
  const one = t.min ?? t.max
  return one != null ? `${fmt(one)} kg` : ''
}

/** Read-only voorschrift-parameter zoals door de therapeut ingesteld op een
 *  programma-oefening (Tempo, Gewicht, Afstand, Hartslag, Moeite, Band kleur,
 *  …). Vorm sluit aan op ExtraParam in de builder. */
export type PrescribedParam = {
  id: string
  label: string
  type: 'number' | 'text' | 'select' | 'slider'
  value: string | number
  unit?: string
  valueMax?: string | number
}

/** Format een voorschrift-parameter naar "Label waarde eenheid", of null als er
 *  geen zinvolle waarde is ingevuld (leeg, of 0 zonder bovengrens). */
export function formatPrescribedParam(p: PrescribedParam): string | null {
  const hasMax = p.valueMax !== undefined && p.valueMax !== '' && p.valueMax !== null
  const empty =
    p.value === '' ||
    p.value === null ||
    p.value === undefined ||
    (typeof p.value === 'number' && p.value === 0 && !hasMax)
  if (empty) return null
  const val = hasMax ? `${p.value}–${p.valueMax}` : `${p.value}`
  const unit = p.unit ? ` ${p.unit}` : ''
  return `${p.label} ${val}${unit}`
}
