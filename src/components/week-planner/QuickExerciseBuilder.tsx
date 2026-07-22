'use client'

/**
 * Oefeningen kiezen en instellen voor één workout: categorie-gefilterde kiezer
 * plus per oefening sets × reps, rusttijd, RPE en links/rechts. Houdt een eigen
 * lijst bij en slaat in één keer op via `weekSchedules.setItemExercises`.
 *
 * Bewust een deelverzameling van de volledige programma-builder: geen bereiken,
 * supersets of extra parameters. Die velden reizen wel mee als ze er al staan
 * (setItemExercises vervangt de hele lijst), ze zijn hier alleen niet te zetten.
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
import { PER_SIDE_UNIT, isRepBasedUnit, isPerSideUnit } from '@/lib/program-constants'
import { formatPrescription, toPrescription } from '@/lib/prescription'

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

/** Wat de bibliotheek per oefening meegeeft en deze builder gebruikt. */
type Kandidaat = {
  id: string
  name: string
  category: string
  defaultRepUnit?: string | null
  isUnilateral?: boolean
}

/** Klein label-met-invoer chipje voor de tweede regel van een oefeningsrij. */
function MiniVeld({ label, suffix, children }: {
  label: string
  suffix?: string
  children: React.ReactNode
}) {
  return (
    <label className="inline-flex items-center gap-1 px-1.5 h-6 rounded"
      style={{ border: `1px solid ${P.line}` }}>
      <span className="text-[10px] font-semibold tracking-wide" style={{ color: P.inkDim }}>{label}</span>
      {children}
      {suffix && <span className="text-[10px]" style={{ color: P.inkDim }}>{suffix}</span>}
    </label>
  )
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
  ) as { data: Kandidaat[] }

  const selectedIds = new Set(list.map(e => e.exerciseId))
  const numStyle: React.CSSProperties = {
    background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}`, padding: '2px 4px',
  }

  function add(ex: Kandidaat) {
    if (selectedIds.has(ex.id)) return
    // De oefening bepaalt zelf haar eenheid: een plank staat in de bibliotheek
    // als "sec", en die zou hier niet stilletjes 10 herhalingen moeten worden.
    // Staat 'ie als unilateraal genoteerd, dan begint 'ie ook per zijde.
    const unit = ex.defaultRepUnit ?? 'reps'
    const start = ex.isUnilateral && isRepBasedUnit(unit) ? PER_SIDE_UNIT : unit
    setList(l => [...l, {
      id: `new-${ex.id}-${l.length}`, exerciseId: ex.id, exerciseName: ex.name,
      exerciseCategory: ex.category, sets: 3, reps: start === 'sec' ? 30 : 10,
      repUnit: start, restTime: null,
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
            const cat = (e.exerciseCategory as Category) ?? 'STRENGTH'
            const repBased = isRepBasedUnit(e.repUnit)
            const perZijde = isPerSideUnit(e.repUnit)
            // Een voorschrift dat geen RPE is (%1RM, techniek, vrije tekst) komt
            // uit de volledige builder of een sjabloon. Dat tonen we hier alleen,
            // want een leeg RPE-vakje zou suggereren dat er niets staat.
            const voorschrift = formatPrescription(toPrescription(e))
            const anderVoorschrift = e.intensityType && e.intensityType !== 'NONE' && e.intensityType !== 'RPE'
            return (
              <div key={e.id} className="rounded-lg px-2 py-1.5"
                style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0" style={{ color: catColors[cat] }}>
                    <CategoryIcon category={cat} size={12} />
                  </span>
                  <span className="flex-1 truncate text-xs" style={{ color: P.ink }}>{e.exerciseName}</span>
                  <input type="number" min={1} max={50} value={e.sets} aria-label="sets"
                    onChange={ev => update(i, { sets: Math.max(1, Number(ev.target.value) || 1) })}
                    className="w-10 text-center rounded text-xs" style={numStyle} />
                  <span className="text-[10px]" style={{ color: P.inkMuted }}>×</span>
                  <input type="number" min={1} max={999} value={e.reps}
                    aria-label={repBased ? 'herhalingen' : e.repUnit}
                    onChange={ev => update(i, { reps: Math.max(1, Number(ev.target.value) || 1) })}
                    className="w-12 text-center rounded text-xs" style={numStyle} />
                  {!repBased && (
                    <span className="text-[10px] shrink-0" style={{ color: P.inkDim }}>{e.repUnit}</span>
                  )}
                  <button type="button" onClick={() => setList(l => l.filter((_, idx) => idx !== i))}
                    aria-label={`${e.exerciseName} verwijderen`}
                    style={{ color: P.inkMuted }} className="shrink-0 hover:!text-[#F0796C]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1 flex-wrap mt-1.5 pl-[18px]">
                  {repBased && (
                    <button type="button" aria-pressed={perZijde}
                      onClick={() => update(i, { repUnit: perZijde ? 'reps' : PER_SIDE_UNIT })}
                      className="px-1.5 h-6 rounded text-[10px] font-semibold tracking-wide"
                      style={perZijde
                        ? { background: P.surfaceHi, color: P.ink, border: `1px solid ${P.lineStrong}` }
                        : { background: 'transparent', color: P.inkDim, border: `1px solid ${P.line}` }}
                      title={perZijde
                        ? 'Per zijde: het aantal geldt links én rechts'
                        : 'Aanzetten voor oefeningen die je links en rechts doet'}>
                      L+R
                    </button>
                  )}
                  <MiniVeld label="Rust" suffix="s">
                    <input type="number" min={0} max={600} step={15} value={e.restTime ?? ''}
                      placeholder="–" aria-label="rusttijd in seconden"
                      onChange={ev => update(i, {
                        restTime: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value) || 0),
                      })}
                      className="w-9 text-center bg-transparent border-0 p-0 text-[11px] focus:outline-none"
                      style={{ color: P.ink }} />
                  </MiniVeld>
                  {anderVoorschrift ? (
                    <span className="px-1.5 h-6 inline-flex items-center rounded text-[10px]"
                      style={{ color: P.inkMuted, border: `1px solid ${P.line}` }}>
                      {voorschrift || 'Voorschrift'}
                    </span>
                  ) : (
                    <MiniVeld label="RPE">
                      <input type="number" min={1} max={10} step={0.5} value={e.intensityMin ?? ''}
                        placeholder="–" aria-label="RPE"
                        onChange={ev => {
                          const v = ev.target.value === '' ? null : Number(ev.target.value)
                          update(i, v == null
                            ? { intensityType: 'NONE', intensityMin: null, intensityMax: null }
                            : { intensityType: 'RPE', intensityMin: Math.min(10, Math.max(1, v)), intensityMax: null })
                        }}
                        className="w-8 text-center bg-transparent border-0 p-0 text-[11px] focus:outline-none"
                        style={{ color: P.ink }} />
                    </MiniVeld>
                  )}
                </div>
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
