# Planner-blokken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De weekplanner krijgt per dag een "+ Oefening"-knop die één brede pop-up opent (typenbalk links, volledig formulier rechts) waarmee een therapeut oefeningen, cardio, circuits, notities en pauzes als één geordende bloklijst op een training zet; de web-sessie-runner van de atleet leest die blokken.

**Architecture:** De bestaande tabel `week_schedule_day_item_exercises` wordt de bloklijst (kolom `blockKind`, `exerciseId` nullable, nieuwe velden voor per-set-reps, AMRAP, fase en opties). Groepen (superset/circuit) staan als JSON op het workout-item en reizen via `listItemContents`. Eén pure module `src/lib/planner-blocks.ts` levert types, formatter en afleidingen aan server, planner en runner; de server filtert niet-oefeningsrijen weg uit het bestaande `exercises`-veld zodat de iOS-app ongewijzigd blijft werken.

**Tech Stack:** Next.js 16 (App Router), tRPC + zod 4, Prisma 7 (Supabase Postgres), React 19, Tailwind + `@/components/dark-ui`, Radix (dialog, switch, select), vitest 4.

Spec: `docs/superpowers/specs/2026-09-13-planner-blokken-design.md`.

## Global Constraints

- **Dev-database = productie.** `.env.local` wijst naar de Supabase-pooler van prod. De migratie (`supabase/migrations/20260913_planner_blokken.sql`) is additief en achterwaarts compatibel, maar wordt pas uitgevoerd na een expliciet akkoord van Jurre (zie `feedback_no_autonomous_builds`). Tot die tijd: code schrijven, `tsc` en vitest draaien; de browsercheck (Taak 14) wacht op de migratie.
- **TS2589-valkuil:** nooit een Prisma `Json`-kolom (`repsPerSet`, `groups`, `cardioParams`, `extraParams`) ongecast door een tRPC-return laten gaan die door react-query `setData`/utils loopt. Altijd casten naar een plat type in de server-return. `groups` en `repsPerSet` nooit in `listWithItems` opnemen.
- **Kolomnamen** in SQL volgen de Prisma-veldnamen, camelCase tussen dubbele aanhalingstekens (`"blockKind"`), zoals `20260607_planner_item_exercises.sql`.
- **UI-copy** volgt `docs/tone-of-voice.md` §8 en de blacklist: geen em-dashes of en-dashes, geen emoji, volledige zinnen in hints. Labels in hoofdletters via `MetaLabel`/`.athletic-label` (Figtree), cijfers en voorschriften in `.athletic-mono`.
- **Ontwerpsysteem** (`docs/app-ontwerpsysteem.md`): Instrument-uitvoering, afronding 10 tot 14 px in de app (niet 0), oranje `P.brand` = actie, kleuren per soort via `useCategoryColors()` (echte hexcodes, nooit `var()` waar een alpha achter komt).
- **Geen slepen van rijen** in deze ronde; volgorde via pijltjes.
- **iOS blijft ongewijzigd:** `patient.getTodayExercises().exercises` en `calendarRange` mogen alleen EXERCISE-rijen bevatten; `reps` op een rij is altijd gevuld (set 1 bij een per-set-schema).
- **Commits** eindigen met `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Branch: `feat/planner-blokken`.
- Kopieerpaden (`copyItemToDay`, opslaan als programma, plan toepassen) gaan door één helper (`copyBlockColumns`), zodat een nieuwe kolom niet stil wegvalt.

---

## Bestandsoverzicht

| Bestand | Rol |
|---|---|
| `supabase/migrations/20260913_planner_blokken.sql` (nieuw) | Kolommen op de rijen-tabel en `groups` op het item. |
| `prisma/schema.prisma` | Zelfde velden in het model. |
| `src/lib/planner-blocks.ts` (nieuw) | Types (`PlannerBlock`, `BlockDraft`, `ItemGroups`), `formatBlockPrescription`, `dominantCategory`, `durationFromBlocks`, `parseGroups`, `nextFreeGroupLetter`, param-helpers. Puur. |
| `src/lib/__tests__/planner-blocks.test.ts` (nieuw) | Tests voor het bovenstaande. |
| `src/server/lib/planner-block-schema.ts` (nieuw) | zod: `blockInputSchema`, `itemGroupsSchema`. |
| `src/lib/__tests__/planner-block-schema.test.ts` (nieuw) | Tests voor de validatie. |
| `src/server/lib/planner-block-columns.ts` (nieuw) | `BLOCK_SELECT`, `toPlannerBlock`, `blockCreateData`, `copyBlockColumns`. |
| `src/server/routers/weekSchedules.ts` | `copyItemToDay`, `listItemContents`, `setItemExercises`, nieuw `ensureDayWorkout` en `setItemGroups`, opslaan-als-programma-pad. |
| `src/server/routers/patient.ts` | `mapProgramExercise` (nieuwe velden), `getTodayExercises` (filter + `blocks`), `calendarRange` (`_count`-filter), `logSession` (`trackMax`). |
| `src/components/week-planner/block-forms/fields.tsx` (nieuw) | `Field`, `NumField`, `OptionSwitch`, `Segmented`, `RangeToggle`, `MmSsInput`, `ExerciseCombobox`, `GroupSelect`. |
| `src/components/week-planner/block-forms/ExerciseForm.tsx` (nieuw) | Oefening- en cardio-formulier (één component, `mode`). |
| `src/components/week-planner/block-forms/CircuitForm.tsx` (nieuw) | Circuit-formulier. |
| `src/components/week-planner/block-forms/NoteForm.tsx`, `BreakForm.tsx` (nieuw) | Notitie en pauze. |
| `src/components/week-planner/ExerciseBlockDialog.tsx` (nieuw) | De pop-up: balk, kop, formulierkeuze, onderbalk, blijft-open-gedrag. |
| `src/components/week-planner/BlockRows.tsx` (nieuw) | Compacte rijen (dagcel en zijpaneel) met bewerken/verwijderen/volgorde. |
| `src/components/week-planner/useBlockMutations.ts` (nieuw) | Eén plek voor `setItemExercises`/`setItemGroups` met invalidaties. |
| `src/components/week-planner/CategoryIcon.tsx` (nieuw) | `CategoryIcon` + `CATEGORY_LABELS`, verhuisd uit `QuickExerciseBuilder`. |
| `src/app/(therapist)/therapist/week-planner/page.tsx` | Dagcel met rijen en "+ Oefening", `…`-menu, dialoog-wiring, zijpaneel. |
| `src/app/(coach)/coach/plans/[id]/page.tsx` | Zelfde rijen en dialoog op sjabloon-dagen. |
| `src/components/week-planner/QuickExerciseBuilder.tsx` | Verwijderd in Taak 12. |
| `src/lib/session-sets.ts`, `src/components/session/SetRows.tsx` | Per-set doel-reps, kg-veld verbergen. |
| `src/app/(athlete)/athlete/session/page.tsx`, `athlete/schedule/page.tsx` | Runner en agenda lezen blokken. |

---

### Taak 1: Pure module `planner-blocks.ts` met tests

**Files:**
- Create: `src/lib/planner-blocks.ts`
- Test: `src/lib/__tests__/planner-blocks.test.ts`

**Interfaces:**
- Consumes: `durationFromExercises` uit `src/lib/planned-load.ts` (signatuur `(exercises: { sets: number; reps: number; repUnit?: string | null; restTime?: number | null }[]) => number`); `isRepBasedUnit`, `isPerSideUnit`, `PER_SIDE_UNIT`, `PER_SIDE_SEC_UNIT` uit `src/lib/program-constants.ts`.
- Produces (alle latere taken leunen hierop, namen exact zo):
  - types `BlockKind`, `BlockPhase`, `GroupKind`, `Category`, `BlockParam`, `ItemGroup`, `ItemGroups`, `PlannerBlock`, `BlockDraft`, `BlockInput`, `BlockParamId`
  - `newBlock(kind, patch?) => BlockDraft`, `toBlockPayload(b) => BlockInput`
  - `BLOCK_PARAMS`, `paramValue(params, id)`, `withParam(params, id, value)`, `hasParam(params, id)`
  - `fmtMmSs(sec)`, `formatBlockPrescription(b)`, `dominantCategory(blocks, current)`, `durationFromBlocks(blocks)`
  - `parseGroups(raw)`, `GROUP_LETTERS`, `nextFreeGroupLetter(blocks, groups)`, `groupLabel(letter, groups)`, `isExerciseBlock(b)`

- [ ] **Stap 1: Schrijf de falende tests**

```ts
// src/lib/__tests__/planner-blocks.test.ts
import { describe, expect, it } from 'vitest'
import {
  dominantCategory, durationFromBlocks, formatBlockPrescription, fmtMmSs,
  newBlock, nextFreeGroupLetter, parseGroups, paramValue, withParam, groupLabel,
  toBlockPayload, isExerciseBlock,
} from '../planner-blocks'

const oef = (patch: Parameters<typeof newBlock>[1] = {}) =>
  newBlock('EXERCISE', { exerciseId: 'x', exerciseName: 'Squat', exerciseCategory: 'STRENGTH', ...patch })

describe('formatBlockPrescription', () => {
  it('toont sets × reps', () => {
    expect(formatBlockPrescription(oef({ sets: 3, reps: 8 }))).toBe('3 × 8')
  })
  it('toont een per-set-schema met schuine strepen', () => {
    expect(formatBlockPrescription(oef({ sets: 4, reps: 8, repsPerSet: [8, 6, 6, 4] }))).toBe('4 × 8/6/6/4')
  })
  it('zet een plus bij AMRAP', () => {
    expect(formatBlockPrescription(oef({ sets: 3, reps: 5, amrap: true }))).toBe('3 × 5+')
  })
  it('toont bereiken en tijd-eenheden', () => {
    expect(formatBlockPrescription(oef({ sets: 2, setsMax: 3, reps: 8, repsMax: 12 }))).toBe('2-3 × 8-12')
    expect(formatBlockPrescription(oef({ sets: 3, reps: 30, repUnit: 'sec' }))).toBe('3 × 30 sec')
  })
  it('markeert per zijde met L+R en laat /zijde uit de eenheid', () => {
    expect(formatBlockPrescription(oef({ sets: 3, reps: 12, repUnit: 'reps/zijde' }))).toBe('3 × 12 L+R')
    expect(formatBlockPrescription(oef({ sets: 3, reps: 30, repUnit: 'sec/zijde' }))).toBe('3 × 30 sec L+R')
  })
  it('afvinken, pauze en notitie', () => {
    expect(formatBlockPrescription(oef({ completionOnly: true }))).toBe('Afvinken')
    expect(formatBlockPrescription(newBlock('BREAK', { durationSec: 180 }))).toBe('Pauze 3:00')
    expect(formatBlockPrescription(newBlock('NOTE', { text: 'hoi' }))).toBe('')
  })
})

describe('fmtMmSs', () => {
  it('formatteert seconden als m:ss', () => {
    expect(fmtMmSs(90)).toBe('1:30')
    expect(fmtMmSs(5)).toBe('0:05')
    expect(fmtMmSs(720)).toBe('12:00')
  })
})

describe('dominantCategory', () => {
  it('kiest de meest voorkomende categorie van oefeningsrijen', () => {
    const blocks = [
      oef({ exerciseCategory: 'STRENGTH' }), oef({ exerciseCategory: 'MOBILITY' }), oef({ exerciseCategory: 'STRENGTH' }),
      newBlock('NOTE', { text: 'x' }),
    ]
    expect(dominantCategory(blocks, 'MOBILITY')).toBe('STRENGTH')
  })
  it('laat de huidige staan bij gelijkspel en zonder oefeningen', () => {
    expect(dominantCategory([oef({ exerciseCategory: 'STRENGTH' }), oef({ exerciseCategory: 'MOBILITY' })], 'MOBILITY')).toBe('MOBILITY')
    expect(dominantCategory([newBlock('BREAK', { durationSec: 60 })], 'CARDIO')).toBe('CARDIO')
    expect(dominantCategory([], null)).toBe(null)
  })
})

describe('durationFromBlocks', () => {
  it('telt pauzes mee en notities niet, per-set gebruikt het gemiddelde', () => {
    const alleenOef = durationFromBlocks([oef({ sets: 3, reps: 10, restTime: 60 })])
    const metPauze = durationFromBlocks([oef({ sets: 3, reps: 10, restTime: 60 }), newBlock('BREAK', { durationSec: 120 }), newBlock('NOTE', { text: 'x' })])
    expect(metPauze).toBe(alleenOef + 120)
    // 8/6/6/4 gemiddeld 6 = zelfde duur als reps 6
    expect(durationFromBlocks([oef({ sets: 4, reps: 8, repsPerSet: [8, 6, 6, 4], restTime: 60 })]))
      .toBe(durationFromBlocks([oef({ sets: 4, reps: 6, restTime: 60 })]))
  })
})

describe('groepen', () => {
  it('parseGroups accepteert alleen geldige letters en soorten', () => {
    expect(parseGroups(null)).toEqual({})
    expect(parseGroups({ A: { kind: 'CIRCUIT', rounds: 3 }, Z: { kind: 'CIRCUIT' }, B: { kind: 'RAAR' } }))
      .toEqual({ A: { kind: 'CIRCUIT', rounds: 3 } })
  })
  it('nextFreeGroupLetter slaat gebruikte letters over', () => {
    expect(nextFreeGroupLetter([oef({ supersetGroup: 'A' })], { B: { kind: 'CIRCUIT' } })).toBe('C')
    expect(nextFreeGroupLetter([], {})).toBe('A')
    const vol = Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F'].map(l => [l, { kind: 'SUPERSET' as const }]))
    expect(nextFreeGroupLetter([], vol)).toBe(null)
  })
  it('groupLabel beschrijft superset en circuit', () => {
    expect(groupLabel('A', {})).toBe('A · Superset')
    expect(groupLabel('B', { B: { kind: 'CIRCUIT', rounds: 3 } })).toBe('B · Circuit 3 rondes')
    expect(groupLabel('C', { C: { kind: 'CIRCUIT', rounds: 1, name: 'Finisher' } })).toBe('C · Finisher, 1 ronde')
  })
})

describe('params', () => {
  it('withParam voegt toe, vervangt en verwijdert op id', () => {
    const p1 = withParam([], 'tempo', '3-1-2-0')
    expect(p1).toEqual([{ id: 'tempo', label: 'Tempo', type: 'text', unit: '', value: '3-1-2-0' }])
    const p2 = withParam(p1, 'tempo', '2-0-2-0')
    expect(p2).toHaveLength(1)
    expect(paramValue(p2, 'tempo')).toBe('2-0-2-0')
    expect(withParam(p2, 'tempo', null)).toEqual([])
  })
  it('paramValue vindt legacy RIR op label', () => {
    expect(paramValue([{ id: 'rir', label: 'RIR', type: 'number', value: 2 }], 'rir')).toBe(2)
    expect(paramValue([{ label: 'RIR', value: '3' }], 'rir')).toBe(3)
    expect(paramValue([], 'rir')).toBe(null)
  })
})

describe('toBlockPayload en isExerciseBlock', () => {
  it('geeft alle velden terug en laat naam en categorie weg', () => {
    const p = toBlockPayload(oef({ repsPerSet: [8, 6, 6], sets: 3, amrap: true, phase: 'WARMUP', trackMax: false }))
    expect(p).toMatchObject({ blockKind: 'EXERCISE', exerciseId: 'x', repsPerSet: [8, 6, 6], amrap: true, phase: 'WARMUP', trackMax: false, intensityType: 'NONE' })
    expect('exerciseName' in p).toBe(false)
  })
  it('isExerciseBlock eist soort en oefening', () => {
    expect(isExerciseBlock({ blockKind: 'EXERCISE', exerciseId: 'x' })).toBe(true)
    expect(isExerciseBlock({ blockKind: 'EXERCISE', exerciseId: null })).toBe(false)
    expect(isExerciseBlock({ blockKind: 'NOTE', exerciseId: null })).toBe(false)
  })
})
```

- [ ] **Stap 2: Draai de test, verwacht falen**

Run: `npx vitest run src/lib/__tests__/planner-blocks.test.ts`
Expected: FAIL, module `../planner-blocks` niet gevonden.

- [ ] **Stap 3: Schrijf de module**

```ts
// src/lib/planner-blocks.ts
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
```

- [ ] **Stap 4: Draai de test, verwacht slagen**

Run: `npx vitest run src/lib/__tests__/planner-blocks.test.ts`
Expected: PASS, alle tests groen.

- [ ] **Stap 5: Commit**

```bash
git add src/lib/planner-blocks.ts src/lib/__tests__/planner-blocks.test.ts
git commit -m "feat(planner): pure bloklijst-module met voorschrift-formatter en afleidingen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 2: Migratie, Prisma-schema en compile-fixes

**Files:**
- Create: `supabase/migrations/20260913_planner_blokken.sql`
- Modify: `prisma/schema.prisma` (model `WeekScheduleDayItem` ~regel 1076, model `WeekScheduleDayItemExercise` ~regel 1143)
- Modify: `src/server/routers/weekSchedules.ts` (`copyItemToDay` ~regel 243, `listItemContents` ~regel 1377, opslaan-als-programma ~regel 2148)
- Modify: `src/server/routers/patient.ts` (`getTodayExercises` ~regel 493)

**Interfaces:**
- Consumes: `isExerciseBlock` uit Taak 1.
- Produces: Prisma-velden `blockKind`, `repsPerSet`, `amrap`, `phase`, `isBodyweight`, `completionOnly`, `trackMax`, `text`, `videoUrl`, `durationSec` op `WeekScheduleDayItemExercise`; `groups` op `WeekScheduleDayItem`; `exerciseId`/`exercise` nullable.

- [ ] **Stap 1: Schrijf de migratie**

```sql
-- supabase/migrations/20260913_planner_blokken.sql
-- Planner-blokken: de rijen-tabel van een planner-workout wordt een geordende
-- lijst van oefeningen, notities en pauzes. Additief en achterwaarts
-- compatibel: bestaande rijen blijven EXERCISE met een gevulde exerciseId.
-- Kolomnamen volgen Prisma's veldnamen (camelCase, geen snake_case).
-- Ontwerp: docs/superpowers/specs/2026-09-13-planner-blokken-design.md

ALTER TABLE public.week_schedule_day_item_exercises
  ALTER COLUMN "exerciseId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "blockKind"      TEXT    NOT NULL DEFAULT 'EXERCISE',
  ADD COLUMN IF NOT EXISTS "repsPerSet"     JSONB,
  ADD COLUMN IF NOT EXISTS "amrap"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phase"          TEXT,
  ADD COLUMN IF NOT EXISTS "isBodyweight"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "completionOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trackMax"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "text"           TEXT,
  ADD COLUMN IF NOT EXISTS "videoUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "durationSec"    INTEGER;

-- Groepen (superset/circuit) per letter, als JSON op het workout-item.
ALTER TABLE public.week_schedule_day_items
  ADD COLUMN IF NOT EXISTS "groups" JSONB;
```

- [ ] **Stap 2: Werk het Prisma-schema bij**

In model `WeekScheduleDayItem`, direct onder `cardioParams Json?`:

```prisma
  /// Groepen (superset/circuit) per letter A..F: { kind, name?, rounds?,
  /// timeCapSec?, restSec? }. Zie lib/planner-blocks.ts `ItemGroups`. Reist
  /// via listItemContents, nooit via listWithItems (TS2589).
  groups Json?
```

In model `WeekScheduleDayItemExercise`: vervang de twee relatie-regels en voeg de nieuwe velden toe (na `extraParams`):

```prisma
  /// Sinds 2026-09-13 een bloklijst: EXERCISE (oefening), NOTE (tekst voor de
  /// atleet) of BREAK (pauze). Consumers die alleen oefeningen kennen filteren
  /// op blockKind = EXERCISE; zie lib/planner-blocks.ts.
  blockKind  String    @default("EXERCISE")
  exercise   Exercise? @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  exerciseId String?
```

en

```prisma
  // ── Blokvelden (2026-09-13) ─────────────────────────────────────────────
  /// number[], precies `sets` lang; null = overal `reps`. `reps` blijft set 1.
  repsPerSet     Json?
  /// `reps` is een minimum, de atleet doet zoveel mogelijk.
  amrap          Boolean  @default(false)
  /// WARMUP | COOLDOWN; null = hoofddeel. Zelfde woorden als ExerciseLog.phase.
  phase          String?
  isBodyweight   Boolean  @default(false)
  completionOnly Boolean  @default(false)
  /// null = volg Exercise.trackOneRepMax; false = geen 1RM/PR uit deze rij.
  trackMax       Boolean?
  /// NOTE: de tekst. BREAK: optionele tekst.
  text           String?
  videoUrl       String?
  /// BREAK: lengte in seconden.
  durationSec    Int?
```

- [ ] **Stap 3: Genereer de client en zie welke plekken breken**

Run: `npx prisma generate && npx tsc --noEmit 2>&1 | head -30`
Expected: fouten op `e.exercise.name` (weekSchedules.ts listItemContents), op `exerciseId` in `copyItemToDay` en het opslaan-als-programma-pad, en op `mapProgramExercise` in patient.ts.

- [ ] **Stap 4: Minimale fixes zodat alles weer compileert**

`weekSchedules.ts`, `listItemContents` (regels ~1386-1387):

```ts
          exerciseName: e.exercise?.name ?? null,
          exerciseCategory: e.exercise?.category ?? null,
```

`weekSchedules.ts`, `copyItemToDay` parametertype: `exerciseId: string` wordt `exerciseId: string | null`. Voeg aan het item-type toe `groups: Prisma.JsonValue | null` en in de `create`-data direct onder `cardioParams`: `groups: item.groups ?? Prisma.DbNull,`. (Taak 3 vervangt de oefeningen-mapping door de helper.)

`weekSchedules.ts`, opslaan als programma (~regel 2166, `inline.exercises.map`): een Program kent alleen oefeningen, dus notities en pauzes vallen hier bewust af:

```ts
import { isExerciseBlock } from '@/lib/planner-blocks'
// ...
            ...(inline && inline.exercises.some(isExerciseBlock)
              ? {
                  exercises: {
                    create: inline.exercises.filter(isExerciseBlock).map(ex => ({
```

`patient.ts`, `getTodayExercises` (~regel 493):

```ts
import { isExerciseBlock } from '@/lib/planner-blocks'
// ...
      if (item.kind === 'WORKOUT') {
        // Alleen oefeningsrijen naar clients die alleen oefeningen kennen (iOS).
        // Notities en pauzes komen additief mee als `blocks` (Taak 4).
        const exerciseRows = item.exercises.filter(isExerciseBlock)
        const exercises = exerciseRows.map(e =>
          mapProgramExercise({
            ...e,
            exercise: e.exercise!,
            week: 1,
            day: 1,
            restTime: e.restTime ?? 60,
          }),
        )
```

- [ ] **Stap 5: Controleer**

Run: `npx prisma validate && npx tsc --noEmit && npx vitest run`
Expected: geen fouten, alle tests groen.

- [ ] **Stap 6: Commit (migratie NIET uitvoeren zonder akkoord)**

```bash
git add supabase/migrations/20260913_planner_blokken.sql prisma/schema.prisma src/server/routers/weekSchedules.ts src/server/routers/patient.ts
git commit -m "feat(planner): bloklijst-kolommen op planner-rijen, groups op het item

Migratie is additief; uitvoeren met npx prisma db execute na akkoord.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 3: Server: validatie, kolom-helper, `setItemExercises`, `listItemContents`, kopieerpaden

**Files:**
- Create: `src/server/lib/planner-block-schema.ts`
- Create: `src/server/lib/planner-block-columns.ts`
- Test: `src/lib/__tests__/planner-block-schema.test.ts`
- Modify: `src/server/routers/weekSchedules.ts` (`copyItemToDay` ~243, `listItemContents` ~1321-1414, `setItemExercises` ~2205-2320)

**Interfaces:**
- Consumes: Taak 1 (`BlockInput`, `PlannerBlock`, `dominantCategory`, `durationFromBlocks`, `parseGroups`, `isExerciseBlock`), Taak 2 (Prisma-velden).
- Produces:
  - `blockInputSchema` (zod, valideert één `BlockInput`), `itemGroupsSchema` (zod voor `ItemGroups`).
  - `BLOCK_SELECT` (Prisma select van alle rij-kolommen + `exercise { name, category }`), `type BlockRow`, `toPlannerBlock(row: BlockRow): PlannerBlock`, `blockCreateData(input: BlockInput, itemId: string, order: number)`, `copyBlockColumns(row)`.
  - `listItemContents` geeft per item `{ itemId, cardioParams, groups: ItemGroups, blocks: PlannerBlock[], exercises: PlannerBlock[] }` (exercises = alleen EXERCISE-rijen, voor bestaande consumers).
  - `setItemExercises` accepteert `exercises: BlockInput[]`.

- [ ] **Stap 1: Schrijf de falende validatietest**

```ts
// src/lib/__tests__/planner-block-schema.test.ts
import { describe, expect, it } from 'vitest'
import { blockInputSchema, itemGroupsSchema } from '@/server/lib/planner-block-schema'

const basis = { blockKind: 'EXERCISE', exerciseId: 'x', sets: 3, reps: 8, repUnit: 'reps' }

describe('blockInputSchema', () => {
  it('accepteert een gewone oefening en vult defaults', () => {
    const r = blockInputSchema.safeParse(basis)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ amrap: false, isBodyweight: false, completionOnly: false, intensityType: 'NONE', supersetOrder: 0 })
  })
  it('weigert een oefening zonder exerciseId', () => {
    expect(blockInputSchema.safeParse({ ...basis, exerciseId: null }).success).toBe(false)
  })
  it('eist tekst bij een notitie en duur bij een pauze', () => {
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: '  ' }).success).toBe(false)
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: 'Verzamelen bij zaal 1' }).success).toBe(true)
    expect(blockInputSchema.safeParse({ blockKind: 'BREAK' }).success).toBe(false)
    expect(blockInputSchema.safeParse({ blockKind: 'BREAK', durationSec: 120 }).success).toBe(true)
  })
  it('eist precies sets elementen in repsPerSet', () => {
    expect(blockInputSchema.safeParse({ ...basis, sets: 4, repsPerSet: [8, 6, 6] }).success).toBe(false)
    expect(blockInputSchema.safeParse({ ...basis, sets: 4, repsPerSet: [8, 6, 6, 4] }).success).toBe(true)
  })
  it('accepteert alleen http(s)-videolinks', () => {
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: 'x', videoUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(blockInputSchema.safeParse({ blockKind: 'NOTE', text: 'x', videoUrl: 'https://youtu.be/abc' }).success).toBe(true)
  })
})

describe('itemGroupsSchema', () => {
  it('accepteert letters A..F met geldige velden', () => {
    expect(itemGroupsSchema.safeParse({ A: { kind: 'CIRCUIT', rounds: 3, timeCapSec: 720, restSec: 60 } }).success).toBe(true)
    expect(itemGroupsSchema.safeParse({ G: { kind: 'CIRCUIT' } }).success).toBe(false)
    expect(itemGroupsSchema.safeParse({ A: { kind: 'CIRCUIT', rounds: 11 } }).success).toBe(false)
  })
})
```

- [ ] **Stap 2: Draai de test, verwacht falen**

Run: `npx vitest run src/lib/__tests__/planner-block-schema.test.ts`
Expected: FAIL, module niet gevonden.

- [ ] **Stap 3: Schrijf het zod-schema**

```ts
// src/server/lib/planner-block-schema.ts
/**
 * Validatie van één rij in de bloklijst van een planner-workout (zie
 * lib/planner-blocks.ts) en van de groepen op het item. Los van de router
 * zodat het te testen is zonder Prisma.
 */
import { z } from 'zod'

export const blockParamSchema = z.object({
  id: z.string().max(60).optional(),
  label: z.string().min(1).max(60),
  type: z.string().max(20).optional(),
  value: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]).nullable().optional(),
  valueMax: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]).nullable().optional(),
  unit: z.string().max(20).optional(),
  options: z.array(z.string().max(60)).max(20).optional(),
  min: z.number().min(-1_000_000).max(1_000_000).optional(),
  max: z.number().min(-1_000_000).max(1_000_000).optional(),
})

const HTTP_URL = /^https?:\/\/\S+$/i

export const blockInputSchema = z.object({
  blockKind: z.enum(['EXERCISE', 'NOTE', 'BREAK']).default('EXERCISE'),
  exerciseId: z.string().nullable().optional(),
  sets: z.number().int().min(1).max(50).default(3),
  reps: z.number().int().min(1).max(1000).default(10),
  repUnit: z.string().max(20).default('reps'),
  restTime: z.number().int().min(0).max(3600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  setsMax: z.number().int().min(1).max(50).nullable().optional(),
  repsMax: z.number().int().min(1).max(1000).nullable().optional(),
  intensityType: z.enum(['NONE', 'RPE', 'PERCENT_1RM', 'RELATIVE_DAILY_MAX', 'TECHNIQUE', 'TEXT']).default('NONE'),
  intensityMin: z.number().min(-1000).max(1000).nullable().optional(),
  intensityMax: z.number().min(-1000).max(1000).nullable().optional(),
  intensityText: z.string().max(200).nullable().optional(),
  supersetGroup: z.string().max(4).nullable().optional(),
  supersetOrder: z.number().int().min(0).max(20).default(0),
  extraParams: z.array(blockParamSchema).max(20).default([]),
  repsPerSet: z.array(z.number().int().min(1).max(1000)).max(50).nullable().optional(),
  amrap: z.boolean().default(false),
  phase: z.enum(['WARMUP', 'COOLDOWN']).nullable().optional(),
  isBodyweight: z.boolean().default(false),
  completionOnly: z.boolean().default(false),
  trackMax: z.boolean().nullable().optional(),
  text: z.string().max(500).nullable().optional(),
  videoUrl: z.string().max(500).regex(HTTP_URL, 'Alleen een http(s)-link').nullable().optional(),
  durationSec: z.number().int().min(10).max(3600).nullable().optional(),
}).superRefine((b, ctx) => {
  if (b.blockKind === 'EXERCISE' && !b.exerciseId) {
    ctx.addIssue({ code: 'custom', path: ['exerciseId'], message: 'Kies een oefening' })
  }
  if (b.blockKind === 'NOTE' && !(b.text ?? '').trim()) {
    ctx.addIssue({ code: 'custom', path: ['text'], message: 'De notitie is leeg' })
  }
  if (b.blockKind === 'BREAK' && b.durationSec == null) {
    ctx.addIssue({ code: 'custom', path: ['durationSec'], message: 'Geef de pauze een duur' })
  }
  if (b.repsPerSet && b.repsPerSet.length !== b.sets) {
    ctx.addIssue({ code: 'custom', path: ['repsPerSet'], message: 'Vul voor elke set een aantal in' })
  }
})

export type BlockInputParsed = z.infer<typeof blockInputSchema>

export const itemGroupSchema = z.object({
  kind: z.enum(['SUPERSET', 'CIRCUIT']),
  name: z.string().max(60).optional(),
  rounds: z.number().int().min(1).max(10).optional(),
  timeCapSec: z.number().int().min(10).max(7200).optional(),
  restSec: z.number().int().min(0).max(600).optional(),
})

export const itemGroupsSchema = z.record(z.string().regex(/^[A-F]$/), itemGroupSchema)
```

- [ ] **Stap 4: Draai de test, verwacht slagen**

Run: `npx vitest run src/lib/__tests__/planner-block-schema.test.ts`
Expected: PASS.

- [ ] **Stap 5: Schrijf de kolom-helper**

```ts
// src/server/lib/planner-block-columns.ts
/**
 * Eén plek voor alle kolommen van een planner-rij. Elk kopieerpad
 * (copyItemToDay, plan toepassen, dupliceren) en elke lees-mapping gaat
 * hierlangs, zodat een nieuwe kolom niet stil wegvalt bij het kopiëren.
 */
import { Prisma } from '@prisma/client'
import type { BlockInput, PlannerBlock, BlockParam, IntensityTypeKey, BlockKind, BlockPhase } from '@/lib/planner-blocks'

export const BLOCK_SELECT = {
  id: true, order: true, blockKind: true, exerciseId: true,
  sets: true, reps: true, repUnit: true, restTime: true, notes: true,
  setsMax: true, repsMax: true,
  intensityType: true, intensityMin: true, intensityMax: true, intensityText: true,
  supersetGroup: true, supersetOrder: true, extraParams: true,
  repsPerSet: true, amrap: true, phase: true,
  isBodyweight: true, completionOnly: true, trackMax: true,
  text: true, videoUrl: true, durationSec: true,
  exercise: { select: { name: true, category: true } },
} satisfies Prisma.WeekScheduleDayItemExerciseSelect

export type BlockRow = Prisma.WeekScheduleDayItemExerciseGetPayload<{ select: typeof BLOCK_SELECT }>

function repsPerSetOf(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const nums = raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return nums.length > 0 ? nums : null
}

/** Prisma-rij → plat clienttype. Casts houden Prisma's recursieve JsonValue buiten de tRPC-return (TS2589). */
export function toPlannerBlock(e: BlockRow): PlannerBlock {
  return {
    id: e.id,
    order: e.order,
    blockKind: e.blockKind as BlockKind,
    exerciseId: e.exerciseId,
    exerciseName: e.exercise?.name ?? null,
    exerciseCategory: e.exercise?.category ?? null,
    sets: e.sets, reps: e.reps, repUnit: e.repUnit, restTime: e.restTime, notes: e.notes,
    setsMax: e.setsMax, repsMax: e.repsMax,
    intensityType: e.intensityType as IntensityTypeKey,
    intensityMin: e.intensityMin, intensityMax: e.intensityMax, intensityText: e.intensityText,
    supersetGroup: e.supersetGroup, supersetOrder: e.supersetOrder,
    extraParams: (e.extraParams ?? []) as BlockParam[],
    repsPerSet: repsPerSetOf(e.repsPerSet),
    amrap: e.amrap,
    phase: (e.phase === 'WARMUP' || e.phase === 'COOLDOWN' ? e.phase : null) as BlockPhase | null,
    isBodyweight: e.isBodyweight, completionOnly: e.completionOnly, trackMax: e.trackMax,
    text: e.text, videoUrl: e.videoUrl, durationSec: e.durationSec,
  }
}

/** Gevalideerde invoer → createMany-rij. */
export function blockCreateData(b: BlockInput, itemId: string, order: number): Prisma.WeekScheduleDayItemExerciseCreateManyInput {
  return {
    itemId, order,
    blockKind: b.blockKind,
    exerciseId: b.blockKind === 'EXERCISE' ? b.exerciseId : null,
    sets: b.sets, reps: b.reps, repUnit: b.repUnit,
    restTime: b.restTime ?? null, notes: b.notes ?? null,
    setsMax: b.setsMax ?? null, repsMax: b.repsMax ?? null,
    intensityType: b.intensityType ?? 'NONE',
    intensityMin: b.intensityMin ?? null, intensityMax: b.intensityMax ?? null,
    intensityText: b.intensityText ?? null,
    supersetGroup: b.supersetGroup ?? null, supersetOrder: b.supersetOrder ?? 0,
    extraParams: (b.extraParams ?? []) as Prisma.InputJsonValue,
    repsPerSet: b.repsPerSet && b.repsPerSet.length > 0 ? (b.repsPerSet as Prisma.InputJsonValue) : Prisma.DbNull,
    amrap: !!b.amrap, phase: b.phase ?? null,
    isBodyweight: !!b.isBodyweight, completionOnly: !!b.completionOnly, trackMax: b.trackMax ?? null,
    text: b.text ?? null, videoUrl: b.videoUrl ?? null, durationSec: b.durationSec ?? null,
  }
}

/** Bestaande rij → geneste create bij het kopiëren van een item. Alle kolommen, bewust uitgeschreven. */
export function copyBlockColumns(ex: {
  blockKind: string; exerciseId: string | null; order: number
  sets: number; reps: number; repUnit: string; restTime: number | null; notes: string | null
  setsMax: number | null; repsMax: number | null
  intensityType: Prisma.WeekScheduleDayItemExerciseCreateManyInput['intensityType']
  intensityMin: number | null; intensityMax: number | null; intensityText: string | null
  supersetGroup: string | null; supersetOrder: number
  extraParams: Prisma.JsonValue; repsPerSet: Prisma.JsonValue | null
  amrap: boolean; phase: string | null; isBodyweight: boolean; completionOnly: boolean
  trackMax: boolean | null; text: string | null; videoUrl: string | null; durationSec: number | null
}): Prisma.WeekScheduleDayItemExerciseCreateWithoutItemInput {
  return {
    blockKind: ex.blockKind,
    order: ex.order,
    sets: ex.sets, reps: ex.reps, repUnit: ex.repUnit, restTime: ex.restTime, notes: ex.notes,
    setsMax: ex.setsMax, repsMax: ex.repsMax,
    intensityType: ex.intensityType,
    intensityMin: ex.intensityMin, intensityMax: ex.intensityMax, intensityText: ex.intensityText,
    supersetGroup: ex.supersetGroup, supersetOrder: ex.supersetOrder,
    extraParams: (ex.extraParams ?? []) as Prisma.InputJsonValue,
    repsPerSet: ex.repsPerSet == null ? Prisma.DbNull : (ex.repsPerSet as Prisma.InputJsonValue),
    amrap: ex.amrap, phase: ex.phase, isBodyweight: ex.isBodyweight, completionOnly: ex.completionOnly,
    trackMax: ex.trackMax, text: ex.text, videoUrl: ex.videoUrl, durationSec: ex.durationSec,
    ...(ex.exerciseId ? { exercise: { connect: { id: ex.exerciseId } } } : {}),
  }
}
```

Let op: `WeekScheduleDayItemExerciseCreateWithoutItemInput` gebruikt de relatie (`exercise: { connect }`) in plaats van `exerciseId`. Als `tsc` klaagt dat `exerciseId` als scalar verwacht wordt, gebruik dan het type `Prisma.WeekScheduleDayItemExerciseUncheckedCreateWithoutItemInput` en `exerciseId: ex.exerciseId` in plaats van de connect-spread.

- [ ] **Stap 6: `copyItemToDay` op de helper zetten**

In `weekSchedules.ts` vervang je in `copyItemToDay` het parametertype van `exercises` door `Parameters<typeof copyBlockColumns>[0][]` en de mapping door:

```ts
      exercises: {
        create: item.exercises.map(copyBlockColumns),
      },
```

Voeg bovenaan toe: `import { BLOCK_SELECT, blockCreateData, copyBlockColumns, toPlannerBlock } from '@/server/lib/planner-block-columns'` en `import { blockInputSchema } from '@/server/lib/planner-block-schema'` en `import { dominantCategory, durationFromBlocks, parseGroups, isExerciseBlock } from '@/lib/planner-blocks'`. `COPY_ITEM_INCLUDE` blijft `{ exercises: { orderBy: { order: 'asc' } } }` (haalt alle kolommen op).

- [ ] **Stap 7: `listItemContents` geeft blokken en groepen terug**

Vervang de `select` op `exercises` en de return-mapping:

```ts
      const items = await ctx.prisma.weekScheduleDayItem.findMany({
        where,
        select: {
          id: true,
          cardioParams: true,
          groups: true,
          exercises: { select: BLOCK_SELECT, orderBy: { order: 'asc' } },
        },
      })
      return items.map((it) => {
        const blocks = it.exercises.map(toPlannerBlock)
        return {
          itemId: it.id,
          cardioParams: (it.cardioParams ?? null) as Record<string, unknown> | null,
          groups: parseGroups(it.groups),
          /** De volledige geordende lijst: oefeningen, notities, pauzes. */
          blocks,
          /** Alleen oefeningen, voor consumers van vóór de bloklijst (profielstrip, belasting). */
          exercises: blocks.filter(isExerciseBlock),
        }
      })
```

- [ ] **Stap 8: `setItemExercises` accepteert blokken en leidt duur en soort af**

Vervang de `.input(...)` door:

```ts
    .input(z.object({
      itemId: z.string(),
      exercises: z.array(blockInputSchema).max(60),
    }))
```

Vervang vanaf `const derivedDurationSec` tot en met de transactie door:

```ts
      // De inhoud bepaalt de duur, inclusief pauzes. Geen rijen meer → terug
      // naar wat er bij het toevoegen is ingetikt.
      const derivedDurationSec = input.exercises.length > 0 ? durationFromBlocks(input.exercises) : null

      const rpes = input.exercises
        .filter(e => e.blockKind === 'EXERCISE' && e.intensityType === 'RPE' && (e.intensityMin != null || e.intensityMax != null))
        .map(e => {
          const lo = e.intensityMin ?? e.intensityMax!
          const hi = e.intensityMax ?? e.intensityMin!
          return (lo + hi) / 2
        })
      const derivedRpe = rpes.length > 0
        ? Math.min(10, Math.max(1, Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length)))
        : null

      // Dag = training: de soort volgt de oefeningen, behalve bij een
      // cardio-item met blokken (dat blijft CARDIO) en bij een gelijkspel.
      const exerciseIds = [...new Set(input.exercises.filter(isExerciseBlock).map(e => e.exerciseId))]
      const cats = exerciseIds.length > 0
        ? await ctx.prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true, category: true } })
        : []
      const catById = new Map(cats.map(c => [c.id, c.category as string]))
      const derivedCategory = item.cardioParams
        ? null
        : dominantCategory(
            input.exercises.map(e => ({ blockKind: e.blockKind, exerciseCategory: e.exerciseId ? catById.get(e.exerciseId) ?? null : null })),
            (item.quickCategory ?? null) as Parameters<typeof dominantCategory>[1],
          )

      await ctx.prisma.$transaction([
        ctx.prisma.weekScheduleDayItem.update({
          where: { id: input.itemId },
          data: {
            plannedDurationSec: derivedDurationSec,
            ...(derivedRpe != null ? { plannedRpe: derivedRpe } : {}),
            ...(derivedCategory && derivedCategory !== item.quickCategory ? { quickCategory: derivedCategory } : {}),
          },
        }),
        ctx.prisma.weekScheduleDayItemExercise.deleteMany({ where: { itemId: input.itemId } }),
        ...(input.exercises.length > 0
          ? [ctx.prisma.weekScheduleDayItemExercise.createMany({
              data: input.exercises.map((e, i) => blockCreateData(e, input.itemId, i)),
            })]
          : []),
      ])
      return { ok: true, count: input.exercises.length }
```

`item` komt uit de bestaande `findUnique` bovenin de mutatie (die `include: { day: ... }` heeft, dus `item.quickCategory` en `item.cardioParams` zijn beschikbaar).

- [ ] **Stap 9: Controleer**

Run: `npx tsc --noEmit && npx vitest run`
Expected: schoon en groen. Let bij `tsc` speciaal op TS2589 in `week-planner/page.tsx` en `coach/plans/[id]/page.tsx` (die lezen `listItemContents`); komt die, dan is een cast in de server-return vergeten.

- [ ] **Stap 10: Commit**

```bash
git add src/server/lib/planner-block-schema.ts src/server/lib/planner-block-columns.ts src/lib/__tests__/planner-block-schema.test.ts src/server/routers/weekSchedules.ts
git commit -m "feat(planner): setItemExercises slaat blokken op, listItemContents geeft blokken en groepen terug

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 4: Server: `ensureDayWorkout`, `setItemGroups` en de atleet-kant

**Files:**
- Modify: `src/server/routers/weekSchedules.ts` (nieuwe procedures naast `addItem` ~1415 en `updateItem` ~1544)
- Modify: `src/server/routers/patient.ts` (`mapProgramExercise` ~124-215, `getTodayExercises` ~493-530, `calendarRange` ~2235, `logSession` ~855-870)

**Interfaces:**
- Consumes: Taak 1 (`parseGroups`, `isExerciseBlock`), Taak 3 (`itemGroupsSchema`, `BLOCK_SELECT`).
- Produces:
  - `weekSchedules.ensureDayWorkout({ dayId }) => { id: string; created: boolean }`
  - `weekSchedules.setItemGroups({ itemId, groups: ItemGroups }) => { ok: true }`
  - `patient.getTodayExercises(...).plannedItem.blocks: AthleteBlock[]` en `.groups: ItemGroups`, waarbij `AthleteBlock = { id, order, blockKind, text, videoUrl, durationSec, phase, supersetGroup }`.
  - `mapProgramExercise` levert extra `repsPerSet: number[] | null`, `amrap: boolean`, `isBodyweight: boolean`, `completionOnly: boolean`, `trackMax: boolean | null`, `phase: 'WARMUP' | 'COOLDOWN' | null`.

- [ ] **Stap 1: `ensureDayWorkout` direct boven `updateItem`**

```ts
  /**
   * Dag = training. Geeft het laatste WORKOUT-item van de dag terug of maakt
   * er één aan, zodat "+ Oefening" op een lege dag meteen ergens in kan.
   * De naam en duur zijn plaatsvervangers: setItemExercises leidt de duur en
   * de soort daarna uit de inhoud af.
   */
  ensureDayWorkout: coachStaffProcedure
    .input(z.object({ dayId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const day = await ctx.prisma.weekScheduleDay.findUnique({
        where: { id: input.dayId },
        include: { weekSchedule: { select: { creatorId: true, practiceId: true, patientId: true } } },
      })
      if (!day) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = day.weekSchedule.creatorId === ctx.user.id
      const isSamePractice = inSamePractice(ctx.user, day.weekSchedule.practiceId)
      if (!isAdmin && !isOwner && !isSamePractice) throw new TRPCError({ code: 'FORBIDDEN' })
      await assertMagPlannen(ctx.prisma, ctx.user, day.weekSchedule.patientId)

      const bestaand = await ctx.prisma.weekScheduleDayItem.findFirst({
        where: { dayId: input.dayId, kind: 'WORKOUT' },
        orderBy: { order: 'desc' },
        select: { id: true },
      })
      if (bestaand) return { id: bestaand.id, created: false }

      const laatste = await ctx.prisma.weekScheduleDayItem.aggregate({ where: { dayId: input.dayId }, _max: { order: true } })
      const nieuw = await ctx.prisma.weekScheduleDayItem.create({
        data: {
          dayId: input.dayId,
          order: (laatste._max.order ?? -1) + 1,
          kind: 'WORKOUT',
          quickCategory: 'STRENGTH',
          quickName: 'Training',
          quickDurationSec: 45 * 60,
        },
        select: { id: true },
      })
      return { id: nieuw.id, created: true }
    }),

  /** Vervangt de groepen (superset/circuit per letter) van een workout-item. */
  setItemGroups: coachStaffProcedure
    .input(z.object({ itemId: z.string(), groups: itemGroupsSchema }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.weekScheduleDayItem.findUnique({
        where: { id: input.itemId },
        include: { day: { include: { weekSchedule: { select: { creatorId: true, practiceId: true, patientId: true } } } } },
      })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = item.day.weekSchedule.creatorId === ctx.user.id
      const isSamePractice = inSamePractice(ctx.user, item.day.weekSchedule.practiceId)
      if (!isAdmin && !isOwner && !isSamePractice) throw new TRPCError({ code: 'FORBIDDEN' })
      await assertMagPlannen(ctx.prisma, ctx.user, item.day.weekSchedule.patientId)
      await ctx.prisma.weekScheduleDayItem.update({
        where: { id: input.itemId },
        data: { groups: Object.keys(input.groups).length > 0 ? (input.groups as Prisma.InputJsonValue) : Prisma.DbNull },
        select: { id: true },
      })
      return { ok: true as const }
    }),
```

Importeer `itemGroupsSchema` uit `@/server/lib/planner-block-schema` (naast de import uit Taak 3). Controleer dat `addItem` géén `groups`/`cardioParams` teruggeeft in zijn return (bestaande `omit`); `ensureDayWorkout` geeft alleen `{ id, created }` terug.

- [ ] **Stap 2: `mapProgramExercise` neemt de blokvelden mee**

Voeg aan het parametertype toe (na `extraParams?: unknown`):

```ts
  repsPerSet?: unknown
  amrap?: boolean
  isBodyweight?: boolean
  completionOnly?: boolean
  trackMax?: boolean | null
  phase?: string | null
```

en aan de return (na `defaultExtraParams`):

```ts
    // Blokvelden uit de planner (ProgramExercise heeft ze niet: dan de defaults).
    repsPerSet: Array.isArray(pe.repsPerSet)
      ? (pe.repsPerSet as unknown[]).filter((n): n is number => typeof n === 'number')
      : null,
    amrap: pe.amrap ?? false,
    isBodyweight: pe.isBodyweight ?? false,
    completionOnly: pe.completionOnly ?? false,
    trackMax: pe.trackMax ?? null,
    phase: (pe.phase === 'WARMUP' || pe.phase === 'COOLDOWN' ? pe.phase : null) as 'WARMUP' | 'COOLDOWN' | null,
```

- [ ] **Stap 3: `getTodayExercises` geeft `blocks` en `groups` mee**

In de `plannedItem`-return (na `cardio:`):

```ts
            // De volledige bloklijst (oefeningen, notities, pauzes) in volgorde.
            // Additief: iOS negeert dit en leest `exercises`.
            blocks: item.exercises.map(b => ({
              id: b.id,
              order: b.order,
              blockKind: b.blockKind as 'EXERCISE' | 'NOTE' | 'BREAK',
              text: b.text,
              videoUrl: b.videoUrl,
              durationSec: b.durationSec,
              phase: (b.phase === 'WARMUP' || b.phase === 'COOLDOWN' ? b.phase : null) as 'WARMUP' | 'COOLDOWN' | null,
              supersetGroup: b.supersetGroup,
            })),
            groups: parseGroups(item.groups),
```

Zorg dat de `findFirst` van het item `groups` meeneemt: de bestaande query gebruikt `include`, dus alle scalars (ook `groups`) komen al mee. Importeer `parseGroups` uit `@/lib/planner-blocks`.

- [ ] **Stap 4: `calendarRange` telt alleen oefeningsrijen**

Vervang `_count: { select: { exercises: true } }` door:

```ts
                    _count: { select: { exercises: { where: { blockKind: 'EXERCISE' } } } },
```

Doe hetzelfde op elke andere plek waar `_count: { select: { exercises: true } }` op een `weekScheduleDayItem` staat (`grep -n "exercises: true" src/server/routers/*.ts`).

- [ ] **Stap 5: `logSession` respecteert `trackMax = false`**

Boven de `sessionLog.create` in `logSession`, na het bepalen van de invoer:

```ts
      // Rijen waarop de therapeut "max bijhouden" uitzette: geen 1RM-schatting,
      // ook niet de Epley-terugval hieronder.
      const geenMax = new Set<string>()
      if (input.weekScheduleDayItemId) {
        const rijen = await ctx.prisma.weekScheduleDayItemExercise.findMany({
          where: { itemId: input.weekScheduleDayItemId, trackMax: false, exerciseId: { not: null } },
          select: { exerciseId: true },
        })
        for (const r of rijen) if (r.exerciseId) geenMax.add(r.exerciseId)
      }
```

en in de exercises-mapping:

```ts
                estimatedOneRepMax: geenMax.has(ex.exerciseId)
                  ? null
                  : ex.estimatedOneRepMax ?? estimateOneRepMax(weight, top.reps ?? ex.repsCompleted),
```

- [ ] **Stap 6: Controleer en commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: schoon en groen.

```bash
git add src/server/routers/weekSchedules.ts src/server/routers/patient.ts
git commit -m "feat(planner): ensureDayWorkout en setItemGroups; atleet krijgt blokken en groepen mee

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 5: UI-bouwstenen voor de formulieren

**Files:**
- Create: `src/components/week-planner/CategoryIcon.tsx`
- Create: `src/components/week-planner/block-forms/fields.tsx`
- Modify: `src/components/week-planner/QuickExerciseBuilder.tsx` (alleen: `CategoryIcon`/`CATEGORY_LABELS` re-exporteren uit het nieuwe bestand, eigen definitie weg)

**Interfaces:**
- Consumes: `DarkInput`, `DarkMenuSelect`, `MetaLabel`, `P` uit `@/components/dark-ui`; `NumberField` uit `@/components/dark-ui/NumberField` (`{ value: number; onCommit: (n: number) => void; min?; max?; step?; className?; 'aria-label'? }`); `useCategoryColors()`; `trpc.exercises.list`; `SUPERSET_COLORS` uit `@/lib/program-constants`; Taak 1 (`GROUP_LETTERS`, `groupLabel`, `ItemGroups`, `Category`).
- Produces (gebruikt door Taken 6 t/m 9):
  - `CategoryIcon({ category, size })`, `CATEGORY_LABELS: Record<Category, string>`
  - `Field({ label, hint?, children, className? })`
  - `NullableNumField({ value: number | null; onChange(v: number | null); min; max; step?; placeholder?; ariaLabel; className? })`
  - `OptionSwitch({ checked; onCheckedChange; label; hint?; disabled? })`
  - `Segmented<T extends string>({ value: T; options: { value: T; label: string }[]; onChange(v: T); ariaLabel })`
  - `RangeToggle({ isRange; onToggle; title? })`
  - `MmSsInput({ valueSec: number | null; onChange(sec: number | null); ariaLabel; className? })`
  - `ExerciseCombobox({ value: ExerciseCandidate | null; onChange(c: ExerciseCandidate | null); defaultCategory: Category | null; categories?: Category[]; autoFocus?; inputRef? })` en `type ExerciseCandidate = { id; name; category; defaultRepUnit?; isUnilateral? }`
  - `GroupSelect({ value: string | null; onChange(v: string | null); groups: ItemGroups })`

- [ ] **Stap 1: `CategoryIcon.tsx`**

```tsx
// src/components/week-planner/CategoryIcon.tsx
'use client'

import { IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore } from '@/components/icons'
import type { Category } from '@/lib/planner-blocks'

export const CATEGORY_LABELS: Record<Category, string> = {
  STRENGTH: 'Kracht',
  MOBILITY: 'Mobiliteit',
  PLYOMETRICS: 'Plyometrie',
  CARDIO: 'Cardio',
  STABILITY: 'Stabiliteit',
}

export function CategoryIcon({ category, size = 14 }: { category: Category; size?: number }) {
  switch (category) {
    case 'STRENGTH': return <IconStrength size={size} />
    case 'MOBILITY': return <IconMobility size={size} />
    case 'PLYOMETRICS': return <IconPlyometrics size={size} />
    case 'CARDIO': return <IconCardio size={size} />
    case 'STABILITY': return <IconCore size={size} />
  }
}
```

In `QuickExerciseBuilder.tsx`: verwijder de eigen `CATEGORY_LABELS` en `CategoryIcon` en zet erin `export { CategoryIcon, CATEGORY_LABELS } from './CategoryIcon'` (het `Category`-type daar blijft staan tot Taak 11).

- [ ] **Stap 2: `fields.tsx`**

```tsx
// src/components/week-planner/block-forms/fields.tsx
'use client'

/**
 * Bouwstenen van de blok-formulieren in de "+ Oefening"-pop-up. Eén stijl voor
 * label, hint, schakelaar en segment, zodat de vijf formulieren als één
 * scherm lezen. Puur presentatie; geen kennis van blokken.
 */

import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { DarkInput, DarkMenuSelect, MetaLabel, P } from '@/components/dark-ui'
import { useCategoryColors } from '@/lib/useCategoryColors'
import { GROUP_LETTERS, groupLabel, type Category, type ItemGroups } from '@/lib/planner-blocks'
import { CategoryIcon, CATEGORY_LABELS } from '@/components/week-planner/CategoryIcon'

export function Field({ label, hint, children, className }: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <MetaLabel>{label}</MetaLabel>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-[11px] mt-1 leading-snug" style={{ color: P.inkDim }}>{hint}</p>}
    </div>
  )
}

/**
 * Getalveld dat je écht leeg kunt maken. Tijdens het typen is de tekst de
 * waarheid (zie AGENTS.md "corrigeer nooit tijdens het typen"); leeg = null.
 */
export function NullableNumField({ value, onChange, min, max, step, placeholder, ariaLabel, className }: {
  value: number | null
  onChange: (v: number | null) => void
  min: number
  max: number
  step?: number
  placeholder?: string
  ariaLabel: string
  className?: string
}) {
  const [concept, setConcept] = useState<string | null>(null)
  const getoond = concept ?? (value == null ? '' : String(value))
  return (
    <DarkInput
      type="number" inputMode="decimal" min={min} max={max} step={step}
      value={getoond} placeholder={placeholder ?? '–'} aria-label={ariaLabel}
      className={className}
      onChange={ev => {
        const rauw = ev.target.value
        setConcept(rauw)
        if (rauw === '') { onChange(null); return }
        const n = Number(rauw)
        if (!Number.isFinite(n)) return
        const afgerond = (step ?? 1) >= 1 ? Math.round(n) : n
        onChange(Math.min(max, Math.max(min, afgerond)))
      }}
      onBlur={() => setConcept(null)}
    />
  )
}

export function OptionSwitch({ checked, onCheckedChange, label, hint, disabled }: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={`flex items-start gap-2.5 select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <SwitchPrimitive.Root
        id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
        className="relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(232,122,85,0.5)]"
        style={{
          width: 36, height: 20, marginTop: 1,
          background: checked ? P.brand : P.track,
          border: `1px solid ${checked ? P.brand : P.lineStrong}`,
        }}
      >
        <SwitchPrimitive.Thumb
          className="block rounded-full transition-transform"
          style={{ width: 14, height: 14, background: P.ink, transform: `translateX(${checked ? 18 : 2}px)` }}
        />
      </SwitchPrimitive.Root>
      <span className="min-w-0">
        <span className="block text-xs font-semibold" style={{ color: P.ink }}>{label}</span>
        {hint && <span className="block text-[11px] leading-snug" style={{ color: P.inkDim }}>{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg p-0.5 gap-0.5"
      style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className="px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors"
            style={active
              ? { background: P.control, color: P.ink, border: `1px solid ${P.lineStrong}` }
              : { color: P.inkMuted, border: '1px solid transparent' }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function RangeToggle({ isRange, onToggle, title }: { isRange: boolean; onToggle: () => void; title?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={isRange}
      title={title ?? (isRange ? 'Terug naar één waarde' : 'Bereik instellen (min en max)')}
      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
      style={isRange
        ? { color: P.brand, background: 'rgba(232,122,85,0.12)', border: `1px solid rgba(232,122,85,0.4)` }
        : { color: P.inkDim, border: `1px solid ${P.line}`, background: P.surfaceLow }}>
      <SlidersHorizontal className="w-3.5 h-3.5" />
    </button>
  )
}

/** "m:ss"-invoer; kale cijfers gelden als minuten. Normaliseren pas bij blur. */
export function MmSsInput({ valueSec, onChange, ariaLabel, className }: {
  valueSec: number | null
  onChange: (sec: number | null) => void
  ariaLabel: string
  className?: string
}) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const [concept, setConcept] = useState<string | null>(null)
  const getoond = concept ?? (valueSec == null ? '' : fmt(valueSec))
  function parse(raw: string): number | null {
    const t = raw.trim()
    if (!t) return null
    const m = t.match(/^(\d{1,3})(?::([0-5]?\d))?$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2] ?? 0)
  }
  return (
    <DarkInput
      value={getoond} placeholder="m:ss" inputMode="numeric" aria-label={ariaLabel} className={className}
      onChange={ev => { setConcept(ev.target.value); const s = parse(ev.target.value); if (s != null || ev.target.value.trim() === '') onChange(s) }}
      onBlur={() => setConcept(null)}
    />
  )
}

export type ExerciseCandidate = {
  id: string
  name: string
  category: string
  defaultRepUnit?: string | null
  isUnilateral?: boolean
}

/**
 * Zoeken in de bibliotheek met een categorie-filterchip, zoals de oude
 * builder; gekozen oefening staat als chip met een kruisje. Pijltjes en Enter
 * werken in de lijst.
 */
export function ExerciseCombobox({ value, onChange, defaultCategory, categories, autoFocus, inputRef }: {
  value: ExerciseCandidate | null
  onChange: (c: ExerciseCandidate | null) => void
  /** Startfilter (lift-stand). null = geen filter. */
  defaultCategory: Category | null
  /** Vaste set (cardio-stand): filtert client-side, geen chip. */
  categories?: Category[]
  autoFocus?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const catColors = useCategoryColors()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [catFilter, setCatFilter] = useState<Category | null>(categories ? null : defaultCategory)
  const [cursor, setCursor] = useState(0)
  const eigenRef = useRef<HTMLInputElement | null>(null)
  const ref = inputRef ?? eigenRef

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw = [] } = (trpc.exercises.list.useQuery as any)(
    { query: search || undefined, category: catFilter ?? undefined },
    { staleTime: 30_000 },
  ) as { data: ExerciseCandidate[] }
  const kandidaten = (categories ? raw.filter(c => (categories as string[]).includes(c.category)) : raw).slice(0, 40)

  useEffect(() => { setCursor(0) }, [search, catFilter])

  function kies(c: ExerciseCandidate) {
    onChange(c); setSearch(''); setOpen(false)
  }

  if (value) {
    const cat = (value.category as Category) ?? 'STRENGTH'
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg" style={{ background: P.surfaceLow, border: `1px solid ${P.lineStrong}` }}>
        <span style={{ color: catColors[cat] }} className="shrink-0 flex"><CategoryIcon category={cat} size={13} /></span>
        <span className="flex-1 truncate text-sm" style={{ color: P.ink }}>{value.name}</span>
        <button type="button" onClick={() => { onChange(null); setTimeout(() => ref.current?.focus(), 0) }}
          aria-label="Andere oefening kiezen" className="shrink-0" style={{ color: P.inkMuted }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: P.inkDim }} />
          <DarkInput
            ref={ref} autoFocus={autoFocus} value={search} placeholder="Zoek oefening…" className="pl-8"
            aria-label="Oefening zoeken" aria-expanded={open} role="combobox"
            onChange={e => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(kandidaten.length - 1, c + 1)); setOpen(true) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)) }
              if (e.key === 'Enter' && open && kandidaten[cursor]) { e.preventDefault(); kies(kandidaten[cursor]) }
              if (e.key === 'Escape') setOpen(false)
            }}
          />
        </div>
        {!categories && defaultCategory && (
          catFilter ? (
            <button type="button" onClick={() => setCatFilter(null)}
              className="inline-flex items-center gap-1 px-2 h-9 rounded-lg text-[11px] font-semibold shrink-0"
              style={{ background: `${catColors[catFilter]}20`, color: catColors[catFilter], border: `1px solid ${catColors[catFilter]}` }}>
              {CATEGORY_LABELS[catFilter]} <X className="w-3 h-3" />
            </button>
          ) : (
            <button type="button" onClick={() => setCatFilter(defaultCategory)}
              className="px-2 h-9 rounded-lg text-[11px] shrink-0"
              style={{ color: P.inkMuted, border: `1px solid ${P.lineStrong}` }}
              title={`Alleen ${CATEGORY_LABELS[defaultCategory]} tonen`}>
              Alle
            </button>
          )
        )}
      </div>
      {open && kandidaten.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg p-1 z-20 space-y-0.5"
          style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, boxShadow: '0 12px 30px rgba(0,0,0,0.45)' }}>
          {kandidaten.map((c, i) => {
            const cat = (c.category as Category) ?? 'STRENGTH'
            return (
              <li key={c.id} role="option" aria-selected={i === cursor}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => kies(c)}
                  onMouseEnter={() => setCursor(i)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md flex items-center gap-2 text-xs"
                  style={{ background: i === cursor ? P.control : 'transparent', color: P.ink }}>
                  <span style={{ color: catColors[cat] }} className="shrink-0 flex"><CategoryIcon category={cat} size={11} /></span>
                  <span className="flex-1 truncate">{c.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function GroupSelect({ value, onChange, groups }: {
  value: string | null
  onChange: (v: string | null) => void
  groups: ItemGroups
}) {
  const options = [
    { value: '-', label: 'Geen groep' },
    ...GROUP_LETTERS.map(l => ({ value: l, label: groupLabel(l, groups) })),
  ]
  return (
    <DarkMenuSelect
      value={value ?? '-'}
      onValueChange={v => onChange(v === '-' ? null : v)}
      options={options}
      placeholder="Groep"
      ariaLabel="Groep (superset of circuit)"
    />
  )
}
```

- [ ] **Stap 3: Controleer en commit**

Run: `npx tsc --noEmit`
Expected: schoon. (`DarkInput` is een `forwardRef`, dus `ref` werkt; klaagt `tsc` over `role="combobox"` op een input, verwijder dat attribuut.)

```bash
git add src/components/week-planner/CategoryIcon.tsx src/components/week-planner/block-forms/fields.tsx src/components/week-planner/QuickExerciseBuilder.tsx
git commit -m "feat(planner): bouwstenen voor de blok-formulieren (schakelaar, segment, oefeningzoeker)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 6: De pop-up (`ExerciseBlockDialog`), notitie- en pauzeformulier, mutatie-hook

**Files:**
- Create: `src/components/week-planner/useBlockMutations.ts`
- Create: `src/components/week-planner/block-forms/NoteForm.tsx`
- Create: `src/components/week-planner/block-forms/BreakForm.tsx`
- Create: `src/components/week-planner/ExerciseBlockDialog.tsx`

**Interfaces:**
- Consumes: Taak 1 (`BlockDraft`, `PlannerBlock`, `ItemGroups`, `ItemGroup`, `newBlock`, `toBlockPayload`, `Category`), Taak 3/4 (`weekSchedules.setItemExercises`, `weekSchedules.setItemGroups`), Taak 5 (`Field`, `MmSsInput`, `CategoryIcon`).
- Produces:
  - `useBlockMutations() => { saving: boolean; submitBlock(itemId, blocks, draft): Promise<void>; removeBlock(itemId, blocks, id): Promise<void>; moveBlock(itemId, blocks, id, dir: -1 | 1): Promise<void>; setGroup(itemId, groups, letter, group: ItemGroup | null): Promise<void> }`
  - `type BlockDialogType = 'exercise' | 'cardio' | 'circuit' | 'note' | 'break'`
  - `ExerciseBlockDialog(props: { open; onClose; dayLabel; workoutName; initialType?; editBlock: PlannerBlock | null; blocks: PlannerBlock[]; groups: ItemGroups; defaultCategory: Category; saving: boolean; onSubmitBlock(draft: BlockDraft): Promise<void>; onSubmitGroup(letter: string, group: ItemGroup): Promise<void> })`
  - Elk formulier: `({ draft, onChange(draft), ... })` gecontroleerd; `NoteForm`, `BreakForm` in deze taak, `ExerciseForm` (Taak 7) en `CircuitForm` (Taak 8).

- [ ] **Stap 1: `useBlockMutations.ts`**

```ts
// src/components/week-planner/useBlockMutations.ts
'use client'

/**
 * Alle schrijfacties op de bloklijst van een workout-item, op één plek.
 * setItemExercises is vervang-alles, dus elke actie stuurt de hele lijst.
 * Na opslaan worden listItemContents én listWithItems ververst: de server
 * leidt duur en soort uit de inhoud af en die staan op het item.
 */
import { useCallback } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { toBlockPayload, type BlockDraft, type ItemGroup, type ItemGroups, type PlannerBlock } from '@/lib/planner-blocks'

export function useBlockMutations() {
  const utils = trpc.useUtils()
  const setItemExercises = trpc.weekSchedules.setItemExercises.useMutation({
    onSuccess: () => {
      utils.weekSchedules.listItemContents.invalidate()
      utils.weekSchedules.listWithItems.invalidate()
    },
    onError: (e) => toast.error(e.message || 'Opslaan is niet gelukt'),
  })
  const setItemGroups = trpc.weekSchedules.setItemGroups.useMutation({
    onSuccess: () => utils.weekSchedules.listItemContents.invalidate(),
    onError: (e) => toast.error(e.message || 'Opslaan is niet gelukt'),
  })

  const saveList = useCallback(async (itemId: string, blocks: BlockDraft[]) => {
    await setItemExercises.mutateAsync({ itemId, exercises: blocks.map(toBlockPayload) })
  }, [setItemExercises])

  const submitBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], draft: BlockDraft) => {
    const next: BlockDraft[] = draft.id
      ? blocks.map(b => (b.id === draft.id ? { ...b, ...draft } : b))
      : [...blocks, draft]
    await saveList(itemId, next)
  }, [saveList])

  const removeBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], id: string) => {
    await saveList(itemId, blocks.filter(b => b.id !== id))
  }, [saveList])

  const moveBlock = useCallback(async (itemId: string, blocks: PlannerBlock[], id: string, dir: -1 | 1) => {
    const i = blocks.findIndex(b => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    await saveList(itemId, next)
  }, [saveList])

  const setGroup = useCallback(async (itemId: string, groups: ItemGroups, letter: string, group: ItemGroup | null) => {
    const next: ItemGroups = { ...groups }
    if (group) next[letter] = group
    else delete next[letter]
    await setItemGroups.mutateAsync({ itemId, groups: next })
  }, [setItemGroups])

  return {
    saving: setItemExercises.isPending || setItemGroups.isPending,
    submitBlock, removeBlock, moveBlock, setGroup,
  }
}
```

- [ ] **Stap 2: `NoteForm.tsx` en `BreakForm.tsx`**

```tsx
// src/components/week-planner/block-forms/NoteForm.tsx
'use client'

import { DarkInput, DarkTextarea } from '@/components/dark-ui'
import type { BlockDraft } from '@/lib/planner-blocks'
import { Field } from './fields'

export function NoteForm({ draft, onChange }: { draft: BlockDraft; onChange: (d: BlockDraft) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Notitie voor de atleet" hint="Staat op zijn plek in de training, zoals je hem hier neerzet.">
        <DarkTextarea
          autoFocus rows={5} value={draft.text ?? ''} maxLength={500}
          onChange={e => onChange({ ...draft, text: e.target.value })}
          placeholder="Bijv. verzamelen bij zaal 1, of: vandaag ligt de nadruk op tempo."
        />
      </Field>
      <Field label="Videolink (optioneel)" hint="Een link naar YouTube of Vimeo; de atleet opent hem vanuit de training.">
        <DarkInput
          type="url" value={draft.videoUrl ?? ''} placeholder="https://"
          onChange={e => onChange({ ...draft, videoUrl: e.target.value.trim() || null })}
        />
      </Field>
    </div>
  )
}
```

```tsx
// src/components/week-planner/block-forms/BreakForm.tsx
'use client'

import { DarkInput } from '@/components/dark-ui'
import type { BlockDraft } from '@/lib/planner-blocks'
import { Field, MmSsInput } from './fields'

export function BreakForm({ draft, onChange }: { draft: BlockDraft; onChange: (d: BlockDraft) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
      <Field label="Duur" hint="Minuten en seconden, bijvoorbeeld 2:00.">
        <MmSsInput valueSec={draft.durationSec} onChange={sec => onChange({ ...draft, durationSec: sec })} ariaLabel="Duur van de pauze" />
      </Field>
      <Field label="Tekst (optioneel)" hint="Wat de atleet in de pauze doet of ziet.">
        <DarkInput value={draft.text ?? ''} maxLength={200} onChange={e => onChange({ ...draft, text: e.target.value || null })} placeholder="Bijv. drinken en even lopen" />
      </Field>
    </div>
  )
}
```

- [ ] **Stap 3: `ExerciseBlockDialog.tsx`**

```tsx
// src/components/week-planner/ExerciseBlockDialog.tsx
'use client'

/**
 * "+ Oefening": één brede pop-up met links een balk van typen en rechts het
 * formulier van het gekozen type. Toevoegen laat de dialoog open en zet het
 * formulier terug voor de volgende rij; bewerken sluit na opslaan.
 * Werkt op een patiënt-item én op een sjabloon-item (plan-editor).
 * Ontwerp: docs/superpowers/specs/2026-09-13-planner-blokken-design.md §5.2
 */

import { useEffect, useRef, useState } from 'react'
import { Coffee, Dumbbell, HeartPulse, RefreshCw, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import {
  DarkButton, DarkDialog as Dialog, DarkDialogContent as DialogContent, DarkDialogTitle as DialogTitle, P,
} from '@/components/dark-ui'
import { useCategoryColors } from '@/lib/useCategoryColors'
import {
  newBlock, type BlockDraft, type Category, type ItemGroup, type ItemGroups, type PlannerBlock,
} from '@/lib/planner-blocks'
import { ExerciseForm } from './block-forms/ExerciseForm'
import { CircuitForm, type CircuitDraft, emptyCircuit } from './block-forms/CircuitForm'
import { NoteForm } from './block-forms/NoteForm'
import { BreakForm } from './block-forms/BreakForm'

export type BlockDialogType = 'exercise' | 'cardio' | 'circuit' | 'note' | 'break'

const TYPES: { key: BlockDialogType; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'exercise', label: 'Oefening', Icon: Dumbbell },
  { key: 'cardio',   label: 'Cardio',   Icon: HeartPulse },
  { key: 'circuit',  label: 'Circuit',  Icon: RefreshCw },
  { key: 'note',     label: 'Notitie',  Icon: StickyNote },
  { key: 'break',    label: 'Pauze',    Icon: Coffee },
]

const TITLES: Record<BlockDialogType, string> = {
  exercise: 'Oefening toevoegen',
  cardio: 'Cardio toevoegen',
  circuit: 'Circuit toevoegen',
  note: 'Notitie toevoegen',
  break: 'Pauze toevoegen',
}

function typeOf(b: PlannerBlock): BlockDialogType {
  if (b.blockKind === 'NOTE') return 'note'
  if (b.blockKind === 'BREAK') return 'break'
  return b.exerciseCategory === 'CARDIO' || b.exerciseCategory === 'PLYOMETRICS' ? 'cardio' : 'exercise'
}

function draftFor(type: BlockDialogType, defaultCategory: Category, group: string | null): BlockDraft {
  if (type === 'note') return newBlock('NOTE')
  if (type === 'break') return newBlock('BREAK')
  return newBlock('EXERCISE', {
    supersetGroup: group,
    ...(type === 'cardio' ? { repUnit: 'min', reps: 10, sets: 1 } : {}),
    ...(defaultCategory === 'CARDIO' && type === 'exercise' ? {} : {}),
  })
}

export function ExerciseBlockDialog({
  open, onClose, dayLabel, workoutName, initialType = 'exercise',
  editBlock, blocks, groups, defaultCategory, saving, onSubmitBlock, onSubmitGroup,
}: {
  open: boolean
  onClose: () => void
  dayLabel: string
  workoutName: string
  initialType?: BlockDialogType
  editBlock: PlannerBlock | null
  blocks: PlannerBlock[]
  groups: ItemGroups
  defaultCategory: Category
  saving: boolean
  onSubmitBlock: (draft: BlockDraft) => Promise<void>
  onSubmitGroup: (letter: string, group: ItemGroup) => Promise<void>
}) {
  const catColors = useCategoryColors()
  const [type, setType] = useState<BlockDialogType>(initialType)
  const [draft, setDraft] = useState<BlockDraft>(() => draftFor(initialType, defaultCategory, null))
  const [circuit, setCircuit] = useState<CircuitDraft>(emptyCircuit)
  /** Na een circuit: de letter waar de volgende oefeningen in landen. */
  const [stickyGroup, setStickyGroup] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [toegevoegd, setToegevoegd] = useState(false)
  const zoekRef = useRef<HTMLInputElement | null>(null)

  const bewerken = !!editBlock

  useEffect(() => {
    if (!open) return
    const t = editBlock ? typeOf(editBlock) : initialType
    setType(t)
    setDraft(editBlock ? { ...editBlock } : draftFor(t, defaultCategory, null))
    setCircuit(emptyCircuit())
    setStickyGroup(null)
    setFout(null)
    setToegevoegd(false)
  }, [open, editBlock, initialType, defaultCategory])

  function kiesType(t: BlockDialogType) {
    setType(t)
    setDraft(draftFor(t, defaultCategory, stickyGroup))
    setFout(null)
  }

  function valideer(): string | null {
    if (type === 'circuit') return circuit.name.trim() ? null : 'Geef het circuit een naam.'
    if (draft.blockKind === 'EXERCISE' && !draft.exerciseId) return 'Kies eerst een oefening.'
    if (draft.blockKind === 'NOTE' && !(draft.text ?? '').trim()) return 'De notitie is nog leeg.'
    if (draft.blockKind === 'BREAK' && !draft.durationSec) return 'Geef de pauze een duur.'
    if (draft.repsPerSet && draft.repsPerSet.length !== draft.sets) return 'Vul voor elke set een aantal in.'
    if (draft.videoUrl && !/^https?:\/\/\S+$/i.test(draft.videoUrl)) return 'De videolink moet met http(s) beginnen.'
    return null
  }

  async function verstuur() {
    const f = valideer()
    if (f) { setFout(f); return }
    setFout(null)
    if (type === 'circuit') {
      const letter = circuit.letter
      await onSubmitGroup(letter, {
        kind: 'CIRCUIT', name: circuit.name.trim(), rounds: circuit.rounds,
        ...(circuit.timeCapSec ? { timeCapSec: circuit.timeCapSec } : {}),
        ...(circuit.restSec != null ? { restSec: circuit.restSec } : {}),
      })
      // Door naar de oefeningen van dit circuit.
      setStickyGroup(letter)
      setType('exercise')
      setDraft(draftFor('exercise', defaultCategory, letter))
      toast.success(`Circuit ${letter} staat klaar, voeg nu de oefeningen toe`)
      return
    }
    await onSubmitBlock(draft)
    if (bewerken) { onClose(); return }
    setToegevoegd(true)
    setTimeout(() => setToegevoegd(false), 1200)
    setDraft(draftFor(type, defaultCategory, stickyGroup))
    setTimeout(() => zoekRef.current?.focus(), 0)
  }

  function leegmaken() {
    setDraft(editBlock ? { ...editBlock } : draftFor(type, defaultCategory, stickyGroup))
    setCircuit(emptyCircuit())
    setFout(null)
  }

  const actief = TYPES.find(t => t.key === type)!
  const typeKleur: Record<BlockDialogType, string> = {
    exercise: catColors[defaultCategory === 'CARDIO' ? 'STRENGTH' : defaultCategory] ?? P.ink,
    cardio: catColors.CARDIO ?? P.ice,
    circuit: P.gold,
    note: P.gold,
    break: P.inkDim,
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-[880px]" style={{ padding: 0, borderRadius: 14 }}>
        <div className="flex flex-col lg:flex-row min-h-[420px]">
          {/* Balk met typen. Bij bewerken ligt het type vast. */}
          {!bewerken && (
            <nav aria-label="Soort blok"
              className="flex lg:flex-col gap-1 p-2 lg:w-[84px] shrink-0 overflow-x-auto"
              style={{ borderRight: `1px solid ${P.line}`, background: P.surfaceLow, borderRadius: '14px 0 0 14px' }}>
              {TYPES.map(t => {
                const isActief = t.key === type
                return (
                  <button key={t.key} type="button" onClick={() => kiesType(t.key)} aria-pressed={isActief}
                    className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg athletic-tap transition-colors shrink-0"
                    style={isActief
                      ? { background: typeKleur[t.key], color: '#0A1C1D' }
                      : { color: P.inkMuted }}>
                    <t.Icon size={18} />
                    <span className="athletic-label" style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.label}</span>
                  </button>
                )
              })}
            </nav>
          )}

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-5 pt-5 pb-3 pr-14">
              <DialogTitle>
                <span className="flex items-center gap-2">
                  <span style={{ color: typeKleur[type] }} className="flex"><actief.Icon size={16} /></span>
                  {bewerken ? `${actief.label} bewerken` : TITLES[type]}
                </span>
              </DialogTitle>
              <p className="athletic-mono mt-1" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {dayLabel} · {workoutName}
              </p>
            </div>

            <div className="px-5 pb-4 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(85dvh - 190px)' }}>
              {type === 'circuit' && <CircuitForm draft={circuit} onChange={setCircuit} blocks={blocks} groups={groups} />}
              {(type === 'exercise' || type === 'cardio') && (
                <ExerciseForm
                  key={draft.id ?? `${type}-${stickyGroup ?? ''}`}
                  mode={type} draft={draft} onChange={setDraft}
                  groups={groups} defaultCategory={defaultCategory} searchRef={zoekRef}
                />
              )}
              {type === 'note' && <NoteForm draft={draft} onChange={setDraft} />}
              {type === 'break' && <BreakForm draft={draft} onChange={setDraft} />}
              {fout && <p className="text-xs mt-3" role="alert" style={{ color: P.danger }}>{fout}</p>}
            </div>

            <div className="px-5 pb-5 pt-3 space-y-2" style={{ borderTop: `1px solid ${P.line}` }}>
              <DarkButton variant="primary" className="w-full" onClick={verstuur} disabled={saving}>
                {saving ? 'Opslaan…' : toegevoegd ? 'Toegevoegd' : bewerken ? 'Opslaan' : type === 'circuit' ? 'Circuit aanmaken' : 'Toevoegen aan training'}
              </DarkButton>
              <DarkButton variant="ghost" className="w-full" onClick={leegmaken} disabled={saving}>
                Leegmaken
              </DarkButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

`ExerciseForm` (Taak 7) en `CircuitForm` (Taak 8) bestaan nog niet; maak in deze taak tijdelijk twee stubs met de exacte signaturen zodat het compileert:

```tsx
// src/components/week-planner/block-forms/ExerciseForm.tsx (stub, Taak 7 vervangt hem)
'use client'
import type { BlockDraft, Category, ItemGroups } from '@/lib/planner-blocks'
export function ExerciseForm(_: {
  mode: 'exercise' | 'cardio'; draft: BlockDraft; onChange: (d: BlockDraft) => void
  groups: ItemGroups; defaultCategory: Category; searchRef: React.RefObject<HTMLInputElement | null>
}) { return <p>Formulier volgt.</p> }
```

```tsx
// src/components/week-planner/block-forms/CircuitForm.tsx (stub, Taak 8 vervangt hem)
'use client'
import type { ItemGroups, PlannerBlock } from '@/lib/planner-blocks'
export type CircuitDraft = { letter: string; name: string; rounds: number; timeCapSec: number | null; restSec: number | null }
export const emptyCircuit = (): CircuitDraft => ({ letter: 'A', name: '', rounds: 3, timeCapSec: null, restSec: 60 })
export function CircuitForm(_: { draft: CircuitDraft; onChange: (d: CircuitDraft) => void; blocks: PlannerBlock[]; groups: ItemGroups }) {
  return <p>Formulier volgt.</p>
}
```

- [ ] **Stap 4: Controleer en commit**

Run: `npx tsc --noEmit`
Expected: schoon. Als `DarkDialogContent` de `style`-prop niet doorgeeft, controleer regel ~866 in `dark-ui/index.tsx`: hij spreidt `...style` in; padding 0 werkt dus.

```bash
git add src/components/week-planner/useBlockMutations.ts src/components/week-planner/ExerciseBlockDialog.tsx src/components/week-planner/block-forms/
git commit -m "feat(planner): pop-up met typenbalk, notitie- en pauzeformulier, mutatie-hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 7: Het oefening- en cardioformulier (`ExerciseForm`)

**Files:**
- Replace: `src/components/week-planner/block-forms/ExerciseForm.tsx` (stub uit Taak 6)

**Interfaces:**
- Consumes: Taak 1 (`BlockDraft`, `withParam`, `paramValue`, `hasParam`, `BLOCK_PARAMS`), Taak 5 (alle bouwstenen), `NumberField` uit `@/components/dark-ui/NumberField`, `REP_UNITS`, `PER_SIDE_UNIT`, `PER_SIDE_SEC_UNIT`, `isRepBasedUnit`, `isPerSideUnit` uit `@/lib/program-constants`, `DarkTextarea`, `DarkMenuSelect`.
- Produces: `ExerciseForm({ mode: 'exercise' | 'cardio'; draft; onChange; groups; defaultCategory; searchRef })`, gecontroleerd via `draft`/`onChange`.

- [ ] **Stap 1: Schrijf het formulier**

```tsx
// src/components/week-planner/block-forms/ExerciseForm.tsx
'use client'

/**
 * Het formulier voor een oefeningsrij, in twee standen:
 *   - exercise: bibliotheek-oefening met sets × reps, per-set-schema, AMRAP,
 *     per zijde, groep, tempo, rust, intensiteit (RPE / %1RM), RIR en de
 *     optie-schakelaars (lichaamsgewicht, alleen afvinken, staafsnelheid,
 *     piekvermogen, max bijhouden) plus de fase.
 *   - cardio: zoeker beperkt tot cardio en plyometrie, eenheid in tijd of
 *     afstand, en doelen (zone, tempo, hartslag, RPE) als schakelaars.
 * Drie rijen, zoals TeamBuildr, in BASE-stijl. Gecontroleerd: alles via draft.
 */

import { DarkMenuSelect, DarkTextarea } from '@/components/dark-ui'
import { NumberField } from '@/components/dark-ui/NumberField'
import { P } from '@/components/dark-ui'
import {
  BLOCK_PARAMS, hasParam, paramValue, withParam,
  type BlockDraft, type BlockPhase, type Category, type ItemGroups,
} from '@/lib/planner-blocks'
import { isPerSideUnit, isRepBasedUnit, PER_SIDE_SEC_UNIT, PER_SIDE_UNIT, REP_UNITS } from '@/lib/program-constants'
import {
  ExerciseCombobox, Field, GroupSelect, NullableNumField, OptionSwitch, RangeToggle, Segmented,
  type ExerciseCandidate,
} from './fields'

type Intensiteit = 'NONE' | 'RPE' | 'PERCENT_1RM'
type Fase = 'MAIN' | BlockPhase

/** Eenheden zonder de /zijde-varianten: per zijde is een aparte schakelaar. */
const UNITS = REP_UNITS.filter(u => !u.value.includes('/zijde'))

function perSideOf(unit: string, perSide: boolean): string {
  const basis = unit.replace('/zijde', '')
  if (!perSide) return basis
  if (basis === 'sec') return PER_SIDE_SEC_UNIT
  if (basis === 'reps') return PER_SIDE_UNIT
  return basis // min en m hebben geen per-zijde-variant
}

export function ExerciseForm({ mode, draft, onChange, groups, defaultCategory, searchRef }: {
  mode: 'exercise' | 'cardio'
  draft: BlockDraft
  onChange: (d: BlockDraft) => void
  groups: ItemGroups
  defaultCategory: Category
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const set = (patch: Partial<BlockDraft>) => onChange({ ...draft, ...patch })
  const perSide = isPerSideUnit(draft.repUnit)
  const repBased = isRepBasedUnit(draft.repUnit)
  const perSet = draft.repsPerSet != null
  const intens: Intensiteit = draft.intensityType === 'RPE' || draft.intensityType === 'PERCENT_1RM' ? draft.intensityType : 'NONE'
  const fase: Fase = draft.phase ?? 'MAIN'
  const gekozen: ExerciseCandidate | null = draft.exerciseId
    ? { id: draft.exerciseId, name: draft.exerciseName ?? 'Oefening', category: draft.exerciseCategory ?? 'STRENGTH' }
    : null

  function kiesOefening(c: ExerciseCandidate | null) {
    if (!c) { set({ exerciseId: null, exerciseName: null, exerciseCategory: null }); return }
    // De oefening bepaalt haar eenheid: een plank staat in de bibliotheek als
    // "sec" en hoort hier niet stil 10 herhalingen te worden.
    const unit = c.defaultRepUnit ?? (mode === 'cardio' ? 'min' : 'reps')
    const start = c.isUnilateral ? perSideOf(unit, true) : unit
    set({
      exerciseId: c.id, exerciseName: c.name, exerciseCategory: c.category,
      repUnit: start,
      reps: draft.reps === 10 && start.startsWith('sec') ? 30 : draft.reps,
      repsPerSet: null,
    })
  }

  function zetSets(n: number) {
    const sets = Math.max(1, Math.min(50, n))
    const repsPerSet = draft.repsPerSet
      ? Array.from({ length: sets }, (_, i) => draft.repsPerSet![i] ?? draft.repsPerSet![draft.repsPerSet!.length - 1] ?? draft.reps)
      : null
    set({ sets, repsPerSet, setsMax: draft.setsMax != null && draft.setsMax <= sets ? sets + 1 : draft.setsMax })
  }

  function togglePerSet(aan: boolean) {
    set({ repsPerSet: aan ? Array.from({ length: draft.sets }, () => draft.reps) : null, repsMax: aan ? null : draft.repsMax })
  }

  function zetRepPerSet(i: number, v: number) {
    const lijst = [...(draft.repsPerSet ?? [])]
    lijst[i] = Math.max(1, Math.min(1000, v))
    set({ repsPerSet: lijst, reps: lijst[0] ?? draft.reps })
  }

  const inputStijl = 'h-9'

  return (
    <div className="space-y-5">
      {/* Rij 1: oefening, sets, reps/tijd, schakelaars */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_200px] gap-3">
        <Field label={mode === 'cardio' ? 'Activiteit' : 'Oefening'} hint={gekozen ? undefined : 'Zoek in de bibliotheek. Pijltjes en Enter werken.'}>
          <ExerciseCombobox
            value={gekozen} onChange={kiesOefening} autoFocus inputRef={searchRef}
            defaultCategory={mode === 'cardio' ? null : defaultCategory === 'CARDIO' ? 'STRENGTH' : defaultCategory}
            categories={mode === 'cardio' ? ['CARDIO', 'PLYOMETRICS'] : undefined}
          />
        </Field>
        <Field label="Sets" hint={draft.setsMax != null ? 'Bereik: minimaal en maximaal.' : 'Van 1 tot 50.'}>
          <div className="flex items-center gap-1.5">
            <NumberField value={draft.sets} onCommit={zetSets} min={1} max={50} aria-label="Aantal sets" className={inputStijl} />
            {draft.setsMax != null && (
              <>
                <span style={{ color: P.inkDim }}>-</span>
                <NumberField value={draft.setsMax} onCommit={n => set({ setsMax: Math.max(draft.sets, n) })} min={1} max={50} aria-label="Sets maximaal" className={inputStijl} />
              </>
            )}
            <RangeToggle isRange={draft.setsMax != null} onToggle={() => set({ setsMax: draft.setsMax == null ? draft.sets + 1 : null })} />
          </div>
        </Field>
        <Field label={draft.amrap ? 'Minimaal' : perSet ? 'Reps (set 1)' : 'Reps of tijd'}
          hint={draft.amrap ? 'De atleet doet zoveel mogelijk herhalingen.' : perSet ? 'Vul hieronder per set een aantal in.' : 'Kies de eenheid rechts.'}>
          <div className="flex items-center gap-1.5">
            <NumberField
              value={draft.reps} min={1} max={1000} aria-label="Herhalingen of tijd" className={inputStijl}
              onCommit={n => set({ reps: n, repsPerSet: perSet ? draft.repsPerSet!.map((r, i) => (i === 0 ? n : r)) : null })}
            />
            {!perSet && draft.repsMax != null && (
              <>
                <span style={{ color: P.inkDim }}>-</span>
                <NumberField value={draft.repsMax} onCommit={n => set({ repsMax: Math.max(draft.reps, n) })} min={1} max={1000} aria-label="Herhalingen maximaal" className={inputStijl} />
              </>
            )}
            <DarkMenuSelect
              ariaLabel="Eenheid" value={draft.repUnit.replace('/zijde', '')}
              onValueChange={u => set({ repUnit: perSideOf(u, perSide) })}
              options={UNITS.map(u => ({ value: u.value, label: u.label }))}
              className="w-[84px]"
            />
            {!perSet && <RangeToggle isRange={draft.repsMax != null} onToggle={() => set({ repsMax: draft.repsMax == null ? draft.reps + 2 : null })} />}
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <OptionSwitch checked={perSet} onCheckedChange={togglePerSet} label="Per set" hint="Ander aantal per set, bijv. 8/6/6/4." disabled={draft.completionOnly} />
        <OptionSwitch checked={draft.amrap} onCheckedChange={v => set({ amrap: v })} label="AMRAP" hint="Zoveel mogelijk, het getal is de ondergrens." disabled={draft.completionOnly} />
        {(repBased || draft.repUnit.startsWith('sec')) && (
          <OptionSwitch checked={perSide} onCheckedChange={v => set({ repUnit: perSideOf(draft.repUnit, v) })} label="Per zijde" hint="Het aantal geldt links én rechts." />
        )}
      </div>

      {perSet && (
        <Field label="Per set">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(draft.sets, 8)}, minmax(56px, 1fr))` }}>
            {draft.repsPerSet!.map((r, i) => (
              <div key={i}>
                <NumberField value={r} onCommit={n => zetRepPerSet(i, n)} min={1} max={1000} aria-label={`Set ${i + 1}`} className={inputStijl} />
                <p className="athletic-mono text-center mt-1" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.08em' }}>SET {i + 1}</p>
              </div>
            ))}
          </div>
        </Field>
      )}

      {/* Rij 2: instructie, groep, tempo, rust */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_170px_110px_100px] gap-3">
        <Field label="Instructie (optioneel)" hint="Voor deze rij in deze training, maximaal 500 tekens.">
          <DarkTextarea rows={2} maxLength={500} value={draft.notes ?? ''} onChange={e => set({ notes: e.target.value || null })} placeholder="Bijv. rustig excentrisch, geen lock-out" />
        </Field>
        <Field label="Groep" hint="Superset of circuit.">
          <GroupSelect value={draft.supersetGroup} onChange={v => set({ supersetGroup: v })} groups={groups} />
        </Field>
        {mode === 'exercise' && (
          <Field label="Tempo" hint="Bijv. 3-1-2-0.">
            <input
              className="w-full h-9 px-2.5 rounded-lg text-sm athletic-mono bg-transparent focus:outline-none"
              style={{ border: `1px solid ${P.line}`, background: P.field, color: P.ink }}
              value={String(paramValue(draft.extraParams, 'tempo') ?? '')} placeholder="3-1-2-0" aria-label="Tempo"
              onChange={e => set({ extraParams: withParam(draft.extraParams, 'tempo', e.target.value || null) })}
            />
          </Field>
        )}
        <Field label="Rust" hint="Seconden tussen sets.">
          <NullableNumField value={draft.restTime} onChange={v => set({ restTime: v })} min={0} max={3600} step={15} ariaLabel="Rust in seconden" className={inputStijl} />
        </Field>
      </div>

      {/* Rij 3: intensiteit of cardiodoelen, dan de opties */}
      {mode === 'exercise' ? (
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_100px] gap-3 items-end">
          <Field label="Intensiteit">
            <Segmented<Intensiteit>
              ariaLabel="Soort intensiteit" value={intens}
              options={[{ value: 'NONE', label: 'Geen' }, { value: 'RPE', label: 'RPE' }, { value: 'PERCENT_1RM', label: '% 1RM' }]}
              onChange={v => set(v === 'NONE'
                ? { intensityType: 'NONE', intensityMin: null, intensityMax: null }
                : { intensityType: v, intensityMin: draft.intensityMin ?? (v === 'RPE' ? 7 : 70), intensityMax: null })}
            />
          </Field>
          {intens !== 'NONE' && (
            <Field label={intens === 'RPE' ? 'RPE' : 'Percentage van 1RM'} hint={draft.intensityMax != null ? 'Bereik.' : undefined}>
              <div className="flex items-center gap-1.5">
                <NullableNumField value={draft.intensityMin} onChange={v => set({ intensityMin: v })}
                  min={intens === 'RPE' ? 1 : 10} max={intens === 'RPE' ? 10 : 120} step={intens === 'RPE' ? 0.5 : 5}
                  ariaLabel={intens === 'RPE' ? 'RPE' : 'Percentage'} className={`${inputStijl} w-24`} />
                {draft.intensityMax != null && (
                  <>
                    <span style={{ color: P.inkDim }}>-</span>
                    <NullableNumField value={draft.intensityMax} onChange={v => set({ intensityMax: v })}
                      min={intens === 'RPE' ? 1 : 10} max={intens === 'RPE' ? 10 : 120} step={intens === 'RPE' ? 0.5 : 5}
                      ariaLabel="Maximaal" className={`${inputStijl} w-24`} />
                  </>
                )}
                <RangeToggle isRange={draft.intensityMax != null}
                  onToggle={() => set({ intensityMax: draft.intensityMax == null ? Math.min(intens === 'RPE' ? 10 : 120, (draft.intensityMin ?? 7) + (intens === 'RPE' ? 1 : 5)) : null })} />
              </div>
            </Field>
          )}
          <Field label="RIR" hint="Reps in reserve.">
            <NullableNumField value={paramValue(draft.extraParams, 'rir') as number | null} onChange={v => set({ extraParams: withParam(draft.extraParams, 'rir', v) })}
              min={0} max={10} ariaLabel="Reps in reserve" className={inputStijl} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Doelen (optioneel)" hint="Elke schakelaar zet een doel dat de atleet in de training ziet.">
            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-1">
              <OptionSwitch checked={hasParam(draft.extraParams, 'zone')} label="Zone"
                onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'zone', v ? 2 : null) })} />
              <OptionSwitch checked={hasParam(draft.extraParams, 'pace')} label="Tempo"
                onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'pace', v ? '5:00' : null) })} />
              <OptionSwitch checked={hasParam(draft.extraParams, 'hartslag')} label="Hartslag"
                onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'hartslag', v ? 140 : null) })} />
              <OptionSwitch checked={intens === 'RPE'} label="RPE"
                onCheckedChange={v => set(v ? { intensityType: 'RPE', intensityMin: 6, intensityMax: null } : { intensityType: 'NONE', intensityMin: null, intensityMax: null })} />
            </div>
          </Field>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {hasParam(draft.extraParams, 'zone') && (
              <Field label="Zone" hint="1 tot 5.">
                <NullableNumField value={paramValue(draft.extraParams, 'zone') as number | null} onChange={v => set({ extraParams: withParam(draft.extraParams, 'zone', v) })} min={1} max={5} ariaLabel="Hartslagzone" className={inputStijl} />
              </Field>
            )}
            {hasParam(draft.extraParams, 'pace') && (
              <Field label="Tempo" hint="Minuten per kilometer.">
                <input className="w-full h-9 px-2.5 rounded-lg text-sm athletic-mono bg-transparent focus:outline-none"
                  style={{ border: `1px solid ${P.line}`, background: P.field, color: P.ink }}
                  value={String(paramValue(draft.extraParams, 'pace') ?? '')} placeholder="5:00" aria-label="Tempo in minuten per kilometer"
                  onChange={e => set({ extraParams: withParam(draft.extraParams, 'pace', e.target.value || null) })} />
              </Field>
            )}
            {hasParam(draft.extraParams, 'hartslag') && (
              <Field label="Hartslag" hint="Slagen per minuut.">
                <NullableNumField value={paramValue(draft.extraParams, 'hartslag') as number | null} onChange={v => set({ extraParams: withParam(draft.extraParams, 'hartslag', v) })} min={40} max={250} ariaLabel="Hartslag" className={inputStijl} />
              </Field>
            )}
            {intens === 'RPE' && (
              <Field label="RPE" hint="1 tot 10.">
                <NullableNumField value={draft.intensityMin} onChange={v => set({ intensityMin: v })} min={1} max={10} step={0.5} ariaLabel="RPE" className={inputStijl} />
              </Field>
            )}
          </div>
        </div>
      )}

      <div>
        <Field label="Opties">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mt-1">
            {mode === 'exercise' && (
              <OptionSwitch checked={draft.isBodyweight} onCheckedChange={v => set({ isBodyweight: v })} label="Lichaamsgewicht" hint="De atleet logt alleen herhalingen, geen kilo's." />
            )}
            <OptionSwitch checked={draft.completionOnly} onCheckedChange={v => set({ completionOnly: v, ...(v ? { repsPerSet: null, amrap: false } : {}) })} label="Alleen afvinken" hint="Geen invoer, alleen een vinkje." />
            {mode === 'exercise' && (
              <>
                <OptionSwitch checked={hasParam(draft.extraParams, 'bar_speed')} onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'bar_speed', v ? 0 : null) })} label="Staafsnelheid" hint="Voegt een m/s-veld toe voor de atleet." />
                <OptionSwitch checked={hasParam(draft.extraParams, 'peak_power')} onCheckedChange={v => set({ extraParams: withParam(draft.extraParams, 'peak_power', v ? 0 : null) })} label="Piekvermogen" hint="Voegt een watt-veld toe voor de atleet." />
                <OptionSwitch checked={draft.trackMax !== false} onCheckedChange={v => set({ trackMax: v ? null : false })} label="Max bijhouden" hint="Gelogde sets tellen mee voor 1RM en records." />
              </>
            )}
          </div>
        </Field>
      </div>

      <Field label="Fase">
        <Segmented<Fase>
          ariaLabel="Fase in de training" value={fase}
          options={[{ value: 'MAIN', label: 'Hoofd' }, { value: 'WARMUP', label: 'Warming-up' }, { value: 'COOLDOWN', label: 'Cooldown' }]}
          onChange={v => set({ phase: v === 'MAIN' ? null : v })}
        />
      </Field>
    </div>
  )
}
```

Let op bij `NumberField`: als zijn `onCommit`-prop anders heet (controleer regel 21-40 van `src/components/dark-ui/NumberField.tsx`), gebruik die naam; de semantiek is "commit bij blur/Enter".

- [ ] **Stap 2: Controleer en commit**

Run: `npx tsc --noEmit`
Expected: schoon.

```bash
git add src/components/week-planner/block-forms/ExerciseForm.tsx
git commit -m "feat(planner): oefening- en cardioformulier met per-set-schema, AMRAP en optieschakelaars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 8: Het circuitformulier (`CircuitForm`)

**Files:**
- Replace: `src/components/week-planner/block-forms/CircuitForm.tsx` (stub uit Taak 6)

**Interfaces:**
- Consumes: Taak 1 (`nextFreeGroupLetter`, `GROUP_LETTERS`, `groupLabel`), Taak 5 (`Field`, `MmSsInput`, `NullableNumField`), `NumberField`, `DarkInput`, `DarkTextarea`.
- Produces: `type CircuitDraft = { letter: string; name: string; rounds: number; timeCapSec: number | null; restSec: number | null }`, `emptyCircuit(): CircuitDraft`, `CircuitForm({ draft, onChange, blocks, groups })`. De letter wordt bij het openen op de eerste vrije gezet.

- [ ] **Stap 1: Schrijf het formulier**

```tsx
// src/components/week-planner/block-forms/CircuitForm.tsx
'use client'

/**
 * Een circuit is een groepsletter met rondes en (optioneel) een tijdslimiet.
 * Dit formulier maakt of bewerkt die groep; de oefeningen komen daarna via
 * het oefeningformulier met de letter voorgeselecteerd.
 */

import { useEffect } from 'react'
import { DarkInput, DarkTextarea, P } from '@/components/dark-ui'
import { NumberField } from '@/components/dark-ui/NumberField'
import { GROUP_LETTERS, groupLabel, nextFreeGroupLetter, type ItemGroups, type PlannerBlock } from '@/lib/planner-blocks'
import { Field, MmSsInput, NullableNumField } from './fields'

export type CircuitDraft = {
  letter: string
  name: string
  rounds: number
  timeCapSec: number | null
  restSec: number | null
  description: string
}

export const emptyCircuit = (): CircuitDraft => ({ letter: 'A', name: '', rounds: 3, timeCapSec: null, restSec: 60, description: '' })

export function CircuitForm({ draft, onChange, blocks, groups }: {
  draft: CircuitDraft
  onChange: (d: CircuitDraft) => void
  blocks: PlannerBlock[]
  groups: ItemGroups
}) {
  const vrij = nextFreeGroupLetter(blocks, groups)
  // Eerste vrije letter als startwaarde, één keer per opening.
  useEffect(() => {
    if (vrij && !draft.name && draft.letter !== vrij && !groups[draft.letter]) onChange({ ...draft, letter: vrij })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vrij])

  const set = (patch: Partial<CircuitDraft>) => onChange({ ...draft, ...patch })
  const bestaand = !!groups[draft.letter]

  return (
    <div className="space-y-4">
      {!vrij && !bestaand && (
        <p className="text-xs" style={{ color: P.danger }}>Alle zes de letters zijn in gebruik. Verwijder eerst een groep.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_110px_110px] gap-3">
        <Field label="Naam van het circuit" hint="Bijv. Finisher of Conditie-blok.">
          <DarkInput autoFocus value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} placeholder="Circuit" />
        </Field>
        <Field label="Letter" hint={bestaand ? 'Bestaande groep bewerken.' : 'Vrije letter.'}>
          <select
            value={draft.letter} onChange={e => set({ letter: e.target.value })} aria-label="Groepsletter"
            className="w-full h-9 px-2 rounded-lg text-sm focus:outline-none"
            style={{ background: P.field, color: P.ink, border: `1px solid ${P.line}` }}
          >
            {GROUP_LETTERS.map(l => <option key={l} value={l}>{groupLabel(l, groups)}</option>)}
          </select>
        </Field>
        <Field label="Rondes" hint="1 tot 10.">
          <NumberField value={draft.rounds} onCommit={n => set({ rounds: Math.max(1, Math.min(10, n)) })} min={1} max={10} aria-label="Aantal rondes" className="h-9" />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[160px_160px_minmax(0,1fr)] gap-3">
        <Field label="Tijdslimiet (optioneel)" hint="Zoveel mogelijk rondes binnen deze tijd.">
          <MmSsInput valueSec={draft.timeCapSec} onChange={sec => set({ timeCapSec: sec })} ariaLabel="Tijdslimiet" />
        </Field>
        <Field label="Rust tussen rondes" hint="Seconden.">
          <NullableNumField value={draft.restSec} onChange={v => set({ restSec: v })} min={0} max={600} step={15} ariaLabel="Rust tussen rondes" className="h-9" />
        </Field>
        <Field label="Beschrijving (optioneel)" hint="Hoe het circuit wordt uitgevoerd.">
          <DarkTextarea rows={2} maxLength={300} value={draft.description} onChange={e => set({ description: e.target.value })} placeholder="Bijv. alle oefeningen achter elkaar, dan rust" />
        </Field>
      </div>
    </div>
  )
}
```

Pas in `ExerciseBlockDialog.tsx` de circuit-tak van `verstuur()` aan zodat de beschrijving in de naam-groep meegaat als `name` (de groep kent alleen `name`; plak de beschrijving er niet aan vast, laat hem weg als `groups` geen veld heeft) en de `emptyCircuit()`-aanroep de nieuwe vorm gebruikt. Als je de beschrijving wilt bewaren: voeg `description?: string` toe aan `ItemGroup` (Taak 1), aan `itemGroupSchema` (Taak 3, `z.string().max(300).optional()`) en aan `parseGroups`.

- [ ] **Stap 2: Controleer en commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: schoon en groen.

```bash
git add src/components/week-planner/block-forms/CircuitForm.tsx src/components/week-planner/ExerciseBlockDialog.tsx src/lib/planner-blocks.ts src/server/lib/planner-block-schema.ts
git commit -m "feat(planner): circuitformulier met rondes, tijdslimiet en rust

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 9: De rijen (`BlockRows`)

**Files:**
- Create: `src/components/week-planner/BlockRows.tsx`

**Interfaces:**
- Consumes: Taak 1 (`PlannerBlock`, `ItemGroups`, `formatBlockPrescription`, `groupLabel`, `fmtMmSs`), Taak 5 (`CategoryIcon`), `useCategoryColors`, `SUPERSET_COLORS`.
- Produces: `BlockRows({ blocks; groups; readOnly?; compact?; onEdit?(b); onRemove?(b); onMove?(b, dir: -1 | 1); onEditGroup?(letter) })`. `compact` = dagcel (kleinere letter, één regel per rij); anders zijpaneel.

- [ ] **Stap 1: Schrijf de component**

```tsx
// src/components/week-planner/BlockRows.tsx
'use client'

/**
 * De bloklijst van een training als compacte rijen: in de dagcel van de
 * planner en, iets ruimer, in het zijpaneel. Soorticoon in de soortkleur,
 * naam, voorschrift in mono. Warming-up en cooldown onder een mini-kop,
 * groepen als gekleurd letterchipje. Notitie en pauze hebben een eigen vorm.
 * Volgorde via pijltjes; slepen van rijen is bewust niet in deze ronde.
 */

import { ChevronDown, ChevronUp, Coffee, Pencil, StickyNote, X } from 'lucide-react'
import { P } from '@/components/dark-ui'
import { useCategoryColors } from '@/lib/useCategoryColors'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import {
  fmtMmSs, formatBlockPrescription, groupLabel,
  type Category, type ItemGroups, type PlannerBlock,
} from '@/lib/planner-blocks'
import { CategoryIcon } from './CategoryIcon'

const FASE_KOP: Record<'WARMUP' | 'COOLDOWN', string> = { WARMUP: 'Warming-up', COOLDOWN: 'Cooldown' }

export function BlockRows({ blocks, groups, readOnly = false, compact = false, onEdit, onRemove, onMove, onEditGroup }: {
  blocks: PlannerBlock[]
  groups: ItemGroups
  readOnly?: boolean
  compact?: boolean
  onEdit?: (b: PlannerBlock) => void
  onRemove?: (b: PlannerBlock) => void
  onMove?: (b: PlannerBlock, dir: -1 | 1) => void
  onEditGroup?: (letter: string) => void
}) {
  const catColors = useCategoryColors()
  if (blocks.length === 0) return null
  const fs = compact ? 10 : 12

  return (
    <div className={compact ? 'space-y-px' : 'space-y-1'} data-noselect>
      {blocks.map((b, i) => {
        const vorige = blocks[i - 1]
        const faseKop = b.phase && (i === 0 || vorige?.phase !== b.phase) ? FASE_KOP[b.phase] : null
        const hoofdKop = !b.phase && vorige?.phase && b.blockKind !== 'NOTE' ? 'Hoofddeel' : null
        const kop = faseKop ?? hoofdKop
        const cat = (b.exerciseCategory as Category) ?? 'STRENGTH'
        const kleur = b.blockKind === 'NOTE' ? P.gold : b.blockKind === 'BREAK' ? P.inkDim : catColors[cat] ?? P.inkMuted
        const groep = b.supersetGroup ? SUPERSET_COLORS[b.supersetGroup] : null
        const naam = b.blockKind === 'NOTE' ? (b.text ?? '') : b.blockKind === 'BREAK' ? `Pauze ${fmtMmSs(b.durationSec ?? 0)}` : (b.exerciseName ?? 'Oefening')
        const voorschrift = b.blockKind === 'EXERCISE' ? formatBlockPrescription(b) : ''
        const klikbaar = !readOnly && !!onEdit

        return (
          <div key={b.id}>
            {kop && (
              <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', padding: compact ? '3px 4px 1px' : '6px 6px 2px' }}>
                {kop}
              </p>
            )}
            <div
              className={`group/row flex items-center gap-1.5 rounded-md min-w-0 ${klikbaar ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.05)]' : ''}`}
              style={{ padding: compact ? '2px 4px' : '6px 8px', fontStyle: b.blockKind === 'NOTE' ? 'italic' : undefined }}
              role={klikbaar ? 'button' : undefined}
              tabIndex={klikbaar ? 0 : undefined}
              onClick={klikbaar ? () => onEdit!(b) : undefined}
              onKeyDown={klikbaar ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit!(b) } } : undefined}
              title={b.notes ?? undefined}
            >
              <span className="shrink-0 flex" style={{ color: kleur }}>
                {b.blockKind === 'NOTE' ? <StickyNote size={compact ? 10 : 12} />
                  : b.blockKind === 'BREAK' ? <Coffee size={compact ? 10 : 12} />
                  : <CategoryIcon category={cat} size={compact ? 10 : 12} />}
              </span>
              {groep && b.supersetGroup && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onEditGroup?.(b.supersetGroup!) }}
                  title={groupLabel(b.supersetGroup, groups)}
                  className="athletic-mono shrink-0 rounded px-1"
                  style={{ fontSize: 8, fontWeight: 900, background: groep.bg, border: `1px solid ${groep.border}`, color: groep.text, lineHeight: '14px' }}
                >
                  {b.supersetGroup}
                </button>
              )}
              <span className="flex-1 min-w-0 truncate" style={{ color: b.blockKind === 'NOTE' ? P.inkMuted : P.ink, fontSize: fs, fontWeight: b.blockKind === 'EXERCISE' ? 600 : 400 }}>
                {naam}
              </span>
              {voorschrift && (
                <span className="athletic-mono shrink-0" style={{ color: P.inkMuted, fontSize: fs - 1, letterSpacing: '0.02em' }}>
                  {voorschrift}
                </span>
              )}
              {!readOnly && (onMove || onRemove) && (
                <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-60">
                  {onMove && (
                    <>
                      <button type="button" aria-label="Omhoog" disabled={i === 0} onClick={e => { e.stopPropagation(); onMove(b, -1) }} className="disabled:opacity-30" style={{ color: P.inkMuted }}>
                        <ChevronUp size={compact ? 11 : 13} />
                      </button>
                      <button type="button" aria-label="Omlaag" disabled={i === blocks.length - 1} onClick={e => { e.stopPropagation(); onMove(b, 1) }} className="disabled:opacity-30" style={{ color: P.inkMuted }}>
                        <ChevronDown size={compact ? 11 : 13} />
                      </button>
                    </>
                  )}
                  {!compact && onEdit && (
                    <button type="button" aria-label="Bewerken" onClick={e => { e.stopPropagation(); onEdit(b) }} style={{ color: P.inkMuted }}>
                      <Pencil size={12} />
                    </button>
                  )}
                  {onRemove && (
                    <button type="button" aria-label={`${naam} verwijderen`} onClick={e => { e.stopPropagation(); onRemove(b) }} className="hover:!text-[var(--p-danger)]" style={{ color: P.inkMuted }}>
                      <X size={compact ? 11 : 13} />
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Stap 2: Controleer en commit**

Run: `npx tsc --noEmit`
Expected: schoon.

```bash
git add src/components/week-planner/BlockRows.tsx
git commit -m "feat(planner): compacte blokrijen voor dagcel en zijpaneel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 10: De plannerpagina: dagcel, "+ Oefening", dialoog, zijpaneel

**Files:**
- Modify: `src/app/(therapist)/therapist/week-planner/page.tsx` (imports 51-68, `ScheduleItem` ~334, `PlannedExerciseList` ~522, `ItemTile` ~572-835, `DayCell` ~1004-1145, `ItemDetailContent` ~1195-1545, `WeekPlannerContent` ~1684 e.v., render ~3230-3400)
- Modify: `src/components/week-planner/ExerciseBlockDialog.tsx` (kleine aanvulling: `editGroupLetter`)

**Interfaces:**
- Consumes: Taak 1, 6, 9 (`BlockRows`, `ExerciseBlockDialog`, `BlockDialogType`, `useBlockMutations`), Taak 4 (`weekSchedules.ensureDayWorkout`), Taak 5 (`CategoryIcon`, `CATEGORY_LABELS`).
- Produces: de werkende therapeutenflow. `ItemDetailContent` krijgt nieuwe props `onAddBlock`, `onEditBlock`, `onRemoveBlock`, `onMoveBlock`, `onEditGroup` en verliest `onSaveExercises`/`savingExercises`.

- [ ] **Stap 1: Aanvulling op de dialoog: een bestaand circuit bewerken**

In `ExerciseBlockDialog.tsx`: voeg de prop `editGroupLetter?: string | null` toe. In de `useEffect` op `open`: als `editGroupLetter` gevuld is en `groups[editGroupLetter]` bestaat, zet `type` op `'circuit'` en `circuit` op `{ letter: editGroupLetter, name: g.name ?? '', rounds: g.rounds ?? 1, timeCapSec: g.timeCapSec ?? null, restSec: g.restSec ?? null, description: '' }`. In `verstuur()`: als `editGroupLetter` gevuld is, na `onSubmitGroup` direct `onClose()` (bewerken sluit). `bewerken` wordt `!!editBlock || !!editGroupLetter` voor het verbergen van de balk en de knoptekst `Opslaan`.

- [ ] **Stap 2: Imports en types in de plannerpagina**

Vervang de import uit `QuickExerciseBuilder` (regels ~63-68) door:

```ts
import { CategoryIcon, CATEGORY_LABELS } from '@/components/week-planner/CategoryIcon'
import { BlockRows } from '@/components/week-planner/BlockRows'
import { ExerciseBlockDialog, type BlockDialogType } from '@/components/week-planner/ExerciseBlockDialog'
import { useBlockMutations } from '@/components/week-planner/useBlockMutations'
import type { Category, ItemGroups, PlannerBlock } from '@/lib/planner-blocks'
type ItemExercise = PlannerBlock
```

Verwijder eventuele losse imports van `Category`, `ItemExercise`, `toItemExercisePayload` en `QuickExerciseBuilder`. Voeg `MoreHorizontal` toe aan de `lucide-react`-import.

In `ScheduleItem` (~334), na `exercises?: ItemExercise[]`:

```ts
  /** Volledige bloklijst (oefeningen, notities, pauzes) uit listItemContents. */
  blocks?: PlannerBlock[]
  groups?: ItemGroups
```

In `contentsByItem` (~1806): de Map-waarde wordt `{ exercises: ItemExercise[]; blocks: PlannerBlock[]; groups: ItemGroups; cardioParams: PlannerCardioParams | null }` en de `m.set` krijgt `blocks: c.blocks, groups: c.groups,` erbij. Bij ~2192 (`exercises: content?.exercises ?? []`) voeg toe `blocks: content?.blocks ?? [], groups: content?.groups ?? {},`. Bij ~2514 (`item: { ...detailItem.item, exercises: c.exercises, cardioParams: c.cardioParams }`) voeg `blocks: c.blocks, groups: c.groups` toe.

Verwijder de functie `PlannedExerciseList` (~522-560).

- [ ] **Stap 3: `ItemTile`: geen "N oefeningen"-regel en de strip alleen voor cardio**

In `ItemTile` (~715): vervang

```ts
  } else if (exCount > 0) {
    previewLine = `${exCount} oefening${exCount > 1 ? 'en' : ''}`
  } else if (item.quickCategory === 'CARDIO' && item.cardioParams) {
```

door

```ts
  } else if (item.quickCategory === 'CARDIO' && item.cardioParams) {
```

en haal `const exCount = ...` weg. Bij `<WorkoutProfileStrip` (~756): geef `exercises={item.quickCategory === 'CARDIO' ? item.exercises : null}` mee, zodat kracht geen balkjes meer krijgt (de rijen staan eronder).

- [ ] **Stap 4: `DayCell`: rijen, "+ Oefening", en het `…`-menu**

Nieuwe props op `DayCell` (voeg toe aan de destructuring en het type):

```ts
  onAddBlock: (item: ScheduleItem | null, date: Date, dayId: string | null) => void
  onEditBlock: (item: ScheduleItem, block: PlannerBlock) => void
  onRemoveBlock: (item: ScheduleItem, block: PlannerBlock) => void
  onMoveBlock: (item: ScheduleItem, block: PlannerBlock, dir: -1 | 1) => void
  onEditGroup: (item: ScheduleItem, letter: string) => void
```

Vervang de kopregel (`<div className="flex items-center justify-between">` … `</div>` met het dagnummer) door:

```tsx
      <div className="flex items-center justify-between">
        <span
          className={cn('text-xs athletic-mono font-bold', isToday && 'px-1.5 py-px rounded-md')}
          style={{
            color: isToday ? P.bg : inMonth ? P.ink : P.inkMuted,
            background: isToday ? P.ink : undefined,
          }}
        >
          {date.getDate()}
        </span>
        <span className="flex items-center gap-1">
          {weekLabel != null && (
            <span className="athletic-mono text-[9px]" style={{ color: P.inkDim }}>W{weekLabel}</span>
          )}
          {inMonth && !readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-noselect
                  aria-label="Meer voor deze dag"
                  className="w-5 h-5 rounded grid place-items-center transition-opacity opacity-0 group-hover/cell:opacity-100 focus:opacity-100 pointer-coarse:opacity-60"
                  style={{ color: P.inkMuted }}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => onAddWorkout(date)} className="gap-2 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Workout toevoegen
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddTemplate(date)} className="gap-2 text-xs">
                  <BookmarkPlus className="w-3.5 h-3.5" /> Vanuit sjabloon
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onCopyDay(iso)} className="gap-2 text-xs">
                  <Copy className="w-3.5 h-3.5" /> Kopieer dag
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>
```

Vervang de items-lijst en de oude `+ Workout`-DropdownMenu onderaan door:

```tsx
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {items.map(item => {
          const sId = sessionIdFor(date, item)
          const status = statusFor(date, item)
          const logged = loggedFor(date, item)
          const realItem = !item.id.startsWith('legacy-')
            && !item.id.startsWith('sessionlog-')
            && !item.id.startsWith('cardiolog-')
          const isCardioLog = item.id.startsWith('cardiolog-')
          const tile = (
            <ItemTile
              item={item}
              status={status}
              logged={logged}
              movedTo={movedToFor(date, item)}
              onRemove={() => onRemoveItem(item, dayId)}
              onClick={isCardioLog || !isWorkoutKind(item.kind) ? undefined : () => onItemClick(item, date, dayId, sId)}
              readOnly={readOnly || item.id.startsWith('sessionlog-') || isCardioLog}
              isOpen={item.id === openItemId}
            />
          )
          // Dag = training: onder een WORKOUT staan zijn rijen en "+ Oefening".
          const toontRijen = realItem && item.kind === 'WORKOUT'
          return (
            <div key={item.id} className="w-full min-w-0">
              {realItem && !readOnly
                ? <DraggableItem item={item} fromIso={iso}>{tile}</DraggableItem>
                : <div data-noselect className="w-full min-w-0">{tile}</div>}
              {toontRijen && (
                <div data-noselect className="mt-0.5">
                  <BlockRows
                    compact
                    blocks={item.blocks ?? []}
                    groups={item.groups ?? {}}
                    readOnly={readOnly}
                    onEdit={b => onEditBlock(item, b)}
                    onRemove={b => onRemoveBlock(item, b)}
                    onMove={(b, dir) => onMoveBlock(item, b, dir)}
                    onEditGroup={l => onEditGroup(item, l)}
                  />
                  {!readOnly && <AddBlockButton onClick={() => onAddBlock(item, date, dayId)} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {inMonth && !readOnly && !items.some(i => i.kind === 'WORKOUT' && !i.id.startsWith('legacy-')) && (
        <AddBlockButton onClick={() => onAddBlock(null, date, dayId)} />
      )}
```

Voeg boven `DayCell` toe:

```tsx
/** "+ Oefening", altijd zichtbaar: de eerste handeling op een dag hoort geen hover te vragen. */
function AddBlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-noselect
      onClick={onClick}
      className="self-start text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer mbt-btn-hover opacity-70 hover:opacity-100 focus:opacity-100"
      style={{ color: P.brand, borderColor: 'rgba(232,122,85,0.4)', background: 'rgba(232,122,85,0.08)' }}
    >
      <Plus className="w-3 h-3" /> Oefening
    </button>
  )
}
```

- [ ] **Stap 5: `ItemDetailContent`: rijen in plaats van de chip-builder**

Vervang in de props `onSaveExercises` en `savingExercises` door:

```ts
  onAddBlock: () => void
  onEditBlock: (b: PlannerBlock) => void
  onRemoveBlock: (b: PlannerBlock) => void
  onMoveBlock: (b: PlannerBlock, dir: -1 | 1) => void
  onEditGroup: (letter: string) => void
```

Vervang het blok rond regel ~1470-1482 (`<PlannedExerciseList …/>` in de readOnly-tak en `<QuickExerciseBuilder …/>` in de bewerk-tak) door één tak:

```tsx
              <div className="space-y-2">
                <MetaLabel>Geplande oefeningen</MetaLabel>
                {(item.blocks?.length ?? 0) === 0 ? (
                  <p className="text-xs py-2" style={{ color: P.inkMuted }}>
                    {readOnly ? 'Er stonden geen oefeningen bij deze workout.' : 'Nog geen oefeningen. Voeg de eerste toe.'}
                  </p>
                ) : (
                  <BlockRows
                    blocks={item.blocks ?? []}
                    groups={item.groups ?? {}}
                    readOnly={readOnly}
                    onEdit={onEditBlock}
                    onRemove={onRemoveBlock}
                    onMove={onMoveBlock}
                    onEditGroup={onEditGroup}
                  />
                )}
                {!readOnly && (
                  <DarkButton variant="secondary" size="sm" onClick={onAddBlock} className="w-full text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Oefening toevoegen
                  </DarkButton>
                )}
              </div>
```

Laat de cardio-tak (`CardioSummary`) staan zoals hij is.

- [ ] **Stap 6: `WeekPlannerContent`: state, handlers, dialoog**

Naast de andere mutaties (~1925) en states:

```ts
  // ─ Bloklijst: "+ Oefening" opent één dialoog voor alle soorten rijen ─
  const blokken = useBlockMutations()
  const ensureDayWorkout = trpc.weekSchedules.ensureDayWorkout.useMutation()
  const [blockDialog, setBlockDialog] = useState<{
    itemId: string
    dayLabel: string
    workoutName: string
    category: Category
    editBlock: PlannerBlock | null
    editGroupLetter: string | null
    initialType: BlockDialogType
  } | null>(null)
  const blockDialogInhoud = blockDialog ? contentsByItem.get(blockDialog.itemId) : undefined

  const dagLabelLang = (date: Date) =>
    date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  /**
   * Opent de dialoog voor een bestaande training, of maakt er eerst één aan
   * (dag = training). `item` null = de dag heeft nog geen workout.
   */
  async function openBlockDialog(
    item: ScheduleItem | null, date: Date, dayId: string | null,
    extra: { editBlock?: PlannerBlock | null; editGroupLetter?: string | null } = {},
  ) {
    if (!selectedPatientId) { toast.error('Kies eerst een patiënt'); return }
    let itemId = item?.id ?? null
    let naam = item?.quickName ?? item?.program?.name ?? 'Training'
    let categorie: Category = item?.quickCategory ?? 'STRENGTH'
    if (!itemId) {
      const id = dayId ?? await ensureDayId(date)
      if (!id) { toast.error('Kon de dag niet aanmaken'); return }
      try {
        const r = await ensureDayWorkout.mutateAsync({ dayId: id })
        itemId = r.id
        if (r.created) await utils.weekSchedules.listWithItems.invalidate()
      } catch { toast.error('Kon geen training aanmaken'); return }
      naam = 'Training'
      categorie = 'STRENGTH'
    }
    setBlockDialog({
      itemId, dayLabel: dagLabelLang(date), workoutName: naam, category: categorie,
      editBlock: extra.editBlock ?? null,
      editGroupLetter: extra.editGroupLetter ?? null,
      initialType: categorie === 'CARDIO' ? 'cardio' : 'exercise',
    })
  }
```

Handlers voor de dagcel en het zijpaneel (de datum van het detail-item is `detailItem.date`):

```ts
  const handleRemoveBlock = (item: ScheduleItem, b: PlannerBlock) => blokken.removeBlock(item.id, item.blocks ?? [], b.id)
  const handleMoveBlock = (item: ScheduleItem, b: PlannerBlock, dir: -1 | 1) => blokken.moveBlock(item.id, item.blocks ?? [], b.id, dir)
```

Geef aan `DayCell` (~3233) mee:

```tsx
                      onAddBlock={(item, d, dayId) => openBlockDialog(item, d, dayId)}
                      onEditBlock={(item, b) => openBlockDialog(item, date, info?.dayId ?? null, { editBlock: b })}
                      onRemoveBlock={handleRemoveBlock}
                      onMoveBlock={handleMoveBlock}
                      onEditGroup={(item, l) => openBlockDialog(item, date, info?.dayId ?? null, { editGroupLetter: l })}
```

(`date` en `info` zijn de variabelen die in die `map` al aan `DayCell` worden gegeven; gebruik de namen zoals ze daar staan.)

Geef aan beide `ItemDetailContent`-plekken (~3366 en ~3392), in plaats van `onSaveExercises`/`savingExercises`:

```tsx
            onAddBlock={() => detailItem && openBlockDialog(detailItem.item, detailItem.date, detailItem.dayId)}
            onEditBlock={(b) => detailItem && openBlockDialog(detailItem.item, detailItem.date, detailItem.dayId, { editBlock: b })}
            onRemoveBlock={(b) => detailItem && handleRemoveBlock(detailItem.item, b)}
            onMoveBlock={(b, dir) => detailItem && handleMoveBlock(detailItem.item, b, dir)}
            onEditGroup={(l) => detailItem && openBlockDialog(detailItem.item, detailItem.date, detailItem.dayId, { editGroupLetter: l })}
```

Verwijder `handleSaveItemExercises` (~2783) als niets hem meer gebruikt. Let op: `detailItem.item` in het zijpaneel is een momentopname; de rijen daar moeten uit de live inhoud komen. Kijk hoe `detailItem` bij ~2510-2515 wordt samengevoegd met `contentsByItem` en zorg dat `blocks`/`groups` daar meegaan (Stap 2), dan is het paneel na elke opslag actueel.

Render de dialoog direct onder `<AddItemModal …/>` (~3261):

```tsx
        {blockDialog && (
          <ExerciseBlockDialog
            open
            onClose={() => setBlockDialog(null)}
            dayLabel={blockDialog.dayLabel}
            workoutName={blockDialog.workoutName}
            initialType={blockDialog.initialType}
            editBlock={blockDialog.editBlock}
            editGroupLetter={blockDialog.editGroupLetter}
            blocks={blockDialogInhoud?.blocks ?? []}
            groups={blockDialogInhoud?.groups ?? {}}
            defaultCategory={blockDialog.category}
            saving={blokken.saving}
            onSubmitBlock={(d) => blokken.submitBlock(blockDialog.itemId, blockDialogInhoud?.blocks ?? [], d)}
            onSubmitGroup={(l, g) => blokken.setGroup(blockDialog.itemId, blockDialogInhoud?.groups ?? {}, l, g)}
          />
        )}
```

- [ ] **Stap 7: Controleer en commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: schoon en groen. Let op TS2589 op de `listItemContents`-query: komt die, dan lekt er ergens een Prisma-Json-type in de return (Taak 3, Stap 7).

```bash
git add "src/app/(therapist)/therapist/week-planner/page.tsx" src/components/week-planner/ExerciseBlockDialog.tsx
git commit -m "feat(planner): dag = training; rijen en + Oefening in de dagcel, pop-up en zijpaneel gekoppeld

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 11: Coach plan-editor op dezelfde rijen; oude builder weg

**Files:**
- Modify: `src/app/(coach)/coach/plans/[id]/page.tsx` (imports ~32-35, `inhoudPerItem` ~169-200, dagoverzicht ~540-600, bewerk-dialoog ~1014-1200)
- Delete: `src/components/week-planner/QuickExerciseBuilder.tsx`

**Interfaces:**
- Consumes: Taak 6, 9, 10 (`BlockRows`, `ExerciseBlockDialog` met `editGroupLetter`, `useBlockMutations`).
- Produces: de plan-editor gebruikt de pop-up; `QuickExerciseBuilder` bestaat niet meer (grep op `QuickExerciseBuilder` levert niets).

- [ ] **Stap 1: Imports en inhoudstypen**

Vervang de import uit `QuickExerciseBuilder` door:

```ts
import { CategoryIcon, CATEGORY_LABELS } from '@/components/week-planner/CategoryIcon'
import { BlockRows } from '@/components/week-planner/BlockRows'
import { ExerciseBlockDialog } from '@/components/week-planner/ExerciseBlockDialog'
import { useBlockMutations } from '@/components/week-planner/useBlockMutations'
import type { Category, ItemGroups, PlannerBlock } from '@/lib/planner-blocks'
type ItemExercise = PlannerBlock
```

(Laat weg wat de pagina niet gebruikt; `tsc` zegt het.) Beide `listItemContents`-casts (~172 en ~1017) worden:

```ts
  ) as { data: Array<{ itemId: string; exercises: ItemExercise[]; blocks: PlannerBlock[]; groups: ItemGroups; cardioParams: unknown }>; isFetched: boolean }
```

en `inhoudPerItem` slaat ook `blocks` en `groups` op.

- [ ] **Stap 2: Dagoverzicht: rijen alleen-lezen onder de naam**

Onder de naam-knop in `SleepbaarItem` (~570), vóór `WorkoutProfileStrip`:

```tsx
                          {item.kind === 'WORKOUT' && (inhoud?.blocks?.length ?? 0) > 0 && (
                            <div className="px-1 pb-1">
                              <BlockRows compact readOnly blocks={inhoud!.blocks} groups={inhoud!.groups ?? {}} />
                            </div>
                          )}
```

en geef `WorkoutProfileStrip` `exercises={item.quickCategory === 'CARDIO' ? inhoud?.exercises : null}`.

- [ ] **Stap 3: Bewerk-dialoog: rijen plus "+ Oefening" die de pop-up opent**

In de item-bewerkdialoog (~1160-1195) vervang de `QuickExerciseBuilder`-tak door:

```tsx
              ) : (
                <div className="space-y-2">
                  <MetaLabel>Oefeningen</MetaLabel>
                  {(inhoud?.blocks?.length ?? 0) === 0 ? (
                    <p style={{ color: P.inkMuted, fontSize: 12 }}>Nog geen oefeningen. Voeg de eerste toe.</p>
                  ) : (
                    <BlockRows
                      blocks={inhoud!.blocks}
                      groups={inhoud!.groups ?? {}}
                      onEdit={b => setBlokDialoog({ editBlock: b, editGroupLetter: null })}
                      onRemove={b => blokken.removeBlock(item.id, inhoud!.blocks, b.id)}
                      onMove={(b, dir) => blokken.moveBlock(item.id, inhoud!.blocks, b.id, dir)}
                      onEditGroup={l => setBlokDialoog({ editBlock: null, editGroupLetter: l })}
                    />
                  )}
                  <DarkButton variant="secondary" size="sm" onClick={() => setBlokDialoog({ editBlock: null, editGroupLetter: null })}>
                    Oefening toevoegen
                  </DarkButton>
                </div>
              )}
```

In die dialoog-component: `const blokken = useBlockMutations()` en `const [blokDialoog, setBlokDialoog] = useState<{ editBlock: PlannerBlock | null; editGroupLetter: string | null } | null>(null)`; render onder de `DialogContent`:

```tsx
      {blokDialoog && (
        <ExerciseBlockDialog
          open
          onClose={() => setBlokDialoog(null)}
          dayLabel={`Week ${weekNummer}, ${DAY_SHORT[dagVanWeek]}`}
          workoutName={item.quickName ?? 'Training'}
          initialType={category === 'CARDIO' ? 'cardio' : 'exercise'}
          editBlock={blokDialoog.editBlock}
          editGroupLetter={blokDialoog.editGroupLetter}
          blocks={inhoud?.blocks ?? []}
          groups={inhoud?.groups ?? {}}
          defaultCategory={category}
          saving={blokken.saving}
          onSubmitBlock={d => blokken.submitBlock(item.id, inhoud?.blocks ?? [], d)}
          onSubmitGroup={(l, g) => blokken.setGroup(item.id, inhoud?.groups ?? {}, l, g)}
        />
      )}
```

Gebruik voor `weekNummer`/`dagVanWeek` de variabelen die de dialoog al kent voor zijn kop (kijk naar de bestaande titel van die dialoog); is er geen, geef dan `dayLabel="Sjabloon"`. Verwijder `setExercises` (~1056) als niets hem meer gebruikt.

- [ ] **Stap 4: Verwijder de oude builder**

```bash
git rm src/components/week-planner/QuickExerciseBuilder.tsx
grep -rn "QuickExerciseBuilder" src || echo "geen verwijzingen meer"
```

- [ ] **Stap 5: Controleer en commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: schoon en groen.

```bash
git add "src/app/(coach)/coach/plans/[id]/page.tsx"
git commit -m "feat(planner): plan-editor op dezelfde rijen en pop-up; chip-builder verwijderd

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 12: Atleet-web: runner en agenda lezen de blokken

**Files:**
- Modify: `src/lib/session-sets.ts` (`makeSetEntries` ~112)
- Modify: `src/components/session/SetRows.tsx`
- Modify: `src/app/(athlete)/athlete/session/page.tsx` (`LiveExercise` ~88-120, mapping van `sessionData` ~232-250, `seedSets` ~134, overzichtslijst ~820-900, kaartweergave ~794-815, focus-weergave ~1380-1410, kop met `formatSetsReps` ~876 en ~1966)
- Modify: `src/app/(athlete)/athlete/schedule/page.tsx` (type van `contentQuery` ~820-828, rijen ~931-948)

**Interfaces:**
- Consumes: Taak 4 (`getTodayExercises` met `repsPerSet`, `amrap`, `isBodyweight`, `completionOnly`, `trackMax`, `phase` op elke oefening en `plannedItem.blocks`/`groups`), Taak 1 (`formatBlockPrescription`, `fmtMmSs`, `groupLabel`, `parseGroups`).
- Produces: `makeSetEntries(sets, reps, repsPerSet?: number[] | null)`; `SetRows` met `hideKg?: boolean` en `amrapMin?: number | null`.

- [ ] **Stap 1: `makeSetEntries` met per-set doelen**

```ts
export function makeSetEntries(sets: number, reps: number, repsPerSet?: number[] | null): SetEntry[] {
  return Array.from({ length: Math.max(1, sets) }, (_, i) => {
    const doel = repsPerSet?.[i] ?? reps
    return { kg: '', reps: doel ? String(doel) : '', done: false }
  })
}
```

Grep op `makeSetEntries(` in `src/` en geef op de planner-paden `e.repsPerSet` mee (de patiënt-runner en quick-mode blijven twee argumenten).

- [ ] **Stap 2: `SetRows`: kg verbergen bij lichaamsgewicht, AMRAP-regel**

Voeg props toe: `hideKg?: boolean`, `amrapMin?: number | null`. In de kolomkoppen: de `KG`-kop en per rij de kg-`DarkInput` alleen renderen als `!hideKg`. Onder de per-zijde-regel:

```tsx
      {amrapMin != null && (
        <p className="px-3 mt-1 athletic-mono" style={{ color: P.gold, fontSize: 9, letterSpacing: '0.08em' }}>
          ZOVEEL MOGELIJK HERHALINGEN, MINIMAAL {amrapMin}
        </p>
      )}
```

- [ ] **Stap 3: Runner: velden op `LiveExercise` en doorgeven**

Aan `LiveExercise` toevoegen:

```ts
  repsPerSet?: number[] | null
  amrap?: boolean
  isBodyweight?: boolean
  completionOnly?: boolean
  trackMax?: boolean | null
  phase?: 'WARMUP' | 'COOLDOWN' | null
```

In de mapping van `sessionData?.exercises` (~232): `repsPerSet: e.repsPerSet ?? null, amrap: e.amrap ?? false, isBodyweight: e.isBodyweight ?? false, completionOnly: e.completionOnly ?? false, trackMax: e.trackMax ?? null, phase: e.phase ?? null,`. `seedSets` wordt `makeSetEntries(e.sets, e.reps, e.repsPerSet)`.

Op beide `SetRows`-plekken (de kaart die `onUpdateSet`/`onToggleSet` ontvangt en de focus-weergave ~1398): geef `hideKg={e.isBodyweight}` en `amrapMin={e.amrap ? e.reps : null}` door (in de kaart via een nieuwe prop van die kaartcomponent naar zijn `SetRows`). Waar de kop `formatSetsReps(e.sets, e.setsMax, e.reps, e.repsMax, e.repUnit)` toont (~876 en ~1966), vervang door:

```ts
formatBlockPrescription({ blockKind: 'EXERCISE', sets: e.sets, setsMax: e.setsMax ?? null, reps: e.reps, repsMax: e.repsMax ?? null, repUnit: e.repUnit, repsPerSet: e.repsPerSet ?? null, amrap: e.amrap ?? false, completionOnly: e.completionOnly ?? false, durationSec: null })
```

- [ ] **Stap 4: Runner: alleen afvinken**

Voeg in `session/page.tsx` een kleine component toe:

```tsx
/** Eén knop in plaats van set-rijen: de therapeut wilde alleen een vinkje. */
function CompletionRow({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={done}
      className="athletic-tap w-full flex items-center justify-center gap-2 rounded-xl"
      style={{
        padding: '12px', border: `1.5px solid ${done ? P.lime : P.lineStrong}`,
        background: done ? 'rgba(95,208,138,0.12)' : 'transparent', color: done ? P.lime : P.ink,
        fontFamily: mono, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em',
      }}
    >
      <Check className="w-4 h-4" strokeWidth={3} /> {done ? 'GEDAAN' : 'AFVINKEN'}
    </button>
  )
}
```

Op beide plekken waar `SetRows` staat: als `e.completionOnly`, render `<CompletionRow done={(setLog[e.uid] ?? seedSets(e)).every(s => s.done)} onToggle={() => { const entries = setLog[e.uid] ?? seedSets(e); entries.forEach((_, i) => toggleSetDone(e, seedSets(e), i)) }} />`. Als `toggleSetDone` per set wisselt, gebruik dan één `setSetLog`-update die alle `done` op `!alles` zet; kijk naar de bestaande implementatie van `toggleSetDone` en volg dezelfde state-vorm. De bestaande log-payload blijft dan kloppen (`setsCompleted` telt `done`).

- [ ] **Stap 5: Runner: overzicht met fase-koppen, groepen, notities en pauzes**

In de overzichtslijst (de `exercises.map((e, i) => {` rond ~820 in de niet-kaart-tak) bouw je vóór de `return` een lijst van te tonen regels op basis van `sessionData?.plannedItem?.blocks`:

```tsx
type Regel =
  | { soort: 'kop'; tekst: string; key: string }
  | { soort: 'oefening'; e: LiveExercise; key: string }
  | { soort: 'notitie'; tekst: string; videoUrl: string | null; key: string }
  | { soort: 'pauze'; sec: number; tekst: string | null; key: string }

function regelsVoor(exercises: LiveExercise[], blocks: AthleteBlock[] | undefined, groups: ItemGroups): Regel[] {
  if (!blocks || blocks.length === 0) return exercises.map(e => ({ soort: 'oefening', e, key: e.uid }))
  const byUid = new Map(exercises.map(e => [e.uid, e]))
  const out: Regel[] = []
  let vorigeFase: string | null = null
  let vorigeGroep: string | null = null
  for (const b of blocks) {
    const fase = b.phase ?? 'MAIN'
    if (fase !== vorigeFase && b.blockKind !== 'NOTE') {
      out.push({ soort: 'kop', key: `fase-${b.id}`, tekst: fase === 'WARMUP' ? 'Warming-up' : fase === 'COOLDOWN' ? 'Cooldown' : 'Hoofddeel' })
      vorigeFase = fase
    }
    const groep = b.supersetGroup ?? null
    if (groep && groep !== vorigeGroep) {
      const g = groups[groep]
      const detail = g?.kind === 'CIRCUIT'
        ? [g.rounds ? `${g.rounds} ronde${g.rounds === 1 ? '' : 's'}` : null, g.timeCapSec ? `binnen ${fmtMmSs(g.timeCapSec)}` : null, g.restSec != null ? `rust ${g.restSec} s` : null].filter(Boolean).join(' · ')
        : 'afwisselend, zonder rust ertussen'
      out.push({ soort: 'kop', key: `groep-${b.id}`, tekst: `${groupLabel(groep, groups)}${detail ? ` · ${detail}` : ''}` })
    }
    vorigeGroep = groep
    if (b.blockKind === 'NOTE') out.push({ soort: 'notitie', key: b.id, tekst: b.text ?? '', videoUrl: b.videoUrl })
    else if (b.blockKind === 'BREAK') out.push({ soort: 'pauze', key: b.id, sec: b.durationSec ?? 0, tekst: b.text })
    else { const e = byUid.get(b.id); if (e) out.push({ soort: 'oefening', e, key: e.uid }) }
  }
  // Zelf toegevoegde oefeningen staan niet in de blokken: achteraan.
  for (const e of exercises) if (!blocks.some(b => b.id === e.uid)) out.push({ soort: 'oefening', e, key: e.uid })
  return out
}
```

met `type AthleteBlock = { id: string; order: number; blockKind: 'EXERCISE' | 'NOTE' | 'BREAK'; text: string | null; videoUrl: string | null; durationSec: number | null; phase: 'WARMUP' | 'COOLDOWN' | null; supersetGroup: string | null }` en `groups = parseGroups(sessionData?.plannedItem?.groups)`. Render in de lijst per `Regel`:

- `kop`: `<p className="athletic-mono pt-2" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tekst}</p>`
- `oefening`: het bestaande kaartje voor `e` (ongewijzigd).
- `notitie`: een kaart in `CARD`-stijl met `StickyNote`-icoon in `P.gold`, de tekst (`whiteSpace: 'pre-wrap'`), en als `videoUrl` een knop "Video" die `setVideoModal({ url: videoUrl, name: 'Notitie' })` aanroept.
- `pauze`: een rij `PAUZE {fmtMmSs(sec)}` in mono met de tekst erachter en een knop "Timer" die dezelfde rustsheet opent als de rust na een set (zoek `RestSheet`/`startRest` in de pagina en roep die met `sec` aan; bestaat er geen losse functie, laat de knop dan weg en toon alleen de rij).

De focus-weergave (één oefening tegelijk) blijft over `exercises` lopen; notities en pauzes staan in het overzicht.

- [ ] **Stap 6: Agenda-detail toont het per-set-voorschrift**

In `athlete/schedule/page.tsx`: breid het lokale type van `contentQuery.data.exercises` uit met `repsPerSet?: number[] | null; amrap?: boolean; completionOnly?: boolean; setsMax?: number | null; repsMax?: number | null` en vervang `formatSetsReps(ex.sets, null, ex.reps, null, ex.repUnit)` door `formatBlockPrescription({ blockKind: 'EXERCISE', sets: ex.sets, setsMax: ex.setsMax ?? null, reps: ex.reps, repsMax: ex.repsMax ?? null, repUnit: ex.repUnit ?? 'reps', repsPerSet: ex.repsPerSet ?? null, amrap: ex.amrap ?? false, completionOnly: ex.completionOnly ?? false, durationSec: null })`.

- [ ] **Stap 7: Controleer en commit**

Run: `npx tsc --noEmit && npx vitest run && npm run check:session-payload`
Expected: schoon en groen (de payload-check raakt `lib/session-payload.ts` in de mobiele repo; hij hoort ongewijzigd te slagen omdat de web-payload dezelfde velden stuurt).

```bash
git add src/lib/session-sets.ts src/components/session/SetRows.tsx "src/app/(athlete)/athlete/session/page.tsx" "src/app/(athlete)/athlete/schedule/page.tsx"
git commit -m "feat(atleet): sessie-runner leest per-set-doelen, AMRAP, afvinken, fases, groepen, notities en pauzes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Taak 13: Verificatie, migratie na akkoord, documentatie

**Files:**
- Modify: `AGENTS.md` (kop "Wat mag een patiënt-client zien van de weekplanner?")
- Modify: `/Users/eva/.claude/projects/-Users-eva/memory/reference_mbt_planner_item_content.md` en `MEMORY.md`

- [ ] **Stap 1: Statische checks**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: alles schoon. Los lint-meldingen in de nieuwe bestanden op.

- [ ] **Stap 2: Migratie, alleen na akkoord van Jurre**

De dev-server gebruikt de productiedatabase. Pas als Jurre akkoord geeft:

```bash
npx prisma db execute --file supabase/migrations/20260913_planner_blokken.sql
```

Controleer daarna met `npx prisma db execute --stdin <<< "select column_name from information_schema.columns where table_name = 'week_schedule_day_item_exercises' and column_name in ('blockKind','repsPerSet','amrap','phase','trackMax','text','videoUrl','durationSec')"` dat de acht kolommen bestaan.

- [ ] **Stap 3: Browsercheck (therapeut)**

Start de dev-server via de preview-tool (`.claude/launch.json`, niet via Bash). Log in als therapeut, open de weekplanner met de demo-atleet en loop af:

1. Lege dag: `+ Oefening` maakt "Training" en opent de pop-up; de balk toont vijf typen.
2. Drie oefeningen achter elkaar toevoegen zonder sluiten; elke rij verschijnt achter de dialoog, de knop toont kort "Toegevoegd".
3. Per set aan: 4 sets met 8/6/6/4; in de dagcel staat `4 × 8/6/6/4`.
4. AMRAP aan: dagcel toont `3 × 5+`. Per zijde aan: `L+R`.
5. Circuit aanmaken (3 rondes, 12:00), twee oefeningen erin; letterchip in de dagcel, tooltip toont "B · Finisher, 3 rondes".
6. Notitie en pauze toevoegen; volgorde met de pijltjes wisselen; rij bewerken via klik; rij verwijderen via het kruisje.
7. Zijpaneel openen: dezelfde rijen, "Oefening toevoegen" werkt daar ook.
8. Kopieer dag naar een andere dag: rijen en groepen komen mee.
9. `…`-menu: rustdag en sjabloon nog bereikbaar.
10. Plan-editor (coach): rijen zichtbaar, pop-up werkt op een sjabloondag.

Maak van stap 3 en 5 een screenshot en stuur die naar Jurre.

- [ ] **Stap 4: Browsercheck (atleet-web)**

Log in als de demo-atleet, open de agenda op de dag van stap 3-6: het detail toont `4 × 8/6/6/4`. Start de sessie: set-rijen zijn voorgevuld met 8, 6, 6, 4; de AMRAP-oefening toont de regel "zoveel mogelijk, minimaal 5"; lichaamsgewicht verbergt het kg-veld; alleen-afvinken toont één knop; fase-koppen, circuitkop, notitie en pauze staan op hun plek. Log de sessie en controleer in het therapeut-zijpaneel dat hij als gedaan staat.

- [ ] **Stap 5: Documentatie en geheugen**

In `AGENTS.md`, onder de kop over de patiënt-client, voeg toe:

```markdown
Sinds 2026-09-13 is `week_schedule_day_item_exercises` een bloklijst
(`blockKind` EXERCISE/NOTE/BREAK, `exerciseId` nullable). Het bestaande veld
`exercises` in `patient.getTodayExercises` en de `_count.exercises` in
`calendarRange` bevatten daarom **alleen EXERCISE-rijen**; de volledige lijst
zit additief in `plannedItem.blocks`. Nieuwe consumers van die tabel filteren
met `isExerciseBlock()` uit `src/lib/planner-blocks.ts` vóór ze `exercise.name`
lezen. Kopiëren van rijen gaat altijd via `copyBlockColumns()`.
```

Werk het geheugenbestand `reference_mbt_planner_item_content.md` bij (bloklijst, `groups`, de kolom-helper, de pop-up) en de regel in `MEMORY.md`.

- [ ] **Stap 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs(planner): bloklijst en het oefeningsfilter voor patiënt-clients

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Zelfcontrole van het plan

**Spec-dekking**
- §3.1 kolommen → Taak 2; `reps` = set 1 → Taak 7 (`zetRepPerSet` zet `reps` op set 1) en `toBlockPayload`.
- §3.2 groepen op het item → Taak 2, 3 (`parseGroups` in `listItemContents`), 4 (`setItemGroups`).
- §3.3 migratie handmatig → Taak 2 en 13.
- §4 server: validatie per soort, duur met pauzes, dominante soort, `listItemContents`, `ensureDayWorkout`, `setItemGroups`, kopieerpaden, atleet-filter, `logSession`/`trackMax` → Taak 3 en 4. `completionOnly` in `logSession`: de client stuurt `setsCompleted = aantal done`, wat bij één afvinkknop gelijk is aan `sets` (Taak 12 Stap 4); geen serverwerk nodig.
- §5.1 dagcel → Taak 10 (rijen, `+ Oefening`, `…`-menu, strip alleen cardio, alleen-lezen).
- §5.2 pop-up → Taak 6 (balk, kop, onderbalk, blijft open, reset, focus) en Taak 10 Stap 1 (circuit bewerken). Onder 1024 px wordt de balk een horizontale rij (`flex lg:flex-col`).
- §5.3 formulieren → Taak 7 (oefening en cardio), 8 (circuit), 6 (notitie en pauze); validatie inline in de dialoog (`valideer()`), serverfouten via toast in de hook.
- §5.4 zijpaneel en plan-editor → Taak 10 Stap 5 en Taak 11.
- §6 atleet-web → Taak 12. Cooldown logt als MAIN (het log-veld kent geen COOLDOWN); de runner zet `phase` alleen als de log-payload dat veld al stuurt; anders blijft het weglaten van `phase` zoals nu.
- §8 tests → Taak 1 en 3 (unit), Taak 13 (browser).

**Type-consistentie**: `BlockDraft`/`PlannerBlock`/`ItemGroups`/`ItemGroup` komen overal uit `@/lib/planner-blocks`; `useBlockMutations` levert `submitBlock(itemId, blocks, draft)`, `removeBlock(itemId, blocks, id)`, `moveBlock(itemId, blocks, id, dir)`, `setGroup(itemId, groups, letter, group)`; de dialoog heet `ExerciseBlockDialog` met `onSubmitBlock`/`onSubmitGroup`; `CircuitDraft` heeft `description` (Taak 8) en de dialoog gebruikt `emptyCircuit()` uit dat bestand.

**Bekende open keuze**: de beschrijving van een circuit wordt alleen bewaard als `ItemGroup` een `description` krijgt (Taak 8 beschrijft de drie regels daarvoor). Doe dat wél: de spec noemt "Beschrijving" als veld.
