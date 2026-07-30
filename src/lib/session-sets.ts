/**
 * Gedeelde set-flow-helpers voor de sessie-runners (atleet + patiënt).
 * Eén set = kg/reps als vrije string-invoer + afvink-status; parsing is
 * komma-tolerant ("12,5" en "12.5" zijn allebei geldig).
 */

/** Eén set in de actieve sessie: kg/reps als string (vrije invoer) + afvink. */
export type SetEntry = { kg: string; reps: string; done: boolean }

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
}> {
  return (params ?? [])
    .filter(p => (typeof p.value === 'string' ? p.value.trim() !== '' : p.value !== 0))
    .map(p => ({ label: p.label, type: p.type, value: p.value, unit: p.unit }))
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
export function makeSetEntries(sets: number, reps: number): SetEntry[] {
  return Array.from({ length: Math.max(1, sets) }, () => ({
    kg: '',
    reps: reps ? String(reps) : '',
    done: false,
  }))
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
