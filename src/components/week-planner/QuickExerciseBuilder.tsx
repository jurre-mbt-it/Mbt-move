'use client'

/**
 * Oefeningen kiezen en instellen voor één workout: categorie-gefilterde kiezer
 * plus per oefening sets × reps (met bereik), rusttijd, RPE, RIR en
 * links/rechts. Houdt een eigen lijst bij en slaat in één keer op via
 * `weekSchedules.setItemExercises`.
 *
 * Bewust een deelverzameling van de volledige programma-builder: geen supersets,
 * tempo of vrije parameters. Die velden reizen wel mee als ze er al staan
 * (setItemExercises vervangt de hele lijst), ze zijn hier alleen niet te zetten.
 *
 * Stond eerst in de weekplanner-pagina. Losgemaakt zodat de plan-editor er ook
 * bij kan: een sjabloon-item is hetzelfde soort item als een item in de week
 * van een patiënt, en had dus dezelfde bediening moeten hebben.
 */

import { useState } from 'react'
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, DarkInput, MetaLabel, P, CARD } from '@/components/dark-ui'
import { IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore } from '@/components/icons'
import { useCategoryColors } from '@/lib/useCategoryColors'
import { PER_SIDE_UNIT, PER_SIDE_SEC_UNIT, isRepBasedUnit, isPerSideUnit } from '@/lib/program-constants'
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

/** Chipje met label, invoer en optioneel een knop om er een bereik van te maken. */
function MiniVeld({ label, suffix, isRange, onToggleRange, children }: {
  label: string
  suffix?: string
  isRange?: boolean
  onToggleRange?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="inline-flex items-center gap-1 pl-1.5 pr-1 h-7 rounded"
      style={{ border: `1px solid ${P.line}`, background: P.surfaceLow }}>
      <span className="text-[10px] font-semibold tracking-wide shrink-0" style={{ color: P.inkDim }}>{label}</span>
      {children}
      {suffix && <span className="text-[10px] shrink-0" style={{ color: P.inkDim }}>{suffix}</span>}
      {onToggleRange && (
        <button type="button" onClick={onToggleRange} aria-pressed={!!isRange}
          title={isRange ? 'Terug naar één waarde' : 'Bereik instellen (min, max)'}
          className="w-5 h-5 rounded flex items-center justify-center shrink-0"
          style={isRange
            ? { color: P.brand, background: 'rgba(232,122,85,0.12)' }
            : { color: P.inkDim }}>
          <SlidersHorizontal className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

/**
 * Getalveld dat je écht leeg kunt maken. Een direct gecontroleerde
 * `value={number}` sprong terug naar 1 zodra je het veld wiste, waardoor je
 * "10" alleen kon vervangen door eerst achter de 1 te klikken. Daarom houdt dit
 * veld tijdens het typen een eigen concept-string vast; pas als daar een geldig
 * getal in staat gaat het naar boven.
 *
 * `nullable` bepaalt wat leeg betekent: bij rust/RPE/RIR is leeg een echte
 * waarde (niets voorgeschreven), bij sets en reps niet — daar blijft het
 * laatste getal staan zodra je het veld verlaat.
 */
function Num({ value, onChange, min, max, step, nullable, label, breed }: {
  value: number | null
  onChange: (v: number | null) => void
  min: number
  max: number
  step?: number
  nullable?: boolean
  label: string
  breed?: string
}) {
  const [concept, setConcept] = useState<string | null>(null)
  const getoond = concept ?? (value == null ? '' : String(value))
  return (
    <input
      type="number" inputMode="decimal" min={min} max={max} step={step}
      value={getoond} placeholder={nullable ? '–' : ''} aria-label={label}
      onChange={ev => {
        const rauw = ev.target.value
        setConcept(rauw)
        if (rauw === '') { if (nullable) onChange(null); return }
        const n = Number(rauw)
        if (!Number.isFinite(n)) return
        // Alle velden behalve RPE zijn op de server een integer; zonder deze
        // afronding werd "3,5 sets" stil geweigerd bij het opslaan.
        const afgerond = (step ?? 1) >= 1 ? Math.round(n) : n
        onChange(Math.min(max, Math.max(min, afgerond)))
      }}
      onBlur={() => setConcept(null)}
      className={`${breed ?? 'w-9'} text-center bg-transparent border-0 p-0 text-[11px] focus:outline-none`}
      style={{ color: P.ink }}
    />
  )
}

/** Waarde van een extra parameter op label, of null. */
function paramWaarde(e: ItemExercise, label: string): number | null {
  const p = e.extraParams?.find(x => x.label === label)
  const v = p?.value
  return typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : null
}

/** Zet of verwijdert een extra parameter, en laat de rest ongemoeid. */
function metParam(e: ItemExercise, label: string, v: number | null): ItemExerciseParam[] {
  const rest = (e.extraParams ?? []).filter(x => x.label !== label)
  return v == null ? rest : [...rest, { id: label.toLowerCase(), label, type: 'number', value: v }]
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

  function add(ex: Kandidaat) {
    if (selectedIds.has(ex.id)) return
    // De oefening bepaalt zelf haar eenheid: een plank staat in de bibliotheek
    // als "sec", en die zou hier niet stilletjes 10 herhalingen moeten worden.
    // Staat 'ie als unilateraal genoteerd, dan begint 'ie ook per zijde.
    const unit = ex.defaultRepUnit ?? 'reps'
    const start = ex.isUnilateral && isRepBasedUnit(unit) ? PER_SIDE_UNIT
      : ex.isUnilateral && unit === 'sec' ? PER_SIDE_SEC_UNIT
      : unit
    setList(l => [...l, {
      id: `new-${ex.id}-${l.length}`, exerciseId: ex.id, exerciseName: ex.name,
      exerciseCategory: ex.category, sets: 3, reps: start.startsWith('sec') ? 30 : 10,
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
                style={{...CARD }}>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0" style={{ color: catColors[cat] }}>
                    <CategoryIcon category={cat} size={12} />
                  </span>
                  <span className="flex-1 truncate text-xs" style={{ color: P.ink }}>{e.exerciseName}</span>
                  <button type="button" onClick={() => setList(l => l.filter((_, idx) => idx !== i))}
                    aria-label={`${e.exerciseName} verwijderen`}
                    style={{ color: P.inkMuted }} className="shrink-0 hover:!text-[var(--p-danger)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1 flex-wrap mt-1.5 pl-[18px]">
                  <MiniVeld label="Set"
                    isRange={e.setsMax != null}
                    onToggleRange={() => update(i, {
                      setsMax: e.setsMax == null ? Math.max((e.sets ?? 1) + 1, 2) : null,
                    })}>
                    <Num label="sets" value={e.sets} min={1} max={50}
                      onChange={v => update(i, { sets: v ?? e.sets })} />
                    {e.setsMax != null && (
                      <>
                        <span className="text-[10px]" style={{ color: P.inkDim }}>–</span>
                        <Num label="sets max" value={e.setsMax ?? null} min={1} max={50}
                          onChange={v => update(i, { setsMax: v ?? e.setsMax ?? null })} />
                      </>
                    )}
                  </MiniVeld>

                  <MiniVeld label={repBased ? 'Reps' : e.repUnit}
                    isRange={e.repsMax != null}
                    onToggleRange={() => update(i, {
                      repsMax: e.repsMax == null ? Math.max((e.reps ?? 1) + 2, 2) : null,
                    })}>
                    <Num label="herhalingen" value={e.reps} min={1} max={999} breed="w-10"
                      onChange={v => update(i, { reps: v ?? e.reps })} />
                    {e.repsMax != null && (
                      <>
                        <span className="text-[10px]" style={{ color: P.inkDim }}>–</span>
                        <Num label="herhalingen max" value={e.repsMax ?? null} min={1} max={999} breed="w-10"
                          onChange={v => update(i, { repsMax: v ?? e.repsMax ?? null })} />
                      </>
                    )}
                  </MiniVeld>

                  {(repBased || e.repUnit === 'sec' || e.repUnit === PER_SIDE_SEC_UNIT) && (
                    <button type="button" aria-pressed={perZijde}
                      onClick={() => update(i, {
                        // Toggle behoudt de soort eenheid: reps↔reps/zijde, sec↔sec/zijde.
                        repUnit: perZijde
                          ? (e.repUnit === PER_SIDE_SEC_UNIT ? 'sec' : 'reps')
                          : (e.repUnit === 'sec' ? PER_SIDE_SEC_UNIT : PER_SIDE_UNIT),
                      })}
                      className="px-2 h-7 rounded text-[10px] font-semibold tracking-wide shrink-0"
                      style={perZijde
                        ? { background: P.surfaceHi, color: P.ink, border: `1px solid ${P.lineStrong}` }
                        : { background: P.surfaceLow, color: P.inkDim, border: `1px solid ${P.line}` }}
                      title={perZijde
                        ? 'Per zijde: het aantal geldt links én rechts'
                        : 'Aanzetten voor oefeningen die je links en rechts doet'}>
                      L+R
                    </button>
                  )}

                  <MiniVeld label="Rust" suffix="s">
                    <Num label="rusttijd in seconden" value={e.restTime} min={0} max={600} step={15} nullable
                      onChange={v => update(i, { restTime: v })} />
                  </MiniVeld>

                  {anderVoorschrift ? (
                    <span className="px-2 h-7 inline-flex items-center rounded text-[10px]"
                      style={{ color: P.inkMuted, border: `1px solid ${P.line}`, background: P.surfaceLow }}>
                      {voorschrift || 'Voorschrift'}
                    </span>
                  ) : (
                    <MiniVeld label="RPE"
                      isRange={e.intensityMax != null}
                      onToggleRange={() => update(i, {
                        intensityMax: e.intensityMax == null
                          ? Math.min(10, (e.intensityMin ?? 7) + 1)
                          : null,
                      })}>
                      <Num label="RPE" value={e.intensityMin ?? null} min={1} max={10} step={0.5} nullable
                        onChange={v => update(i, v == null
                          ? { intensityType: 'NONE', intensityMin: null, intensityMax: null }
                          : { intensityType: 'RPE', intensityMin: v })} />
                      {e.intensityMax != null && (
                        <>
                          <span className="text-[10px]" style={{ color: P.inkDim }}>–</span>
                          <Num label="RPE max" value={e.intensityMax ?? null} min={1} max={10} step={0.5} nullable
                            onChange={v => update(i, { intensityMax: v })} />
                        </>
                      )}
                    </MiniVeld>
                  )}

                  <MiniVeld label="RIR">
                    <Num label="reps in reserve" value={paramWaarde(e, 'RIR')} min={0} max={10} step={1} nullable
                      onChange={v => update(i, { extraParams: metParam(e, 'RIR', v) })} />
                  </MiniVeld>
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
            Alle categorieën, klik voor {CATEGORY_LABELS[defaultCategory]}
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
              className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-[var(--p-surface-hi)]"
              style={{...CARD }}>
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
