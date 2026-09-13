/**
 * Bloklijst van een planner-workout: types, formatter en afleidingen die de
 * server, de planner en de atleet-runner delen. Puur: geen React, geen Prisma.
 *
 * Een workout op de kalender draagt een geordende lijst rijen. Elke rij is een
 * oefening (EXERCISE), een notitie voor de atleet (NOTE) of een pauze (BREAK).
 * Supersets en circuits zijn letters op opeenvolgende rijen; wat een letter
 * betekent staat in `ItemGroups` op het item.
 * Ontwerp: docs/superpowers/specs/2026-09-13-planner-blokken-design.md
 */
import { durationFromExercises } from '@/lib/planned-load'
import { isPerSideUnit, isRepBasedUnit } from '@/lib/program-constants'

export type BlockKind = 'EXERCISE' | 'NOTE' | 'BREAK'
export type BlockPhase = 'WARMUP' | 'COOLDOWN'
export type GroupKind = 'SUPERSET' | 'CIRCUIT'
export type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
export type IntensityTypeKey = 'NONE' | 'RPE' | 'PERCENT_1RM' | 'RELATIVE_DAILY_MAX' | 'TECHNIQUE' | 'TEXT'

/** Zelfde vorm als ExtraParam in components/programs/types.ts, alles optioneel
 *  behalve label, zodat oude rijen (alleen label + value) blijven werken. */
export type BlockParam = {
  id?: string
  label: string
  type?: string
  value?: string | number | null
  valueMax?: string | number | null
  unit?: string
  options?: string[]
  min?: number
  max?: number
}

export type ItemGroup = {
  kind: GroupKind
  name?: string
  description?: string
  rounds?: number
  timeCapSec?: number
  restSec?: number
}
export type ItemGroups = Record<string, ItemGroup>

/** Eén rij zoals listItemContents hem teruggeeft. */
export type PlannerBlock = {
  id: string
  order: number
  blockKind: BlockKind
  exerciseId: string | null
  exerciseName: string | null
  exerciseCategory: string | null
  sets: number
  reps: number
  repUnit: string
  restTime: number | null
  notes: string | null
  setsMax: number | null
  repsMax: number | null
  intensityType: IntensityTypeKey
  intensityMin: number | null
  intensityMax: number | null
  intensityText: string | null
  supersetGroup: string | null
  supersetOrder: number
  extraParams: BlockParam[]
  repsPerSet: number[] | null
  amrap: boolean
  phase: BlockPhase | null
  isBodyweight: boolean
  completionOnly: boolean
  trackMax: boolean | null
  text: string | null
  videoUrl: string | null
  durationSec: number | null
}

/** Een rij in bewerking: nieuw (geen id) of bestaand (id). */
export type BlockDraft = Omit<PlannerBlock, 'id' | 'order'> & { id?: string }

/** Wat setItemExercises per rij accepteert. */
export type BlockInput = Omit<BlockDraft, 'id' | 'exerciseName' | 'exerciseCategory'>

export function newBlock(kind: BlockKind, patch: Partial<BlockDraft> = {}): BlockDraft {
  return {
    blockKind: kind,
    exerciseId: null, exerciseName: null, exerciseCategory: null,
    sets: 3, reps: 10, repUnit: 'reps', restTime: null, notes: null,
    setsMax: null, repsMax: null,
    intensityType: 'NONE', intensityMin: null, intensityMax: null, intensityText: null,
    supersetGroup: null, supersetOrder: 0, extraParams: [],
    repsPerSet: null, amrap: false, phase: null,
    isBodyweight: false, completionOnly: false, trackMax: null,
    text: null, videoUrl: null,
    durationSec: kind === 'BREAK' ? 120 : null,
    ...patch,
  }
}

/** Eén plek, zodat een nieuw veld niet bij de volgende opslag stil verdwijnt. */
export function toBlockPayload(b: BlockDraft): BlockInput {
  return {
    blockKind: b.blockKind,
    exerciseId: b.blockKind === 'EXERCISE' ? b.exerciseId : null,
    sets: b.sets, reps: b.reps, repUnit: b.repUnit,
    restTime: b.restTime ?? null, notes: b.notes ?? null,
    setsMax: b.setsMax ?? null, repsMax: b.repsMax ?? null,
    intensityType: b.intensityType ?? 'NONE',
    intensityMin: b.intensityMin ?? null, intensityMax: b.intensityMax ?? null,
    intensityText: b.intensityText ?? null,
    supersetGroup: b.supersetGroup ?? null, supersetOrder: b.supersetOrder ?? 0,
    extraParams: b.extraParams ?? [],
    repsPerSet: b.repsPerSet && b.repsPerSet.length > 0 ? b.repsPerSet : null,
    amrap: !!b.amrap, phase: b.phase ?? null,
    isBodyweight: !!b.isBodyweight, completionOnly: !!b.completionOnly,
    trackMax: b.trackMax ?? null,
    text: b.text ?? null, videoUrl: b.videoUrl ?? null,
    durationSec: b.durationSec ?? null,
  }
}

export function isExerciseBlock<T extends { blockKind: string; exerciseId: string | null }>(
  b: T,
): b is T & { exerciseId: string } {
  return b.blockKind === 'EXERCISE' && typeof b.exerciseId === 'string' && b.exerciseId.length > 0
}

// ── Extra parameters met een vaste identiteit ────────────────────────────────

export const BLOCK_PARAMS = {
  tempo:      { id: 'tempo',      label: 'Tempo',         type: 'text',   unit: '' },
  rir:        { id: 'rir',        label: 'RIR',           type: 'number', unit: '',    min: 0, max: 10 },
  bar_speed:  { id: 'bar_speed',  label: 'Staafsnelheid', type: 'number', unit: 'm/s', min: 0, max: 5 },
  peak_power: { id: 'peak_power', label: 'Piekvermogen',  type: 'number', unit: 'W',   min: 0, max: 10000 },
  gewicht:    { id: 'gewicht',    label: 'Gewicht',       type: 'number', unit: 'kg',  min: 0, max: 1000 },
  zone:       { id: 'zone',       label: 'Zone',          type: 'number', unit: '',    min: 1, max: 5 },
  pace:       { id: 'pace',       label: 'Tempo min/km',  type: 'text',   unit: '' },
  hartslag:   { id: 'hartslag',   label: 'Hartslag',      type: 'number', unit: 'bpm', min: 0, max: 250 },
} as const
export type BlockParamId = keyof typeof BLOCK_PARAMS

function matchesParam(p: BlockParam, id: BlockParamId): boolean {
  // Oude rijen droegen id = label.toLowerCase() ('rir', 'tempo') of alleen een label.
  return p.id === id || p.label === BLOCK_PARAMS[id].label
}

export function hasParam(params: BlockParam[] | undefined, id: BlockParamId): boolean {
  return (params ?? []).some(p => matchesParam(p, id))
}

export function paramValue(params: BlockParam[] | undefined, id: BlockParamId): string | number | null {
  const p = (params ?? []).find(x => matchesParam(x, id))
  if (!p || p.value == null || p.value === '') return null
  if (BLOCK_PARAMS[id].type === 'number') {
    const n = typeof p.value === 'number' ? p.value : Number(p.value)
    return Number.isFinite(n) ? n : null
  }
  return p.value
}

/** null = verwijderen; anders vervangen of toevoegen met de vaste metadata. */
export function withParam(
  params: BlockParam[] | undefined,
  id: BlockParamId,
  value: string | number | null,
): BlockParam[] {
  const rest = (params ?? []).filter(p => !matchesParam(p, id))
  if (value == null || value === '') return rest
  const meta = BLOCK_PARAMS[id]
  const param: BlockParam = { id: meta.id, label: meta.label, type: meta.type, unit: meta.unit, value }
  if ('min' in meta) param.min = meta.min
  if ('max' in meta) param.max = meta.max
  return [...rest, param]
}

// ── Tekst ────────────────────────────────────────────────────────────────────

export function fmtMmSs(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Het voorschrift van een rij als korte regel: "3 × 8", "4 × 8/6/6/4",
 * "3 × 5+", "3 × 30 sec L+R". Pauze en afvinken hebben een eigen woord,
 * een notitie heeft geen voorschrift.
 */
export function formatBlockPrescription(b: Pick<PlannerBlock,
  'blockKind' | 'sets' | 'setsMax' | 'reps' | 'repsMax' | 'repUnit' | 'repsPerSet' | 'amrap' | 'completionOnly' | 'durationSec'
>): string {
  if (b.blockKind === 'BREAK') return `Pauze ${fmtMmSs(b.durationSec ?? 0)}`
  if (b.blockKind === 'NOTE') return ''
  if (b.completionOnly) return 'Afvinken'
  const sets = b.setsMax != null && b.setsMax !== b.sets ? `${b.sets}-${b.setsMax}` : `${b.sets}`
  let reps = b.repsPerSet && b.repsPerSet.length > 0
    ? b.repsPerSet.join('/')
    : b.repsMax != null && b.repsMax !== b.reps ? `${b.reps}-${b.repsMax}` : `${b.reps}`
  if (b.amrap) reps += '+'
  const unit = isRepBasedUnit(b.repUnit) ? '' : ` ${b.repUnit.replace('/zijde', '')}`
  const lr = isPerSideUnit(b.repUnit) ? ' L+R' : ''
  return `${sets} × ${reps}${unit}${lr}`
}

// ── Afleidingen ──────────────────────────────────────────────────────────────

/**
 * De soort van een training volgt de oefeningen. Gelijkspel of geen
 * oefeningen: de huidige soort blijft staan.
 */
export function dominantCategory(
  blocks: { blockKind: BlockKind; exerciseCategory: string | null }[],
  current: Category | null,
): Category | null {
  const telling = new Map<Category, number>()
  for (const b of blocks) {
    if (b.blockKind !== 'EXERCISE' || !b.exerciseCategory) continue
    const c = b.exerciseCategory as Category
    telling.set(c, (telling.get(c) ?? 0) + 1)
  }
  if (telling.size === 0) return current
  const hoogste = Math.max(...telling.values())
  const winnaars = [...telling.entries()].filter(([, n]) => n === hoogste).map(([c]) => c)
  if (winnaars.length === 1) return winnaars[0]
  if (current && winnaars.includes(current)) return current
  return current ?? winnaars[0]
}

/** Duur van de hele lijst: oefeningen via de bestaande schatting, pauzes letterlijk. */
export function durationFromBlocks(
  blocks: Pick<PlannerBlock, 'blockKind' | 'sets' | 'reps' | 'repUnit' | 'restTime' | 'repsPerSet' | 'durationSec'>[],
): number {
  const oefeningen = blocks
    .filter(b => b.blockKind === 'EXERCISE')
    .map(b => ({
      sets: b.sets,
      reps: b.repsPerSet && b.repsPerSet.length > 0
        ? Math.round(b.repsPerSet.reduce((a, n) => a + n, 0) / b.repsPerSet.length)
        : b.reps,
      repUnit: b.repUnit,
      restTime: b.restTime ?? null,
    }))
  const pauzes = blocks
    .filter(b => b.blockKind === 'BREAK')
    .reduce((s, b) => s + (b.durationSec ?? 0), 0)
  return durationFromExercises(oefeningen) + pauzes
}

// ── Groepen ──────────────────────────────────────────────────────────────────

export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

export function parseGroups(raw: unknown): ItemGroups {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ItemGroups = {}
  for (const [letter, g] of Object.entries(raw as Record<string, unknown>)) {
    if (!(GROUP_LETTERS as readonly string[]).includes(letter)) continue
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    if (o.kind !== 'SUPERSET' && o.kind !== 'CIRCUIT') continue
    const group: ItemGroup = { kind: o.kind }
    if (typeof o.name === 'string' && o.name.trim()) group.name = o.name.trim()
    if (typeof o.description === 'string' && o.description.trim()) group.description = o.description.trim()
    if (typeof o.rounds === 'number' && o.rounds >= 1) group.rounds = Math.round(o.rounds)
    if (typeof o.timeCapSec === 'number' && o.timeCapSec > 0) group.timeCapSec = Math.round(o.timeCapSec)
    if (typeof o.restSec === 'number' && o.restSec >= 0) group.restSec = Math.round(o.restSec)
    out[letter] = group
  }
  return out
}

export function nextFreeGroupLetter(
  blocks: { supersetGroup: string | null }[],
  groups: ItemGroups,
): string | null {
  const bezet = new Set<string>([...Object.keys(groups), ...blocks.map(b => b.supersetGroup).filter((l): l is string => !!l)])
  return GROUP_LETTERS.find(l => !bezet.has(l)) ?? null
}

export function groupLabel(letter: string, groups: ItemGroups): string {
  const g = groups[letter]
  if (!g || g.kind === 'SUPERSET') return `${letter} · Superset`
  const rondes = g.rounds ?? 1
  const rondeTekst = `${rondes} ronde${rondes === 1 ? '' : 's'}`
  return g.name ? `${letter} · ${g.name}, ${rondeTekst}` : `${letter} · Circuit ${rondeTekst}`
}
