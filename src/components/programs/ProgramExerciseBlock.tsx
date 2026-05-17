'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import type { BuilderExercise, ExtraParam, RepUnit } from './types'
import { STANDARD_PARAMS, REP_UNITS } from '@/lib/program-constants'
import { cn } from '@/lib/utils'
import { useAutosave } from '@/hooks/useAutosave'
import {
  GripVertical, X, Plus, ArrowUp, ArrowDown, MoreHorizontal, Play,
  Check, Loader2, AlertCircle, SlidersHorizontal, Trash2, StickyNote,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { VideoPlayer } from '@/components/exercises/VideoPlayer'
import { NumericInput } from '@/components/ui/numeric-input'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CustomParameter } from './types'

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH: '#BEF264', MOBILITY: '#60a5fa', PLYOMETRICS: '#f59e0b',
  CARDIO: '#f87171', STABILITY: '#a78bfa',
}

interface LibraryExerciseLike {
  id: string
  name: string
  category: string
  difficulty: string
  videoUrl?: string | null
  easierVariantId?: string | null
  harderVariantId?: string | null
  muscleLoads: Record<string, number>
}

interface Props {
  exercise: BuilderExercise
  onUpdate: (uid: string, patch: Partial<BuilderExercise>) => void
  onRemove: (uid: string) => void
  onToggleSelect: (uid: string) => void
  onSwapVariant: (uid: string, direction: 'easier' | 'harder') => void
  isInSuperset?: boolean
  allExercises?: LibraryExerciseLike[]
  customParams?: CustomParameter[]
}

function InlineNumber({
  value, onChange, min = 0, className,
}: { value: number; onChange: (n: number) => void; min?: number; className?: string }) {
  // Hergebruikt de shared NumericInput zodat het veld leeg kan zijn tijdens
  // edit (backspace clear → typ direct nieuw cijfer zonder eerst te selecteren).
  // allowEmpty=false: op blur snapt 'ie terug naar de vorige value.
  return (
    <NumericInput
      value={value}
      onChange={v => onChange(Math.max(min, v ?? min))}
      min={min}
      allowEmpty={false}
      className={cn(
        'w-10 h-5 text-center text-xs font-semibold bg-transparent rounded border-0 focus:outline-none focus:ring-1 focus:ring-[#e87a55]',
        className,
      )}
    />
  )
}

/** Vaste-veld chip (Sets, Reps, Pauze) met optionele filter/trash icoontjes. */
function FixedChip({
  label, children, onToggleRange, onRemove, isRange,
}: {
  label: string
  children: React.ReactNode
  onToggleRange?: () => void
  onRemove?: () => void
  isRange?: boolean
}) {
  return (
    <div className="group/chip inline-flex items-center gap-1 bg-[#1C2425] border border-[rgba(255,255,255,0.06)] rounded-md pl-2 pr-1 py-0.5 text-xs h-7">
      <span className="text-[#7B8889] font-medium">{label}</span>
      <span className="flex items-center gap-0.5 text-foreground">{children}</span>
      {(onToggleRange || onRemove) && (
        <span className="flex items-center gap-0.5 ml-0.5">
          {onToggleRange && (
            <button
              type="button"
              onClick={onToggleRange}
              title={isRange ? 'Verwijder range' : 'Maak range (min – max)'}
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center transition-colors',
                isRange
                  ? 'text-[#e87a55] bg-[rgba(232,122,85,0.10)] hover:bg-[rgba(232,122,85,0.18)]'
                  : 'text-[#7B8889] hover:text-foreground hover:bg-[rgba(255,255,255,0.06)]'
              )}
            >
              <SlidersHorizontal className="w-3 h-3" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Verwijder veld"
              className="w-5 h-5 rounded flex items-center justify-center text-[#7B8889] hover:text-red-400 hover:bg-[rgba(255,255,255,0.06)]"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

export function ProgramExerciseBlock({
  exercise, onUpdate, onRemove, onToggleSelect, onSwapVariant,
  isInSuperset = false, allExercises = [], customParams = [],
}: Props) {
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoUrlDraft, setVideoUrlDraft] = useState('')
  const setVideoUrl = trpc.exercises.setVideoUrl.useMutation({
    onError: (err) => toast.error(err.message ?? 'Toevoegen mislukt'),
  })

  async function handleAddVideoUrl(e: React.FormEvent) {
    e.preventDefault()
    const url = videoUrlDraft.trim()
    if (!url) return
    try {
      // Lichte client-side check zodat we niet onnodig naar server gaan
      // bij overduidelijk ongeldige URL's (server valideert ook met zod.url).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = new URL(url)
    } catch {
      toast.error('Geen geldige URL')
      return
    }
    await setVideoUrl.mutateAsync({ id: exercise.exerciseId, videoUrl: url })
    // Lokale builder-state updaten — andere instances van dezelfde oefening
    // in dit programma worden bij volgende reload pas bijgewerkt. Acceptabel
    // voor een zeldzame multi-instance flow; werkt direct voor de single case.
    onUpdate(exercise.uid, { videoUrl: url })
    setVideoUrlDraft('')
    toast.success('Video gekoppeld')
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.uid,
    data: { type: 'canvas-exercise', exercise },
  })

  const style = { transform: CSS.Transform.toString(transform), transition }
  const color = CATEGORY_COLORS[exercise.category] ?? '#e87a55'

  const addParam = (tpl: { label: string; type: 'number' | 'text' | 'select' | 'slider'; unit?: string; options?: string[]; min?: number; max?: number; defaultValue?: string | number }) => {
    if (exercise.extraParams.find(p => p.label === tpl.label)) return
    const newParam: ExtraParam = {
      id: `p-${Date.now()}`,
      label: tpl.label,
      type: tpl.type,
      value: tpl.defaultValue ?? (tpl.type === 'number' || tpl.type === 'slider' ? 0 : ''),
      unit: tpl.unit,
      options: tpl.options,
      min: tpl.min,
      max: tpl.max,
    }
    onUpdate(exercise.uid, { extraParams: [...exercise.extraParams, newParam] })
  }

  const removeParam = (id: string) =>
    onUpdate(exercise.uid, { extraParams: exercise.extraParams.filter(p => p.id !== id) })

  const updateParam = (id: string, value: string | number) =>
    onUpdate(exercise.uid, {
      extraParams: exercise.extraParams.map(p => p.id === id ? { ...p, value } : p),
    })

  /** Partiële update — voor velden anders dan `value`, bv. `valueMax` voor de
   *  range-modus. `valueMax: undefined` verwijdert de range-bovengrens. */
  const updateParamFields = (id: string, patch: Partial<ExtraParam>) =>
    onUpdate(exercise.uid, {
      extraParams: exercise.extraParams.map(p => {
        if (p.id !== id) return p
        const next: ExtraParam = { ...p, ...patch }
        // 'undefined' wordt door spread NIET verwijderd, maar wel naar
        // undefined gezet — wij willen de key écht weg om geen gerommel in
        // JSON te krijgen.
        if (patch.valueMax === undefined && 'valueMax' in patch) {
          delete next.valueMax
        }
        return next
      }),
    })

  // Autosave de huidige extraParams als nieuwe standaard voor deze oefening
  // in de library. Last-edit-wins: andere instances van dezelfde oefening in
  // dit programma blijven ongemoeid (geen propagation), maar volgende keer
  // dat je 'm uit de library sleept staan deze waarden er al op.
  const setDefaults = trpc.exercises.setDefaultExtraParams.useMutation()
  const defaultsAutosave = useAutosave<ExtraParam[]>({
    value: exercise.extraParams,
    onSave: async (params) => {
      await setDefaults.mutateAsync({
        id: exercise.exerciseId,
        defaultExtraParams: params.map(p => ({
          id: p.id, label: p.label, type: p.type, value: p.value,
          // valueMax wordt naar de oefening-default geschreven als die per-instance
          // is gezet — handig voor "5-10 reps" als nieuwe default voor deze oefening.
          ...(p.valueMax !== undefined ? { valueMax: p.valueMax } : {}),
          unit: p.unit, options: p.options, min: p.min, max: p.max,
        })),
      })
    },
    debounceMs: 1000,
    enabled: exercise.extraParams.length > 0,
  })

  const easierEx = exercise.easierVariantId
    ? allExercises.find(e => e.id === exercise.easierVariantId)
    : null
  const harderEx = exercise.harderVariantId
    ? allExercises.find(e => e.id === exercise.harderVariantId)
    : null

  // All available custom params not already added
  const availableCustom = customParams.filter(
    cp => !exercise.extraParams.find(ep => ep.label === cp.label)
  )
  const availableStandard = STANDARD_PARAMS.filter(
    p => !exercise.extraParams.find(ep => ep.label === p.label)
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-lg border bg-[#141A1B] transition-all',
        isDragging ? 'opacity-50 shadow-xl z-50' : 'hover:border-[rgba(255,255,255,0.16)]',
        exercise.selected && 'ring-2 ring-[#e87a55] border-[#e87a55]',
        isInSuperset && 'border-transparent'
      )}
    >
      {/* Header row */}
      <div className="flex flex-col px-2 pt-2 pb-1 gap-1">
        {/* Top line: drag-handle + checkbox + color + name + menu + X.
            Drag-listeners zitten ALLEEN op de GripVertical — anders triggert
            klikken op een input/pill een drag wanneer de cursor 6px+ beweegt,
            waardoor de tile spontaan verplaatst. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-0.5 -m-0.5 rounded hover:bg-[rgba(255,255,255,0.05)]"
            aria-label="Sleep om te verplaatsen"
          >
            <GripVertical className="w-4 h-4 text-zinc-300" />
          </button>

          <input
            type="checkbox"
            checked={exercise.selected}
            onChange={() => onToggleSelect(exercise.uid)}
            className="w-3.5 h-3.5 shrink-0 accent-[#e87a55]"
          />

          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />

          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            className="flex-1 text-sm font-semibold truncate min-w-0 text-left hover:underline decoration-dotted underline-offset-2"
          >
            {exercise.name}
          </button>

          {/* Variant-swap quick-chips — direct zichtbaar zodat therapeut
              weet dat er een progressie/regressie beschikbaar is. */}
          {(easierEx || harderEx) && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {easierEx && (
                <button
                  type="button"
                  onClick={() => onSwapVariant(exercise.uid, 'easier')}
                  title={`Wissel naar gemakkelijker: ${easierEx.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors"
                  style={{
                    color: '#93C5FD',
                    borderColor: 'rgba(147,197,253,0.3)',
                    background: 'rgba(147,197,253,0.08)',
                    letterSpacing: '0.08em',
                  }}
                >
                  <ArrowDown className="w-3 h-3" />
                  EASY
                </button>
              )}
              {harderEx && (
                <button
                  type="button"
                  onClick={() => onSwapVariant(exercise.uid, 'harder')}
                  title={`Wissel naar zwaarder: ${harderEx.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors"
                  style={{
                    color: '#F4C261',
                    borderColor: 'rgba(244,194,97,0.3)',
                    background: 'rgba(244,194,97,0.08)',
                    letterSpacing: '0.08em',
                  }}
                >
                  <ArrowUp className="w-3 h-3" />
                  HARD
                </button>
              )}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {/* Variant swap */}
              {easierEx && (
                <DropdownMenuItem onClick={() => onSwapVariant(exercise.uid, 'easier')} className="gap-2 text-blue-600">
                  <ArrowDown className="w-3.5 h-3.5" />
                  Regressie → {easierEx.name}
                </DropdownMenuItem>
              )}
              {harderEx && (
                <DropdownMenuItem onClick={() => onSwapVariant(exercise.uid, 'harder')} className="gap-2 text-amber-600">
                  <ArrowUp className="w-3.5 h-3.5" />
                  Progressie → {harderEx.name}
                </DropdownMenuItem>
              )}
              {(easierEx || harderEx) && <DropdownMenuSeparator />}

              {/* Standard params */}
              {availableStandard.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs">Standaard parameters</DropdownMenuLabel>
                  {availableStandard.map(p => (
                    <DropdownMenuItem key={p.label} onClick={() => addParam(p)} className="text-xs">
                      + {p.label}
                      {(p as { unit?: string }).unit && (
                        <span className="text-muted-foreground ml-1">{(p as { unit?: string }).unit}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Custom params */}
              {availableCustom.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Custom parameters</DropdownMenuLabel>
                  {availableCustom.map(cp => (
                    <DropdownMenuItem key={cp.id} onClick={() => addParam(cp)} className="text-xs">
                      + {cp.label}
                      {cp.unit && <span className="text-muted-foreground ml-1">{cp.unit}</span>}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onRemove(exercise.uid)} className="text-destructive gap-2">
                <X className="w-3.5 h-3.5" />
                Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button onClick={() => onRemove(exercise.uid)} className="text-zinc-300 hover:text-destructive shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Second line: pills + chip-row.
            - Pills tonen alleen parameters die NOG NIET zijn toegevoegd, zodat
              je snel kunt klikken zonder het menu te openen.
            - Chips staan op één flex-wrap rij — sets, reps, pauze + extras
              schuiven netjes naast elkaar door, ook bij smalle schermen. */}
        <div className="pl-10 space-y-1 pb-1">

          {/* Quick-add pills + notitie-pill (alleen tonen als nog geen notitie) */}
          {(availableStandard.length > 0 || !exercise.notes) && (
            <div className="flex flex-wrap gap-1">
              {availableStandard.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => addParam(p)}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold border border-[rgba(255,255,255,0.10)] text-[#7B8889] hover:text-[#e87a55] hover:border-[rgba(232,122,85,0.35)] hover:bg-[rgba(232,122,85,0.06)] transition-colors"
                >
                  <Plus className="w-2.5 h-2.5" strokeWidth={3} />
                  {p.label}
                </button>
              ))}
              {!exercise.notes && (
                <button
                  type="button"
                  onClick={() => onUpdate(exercise.uid, { notes: ' ' })}
                  title="Voeg een notitie toe die alleen voor deze patiënt zichtbaar is"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold border border-[rgba(255,255,255,0.10)] text-[#7B8889] hover:text-[#4ECDC4] hover:border-[rgba(78,205,196,0.35)] hover:bg-[rgba(78,205,196,0.06)] transition-colors"
                >
                  <StickyNote className="w-2.5 h-2.5" />
                  Notitie
                </button>
              )}
            </div>
          )}

          {/* Param chips — alle waarden naast elkaar, één rij die wrapt. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Sets */}
            <FixedChip
              label="Set"
              isRange={exercise.setsMax != null}
              onToggleRange={() => onUpdate(exercise.uid, {
                setsMax: exercise.setsMax == null ? Math.max(exercise.sets + 1, 2) : null,
              })}
            >
              <InlineNumber value={exercise.sets} onChange={v => onUpdate(exercise.uid, { sets: v })} min={1} />
              {exercise.setsMax != null && (
                <>
                  <span className="text-[#7B8889]">–</span>
                  <InlineNumber
                    value={exercise.setsMax}
                    onChange={v => onUpdate(exercise.uid, { setsMax: Math.max(exercise.sets, v) })}
                    min={Math.max(1, exercise.sets)}
                  />
                </>
              )}
            </FixedChip>

            {/* Reps + repUnit-selector inline */}
            <FixedChip
              label={exercise.repUnit === 'sec' ? 'Houd vast' : exercise.repUnit === 'min' ? 'Duur' : 'Herhalingen'}
              isRange={exercise.repsMax != null}
              onToggleRange={() => onUpdate(exercise.uid, {
                repsMax: exercise.repsMax == null ? Math.max(exercise.reps * 2, exercise.reps + 1) : null,
              })}
            >
              <InlineNumber value={exercise.reps} onChange={v => onUpdate(exercise.uid, { reps: v })} min={1} />
              {exercise.repsMax != null && (
                <>
                  <span className="text-[#7B8889]">–</span>
                  <InlineNumber
                    value={exercise.repsMax}
                    onChange={v => onUpdate(exercise.uid, { repsMax: Math.max(exercise.reps, v) })}
                    min={Math.max(1, exercise.reps)}
                  />
                </>
              )}
              <select
                value={exercise.repUnit}
                onChange={e => onUpdate(exercise.uid, { repUnit: e.target.value as RepUnit })}
                className="text-xs bg-transparent border-0 rounded px-0.5 h-5 focus:outline-none focus:ring-1 focus:ring-[#e87a55] text-[#7B8889]"
              >
                {REP_UNITS.map(u => <option key={u.value} value={u.value} className="bg-[#1C2425]">{u.label}</option>)}
              </select>
            </FixedChip>

            {/* Pauze (rest) — geen range-support op schema-niveau, dus alleen
                enkele waarde. */}
            <FixedChip label="Pauze">
              <InlineNumber value={exercise.rest} onChange={v => onUpdate(exercise.uid, { rest: v })} min={0} />
              <span className="text-[#7B8889]">s</span>
            </FixedChip>

            {/* Extra params — elk in een chip met filter (range) en trash. */}
            {exercise.extraParams.map(param => {
              const isRange = param.valueMax !== undefined && param.valueMax !== null && param.valueMax !== ''
              const supportsRange = param.type === 'number' || param.type === 'slider'
              return (
                <FixedChip
                  key={param.id}
                  label={param.label}
                  isRange={isRange}
                  onToggleRange={supportsRange
                    ? () => updateParamFields(param.id, {
                        valueMax: isRange
                          ? undefined
                          : (typeof param.value === 'number'
                              ? Math.max((param.value as number) + 1, (param.value as number) * 2)
                              : ''),
                      })
                    : undefined}
                  onRemove={() => removeParam(param.id)}
                >
                  {param.type === 'number' ? (
                    <>
                      <InlineNumber
                        value={param.value as number}
                        onChange={v => updateParam(param.id, v)}
                        min={param.min ?? 0}
                      />
                      {isRange && (
                        <>
                          <span className="text-[#7B8889]">–</span>
                          <InlineNumber
                            value={Number(param.valueMax) || 0}
                            onChange={v => updateParamFields(param.id, { valueMax: v })}
                            min={Number(param.value) || 0}
                          />
                        </>
                      )}
                      {param.unit && <span className="text-[#7B8889]">{param.unit}</span>}
                    </>
                  ) : param.type === 'slider' ? (
                    <>
                      <input
                        type="range"
                        min={param.min ?? 0}
                        max={param.max ?? 10}
                        value={param.value as number}
                        onChange={e => updateParam(param.id, Number(e.target.value))}
                        className="w-14 h-1 accent-[#e87a55]"
                      />
                      <span className="font-semibold w-4 text-center">{param.value}</span>
                      {isRange && (
                        <>
                          <span className="text-[#7B8889]">–</span>
                          <input
                            type="range"
                            min={param.min ?? 0}
                            max={param.max ?? 10}
                            value={Number(param.valueMax) || 0}
                            onChange={e => updateParamFields(param.id, { valueMax: Number(e.target.value) })}
                            className="w-14 h-1 accent-[#e87a55]"
                          />
                          <span className="font-semibold w-4 text-center">{param.valueMax}</span>
                        </>
                      )}
                      {param.unit && <span className="text-[#7B8889]">{param.unit}</span>}
                    </>
                  ) : param.type === 'select' && param.options ? (
                    <select
                      value={param.value as string}
                      onChange={e => updateParam(param.id, e.target.value)}
                      className="bg-transparent border-0 text-xs font-semibold focus:outline-none"
                    >
                      {param.options.map(o => <option key={o} className="bg-[#1C2425]">{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={param.value as string}
                      onChange={e => updateParam(param.id, e.target.value)}
                      className="w-16 bg-transparent border-0 text-xs font-semibold focus:outline-none"
                    />
                  )}
                </FixedChip>
              )
            })}
          </div>

          {/* Patiënt-notitie — opgeslagen op deze ProgramExercise (niet op de
              globale Exercise), dus alleen zichtbaar binnen dit specifieke
              programma. Wordt meegestuurd naar de patiënt-app. */}
          {exercise.notes !== null && exercise.notes !== undefined && (
            <div className="flex items-start gap-1.5 mt-1 group/note">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#4ECDC4] shrink-0 pt-1">
                <StickyNote className="w-2.5 h-2.5" />
                Voor patiënt
              </div>
              <textarea
                value={exercise.notes}
                onChange={e => onUpdate(exercise.uid, { notes: e.target.value })}
                placeholder="Specifieke instructie alleen voor deze patiënt — wordt met dit programma meegestuurd."
                rows={2}
                className="flex-1 text-xs bg-[#1C2425] border border-[rgba(78,205,196,0.20)] rounded-md px-2 py-1.5 resize-y min-h-[2.5rem] focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] focus:border-[#4ECDC4] placeholder:text-[#566060]"
              />
              <button
                type="button"
                onClick={() => onUpdate(exercise.uid, { notes: null })}
                title="Verwijder notitie"
                className="w-5 h-5 rounded flex items-center justify-center text-[#7B8889] hover:text-red-400 hover:bg-[rgba(255,255,255,0.06)] mt-1 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Inline autosave-status van defaults */}
          {exercise.extraParams.length > 0 && defaultsAutosave.status !== 'idle' && (
            <div
              className="flex items-center gap-1 text-[10px] font-semibold text-[#7B8889]"
              title="Deze parameters worden automatisch als standaard onthouden voor deze oefening."
            >
              {defaultsAutosave.status === 'saving' && (
                <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Onthouden…</>
              )}
              {defaultsAutosave.status === 'pending' && (
                <><Loader2 className="w-2.5 h-2.5 animate-spin opacity-50" /> Onthouden…</>
              )}
              {defaultsAutosave.status === 'saved' && (
                <><Check className="w-2.5 h-2.5" style={{ color: '#BEF264' }} /> Onthouden</>
              )}
              {defaultsAutosave.status === 'error' && (
                <button
                  type="button"
                  onClick={() => { void defaultsAutosave.saveNow() }}
                  className="flex items-center gap-1 text-red-400 hover:text-red-300"
                >
                  <AlertCircle className="w-2.5 h-2.5" /> Mislukt — opnieuw
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video dialog */}
      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-lg" style={{ borderRadius: '16px' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              {exercise.name}
            </DialogTitle>
          </DialogHeader>
          {exercise.videoUrl ? (
            <VideoPlayer url={exercise.videoUrl} />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border-2 border-dashed gap-3">
              <div className="w-12 h-12 rounded-full bg-[#1C2425] flex items-center justify-center">
                <Play className="w-5 h-5 text-[#7B8889]" />
              </div>
              <div>
                <p className="text-sm font-medium">Nog geen video gekoppeld</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Plak een YouTube of Vimeo link en sla 'm op — wordt direct
                  gekoppeld aan deze oefening voor alle programma's.
                </p>
              </div>
              <form onSubmit={handleAddVideoUrl} className="w-full max-w-sm flex gap-2 mt-2">
                <input
                  type="url"
                  placeholder="https://youtube.com/..."
                  value={videoUrlDraft}
                  onChange={e => setVideoUrlDraft(e.target.value)}
                  disabled={setVideoUrl.isPending}
                  className="flex-1 h-9 px-3 text-sm bg-[#1C2425] rounded-md border border-[rgba(255,255,255,0.10)] focus:outline-none focus:ring-1 focus:ring-[#e87a55] focus:border-[#e87a55] placeholder:text-[#566060]"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={setVideoUrl.isPending || !videoUrlDraft.trim()}
                  style={{ background: '#e87a55', color: '#0A0E0F' }}
                >
                  {setVideoUrl.isPending ? '…' : 'Koppel'}
                </Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
