/**
 * Nette platte-tekst-samenvatting van een behandeling of cardio-sessie, om te
 * kopiëren en in een extern dossier/EPD te plakken.
 *
 * AVG: er staat BEWUST geen patiëntnaam of geboortedatum in. De therapeut
 * plakt de tekst in het juiste dossier; zo kan een verkeerde plak nooit tot
 * een datalek leiden. Alleen datum + inhoud. Zelfde keuze als de iOS-app
 * (mbt-gym-mobile/lib/session-report.ts).
 *
 * De web-sessie draagt meer dan iOS — per-set gewichten én reps, rep-eenheid,
 * extra parameters, superset, warming-up/hoofddeel, pijn per oefening — en dat
 * gaat hier allemaal mee.
 *
 * De invoertypes zijn met opzet tolerant (strings óf getallen, `unknown` voor
 * de JSON-kolommen): dezelfde functie krijgt zowel de live-invoer van het
 * behandelscherm als een uit de database geladen sessie te verwerken.
 */

import { formatWeightsPerSet } from './session-sets'
import { CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, type CardioActivityKey, type CardioProtocolKey } from './cardio-constants'
import { formatPaceFromSecPerKm } from './cardio-zones'

export type DossierExercise = {
  name: string
  /** 'WARMUP' | 'MAIN'; null/leeg = hoofddeel (legacy). */
  phase?: string | null
  /** Superset-letter A..F, of null. */
  supersetGroup?: string | null
  sets?: number | string | null
  /** Vaste reps voor elke set — fallback als `repsPerSet` ontbreekt. */
  reps?: number | string | null
  /** 'reps' | 'reps/zijde' | 'sec' | 'min' | 'm'; leeg = reps. */
  repUnit?: string | null
  /** Losse (zwaarste-set) waarde uit de legacy-kolom. */
  weight?: number | string | null
  /** (number|string|null)[] — één entry per set. */
  weightsPerSet?: unknown
  /** (number|string|null)[] — één entry per set. */
  repsPerSet?: unknown
  /** [{ label, value, unit? }, …] */
  extraParams?: unknown
  painLevel?: number | string | null
  painDuring?: number | string | null
  notes?: string | null
}

export type DossierSession = {
  date: Date | string | null
  durationMinutes?: number | string | null
  painLevel?: number | string | null
  exertionLevel?: number | string | null
  feelScore?: number | string | null
  notes?: string | null
  exercises: DossierExercise[]
}

export type DossierCardio = {
  date: Date | string | null
  activity: string
  protocol: string
  durationSec?: number | null
  distanceM?: number | null
  avgPaceSecPerKm?: number | null
  avgHeartRate?: number | null
  maxHeartRate?: number | null
  zone?: number | null
  targetZone?: number | null
  rpe?: number | string | null
  painLevel?: number | string | null
  notes?: string | null
}

// ── Kleine parsers ───────────────────────────────────────────────────────────

function two(n: number): string {
  return String(n).padStart(2, '0')
}

/** "27-08-2026", of null bij een onbruikbare datum. */
function nlDate(input: Date | string | null | undefined): string | null {
  if (!input) return null
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return null
  return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** Tolerant naar getal: "12,5" en "12.5" zijn allebei geldig, leeg = null. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** JSON-kolom of live string-array → (number|null)[]; niet-array = leeg. */
function numArray(v: unknown): Array<number | null> {
  if (!Array.isArray(v)) return []
  return v.map((x) => num(x))
}

function unitLabel(u?: string | null): string {
  return u && u.trim() !== '' ? u.trim() : 'reps'
}

/**
 * Reps als één regel: gelijk over alle sets → "10", verschillend →
 * "10-8-6". Niet-ingevulde sets aan het eind vallen weg, een gat middenin
 * wordt "—" (zelfde afspraak als `formatWeightsPerSet`). Zonder per-set-data
 * valt 'ie terug op het vaste `reps`-veld.
 */
export function formatRepsPerSet(
  repsPerSet: unknown,
  fallback: number | string | null | undefined,
): string | null {
  const cells = numArray(repsPerSet).map((r) => (r == null ? null : String(Math.round(r))))
  while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop()
  const logged = cells.filter((c): c is string => c !== null)
  if (logged.length > 0) {
    if (logged.length === cells.length && new Set(logged).size === 1) return logged[0]
    return cells.map((c) => c ?? '—').join('-')
  }
  const f = num(fallback)
  return f == null ? null : String(Math.round(f))
}

/** "Tempo 3-1-1 · Band groen" — alleen parameters met een ingevulde waarde. */
function summarizeParams(extraParams: unknown): string | null {
  if (!Array.isArray(extraParams)) return null
  const parts: string[] = []
  for (const raw of extraParams) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const label = typeof p.label === 'string' ? p.label.trim() : ''
    const value = p.value
    if (label === '' || value === undefined || value === null || value === '' || value === 0) continue
    const unit = typeof p.unit === 'string' && p.unit.trim() !== '' ? ` ${p.unit.trim()}` : ''
    parts.push(`${label} ${value}${unit}`)
  }
  return parts.length ? parts.join(' · ') : null
}

// ── Behandeling ──────────────────────────────────────────────────────────────

/**
 * Eén oefening als dossierregel(s). Geeft null terug als er niets te melden
 * valt — een lege rij die de therapeut wel aanmaakte maar nooit invulde hoort
 * niet in het dossier.
 */
function exerciseLines(ex: DossierExercise, n: number): string[] | null {
  const setCount = num(ex.sets)
  const reps = formatRepsPerSet(ex.repsPerSet, ex.reps)
  const weights = formatWeightsPerSet(numArray(ex.weightsPerSet), num(ex.weight))
  const extras = summarizeParams(ex.extraParams)
  const painLevel = num(ex.painLevel)
  const painDuring = num(ex.painDuring)
  const note = (ex.notes ?? '').trim()

  const hasContent =
    (setCount != null && setCount > 0) ||
    reps != null ||
    weights != null ||
    extras != null ||
    painLevel != null ||
    painDuring != null ||
    note !== ''
  if (!hasContent) return null

  const prefix = ex.supersetGroup ? `(${ex.supersetGroup}) ` : ''
  let line = `${n}. ${prefix}${ex.name}`

  const volume =
    setCount != null && setCount > 0 && reps != null
      ? `${Math.round(setCount)}×${reps} ${unitLabel(ex.repUnit)}`
      : reps != null
        ? `${reps} ${unitLabel(ex.repUnit)}`
        : setCount != null && setCount > 0
          ? `${Math.round(setCount)} sets`
          : null
  if (volume) line += `: ${volume}`
  if (weights) line += volume ? ` @ ${weights}` : `: ${weights}`
  if (extras) line += ` (${extras})`
  if (painLevel != null) line += ` · pijn ${painLevel}/10`
  if (painDuring != null) line += ` · pijn tijdens ${painDuring}/10`

  const lines = [line]
  if (note !== '') {
    // Meerregelige notitie inspringen zodat de nummering leesbaar blijft.
    for (const l of note.split('\n')) lines.push(`   ${l}`)
  }
  return lines
}

/**
 * Bouwt de dossier-tekst voor een behandeling. Warming-up en hoofddeel krijgen
 * alleen een kopje als er écht een warming-up is; de nummering loopt door over
 * beide blokken zodat de therapeut in het dossier naar "oefening 4" kan wijzen.
 */
export function formatSessionForDossier(s: DossierSession): string {
  const date = nlDate(s.date)
  const minutes = num(s.durationMinutes)
  const header = [
    date ? `Behandeling ${date}` : 'Behandeling',
    minutes != null ? `${Math.round(minutes)} min` : null,
  ]
    .filter((x): x is string => x != null)
    .join(' · ')

  const warmup = s.exercises.filter((e) => e.phase === 'WARMUP')
  const main = s.exercises.filter((e) => e.phase !== 'WARMUP')

  const body: string[] = []
  let n = 0
  const push = (list: DossierExercise[], heading: string | null) => {
    const block: string[] = []
    for (const ex of list) {
      const lines = exerciseLines(ex, n + 1)
      if (!lines) continue
      n += 1
      block.push(...lines)
    }
    if (block.length === 0) return
    body.push('')
    if (heading) body.push(heading)
    body.push(...block)
  }
  // Zonder warming-up geen kopjes: de meeste behandelingen zijn één blok.
  const split = warmup.length > 0
  push(warmup, split ? 'Warming-up' : null)
  push(main, split ? 'Hoofddeel' : null)

  const footer: string[] = []
  const pain = num(s.painLevel)
  const rpe = num(s.exertionLevel)
  const feel = num(s.feelScore)
  if (pain != null) footer.push(`Pijn ${pain}/10`)
  if (rpe != null) footer.push(`RPE ${rpe}/10`)
  if (feel != null) footer.push(`Gevoel ${feel}/5`)

  const out = [header, ...body]
  if (footer.length > 0) out.push('', footer.join(' · '))
  const notes = (s.notes ?? '').trim()
  if (notes !== '') {
    if (footer.length === 0) out.push('')
    out.push(`Notities: ${notes}`)
  }
  return out.join('\n')
}

// ── Cardio ───────────────────────────────────────────────────────────────────

/**
 * Cardio krijgt een eigen tekstvorm: sets en reps bestaan daar niet, tijd /
 * afstand / tempo / hartslag / zone wel.
 */
export function formatCardioForDossier(c: DossierCardio): string {
  const activity = CARDIO_ACTIVITIES[c.activity as CardioActivityKey]?.label ?? c.activity
  const protocol = CARDIO_PROTOCOLS[c.protocol as CardioProtocolKey]?.label ?? c.protocol
  const date = nlDate(c.date)
  const minutes = c.durationSec != null && c.durationSec > 0 ? Math.round(c.durationSec / 60) : null

  const header = [
    date ? `Cardio ${date}` : 'Cardio',
    `${activity}${protocol ? ` (${protocol})` : ''}`,
    minutes != null ? `${minutes} min` : null,
  ]
    .filter((x): x is string => x != null && x !== '')
    .join(' · ')

  const metrics: string[] = []
  if (c.distanceM != null && c.distanceM > 0) {
    metrics.push(`Afstand ${(c.distanceM / 1000).toFixed(2).replace('.', ',')} km`)
  }
  const pace = formatPaceFromSecPerKm(c.activity as CardioActivityKey, c.avgPaceSecPerKm)
  if (pace) metrics.push(`tempo ${pace}`)
  if (c.avgHeartRate != null) {
    metrics.push(`HR gem. ${c.avgHeartRate}${c.maxHeartRate != null ? ` (max ${c.maxHeartRate})` : ''}`)
  }
  if (c.zone != null) metrics.push(`zone ${c.zone}`)
  if (c.targetZone != null && c.targetZone !== c.zone) metrics.push(`doelzone ${c.targetZone}`)

  const footer: string[] = []
  const rpe = num(c.rpe)
  const pain = num(c.painLevel)
  if (rpe != null) footer.push(`RPE ${rpe}/10`)
  if (pain != null) footer.push(`Pijn ${pain}/10`)

  const out = [header]
  if (metrics.length > 0) out.push(metrics.join(' · '))
  if (footer.length > 0) out.push(footer.join(' · '))
  const notes = (c.notes ?? '').trim()
  if (notes !== '') out.push(`Notities: ${notes}`)
  return out.join('\n')
}

// ── Klembord ─────────────────────────────────────────────────────────────────

/**
 * Naar het klembord. `navigator.clipboard` bestaat niet in een niet-secure
 * context (en op oudere iPad-Safari), vandaar de textarea-fallback — de iPad
 * ís het apparaat waarop dit tijdens de behandeling gebruikt wordt.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Val door naar de fallback.
  }
  try {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
