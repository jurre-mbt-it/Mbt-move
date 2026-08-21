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
import { matchLoggedPlanned, type PlannedEntry } from '@/lib/planned-matching'
import { usePortal } from '@/lib/portal'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, X, MoreHorizontal,
  Search, Building2, Copy, CopyPlus, Pencil, BookmarkPlus, GripVertical,
  CalendarRange, Layers, Moon, CalendarPlus, StickyNote, ClipboardCheck, Flag,
  Scissors, ClipboardPaste, Archive, Check, Clock3, CornerUpRight,
} from 'lucide-react'
import {
  PHASE_TYPES, PHASE_META, phaseMeta, DELOAD_LOAD_FRACTION,
  type PhaseType,
} from '@/lib/periodization'
import {
  DndContext, DragOverlay, closestCenter, MouseSensor, TouchSensor,
  useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore,
  IconScale, CARDIO_ICON_MAP,
  IconMoodVeryLow, IconMoodLow, IconMoodNeutral, IconMoodGood, IconMoodGreat,
} from '@/components/icons'
import {
  CARDIO_ACTIVITIES, HR_ZONES,
  type CardioActivityKey, type CardioProtocolKey, type HRZone, type CardioInterval,
} from '@/lib/cardio-constants'
import { ApplyPlanDialog, SavePlanDialog } from '@/components/week-planner/PlanTemplateDialogs'
import { sumPlannedLoad, loadVerdict, cardioEstimate } from '@/lib/planned-load'
import { CardioWorkoutBuilder } from '@/components/week-planner/CardioWorkoutBuilder'
import { readWorkout, summarize as summarizeWorkout, totalDurationSec as workoutDuration, structuredLoad, type StructuredCardio } from '@/lib/cardio-workout'
import { AddItemModal, type AddItemPayload } from '@/components/week-planner/AddItemModal'
import { WorkoutProfileStrip } from '@/components/week-planner/WorkoutProfileStrip'
import { DarkButton, DarkDialog as Dialog, DarkDialogContent as DialogContent, DarkDialogHeader as DialogHeader, DarkDialogTitle as DialogTitle, DarkInput, DarkTextarea, Display, Kicker, MetaLabel, P, CARD, SkeletonText, Tile } from '@/components/dark-ui'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CATEGORY_COLORS, CARDIO_ACTIVITY_COLORS, textOn } from '@/lib/palette'
import { formatWeightsPerSet } from '@/lib/session-sets'
import { useCategoryColors } from '@/lib/useCategoryColors'
import {
  CATEGORY_LABELS,
  CategoryIcon,
  QuickExerciseBuilder,
  toItemExercisePayload,
  type ItemExercise,
} from '@/components/week-planner/QuickExerciseBuilder'
import { LOAD_UITLEG } from '@/lib/training-load'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'


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
/**
 * ISO 8601-weeknummer (1–53): de échte kalenderweek, tellend vanaf januari.
 * Voor de week-rail-weergave zodat die gelijk loopt met een gewone kalender
 * i.p.v. de programma-relatieve week 1 (die toevallig in juni kan beginnen).
 */
function isoWeekOf(d: Date): number {
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // 0 = maandag
  x.setDate(x.getDate() - dow + 3) // donderdag van deze week bepaalt het jaar
  const ft = startOfDay(new Date(x.getFullYear(), 0, 4))
  ft.setDate(ft.getDate() - (((ft.getDay() + 6) % 7)) + 3)
  return 1 + Math.round((x.getTime() - ft.getTime()) / (7 * 86_400_000))
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

/**
 * `dischargedAt` gevuld = deze persoon staat in het archief van de lezer. De
 * planner haalt daarom `include: 'all'` op: zonder de gearchiveerden erbij
 * verdwijnt een patiënt uit de kiezer op het moment dat je zijn week nog wilt
 * teruglezen, en met alleen de actieven zou een bestaande deeplink of URL met
 * `?patientId=` een lege kalender tonen zonder uitleg.
 */
type Patient = { id: string; name: string | null; email: string | null; dischargedAt: Date | string | null }

/** Klein grijs label achter een gearchiveerde naam. */
function ArchiefBadge() {
  return (
    <span
      className="athletic-mono shrink-0"
      style={{
        background: P.surfaceHi,
        color: P.inkMuted,
        fontSize: 9,
        letterSpacing: '0.12em',
        padding: '1px 6px',
        borderRadius: 999,
        fontWeight: 900,
      }}
    >
      ARCHIEF
    </span>
  )
}

function PatientPicker({
  patients, selectedId, onSelect,
}: { patients: Patient[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const current = patients.find(p => p.id === selectedId) ?? null
  const actief = patients.filter(p => !p.dischargedAt)
  const archief = patients.filter(p => p.dischargedAt)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mbt-btn-hover inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{...CARD, color: P.ink}}
        >
          <span>{current ? (current.name ?? current.email ?? 'Patiënt') : 'Kies patiënt…'}</span>
          {current?.dischargedAt ? <ArchiefBadge /> : null}
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
          <>
            {actief.map(p => (
              <DropdownMenuItem key={p.id} onSelect={() => onSelect(p.id)} className="flex items-center gap-2 text-sm">
                <span className="truncate">{p.name ?? p.email ?? 'Onbekend'}</span>
              </DropdownMenuItem>
            ))}
            {/* Gearchiveerden onderaan en met een eigen kopje: ze zijn hier om
                terug te lezen, niet om als eerste te kiezen. */}
            {archief.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Archief
                </DropdownMenuLabel>
                {archief.map(p => (
                  <DropdownMenuItem key={p.id} onSelect={() => onSelect(p.id)} className="flex items-center gap-2 text-sm">
                    <span className="truncate flex-1" style={{ color: P.inkMuted }}>
                      {p.name ?? p.email ?? 'Onbekend'}
                    </span>
                    <ArchiefBadge />
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Item tile ────────────────────────────────────────────────────────────────



/** Alles wat setItemExercises accepteert — één plek, zodat een nieuw veld niet
 *  bij de volgende opslag stil verdwijnt. */

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

type ItemKind = 'PROGRAM' | 'WORKOUT' | 'REST' | 'NOTE' | 'TEST' | 'EVENT'

// ─── Gelogde-training-weergave (tegels + weektotalen) ────────────────────────

/** Wat er ná het loggen op een tegel verschijnt (afstand/duur/tempo/RPE/gevoel). */
type LoggedInfo = {
  kind: 'cardio' | 'strength'
  activity?: string | null
  distanceM?: number | null
  durationSec?: number | null
  rpe?: number | null
  feel?: number | null
}

function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s2 = Math.round(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`
  return `${m}:${String(s2).padStart(2, '0')} min`
}

function fmtKmVal(m: number): string {
  return `${(m / 1000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')} km`
}

/** Tempo (min/km) — alleen zinvol bij afstand + duur. */
function paceLabelFor(distanceM: number | null | undefined, durationSec: number | null | undefined): string | null {
  if (!distanceM || !durationSec || distanceM < 100) return null
  const secPerKm = durationSec / (distanceM / 1000)
  const m = Math.floor(secPerKm / 60)
  const s2 = Math.round(secPerKm % 60)
  return `${m}:${String(s2).padStart(2, '0')} /km`
}


/**
 * Het tekentje rechtsboven op een tegel. De vulling zegt al of er iets gebeurd
 * is (donker = nog te doen, licht = gedaan); dit maakt precies wát er gebeurd
 * is eenduidig, zonder er een kleur voor nodig te hebben.
 *
 * `scheduled` krijgt niets: een blokje dat gewoon nog moet gebeuren is de
 * normale toestand, en daar hoort geen markering bij. Alleen afwijkingen
 * verdienen een tekentje.
 */
const STATUS_GLYPH: Record<ItemStatus, ((p: { size?: number }) => React.ReactNode) | null> = {
  scheduled:   null,
  completed:   ({ size = 10 }) => <Check size={size} strokeWidth={3.5} />,
  partial:     ({ size = 10 }) => <Check size={size} strokeWidth={3.5} />,
  in_progress: ({ size = 10 }) => <Clock3 size={size} strokeWidth={3} />,
  missed:      ({ size = 10 }) => <X size={size} strokeWidth={3.5} />,
  moved:       ({ size = 10 }) => <CornerUpRight size={size} strokeWidth={3} />,
}

/** RPE-band zoals in trainingskalenders: cijfer + woord + kleur. */
function rpeMeta(rpe: number): { label: string; color: string; bg: string } {
  if (rpe >= 8) return { label: 'Max', color: P.danger, bg: 'rgba(240,121,108,0.16)' }
  if (rpe >= 6) return { label: 'Zwaar', color: P.gold, bg: 'rgba(245,185,66,0.16)' }
  if (rpe >= 4) return { label: 'Gemiddeld', color: P.ice, bg: 'rgba(159,206,201,0.14)' }
  return { label: 'Licht', color: P.lime, bg: 'rgba(95,208,138,0.12)' }
}

/** feelScore 1–5 → eigen mood-icoon + woord — zelfde set en labels als de
 *  gevoel-kiezer bij de sessie-afronding (geen standaard-emoji). */
const FEEL_META: Record<number, { Icon: (p: { size?: number; className?: string }) => React.ReactNode; label: string }> = {
  1: { Icon: IconMoodVeryLow, label: 'Slecht' },
  2: { Icon: IconMoodLow, label: 'Matig' },
  3: { Icon: IconMoodNeutral, label: 'Oké' },
  4: { Icon: IconMoodGood, label: 'Goed' },
  5: { Icon: IconMoodGreat, label: 'Top' },
}

/** Sport-groepen voor de weektotalen. */
function activityGroup(activity: string | null | undefined): 'fiets' | 'hardlopen' | 'overig' {
  if (activity === 'CYCLING' || activity === 'WATTBIKE' || activity === 'ASSAULT_BIKE') return 'fiets'
  if (activity === 'RUNNING') return 'hardlopen'
  return 'overig'
}

type ScheduleItem = {
  id: string
  order: number
  kind: ItemKind
  programId: string | null
  program: { id: string; name: string; status?: string | null } | null
  quickCategory: Category | null
  quickActivity?: CardioActivityKey | null
  quickName: string | null
  quickDurationSec: number | null
  /** Voorschrift voor de belasting; null = afleiden. Zie lib/planned-load.ts. */
  plannedDurationSec?: number | null
  plannedRpe?: number | null
  testBattery?: { id: string; name: string } | null
  notes: string | null
  exercises?: ItemExercise[]
  cardioParams?: PlannerCardioParams | null
}

/** Alleen deze twee zijn workouts; de rest zijn kalender-markeringen zonder
 *  belasting, status of sessie-koppeling. */
const WORKOUT_KINDS: ItemKind[] = ['PROGRAM', 'WORKOUT']
const isWorkoutKind = (k: ItemKind) => WORKOUT_KINDS.includes(k)

/** Niet-workout items: eigen kleur, icoon en onderschrift. */
const MARKER_META: Record<Exclude<ItemKind, 'PROGRAM' | 'WORKOUT'>, { color: string; label: string }> = {
  REST:  { color: P.inkDim, label: 'geen belasting' },
  NOTE:  { color: 'var(--p-gold)', label: 'notitie' },
  TEST:  { color: P.ink,    label: 'testbatterij' },
  // Mint, niet groen of oranje: groen leest als behaald en oranje als actie,
  // en een streefdatum is geen van beide. Gelijk aan de app.
  EVENT: { color: P.ice, label: 'streefdatum' },
}

// `moved` = wél gedaan, maar op een andere dag dan gepland. De workout zelf
// staat als tegel op de uitvoerdag; hier blijft een spoor achter zodat de
// therapeut ziet dát er iets stond en waar het heen ging.
type ItemStatus = 'scheduled' | 'completed' | 'partial' | 'missed' | 'in_progress' | 'moved'

// Status leidt de tile-kleur: gepland = neutraal/wit, voltooid = groen,
// deels (eerder gestopt) = oranje, gemist (verleden + niet gedaan) = rood.
// Categorie blijft herkenbaar via het icoon.
// Het vlak van een tegel is altijd neutraal. Kleur zit op de 3px-rand (status)
// en het icoon (soort) — twee smalle vlakken. Toen de status ook het hele vlak
// vulde, telde één kalender veertien tinten en werd het onleesbaar.
const TILE_BG = P.surface
const STATUS_BORDER: Record<ItemStatus, string> = {
  scheduled: 'rgba(212,232,230,0.5)',
  completed: P.lime,
  partial:   P.orange,
  missed:    P.danger,
  in_progress: P.gold,
  moved:     'rgba(212,232,230,0.25)',
}
/**
 * Uitleg onder de kalender. De rail links toont twee getallen die zonder
 * bijschrift niet te raden zijn (gedaan/gepland en de geplande weekbelasting),
 * en de tegelkleuren zijn pas een taal als ergens staat wat ze betekenen.
 */
function CalendarLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t"
      style={{ borderColor: P.line, background: P.surfaceLow }}
    >
      {/* De statuskleuren staan al boven de kalender; hier alleen wat daar niet
          staat: dat een tegel twee dingen tegelijk zegt, en wat de twee getallen
          in de weekrail betekenen. */}
      <span className="athletic-mono text-[9px] tracking-wider" style={{ color: P.inkDim }}>
        Rand = status · icoon = soort training
      </span>
      <span className="athletic-mono text-[9px] tracking-wider" style={{ color: P.inkDim }}>
        3/8 = gedane van geplande workouts
      </span>
      <span
        className="athletic-mono text-[9px] tracking-wider"
        style={{ color: P.inkDim }}
        title={LOAD_UITLEG}
      >
        ~1041 AU = geplande weekbelasting
      </span>
    </div>
  )
}

/** "wo 19 aug" — kort genoeg voor een tooltip op een tegel. */
function dagLabelKort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

const STATUS_TITLES: Record<ItemStatus, string | undefined> = {
  scheduled: undefined,
  completed: 'Voltooid, klik voor details',
  partial:   'Deels voltooid, eerder gestopt',
  missed:    'Gemist, niet gedaan',
  in_progress: 'Bezig',
  moved:     'Verplaatst — op een andere dag gedaan',
}

/**
 * Geplande weekbelasting tegen het doel. Het doel staat op 80% van de balk,
 * zodat "te veel gepland" er zichtbaar voorbij loopt in plaats van stil vol te
 * lopen. Een geschat getal krijgt een ~ zodat het zich niet voordoet als een
 * voorschrift.
 */
function WeekLoadBar({
  planned, target, estimated,
}: { planned: number; target: number | null; estimated: boolean }) {
  const verdict = loadVerdict(planned, target)
  const color =
    verdict === 'over' ? P.brand
    : verdict === 'under' ? P.inkDim
    : verdict === 'on_target' ? P.lime
    : P.inkMuted
  const pct = target && target > 0 ? Math.min(100, (planned / (target * 1.25)) * 100) : 0
  const title = target
    ? `Gepland ${planned} van ${target} AU${estimated ? ' (deels geschat)' : ''}. ${LOAD_UITLEG}`
    : `Gepland ${planned} AU${estimated ? ' (deels geschat)' : ''}, geen weekdoel gezet. ${LOAD_UITLEG}`

  return (
    <span className="flex flex-col items-center gap-0.5 w-full px-1" title={title}>
      {target != null && target > 0 && (
        <span
          className="relative w-full h-[3px] rounded-full overflow-visible"
          style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full origin-left"
            style={{ width: '100%', background: color, transform: `scaleX(${(pct / 100).toFixed(3)})` }}
          />
          {/* Doel-markering op 80% */}
          <span className="absolute top-[-2px] bottom-[-2px] w-px" style={{ left: '80%', background: P.inkMuted }} />
        </span>
      )}
      <span className="athletic-mono text-[9px]" style={{ color }}>
        {estimated ? '~' : ''}{planned}
      </span>
    </span>
  )
}

/**
 * Cardio in het zijpaneel: wat staat er, en een knop naar de bouwer. De
 * blokken zelf bewerk je in een volledig scherm — 360px is te smal voor een
 * workout met herhalingen.
 */
function CardioSummary({ item, onBuild }: { item: ScheduleItem; onBuild: (() => void) | null }) {
  const w = readWorkout(item.cardioParams)
  const dur = w ? workoutDuration(w.blocks) : 0
  return (
    <div className="space-y-2">
      <MetaLabel>Cardio-workout</MetaLabel>
      {w ? (
        <div className="rounded-lg p-2.5" style={{...CARD }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: P.ink }}>
              {CARDIO_ACTIVITIES[w.activity]?.label ?? 'Cardio'}
            </span>
            <span className="athletic-mono text-[10px]" style={{ color: P.inkMuted }}>
              {Math.round(dur / 60)} min
            </span>
            <span className="athletic-mono text-[10px]" style={{ color: P.lime }}>
              {structuredLoad(w.blocks)} sRPE
            </span>
          </div>
          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: P.inkDim }}>
            {summarizeWorkout(w.blocks)}
          </p>
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed" style={{ color: P.inkDim }}>
          Nog geen blokken. Bouw de workout op uit warming-up, intervallen en cooldown.
        </p>
      )}
      {/* null = gearchiveerde patiënt: de bouwer slaat op, dus die knop hoort
          er dan niet te staan. De samenvatting hierboven blijft leesbaar. */}
      {onBuild && (
        <DarkButton variant="secondary" size="sm" onClick={onBuild} className="w-full text-xs">
          <Layers className="w-3.5 h-3.5 mr-1.5" />
          {w ? 'Workout bewerken' : 'Workout bouwen'}
        </DarkButton>
      )}
    </div>
  )
}

/** De geplande oefeningen als leeslijst, voor wanneer de bouwer niet mag. */
function PlannedExerciseList({ exercises }: { exercises: ItemExercise[] }) {
  const catColors = useCategoryColors()
  if (exercises.length === 0) {
    return (
      <div className="space-y-2">
        <MetaLabel>Geplande oefeningen</MetaLabel>
        <p className="text-xs py-2" style={{ color: P.inkMuted }}>
          Er stonden geen oefeningen bij deze workout.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <MetaLabel>Geplande oefeningen</MetaLabel>
      <div className="space-y-1.5">
        {exercises.map(ex => {
          const cat = (ex.exerciseCategory as Category) ?? 'STRENGTH'
          const c = catColors[cat]
          return (
            <div
              key={ex.id}
              className="rounded-lg p-2.5 text-xs"
              style={{...CARD }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color: c }} className="shrink-0"><CategoryIcon category={cat} size={12} /></span>
                <span className="font-semibold flex-1 truncate" style={{ color: P.ink }}>{ex.exerciseName}</span>
                <span className="athletic-mono font-bold" style={{ color: P.ink, fontSize: 11 }}>
                  {ex.sets} × {ex.reps} {ex.repUnit}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MarkerIcon({ kind, size = 11 }: { kind: ItemKind; size?: number }) {
  switch (kind) {
    case 'REST': return <Moon size={size} />
    case 'NOTE': return <StickyNote size={size} />
    case 'TEST': return <ClipboardCheck size={size} />
    case 'EVENT': return <Flag size={size} />
    default: return null
  }
}

function ItemTile({
  item, status, logged, movedTo, onRemove, onClick, readOnly, isOpen,
}: {
  item: ScheduleItem
  status: ItemStatus
  /** Bij status 'moved': de dag waarop deze workout wél is gedaan. */
  movedTo?: string | null
  /** Gelogde data (afstand/duur/RPE/gevoel) — alleen getoond als gedaan/deels. */
  logged?: LoggedInfo | null
  onRemove: () => void
  /** Klik op de tile (niet op de X). Alleen actief als sessie-details bestaan. */
  onClick?: () => void
  readOnly?: boolean
  /** True als deze workout nu open staat in het zijpaneel → naam valt weg, alleen icoon. */
  isOpen?: boolean
}) {
  const marker = isWorkoutKind(item.kind)
    ? null
    : MARKER_META[item.kind as Exclude<ItemKind, 'PROGRAM' | 'WORKOUT'>]
  const catColors = useCategoryColors()
  const category: Category = item.quickCategory ?? 'STRENGTH'  // default voor program-link
  // Twee talen op één tegel, bewust op verschillende plekken: de rand zegt hoe
  // het ging (status), het icoon zegt wat het was (soort). Dat kan alleen omdat
  // de soortkleuren koel en gedempt zijn en de statuskleuren warm — vallen ze
  // samen, dan leest een week vol gemiste trainingen als een week vol
  // afgevinkte. Zie de opmerking bij CATEGORY_COLORS in lib/palette.
  // Cardio is één categorie, maar op een agenda staan hardlopen, fietsen en
  // wandelen naast elkaar en dan zegt één gedeelde blauwe tint niets. Is de
  // activiteit bekend, dan wint die; anders valt hij terug op de categorie.
  // De activiteitstinten blijven in dezelfde koele familie, dus je ziet nog
  // steeds dát het cardio is.
  const cardioActivity = item.cardioParams?.activity ?? logged?.activity ?? null
  const activityColor =
    category === 'CARDIO' && cardioActivity
      ? CARDIO_ACTIVITY_COLORS[cardioActivity] ?? null
      : null
  const color = marker
    ? marker.color
    : activityColor ?? catColors[category] ?? P.inkMuted
  // Kleur én vorm samen houden de activiteiten uit elkaar. CARDIO_ICON_MAP lag
  // er al met een icoon per activiteit; de agenda pakte tot nu toe het
  // generieke hartje voor alles wat cardio was.
  const ActivityIcon =
    category === 'CARDIO' && cardioActivity ? CARDIO_ICON_MAP[cardioActivity] ?? null : null
  const name = marker
    ? (item.kind === 'TEST' ? (item.testBattery?.name ?? 'Test') : (item.quickName ?? marker.label))
    : item.programId ? (item.program?.name ?? 'Programma') : (item.quickName ?? 'Workout')
  // De inhoud wint. `plannedDurationSec` wordt door de server afgeleid zodra er
  // oefeningen of cardio-blokken staan; wat de therapeut bij het toevoegen
  // intikte is alleen het plan zolang er nog niets is.
  const durationSec = item.plannedDurationSec ?? item.quickDurationSec
  const duration = marker || !durationSec ? null : fmtDuration(durationSec)

  // Status leidt de kleur (border + tint); categorie-icoon blijft als anchor
  // zodat het type direct herkenbaar is.
  // Markeringen hebben geen status: een notitie of streefdatum in het verleden
  // is niet "gemist". Ze krijgen hun eigen rustige weergave i.p.v. de
  // status-kleuren van een workout.
  // De soort vult het vlak, de status zit in de diepte van diezelfde vulling.
  // Een training die nog moet gebeuren is donker en dicht: er staat toch
  // alleen een naam in. Een gedane training is licht, want daar staan de
  // cijfers in en die lezen als donkere inkt op een licht vlak. Zo zie je aan
  // de diepte al of er iets gebeurd is, nog voordat je het tekentje leest.
  //
  // Hiervoor droeg de rand de status in een signaalkleur. Dat kon niet samen
  // met een gevuld blokje: de categoriekleur werd het beeld en de rand
  // verschrompelde tot een lijntje. Nu draagt de kleur de soort en de vorm de
  // staat, en dat werkt ook voor wie kleuren slecht onderscheidt.
  const isDone = status === 'completed' || status === 'partial' || status === 'in_progress'
  // De volle categoriekleur, precies zoals hij in het palet staat. Een eerdere
  // versie rekende hem om naar een lichtere tint; dat maakte elke pil bleek en
  // doorzichtig. De kleuren zijn al gekozen om als vlak te werken, dus laat ze
  // met rust en bepaal alleen de inkt erbij.
  const fill = color
  const tileInk = marker ? P.ink : textOn(fill)
  const statusBorder = marker ? marker.color : STATUS_BORDER[status]
  const Glyph = marker ? null : STATUS_GLYPH[status]
  const isClickable = !!onClick

  // Compacte inhoud-preview onder de titel: oefeningen of cardio-samenvatting.
  // Compacte hint op de tegel (één regel) — de volledige inhoud zit in het
  // zijpaneel dat opent bij klikken. Houdt de kalender schoon.
  const exCount = item.exercises?.length ?? 0
  let previewLine: string | null = null
  if (marker) {
    // Rustdag/notitie/test/doel: geen oefeningen of cardio, alleen het label.
    previewLine = marker.label
  } else if (exCount > 0) {
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
      // Alleen de kopregel is gekleurd. De cijfers eronder staan op de
      // dagkaart zelf, want een pil met een naam leest sneller dan een blok
      // met vier regels erin.
      style={{
        background: marker ? P.surfaceLow : 'transparent',
        border: marker ? `1px solid ${P.line}` : undefined,
        borderLeft: marker ? `4px solid ${statusBorder}` : undefined,
        borderLeftStyle: marker && item.kind === 'REST' ? 'dotted' : undefined,
      }}
      title={
        marker ? marker.label
        : status === 'moved' && movedTo ? `Verplaatst — gedaan op ${dagLabelKort(movedTo)}`
        : STATUS_TITLES[status]
      }
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md"
        style={marker ? undefined : { background: fill, color: tileInk }}
      >
        <span style={{ color: marker ? color : tileInk }} className="shrink-0">
          {marker
            ? <MarkerIcon kind={item.kind} size={11} />
            : ActivityIcon
              ? <ActivityIcon size={11} />
              : <CategoryIcon category={category} size={11} />}
        </span>
        {!isOpen && <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>}
        {!marker && Glyph && (
          <span className="shrink-0 opacity-80" style={{ color: tileInk }} aria-hidden="true">
            <Glyph size={10} />
          </span>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="opacity-0 group-hover/tile:opacity-100 pointer-coarse:opacity-60 transition-opacity shrink-0 hover:!text-[var(--p-danger)]"
            style={{ color: tileInk }}
            title="Verwijder"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {/* De tijdsduur stond hiervoor op de pil zelf. Daar vrat hij de ruimte op
          die de naam nodig heeft, en juist die naam is waar je op zoekt. */}
      {duration && !marker && (
        <div
          className="athletic-mono px-2 pt-1 truncate"
          style={{ fontSize: 9, letterSpacing: '0.06em', color: P.inkMuted }}
        >
          {duration}
        </div>
      )}
      {/* Verplaatst: de workout zelf staat als tegel op de dag dat hij gedaan
          is. Hier blijft alleen zichtbaar dát er iets stond en waar het heen
          ging — zonder dit leek de dag gewoon leeg. */}
      {status === 'moved' && movedTo && (
        <div
          className="athletic-mono px-2 pb-1 -mt-0.5 truncate"
          style={{ fontSize: 9, letterSpacing: '0.04em', color: P.inkDim }}
        >
          → gedaan op {dagLabelKort(movedTo)}
        </div>
      )}
      {/* Profiel van wat er GEPLAND staat: cardio-blokken als zaagtand,
          kracht als balkje per oefening. Alleen zolang er nog niets gelogd is;
          daarna wint de gerealiseerde data hieronder, anders staan er twee
          verhalen op één tegel. */}
      {!marker && status !== 'completed' && status !== 'partial' && status !== 'moved' && (
        <>
          <WorkoutProfileStrip
            cardioParams={item.cardioParams}
            exercises={item.exercises}
            category={item.quickCategory}
          />
          {item.plannedRpe != null && (() => {
            const m = rpeMeta(item.plannedRpe)
            return (
              <div className="px-2 pb-1.5 -mt-0.5">
                <span
                  className="athletic-mono inline-flex items-center"
                  style={{
                    background: m.bg, color: m.color, fontSize: 9, fontWeight: 900,
                    letterSpacing: '0.06em', padding: '1px 6px', borderRadius: 999,
                  }}
                  title={`Voorgeschreven RPE ${item.plannedRpe}`}
                >
                  RPE {item.plannedRpe}
                </span>
              </div>
            )
          })()}
        </>
      )}

      {/* Gelogde data — afstand · duur · tempo + RPE/gevoel-chips, zoals in
          trainingskalenders. Alleen bij een gedane (of deels gedane) workout. */}
      {logged && (status === 'completed' || status === 'partial') && (() => {
        const statLine = [
          logged.distanceM ? fmtKmVal(logged.distanceM) : null,
          logged.durationSec ? fmtClock(logged.durationSec) : null,
          logged.kind === 'cardio' ? paceLabelFor(logged.distanceM, logged.durationSec) : null,
        ].filter(Boolean).join(' · ')
        const feel = logged.feel != null ? FEEL_META[logged.feel] : null
        if (!statLine && logged.rpe == null && !feel) return null
        return (
          <div className="px-2 pb-1.5 pt-0.5 min-w-0">
            {statLine && (
              <div className="athletic-mono truncate" style={{ color: P.ink, fontSize: 10, fontWeight: 700 }}>
                {statLine}
              </div>
            )}
            {(logged.rpe != null || feel) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {logged.rpe != null && (() => {
                  const m = rpeMeta(logged.rpe)
                  return (
                    <span
                      className="athletic-mono inline-flex items-center gap-1"
                      style={{
                        background: m.bg, color: m.color, fontSize: 9, fontWeight: 900,
                        letterSpacing: '0.06em', padding: '1px 6px', borderRadius: 999,
                      }}
                    >
                      {logged.rpe} {m.label.toUpperCase()}
                    </span>
                  )
                })()}
                {feel && (
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 9, color: P.inkMuted }}>
                    <feel.Icon size={11} /> {feel.label}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })()}
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
      // touchAction 'manipulation' (niet 'none'): scrollen moet vanaf een tegel
      // kunnen blijven starten; de drag activeert via lang indrukken (TouchSensor).
      // touchCallout onderdrukt de iOS-preview/het contextmenu bij lang indrukken.
      style={{
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
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
      style={{ background: P.control, border: `1px solid ${P.brand}`, color: P.ink, opacity: isDragging ? 0.5 : 1, touchAction: 'none', WebkitTouchCallout: 'none' }}
    >
      <GripVertical className="w-3.5 h-3.5" /> Sleep naar doeldag
    </button>
  )
}

// ─── Weektotalen (rechterkolom): gepland vs. gelogd per sport ────────────────

type TotCardio = { completedAt: string | Date; activity: string; durationSec: number; distanceM: number | null }
type TotSession = { scheduledAt: string | Date; completedAt: string | Date | null; duration: number | null }

function WeekTotals({ dates, itemsFor, cardio, sessions }: {
  dates: Date[]
  itemsFor: (d: Date) => ScheduleItem[]
  cardio: TotCardio[]
  sessions: TotSession[]
}) {
  const isoSet = new Set(dates.map(isoDate))
  const inWeek = (d: string | Date) => isoSet.has(isoDate(new Date(d)))

  // Gelogd, per sport-groep
  const log = {
    fiets: { m: 0, sec: 0, n: 0 },
    hardlopen: { m: 0, sec: 0, n: 0 },
    overig: { m: 0, sec: 0, n: 0 },
  }
  for (const c of cardio) {
    if (!inWeek(c.completedAt)) continue
    const g = log[activityGroup(c.activity)]
    g.m += c.distanceM ?? 0
    g.sec += c.durationSec
    g.n++
  }
  const krachtLogs = sessions.filter(se => se.completedAt && inWeek(se.scheduledAt))
  const krachtSec = krachtLogs.reduce((t, se) => t + (se.duration ?? 0), 0)

  // Gepland — alleen échte planner-items; gelogde synthetics zouden dubbel tellen.
  const plan = { fiets: 0, hardlopen: 0, overig: 0, krachtN: 0, krachtSec: 0 }
  for (const d of dates) {
    for (const it of itemsFor(d)) {
      if (!isWorkoutKind(it.kind)) continue
      if (it.id.startsWith('sessionlog-') || it.id.startsWith('cardiolog-')) continue
      if (it.quickCategory === 'CARDIO') {
        // Bewust `||` en niet `??`: bij cardio op afstand staat er wél een
        // durationSec, maar die is 0 (legacySummaryFields telt alleen tijd-
        // stappen). Met `??` won die nul en telde een duurloop van 29 km voor
        // nul minuten in de hardloop-strook.
        const sec = it.plannedDurationSec || it.cardioParams?.durationSec
          || it.quickDurationSec || cardioEstimate(it.cardioParams)?.durationSec || 0
        plan[activityGroup(it.cardioParams?.activity ?? it.quickActivity ?? null)] += sec
      } else {
        plan.krachtN++
        plan.krachtSec += it.plannedDurationSec ?? it.quickDurationSec ?? 0
      }
    }
  }

  const sportRow = (
    key: 'fiets' | 'hardlopen' | 'overig',
    Icon: (p: { size?: number }) => React.ReactNode,
    label: string,
  ) => {
    const l = log[key]
    const p2 = plan[key]
    if (l.n === 0 && p2 === 0) return null
    return (
      <div key={key} className="py-1.5 border-b last:border-b-0" style={{ borderColor: P.line }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span style={{ color: P.inkMuted }} className="shrink-0"><Icon size={11} /></span>
          <span className="athletic-mono text-[9px] tracking-wider truncate" style={{ color: P.inkDim }}>
            {label} · plan {p2 > 0 ? fmtClock(p2) : '—'}
          </span>
        </div>
        <div className="athletic-mono text-[10px] font-bold mt-0.5 pl-[17px]" style={{ color: l.n > 0 ? P.ink : P.inkDim }}>
          {l.n > 0
            ? [l.m > 0 ? fmtKmVal(l.m) : null, fmtClock(l.sec)].filter(Boolean).join(' · ')
            : 'niets gelogd'}
        </div>
        {key === 'hardlopen' && l.m > 0 && (
          <div className="athletic-mono text-[9px] pl-[17px]" style={{ color: P.inkMuted }}>
            {paceLabelFor(l.m, l.sec)}
          </div>
        )}
      </div>
    )
  }

  const leeg =
    log.fiets.n + log.hardlopen.n + log.overig.n + krachtLogs.length === 0 &&
    plan.fiets + plan.hardlopen + plan.overig + plan.krachtN === 0

  return (
    <div className="border-l px-2 py-1 min-w-0" style={{ borderColor: P.line, background: P.surfaceLow }}>
      {leeg ? (
        <div className="athletic-mono text-[9px] pt-1" style={{ color: P.inkDim }}>—</div>
      ) : (
        <>
          {sportRow('fiets', CARDIO_ICON_MAP.CYCLING ?? IconCardio, 'FIETS')}
          {sportRow('hardlopen', CARDIO_ICON_MAP.RUNNING ?? IconCardio, 'LOPEN')}
          {sportRow('overig', IconCardio, 'OVERIG')}
          {(krachtLogs.length > 0 || plan.krachtN > 0) && (
            <div className="py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span style={{ color: P.inkMuted }} className="shrink-0"><IconStrength size={11} /></span>
                <span className="athletic-mono text-[9px] tracking-wider truncate" style={{ color: P.inkDim }}>
                  KRACHT · plan {plan.krachtN > 0 ? `${plan.krachtN}×` : '—'}
                </span>
              </div>
              <div className="athletic-mono text-[10px] font-bold mt-0.5 pl-[17px]" style={{ color: krachtLogs.length > 0 ? P.ink : P.inkDim }}>
                {krachtLogs.length > 0
                  ? `${krachtLogs.length}×${krachtSec > 0 ? ` · ${fmtClock(krachtSec)}` : ''}`
                  : 'niets gelogd'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Dag-cel (droppable + selectie + +menu) ──────────────────────────────────

function DayCell({
  date, inMonth, isToday, info, weekLabel,
  selected, onSelectStart, onSelectEnter,
  onAddWorkout, onAddTemplate, onCopyDay,
  onItemClick, onRemoveItem, statusFor, sessionIdFor, loggedFor, movedToFor, openItemId,
  readOnly = false,
}: {
  date: Date
  inMonth: boolean
  isToday: boolean
  info: { dayId?: string | null; weekNumber?: number | null; items: ScheduleItem[] } | undefined
  weekLabel: number | null
  selected: boolean
  onSelectStart: (iso: string, pointerType?: string) => void
  onSelectEnter: (iso: string) => void
  onAddWorkout: (date: Date) => void
  onAddTemplate: (date: Date) => void
  onCopyDay: (iso: string) => void
  onItemClick: (item: ScheduleItem, date: Date, dayId: string | null, sessionId: string | null) => void
  onRemoveItem: (item: ScheduleItem, dayId: string | null) => void
  statusFor: (date: Date, item: ScheduleItem) => ItemStatus
  sessionIdFor: (date: Date, item: ScheduleItem) => string | null
  loggedFor: (date: Date, item: ScheduleItem) => LoggedInfo | null
  movedToFor: (date: Date, item: ScheduleItem) => string | null
  openItemId: string | null
  /** Gearchiveerde patiënt: geen toevoeg-menu, geen verwijderkruis, niet slepen. */
  readOnly?: boolean
}) {
  const iso = isoDate(date)
  const { setNodeRef, isOver } = useDroppable({ id: `day:${iso}`, data: { iso } })
  const items = info?.items ?? []
  const dayId = info?.dayId ?? null

  return (
    <div
      ref={setNodeRef}
      className="rounded-xl p-2 flex flex-col gap-1 group/cell relative select-none min-w-0"
      style={{
        ...(inMonth ? CARD : { background: 'transparent' }),
        opacity: inMonth ? 1 : 0.4,
        minHeight: 130,
        outline: selected ? `2px solid ${P.brand}` : isOver ? `2px dashed ${P.brand}` : 'none',
        outlineOffset: -2,
      }}
      onPointerDown={inMonth ? (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        if ((e.target as HTMLElement).closest('[data-noselect]')) return
        onSelectStart(iso, e.pointerType)
      } : undefined}
      onPointerEnter={inMonth ? () => onSelectEnter(iso) : undefined}
    >
      <div className="flex items-center justify-between">
        {/* Dagnummer in brand-oranje als warm accent; vandaag als gevulde chip
            zodat die ondanks de oranje nummers blijft opvallen. */}
        <span
          className={cn('text-xs athletic-mono font-bold', isToday && 'px-1.5 py-px rounded-md')}
          style={{
            color: isToday ? P.bg : inMonth ? P.ink : P.inkMuted,
            background: isToday ? P.ink : undefined,
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
          const logged = loggedFor(date, item)
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
              logged={logged}
              movedTo={movedToFor(date, item)}
              onRemove={() => onRemoveItem(item, dayId)}
              // Markeringen (rustdag/notitie/test/doel) hebben geen oefeningen
              // of cardio, dus het detail-paneel heeft ze niets te tonen.
              onClick={isCardioLog || !isWorkoutKind(item.kind) ? undefined : () => onItemClick(item, date, dayId, sId)}
              readOnly={readOnly || item.id.startsWith('sessionlog-') || isCardioLog}
              isOpen={item.id === openItemId}
            />
          )
          return realItem && !readOnly
            ? <DraggableItem key={item.id} item={item} fromIso={iso}>{tile}</DraggableItem>
            : <div key={item.id} data-noselect className="w-full min-w-0">{tile}</div>
        })}
      </div>
      {inMonth && !readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-noselect
              className={cn(
                // Alleen tonen bij hover/focus of als de dag nog leeg is — zo
                // is de kalender geen muur van identieke +Workout-knoppen meer.
                'transition-opacity self-start text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer mbt-btn-hover focus:opacity-100 group-hover/cell:opacity-100',
                // Touch (iPad) kent geen hover — daar altijd zichtbaar houden.
                items.length === 0 ? 'opacity-40' : 'opacity-0 pointer-coarse:opacity-40',
              )}
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
    weightsPerSet: unknown
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

function ItemDetailContent({
  detail, onClose, showClose = false,
  onSaveTemplate, onCopy, onSaveQuick, onSaveExercises, onBuildCardio,
  savingTemplate, copying, savingExercises, readOnly = false,
}: {
  detail: DetailItem
  onClose: () => void
  showClose?: boolean
  /**
   * Gearchiveerde patiënt: alles wat de planning van deze patiënt verandert
   * verdwijnt. "Opslaan als schema" blijft staan, want dat schrijft naar je
   * eigen bibliotheek en niet naar dit dossier.
   */
  readOnly?: boolean
  onSaveTemplate: () => void
  onCopy: () => void
  onSaveQuick: (patch: { quickName?: string; quickDurationSec?: number; plannedRpe?: number | null }) => Promise<void>
  onSaveExercises: (itemId: string, exercises: ReturnType<typeof toItemExercisePayload>[]) => Promise<void>
  /** Opent de blokken-bouwer als volledig scherm — het zijpaneel is te smal. */
  onBuildCardio: (item: ScheduleItem) => void
  savingTemplate: boolean
  copying: boolean
  savingExercises: boolean
}) {
  const catColors = useCategoryColors()
  const portal = usePortal()
  const { item, date, sessionId } = detail
  const isProgram = !!item.programId
  const category: Category = item.quickCategory ?? 'STRENGTH'
  const color = catColors[category]
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

  // Staat er inhoud op dit item? Dan is de duur afgeleid en niet meer iets dat
  // je los intikt.
  const hasContent = (item.exercises?.length ?? 0) > 0 || item.plannedDurationSec != null
  // Zelfde regel als de tegel: de inhoud wint van wat er is ingetikt.
  const durationSec = item.plannedDurationSec ?? item.quickDurationSec
  // Bij cardio leidt setItemCardio de RPE af uit de zones; dan is 'm hier laten
  // kiezen een keuze die bij het volgende opslaan verdwijnt.
  const rpeIsDerived = item.quickCategory === 'CARDIO' && item.plannedRpe != null

  // Quick-edit state
  const [editing, setEditing] = useState(false)
  const [eName, setEName] = useState(item.quickName ?? '')
  const [eMinutes, setEMinutes] = useState(String(Math.round((item.quickDurationSec ?? 1800) / 60)))
  // null = geen voorschrift → planned-load leidt de RPE af uit de categorie.
  const [eRpe, setERpe] = useState<number | null>(item.plannedRpe ?? null)
  const [savingQuick, setSavingQuick] = useState(false)

  async function submitQuick() {
    if (!eName.trim()) { toast.error('Naam is verplicht'); return }
    const minutes = Math.max(1, Math.min(720, Number(eMinutes) || 30))
    setSavingQuick(true)
    try {
      await onSaveQuick({
        quickName: eName.trim(),
        // Duur alleen meesturen als de therapeut 'm zelf bepaalt; anders is
        // hij afgeleid uit de inhoud en zou dit 'm overschrijven.
        ...(hasContent ? {} : { quickDurationSec: minutes * 60 }),
        ...(rpeIsDerived ? {} : { plannedRpe: eRpe }),
      })
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
          {durationSec ? <span>· {fmtDuration(durationSec)}</span> : null}
        </div>

        {/* Acties */}
        <div className="flex flex-wrap gap-2">
          {!readOnly && (isProgram ? (
            <DarkButton
              variant="secondary"
              size="sm"
              href={item.programId ? `${portal.base}/programs/${item.programId}/edit` : undefined}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Snel bewerken
            </DarkButton>
          ) : (
            <DarkButton variant="secondary" size="sm" onClick={() => setEditing(v => !v)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Snel bewerken
            </DarkButton>
          ))}
          <DarkButton variant="secondary" size="sm" onClick={onSaveTemplate} disabled={savingTemplate}>
            <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" /> {savingTemplate ? 'Opslaan…' : 'Opslaan als schema'}
          </DarkButton>
          {!readOnly && (
            <DarkButton variant="secondary" size="sm" onClick={onCopy} disabled={copying}>
              <CopyPlus className="w-3.5 h-3.5 mr-1.5" /> {copying ? 'Kopiëren…' : 'Kopiëren'}
            </DarkButton>
          )}
        </div>
        {readOnly && (
          <p className="text-[11px] leading-relaxed" style={{ color: P.inkDim }}>
            Deze patiënt staat in je archief, dus de planning is alleen om terug te lezen. Opslaan
            als schema kan wel: dat zet de workout in je eigen bibliotheek.
          </p>
        )}

        {/* Quick inline-edit */}
        {editing && !isProgram && !readOnly && (
          <Tile>
            <div className="space-y-2">
              <div>
                <MetaLabel>Naam</MetaLabel>
                <DarkInput className="mt-1" value={eName} onChange={e => setEName(e.target.value)} disabled={savingQuick} />
              </div>
              <div>
                <MetaLabel>Duur (minuten)</MetaLabel>
                {hasContent ? (
                  // Er staat inhoud: die bepaalt de duur. Een invoerveld hier zou
                  // een getal accepteren dat vervolgens genegeerd wordt.
                  <>
                    <div
                      className="mt-1 px-3 py-2 rounded-lg text-sm athletic-mono"
                      style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.inkMuted }}
                    >
                      {Math.round((item.plannedDurationSec ?? 0) / 60)} min
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: P.inkDim }}>
                      Volgt uit {item.quickCategory === 'CARDIO' ? 'de blokken' : 'de oefeningen'}, pas die aan om de duur te wijzigen.
                    </p>
                  </>
                ) : (
                  <DarkInput className="mt-1" type="number" min={1} max={720} value={eMinutes} onChange={e => setEMinutes(e.target.value)} disabled={savingQuick} />
                )}
              </div>
              <div>
                <MetaLabel>Doel-RPE {rpeIsDerived ? '' : '(optioneel)'}</MetaLabel>
                {rpeIsDerived ? (
                  // Cardio: de zones in de blokken bepalen de RPE. Een keuze
                  // hier werd bij het volgende opslaan van de blokken stil
                  // overschreven — dan is een keuze aanbieden misleidend.
                  <>
                    <div
                      className="mt-1 px-3 py-2 rounded-lg text-sm athletic-mono"
                      style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.inkMuted }}
                    >
                      RPE {item.plannedRpe}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: P.inkDim }}>
                      Volgt uit de zones in de blokken.
                    </p>
                  </>
                ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => setERpe(null)}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold transition-colors"
                    style={{
                      background: eRpe === null ? P.control : 'transparent',
                      color: eRpe === null ? P.ink : P.inkMuted,
                      border: `1px solid ${eRpe === null ? P.lineStrong : P.line}`,
                    }}
                  >
                    Schat
                  </button>
                  {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setERpe(n)}
                      className="w-6 h-6 rounded-md text-[11px] font-semibold transition-colors"
                      style={{
                        background: eRpe === n ? `color-mix(in srgb, ${P.lime} 13%, transparent)` : 'transparent',
                        color: eRpe === n ? P.lime : P.inkMuted,
                        border: `1px solid ${eRpe === n ? P.lime : P.line}`,
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                )}
                {!rpeIsDerived && (
                  <p className="text-[10px] mt-1" style={{ color: P.inkDim }}>
                    Bepaalt samen met de duur de weekbelasting (duur × RPE). &quot;Schat&quot; leidt 'm af uit het type.
                  </p>
                )}
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
                  const c = catColors[cat]
                  const setLine = pe.sets && pe.reps ? `${pe.sets} × ${pe.reps}${pe.repUnit ? ` ${pe.repUnit}` : ''}` : pe.sets ? `${pe.sets} sets` : '—'
                  return (
                    <div
                      key={pe.id}
                      className="rounded-lg p-2.5 text-xs"
                      style={{...CARD, borderLeft: `3px solid ${c}`}}
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
              <CardioSummary
                item={item}
                onBuild={readOnly ? null : () => onBuildCardio(item)}
              />
            ) : readOnly ? (
              // De bouwer is één groot invoerscherm; read-only is dat een lijst.
              <PlannedExerciseList exercises={item.exercises ?? []} />
            ) : (
              <QuickExerciseBuilder
                key={item.id}
                initial={item.exercises ?? []}
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
                  const c = catColors[cat]
                  const setLine = log.setsCompleted && log.repsCompleted
                    ? `${log.setsCompleted} × ${log.repsCompleted}`
                    : log.setsCompleted ? `${log.setsCompleted} sets`
                    : log.duration ? fmtDuration(log.duration) : '—'
                  const weightLine = formatWeightsPerSet(log.weightsPerSet, log.weight)
                  return (
                    <div
                      key={log.id}
                      className="rounded-lg p-2.5 text-xs"
                      style={{...CARD, borderLeft: `3px solid ${c}`}}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: c }} className="shrink-0"><CategoryIcon category={cat} size={12} /></span>
                        <span className="font-semibold flex-1 truncate" style={{ color: P.ink }}>{log.exercise.name}</span>
                        <span className="athletic-mono font-bold" style={{ color: P.ink, fontSize: 11 }}>{setLine}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5" style={{ color: P.inkMuted, fontSize: 10 }}>
                        {weightLine ? <span className="inline-flex items-center gap-1"><IconScale size={11} /> {weightLine}</span> : null}
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

// ─── Week-instellingen: fase / deload / target / notitie ─────────────────────

type WeekMetaValues = {
  phaseType: PhaseType | null
  isDeload: boolean
  targetLoad: number | null
  weekNote: string | null
}

function WeekMetaDialog({
  weekNumber, initial, saving, onClose, onSave,
}: {
  weekNumber: number
  initial: { phaseType: string | null; isDeload: boolean; targetLoad: number | null; weekNote: string | null } | null
  saving: boolean
  onClose: () => void
  onSave: (vals: WeekMetaValues) => Promise<void>
}) {
  const [phaseType, setPhaseType] = useState<PhaseType | null>(
    (initial?.phaseType as PhaseType | null) ?? null,
  )
  const [isDeload, setIsDeload] = useState(initial?.isDeload ?? false)
  const [targetLoad, setTargetLoad] = useState<string>(
    initial?.targetLoad != null ? String(initial.targetLoad) : '',
  )
  const [weekNote, setWeekNote] = useState(initial?.weekNote ?? '')

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Week {weekNumber}, fase &amp; belasting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <MetaLabel>Trainingsfase</MetaLabel>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setPhaseType(null)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{
                  background: phaseType === null ? P.control : 'transparent',
                  color: phaseType === null ? P.ink : P.inkMuted,
                  border: `1px solid ${phaseType === null ? P.lineStrong : P.line}`,
                }}
              >
                Geen
              </button>
              {PHASE_TYPES.map(pt => {
                const active = phaseType === pt
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPhaseType(pt)}
                    title={PHASE_META[pt].description}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5"
                    style={{
                      background: active ? `color-mix(in srgb, ${P.brand} 14%, transparent)` : 'transparent',
                      color: active ? P.brand : P.inkMuted,
                      border: `1px solid ${active ? P.brand : P.line}`,
                    }}
                  >
                    {PHASE_META[pt].label}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDeload(v => !v)}
            className="flex items-center gap-2 w-full text-left"
          >
            <span
              className="w-9 h-5 rounded-full relative transition-colors shrink-0"
              style={{ background: isDeload ? P.brand : P.lineStrong }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-[var(--p-ink)] transition-transform"
                style={{ transform: isDeload ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </span>
            <span className="flex items-center gap-1.5 text-sm" style={{ color: P.ink }}>
              <Moon className="w-3.5 h-3.5" style={{ color: P.inkMuted }} />
              Deload-week (herstel)
            </span>
          </button>

          <div>
            <MetaLabel>Geplande weekbelasting (optioneel)</MetaLabel>
            <DarkInput
              type="number"
              inputMode="numeric"
              placeholder="bijv. 350"
              value={targetLoad}
              onChange={(e) => setTargetLoad(e.target.value)}
              className="mt-1.5"
            />
            <p className="text-[11px] mt-1" style={{ color: P.inkDim }}>
              sRPE-stijl richtpunt, verschijnt naast de gerealiseerde belasting.
            </p>
          </div>

          <div>
            <MetaLabel>Week-notitie (optioneel)</MetaLabel>
            <DarkTextarea
              rows={2}
              placeholder="Doel of aandachtspunt voor deze week…"
              value={weekNote}
              onChange={(e) => setWeekNote(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DarkButton variant="secondary" onClick={onClose} className="text-xs">Annuleren</DarkButton>
            <DarkButton
              disabled={saving}
              onClick={() => onSave({
                phaseType,
                isDeload,
                targetLoad: targetLoad.trim() === '' ? null : Math.max(0, Math.round(Number(targetLoad))),
                weekNote: weekNote.trim() === '' ? null : weekNote.trim(),
              })}
              className="text-xs"
            >
              {saving ? 'Opslaan…' : 'Opslaan'}
            </DarkButton>
          </div>
        </div>
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
  const portal = usePortal()
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
    router.replace(`${portal.base}/week-planner?${p.toString()}`)
  }
  function navMonth(delta: number) {
    const d = new Date(year, month0 + delta, 1)
    setUrl({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
  }
  function navToday() {
    setUrl({ month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` })
  }

  // ─ Data ─
  const { data: patientsRaw = [] } = trpc.patients.list.useQuery(
    { include: 'all' },
    { staleTime: 60_000 },
  )
  const patients: Patient[] = patientsRaw.map(p => ({
    id: p.id, name: p.name, email: p.email, dischargedAt: p.dischargedAt,
  }))
  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null

  /**
   * Planning aanpassen kan niet meer voor een gearchiveerde patiënt.
   *
   * Dit is geen cosmetische keuze. De leeskant knipt al: `patient.calendarRange`
   * geeft vanaf de maandag ná het ontslag niets meer terug, dus wat je hier
   * inplant komt nooit op het toestel van de patiënt. De schrijf-guards op de
   * server zitten alleen op de bulkplanners (`planTemplates.applyToPatient`,
   * `weekSchedules.scheduleProgram`, `programs.create`, `programs.duplicate`);
   * losse item-mutaties als `addItem`, `setItemExercises`, `copyDayItems` en
   * `reorderItems` slagen gewoon. Zonder deze vlag plant een therapeut dus een
   * week in, ziet die in zijn eigen planner staan, krijgt geen enkele
   * foutmelding, en gebeurt er bij de patiënt niets.
   *
   * Wat WEL blijft werken: "Opslaan als schema" in het item-paneel. Dat
   * schrijft naar je eigen bibliotheek en niet naar dit dossier, en is juist bij
   * een afgerond traject nuttig. "Opslaan als plan" valt er wel uit, want dat
   * hangt aan de dagselectie en die dient verder alleen om te kopiëren en te
   * verslepen.
   */
  const patientGearchiveerd = !!selectedPatient?.dischargedAt
  /**
   * Op slot zolang we niet kunnen zien dát deze patiënt actief is.
   *
   * Dat dekt twee gevallen. Tijdens de eerste render is `patients` nog leeg en
   * zou de planner een halve seconde volledig bewerkbaar zijn, ook voor iemand
   * uit het archief. En een `?patientId=` in de URL kan wijzen naar iemand die
   * niet in je lijst staat; daar slagen de mutaties toch niet, dus ontbrekende
   * knoppen zijn een eerlijker antwoord dan een foutmelding achteraf.
   *
   * De uitleg-banner hangt bewust aan `patientGearchiveerd` en niet hieraan:
   * zolang de lijst laadt weten we niet of "staat in je archief" waar is.
   */
  const planningVergrendeld = patientGearchiveerd || (!!selectedPatientId && !selectedPatient)

  // Datumvenster voor de planner-queries: de zichtbare maand + 2 weken marge
  // aan beide kanten (het grid toont aanloop-/uitloopdagen van aangrenzende
  // maanden). Zonder venster laadde de planner de volledige patiënt-historie,
  // die elke behandelweek verder groeit. Weken zonder startDate (legacy)
  // komen server-side altijd mee.
  const plannerWindow = useMemo(() => ({
    from: new Date(year, month0, 1 - 14).toISOString(),
    to: new Date(year, month0 + 1, 15).toISOString(),
  }), [year, month0])
  // Eén gedeelde key: ook de optimistic updates (reorderItems) en de
  // fetch-na-create moeten op exact deze cache-entry werken.
  const schedulesKey = useMemo(
    () => ({ patientId: selectedPatientId, isTemplate: false, ...plannerWindow }),
    [selectedPatientId, plannerWindow],
  )

  const { data: schedules = [] } = trpc.weekSchedules.listWithItems.useQuery(
    selectedPatientId ? schedulesKey : undefined,
    { enabled: !!selectedPatientId, staleTime: 10_000 },
  )
  // Oefeningen + cardio-params per item (apart van listWithItems om TS2589 te
  // vermijden). Gegroepeerd op itemId voor merge in dateMap.
  const { data: itemContents = [], isFetched: contentsLoaded } = trpc.weekSchedules.listItemContents.useQuery(
    selectedPatientId ? { patientId: selectedPatientId, ...plannerWindow } : { patientId: '' },
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
  const duplicateItem = trpc.weekSchedules.duplicateItem.useMutation({
    onSuccess: () => {
      utils.weekSchedules.listWithItems.invalidate()
      utils.weekSchedules.listItemContents.invalidate()
      toast.success('Workout gekopieerd op deze dag')
    },
    onError: (e) => toast.error(e.message),
  })
  const duplicateWeek = trpc.weekSchedules.duplicateWeek.useMutation({
    onSuccess: () => { utils.weekSchedules.listWithItems.invalidate(); toast.success('Week gedupliceerd') },
    onError: (err) => toast.error(err.message ?? 'Dupliceren mislukt'),
  })
  const setWeekMeta = trpc.weekSchedules.setWeekMeta.useMutation({
    onSuccess: () => { utils.weekSchedules.listWithItems.invalidate() },
    onError: (err) => toast.error(err.message ?? 'Opslaan mislukt'),
  })
  const reorderItems = trpc.weekSchedules.reorderItems.useMutation({
    // Optimistic: verplaats het item meteen in de cache zodat de tegel direct
    // mee-springt; server reconcilieert op de achtergrond.
    onMutate: async (vars) => {
      const key = schedulesKey
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
      toast.success('Opgeslagen als schema, staat nu in Programma’s')
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
    exertionLevel: number | null
    feelScore: number | null
    /** Gevuld = deze sessie hoort bij een gepland item. */
    weekScheduleDayItemId?: string | null
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
    /** Gevuld = deze cardio hoort bij een gepland item. */
    weekScheduleDayItemId?: string | null
  }> }

  /** Status van een afgeronde SessionLog: deels (eerder gestopt) of voltooid. */
  function doneStatus(s: { completedAll: boolean }): ItemStatus {
    return s.completedAll === false ? 'partial' : 'completed'
  }

  // Map (programId, dateISO) → { status, sessionId }. sessionId wordt
  // gebruikt voor de session-detail modal wanneer therapeut op een tile klikt.
  /** `completedIso` = de dag waarop de log écht is afgerond. Wijkt die af van
   *  de dag waarop het item gepland staat, dan is de workout verplaatst. */
  type SessionMatch = { status: ItemStatus; sessionId: string | null; cardioId?: string | null; completedIso?: string | null }
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
      const prio: Record<ItemStatus, number> = { completed: 5, partial: 4, in_progress: 3, scheduled: 2, moved: 2, missed: 1 }
      if (!prev || prio[status] > prio[prev.status]) {
        map.set(key, { status, sessionId: s.id, completedIso: s.completedAt ? isoDate(new Date(s.completedAt)) : null })
      }
    }
    return map
  }, [sessionsRaw])

  /**
   * Sessies die exact aan een gepland item hangen. Dit is de betrouwbare
   * koppeling; `sessionByKey` (programId + datum) en `adhocStatusById` (teller
   * per dag) zijn de oude heuristiek, die nog nodig blijft voor sessies van
   * vóór deze kolom en voor iOS, dat het item nog niet meestuurt.
   */
  const sessionByItemId = useMemo(() => {
    const todayStart = startOfDay(new Date())
    const map = new Map<string, SessionMatch>()
    for (const s of sessionsRaw) {
      const itemId = (s as { weekScheduleDayItemId?: string | null }).weekScheduleDayItemId
      if (!itemId) continue
      let status: ItemStatus
      if (s.completedAt) status = doneStatus(s)
      else if (s.status === 'IN_PROGRESS') status = 'in_progress'
      else if (s.status === 'SKIPPED' || new Date(s.scheduledAt) < todayStart) status = 'missed'
      else status = 'scheduled'
      const prev = map.get(itemId)
      const prio: Record<ItemStatus, number> = { completed: 5, partial: 4, in_progress: 3, scheduled: 2, moved: 2, missed: 1 }
      if (!prev || prio[status] > prio[prev.status]) {
        map.set(itemId, { status, sessionId: s.id, completedIso: s.completedAt ? isoDate(new Date(s.completedAt)) : null })
      }
    }
    return map
  }, [sessionsRaw])

  /**
   * Een afgeronde workout hoort op de dag waarop hij gedaan is. Staat het item
   * op een andere dag, dan is die dag geen "voltooid" maar een spoor: de tegel
   * met de echte data staat elders in de kalender.
   */
  function verplaatstOf(m: SessionMatch, iso: string): ItemStatus {
    if (m.status !== 'completed' && m.status !== 'partial') return m.status
    return m.completedIso && m.completedIso !== iso ? 'moved' : m.status
  }

  /** Naar welke dag is dit item verplaatst? Null = staat gewoon op zijn plek. */
  function movedToFor(date: Date, item: ScheduleItem): string | null {
    if (!isWorkoutKind(item.kind)) return null
    const iso = isoDate(date)
    const m = sessionByItemId.get(item.id)
      ?? (item.programId ? sessionByKey.get(`${item.programId}|${iso}`) : adhocStatusById.get(item.id))
    if (!m || verplaatstOf(m, iso) !== 'moved') return null
    return m.completedIso ?? null
  }

  function statusFor(date: Date, item: ScheduleItem): ItemStatus {
    // Markeringen zijn geen workout: een notitie kan niet "gemist" zijn.
    if (!isWorkoutKind(item.kind)) return 'scheduled'
    // Exacte koppeling wint van elke heuristiek.
    const byItem = sessionByItemId.get(item.id)
    if (byItem) return verplaatstOf(byItem, isoDate(date))
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
    if (match) return verplaatstOf(match, isoDate(date))
    // Geen log gevonden: in het verleden = gemist, anders gewoon gepland.
    return startOfDay(date) < startOfDay(new Date()) ? 'missed' : 'scheduled'
  }

  /** Geef het bijbehorende SessionLog-id terug zodat klikken op een gedane
   *  tile de detail-modal kan openen. Voor sessionlog-prefixed items zit
   *  het id in de prefix; voor andere items lookup via sessionByKey. */
  function sessionIdFor(date: Date, item: ScheduleItem): string | null {
    const byItem = sessionByItemId.get(item.id)
    if (byItem) return byItem.sessionId
    if (item.id.startsWith('sessionlog-')) {
      return item.id.slice('sessionlog-'.length)
    }
    if (!item.programId) return adhocStatusById.get(item.id)?.sessionId ?? null
    return sessionByKey.get(`${item.programId}|${isoDate(date)}`)?.sessionId ?? null
  }

  /** Gelogde data (afstand/duur/RPE/gevoel) voor een tegel — voor de rijke
   *  weergave ná het loggen, zoals in trainingskalenders. */
  function loggedInfoFor(date: Date, item: ScheduleItem): LoggedInfo | null {
    if (!isWorkoutKind(item.kind)) return null
    // Ad-hoc cardio-tegel: het log-id zit in het tile-id.
    if (item.id.startsWith('cardiolog-')) {
      const c = cardioRaw.find(x => x.id === item.id.slice('cardiolog-'.length))
      return c
        ? { kind: 'cardio', activity: c.activity, distanceM: c.distanceM, durationSec: c.durationSec, rpe: c.rpe }
        : null
    }
    // Gepland cardio-item met gematchte CardioLog (adhoc-matching).
    const adhoc = adhocStatusById.get(item.id)
    if (adhoc?.cardioId) {
      const c = cardioRaw.find(x => x.id === adhoc.cardioId)
      if (c) return { kind: 'cardio', activity: c.activity, distanceM: c.distanceM, durationSec: c.durationSec, rpe: c.rpe }
    }
    // Kracht/programma: de gekoppelde SessionLog.
    const sid = sessionIdFor(date, item)
    if (sid) {
      const sLog = sessionsRaw.find(x => x.id === sid)
      if (sLog?.completedAt) {
        return { kind: 'strength', durationSec: sLog.duration, rpe: sLog.exertionLevel, feel: sLog.feelScore }
      }
    }
    return null
  }

  // Schedule dag-info gemapt op ISO-datum.
  type DayCellInfo = {
    dayId: string | null            // null als nog geen schedule bestaat voor die week
    weekScheduleId: string | null
    weekNumber: number | null
    items: ScheduleItem[]
  }
  const { dateMap, adhocStatusById, weekAnchor } = useMemo(() => {
    const map = new Map<string, DayCellInfo>()
    // Status per quick-item-id (geen programId → geen sessionByKey-match):
    // gevuld door cardio- en losse-sessie-matching hieronder.
    const adhocStatusById = new Map<string, SessionMatch>()
    // Anker (maandag van week `baselineWeekNumber`) — hiermee kan de UI ook
    // voor LEGE kalenderrijen het weekNumber afleiden, zodat je een fase op
    // een toekomstige week kunt zetten vóór er workouts staan.
    let weekAnchor: { monday: Date; weekNumber: number } | null = null

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
      weekAnchor = { monday: baseline, weekNumber: baselineWeekNumber }

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
              kind: (it.kind ?? (it.programId ? 'PROGRAM' : 'WORKOUT')) as ItemKind,
              programId: it.programId,
              program: it.program ?? null,
              quickCategory: (it.quickCategory ?? null) as Category | null,
              quickActivity: (it.quickActivity ?? null) as CardioActivityKey | null,
              quickName: it.quickName,
              quickDurationSec: it.quickDurationSec,
              plannedDurationSec: it.plannedDurationSec ?? null,
              plannedRpe: it.plannedRpe ?? null,
              testBattery: it.testBattery ?? null,
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
              kind: 'PROGRAM',
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
    // werkt niet. Dezelfde regels als de atleet-kalender — zie
    // lib/planned-matching, daar staan ook de tests: identiteit eerst, dan
    // alleen nog logs die nergens aan hangen, en een item dat een activiteit
    // noemt gaat vóór generieke cardio. Zonder dat laatste markeerde een
    // gelogde duurloop het geplande fietsritje van dezelfde dag als voltooid.
    // Per verbruikte log: op wélke dag stond het item dat hem afvinkt.
    // Nodig omdat een log en zijn geplande item niet op dezelfde dag hoeven te
    // vallen (gisteren gepland, vandaag gedaan).
    const consumedSessionIso = new Map<string, string>()
    const consumedCardioIso = new Map<string, string>()

    const plannedEntries: PlannedEntry[] = []
    const itemByKey = new Map<string, { iso: string; item: ScheduleItem }>()
    for (const [iso, info] of map) {
      for (const item of info.items) {
        // Programma-items lopen via sessionByKey/sessionByItemId. Markeringen
        // (notitie, rustdag, test, doel) zijn geen workout en mogen dus ook
        // geen log opeten — die verdween dan uit de kalender, want stap 3/4
        // slaan verbruikte logs over.
        if (item.programId || !isWorkoutKind(item.kind)) continue
        const key = `${iso}:${item.id}`
        plannedEntries.push({
          key,
          iso,
          itemId: item.id.startsWith('legacy-') ? null : item.id,
          programId: null,
          category: item.quickCategory ?? 'STRENGTH',
          // De geplande activiteit staat in de opgebouwde cardio-blokken en
          // anders op de planner-tegel zelf. Zelfde volgorde als de
          // week-belastingberekening hierboven.
          activity: item.cardioParams?.activity ?? item.quickActivity ?? null,
        })
        itemByKey.set(key, { iso, item })
      }
    }

    const matches = matchLoggedPlanned(plannedEntries, {
      sessions: sessionsRaw
        .filter(s => s.completedAt)
        .map(s => ({
          id: s.id,
          iso: isoDate(new Date(s.scheduledAt)),
          programId: s.programId,
          itemId: s.weekScheduleDayItemId ?? null,
          completedAll: s.completedAll,
        })),
      cardio: cardioRaw.map(c => ({
        id: c.id,
        iso: isoDate(startOfDay(new Date(c.completedAt))),
        activity: c.activity,
        itemId: c.weekScheduleDayItemId ?? null,
        durationSec: c.durationSec,
      })),
    })

    for (const [key, hit] of matches) {
      const entry = itemByKey.get(key)
      if (!entry) continue
      const { iso: itemIso, item } = entry
      if (hit.source === 'cardio') {
        consumedCardioIso.set(hit.log.id, itemIso)
        // "Eerder gestopt" bij cardio: werkelijke duur duidelijk korter dan
        // gepland (de cardio-speler logt de echte verstreken tijd).
        const plannedSec = item.cardioParams?.durationSec ?? item.quickDurationSec
        const partial = !!plannedSec && hit.log.durationSec < plannedSec * 0.8
        adhocStatusById.set(item.id, {
          status: partial ? 'partial' : 'completed',
          sessionId: null,
          cardioId: hit.log.id,
          completedIso: hit.log.iso,
        })
      } else if (hit.source === 'session') {
        consumedSessionIso.set(hit.log.id, itemIso)
        adhocStatusById.set(item.id, {
          status: hit.log.completedAll === false ? 'partial' : 'completed',
          sessionId: hit.log.id,
          completedIso: hit.log.iso,
        })
      }
    }

    // ── 3. SessionLog-historie samenvoegen ──
    // Voor alle SessionLogs die NIET al via items[] gerepresenteerd worden,
    // voeg een synthetisch item toe. Dit toont historische sessies
    // (voltooid + ingepland-maar-niet-gepland-via-WeekPlanner) als read-only
    // tile in de juiste dag-cel.
    for (const session of sessionsRaw) {
      // Op de dag dat hij GEDAAN is. scheduledAt is bij een zelf-gelogde sessie
      // het startmoment (zelfde dag), maar bij een door de therapeut ingeplande
      // sessie de gepláánde dag — en daar hoort een afgeronde workout niet.
      const date = startOfDay(new Date(session.completedAt ?? session.scheduledAt))
      const iso = isoDate(date)
      // Afgevinkt tegen een gepland item op deze dag → dat item draagt de
      // status al. Hangt het item aan een andere dag, dan is de sessie hier
      // anders nergens te zien.
      if (consumedSessionIso.get(session.id) === iso) continue
      const existing = map.get(iso)

      // Skip als deze sessie al door een gepland item wordt weergegeven — dan
      // draagt dat item de status-kleur en zou een losse tegel hem verdubbelen.
      // Eerst op identiteit, dan op de oude programId-heuristiek.
      const linkedItemId = (session as { weekScheduleDayItemId?: string | null }).weekScheduleDayItemId
      const alreadyMatched = linkedItemId
        ? existing?.items.some(it => it.id === linkedItemId)
        : existing?.items.some(it =>
            it.programId !== null && it.programId === session.programId,
          )
      if (alreadyMatched) continue

      const synthetic: ScheduleItem = {
        id: `sessionlog-${session.id}`,
        order: 999,  // historisch → onderaan de cel
        // Gelogde sessie = altijd een workout, ook zonder programma-koppeling.
        kind: session.programId ? 'PROGRAM' : 'WORKOUT',
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
      const iso = isoDate(startOfDay(new Date(c.completedAt)))
      // Afgevinkt tegen een gepland item op dezelfde dag → dát item draagt de
      // status al, een losse tegel zou hem verdubbelen. Hoort de log bij een
      // item op een ándere dag (de duurloop van gisteren pas vandaag gedaan),
      // dan is de training op de dag zelf anders nergens te zien.
      if (consumedCardioIso.get(c.id) === iso) continue
      const synthetic: ScheduleItem = {
        id: `cardiolog-${c.id}`,
        order: 999,
        kind: 'WORKOUT',
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

    return { dateMap: map, adhocStatusById, weekAnchor }
  }, [schedules, sessionsRaw, cardioRaw, contentsByItem])

  // Periodiserings-metadata per weekNumber (fase/deload/target/notitie).
  const weekMetaByNumber = useMemo(() => {
    const m = new Map<number, {
      phaseType: string | null
      isDeload: boolean
      targetLoad: number | null
      weekNote: string | null
    }>()
    for (const ws of schedules) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = ws as any
      m.set(ws.weekNumber, {
        phaseType: w.phaseType ?? null,
        isDeload: w.isDeload ?? false,
        targetLoad: w.targetLoad ?? null,
        weekNote: w.weekNote ?? null,
      })
    }
    return m
  }, [schedules])

  // Gepland vs gedaan per weekNumber: tel echte geplande workouts en hoeveel
  // daarvan voltooid/deels zijn. Lichte proxy voor "weekbelasting" zonder een
  // volledige sRPE-berekening client-side.
  const weekProgressByNumber = useMemo(() => {
    const m = new Map<number, { planned: number; done: number }>()
    const bump = (week: number, veld: 'planned' | 'done') => {
      const cur = m.get(week) ?? { planned: 0, done: 0 }
      cur[veld]++
      m.set(week, cur)
    }
    for (const [iso, info] of dateMap) {
      if (info.weekNumber == null) continue
      for (const item of info.items) {
        const real = !item.id.startsWith('legacy-')
          && !item.id.startsWith('sessionlog-')
          && !item.id.startsWith('cardiolog-')
        if (!real) continue
        bump(info.weekNumber, 'planned')
        const st = statusFor(new Date(iso), item)
        if (st === 'completed' || st === 'partial') {
          bump(info.weekNumber, 'done')
        } else if (st === 'moved') {
          // Verplaatst: gepland blijft in deze week staan, gedaan telt in de
          // week waarin hij écht is uitgevoerd. Valt die dag buiten elk
          // schema-venster, dan telt hij nergens als gedaan.
          const doelIso = movedToFor(new Date(iso), item)
          const doelWeek = doelIso ? dateMap.get(doelIso)?.weekNumber : null
          if (doelWeek != null) bump(doelWeek, 'done')
        }
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMap])

  /**
   * Geplande belasting per week (sRPE = duur × RPE). Dit is wat `targetLoad` en
   * `phaseType` voor het eerst ergens over laat gaan: zonder dit getal is een
   * fase-label een sticker en geen plan. Zelfde eenheid als de gerealiseerde
   * load-curve, dus gepland en gehaald zijn vergelijkbaar.
   */
  const plannedLoadByWeek = useMemo(() => {
    const m = new Map<number, ReturnType<typeof sumPlannedLoad>>()
    const perWeek = new Map<number, ScheduleItem[]>()
    for (const info of dateMap.values()) {
      if (info.weekNumber == null) continue
      const bucket = perWeek.get(info.weekNumber) ?? []
      for (const item of info.items) {
        // Alleen écht geplande items: synthetische tegels van gelogde sessies
        // zijn realisatie, geen planning.
        const real = !item.id.startsWith('legacy-')
          && !item.id.startsWith('sessionlog-')
          && !item.id.startsWith('cardiolog-')
        if (real) bucket.push(item)
      }
      perWeek.set(info.weekNumber, bucket)
    }
    for (const [wn, items] of perWeek) {
      m.set(wn, sumPlannedLoad(items.map(i => ({
        kind: i.kind,
        plannedDurationSec: i.plannedDurationSec ?? null,
        plannedRpe: i.plannedRpe ?? null,
        quickCategory: i.quickCategory,
        quickDurationSec: i.quickDurationSec,
        // Zonder dit telt een duurloop die op afstand is voorgeschreven voor 0:
        // de duur zit alleen in de blokken. Zie cardioEstimate.
        cardioParams: i.cardioParams,
        exercises: i.exercises?.map(e => ({ sets: e.sets, reps: e.reps, repUnit: e.repUnit, restTime: e.restTime })),
      }))))
    }
    return m
  }, [dateMap])

  // Week-instellingen dialog (fase/deload/target/notitie per week).
  const [weekMetaOpen, setWeekMetaOpen] = useState<number | null>(null)

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
  // Het detail-paneel leest zijn oefeningen/cardio LIVE uit de query in
  // plaats van uit de momentopname van de klik. Wie sneller klikte dan
  // listItemContents laadde, kreeg anders een lege builder — en één keer
  // Opslaan wiste dan de hele lijst inclusief voorschrift.
  const liveDetail = useMemo(() => {
    if (!detailItem) return null
    const c = contentsByItem.get(detailItem.item.id)
    if (!c) return detailItem
    return {
      ...detailItem,
      item: { ...detailItem.item, exercises: c.exercises, cardioParams: c.cardioParams },
    }
  }, [detailItem, contentsByItem])

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
      const refreshed = await utils.weekSchedules.listWithItems.fetch(schedulesKey)
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

  // ─ Cardio-blokkenbouwer (volledig scherm) ─
  const [cardioBuilderItem, setCardioBuilderItem] = useState<ScheduleItem | null>(null)

  // ─ Plan-sjablonen ─
  const [applyPlanOpen, setApplyPlanOpen] = useState(false)
  const [savePlanRange, setSavePlanRange] = useState<{ from: string; to: string } | null>(null)

  // ─ Week-klembord (kopieer/knip/plak van hele weken) ─
  const [weekClipboard, setWeekClipboard] = useState<{
    mode: 'copy' | 'cut'
    monday: string
    patientId: string
    weekNum: number | null
  } | null>(null)

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
  function startSelection(iso: string, pointerType?: string) {
    // Dagen selecteren dient alleen om ze te kopiëren of te verslepen. Bij een
    // gearchiveerde patiënt kan dat niet, dus dan blijft de selectie-toolbar
    // ook weg in plaats van een blok knoppen dat niets doet.
    if (planningVergrendeld) return
    // Touch/pen (iPad): ingedrukt-slepen over cellen is daar scrollen, dus
    // selecteren gaat per tik — eerste tik ankert, een tik op een andere dag
    // breidt het bereik uit, een tik op het (enige) anker wist de selectie.
    if (pointerType === 'touch' || pointerType === 'pen') {
      if (selectAnchor.current && selectedIsos.size > 0) {
        if (iso === selectAnchor.current && selectedIsos.size === 1) { clearSelection(); return }
        setSelectedIsos(rangeIsos(selectAnchor.current, iso))
        return
      }
      selectAnchor.current = iso
      setSelectedIsos(new Set([iso]))
      return
    }
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

  /**
   * Van patiënt wisselen wist alles wat aan de vórige hing.
   *
   * Dit is geen opruimwerk maar de enige bescherming die er is. De
   * vergrendel-vlag rekent elke render opnieuw uit `selectedPatientId`, maar het
   * detailpaneel, de dagselectie, de cardio-bouwer en het week-klembord zijn
   * state die een wissel overleeft: `setUrl` verzet alleen de id, er is geen
   * remount en `liveDetail` blijft het item van de vorige patiënt teruggeven.
   *
   * Wat er zonder deze reset gebeurt: je opent een workout van een
   * gearchiveerde patiënt (het paneel opent vergrendeld, lezen mag) en kiest
   * daarna een actieve patiënt. De vlag gaat uit, het paneel toont nog steeds
   * het oude item, en "Snel bewerken", "Kopiëren" en de oefeningen-bouwer staan
   * weer aan. `updateItem`, `duplicateItem` en `setItemExercises` hebben géén
   * server-guard op de behandelstatus, dus die opslag slaagt gewoon: de kop
   * zegt B, de schrijfactie landt op het itemId van A.
   *
   * Zelfde verhaal voor de dagselectie. `startSelection` weigert een nieuwe
   * selectie bij een gearchiveerde patiënt, maar een selectie die je vóór de
   * wissel maakte bleef staan, inclusief de toolbar en "Opslaan als plan".
   *
   * De open dialogen gaan om dezelfde reden mee. De toevoeg-modal houdt een
   * `dayId` van de vorige patiënt vast (`addItem` schrijft dan in diens week),
   * en week-instellingen en "Plan toepassen" schrijven juist naar de nieuw
   * gekozen patiënt met waardes die je voor de vorige invulde. Wie van patiënt
   * wisselt begint opnieuw; dat is het enige gedrag dat niet stiekem verkeerd
   * kan aflopen.
   */
  useEffect(() => {
    setDetailItem(null)
    setPanelClosing(false)
    setCardioBuilderItem(null)
    setWeekClipboard(null)
    setSelectedIsos(new Set())
    selectAnchor.current = null
    selecting.current = false
    setAddOpen(false)
    setAddDayId(null)
    setAddDayDate(null)
    setWeekMetaOpen(null)
    setApplyPlanOpen(false)
    setSavePlanRange(null)
  }, [selectedPatientId])

  // Kalenderbereik van de huidige dag-selectie, als ISO-dagen. Bewust op datum
  // en niet op weekNumber: dat veld is in de praktijk vrijwel altijd 1 en
  // meerdere schedules delen het, dus het identificeert geen kalenderweek.
  const selectedWeekRange = useMemo(() => {
    if (selectedIsos.size === 0) return null
    const sorted = [...selectedIsos].sort()
    const from = sorted[0]
    const to = sorted[sorted.length - 1]
    const firstMonday = mondayOf(new Date(`${from}T00:00:00`))
    const lastMonday = mondayOf(new Date(`${to}T00:00:00`))
    const count = Math.round((lastMonday.getTime() - firstMonday.getTime()) / (7 * 864e5)) + 1
    return { from, to, count }
  }, [selectedIsos])

  // ─ Drag-drop (dnd-kit): item verplaatsen + dag-blok kopiëren ─
  // Muis: 6px afstand vóór activatie (klik blijft klik). Touch (iPad): lang
  // indrukken (250ms) — direct slepen zou vechten met scrollen; beweeg je
  // binnen de delay >8px dan wint scrollen en activeert de drag niet.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
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
    // Vangnet naast de uitgezette grepen: een drag die toch op gang komt mag
    // geen reorderItems/copyDayItems afvuren op een gearchiveerd dossier.
    if (planningVergrendeld) return
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
    // Server-side kopiëren: die neemt de oefeningen, de cardio-blokken, de
    // activiteit en de geplande belasting mee. De vorige versie bouwde hier een
    // nieuw quick-item uit naam/categorie/duur en gooide de rest weg.
    duplicateItem.mutate({ itemId: detailItem.item.id, toDayId: detailItem.dayId })
  }
  async function handleSaveQuick(patch: { quickName?: string; quickDurationSec?: number; plannedRpe?: number | null }) {
    if (!detailItem) return
    await updateItem.mutateAsync({ id: detailItem.item.id, ...patch })
    setDetailItem(d => d ? { ...d, item: { ...d.item, ...patch } } : d)
  }
  async function handleSaveItemExercises(
    itemId: string,
    exercises: ReturnType<typeof toItemExercisePayload>[],
  ) {
    await setItemExercises.mutateAsync({ itemId, exercises })
  }
  async function handleSaveItemCardio(itemId: string, params: PlannerCardioParams | null) {
    await setItemCardio.mutateAsync({ itemId, cardioParams: params })
  }

  async function handleAddSubmit(payload: AddItemPayload) {
    if (!addDayId) return
    await addItem.mutateAsync({ ...payload, dayId: addDayId } as Parameters<typeof addItem.mutateAsync>[0])
  }

  // Dupliceren gaat op DATUM (de maandag van de rij), niet op weekNumber: dat
  // veld is niet uniek per patiënt, waardoor de server een willekeurige
  // naamgenoot kon pakken en de verkeerde week kopieerde.
  // ─ Week-klembord: kopieer/knip een hele week en plak 'm op een doelweek.
  // Kopiëren laat het klembord staan zodat dezelfde week meerdere keren
  // geplakt kan worden; knippen leegt de bron en wist het klembord na plakken.
  function handleClipWeek(rowMonday: Date, weekNum: number | null, mode: 'copy' | 'cut') {
    if (!selectedPatientId) return
    setWeekClipboard({ mode, monday: isoDate(rowMonday), patientId: selectedPatientId, weekNum })
    toast.success(
      `Week ${mode === 'copy' ? 'gekopieerd' : 'geknipt'}, kies "Plak week hier" in het menu van de doelweek`,
    )
  }

  async function handlePasteWeek(rowMonday: Date) {
    const clip = weekClipboard
    if (!clip || !selectedPatientId) return
    const base = {
      patientId: clip.patientId,
      fromDate: clip.monday,
      toDate: isoDate(rowMonday),
      move: clip.mode === 'cut',
    }
    try {
      try {
        await duplicateWeek.mutateAsync({ ...base, replace: false })
      } catch (e) {
        // Doelweek heeft al inhoud → expliciet laten bevestigen, dan overschrijven.
        if (!(e instanceof Error) || !/bevat al items/i.test(e.message)) return
        if (!window.confirm('De doelweek bevat al workouts. Overschrijven?')) return
        await duplicateWeek.mutateAsync({ ...base, replace: true })
      }
      if (clip.mode === 'cut') setWeekClipboard(null)
    } catch {
      // duplicateWeek.onError toont de fout al als toast
    }
  }

  // Dupliceer een week en zet 'm meteen als deload: kopieert de workouts,
  // markeert deload en verlaagt de geplande belasting naar ~60% van de bron.
  function handleDuplicateWeekAsDeload(rowMonday: Date, weekNumber: number) {
    if (!selectedPatientId) return
    const srcTarget = weekMetaByNumber.get(weekNumber)?.targetLoad ?? null
    duplicateWeek.mutate({
      patientId: selectedPatientId,
      fromDate: isoDate(rowMonday),
      toDate: isoDate(addDays(rowMonday, 7)),
      replace: false,
      markDeload: true,
      phaseType: 'DELOAD',
      targetLoad: srcTarget != null ? Math.round(srcTarget * DELOAD_LOAD_FRACTION) : null,
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
          {/* Ook op de vergrendel-vlag: een selectie kan alleen ontstaan bij een
              actieve patiënt, maar een knop die na een wissel blijft hangen is
              precies waar het hierboven beschreven lek zat. */}
          {selectedPatientId && selectedWeekRange && !planningVergrendeld && (
            <DarkButton
              variant="secondary"
              onClick={() => setSavePlanRange({ from: selectedWeekRange.from, to: selectedWeekRange.to })}
              className="text-xs"
            >
              <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
              Opslaan als plan ({selectedWeekRange.count} {selectedWeekRange.count === 1 ? 'week' : 'weken'})
            </DarkButton>
          )}
          {selectedPatientId && !planningVergrendeld && (
            <DarkButton onClick={() => setApplyPlanOpen(true)} className="text-xs">
              <CalendarRange className="w-3.5 h-3.5 mr-1.5" />
              Plan toepassen
            </DarkButton>
          )}
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
            style={{...CARD, color: P.ink}}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={navToday}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
            style={{...CARD, color: P.ink}}
          >
            Vandaag
          </button>
          <button
            type="button"
            onClick={() => navMonth(1)}
            className="p-1.5 rounded-md transition-colors"
            style={{...CARD, color: P.ink}}
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
            ['moved', 'Verplaatst'],
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
          <div className="flex flex-col sm:flex-row items-center gap-4 py-5 px-2">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(232,122,85,0.12)', border: '1px solid rgba(232,122,85,0.30)' }}
            >
              <CalendarRange className="w-5 h-5" style={{ color: P.brand }} />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <p className="text-sm font-semibold" style={{ color: P.ink }}>
                Kies iemand hierboven, of bouw eerst een los schema
              </p>
              <p className="text-xs mt-0.5" style={{ color: P.inkMuted }}>
                Deze kalender hoort bij één persoon. Wil je een schema maken dat je later aan
                meerdere mensen geeft, begin dan met een trainingsplan: dat bouw je op genummerde
                weken, zonder datums.
              </p>
            </div>
            <DarkButton
              onClick={() => router.push(`${portal.base}/plans`)}
              className="gap-1.5 text-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Trainingsplan maken
            </DarkButton>
          </div>
        </Tile>
      ) : (
        <>
        {/* Gearchiveerd: één regel die zegt waarom er niets meer te klikken is.
            Zonder die regel lijkt de planner stuk in plaats van dicht. */}
        {patientGearchiveerd && (
          <Tile>
            <div className="flex items-start gap-3 py-1">
              <Archive className="w-4 h-4 mt-0.5 shrink-0" style={{ color: P.inkMuted }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: P.ink }}>
                  {selectedPatient?.name ?? 'Deze patiënt'} staat in je archief
                </p>
                <p className="text-xs mt-0.5" style={{ color: P.inkMuted }}>
                  De planning is alleen om terug te lezen: een gearchiveerde patiënt krijgt geen
                  nieuwe trainingen meer in de app te zien. Neem hem weer in behandeling om te
                  kunnen plannen.
                </p>
              </div>
            </div>
          </Tile>
        )}

        {/* Lege staat: patiënt gekozen maar nog geen enkel week-schema. Eén
            duidelijke CTA i.p.v. de gebruiker laten raden tussen de dagen. */}
        {schedules.length === 0 && !planningVergrendeld && (
          <Tile>
            <div className="flex flex-col sm:flex-row items-center gap-4 py-5 px-2">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(232,122,85,0.12)', border: '1px solid rgba(232,122,85,0.30)' }}
              >
                <CalendarRange className="w-5 h-5" style={{ color: P.brand }} />
              </div>
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <p className="text-sm font-semibold" style={{ color: P.ink }}>
                  Nog geen planning voor deze patiënt
                </p>
                <p className="text-xs mt-0.5" style={{ color: P.inkMuted }}>
                  Voeg een workout toe op een dag, of plan een programma in één
                  keer over meerdere weken als periodiseringsblok.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DarkButton
                  variant="secondary"
                  onClick={() => openAddModal(today, 'quick')}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Workout
                </DarkButton>
                <DarkButton
                  onClick={() => openAddModal(mondayOf(today), 'library')}
                  className="gap-1.5 text-xs"
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> Programma plannen
                </DarkButton>
              </div>
            </div>
          </Tile>
        )}


        {/* Selectie-toolbar: zichtbaar zodra er dagen geselecteerd zijn, en
            nooit bij een gearchiveerde patiënt. Slepen doet daar niets, dus een
            blok knoppen zonder effect is erger dan geen blok knoppen. */}
        {selectedIsos.size > 0 && !planningVergrendeld && (
          <div
            className="flex items-center gap-3 flex-wrap rounded-xl px-3 py-2 animate-in fade-in-0 slide-in-from-top-1 duration-200"
            style={{ background: P.surface, border: `1px solid ${P.brand}` }}
          >
            <span className="text-xs font-semibold" style={{ color: P.ink }}>
              {selectedIsos.size} dag{selectedIsos.size > 1 ? 'en' : ''} geselecteerd
            </span>
            <SelectionDragHandle isos={[...selectedIsos]} />
            <span className="text-[11px]" style={{ color: P.inkMuted }}>sleep naar een doeldag om te kopiëren</span>
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
        {/* Losse dagkaarten op de grond in plaats van één blok met scheidslijnen.
            De ruimte ertussen doet wat de lijnen deden, en elke dag wordt een
            eigen ding dat je kunt aanwijzen. */}
        <div className="flex flex-col gap-2">
          {/* Day-of-week header row */}
          <div className="grid grid-cols-[40px_repeat(7,1fr)_168px] gap-2 px-0.5">
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
            <div
              className="athletic-mono px-2 py-1.5 text-[10px] tracking-widest font-bold border-l"
              style={{ color: P.inkMuted, borderColor: P.line }}
            >
              WEEKTOTAAL
            </div>
          </div>

          {/* 6 week rows */}
          {grid.map((week, wIdx) => {
            // Bepaal weekNumber van deze rij voor 3-dots menu (kies de 1e dag in deze rij die in onze maand valt)
            const referenceDate = week.find(d => d.getMonth() === month0) ?? week[0]
            const info = dateMap.get(isoDate(referenceDate))
            // Bestaat er (nog) geen schema-rij voor deze week, leid het
            // weekNumber dan af van het anker — zo kun je óók op een lege
            // (toekomstige) week een fase zetten; setWeekMeta maakt de rij aan.
            const rowMonday = mondayOf(referenceDate)
            const derivedNum = weekAnchor
              ? weekAnchor.weekNumber + Math.round((rowMonday.getTime() - weekAnchor.monday.getTime()) / (7 * 86_400_000))
              : null
            const weekNum = info?.weekNumber ?? (derivedNum != null && derivedNum >= 1 ? derivedNum : null)
            const weekExists = info?.weekNumber != null
            const meta = weekNum != null ? weekMetaByNumber.get(weekNum) : undefined
            const progress = weekNum != null ? weekProgressByNumber.get(weekNum) : undefined
            const phase = phaseMeta(meta?.phaseType)
            // Fase-kleur bepaalt een subtiele tint links op de rij; deload wint
            // qua kleur zodat een herstelweek altijd herkenbaar blauw is.
            const accent = meta?.isDeload || phase ? true : null
            return (
              <div
                key={wIdx}
                className="grid grid-cols-[40px_repeat(7,1fr)_168px] gap-2"
                style={{
                  borderColor: P.line,
                  minHeight: 176,
                  // Fase is géén kleur meer maar een naam in de rail; het randje
                  // links markeert alleen dát er een fase op de week staat.
                  borderLeft: `3px solid ${accent ? P.lineStrong : 'transparent'}`,
                }}
              >
                {/* Week-rail: nummer, fase-pill, deload, gepland/gedaan + menu */}
                <div className="flex flex-col items-center pt-2 gap-1 min-w-0">
                  {weekNum !== null ? (
                    <>
                      <span className="athletic-mono text-[10px] font-bold" style={{ color: P.inkMuted }}>
                        W{isoWeekOf(rowMonday)}
                      </span>
                      {meta?.isDeload && (
                        <span title="Deload-week">
                          <Moon className="w-3 h-3" style={{ color: P.inkMuted }} />
                        </span>
                      )}
                      {phase && !meta?.isDeload && (
                        <span
                          className="athletic-mono text-[8px] leading-tight text-center"
                          style={{ color: P.inkMuted, letterSpacing: '0.04em' }}
                          title={`${phase.label}, ${phase.description}`}
                        >
                          {phase.short}
                        </span>
                      )}
                      {progress && progress.planned > 0 && (
                        <span
                          className="athletic-mono text-[9px]"
                          style={{ color: progress.done >= progress.planned ? P.lime : P.inkDim }}
                          title={`${progress.done} van ${progress.planned} geplande workouts gedaan`}
                        >
                          {progress.done}/{progress.planned}
                        </span>
                      )}
                      {(() => {
                        const pl = plannedLoadByWeek.get(weekNum)
                        if (!pl || (pl.load === 0 && meta?.targetLoad == null)) return null
                        return (
                          <WeekLoadBar
                            planned={pl.load}
                            target={meta?.targetLoad ?? null}
                            estimated={pl.estimated}
                          />
                        )
                      })()}
                      {/* Elk item in dit menu schrijft: fase/belasting, week
                          kopiëren, knippen, plakken, dupliceren als deload.
                          Bij een gearchiveerde patiënt blijft het dus weg. */}
                      {!planningVergrendeld && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-[rgba(212,232,230,0.05)]"
                            title={`Week ${weekNum} acties`}
                          >
                            <MoreHorizontal className="w-3.5 h-3.5 text-[var(--p-ink-muted)]" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-60">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Week {isoWeekOf(rowMonday)}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setWeekMetaOpen(weekNum)} className="gap-2 text-xs">
                            <Layers className="w-3.5 h-3.5" />
                            Fase &amp; belasting instellen
                          </DropdownMenuItem>
                          {/* Kopiëren/knippen vereist een bestaande bron-week. */}
                          {weekExists && (
                            <>
                              <DropdownMenuItem onSelect={() => handleClipWeek(rowMonday, weekNum, 'copy')} className="gap-2 text-xs">
                                <Copy className="w-3.5 h-3.5" />
                                Kopieer week
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleClipWeek(rowMonday, weekNum, 'cut')} className="gap-2 text-xs">
                                <Scissors className="w-3.5 h-3.5" />
                                Knip week
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleDuplicateWeekAsDeload(rowMonday, weekNum)} className="gap-2 text-xs">
                                <Moon className="w-3.5 h-3.5" />
                                Dupliceer als deload-week
                              </DropdownMenuItem>
                            </>
                          )}
                          {/* Plakken kan op elke week (ook een lege — die wordt
                              dan aangemaakt), behalve op de bron zelf. */}
                          {weekClipboard &&
                            weekClipboard.patientId === selectedPatientId &&
                            weekClipboard.monday !== isoDate(rowMonday) && (
                            <DropdownMenuItem onSelect={() => handlePasteWeek(rowMonday)} className="gap-2 text-xs">
                              <ClipboardPaste className="w-3.5 h-3.5" />
                              Plak week hier
                              {weekClipboard.weekNum != null ? ` (W${weekClipboard.weekNum}${weekClipboard.mode === 'cut' ? ' · knip' : ''})` : ''}
                            </DropdownMenuItem>
                          )}
                          {weekClipboard && weekClipboard.patientId === selectedPatientId && (
                            <DropdownMenuItem onSelect={() => setWeekClipboard(null)} className="gap-2 text-xs">
                              <X className="w-3.5 h-3.5" />
                              Klembord wissen
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </>
                  ) : null}
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
                      loggedFor={loggedInfoFor}
                      movedToFor={movedToFor}
                      openItemId={detailItem?.item.id ?? null}
                      readOnly={planningVergrendeld}
                    />
                  )
                })}
                <WeekTotals
                  dates={week}
                  itemsFor={(d) => dateMap.get(isoDate(d))?.items ?? []}
                  cardio={cardioRaw}
                  sessions={sessionsRaw}
                />
              </div>
            )
          })}
          <CalendarLegend />
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

        {/* Week-instellingen (fase/deload/target/notitie) */}
        {weekMetaOpen !== null && selectedPatientId && (
          <WeekMetaDialog
            weekNumber={weekMetaOpen}
            initial={weekMetaByNumber.get(weekMetaOpen) ?? null}
            saving={setWeekMeta.isPending}
            onClose={() => setWeekMetaOpen(null)}
            onSave={async (vals) => {
              // Maandag-anker van deze week meesturen zodat een nog niet
              // bestaande (toekomstige) week op de juiste kalenderrij landt.
              const monday = weekAnchor
                ? addDays(weekAnchor.monday, (weekMetaOpen - weekAnchor.weekNumber) * 7)
                : undefined
              await setWeekMeta.mutateAsync({
                patientId: selectedPatientId,
                weekNumber: weekMetaOpen,
                ...(monday ? { startDate: monday.toISOString() } : {}),
                ...vals,
              })
              setWeekMetaOpen(null)
            }}
          />
        )}

        {/* Cardio-workout bouwen — volledig scherm */}
        {cardioBuilderItem && (
          <CardioWorkoutBuilder
            initial={readWorkout(cardioBuilderItem.cardioParams)}
            activity={cardioBuilderItem.quickActivity ?? 'RUNNING'}
            itemName={cardioBuilderItem.quickName ?? 'Cardio-workout'}
            saving={setItemCardio.isPending}
            onClose={() => setCardioBuilderItem(null)}
            onSave={async (w: StructuredCardio) => {
              await setItemCardio.mutateAsync({
                itemId: cardioBuilderItem.id,
                cardioParams: w as unknown as Record<string, unknown>,
              })
              setCardioBuilderItem(null)
            }}
          />
        )}

        {/* Plan-sjabloon toepassen vanaf een datum */}
        {applyPlanOpen && selectedPatientId && (
          <ApplyPlanDialog
            patientId={selectedPatientId}
            patientLabel={
              patients.find(p => p.id === selectedPatientId)?.name
              ?? patients.find(p => p.id === selectedPatientId)?.email
              ?? 'deze patiënt'
            }
            defaultDate={isoDate(new Date(year, month0, 1))}
            onClose={() => setApplyPlanOpen(false)}
            onApplied={() => {
              utils.weekSchedules.listWithItems.invalidate()
              utils.weekSchedules.listItemContents.invalidate()
            }}
          />
        )}

        {/* Geselecteerd weekbereik opslaan als herbruikbaar plan */}
        {savePlanRange && selectedPatientId && (
          <SavePlanDialog
            patientId={selectedPatientId}
            fromDate={savePlanRange.from}
            toDate={savePlanRange.to}
            onClose={() => setSavePlanRange(null)}
            onSaved={clearSelection}
          />
        )}
      </div>
      {/* /kalender-kolom — krimpt mee via flex-1 wanneer het paneel opent */}

      {/* Desktop: item-detail als zij-paneel naast de (gekrompen) kalender */}
      {liveDetail && isDesktop && (
        <aside
          className={cn(
            'hidden lg:flex flex-col w-[360px] xl:w-[420px] shrink-0 rounded-2xl overflow-hidden sticky top-4 max-h-[calc(100vh-2rem)] duration-300 ease-out',
            panelClosing
              ? 'animate-out fade-out-0 slide-out-to-right-4'
              : 'animate-in fade-in-0 slide-in-from-right-4',
          )}
          style={{...CARD }}
        >
          <ItemDetailContent
            // Key op het item: zonder dit reconcilieert React hetzelfde element
            // bij het wisselen van workout en blijven de useState-waarden van de
            // vórige staan — je bewerkt dan B met de naam/RPE van A.
            key={`${liveDetail.item.id}:${contentsLoaded ? 'c' : 'l'}`}
            detail={liveDetail}
            onClose={closeDetail}
            showClose
            onSaveTemplate={handleSaveTemplate}
            onCopy={handleCopyItem}
            onSaveQuick={handleSaveQuick}
            onSaveExercises={handleSaveItemExercises}
            onBuildCardio={setCardioBuilderItem}
            savingTemplate={saveItemAsTemplate.isPending}
            copying={duplicateItem.isPending}
            savingExercises={setItemExercises.isPending}
            readOnly={planningVergrendeld}
          />
        </aside>
      )}

      {/* Mobiel: item-detail als centrale modal */}
      {!isDesktop && (
        <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
          <DialogContent aria-describedby={undefined} className="max-w-xl p-0 overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Workout-details</DialogTitle>
            </DialogHeader>
            <div className="max-h-[80vh] flex flex-col">
              {liveDetail && (
                <ItemDetailContent
                  key={`${liveDetail.item.id}:${contentsLoaded ? 'c' : 'l'}`}
                  detail={liveDetail}
                  onClose={() => setDetailItem(null)}
                  onSaveTemplate={handleSaveTemplate}
                  onCopy={handleCopyItem}
                  onSaveQuick={handleSaveQuick}
                  onSaveExercises={handleSaveItemExercises}
                  onBuildCardio={setCardioBuilderItem}
                  savingTemplate={saveItemAsTemplate.isPending}
                  copying={duplicateItem.isPending}
                  savingExercises={setItemExercises.isPending}
                  readOnly={planningVergrendeld}
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
