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
