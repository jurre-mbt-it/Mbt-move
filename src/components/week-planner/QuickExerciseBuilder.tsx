'use client'

/**
 * Oefeningen kiezen en instellen voor één workout: categorie-gefilterde kiezer
 * plus per oefening sets × reps. Houdt een eigen lijst bij en slaat in één keer
 * op via `weekSchedules.setItemExercises`.
 *
 * Stond eerst in de weekplanner-pagina. Losgemaakt zodat de plan-editor er ook
 * bij kan: een sjabloon-item is hetzelfde soort item als een item in de week
 * van een patiënt, en had dus dezelfde bediening moeten hebben.
 */

import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, DarkInput, MetaLabel, P } from '@/components/dark-ui'
import { IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore } from '@/components/icons'
import { useCategoryColors } from '@/lib/useCategoryColors'

export type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'

export const CATEGORY_LABELS: Record<Category, string> = {
  STRENGTH: 'Kracht',
  MOBILITY: 'Mobiliteit',
  PLYOMETRICS: 'Plyometrie',
  CARDIO: 'Cardio',
  STABILITY: 'Stabiliteit',
}

export function CategoryIcon({ category, size = 14 }: { category: Category; size?: number }) {
  const props = { size, className: undefined as string | undefined }
  switch (category) {
    case 'STRENGTH': return <IconStrength {...props} />
    case 'MOBILITY': return <IconMobility {...props} />
    case 'PLYOMETRICS': return <IconPlyometrics {...props} />
    case 'CARDIO': return <IconCardio {...props} />
    case 'STABILITY': return <IconCore {...props} />
  }
}

export type ItemExerciseParam = {
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

export type ItemExercise = {
  id: string
  exerciseId: string
  exerciseName: string
  exerciseCategory: string
  sets: number
  reps: number
  repUnit: string
  restTime: number | null
  /**
   * Het voorschrift. Deze builder zet het niet, maar het kómt hier wel binnen
   * (via listItemContents) zodra een plan-sjabloon of een kopie het meebrengt.
   * setItemExercises vervangt de hele lijst, dus wat we niet terugsturen is
   * weg — vandaar dat dit meereist ook al tonen we het hier niet.
   */
  notes?: string | null
  setsMax?: number | null
  repsMax?: number | null
  intensityType?: string
  intensityMin?: number | null
  intensityMax?: number | null
  intensityText?: string | null
  supersetGroup?: string | null
  supersetOrder?: number
  extraParams?: ItemExerciseParam[]
}

/** Alles wat setItemExercises accepteert — één plek, zodat een nieuw veld niet
 *  bij de volgende opslag stil verdwijnt. */
export function toItemExercisePayload(e: ItemExercise) {
  return {
    exerciseId: e.exerciseId,
    sets: e.sets,
    reps: e.reps,
    repUnit: e.repUnit,
    restTime: e.restTime,
    notes: e.notes ?? null,
    setsMax: e.setsMax ?? null,
    repsMax: e.repsMax ?? null,
    intensityType: (e.intensityType ?? 'NONE') as
      'NONE' | 'RPE' | 'PERCENT_1RM' | 'RELATIVE_DAILY_MAX' | 'TECHNIQUE' | 'TEXT',
    intensityMin: e.intensityMin ?? null,
    intensityMax: e.intensityMax ?? null,
    intensityText: e.intensityText ?? null,
    supersetGroup: e.supersetGroup ?? null,
    supersetOrder: e.supersetOrder,
    extraParams: e.extraParams ?? [],
  }
}

export function QuickExerciseBuilder({
  initial, defaultCategory, onSave, saving,
}: {
  initial: ItemExercise[]
  defaultCategory: Category
  onSave: (exercises: ReturnType<typeof toItemExercisePayload>[]) => Promise<void>
  saving: boolean
}) {
  const catColors = useCategoryColors()
  const [list, setList] = useState<ItemExercise[]>(initial)
  const [catFilter, setCatFilter] = useState<Category | null>(defaultCategory)
  const [search, setSearch] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates = [] } = (trpc.exercises.list.useQuery as any)(
    { category: catFilter ?? undefined, query: search || undefined },
    { staleTime: 30_000 },
  ) as { data: Array<{ id: string; name: string; category: string }> }

  const selectedIds = new Set(list.map(e => e.exerciseId))
  const numStyle: React.CSSProperties = {
    background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}`, padding: '2px 4px',
  }

  function add(ex: { id: string; name: string; category: string }) {
    if (selectedIds.has(ex.id)) return
    setList(l => [...l, {
      id: `new-${ex.id}-${l.length}`, exerciseId: ex.id, exerciseName: ex.name,
      exerciseCategory: ex.category, sets: 3, reps: 10, repUnit: 'reps', restTime: null,
    }])
  }
  function update(i: number, patch: Partial<ItemExercise>) {
    setList(l => l.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <MetaLabel>Oefeningen</MetaLabel>
        <DarkButton
          variant="primary" size="sm" disabled={saving}
          onClick={() => onSave(list.map(toItemExercisePayload))}
        >
          {saving ? 'Opslaan…' : 'Opslaan'}
        </DarkButton>
      </div>

      {list.length > 0 && (
        <div className="space-y-1.5">
          {list.map((e, i) => {
            const c = catColors[(e.exerciseCategory as Category) ?? 'STRENGTH']
            return (
              <div key={e.id} className="rounded-lg p-2 flex items-center gap-1.5"
                style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, borderLeft: `3px solid ${c}` }}>
                <span className="flex-1 truncate text-xs" style={{ color: P.ink }}>{e.exerciseName}</span>
                <input type="number" min={1} max={50} value={e.sets} aria-label="sets"
                  onChange={ev => update(i, { sets: Math.max(1, Number(ev.target.value) || 1) })}
                  className="w-10 text-center rounded text-xs" style={numStyle} />
                <span className="text-[10px]" style={{ color: P.inkMuted }}>×</span>
                <input type="number" min={1} max={999} value={e.reps} aria-label="reps"
                  onChange={ev => update(i, { reps: Math.max(1, Number(ev.target.value) || 1) })}
                  className="w-12 text-center rounded text-xs" style={numStyle} />
                <button type="button" onClick={() => setList(l => l.filter((_, idx) => idx !== i))}
                  className="text-[#9EB5B3] hover:text-[#F0796C] shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            )
          })}
        </div>
      )}

      {/* Categorie-filter (standaard aan, uitklikbaar) */}
      <div className="flex items-center gap-2 flex-wrap">
        {catFilter ? (
          <button type="button" onClick={() => setCatFilter(null)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: `${catColors[catFilter]}20`, color: catColors[catFilter], border: `1px solid ${catColors[catFilter]}` }}>
            {CATEGORY_LABELS[catFilter]} <X className="w-3 h-3" />
          </button>
        ) : (
          <button type="button" onClick={() => setCatFilter(defaultCategory)}
            className="px-2 py-0.5 rounded-full text-[11px]" style={{ color: P.inkMuted, border: `1px solid ${P.lineStrong}` }}>
            Alle categorieën — klik voor {CATEGORY_LABELS[defaultCategory]}
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <DarkInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek oefening…" className="pl-8" />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
        {candidates.filter(c => !selectedIds.has(c.id)).slice(0, 40).map(c => {
          const cat = (c.category as Category) ?? 'STRENGTH'
          return (
            <button key={c.id} type="button" onClick={() => add(c)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-[#1C4448]"
              style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}>
              <span style={{ color: catColors[cat] }}><CategoryIcon category={cat} size={11} /></span>
              <span className="flex-1 truncate text-xs" style={{ color: P.ink }}>{c.name}</span>
              <Plus className="w-3.5 h-3.5" style={{ color: P.inkMuted }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
