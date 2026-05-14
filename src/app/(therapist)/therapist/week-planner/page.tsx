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

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, X, MoreHorizontal,
  Search, Building2, Copy, Trash2,
} from 'lucide-react'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore,
} from '@/components/icons'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  Display,
  Kicker,
  MetaLabel,
  P,
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
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
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

type ScheduleItem = {
  id: string
  order: number
  programId: string | null
  program: { id: string; name: string; status?: string | null } | null
  quickCategory: Category | null
  quickName: string | null
  quickDurationSec: number | null
  notes: string | null
}

type ItemStatus = 'scheduled' | 'completed' | 'missed' | 'in_progress'

const STATUS_COLORS: Record<ItemStatus, string> = {
  scheduled: 'transparent',           // geen extra accent — categorie-kleur leidt
  completed: 'rgba(190,242,100,0.18)', // lime tint
  missed:    'rgba(248,113,113,0.20)', // danger red tint
  in_progress: 'rgba(244,194,97,0.20)', // gold/amber tint
}
const STATUS_BORDER: Record<ItemStatus, string> = {
  scheduled: '',
  completed: '#BEF264',
  missed:    '#F87171',
  in_progress: '#F4C261',
}

function ItemTile({
  item, status, onRemove, onClick, readOnly,
}: {
  item: ScheduleItem
  status: ItemStatus
  onRemove: () => void
  /** Klik op de tile (niet op de X). Alleen actief als sessie-details bestaan. */
  onClick?: () => void
  readOnly?: boolean
}) {
  const category: Category = item.quickCategory ?? 'STRENGTH'  // default voor program-link
  const color = CATEGORY_COLORS[category]
  const name = item.programId ? (item.program?.name ?? 'Programma') : (item.quickName ?? 'Workout')
  const duration = item.quickDurationSec ? fmtDuration(item.quickDurationSec) : null

  // Status overlay: extra strookje bovenaan voor done/missed/in-progress.
  // Categorie-kleur blijft links als anchor zodat type direct herkenbaar is.
  const statusBg = STATUS_COLORS[status]
  const showStatusStripe = status !== 'scheduled'
  const isClickable = !!onClick

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() }
      } : undefined}
      className={cn(
        'group/tile relative rounded-md text-[11px] overflow-hidden',
        isClickable ? 'cursor-pointer hover:brightness-110 transition-[filter]' : 'cursor-default',
      )}
      style={{
        background: `${color}15`,
        borderLeft: `3px solid ${color}`,
        color: P.ink,
      }}
      title={
        status === 'completed' ? 'Voltooid — klik voor details'
        : status === 'missed' ? 'Gemist'
        : status === 'in_progress' ? 'Bezig'
        : undefined
      }
    >
      {showStatusStripe && (
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: STATUS_BORDER[status] }}
        />
      )}
      <div
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ background: statusBg }}
      >
        <span style={{ color }} className="shrink-0"><CategoryIcon category={category} size={11} /></span>
        <span className="flex-1 truncate">{name}</span>
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

const STATUS_LABEL: Record<SessionDetail['status'], string> = {
  PENDING: 'Gepland',
  IN_PROGRESS: 'Bezig',
  COMPLETED: 'Voltooid',
  SKIPPED: 'Overgeslagen',
}
const STATUS_TONE: Record<SessionDetail['status'], string> = {
  PENDING: '#7B8889',
  IN_PROGRESS: '#F4C261',
  COMPLETED: '#BEF264',
  SKIPPED: '#F87171',
}

function SessionDetailModal({
  open, onClose, sessionId,
}: { open: boolean; onClose: () => void; sessionId: string | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, error } = (trpc.weekSchedules.sessionDetails.useQuery as any)(
    { sessionId: sessionId ?? '' },
    { enabled: open && !!sessionId, staleTime: 30_000 },
  ) as { data: SessionDetail | null | undefined; isLoading: boolean; error: { message: string } | null }

  const sched = data?.scheduledAt ? new Date(data.scheduledAt) : null
  const completed = data?.completedAt ? new Date(data.completedAt) : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {data?.program?.name ?? 'Sessie-details'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm py-4 text-center" style={{ color: P.inkMuted }}>Laden…</p>
        )}
        {error && (
          <p className="text-sm py-4" style={{ color: P.danger }}>
            Details konden niet worden geladen: {error.message}
          </p>
        )}
        {data && (
          <div className="space-y-3 mt-2">
            {/* Status + datum + duur */}
            <div className="flex items-center flex-wrap gap-2 text-xs">
              <span
                className="px-2 py-0.5 rounded-full font-bold"
                style={{
                  background: `${STATUS_TONE[data.status]}20`,
                  color: STATUS_TONE[data.status],
                  border: `1px solid ${STATUS_TONE[data.status]}50`,
                }}
              >
                {STATUS_LABEL[data.status]}
              </span>
              {sched && (
                <span style={{ color: P.inkMuted }}>
                  Gepland: {sched.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              )}
              {completed && (
                <span style={{ color: P.inkMuted }}>
                  · Voltooid: {completed.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
              {data.duration ? (
                <span style={{ color: P.inkMuted }}>· Duur: {fmtDuration(data.duration)}</span>
              ) : null}
            </div>

            {/* Sessie-notitie */}
            {data.notes && (
              <Tile>
                <MetaLabel>Notitie patient</MetaLabel>
                <p className="text-sm mt-1" style={{ color: P.ink, whiteSpace: 'pre-wrap' }}>
                  {data.notes}
                </p>
              </Tile>
            )}

            {/* Exercise logs */}
            {data.exerciseLogs.length === 0 ? (
              <p className="text-xs py-3 text-center" style={{ color: P.inkMuted }}>
                Geen oefen-data gelogd voor deze sessie.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                {data.exerciseLogs.map(log => {
                  const cat = (log.exercise.category as Category) ?? 'STRENGTH'
                  const color = CATEGORY_COLORS[cat]
                  const setLine = log.setsCompleted && log.repsCompleted
                    ? `${log.setsCompleted} × ${log.repsCompleted}`
                    : log.setsCompleted
                      ? `${log.setsCompleted} sets`
                      : log.duration
                        ? fmtDuration(log.duration)
                        : '—'
                  return (
                    <div
                      key={log.id}
                      className="rounded-lg p-2.5 text-xs"
                      style={{
                        background: P.surface,
                        border: `1px solid ${P.lineStrong}`,
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color }} className="shrink-0">
                          <CategoryIcon category={cat} size={12} />
                        </span>
                        <span className="font-semibold flex-1 truncate" style={{ color: P.ink }}>
                          {log.exercise.name}
                        </span>
                        <span className="athletic-mono font-bold" style={{ color: P.ink, fontSize: 11 }}>
                          {setLine}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5" style={{ color: P.inkMuted, fontSize: 10 }}>
                        {log.weight ? <span>⚖ {log.weight}kg</span> : null}
                        {log.painLevel != null ? <span>NRS pijn: {log.painLevel}/10</span> : null}
                        {log.painDuring != null ? <span>Pijn tijdens: {log.painDuring}/10</span> : null}
                      </div>
                      {log.notes && (
                        <p className="mt-1.5 text-[11px]" style={{ color: P.ink, whiteSpace: 'pre-wrap' }}>
                          {log.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddItemModal({
  open, onClose, dayId, dayLabel, programs, onSubmit,
}: {
  open: boolean
  onClose: () => void
  dayId: string | null
  dayLabel: string
  programs: ProgramListItem[]
  onSubmit: (
    payload:
      | { kind: 'program'; programId: string }
      | { kind: 'quick'; quickCategory: Category; quickName: string; quickDurationSec: number },
  ) => Promise<void>
}) {
  const [tab, setTab] = useState<'library' | 'quick'>('library')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  // Quick form state
  const [qCat, setQCat] = useState<Category>('STRENGTH')
  const [qName, setQName] = useState('')
  const [qMinutes, setQMinutes] = useState<string>('30')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return programs.slice(0, 30)
    return programs.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30)
  }, [programs, query])

  function reset() {
    setTab('library'); setQuery(''); setQCat('STRENGTH'); setQName(''); setQMinutes('30')
  }
  function handleClose() { reset(); onClose() }

  async function handleProgramPick(programId: string) {
    if (!dayId || busy) return
    setBusy(true)
    try { await onSubmit({ kind: 'program', programId }); handleClose() }
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
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Geen programma's gevonden.</p>
              ) : (
                filtered.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProgramPick(p.id)}
                    disabled={busy}
                    className="w-full text-left px-3 py-2 rounded-lg transition-colors hover:bg-[#1C2425] flex items-center gap-2"
                    style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
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
    duration: number | null
    programId: string | null
    programName: string | null
  }> }
  // Map (programId, dateISO) → { status, sessionId }. Quick workouts (geen
  // programId) krijgen geen status — blijven 'scheduled'. sessionId wordt
  // gebruikt voor de session-detail modal wanneer therapeut op een tile klikt.
  type SessionMatch = { status: ItemStatus; sessionId: string }
  const sessionByKey = useMemo(() => {
    const todayStart = startOfDay(new Date())
    const map = new Map<string, SessionMatch>()
    for (const s of sessionsRaw) {
      if (!s.programId) continue
      const sched = new Date(s.scheduledAt)
      const key = `${s.programId}|${isoDate(sched)}`
      let status: ItemStatus
      if (s.completedAt) {
        status = 'completed'
      } else if (s.status === 'IN_PROGRESS') {
        status = 'in_progress'
      } else if (s.status === 'SKIPPED' || sched < todayStart) {
        status = 'missed'
      } else {
        status = 'scheduled'
      }
      // Als er meerdere sessies op dezelfde sleutel zijn (re-schedule etc),
      // kies de "best status": completed > in_progress > scheduled > missed.
      const prev = map.get(key)
      const prio: Record<ItemStatus, number> = { completed: 4, in_progress: 3, scheduled: 2, missed: 1 }
      if (!prev || prio[status] > prio[prev.status]) {
        map.set(key, { status, sessionId: s.id })
      }
    }
    return map
  }, [sessionsRaw])

  function statusFor(date: Date, item: ScheduleItem): ItemStatus {
    if (!item.programId) return 'scheduled'
    return sessionByKey.get(`${item.programId}|${isoDate(date)}`)?.status ?? 'scheduled'
  }

  /** Geef het bijbehorende SessionLog-id terug zodat klikken op een gedane
   *  tile de detail-modal kan openen. Voor sessionlog-prefixed items zit
   *  het id in de prefix; voor andere items lookup via sessionByKey. */
  function sessionIdFor(date: Date, item: ScheduleItem): string | null {
    if (item.id.startsWith('sessionlog-')) {
      return item.id.slice('sessionlog-'.length)
    }
    if (!item.programId) return null
    return sessionByKey.get(`${item.programId}|${isoDate(date)}`)?.sessionId ?? null
  }

  // Schedule dag-info gemapt op ISO-datum.
  type DayCellInfo = {
    dayId: string | null            // null als nog geen schedule bestaat voor die week
    weekScheduleId: string | null
    weekNumber: number | null
    items: ScheduleItem[]
  }
  const dateMap = useMemo(() => {
    const map = new Map<string, DayCellInfo>()

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
          let items: ScheduleItem[] = (day.items ?? []).map(it => ({
            id: it.id,
            order: it.order,
            programId: it.programId,
            program: it.program ?? null,
            quickCategory: (it.quickCategory ?? null) as Category | null,
            quickName: it.quickName,
            quickDurationSec: it.quickDurationSec,
            notes: it.notes,
          }))
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

    // ── 2. SessionLog-historie samenvoegen ──
    // Voor alle SessionLogs die NIET al via items[] gerepresenteerd worden,
    // voeg een synthetisch item toe. Dit toont historische sessies
    // (voltooid + ingepland-maar-niet-gepland-via-WeekPlanner) als read-only
    // tile in de juiste dag-cel.
    for (const session of sessionsRaw) {
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

    return map
  }, [schedules, sessionsRaw])

  // ─ Add modal ─
  const [addOpen, setAddOpen] = useState(false)
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null)
  const [addDayDate, setAddDayDate] = useState<Date | null>(null)
  const [addDayId, setAddDayId] = useState<string | null>(null)

  async function openAddModal(date: Date) {
    if (!selectedPatientId) {
      toast.error('Kies eerst een patiënt')
      return
    }
    const iso = isoDate(date)
    let info = dateMap.get(iso)
    if (!info?.dayId) {
      // Geen schedule voor deze week → maak 'm aan
      const monday = mondayOf(date)
      // Zoek hoogste weekNumber binnen deze patient + 1
      const maxWeek = schedules.reduce((m, ws) => Math.max(m, ws.weekNumber ?? 0), 0)
      try {
        const created = await ensureWeek.mutateAsync({
          name: `Week van ${monday.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`,
          patientId: selectedPatientId,
          startDate: monday.toISOString(),
          isTemplate: false,
          days: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })),
        })
        // Nieuwe data invalideren + ophalen om de juiste dayId te vinden
        await utils.weekSchedules.listWithItems.invalidate()
        const created2 = await utils.weekSchedules.listWithItems.fetch(
          { patientId: selectedPatientId, isTemplate: false },
        )
        const newWs = created2.find(w => w.id === created.id)
        const newDay = newWs?.days.find(d => d.dayOfWeek === diffDays(date, monday))
        if (!newDay) { toast.error('Kon dag niet vinden'); return }
        info = { dayId: newDay.id, weekScheduleId: created.id, weekNumber: maxWeek + 1, items: [] }
      } catch {
        toast.error('Kon week niet aanmaken')
        return
      }
    }
    setAddDayDate(date)
    setAddDayId(info.dayId)
    setAddOpen(true)
  }

  async function handleAddSubmit(
    payload:
      | { kind: 'program'; programId: string }
      | { kind: 'quick'; quickCategory: Category; quickName: string; quickDurationSec: number },
  ) {
    if (!addDayId) return
    if (payload.kind === 'program') {
      await addItem.mutateAsync({ kind: 'program', dayId: addDayId, programId: payload.programId })
    } else {
      await addItem.mutateAsync({
        kind: 'quick', dayId: addDayId,
        quickCategory: payload.quickCategory,
        quickName: payload.quickName,
        quickDurationSec: payload.quickDurationSec,
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
    <div className="max-w-[1400px] w-full flex flex-col gap-3">
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
                  const inMonth = date.getMonth() === month0
                  const isToday = sameDay(date, today)
                  const info = dateMap.get(isoDate(date))
                  const items = info?.items ?? []
                  return (
                    <div
                      key={dIdx}
                      className="border-l p-1.5 flex flex-col gap-1 group/cell"
                      style={{
                        borderColor: P.line,
                        background: inMonth ? P.surfaceLow : 'transparent',
                        opacity: inMonth ? 1 : 0.4,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn('text-xs', isToday && 'font-bold')}
                          style={{
                            color: isToday ? P.lime : P.inkMuted,
                          }}
                        >
                          {date.getDate()}
                        </span>
                        {info?.weekNumber && dIdx === 0 && (
                          <span className="athletic-mono text-[9px]" style={{ color: P.inkDim }}>
                            W{info.weekNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        {items.map(item => {
                          const sId = sessionIdFor(date, item)
                          return (
                            <ItemTile
                              key={item.id}
                              item={item}
                              status={statusFor(date, item)}
                              onRemove={() => handleRemoveItem(item, info?.dayId ?? null)}
                              onClick={sId ? () => setDetailSessionId(sId) : undefined}
                              readOnly={item.id.startsWith('sessionlog-')}
                            />
                          )
                        })}
                      </div>
                      {inMonth && (
                        <button
                          type="button"
                          onClick={() => openAddModal(date)}
                          className="opacity-0 group-hover/cell:opacity-100 transition-opacity self-start text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded"
                          style={{ color: P.inkMuted, background: 'transparent' }}
                        >
                          <Plus className="w-3 h-3" />
                          Workout
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      <AddItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        dayId={addDayId}
        dayLabel={addDayDate ? addDayDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        programs={programs}
        onSubmit={handleAddSubmit}
      />

      <SessionDetailModal
        open={!!detailSessionId}
        onClose={() => setDetailSessionId(null)}
        sessionId={detailSessionId}
      />
    </div>
  )
}
