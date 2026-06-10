'use client'

/**
 * Week-planner — TrainingPeaks-style maandkalender met multi-workout per dag.
 *
 * Layout:
 *   Header (patient-picker + maand-nav + Today)
 *   Maand-grid (6 rijen × 7 kolommen, Mon-Sun)
 *     Per dag-cel: items[] + "+" knop
 *     Per week-rij: 3-dots menu (Dupliceer / Verplaats)
 *
 * Data-model: gebruikt WeekScheduleDayItem (multi-workout per dag) uit fase 1.
 * Anchor: WeekSchedule.startDate = Maandag van week 1. Andere weken gemapt
 *   via weekNumber-offset binnen één patient's chain.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, X, MoreHorizontal,
  Search, Building2, Copy, CopyPlus, Pencil, BookmarkPlus, GripVertical,
} from 'lucide-react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor,
  useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore,
} from '@/components/icons'
import {
  CARDIO_ACTIVITIES, HR_ZONES,
  type CardioActivityKey, type CardioProtocolKey, type HRZone, type CardioInterval,
} from '@/lib/cardio-constants'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  P,
  SkeletonText,
  Tile,
} from '@/components/dark-ui'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'

const CATEGORY_LABELS: Record<Category, string> = {
  STRENGTH: 'Kracht',
  MOBILITY: 'Mobiliteit',
  PLYOMETRICS: 'Plyometrie',
  CARDIO: 'Cardio',
  STABILITY: 'Stabiliteit',
}
const CATEGORY_COLORS: Record<Category, string> = {
  STRENGTH: '#BEF264',
  MOBILITY: '#60a5fa',
  PLYOMETRICS: '#f59e0b',
  CARDIO: '#f87171',
  STABILITY: '#a78bfa',
}
function CategoryIcon({ category, size = 14 }: { category: Category; size?: number }) {
  const props = { size, className: undefined as string | undefined }
  switch (category) {
    case 'STRENGTH': return <IconStrength {...props} />
    case 'MOBILITY': return <IconMobility {...props} />
    case 'PLYOMETRICS': return <IconPlyometrics {...props} />
    case 'CARDIO': return <IconCardio {...props} />
    case 'STABILITY': return <IconCore {...props} />
  }
}

const MONTH_LABELS_NL = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
]
const DAY_LABELS_SHORT = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}
function mondayOf(d: Date): Date {
  const r = startOfDay(d)
  const dow = r.getDay()              // 0=Sun..6=Sat
  const delta = (dow + 6) % 7         // 0 if Mon
  r.setDate(r.getDate() - delta)
  return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
function diffDays(a: Date, b: Date): number {
  return Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}
function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}u` : `${h}u${m}`
}

/** Bouw een 6-rijen × 7-kolommen grid van datums voor een maand. Eerste kolom
 *  = Maandag voor (of op) de 1e van de maand; laatste kolom = Zondag na (of
 *  op) de laatste van de maand. Geeft 42 dagen, gegroepeerd in 6 weken. */
function monthGrid(year: number, month0: number): Date[][] {
  const first = new Date(year, month0, 1)
  const start = mondayOf(first)
  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const row: Date[] = []
    for (let d = 0; d < 7; d++) row.push(addDays(start, w * 7 + d))
    weeks.push(row)
  }
  return weeks
}

// ─── Patient picker ────────────────────────────────────────────────────────────

type Patient = { id: string; name: string | null; email: string | null }

function PatientPicker({
  patients, selectedId, onSelect,
}: { patients: Patient[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const current = patients.find(p => p.id === selectedId) ?? null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mbt-btn-hover inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, color: P.ink }}
        >
          <span>{current ? (current.name ?? current.email ?? 'Patiënt') : 'Kies patiënt…'}</span>
          <ChevronRight className="w-3.5 h-3.5 rotate-90 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Patiënten
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {patients.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Geen patiënten gekoppeld</div>
        ) : (
          patients.map(p => (
            <DropdownMenuItem key={p.id} onSelect={() => onSelect(p.id)} className="flex items-center gap-2 text-sm">
              <span className="truncate">{p.name ?? p.email ?? 'Onbekend'}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Item tile ────────────────────────────────────────────────────────────────

type ItemExercise = {
  id: string
  exerciseId: string
  exerciseName: string
  exerciseCategory: string
  sets: number
  reps: number
  repUnit: string
  restTime: number | null
}

// Cardio-parameters van een quick CARDIO-workout (los opgeslagen als JSON).
type PlannerCardioParams = {
  activity?: CardioActivityKey
  protocol?: CardioProtocolKey
  durationSec?: number
  distanceM?: number
  zone?: HRZone
  intervals?: CardioInterval[]
  notes?: string
}

type ScheduleItem = {
  id: string
  order: number
  programId: string | null
  program: { id: string; name: string; status?: string | null } | null
  quickCategory: Category | null
  quickName: string | null
  quickDurationSec: number | null
  notes: string | null
  exercises?: ItemExercise[]
  cardioParams?: PlannerCardioParams | null
}

type ItemStatus = 'scheduled' | 'completed' | 'partial' | 'missed' | 'in_progress'

// Status leidt de tile-kleur: gepland = neutraal/wit, voltooid = groen,
// deels (eerder gestopt) = oranje, gemist (verleden + niet gedaan) = rood.
// Categorie blijft herkenbaar via het icoon.
const STATUS_COLORS: Record<ItemStatus, string> = {
  scheduled: 'rgba(255,255,255,0.09)',
  completed: 'rgba(190,242,100,0.14)',  // lime tint
  partial:   'rgba(249,115,22,0.16)',   // orange tint
  missed:    'rgba(248,113,113,0.14)',  // danger red tint
  in_progress: 'rgba(244,194,97,0.16)', // gold/amber tint
}
const STATUS_BORDER: Record<ItemStatus, string> = {
  scheduled: 'rgba(255,255,255,0.5)',
  completed: P.lime,
  partial:   P.orange,
  missed:    P.danger,
  in_progress: P.gold,
}
const STATUS_TITLES: Record<ItemStatus, string | undefined> = {
  scheduled: undefined,
  completed: 'Voltooid — klik voor details',
  partial:   'Deels voltooid — eerder gestopt',
  missed:    'Gemist — niet gedaan',
  in_progress: 'Bezig',
}

function ItemTile({
  item, status, onRemove, onClick, readOnly, isOpen,
}: {
  item: ScheduleItem
  status: ItemStatus
  onRemove: () => void
  /** Klik op de tile (niet op de X). Alleen actief als sessie-details bestaan. */
  onClick?: () => void
  readOnly?: boolean
  /** True als deze workout nu open staat in het zijpaneel → naam valt weg, alleen icoon. */
  isOpen?: boolean
}) {
  const category: Category = item.quickCategory ?? 'STRENGTH'  // default voor program-link
  const color = CATEGORY_COLORS[category]
  const name = item.programId ? (item.program?.name ?? 'Programma') : (item.quickName ?? 'Workout')
  const duration = item.quickDurationSec ? fmtDuration(item.quickDurationSec) : null

  // Status leidt de kleur (border + tint); categorie-icoon blijft als anchor
  // zodat het type direct herkenbaar is.
  const statusBg = STATUS_COLORS[status]
  const statusBorder = STATUS_BORDER[status]
  const isClickable = !!onClick

  // Compacte inhoud-preview onder de titel: oefeningen of cardio-samenvatting.
  // Compacte hint op de tegel (één regel) — de volledige inhoud zit in het
  // zijpaneel dat opent bij klikken. Houdt de kalender schoon.
  const exCount = item.exercises?.length ?? 0
  let previewLine: string | null = null
  if (exCount > 0) {
    previewLine = `${exCount} oefening${exCount > 1 ? 'en' : ''}`
  } else if (item.quickCategory === 'CARDIO' && item.cardioParams) {
    const cp = item.cardioParams
    const parts: string[] = []
    if (cp.activity) parts.push(CARDIO_ACTIVITIES[cp.activity]?.label ?? '')
    if (cp.durationSec) parts.push(fmtDuration(cp.durationSec))
    if (cp.distanceM) parts.push(`${cp.distanceM / 1000} km`)
    if (cp.zone) parts.push(`Z${cp.zone}`)
    if (cp.intervals?.length) parts.push(`${cp.intervals.length}× interval`)
    const line = parts.filter(Boolean).join(' · ')
    if (line) previewLine = line
  }

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() }
      } : undefined}
      className={cn(
        'group/tile relative rounded-md text-[11px] overflow-hidden w-full min-w-0',
        isClickable ? 'cursor-pointer hover:brightness-110 transition-[filter]' : 'cursor-default',
      )}
      style={{
        background: statusBg,
        borderLeft: `3px solid ${statusBorder}`,
        color: P.ink,
      }}
      title={STATUS_TITLES[status]}
    >
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span style={{ color }} className="shrink-0"><CategoryIcon category={category} size={11} /></span>
        {!isOpen && <span className="min-w-0 flex-1 truncate">{name}</span>}
        {duration && <span className="text-[10px] opacity-70 shrink-0">{duration}</span>}
        {!readOnly && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="opacity-0 group-hover/tile:opacity-100 transition-opacity shrink-0 text-zinc-400 hover:text-red-400"
            title="Verwijder"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {previewLine && (
        <div className="px-2 pb-1 pt-0.5 min-w-0">
          <div className="text-[9px] leading-tight truncate" style={{ color: P.inkMuted }}>{previewLine}</div>
        </div>
      )}
    </div>
  )
}

// ─── Draggable item-wrapper (dnd-kit) ────────────────────────────────────────

function DraggableItem({
  item, fromIso, children,
}: { item: ScheduleItem; fromIso: string; children: React.ReactNode }) {
  const label = item.programId ? (item.program?.name ?? 'Programma') : (item.quickName ?? 'Workout')
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { type: 'item', itemId: item.id, fromIso, label },
  })
  return (
    <div
      ref={setNodeRef}
      data-noselect
      className="w-full min-w-0"
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

// Grijpbare chip in de selectie-toolbar; sleep naar een doeldag om het
// geselecteerde dag-blok te kopiëren.
function SelectionDragHandle({ isos }: { isos: string[] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'days-block',
    data: { type: 'days', isos },
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-grab active:cursor-grabbing"
      style={{ background: P.surfaceHi, border: `1px solid ${P.brand}`, color: P.ink, opacity: isDragging ? 0.5 : 1, touchAction: 'none' }}
    >
      <GripVertical className="w-3.5 h-3.5" /> Sleep naar doeldag
    </button>
  )
}

// ─── Dag-cel (droppable + selectie + +menu) ──────────────────────────────────

function DayCell({
  date, inMonth, isToday, info, weekLabel,
  selected, onSelectStart, onSelectEnter,
  onAddWorkout, onAddTemplate, onCopyDay,
  onItemClick, onRemoveItem, statusFor, sessionIdFor, openItemId,
}: {
  date: Date
  inMonth: boolean
  isToday: boolean
  info: { dayId?: string | null; weekNumber?: number | null; items: ScheduleItem[] } | undefined
  weekLabel: number | null
  selected: boolean
  onSelectStart: (iso: string) => void
  onSelectEnter: (iso: string) => void
  onAddWorkout: (date: Date) => void
  onAddTemplate: (date: Date) => void
  onCopyDay: (iso: string) => void
  onItemClick: (item: ScheduleItem, date: Date, dayId: string | null, sessionId: string | null) => void
  onRemoveItem: (item: ScheduleItem, dayId: string | null) => void
  statusFor: (date: Date, item: ScheduleItem) => ItemStatus
  sessionIdFor: (date: Date, item: ScheduleItem) => string | null
  openItemId: string | null
}) {
  const iso = isoDate(date)
  const { setNodeRef, isOver } = useDroppable({ id: `day:${iso}`, data: { iso } })
  const items = info?.items ?? []
  const dayId = info?.dayId ?? null

  return (
    <div
      ref={setNodeRef}
      className="border-l p-1.5 flex flex-col gap-1 group/cell relative select-none min-w-0"
      style={{
        borderColor: P.line,
        background: inMonth ? P.surfaceLow : 'transparent',
        opacity: inMonth ? 1 : 0.4,
        minHeight: 130,
        outline: selected ? `2px solid ${P.brand}` : isOver ? `2px dashed ${P.brand}` : 'none',
        outlineOffset: -2,
      }}
      onPointerDown={inMonth ? (e) => {
        if (e.button !== 0) return
        if ((e.target as HTMLElement).closest('[data-noselect]')) return
        onSelectStart(iso)
      } : undefined}
      onPointerEnter={inMonth ? () => onSelectEnter(iso) : undefined}
    >
      <div className="flex items-center justify-between">
        {/* Dagnummer in brand-oranje als warm accent; vandaag als gevulde chip
            zodat die ondanks de oranje nummers blijft opvallen. */}
        <span
          className={cn('text-xs athletic-mono font-bold', isToday && 'px-1.5 py-px rounded-md')}
          style={{
            color: isToday ? P.bg : inMonth ? P.brand : P.inkMuted,
            background: isToday ? P.brand : undefined,
          }}
        >
          {date.getDate()}
        </span>
        {weekLabel != null && (
          <span className="athletic-mono text-[9px]" style={{ color: P.inkDim }}>W{weekLabel}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {items.map(item => {
          const sId = sessionIdFor(date, item)
          const status = statusFor(date, item)
          const realItem = !item.id.startsWith('legacy-')
            && !item.id.startsWith('sessionlog-')
            && !item.id.startsWith('cardiolog-')
          // Cardiolog-tiles hebben geen detailpaneel (CardioLog ≠ SessionLog)
          // en geen onderliggend planner-item → niet klikbaar, niet verwijderbaar.
          const isCardioLog = item.id.startsWith('cardiolog-')
          const tile = (
            <ItemTile
              item={item}
              status={status}
              onRemove={() => onRemoveItem(item, dayId)}
              onClick={isCardioLog ? undefined : () => onItemClick(item, date, dayId, sId)}
              readOnly={item.id.startsWith('sessionlog-') || isCardioLog}
              isOpen={item.id === openItemId}
            />
          )
          return realItem
            ? <DraggableItem key={item.id} item={item} fromIso={iso}>{tile}</DraggableItem>
            : <div key={item.id} data-noselect className="w-full min-w-0">{tile}</div>
        })}
      </div>
      {inMonth && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-noselect
              className="opacity-70 group-hover/cell:opacity-100 transition-opacity self-start text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer mbt-btn-hover"
              style={{ color: P.brand, borderColor: 'rgba(232,122,85,0.4)', background: 'rgba(232,122,85,0.08)' }}
              title="Toevoegen / kopiëren"
            >
              <Plus className="w-3 h-3" /> Workout
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
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
    </div>
  )
}

// ─── Add-item modal ──────────────────────────────────────────────────────────

type ProgramListItem = {
  id: string
  name: string
  isTemplate: boolean
  status: string
  dominantCategory?: string | null
}

// ─── Session-detail modal ─────────────────────────────────────────────────────

type SessionDetail = {
  id: string
  scheduledAt: string | Date
  completedAt: string | Date | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
  duration: number | null
  notes: string | null
  program: { id: string; name: string } | null
  exerciseLogs: Array<{
    id: string
    exerciseId: string
    setsCompleted: number | null
    repsCompleted: number | null
    duration: number | null
    weight: number | null
    painLevel: number | null
    painDuring: number | null
    notes: string | null
    exercise: { name: string; category: string }
  }>
}

/** Responsive helper: true vanaf de opgegeven breakpoint (desktop). */
function useIsDesktop(breakpoint = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])
  return isDesktop
}

// ─── Item-detail (geplande workout + acties + evt. gelogde data) ───────────────

type DetailItem = {
  item: ScheduleItem
  date: Date
  dayId: string | null
  sessionId: string | null
}

/**
 * Detailpaneel voor één kalender-item. Toont de geplande inhoud (programma-
 * oefeningen of snelle-workout-velden) + acties (snel bewerken, opslaan als
 * schema, kopiëren). Als er een gelogde sessie bij hoort, staat de uitgevoerde
 * data read-only eronder. Herbruikt in zij-paneel (desktop) en modal (mobiel).
 */
// Inline oefening-builder voor een quick-workout: categorie-gefilterde kiezer +
// per oefening sets×reps. Beheert een lokale lijst en slaat in één keer op.
function QuickExerciseBuilder({
  item, defaultCategory, onSave, saving,
}: {
  item: ScheduleItem
  defaultCategory: Category
  onSave: (exercises: { exerciseId: string; sets: number; reps: number; repUnit: string }[]) => Promise<void>
  saving: boolean
}) {
  const [list, setList] = useState<ItemExercise[]>(item.exercises ?? [])
  const [catFilter, setCatFilter] = useState<Category | null>(defaultCategory)
  const [search, setSearch] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates = [] } = (trpc.exercises.list.useQuery as any)(
    { category: catFilter ?? undefined, query: search || undefined },
    { staleTime: 30_000 },
  ) as { data: Array<{ id: string; name: string; category: string }> }

  const selectedIds = new Set(list.map(e => e.exerciseId))
  const numStyle: React.CSSProperties = { background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}`, padding: '2px 4px' }

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
          onClick={() => onSave(list.map(e => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, repUnit: e.repUnit })))}
        >
          {saving ? 'Opslaan…' : 'Opslaan'}
        </DarkButton>
      </div>

      {list.length > 0 && (
        <div className="space-y-1.5">
          {list.map((e, i) => {
            const c = CATEGORY_COLORS[(e.exerciseCategory as Category) ?? 'STRENGTH']
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
                  className="text-zinc-400 hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
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
            style={{ background: `${CATEGORY_COLORS[catFilter]}20`, color: CATEGORY_COLORS[catFilter], border: `1px solid ${CATEGORY_COLORS[catFilter]}` }}>
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
              className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-[#1C2425]"
              style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}>
              <span style={{ color: CATEGORY_COLORS[cat] }}><CategoryIcon category={cat} size={11} /></span>
              <span className="flex-1 truncate text-xs" style={{ color: P.ink }}>{c.name}</span>
              <Plus className="w-3.5 h-3.5" style={{ color: P.inkMuted }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Cardio-parametervenster voor een quick CARDIO-workout.
function QuickCardioForm({
  item, onSave, saving,
}: {
  item: ScheduleItem
  onSave: (params: PlannerCardioParams | null) => Promise<void>
  saving: boolean
}) {
  const init = item.cardioParams ?? {}
  const [activity, setActivity] = useState<CardioActivityKey | ''>(init.activity ?? '')
  const [minutes, setMinutes] = useState(init.durationSec ? String(Math.round(init.durationSec / 60)) : '')
  const [distanceKm, setDistanceKm] = useState(init.distanceM ? String(init.distanceM / 1000) : '')
  const [zone, setZone] = useState<HRZone | ''>(init.zone ?? '')
  const [intervals, setIntervals] = useState<CardioInterval[]>(init.intervals ?? [])
  const numStyle: React.CSSProperties = { background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}`, padding: '2px 4px' }

  function save() {
    const params: PlannerCardioParams = {
      ...(activity ? { activity } : {}),
      ...(minutes ? { durationSec: Math.max(1, Number(minutes)) * 60 } : {}),
      ...(distanceKm ? { distanceM: Math.round(Number(distanceKm) * 1000) } : {}),
      ...(zone ? { zone } : {}),
      ...(intervals.length ? { intervals } : {}),
    }
    onSave(params)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <MetaLabel>Cardio-parameters</MetaLabel>
        <DarkButton variant="primary" size="sm" disabled={saving} onClick={save}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </DarkButton>
      </div>

      <div>
        <MetaLabel>Type</MetaLabel>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(Object.keys(CARDIO_ACTIVITIES) as CardioActivityKey[]).map(k => (
            <button key={k} type="button" onClick={() => setActivity(a => a === k ? '' : k)}
              className="px-2 py-1 rounded-lg text-xs font-semibold"
              style={{ background: activity === k ? P.brand : P.surface, color: activity === k ? P.bg : P.inkMuted, border: `1px solid ${activity === k ? P.brand : P.lineStrong}` }}>
              {CARDIO_ACTIVITIES[k].icon} {CARDIO_ACTIVITIES[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><MetaLabel>Duur (min)</MetaLabel>
          <DarkInput type="number" min={1} className="mt-1" value={minutes} onChange={e => setMinutes(e.target.value)} /></div>
        <div><MetaLabel>Afstand (km)</MetaLabel>
          <DarkInput type="number" min={0} step="0.1" className="mt-1" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} /></div>
      </div>

      <div>
        <MetaLabel>Intensiteit / zone</MetaLabel>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {([1, 2, 3, 4, 5] as HRZone[]).map(z => (
            <button key={z} type="button" onClick={() => setZone(v => v === z ? '' : z)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
              style={{ background: zone === z ? HR_ZONES[z].color : P.surface, color: zone === z ? '#fff' : P.inkMuted, border: `1px solid ${zone === z ? HR_ZONES[z].color : P.lineStrong}` }}>
              Z{z}
            </button>
          ))}
        </div>
        {zone ? <p className="text-[10px] mt-1" style={{ color: P.inkMuted }}>{HR_ZONES[zone].label}</p> : null}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <MetaLabel>Intervallen</MetaLabel>
          <button type="button" onClick={() => setIntervals(iv => [...iv, { repetitions: 4, workDuration: 180, restDuration: 120 }])}
            className="text-[11px] flex items-center gap-1" style={{ color: P.brand }}>
            <Plus className="w-3 h-3" /> blok
          </button>
        </div>
        <div className="space-y-1.5 mt-1.5">
          {intervals.map((iv, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: P.inkMuted }}>
              <input type="number" min={1} value={iv.repetitions} aria-label="herhalingen"
                onChange={e => setIntervals(a => a.map((x, idx) => idx === i ? { ...x, repetitions: Math.max(1, Number(e.target.value) || 1) } : x))}
                className="w-10 text-center rounded" style={numStyle} />
              <span>× werk</span>
              <input type="number" min={1} value={iv.workDuration} aria-label="werk seconden"
                onChange={e => setIntervals(a => a.map((x, idx) => idx === i ? { ...x, workDuration: Math.max(1, Number(e.target.value) || 1) } : x))}
                className="w-14 text-center rounded" style={numStyle} />
              <span>s / rust</span>
              <input type="number" min={0} value={iv.restDuration} aria-label="rust seconden"
                onChange={e => setIntervals(a => a.map((x, idx) => idx === i ? { ...x, restDuration: Math.max(0, Number(e.target.value) || 0) } : x))}
                className="w-14 text-center rounded" style={numStyle} />
              <span>s</span>
              <button type="button" onClick={() => setIntervals(a => a.filter((_, idx) => idx !== i))}
                className="text-zinc-400 hover:text-red-400 ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ItemDetailContent({
  detail, onClose, showClose = false,
  onSaveTemplate, onCopy, onSaveQuick, onSaveExercises, onSaveCardio,
  savingTemplate, copying, savingExercises, savingCardio,
}: {
  detail: DetailItem
  onClose: () => void
  showClose?: boolean
  onSaveTemplate: () => void
  onCopy: () => void
  onSaveQuick: (patch: { quickName?: string; quickDurationSec?: number }) => Promise<void>
  onSaveExercises: (itemId: string, exercises: { exerciseId: string; sets: number; reps: number; repUnit: string }[]) => Promise<void>
  onSaveCardio: (itemId: string, params: PlannerCardioParams | null) => Promise<void>
  savingTemplate: boolean
  copying: boolean
  savingExercises: boolean
  savingCardio: boolean
}) {
  const { item, date, sessionId } = detail
  const isProgram = !!item.programId
  const category: Category = item.quickCategory ?? 'STRENGTH'
  const color = CATEGORY_COLORS[category]
  const title = isProgram ? (item.program?.name ?? 'Programma') : (item.quickName ?? 'Workout')

  // `as any` op de query: het programs.get-returntype is extreem diep (incl.
  // muscleLoads) → TS2589. We typen alleen wat we hier renderen.
  type PlannedExercise = {
    id: string
    sets: number | null
    reps: number | null
    repUnit: string | null
    exercise: { name: string; category: string }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programQuery = (trpc.programs.get.useQuery as any)(
    { id: item.programId ?? '' },
    { enabled: isProgram, staleTime: 30_000 },
  ) as { data: { exercises: PlannedExercise[] } | null | undefined; isLoading: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionQuery = (trpc.weekSchedules.sessionDetails.useQuery as any)(
    { sessionId: sessionId ?? '' },
    { enabled: !!sessionId, staleTime: 30_000 },
  ) as { data: SessionDetail | null | undefined; isLoading: boolean }

  // Quick-edit state
  const [editing, setEditing] = useState(false)
  const [eName, setEName] = useState(item.quickName ?? '')
  const [eMinutes, setEMinutes] = useState(String(Math.round((item.quickDurationSec ?? 1800) / 60)))
  const [savingQuick, setSavingQuick] = useState(false)

  async function submitQuick() {
    if (!eName.trim()) { toast.error('Naam is verplicht'); return }
    const minutes = Math.max(1, Math.min(720, Number(eMinutes) || 30))
    setSavingQuick(true)
    try {
      await onSaveQuick({ quickName: eName.trim(), quickDurationSec: minutes * 60 })
      setEditing(false)
    } finally { setSavingQuick(false) }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0"
        style={{ borderColor: P.lineStrong }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color }} className="shrink-0"><CategoryIcon category={category} size={16} /></span>
          <h2 className="font-bold truncate" style={{ color: P.ink, fontSize: 15 }}>{title}</h2>
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="athletic-tap shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: P.inkMuted }}
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4">
        {/* Meta */}
        <div className="flex items-center flex-wrap gap-2 text-xs" style={{ color: P.inkMuted }}>
          <span>{date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span>· {CATEGORY_LABELS[category]}</span>
          {item.quickDurationSec ? <span>· {fmtDuration(item.quickDurationSec)}</span> : null}
        </div>

        {/* Acties */}
        <div className="flex flex-wrap gap-2">
          {isProgram ? (
            <DarkButton
              variant="secondary"
              size="sm"
              href={item.programId ? `/therapist/programs/${item.programId}/edit` : undefined}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Snel bewerken
            </DarkButton>
          ) : (
            <DarkButton variant="secondary" size="sm" onClick={() => setEditing(v => !v)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Snel bewerken
            </DarkButton>
          )}
          <DarkButton variant="secondary" size="sm" onClick={onSaveTemplate} disabled={savingTemplate}>
            <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" /> {savingTemplate ? 'Opslaan…' : 'Opslaan als schema'}
          </DarkButton>
          <DarkButton variant="secondary" size="sm" onClick={onCopy} disabled={copying}>
            <CopyPlus className="w-3.5 h-3.5 mr-1.5" /> {copying ? 'Kopiëren…' : 'Kopiëren'}
          </DarkButton>
        </div>

        {/* Quick inline-edit */}
        {editing && !isProgram && (
          <Tile>
            <div className="space-y-2">
              <div>
                <MetaLabel>Naam</MetaLabel>
                <DarkInput className="mt-1" value={eName} onChange={e => setEName(e.target.value)} disabled={savingQuick} />
              </div>
              <div>
                <MetaLabel>Duur (minuten)</MetaLabel>
                <DarkInput className="mt-1" type="number" min={1} max={720} value={eMinutes} onChange={e => setEMinutes(e.target.value)} disabled={savingQuick} />
              </div>
              <div className="flex gap-2 pt-1">
                <DarkButton variant="ghost" size="sm" onClick={() => setEditing(false)} className="flex-1" disabled={savingQuick}>Annuleren</DarkButton>
                <DarkButton variant="primary" size="sm" onClick={submitQuick} className="flex-1" disabled={savingQuick}>{savingQuick ? 'Opslaan…' : 'Opslaan'}</DarkButton>
              </div>
            </div>
          </Tile>
        )}

        {/* Geplande inhoud */}
        {isProgram ? (
          <div className="space-y-2">
            <MetaLabel>Geplande oefeningen</MetaLabel>
            {programQuery.isLoading ? (
              <SkeletonText lines={4} />
            ) : programQuery.data && programQuery.data.exercises.length > 0 ? (
              <div className="space-y-1.5">
                {programQuery.data.exercises.map(pe => {
                  const cat = (pe.exercise.category as Category) ?? 'STRENGTH'
                  const c = CATEGORY_COLORS[cat]
                  const setLine = pe.sets && pe.reps ? `${pe.sets} × ${pe.reps}${pe.repUnit ? ` ${pe.repUnit}` : ''}` : pe.sets ? `${pe.sets} sets` : '—'
                  return (
                    <div
                      key={pe.id}
                      className="rounded-lg p-2.5 text-xs"
                      style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, borderLeft: `3px solid ${c}` }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: c }} className="shrink-0"><CategoryIcon category={cat} size={12} /></span>
                        <span className="font-semibold flex-1 truncate" style={{ color: P.ink }}>{pe.exercise.name}</span>
                        <span className="athletic-mono font-bold" style={{ color: P.ink, fontSize: 11 }}>{setLine}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs py-2" style={{ color: P.inkMuted }}>Dit programma heeft nog geen oefeningen.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {category === 'CARDIO' ? (
              <QuickCardioForm
                key={item.id}
                item={item}
                saving={savingCardio}
                onSave={(params) => onSaveCardio(item.id, params)}
              />
            ) : (
              <QuickExerciseBuilder
                key={item.id}
                item={item}
                defaultCategory={category}
                saving={savingExercises}
                onSave={(exercises) => onSaveExercises(item.id, exercises)}
              />
            )}
            {item.notes ? (
              <Tile>
                <MetaLabel>Notitie</MetaLabel>
                <p className="text-sm mt-1" style={{ color: P.ink, whiteSpace: 'pre-wrap' }}>{item.notes}</p>
              </Tile>
            ) : null}
          </div>
        )}

        {/* Uitgevoerde data (read-only) als er een gelogde sessie bij hoort */}
        {sessionId && (
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: P.line }}>
            <MetaLabel>Uitgevoerd</MetaLabel>
            {sessionQuery.isLoading ? (
              <SkeletonText lines={3} />
            ) : sessionQuery.data && sessionQuery.data.exerciseLogs.length > 0 ? (
              <div className="space-y-1.5">
                {sessionQuery.data.exerciseLogs.map(log => {
                  const cat = (log.exercise.category as Category) ?? 'STRENGTH'
                  const c = CATEGORY_COLORS[cat]
                  const setLine = log.setsCompleted && log.repsCompleted
                    ? `${log.setsCompleted} × ${log.repsCompleted}`
                    : log.setsCompleted ? `${log.setsCompleted} sets`
                    : log.duration ? fmtDuration(log.duration) : '—'
                  return (
                    <div
                      key={log.id}
                      className="rounded-lg p-2.5 text-xs"
                      style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, borderLeft: `3px solid ${c}` }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: c }} className="shrink-0"><CategoryIcon category={cat} size={12} /></span>
                        <span className="font-semibold flex-1 truncate" style={{ color: P.ink }}>{log.exercise.name}</span>
                        <span className="athletic-mono font-bold" style={{ color: P.ink, fontSize: 11 }}>{setLine}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5" style={{ color: P.inkMuted, fontSize: 10 }}>
                        {log.weight ? <span>⚖ {log.weight}kg</span> : null}
                        {log.painLevel != null ? <span>NRS pijn: {log.painLevel}/10</span> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs py-2" style={{ color: P.inkMuted }}>Geen oefen-data gelogd.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AddItemModal({
  open, onClose, dayId, dayLabel, programs, onSubmit, initialTab = 'library',
}: {
  open: boolean
  onClose: () => void
  dayId: string | null
  dayLabel: string
  programs: ProgramListItem[]
  initialTab?: 'library' | 'quick'
  onSubmit: (
    payload:
      | { kind: 'program'; programId: string; notes?: string | null }
      | { kind: 'quick'; quickCategory: Category; quickName: string; quickDurationSec: number; notes?: string | null },
  ) => Promise<void>
}) {
  const [tab, setTab] = useState<'library' | 'quick'>(initialTab)
  // Bij (her)openen de juiste tab tonen (vanuit +menu: "Workout" → quick,
  // "Vanuit sjabloon" → library).
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  // Quick form state
  const [qCat, setQCat] = useState<Category>('STRENGTH')
  const [qName, setQName] = useState('')
  const [qMinutes, setQMinutes] = useState<string>('30')
  // Therapeut-notitie — geldt voor zowel een programma-keuze als een snelle workout.
  const [qNotes, setQNotes] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return programs.slice(0, 30)
    return programs.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30)
  }, [programs, query])

  function reset() {
    setTab('library'); setQuery(''); setQCat('STRENGTH'); setQName(''); setQMinutes('30'); setQNotes('')
  }
  function handleClose() { reset(); onClose() }

  async function handleProgramPick(programId: string) {
    if (!dayId || busy) return
    setBusy(true)
    try { await onSubmit({ kind: 'program', programId, notes: qNotes.trim() || null }); handleClose() }
    finally { setBusy(false) }
  }

  async function handleQuickSubmit() {
    if (!dayId || busy) return
    if (!qName.trim()) { toast.error('Naam is verplicht'); return }
    const minutes = Math.max(1, Math.min(720, Number(qMinutes) || 30))
    setBusy(true)
    try {
      await onSubmit({
        kind: 'quick',
        quickCategory: qCat,
        quickName: qName.trim(),
        quickDurationSec: minutes * 60,
        notes: qNotes.trim() || null,
      })
      handleClose()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Workout toevoegen — {dayLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mt-2 p-1 rounded-lg" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
          {(['library', 'quick'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={{
                background: tab === t ? P.surfaceHi : 'transparent',
                color: tab === t ? P.ink : P.inkMuted,
              }}
            >
              {t === 'library' ? 'Vanuit bibliotheek' : 'Snelle workout'}
            </button>
          ))}
        </div>

        {/* Therapeut-notitie — altijd beschikbaar, geldt voor de toegevoegde workout */}
        <div className="mt-3">
          <MetaLabel>Notitie (optioneel)</MetaLabel>
          <DarkTextarea
            className="mt-1"
            rows={2}
            value={qNotes}
            onChange={e => setQNotes(e.target.value)}
            placeholder="Bijv. focus, aandachtspunt of instructie voor deze dag"
            disabled={busy}
          />
        </div>

        {tab === 'library' && (
          <div className="space-y-2 mt-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <DarkInput
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Zoek programma…"
                className="pl-8"
                disabled={busy}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1 mbt-stagger">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Geen programma&apos;s gevonden.</p>
              ) : (
                // bg/border via classes, niet inline — inline styles zouden de
                // hover-tint van .mbt-card-hover overschrijven
                filtered.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProgramPick(p.id)}
                    disabled={busy}
                    className="w-full text-left px-3 py-2 rounded-lg mbt-card-hover athletic-tap flex items-center gap-2 bg-[#141A1B] border border-[rgba(255,255,255,0.12)]"
                  >
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    {p.isTemplate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded uppercase" style={{ background: P.surfaceHi, color: P.inkMuted }}>
                        Sjabloon
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'quick' && (
          <div className="space-y-3 mt-3">
            <div>
              <MetaLabel>Type</MetaLabel>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setQCat(c)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: qCat === c ? `${CATEGORY_COLORS[c]}20` : P.surface,
                      color: qCat === c ? CATEGORY_COLORS[c] : P.inkMuted,
                      border: `1px solid ${qCat === c ? CATEGORY_COLORS[c] : P.lineStrong}`,
                    }}
                  >
                    <CategoryIcon category={c} size={11} />
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <MetaLabel>Naam</MetaLabel>
              <DarkInput
                className="mt-1.5"
                value={qName}
                onChange={e => setQName(e.target.value)}
                placeholder="Bijv. Easy bike ride"
                disabled={busy}
              />
            </div>
            <div>
              <MetaLabel>Duur (minuten)</MetaLabel>
              <DarkInput
                className="mt-1.5"
                type="number"
                min={1}
                max={720}
                value={qMinutes}
                onChange={e => setQMinutes(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <DarkButton variant="ghost" onClick={handleClose} className="flex-1" disabled={busy}>
                Annuleren
              </DarkButton>
              <DarkButton variant="primary" onClick={handleQuickSubmit} className="flex-1" disabled={busy}>
                {busy ? 'Toevoegen…' : 'Toevoegen'}
              </DarkButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WeekPlannerPage() {
  return (
    <Suspense fallback={null}>
      <WeekPlannerContent />
    </Suspense>
  )
}

function WeekPlannerContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const today = startOfDay(new Date())

  // ─ URL → initial state, daarna lokaal beheerd ─
  // Next 16's `router.replace` triggert niet altijd een re-render van
  // `useSearchParams()` (vooral met Suspense), waardoor klikken op een
  // andere patiënt in de dropdown de UI niet ververst. Daarom houden we
  // patientId/month als lokale state en syncen we de URL als afgeleide.
  const [selectedPatientId, setSelectedPatientIdState] = useState(
    () => searchParams.get('patientId') || '',
  )
  const [monthState, setMonthState] = useState<[number, number]>(() => {
    const monthParam = searchParams.get('month')
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number)
      return [y, m - 1]
    }
    return [today.getFullYear(), today.getMonth()]
  })
  const [year, month0] = monthState

  function setUrl(patch: { patientId?: string; month?: string }) {
    if (patch.patientId !== undefined) setSelectedPatientIdState(patch.patientId)
    if (patch.month !== undefined && /^\d{4}-\d{2}$/.test(patch.month)) {
      const [y, m] = patch.month.split('-').map(Number)
      setMonthState([y, m - 1])
    }
    // URL-sync voor bookmarkability (niet load-bearing voor render).
    const p = new URLSearchParams(searchParams.toString())
    if (patch.patientId !== undefined) {
      if (patch.patientId) p.set('patientId', patch.patientId)
      else p.delete('patientId')
    }
    if (patch.month !== undefined) {
      if (patch.month) p.set('month', patch.month)
      else p.delete('month')
    }
    router.replace(`/therapist/week-planner?${p.toString()}`)
  }
  function navMonth(delta: number) {
    const d = new Date(year, month0 + delta, 1)
    setUrl({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  }
  function navToday() {
    setUrl({ month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` })
  }

  // ─ Data ─
  const { data: patientsRaw = [] } = trpc.patients.list.useQuery(undefined, { staleTime: 60_000 })
  const patients: Patient[] = patientsRaw.map(p => ({ id: p.id, name: p.name, email: p.email }))

  const { data: schedules = [] } = trpc.weekSchedules.listWithItems.useQuery(
    selectedPatientId ? { patientId: selectedPatientId, isTemplate: false } : undefined,
    { enabled: !!selectedPatientId, staleTime: 10_000 },
  )
  // Oefeningen + cardio-params per item (apart van listWithItems om TS2589 te
  // vermijden). Gegroepeerd op itemId voor merge in dateMap.
  const { data: itemContents = [] } = trpc.weekSchedules.listItemContents.useQuery(
    selectedPatientId ? { patientId: selectedPatientId } : { patientId: '' },
    { enabled: !!selectedPatientId, staleTime: 10_000 },
  )
  const contentsByItem = useMemo(() => {
    const m = new Map<string, { exercises: ItemExercise[]; cardioParams: PlannerCardioParams | null }>()
    for (const c of itemContents) {
      m.set(c.itemId, {
        exercises: c.exercises,
        cardioParams: (c.cardioParams as PlannerCardioParams | null) ?? null,
      })
    }
    return m
  }, [itemContents])
  // tRPC retourneert hier een diep-geneste union die TS doet verzuipen op
  // .map. Cast naar de minimale shape die we lezen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: programsRaw = [] } = (trpc.programs.list.useQuery as any)(
    undefined,
    { staleTime: 30_000 },
  ) as { data: Array<{ id: string; name: string; isTemplate?: boolean; status?: string; dominantCategory?: string | null }> }
  const programs: ProgramListItem[] = programsRaw.map(p => ({
    id: p.id,
    name: p.name,
    isTemplate: p.isTemplate ?? false,
    status: p.status ?? 'DRAFT',
    dominantCategory: p.dominantCategory ?? null,
  }))

  // ─ Mutations ─
  const ensureWeek = trpc.weekSchedules.create.useMutation()
  const addItem = trpc.weekSchedules.addItem.useMutation({
    onSuccess: () => utils.weekSchedules.listWithItems.invalidate(),
    onError: (err) => toast.error(err.message ?? 'Toevoegen mislukt'),
  })
  const removeItem = trpc.weekSchedules.removeItem.useMutation({
    onSuccess: () => utils.weekSchedules.listWithItems.invalidate(),
    onError: (err) => toast.error(err.message ?? 'Verwijderen mislukt'),
  })
  const clearLegacyDay = trpc.weekSchedules.clearLegacyDay.useMutation({
    onSuccess: () => utils.weekSchedules.listWithItems.invalidate(),
    onError: (err) => toast.error(err.message ?? 'Verwijderen mislukt'),
  })

  /** Branche op id: synthetische legacy items beginnen met `legacy-{dayId}`. */
  function handleRemoveItem(item: ScheduleItem, dayId: string | null) {
    if (item.id.startsWith('legacy-') && dayId) {
      clearLegacyDay.mutate({ dayId })
    } else {
      removeItem.mutate({ id: item.id })
    }
  }
  const duplicateWeek = trpc.weekSchedules.duplicateWeek.useMutation({
    onSuccess: () => { utils.weekSchedules.listWithItems.invalidate(); toast.success('Week gedupliceerd') },
    onError: (err) => toast.error(err.message ?? 'Dupliceren mislukt'),
  })
  const reorderItems = trpc.weekSchedules.reorderItems.useMutation({
    // Optimistic: verplaats het item meteen in de cache zodat de tegel direct
    // mee-springt; server reconcilieert op de achtergrond.
    onMutate: async (vars) => {
      const key = { patientId: selectedPatientId, isTemplate: false }
      await utils.weekSchedules.listWithItems.cancel(key)
      const prev = utils.weekSchedules.listWithItems.getData(key)
      /* eslint-disable @typescript-eslint/no-explicit-any -- cache-shape is diep-genest; lokaal any om TS2589 te vermijden */
      utils.weekSchedules.listWithItems.setData(key, (old: any) => {
        if (!old) return old
        const next = old.map((ws: any) => ({
          ...ws,
          days: ws.days.map((d: any) => ({ ...d, items: [...d.items] })),
        }))
        for (const mv of vars.moves) {
          let moved: any = null
          for (const ws of next) {
            for (const d of ws.days) {
              const idx = d.items.findIndex((it: any) => it.id === mv.itemId)
              if (idx >= 0) { moved = d.items.splice(idx, 1)[0]; break }
            }
            if (moved) break
          }
          if (!moved) continue
          for (const ws of next) {
            const td = ws.days.find((d: any) => d.id === mv.dayId)
            if (td) { td.items.push({ ...moved, order: mv.order }); break }
          }
        }
        return next
      })
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return { prev, key }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) utils.weekSchedules.listWithItems.setData(ctx.key, ctx.prev)
      toast.error(err.message ?? 'Verplaatsen mislukt')
    },
    onSuccess: () => toast.success('Workout verplaatst'),
    onSettled: () => utils.weekSchedules.listWithItems.invalidate(),
  })
  const copyDayItems = trpc.weekSchedules.copyDayItems.useMutation({
    onSuccess: () => utils.weekSchedules.listWithItems.invalidate(),
    onError: (err) => toast.error(err.message ?? 'Kopiëren mislukt'),
  })
  const updateItem = trpc.weekSchedules.updateItem.useMutation({
    onSuccess: () => utils.weekSchedules.listWithItems.invalidate(),
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })
  const saveItemAsTemplate = trpc.weekSchedules.saveItemAsTemplate.useMutation({
    onSuccess: () => {
      utils.programs.list.invalidate()
      toast.success('Opgeslagen als schema — staat nu in Programma’s')
    },
    onError: (err) => toast.error(err.message ?? 'Opslaan als schema mislukt'),
  })
  const setItemExercises = trpc.weekSchedules.setItemExercises.useMutation({
    onSuccess: () => { utils.weekSchedules.listItemContents.invalidate(); toast.success('Oefeningen opgeslagen') },
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })
  const setItemCardio = trpc.weekSchedules.setItemCardio.useMutation({
    onSuccess: () => { utils.weekSchedules.listItemContents.invalidate(); toast.success('Cardio opgeslagen') },
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })

  // ─ Computed maand-grid + mapping date → schedule day ─
  const grid = useMemo(() => monthGrid(year, month0), [year, month0])

  // ─ SessionLog query voor zichtbaar bereik (status-kleuren fase 4) ─
  const sessionRange = useMemo(() => {
    const from = grid[0][0]
    const to = addDays(grid[5][6], 1)  // exclusive
    return { from: from.toISOString(), to: to.toISOString() }
  }, [grid])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessionsRaw = [] } = (trpc.weekSchedules.sessionsInRange.useQuery as any)(
    { patientId: selectedPatientId, ...sessionRange },
    { enabled: !!selectedPatientId, staleTime: 10_000 },
  ) as { data: Array<{
    id: string
    scheduledAt: string | Date
    completedAt: string | Date | null
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
    completedAll: boolean
    duration: number | null
    programId: string | null
    programName: string | null
  }> }
  // CardioLogs in hetzelfde bereik — cardio wordt apart gelogd (CardioLog
  // i.p.v. SessionLog) en moet geplande cardio-items kunnen afvinken.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cardioRaw = [] } = (trpc.weekSchedules.cardioInRange.useQuery as any)(
    { patientId: selectedPatientId, ...sessionRange },
    { enabled: !!selectedPatientId, staleTime: 10_000 },
  ) as { data: Array<{
    id: string
    completedAt: string | Date
    activity: string
    protocol: string
    durationSec: number
    distanceM: number | null
    zone: number | null
    rpe: number | null
    programId: string | null
  }> }

  /** Status van een afgeronde SessionLog: deels (eerder gestopt) of voltooid. */
  function doneStatus(s: { completedAll: boolean }): ItemStatus {
    return s.completedAll === false ? 'partial' : 'completed'
  }

  // Map (programId, dateISO) → { status, sessionId }. sessionId wordt
  // gebruikt voor de session-detail modal wanneer therapeut op een tile klikt.
  type SessionMatch = { status: ItemStatus; sessionId: string | null }
  const sessionByKey = useMemo(() => {
    const todayStart = startOfDay(new Date())
    const map = new Map<string, SessionMatch>()
    for (const s of sessionsRaw) {
      if (!s.programId) continue
      const sched = new Date(s.scheduledAt)
      const key = `${s.programId}|${isoDate(sched)}`
      let status: ItemStatus
      if (s.completedAt) {
        status = doneStatus(s)
      } else if (s.status === 'IN_PROGRESS') {
        status = 'in_progress'
      } else if (s.status === 'SKIPPED' || sched < todayStart) {
        status = 'missed'
      } else {
        status = 'scheduled'
      }
      // Als er meerdere sessies op dezelfde sleutel zijn (re-schedule etc),
      // kies de "best status": completed > partial > in_progress > scheduled > missed.
      const prev = map.get(key)
      const prio: Record<ItemStatus, number> = { completed: 5, partial: 4, in_progress: 3, scheduled: 2, missed: 1 }
      if (!prev || prio[status] > prio[prev.status]) {
        map.set(key, { status, sessionId: s.id })
      }
    }
    return map
  }, [sessionsRaw])

  function statusFor(date: Date, item: ScheduleItem): ItemStatus {
    // Synthetische tiles dragen hun eigen status: een cardiolog-tile ís een
    // gelogde workout, een sessionlog-tile leest zijn eigen SessionLog terug.
    if (item.id.startsWith('cardiolog-')) return 'completed'
    if (item.id.startsWith('sessionlog-')) {
      const sid = item.id.slice('sessionlog-'.length)
      const s = sessionsRaw.find(x => x.id === sid)
      if (s?.completedAt) return doneStatus(s)
      if (s?.status === 'IN_PROGRESS') return 'in_progress'
      // PENDING/SKIPPED historie valt door naar de verleden-check hieronder.
    }
    const match = item.programId
      ? sessionByKey.get(`${item.programId}|${isoDate(date)}`)
      : adhocStatusById.get(item.id)
    if (match) return match.status
    // Geen log gevonden: in het verleden = gemist, anders gewoon gepland.
    return startOfDay(date) < startOfDay(new Date()) ? 'missed' : 'scheduled'
  }

  /** Geef het bijbehorende SessionLog-id terug zodat klikken op een gedane
   *  tile de detail-modal kan openen. Voor sessionlog-prefixed items zit
   *  het id in de prefix; voor andere items lookup via sessionByKey. */
  function sessionIdFor(date: Date, item: ScheduleItem): string | null {
    if (item.id.startsWith('sessionlog-')) {
      return item.id.slice('sessionlog-'.length)
    }
    if (!item.programId) return adhocStatusById.get(item.id)?.sessionId ?? null
    return sessionByKey.get(`${item.programId}|${isoDate(date)}`)?.sessionId ?? null
  }

  // Schedule dag-info gemapt op ISO-datum.
  type DayCellInfo = {
    dayId: string | null            // null als nog geen schedule bestaat voor die week
    weekScheduleId: string | null
    weekNumber: number | null
    items: ScheduleItem[]
  }
  const { dateMap, adhocStatusById } = useMemo(() => {
    const map = new Map<string, DayCellInfo>()
    // Status per quick-item-id (geen programId → geen sessionByKey-match):
    // gevuld door cardio- en losse-sessie-matching hieronder.
    const adhocStatusById = new Map<string, SessionMatch>()

    // ── 1. WeekSchedule-items (geplande workouts) ──
    if (schedules.length > 0) {
      // Bepaal een baseline: eerste schedule MET startDate, anders eerste op
      // createdAt. Andere schedules zonder startDate worden afgeleid van die
      // baseline + (weekNumber-1)*7. Voorkomt dat legacy data zonder startDate
      // onzichtbaar wordt — voorheen werd 'continue' gedaan.
      const withStart = schedules.find(ws => ws.startDate)
      let baseline: Date
      let baselineWeekNumber: number
      if (withStart) {
        baseline = mondayOf(new Date(withStart.startDate!))
        baselineWeekNumber = withStart.weekNumber
      } else {
        const earliest = schedules.reduce((a, b) =>
          new Date(a.createdAt) < new Date(b.createdAt) ? a : b
        )
        baseline = mondayOf(new Date(earliest.createdAt))
        baselineWeekNumber = earliest.weekNumber
      }

      for (const ws of schedules) {
        const start = ws.startDate
          ? mondayOf(new Date(ws.startDate))
          : addDays(baseline, (ws.weekNumber - baselineWeekNumber) * 7)

        for (const day of ws.days) {
          const date = addDays(start, day.dayOfWeek)
          // Items uit het nieuwe model.
          let items: ScheduleItem[] = (day.items ?? []).map(it => {
            const content = contentsByItem.get(it.id)
            return {
              id: it.id,
              order: it.order,
              programId: it.programId,
              program: it.program ?? null,
              quickCategory: (it.quickCategory ?? null) as Category | null,
              quickName: it.quickName,
              quickDurationSec: it.quickDurationSec,
              notes: it.notes,
              exercises: content?.exercises ?? [],
              cardioParams: content?.cardioParams ?? null,
            }
          })
          // Backwards-compat: als items[] leeg is maar er staat een legacy
          // programId op de dag → render die als synthetisch item zodat
          // bestaande schedules zonder backfill toch zichtbaar zijn.
          if (items.length === 0 && day.programId && day.program) {
            items = [{
              id: `legacy-${day.id}`,
              order: 0,
              programId: day.programId,
              program: day.program,
              quickCategory: null,
              quickName: null,
              quickDurationSec: null,
              notes: null,
            }]
          }
          map.set(isoDate(date), {
            dayId: day.id,
            weekScheduleId: ws.id,
            weekNumber: ws.weekNumber,
            items,
          })
        }
      }
    }

    // ── 2. Quick-items matchen aan logs ──
    // Quick workouts hebben geen programId, dus de programId|datum-sleutel
    // werkt niet. Match per dag: CARDIO-items aan CardioLogs (zelfde activiteit
    // eerst), overige quick-items greedy aan losse SessionLogs (programId null).
    const consumedSessionIds = new Set<string>()
    const consumedCardioIds = new Set<string>()

    const looseSessionsByIso = new Map<string, typeof sessionsRaw>()
    for (const s of sessionsRaw) {
      if (s.programId || !s.completedAt) continue
      const iso = isoDate(new Date(s.scheduledAt))
      looseSessionsByIso.set(iso, [...(looseSessionsByIso.get(iso) ?? []), s])
    }
    const cardioByIso = new Map<string, typeof cardioRaw>()
    for (const c of cardioRaw) {
      const iso = isoDate(new Date(c.completedAt))
      cardioByIso.set(iso, [...(cardioByIso.get(iso) ?? []), c])
    }

    for (const [iso, info] of map) {
      const cardioLogs = cardioByIso.get(iso) ?? []
      const looseSessions = looseSessionsByIso.get(iso) ?? []
      for (const item of info.items) {
        if (item.programId) continue
        if (item.quickCategory === 'CARDIO') {
          const plannedActivity = item.cardioParams?.activity
          const log =
            cardioLogs.find(c => !consumedCardioIds.has(c.id) && c.activity === plannedActivity)
            ?? cardioLogs.find(c => !consumedCardioIds.has(c.id))
          if (!log) continue
          consumedCardioIds.add(log.id)
          // "Eerder gestopt" bij cardio: werkelijke duur duidelijk korter dan
          // gepland (de cardio-speler logt de echte verstreken tijd).
          const plannedSec = item.cardioParams?.durationSec ?? item.quickDurationSec
          const partial = !!plannedSec && log.durationSec < plannedSec * 0.8
          adhocStatusById.set(item.id, { status: partial ? 'partial' : 'completed', sessionId: null })
        } else {
          const log = looseSessions.find(s => !consumedSessionIds.has(s.id))
          if (!log) continue
          consumedSessionIds.add(log.id)
          adhocStatusById.set(item.id, {
            status: log.completedAll === false ? 'partial' : 'completed',
            sessionId: log.id,
          })
        }
      }
    }

    // ── 3. SessionLog-historie samenvoegen ──
    // Voor alle SessionLogs die NIET al via items[] gerepresenteerd worden,
    // voeg een synthetisch item toe. Dit toont historische sessies
    // (voltooid + ingepland-maar-niet-gepland-via-WeekPlanner) als read-only
    // tile in de juiste dag-cel.
    for (const session of sessionsRaw) {
      if (consumedSessionIds.has(session.id)) continue
      const date = startOfDay(new Date(session.scheduledAt))
      const iso = isoDate(date)
      const existing = map.get(iso)

      // Skip als er al een item op die dag is met dezelfde programId
      // (dan voegt de status-kleur al de info toe).
      const alreadyMatched = existing?.items.some(it =>
        it.programId !== null && it.programId === session.programId,
      )
      if (alreadyMatched) continue

      const synthetic: ScheduleItem = {
        id: `sessionlog-${session.id}`,
        order: 999,  // historisch → onderaan de cel
        programId: session.programId,
        program: session.programId ? {
          id: session.programId,
          name: session.programName ?? 'Programma',
          status: null,
        } : null,
        quickCategory: null,
        quickName: session.programId ? null : 'Workout',  // fallback voor program-loze sessions
        quickDurationSec: session.duration,
        notes: null,
      }

      if (existing) {
        existing.items = [...existing.items, synthetic]
      } else {
        map.set(iso, {
          dayId: null,
          weekScheduleId: null,
          weekNumber: null,
          items: [synthetic],
        })
      }
    }

    // ── 4. Ad-hoc CardioLogs als read-only tile ──
    // Cardio die de patiënt zelf logde zonder gepland item, zodat de
    // therapeut ook ongeplande cardio-workouts in de kalender ziet.
    for (const c of cardioRaw) {
      if (consumedCardioIds.has(c.id)) continue
      const iso = isoDate(startOfDay(new Date(c.completedAt)))
      const synthetic: ScheduleItem = {
        id: `cardiolog-${c.id}`,
        order: 999,
        programId: null,
        program: null,
        quickCategory: 'CARDIO',
        quickName: CARDIO_ACTIVITIES[c.activity as CardioActivityKey]?.label ?? 'Cardio',
        quickDurationSec: c.durationSec,
        notes: null,
      }
      const existing = map.get(iso)
      if (existing) {
        existing.items = [...existing.items, synthetic]
      } else {
        map.set(iso, { dayId: null, weekScheduleId: null, weekNumber: null, items: [synthetic] })
      }
    }

    return { dateMap: map, adhocStatusById }
  }, [schedules, sessionsRaw, cardioRaw, contentsByItem])

  // ─ Add modal + detailpaneel ─
  const [addOpen, setAddOpen] = useState(false)
  const [addInitialTab, setAddInitialTab] = useState<'library' | 'quick'>('library')
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null)
  const [panelClosing, setPanelClosing] = useState(false)
  const isDesktop = useIsDesktop()

  // Sluit het zij-paneel mét uitschuif-animatie: eerst de exit-animatie tonen,
  // dan pas unmounten.
  function closeDetail() {
    setPanelClosing(true)
    window.setTimeout(() => { setDetailItem(null); setPanelClosing(false) }, 260)
  }
  function openDetail(d: DetailItem) {
    setPanelClosing(false)
    setDetailItem(d)
  }
  const [addDayDate, setAddDayDate] = useState<Date | null>(null)
  const [addDayId, setAddDayId] = useState<string | null>(null)

  // ISO → Date lookup voor de zichtbare grid (voor selectie + drag-doel).
  const gridDateByIso = useMemo(() => {
    const m = new Map<string, Date>()
    for (const week of grid) for (const d of week) m.set(isoDate(d), d)
    return m
  }, [grid])
  const flatGridIsos = useMemo(() => grid.flat().map(isoDate), [grid])

  /**
   * Zorg dat er een WeekScheduleDay bestaat voor `date` en geef de dayId terug
   * (maakt de week aan als die nog niet bestaat). Gedeeld door openAddModal +
   * drag-drop/copy.
   */
  async function ensureDayId(date: Date): Promise<string | null> {
    if (!selectedPatientId) return null
    const existing = dateMap.get(isoDate(date))
    if (existing?.dayId) return existing.dayId
    const monday = mondayOf(date)
    try {
      const created = await ensureWeek.mutateAsync({
        name: `Week van ${monday.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`,
        patientId: selectedPatientId,
        startDate: monday.toISOString(),
        isTemplate: false,
        days: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })),
      })
      await utils.weekSchedules.listWithItems.invalidate()
      const refreshed = await utils.weekSchedules.listWithItems.fetch(
        { patientId: selectedPatientId, isTemplate: false },
      )
      const newWs = refreshed.find(w => w.id === created.id)
      const newDay = newWs?.days.find(d => d.dayOfWeek === diffDays(date, monday))
      return newDay?.id ?? null
    } catch {
      return null
    }
  }

  async function openAddModal(date: Date, tab: 'library' | 'quick' = 'library') {
    if (!selectedPatientId) {
      toast.error('Kies eerst een patiënt')
      return
    }
    const dayId = await ensureDayId(date)
    if (!dayId) { toast.error('Kon dag niet aanmaken'); return }
    setAddDayDate(date)
    setAddDayId(dayId)
    setAddInitialTab(tab)
    setAddOpen(true)
  }

  // ─ Multi-dag selectie (ingedrukt slepen) ─
  const [selectedIsos, setSelectedIsos] = useState<Set<string>>(new Set())
  const selecting = useRef(false)
  const selectAnchor = useRef<string | null>(null)

  function rangeIsos(a: string, b: string): Set<string> {
    const ia = flatGridIsos.indexOf(a)
    const ib = flatGridIsos.indexOf(b)
    if (ia < 0 || ib < 0) return new Set([a])
    const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia]
    return new Set(flatGridIsos.slice(lo, hi + 1))
  }
  function startSelection(iso: string) {
    selecting.current = true
    selectAnchor.current = iso
    setSelectedIsos(new Set([iso]))
  }
  function extendSelection(iso: string) {
    if (!selecting.current || !selectAnchor.current) return
    setSelectedIsos(rangeIsos(selectAnchor.current, iso))
  }
  function clearSelection() {
    setSelectedIsos(new Set())
    selectAnchor.current = null
  }
  useEffect(() => {
    const up = () => { selecting.current = false }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  // ─ Drag-drop (dnd-kit): item verplaatsen + dag-blok kopiëren ─
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeDrag, setActiveDrag] = useState<
    | { type: 'item'; label: string }
    | { type: 'days'; count: number }
    | null
  >(null)

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current as { type?: string; label?: string } | undefined
    if (data?.type === 'days') setActiveDrag({ type: 'days', count: selectedIsos.size })
    else setActiveDrag({ type: 'item', label: data?.label ?? 'Workout' })
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null)
    const over = e.over
    if (!over) return
    const overData = over.data.current as { iso?: string } | undefined
    const targetIso = overData?.iso
    if (!targetIso) return
    const targetDate = gridDateByIso.get(targetIso)
    if (!targetDate) return
    const data = e.active.data.current as
      | { type: 'item'; itemId: string; fromIso: string }
      | { type: 'days'; isos: string[] }
      | undefined
    if (!data) return

    if (data.type === 'item') {
      if (data.fromIso === targetIso) return
      const targetDayId = await ensureDayId(targetDate)
      if (!targetDayId) { toast.error('Kon doeldag niet bepalen'); return }
      const order = dateMap.get(targetIso)?.items.length ?? 0
      reorderItems.mutate({ moves: [{ itemId: data.itemId, dayId: targetDayId, order }] })
    } else if (data.type === 'days') {
      const isos = [...data.isos].sort((a, b) => flatGridIsos.indexOf(a) - flatGridIsos.indexOf(b))
      if (isos.length === 0) return
      const firstDate = gridDateByIso.get(isos[0])
      if (!firstDate) return
      const offset = diffDays(targetDate, firstDate)
      if (offset === 0) { toast.error('Sleep naar een andere dag'); return }
      const pairs: Array<{ fromDayId: string; toDayId: string }> = []
      for (const iso of isos) {
        const srcDayId = dateMap.get(iso)?.dayId
        const srcDate = gridDateByIso.get(iso)
        if (!srcDayId || !srcDate) continue   // lege dag → niets te kopiëren
        const toDate = addDays(srcDate, offset)
        const toDayId = await ensureDayId(toDate)
        if (toDayId) pairs.push({ fromDayId: srcDayId, toDayId })
      }
      if (pairs.length === 0) { toast.error('Geselecteerde dagen zijn leeg'); return }
      copyDayItems.mutate({ pairs }, { onSuccess: () => toast.success(`${pairs.length} dag(en) gekopieerd`) })
      clearSelection()
    }
  }

  // ─ Detailpaneel-acties ─
  function handleSaveTemplate() {
    if (!detailItem) return
    if (detailItem.item.id.startsWith('legacy-') || detailItem.item.id.startsWith('sessionlog-') || detailItem.item.id.startsWith('cardiolog-')) {
      toast.error('Dit item kan niet als schema worden opgeslagen')
      return
    }
    saveItemAsTemplate.mutate({ itemId: detailItem.item.id })
  }
  function handleCopyItem() {
    if (!detailItem?.dayId) return
    const it = detailItem.item
    if (it.programId) {
      addItem.mutate({ kind: 'program', dayId: detailItem.dayId, programId: it.programId })
    } else {
      addItem.mutate({
        kind: 'quick', dayId: detailItem.dayId,
        quickCategory: it.quickCategory ?? 'STRENGTH',
        quickName: it.quickName ?? 'Workout',
        quickDurationSec: it.quickDurationSec ?? 1800,
      })
    }
    toast.success('Workout gekopieerd op deze dag')
  }
  async function handleSaveQuick(patch: { quickName?: string; quickDurationSec?: number }) {
    if (!detailItem) return
    await updateItem.mutateAsync({ id: detailItem.item.id, ...patch })
    setDetailItem(d => d ? { ...d, item: { ...d.item, ...patch } } : d)
  }
  async function handleSaveItemExercises(
    itemId: string,
    exercises: { exerciseId: string; sets: number; reps: number; repUnit: string }[],
  ) {
    await setItemExercises.mutateAsync({ itemId, exercises })
  }
  async function handleSaveItemCardio(itemId: string, params: PlannerCardioParams | null) {
    await setItemCardio.mutateAsync({ itemId, cardioParams: params })
  }

  async function handleAddSubmit(
    payload:
      | { kind: 'program'; programId: string; notes?: string | null }
      | { kind: 'quick'; quickCategory: Category; quickName: string; quickDurationSec: number; notes?: string | null },
  ) {
    if (!addDayId) return
    if (payload.kind === 'program') {
      await addItem.mutateAsync({ kind: 'program', dayId: addDayId, programId: payload.programId, notes: payload.notes ?? null })
    } else {
      await addItem.mutateAsync({
        kind: 'quick', dayId: addDayId,
        quickCategory: payload.quickCategory,
        quickName: payload.quickName,
        quickDurationSec: payload.quickDurationSec,
        notes: payload.notes ?? null,
      })
    }
  }

  function handleDuplicateWeek(weekNumber: number) {
    if (!selectedPatientId) return
    const targetWeek = weekNumber + 1
    duplicateWeek.mutate({
      patientId: selectedPatientId,
      sourceWeekNumber: weekNumber,
      targetWeekNumber: targetWeek,
      replace: false,
    })
  }

  // ─ Render ─
  const monthLabel = `${MONTH_LABELS_NL[month0]} ${year}`

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
    <div className="max-w-[1400px] w-full flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">
      <div className="flex-1 min-w-0 w-full flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Kicker>Week-planner</Kicker>
          <Display size="md">{monthLabel.toUpperCase()}</Display>
        </div>
        <div className="flex items-center gap-2">
          <PatientPicker
            patients={patients}
            selectedId={selectedPatientId || null}
            onSelect={(id) => setUrl({ patientId: id ?? '' })}
          />
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navMonth(-1)}
            className="p-1.5 rounded-md transition-colors"
            style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, color: P.ink }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={navToday}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
            style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, color: P.ink }}
          >
            Vandaag
          </button>
          <button
            type="button"
            onClick={() => navMonth(1)}
            className="p-1.5 rounded-md transition-colors"
            style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, color: P.ink }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* Status-legenda */}
        <div className="hidden sm:flex items-center gap-3 flex-wrap">
          {([
            ['scheduled', 'Gepland'],
            ['completed', 'Voltooid'],
            ['partial', 'Deels'],
            ['missed', 'Gemist'],
          ] as const).map(([s, label]) => (
            <span key={s} className="flex items-center gap-1.5 text-[11px]" style={{ color: P.inkMuted }}>
              <span
                className="inline-block w-2.5 h-2.5 rounded-[3px]"
                style={{ background: STATUS_BORDER[s] }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      {!selectedPatientId ? (
        <Tile>
          <div className="flex items-center gap-3 py-6 text-center justify-center">
            <Building2 className="w-5 h-5 opacity-50" />
            <span className="text-sm" style={{ color: P.inkMuted }}>
              Kies een patiënt om hun planner te zien
            </span>
          </div>
        </Tile>
      ) : (
        <>
        {/* Selectie-toolbar: zichtbaar zodra er dagen geselecteerd zijn */}
        {selectedIsos.size > 0 && (
          <div
            className="flex items-center gap-3 flex-wrap rounded-xl px-3 py-2 animate-in fade-in-0 slide-in-from-top-1 duration-200"
            style={{ background: P.surface, border: `1px solid ${P.brand}` }}
          >
            <span className="text-xs font-semibold" style={{ color: P.ink }}>
              {selectedIsos.size} dag{selectedIsos.size > 1 ? 'en' : ''} geselecteerd
            </span>
            <SelectionDragHandle isos={[...selectedIsos]} />
            <span className="text-[11px]" style={{ color: P.inkMuted }}>— sleep naar een doeldag om te kopiëren</span>
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto text-xs flex items-center gap-1 px-2 py-1 rounded-md mbt-btn-hover"
              style={{ color: P.inkMuted, border: `1px solid ${P.lineStrong}` }}
            >
              <X className="w-3 h-3" /> Wissen
            </button>
          </div>
        )}
        <div className="rounded-2xl overflow-hidden" style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}>
          {/* Day-of-week header row */}
          <div className="grid grid-cols-[40px_repeat(7,1fr)] border-b" style={{ borderColor: P.line }}>
            <div />
            {DAY_LABELS_SHORT.map(d => (
              <div
                key={d}
                className="athletic-mono px-2 py-1.5 text-[10px] tracking-widest font-bold"
                style={{ color: P.inkMuted }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 6 week rows */}
          {grid.map((week, wIdx) => {
            // Bepaal weekNumber van deze rij voor 3-dots menu (kies de 1e dag in deze rij die in onze maand valt)
            const referenceDate = week.find(d => d.getMonth() === month0) ?? week[0]
            const info = dateMap.get(isoDate(referenceDate))
            const weekNum = info?.weekNumber ?? null
            return (
              <div
                key={wIdx}
                className="grid grid-cols-[40px_repeat(7,1fr)] border-b last:border-b-0"
                style={{ borderColor: P.line, minHeight: 130 }}
              >
                {/* Week-rij menu */}
                <div className="flex items-start justify-center pt-2">
                  {weekNum !== null && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-[rgba(255,255,255,0.05)]"
                          title={`Week ${weekNum} acties`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Week {weekNum}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleDuplicateWeek(weekNum)} className="gap-2 text-xs">
                          <Copy className="w-3.5 h-3.5" />
                          Dupliceer naar volgende week
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* 7 dag-cellen */}
                {week.map((date, dIdx) => {
                  const iso = isoDate(date)
                  const info = dateMap.get(iso)
                  return (
                    <DayCell
                      key={dIdx}
                      date={date}
                      inMonth={date.getMonth() === month0}
                      isToday={sameDay(date, today)}
                      info={info}
                      weekLabel={dIdx === 0 ? (info?.weekNumber ?? null) : null}
                      selected={selectedIsos.has(iso)}
                      onSelectStart={startSelection}
                      onSelectEnter={extendSelection}
                      onAddWorkout={(d) => openAddModal(d, 'quick')}
                      onAddTemplate={(d) => openAddModal(d, 'library')}
                      onCopyDay={(i) => setSelectedIsos(new Set([i]))}
                      onItemClick={(item, d, dayId, sessionId) => openDetail({ item, date: d, dayId, sessionId })}
                      onRemoveItem={handleRemoveItem}
                      statusFor={statusFor}
                      sessionIdFor={sessionIdFor}
                      openItemId={detailItem?.item.id ?? null}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
        </>
      )}

        <AddItemModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          dayId={addDayId}
          dayLabel={addDayDate ? addDayDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
          programs={programs}
          initialTab={addInitialTab}
          onSubmit={handleAddSubmit}
        />
      </div>
      {/* /kalender-kolom — krimpt mee via flex-1 wanneer het paneel opent */}

      {/* Desktop: item-detail als zij-paneel naast de (gekrompen) kalender */}
      {detailItem && isDesktop && (
        <aside
          className={cn(
            'hidden lg:flex flex-col w-[360px] xl:w-[420px] shrink-0 rounded-2xl overflow-hidden sticky top-4 max-h-[calc(100vh-2rem)] duration-300 ease-out',
            panelClosing
              ? 'animate-out fade-out-0 slide-out-to-right-4'
              : 'animate-in fade-in-0 slide-in-from-right-4',
          )}
          style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
        >
          <ItemDetailContent
            detail={detailItem}
            onClose={closeDetail}
            showClose
            onSaveTemplate={handleSaveTemplate}
            onCopy={handleCopyItem}
            onSaveQuick={handleSaveQuick}
            onSaveExercises={handleSaveItemExercises}
            onSaveCardio={handleSaveItemCardio}
            savingTemplate={saveItemAsTemplate.isPending}
            copying={addItem.isPending}
            savingExercises={setItemExercises.isPending}
            savingCardio={setItemCardio.isPending}
          />
        </aside>
      )}

      {/* Mobiel: item-detail als centrale modal */}
      {!isDesktop && (
        <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
          <DialogContent className="max-w-xl p-0 overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Workout-details</DialogTitle>
            </DialogHeader>
            <div className="max-h-[80vh] flex flex-col">
              {detailItem && (
                <ItemDetailContent
                  detail={detailItem}
                  onClose={() => setDetailItem(null)}
                  onSaveTemplate={handleSaveTemplate}
                  onCopy={handleCopyItem}
                  onSaveQuick={handleSaveQuick}
                  onSaveExercises={handleSaveItemExercises}
                  onSaveCardio={handleSaveItemCardio}
                  savingTemplate={saveItemAsTemplate.isPending}
                  copying={addItem.isPending}
                  savingExercises={setItemExercises.isPending}
                  savingCardio={setItemCardio.isPending}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
    <DragOverlay>
      {activeDrag ? (
        <div
          className="rounded-md px-2 py-1 text-[11px] font-semibold shadow-lg"
          style={{ background: P.surfaceHi, border: `1px solid ${P.brand}`, color: P.ink }}
        >
          {activeDrag.type === 'days' ? `${activeDrag.count} dag(en)` : activeDrag.label}
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  )
}
