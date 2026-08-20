'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import type { BuilderExercise, ExtraParam, RepUnit } from './types'
import {
  INTENSITY_TYPES, INTENSITY_TYPE_LABELS, type IntensityType,
  formatSetsReps, formatPrescription, toPrescription, formatPrescribedParam,
  type PrescribedParam,
} from '@/lib/prescription'
import { STANDARD_PARAMS, REP_UNITS } from '@/lib/program-constants'
import { cn } from '@/lib/utils'
import { useAutosave } from '@/hooks/useAutosave'
import {
  GripVertical, X, Plus, ArrowUp, ArrowDown, MoreHorizontal, Play,
  Check, Loader2, AlertCircle, SlidersHorizontal, Trash2, StickyNote,
  ChevronDown, ChevronUp,
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
import { useCategoryColors } from '@/lib/useCategoryColors'


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
  /** Ingeklapt = één samengevatte doseerregel; uitgeklapt = bewerkbare chips.
   *  Ongecontroleerd (undefined) valt terug op uitgeklapt (legacy gedrag). */
  expanded?: boolean
  onToggleExpanded?: (uid: string) => void
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
        'w-10 h-5 text-center text-xs font-semibold bg-transparent rounded border-0 focus:outline-none focus:ring-1 focus:ring-[var(--p-brand)]',
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
    // shrink-0 + min-h i.p.v. h-7: een lang label ("Herhalingen (per zijde)")
    // maakt de chip breder dan een smalle kolom, en dan kneep de flex-rij 'm
    // onder zijn tekstbreedte — waarna het label binnen de vaste hoogte brak
    // en over de chips eronder heen viel. Liever een eigen regel.
    <div className="group/chip inline-flex shrink-0 items-center gap-1 bg-[var(--p-surface-hi)] border border-[rgba(212,232,230,0.06)] rounded-md pl-2 pr-1 py-0.5 text-xs min-h-7">
      <span className="text-[var(--p-ink-muted)] font-medium whitespace-nowrap">{label}</span>
      <span className="flex items-center gap-0.5 text-foreground">{children}</span>
      {(onToggleRange || onRemove) && (
        <span className="flex items-center gap-0.5 ml-0.5">
          {onToggleRange && (
            <button
              type="button"
              onClick={onToggleRange}
              title={isRange ? 'Verwijder range' : 'Maak range (min, max)'}
              className={cn(
                'w-5 h-5 rounded flex items-center justify-center transition-colors',
                isRange
                  ? 'text-[var(--p-brand)] bg-[rgba(232,122,85,0.10)] hover:bg-[rgba(232,122,85,0.18)]'
                  : 'text-[var(--p-ink-muted)] hover:text-foreground hover:bg-[rgba(212,232,230,0.06)]'
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
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--p-ink-muted)] hover:text-[var(--p-danger)] hover:bg-[rgba(212,232,230,0.06)]"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

/**
 * Intensiteits-voorschrift-chip: kies type (RPE / %1RM / onder daily max /
 * techniek / vrije tekst) en de bijbehorende waarde(n). Vervangt het in-de-
 * notitie-frommelen van "RPE 8" of "-10kg onder daily max" door een
 * gestructureerd doel dat de session-runner toont en omrekent naar kg.
 */
function PrescriptionChip({
  exercise, onUpdate,
}: {
  exercise: BuilderExercise
  onUpdate: (uid: string, patch: Partial<BuilderExercise>) => void
}) {
  const t: IntensityType = exercise.intensityType ?? 'NONE'
  const set = (patch: Partial<BuilderExercise>) => onUpdate(exercise.uid, patch)
  const numInput = (
    val: number | null | undefined,
    on: (n: number | null) => void,
    ph: string,
    w = 'w-10',
  ) => (
    <input
      type="number"
      value={val ?? ''}
      placeholder={ph}
      onChange={e => on(e.target.value === '' ? null : Number(e.target.value))}
      className={cn(
        w,
        'h-5 text-center text-xs font-semibold bg-transparent rounded border-0 focus:outline-none focus:ring-1 focus:ring-[var(--p-brand)]',
      )}
    />
  )
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md pl-2 pr-1.5 py-0.5 text-xs h-7 transition-colors',
        // Doel is klinisch het belangrijkste voorschrift — met een gezet type
        // krijgt de chip een accent zodat 'ie niet wegvalt tussen de rest.
        t !== 'NONE'
          ? 'bg-[rgba(232,122,85,0.10)] border border-[rgba(232,122,85,0.40)]'
          : 'bg-[var(--p-surface-hi)] border border-[rgba(212,232,230,0.06)]',
      )}
    >
      <span className={cn('font-semibold', t !== 'NONE' ? 'text-[var(--p-brand)]' : 'text-[var(--p-ink-muted)]')}>Doel</span>
      <select
        value={t}
        onChange={e =>
          // Reset de waarden bij type-wissel zodat er geen betekenisloos
          // getal van het vorige type blijft hangen.
          set({ intensityType: e.target.value as IntensityType, intensityMin: null, intensityMax: null, intensityText: null })
        }
        className="text-xs bg-transparent border-0 rounded px-0.5 h-5 focus:outline-none focus:ring-1 focus:ring-[var(--p-brand)] text-foreground"
      >
        {INTENSITY_TYPES.map(it => (
          <option key={it} value={it} className="bg-[var(--p-surface-hi)]">{INTENSITY_TYPE_LABELS[it]}</option>
        ))}
      </select>
      {(t === 'RPE' || t === 'PERCENT_1RM') && (
        <span className="flex items-center gap-0.5 text-foreground">
          {numInput(exercise.intensityMin, n => set({ intensityMin: n }), t === 'RPE' ? '7' : '70')}
          <span className="text-[var(--p-ink-muted)]">–</span>
          {numInput(exercise.intensityMax, n => set({ intensityMax: n }), t === 'RPE' ? '8' : '75')}
          {t === 'PERCENT_1RM' && <span className="text-[var(--p-ink-muted)]">%</span>}
        </span>
      )}
      {t === 'RELATIVE_DAILY_MAX' && (
        <span className="flex items-center gap-0.5 text-foreground">
          {numInput(exercise.intensityMin, n => set({ intensityMin: n }), '-10', 'w-12')}
          <span className="text-[var(--p-ink-muted)]">kg</span>
        </span>
      )}
      {(t === 'TEXT' || t === 'TECHNIQUE') && (
        <input
          type="text"
          value={exercise.intensityText ?? ''}
          placeholder={t === 'TECHNIQUE' ? 'techniek…' : 'vrij voorschrift'}
          onChange={e => set({ intensityText: e.target.value || null })}
          className="w-28 h-5 text-xs bg-transparent border-0 rounded px-1 focus:outline-none focus:ring-1 focus:ring-[var(--p-brand)] text-foreground"
        />
      )}
    </div>
  )
}

export function ProgramExerciseBlock({
  exercise, onUpdate, onRemove, onToggleSelect, onSwapVariant,
  isInSuperset = false, allExercises = [], customParams = [],
  expanded, onToggleExpanded,
}: Props) {
  // undefined = ongecontroleerd → altijd uitgeklapt (legacy gedrag voor
  // aanroepplekken die de expand-state (nog) niet beheren).
  const isExpanded = expanded ?? true
  const toggleExpanded = () => onToggleExpanded?.(exercise.uid)
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
  // Via de hook, niet rechtstreeks uit het palet: anders negeert dit scherm
  // de kleuren die de praktijk zelf heeft ingesteld terwijl de agenda ze wel
  // volgt, en dan lopen twee schermen uit elkaar zodra iemand iets aanpast.
  const catColors = useCategoryColors()
  const color = catColors[exercise.category] ?? 'var(--p-brand)'

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

  // Samengevatte doseerregel voor de ingeklapte kaart: "3–5 × 8–12 reps · 60s"
  // plus het intensiteits-doel (accent) en de gevulde extra params (gedempt).
  const prescriptionLabel = formatPrescription(toPrescription(exercise))
  const filledParamLabels = exercise.extraParams
    .map(p => formatPrescribedParam(p as PrescribedParam))
    .filter((s): s is string => !!s)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-lg border bg-[var(--p-surface)] transition-all',
        isDragging ? 'opacity-50 shadow-xl z-50' : 'hover:border-[rgba(212,232,230,0.16)]',
        exercise.selected && 'ring-2 ring-[var(--p-brand)] border-[var(--p-brand)]',
        isInSuperset && 'border-transparent'
      )}
    >
      {/* Header row */}
      <div className="flex flex-col px-2 pt-2 pb-1 gap-1">
        {/* Top line: drag-handle + checkbox + color + name + menu + X.
            Drag-listeners zitten ALLEEN op de GripVertical — anders triggert
            klikken op een input/pill een drag wanneer de cursor 6px+ beweegt,
            waardoor de tile spontaan verplaatst. */}
        <div
          className={cn('flex items-center gap-2', onToggleExpanded && 'cursor-pointer')}
          // Klik op de balk zelf = parameters uit-/inklappen. De interactieve
          // onderdelen (naam→video, checkbox, grip, chevron, menu, X, chips)
          // stoppen de bubble zodat zij hun eigen actie houden.
          onClick={onToggleExpanded ? toggleExpanded : undefined}
        >
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-0.5 -m-0.5 rounded hover:bg-[rgba(212,232,230,0.05)]"
            aria-label="Sleep om te verplaatsen"
          >
            <GripVertical className="w-4 h-4 text-[var(--p-ink-muted)]" />
          </button>

          <input
            type="checkbox"
            checked={exercise.selected}
            onChange={() => onToggleSelect(exercise.uid)}
            onClick={e => e.stopPropagation()}
            className="w-3.5 h-3.5 shrink-0 accent-[var(--p-brand)]"
          />

          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />

          <button
            type="button"
            onClick={e => { e.stopPropagation(); setVideoOpen(true) }}
            title="Klik voor video"
            className="flex-1 text-sm font-semibold truncate min-w-0 text-left hover:underline decoration-dotted underline-offset-2"
          >
            {exercise.name}
          </button>

          {/* Ingeklapt: samengevatte doseerregel op dezelfde rij — hele kaart
              blijft één regel hoog, klik = uitklappen om te bewerken. */}
          {!isExpanded && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggleExpanded() }}
              title="Klik om te bewerken"
              className="hidden sm:flex items-center gap-1.5 shrink min-w-0 max-w-[60%] group/summary"
            >
              <span className="athletic-mono text-[11px] whitespace-nowrap text-[var(--p-ink-muted)] group-hover/summary:text-foreground transition-colors">
                {formatSetsReps(exercise.sets, exercise.setsMax, exercise.reps, exercise.repsMax, exercise.repUnit)}
                {exercise.rest > 0 && <span className="text-[var(--p-ink-dim)]"> · {exercise.rest}s</span>}
              </span>
              {prescriptionLabel && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
                  style={{ background: 'rgba(232,122,85,0.12)', color: 'var(--p-brand)', border: '1px solid rgba(232,122,85,0.30)' }}
                >
                  {prescriptionLabel}
                </span>
              )}
              {filledParamLabels.slice(0, 2).map(label => (
                <span
                  key={label}
                  className="athletic-mono text-[10px] whitespace-nowrap truncate text-[var(--p-ink-muted)]"
                >
                  {label}
                </span>
              ))}
              {filledParamLabels.length > 2 && (
                <span className="athletic-mono text-[10px] text-[var(--p-ink-dim)] shrink-0">
                  +{filledParamLabels.length - 2}
                </span>
              )}
              {!!exercise.notes?.trim() && (
                <StickyNote className="w-3 h-3 shrink-0 text-[var(--p-ice)]" aria-label="Heeft patiënt-notitie" />
              )}
            </button>
          )}

          {/* Variant-swap quick-chips — direct zichtbaar zodat therapeut
              weet dat er een progressie/regressie beschikbaar is. */}
          {isExpanded && (easierEx || harderEx) && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {easierEx && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onSwapVariant(exercise.uid, 'easier') }}
                  title={`Wissel naar gemakkelijker: ${easierEx.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors"
                  style={{
                    color: 'var(--p-ice)',
                    borderColor: 'rgba(159,206,201,0.3)',
                    background: 'rgba(159,206,201,0.08)',
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
                  onClick={e => { e.stopPropagation(); onSwapVariant(exercise.uid, 'harder') }}
                  title={`Wissel naar zwaarder: ${harderEx.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors"
                  style={{
                    color: 'var(--p-gold)',
                    borderColor: 'rgba(245,185,66,0.3)',
                    background: 'rgba(245,185,66,0.08)',
                    letterSpacing: '0.08em',
                  }}
                >
                  <ArrowUp className="w-3 h-3" />
                  HARD
                </button>
              )}
            </div>
          )}

          {/* Uitklap-toggle — parameters toevoegen zit in de uitgeklapte rij
              (+ Parameter), dus het menu blijft klein: varianten + verwijderen. */}
          {onToggleExpanded && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggleExpanded() }}
              title={isExpanded ? 'Inklappen' : 'Uitklappen om te bewerken'}
              className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-[var(--p-ink-muted)] hover:text-foreground hover:bg-[rgba(212,232,230,0.06)] transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={e => e.stopPropagation()} className="h-6 w-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {/* Variant swap */}
              {easierEx && (
                <DropdownMenuItem onClick={() => onSwapVariant(exercise.uid, 'easier')} className="gap-2 text-[#7FB0D8]">
                  <ArrowDown className="w-3.5 h-3.5" />
                  Regressie → {easierEx.name}
                </DropdownMenuItem>
              )}
              {harderEx && (
                <DropdownMenuItem onClick={() => onSwapVariant(exercise.uid, 'harder')} className="gap-2 text-[var(--p-gold)]">
                  <ArrowUp className="w-3.5 h-3.5" />
                  Progressie → {harderEx.name}
                </DropdownMenuItem>
              )}
              {(easierEx || harderEx) && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => onRemove(exercise.uid)} className="text-destructive gap-2">
                <X className="w-3.5 h-3.5" />
                Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button onClick={e => { e.stopPropagation(); onRemove(exercise.uid) }} className="text-[var(--p-ink-muted)] hover:text-destructive shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobiel (smal scherm): samenvatting op een eigen regel, want inline
            naast de naam past 'ie daar niet. */}
        {!isExpanded && (
          <button
            type="button"
            onClick={toggleExpanded}
            className="sm:hidden flex items-center gap-1.5 pl-10 pb-1 text-left min-w-0"
          >
            <span className="athletic-mono text-[11px] whitespace-nowrap text-[var(--p-ink-muted)]">
              {formatSetsReps(exercise.sets, exercise.setsMax, exercise.reps, exercise.repsMax, exercise.repUnit)}
              {exercise.rest > 0 && <span className="text-[var(--p-ink-dim)]"> · {exercise.rest}s</span>}
            </span>
            {prescriptionLabel && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap truncate"
                style={{ background: 'rgba(232,122,85,0.12)', color: 'var(--p-brand)', border: '1px solid rgba(232,122,85,0.30)' }}
              >
                {prescriptionLabel}
              </span>
            )}
            {!!exercise.notes?.trim() && (
              <StickyNote className="w-3 h-3 shrink-0 text-[var(--p-ice)]" />
            )}
          </button>
        )}

        {/* Uitgeklapte bewerk-rij: sets/reps/pauze/doel + gevulde extra params
            op één wrappende chip-rij. Nieuwe parameters komen via de
            "+ Parameter"-chip aan het eind — geen rij lege suggestie-pills
            meer per kaart. */}
        {isExpanded && (
        <div className="pl-10 space-y-1 pb-1">

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
                  <span className="text-[var(--p-ink-muted)]">–</span>
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
              label={exercise.repUnit === 'sec' ? 'Houd vast' : exercise.repUnit === 'sec/zijde' ? 'Houd vast (per zijde)' : exercise.repUnit === 'min' ? 'Duur' : exercise.repUnit === 'reps/zijde' ? 'Herhalingen (per zijde)' : 'Herhalingen'}
              isRange={exercise.repsMax != null}
              onToggleRange={() => onUpdate(exercise.uid, {
                repsMax: exercise.repsMax == null ? Math.max(exercise.reps * 2, exercise.reps + 1) : null,
              })}
            >
              <InlineNumber value={exercise.reps} onChange={v => onUpdate(exercise.uid, { reps: v })} min={1} />
              {exercise.repsMax != null && (
                <>
                  <span className="text-[var(--p-ink-muted)]">–</span>
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
                className="shrink-0 max-w-[7.5rem] text-xs bg-transparent border-0 rounded px-0.5 h-5 focus:outline-none focus:ring-1 focus:ring-[var(--p-brand)] text-[var(--p-ink-muted)]"
              >
                {REP_UNITS.map(u => <option key={u.value} value={u.value} className="bg-[var(--p-surface-hi)]">{u.label}</option>)}
              </select>
            </FixedChip>

            {/* Pauze (rest) — geen range-support op schema-niveau, dus alleen
                enkele waarde. */}
            <FixedChip label="Pauze">
              <InlineNumber value={exercise.rest} onChange={v => onUpdate(exercise.uid, { rest: v })} min={0} />
              <span className="text-[var(--p-ink-muted)]">s</span>
            </FixedChip>

            {/* Intensiteits-voorschrift (RPE / %1RM / onder daily max / …) */}
            <PrescriptionChip exercise={exercise} onUpdate={onUpdate} />

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
                          <span className="text-[var(--p-ink-muted)]">–</span>
                          <InlineNumber
                            value={Number(param.valueMax) || 0}
                            onChange={v => updateParamFields(param.id, { valueMax: v })}
                            min={Number(param.value) || 0}
                          />
                        </>
                      )}
                      {param.unit && <span className="text-[var(--p-ink-muted)]">{param.unit}</span>}
                    </>
                  ) : param.type === 'slider' ? (
                    <>
                      <input
                        type="range"
                        min={param.min ?? 0}
                        max={param.max ?? 10}
                        value={param.value as number}
                        onChange={e => updateParam(param.id, Number(e.target.value))}
                        className="w-14 h-1 accent-[var(--p-brand)]"
                      />
                      <span className="font-semibold w-4 text-center">{param.value}</span>
                      {isRange && (
                        <>
                          <span className="text-[var(--p-ink-muted)]">–</span>
                          <input
                            type="range"
                            min={param.min ?? 0}
                            max={param.max ?? 10}
                            value={Number(param.valueMax) || 0}
                            onChange={e => updateParamFields(param.id, { valueMax: Number(e.target.value) })}
                            className="w-14 h-1 accent-[var(--p-brand)]"
                          />
                          <span className="font-semibold w-4 text-center">{param.valueMax}</span>
                        </>
                      )}
                      {param.unit && <span className="text-[var(--p-ink-muted)]">{param.unit}</span>}
                    </>
                  ) : param.type === 'select' && param.options ? (
                    <select
                      value={param.value as string}
                      onChange={e => updateParam(param.id, e.target.value)}
                      className="bg-transparent border-0 text-xs font-semibold focus:outline-none"
                    >
                      {param.options.map(o => <option key={o} className="bg-[var(--p-surface-hi)]">{o}</option>)}
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

            {/* Eén "+ Parameter"-menu i.p.v. een rij lege suggestie-pills. */}
            {(availableStandard.length > 0 || availableCustom.length > 0) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold border border-dashed border-[rgba(212,232,230,0.14)] text-[var(--p-ink-muted)] hover:text-[var(--p-brand)] hover:border-[rgba(232,122,85,0.40)] hover:bg-[rgba(232,122,85,0.06)] transition-colors"
                  >
                    <Plus className="w-3 h-3" strokeWidth={3} />
                    Parameter
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 max-h-80 overflow-y-auto">
                  {availableStandard.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-xs">Standaard</DropdownMenuLabel>
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
                  {availableCustom.length > 0 && (
                    <>
                      {availableStandard.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-xs">Eigen parameters</DropdownMenuLabel>
                      {availableCustom.map(cp => (
                        <DropdownMenuItem key={cp.id} onClick={() => addParam(cp)} className="text-xs">
                          + {cp.label}
                          {cp.unit && <span className="text-muted-foreground ml-1">{cp.unit}</span>}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Notitie-pill alleen tonen zolang er geen notitie staat. */}
            {!exercise.notes && (
              <button
                type="button"
                onClick={() => onUpdate(exercise.uid, { notes: ' ' })}
                title="Voeg een notitie toe die alleen voor deze patiënt zichtbaar is"
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold border border-dashed border-[rgba(212,232,230,0.14)] text-[var(--p-ink-muted)] hover:text-[var(--p-ice)] hover:border-[rgba(159,206,201,0.40)] hover:bg-[rgba(159,206,201,0.06)] transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                Notitie
              </button>
            )}
          </div>

          {/* Patiënt-notitie — opgeslagen op deze ProgramExercise (niet op de
              globale Exercise), dus alleen zichtbaar binnen dit specifieke
              programma. Wordt meegestuurd naar de patiënt-app. */}
          {exercise.notes !== null && exercise.notes !== undefined && (
            <div className="flex items-start gap-1.5 mt-1 group/note">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--p-ice)] shrink-0 pt-1">
                <StickyNote className="w-2.5 h-2.5" />
                Voor patiënt
              </div>
              <textarea
                value={exercise.notes}
                onChange={e => onUpdate(exercise.uid, { notes: e.target.value })}
                placeholder="Specifieke instructie alleen voor deze patiënt, wordt met dit programma meegestuurd."
                rows={2}
                className="flex-1 text-xs bg-[var(--p-surface-hi)] border border-[rgba(159,206,201,0.20)] rounded-md px-2 py-1.5 resize-y min-h-[2.5rem] focus:outline-none focus:ring-1 focus:ring-[var(--p-ice)] focus:border-[var(--p-ice)] placeholder:text-[var(--p-ink-dim)]"
              />
              <button
                type="button"
                onClick={() => onUpdate(exercise.uid, { notes: null })}
                title="Verwijder notitie"
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--p-ink-muted)] hover:text-[var(--p-danger)] hover:bg-[rgba(212,232,230,0.06)] mt-1 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Inline autosave-status van defaults */}
          {exercise.extraParams.length > 0 && defaultsAutosave.status !== 'idle' && (
            <div
              className="flex items-center gap-1 text-[10px] font-semibold text-[var(--p-ink-muted)]"
              title="Deze parameters worden automatisch als standaard onthouden voor deze oefening."
            >
              {defaultsAutosave.status === 'saving' && (
                <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Onthouden…</>
              )}
              {defaultsAutosave.status === 'pending' && (
                <><Loader2 className="w-2.5 h-2.5 animate-spin opacity-50" /> Onthouden…</>
              )}
              {defaultsAutosave.status === 'saved' && (
                <><Check className="w-2.5 h-2.5" style={{ color: 'var(--p-lime)' }} /> Onthouden</>
              )}
              {defaultsAutosave.status === 'error' && (
                <button
                  type="button"
                  onClick={() => { void defaultsAutosave.saveNow() }}
                  className="flex items-center gap-1 text-[var(--p-danger)] hover:text-[#F59B92]"
                >
                  <AlertCircle className="w-2.5 h-2.5" /> Mislukt, opnieuw
                </button>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Video dialog */}
      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg" style={{ borderRadius: '16px' }}>
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
              <div className="w-12 h-12 rounded-full bg-[var(--p-surface-hi)] flex items-center justify-center">
                <Play className="w-5 h-5 text-[var(--p-ink-muted)]" />
              </div>
              <div>
                <p className="text-sm font-medium">Nog geen video gekoppeld</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Plak een YouTube of Vimeo link en sla &apos;m op, wordt direct
                  gekoppeld aan deze oefening voor alle programma&apos;s.
                </p>
              </div>
              <form onSubmit={handleAddVideoUrl} className="w-full max-w-sm flex gap-2 mt-2">
                <input
                  type="url"
                  placeholder="https://youtube.com/..."
                  value={videoUrlDraft}
                  onChange={e => setVideoUrlDraft(e.target.value)}
                  disabled={setVideoUrl.isPending}
                  className="flex-1 h-9 px-3 text-sm bg-[var(--p-surface-hi)] rounded-md border border-[rgba(212,232,230,0.10)] focus:outline-none focus:ring-1 focus:ring-[var(--p-brand)] focus:border-[var(--p-brand)] placeholder:text-[var(--p-ink-dim)]"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={setVideoUrl.isPending || !videoUrlDraft.trim()}
                  style={{ background: 'var(--p-brand)', color: 'var(--p-bg)' }}
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
