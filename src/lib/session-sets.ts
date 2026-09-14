/**
 * Gedeelde set-flow-helpers voor de sessie-runners (atleet + patiënt).
 * Eén set = kg/reps als vrije string-invoer + afvink-status; parsing is
 * komma-tolerant ("12,5" en "12.5" zijn allebei geldig).
 */

/** Eén set in de actieve sessie: kg/reps als string (vrije invoer) + afvink.
 *  `meet` = gemeten waarden per set (staafsnelheid, piekvermogen), op label. */
export type SetEntry = { kg: string; reps: string; done: boolean; meet?: Record<string, string> }

/** Laatst gelogde waarden per oefening — uit getTodayExercises.lastLogs. */
export type LastLog = {
  weight: number | null
  weightsPerSet: Array<number | null> | null
  repsPerSet: Array<number | null> | null
  repsCompleted: number | null
  setsCompleted: number | null
  completedAt: string | null
  repUnit?: string | null
  extraParams?: unknown
}

/** Extra parameter tijdens de sessie (Tempo, RPE, Band kleur, …) — zelfde
 *  shape als de program-builder en het therapeut-scherm. */
export type SessionParam = {
  id: string
  label: string
  type: 'number' | 'text' | 'select' | 'slider'
  value: string | number
  unit?: string
  options?: string[]
  min?: number
  max?: number
  /** Per set gemeten (staafsnelheid, piekvermogen); `value` is dan de samenvatting. */
  perSet?: Array<number | null>
}

/** Parse onbekende JSON (defaultExtraParams / gelogde extraParams) naar een
 *  veilige SessionParam-lijst. Zelfde tolerantie als het therapeut-scherm. */
export function cloneParams(input: unknown): SessionParam[] {
  if (!Array.isArray(input)) return []
  const out: SessionParam[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const label = String(p.label ?? '')
    if (!label) continue
    const type: SessionParam['type'] =
      p.type === 'number' || p.type === 'text' || p.type === 'select' || p.type === 'slider'
        ? p.type
        : 'number'
    out.push({
      id: `p-${label}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      type,
      value: typeof p.value === 'string' || typeof p.value === 'number' ? p.value : type === 'text' || type === 'select' ? '' : 0,
      unit: typeof p.unit === 'string' ? p.unit : undefined,
      options: Array.isArray(p.options) ? p.options.filter((o): o is string => typeof o === 'string') : undefined,
      min: typeof p.min === 'number' ? p.min : undefined,
      max: typeof p.max === 'number' ? p.max : undefined,
      perSet: Array.isArray(p.perSet)
        ? p.perSet.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null))
        : undefined,
    })
  }
  return out
}

/**
 * Start-parameters voor een oefening: de door de therapeut/library ingestelde
 * defaults, met de waarden van de vorige sessie eroverheen (match op label).
 * Zonder defaults (atleet-eigen oefening) tellen de memory-params zelf.
 */
export function seedParams(defaults: unknown, memory: unknown, allowMemoryOnly: boolean): SessionParam[] {
  const base = cloneParams(defaults)
  const mem = cloneParams(memory)
  if (base.length === 0) return allowMemoryOnly ? mem : []
  if (mem.length === 0) return base
  return base.map(p => {
    const m = mem.find(x => x.label === p.label)
    return m ? { ...p, value: m.value } : p
  })
}

/** Alleen parameters met een ingevulde waarde — voor de log-payload. */
export function filledParams(params: SessionParam[] | undefined): Array<{
  label: string
  type: string
  value: string | number
  unit?: string
  perSet?: Array<number | null>
}> {
  return (params ?? [])
    .filter(p => (typeof p.value === 'string' ? p.value.trim() !== '' : p.value !== 0))
    .map(p => ({ label: p.label, type: p.type, value: p.value, unit: p.unit, ...(p.perSet ? { perSet: p.perSet } : {}) }))
}

/** Parse "12,5" én "12.5" naar kg; lege of onleesbare invoer → null. */
export function parseKg(v: string): number | null {
  const t = v.replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseReps(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Toon kg zoals Nederlanders 'm typen: komma als decimaalteken. */
export function fmtKg(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',')
}

/** Default set-rijen op basis van het programma-doel (sets × reps). */
export function makeSetEntries(sets: number, reps: number, repsPerSet?: number[] | null): SetEntry[] {
  return Array.from({ length: Math.max(1, sets) }, (_, i) => {
    const doel = repsPerSet?.[i] ?? reps
    return { kg: '', reps: doel ? String(doel) : '', done: false }
  })
}

/** Ghost-waarde voor set i: vorige sessie per set, anders het losse gewicht. */
export function prevKgFor(last: LastLog | undefined, i: number): number | null {
  if (!last) return null
  const perSet = last.weightsPerSet?.[i]
  if (perSet != null) return perSet
  return last.weight ?? null
}

export function prevRepsFor(last: LastLog | undefined, i: number): number | null {
  if (!last) return null
  const perSet = last.repsPerSet?.[i]
  if (perSet != null) return perSet
  return last.repsCompleted ?? null
}

/**
 * Gelogde gewichten als één regel voor historie-overzichten:
 * verschillende sets → "40-50-60-60 kg", allemaal gelijk → "60 kg".
 *
 * Zonder dit toonde de historie alleen `ExerciseLog.weight` — de zwaarste set —
 * waardoor een opbouwende oefening (40 → 50 → 60) als "60 kg" langskwam.
 *
 * Niet-ingevulde sets middenin worden "—"; niet-ingevulde sets aan het eind
 * vallen weg (4 rijen, 3 ingevuld → "40-50-60", niet "40-50-60-—"). Is er
 * niets per set gelogd, dan valt 'ie terug op het losse `weight`-veld.
 */
export function formatWeightsPerSet(
  weightsPerSet: unknown,
  fallback: number | null | undefined,
  unit = 'kg',
): string | null {
  if (Array.isArray(weightsPerSet)) {
    const cells = weightsPerSet.map(w =>
      typeof w === 'number' && Number.isFinite(w) ? fmtKg(w) : null,
    )
    while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop()
    const logged = cells.filter((c): c is string => c !== null)
    if (logged.length > 0) {
      // Alle sets hetzelfde gewicht (en geen gaten) → comprimeer tot één getal.
      if (logged.length === cells.length && new Set(logged).size === 1) {
        return `${logged[0]} ${unit}`
      }
      return `${cells.map(c => c ?? '—').join('-')} ${unit}`
    }
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return `${fmtKg(fallback)} ${unit}`
  return null
}

/** Korte samenvatting van de vorige sessie, bv. "22,5 kg × 10" of "20 / 22,5 / 25 kg". */
export function prevSummaryFor(last: LastLog | undefined): string | null {
  if (!last) return null
  const ws = (last.weightsPerSet ?? []).filter((w): w is number => w != null && w > 0)
  const single = last.weight != null && last.weight > 0 ? last.weight : null
  if (ws.length === 0 && single === null) return null
  const reps = last.repsCompleted
  if (ws.length === 0) return `${fmtKg(single!)} kg${reps ? ` × ${reps}` : ''}`
  const unique = [...new Set(ws)]
  if (unique.length === 1) return `${fmtKg(unique[0])} kg${reps ? ` × ${reps}` : ''}`
  return ws.map(w => fmtKg(w)).join(' / ') + ' kg'
}

/** Voorgeschreven parameters die de atleet zelf meet (staafsnelheid, piekvermogen): invoer per set, geen doelchip. */
export const MEET_PARAM_IDS = ['bar_speed', 'peak_power'] as const
export function isMeetParam(p: { id?: string; label?: string }): boolean {
  return (MEET_PARAM_IDS as readonly string[]).includes(p.id ?? '') || p.label === 'Staafsnelheid' || p.label === 'Piekvermogen'
}

/** Een meetkolom in de set-rijen: label is de sleutel in `SetEntry.meet`. */
export type MeetKolom = { label: string; unit: string }

/** De meetkolommen die de therapeut op deze rij zette, in voorschrift-volgorde. */
export function meetKolommenVoor(prescribed: unknown): MeetKolom[] {
  const uit: MeetKolom[] = []
  for (const p of cloneParams(prescribed)) {
    if (!isMeetParam(p) || uit.some(k => k.label === p.label)) continue
    uit.push({ label: p.label, unit: p.unit ?? (p.label === 'Piekvermogen' ? 'W' : 'm/s') })
  }
  return uit
}

/** Parse een gemeten waarde ("0,45" of "0.45"); leeg of onleesbaar → null. */
export function parseMeet(v: string | undefined): number | null {
  if (v == null) return null
  const t = v.replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * De per-set-metingen als log-parameters: `perSet` bewaart elke set, `value`
 * is de samenvatting waar oudere schermen mee verder kunnen. Piekvermogen is
 * per definitie het maximum; snelheid het gemiddelde van de ingevulde sets.
 * Zonder één ingevulde set komt de kolom niet mee.
 */
export function meetParamsUitSets(kolommen: MeetKolom[], entries: SetEntry[]): Array<{
  label: string
  type: string
  value: number
  unit: string
  perSet: Array<number | null>
}> {
  const uit: Array<{ label: string; type: string; value: number; unit: string; perSet: Array<number | null> }> = []
  for (const k of kolommen) {
    const perSet = entries.map(s => parseMeet(s.meet?.[k.label]))
    const gevuld = perSet.filter((v): v is number => v !== null)
    if (gevuld.length === 0) continue
    const samenvatting = k.label === 'Piekvermogen'
      ? Math.max(...gevuld)
      : Math.round((gevuld.reduce((a, b) => a + b, 0) / gevuld.length) * 100) / 100
    uit.push({ label: k.label, type: 'number', value: samenvatting, unit: k.unit, perSet })
  }
  return uit
}

/** Ghost-waarde voor meetkolom `label` in set i: vorige sessie per set, anders de samenvatting. */
export function prevMeetFor(last: LastLog | undefined, label: string, i: number): number | null {
  if (!last) return null
  const p = cloneParams(last.extraParams).find(x => x.label === label)
  if (!p) return null
  const perSet = p.perSet?.[i]
  if (perSet != null) return perSet
  return typeof p.value === 'number' && p.value > 0 ? p.value : null
}

/**
 * Start-parameters zonder de meetvelden: die staan sinds 14-09-2026 als kolom
 * in de set-rijen, dus een los "Staafsnelheid"-veld ernaast zou dubbel zijn.
 * Oude sessies met zo'n los veld in het geheugen worden ook uitgefilterd.
 */
export function seedParamsZonderMeetvelden(defaults: unknown, memory: unknown, allowMemoryOnly: boolean): SessionParam[] {
  return seedParams(defaults, memory, allowMemoryOnly).filter(p => !isMeetParam(p))
}

/** Toon een meting zoals hij getypt is: komma, hooguit twee decimalen. */
function fmtMeet(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/**
 * Gelogde metingen als één regel voor historie en dossier, per set als die
 * er zijn: "Staafsnelheid 0,45-0,42-0,4 m/s · Piekvermogen 610 W".
 * Niet-ingevulde sets aan het eind vallen weg, gaten middenin worden "—".
 */
export function formatMeetParams(extraParams: unknown): string | null {
  const delen: string[] = []
  for (const p of cloneParams(extraParams)) {
    if (!isMeetParam(p)) continue
    const unit = p.unit ? ` ${p.unit}` : ''
    if (p.perSet && p.perSet.length > 0) {
      const cells = p.perSet.map(v => (v != null ? fmtMeet(v) : null))
      while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop()
      if (cells.some(c => c !== null)) {
        delen.push(`${p.label} ${cells.map(c => c ?? '—').join('-')}${unit}`)
        continue
      }
    }
    if (typeof p.value === 'number' && p.value > 0) delen.push(`${p.label} ${fmtMeet(p.value)}${unit}`)
  }
  return delen.length ? delen.join(' · ') : null
}
