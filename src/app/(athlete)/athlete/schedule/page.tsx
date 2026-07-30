'use client'

/**
 * Atleet-kalender — TrainingPeaks-stijl maandkalender.
 *
 * Maand-grid met gekleurde bolletjes per training (kleur = type), daaronder
 * de sessies van de geselecteerde dag. Tikken op een sessie opent een
 * detail-sheet (gelogde oefeningen / cardio-data / geplande inhoud).
 *
 * Data: patient.calendarRange (eigen SessionLogs + CardioLogs + week-
 * schedules). Datum-anchoring identiek aan de therapeut-week-planner:
 * WeekSchedule.startDate = maandag van die week, fallback via weekNumber.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { ChevronLeft, ChevronRight, X, Clock, Flame, MapPin, HeartPulse } from 'lucide-react'
import { formatSetsReps } from '@/lib/prescription'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
} from '@/components/dark-ui'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore, IconSleep,
} from '@/components/icons'
import { CARDIO_ACTIVITIES, type CardioActivityKey } from '@/lib/cardio-constants'
import { WeekPhaseLine } from '@/components/schedule/WeekPhaseLine'
import { CATEGORY_COLORS } from '@/lib/palette'
import { formatWeightsPerSet } from '@/lib/session-sets'

const mono =
  'var(--font-mono-athletic)'

// ─── Types & constants ────────────────────────────────────────────────────────

type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'

const CATEGORY_LABELS: Record<Category, string> = {
  STRENGTH: 'Kracht',
  MOBILITY: 'Mobiliteit',
  PLYOMETRICS: 'Plyometrie',
  CARDIO: 'Cardio',
  STABILITY: 'Stabiliteit',
}
function CategoryIcon({ category, size = 16 }: { category: Category; size?: number }) {
  switch (category) {
    case 'STRENGTH': return <IconStrength size={size} />
    case 'MOBILITY': return <IconMobility size={size} />
    case 'PLYOMETRICS': return <IconPlyometrics size={size} />
    case 'CARDIO': return <IconCardio size={size} />
    case 'STABILITY': return <IconCore size={size} />
  }
}

const MONTH_LABELS_NL = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
]
const DAY_LABELS_SHORT = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']
const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

// ─── Date helpers (zelfde conventies als de therapeut-week-planner) ──────────

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
  const delta = (r.getDay() + 6) % 7
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
/** 6 rijen × 7 kolommen (Ma-Zo) rond de gegeven maand. */
function monthGrid(year: number, month0: number): Date[][] {
  const first = mondayOf(new Date(year, month0, 1))
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
  )
}
function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}u${m % 60 > 0 ? ` ${m % 60}m` : ''}`
}
function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}

// ─── Event-model: alles wat op een dag kan staan ──────────────────────────────

type CalEvent =
  | {
      kind: 'session'
      id: string
      name: string
      category: Category
      status: 'done' | 'partial'
      durationSec: number | null
      rpe: number | null
      pain: number | null
      exerciseCount: number
    }
  | {
      kind: 'cardio'
      id: string
      name: string
      category: 'CARDIO'
      durationSec: number
      distanceM: number | null
      avgHeartRate: number | null
      zone: number | null
      rpe: number | null
      pain: number | null
      paceSecPerKm: number | null
      notes: string | null
    }
  | {
      kind: 'planned'
      id: string
      name: string
      category: Category
      status: 'planned' | 'missed'
      durationSec: number | null
      programId: string | null
      notes: string | null
      /** Echt planner-item (geen legacy/synthetische tegel) → uitvoerbaar. */
      itemId: string | null
      /** Heeft de therapeut oefeningen klaargezet? Zo niet: lege ad-hoc sessie. */
      hasExercises: boolean
    }

function eventColor(e: CalEvent): string {
  return CATEGORY_COLORS[e.category]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AthleteSchedulePage() {
  // Eén keer bepalen per mount — anders krijgt elke render een nieuw
  // Date-object en rekent de events-memo steeds opnieuw.
  const [today] = useState(() => startOfDay(new Date()))
  const [year, setYear] = useState(today.getFullYear())
  const [month0, setMonth0] = useState(today.getMonth())
  const [selectedIso, setSelectedIso] = useState(isoDate(today))
  const [detail, setDetail] = useState<CalEvent | null>(null)

  const grid = useMemo(() => monthGrid(year, month0), [year, month0])

  const range = useMemo(() => ({
    from: grid[0][0].toISOString(),
    to: addDays(grid[5][6], 1).toISOString(),
  }), [grid])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = (trpc.patient.calendarRange.useQuery as any)(
    range,
    { staleTime: 10_000 },
  ) as { data: CalendarData | undefined; isLoading: boolean }

  // Events per ISO-datum: gelogde sessies + cardio + (ongematchte) planning.
  const eventsByIso = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    if (!data) return map
    const push = (iso: string, e: CalEvent) => {
      map.set(iso, [...(map.get(iso) ?? []), e])
    }

    // Gelogde kracht-sessies (alleen afgerond — PENDING historie laat de
    // planning hieronder zien).
    for (const s of data.sessions) {
      if (!s.completedAt) continue
      push(isoDate(new Date(s.scheduledAt)), {
        kind: 'session',
        id: s.id,
        name: s.programName ?? 'Workout',
        category: 'STRENGTH',
        status: s.completedAll === false ? 'partial' : 'done',
        durationSec: s.duration,
        rpe: s.exertionLevel,
        pain: s.painLevel,
        exerciseCount: s.exerciseCount,
      })
    }

    // Cardio-logs.
    for (const c of data.cardio) {
      push(isoDate(new Date(c.completedAt)), {
        kind: 'cardio',
        id: c.id,
        name: CARDIO_ACTIVITIES[c.activity as CardioActivityKey]?.label ?? 'Cardio',
        category: 'CARDIO',
        durationSec: c.durationSec,
        distanceM: c.distanceM,
        avgHeartRate: c.avgHeartRate,
        zone: c.zone,
        rpe: c.rpe,
        pain: c.painLevel,
        paceSecPerKm: c.avgPaceSecPerKm,
        notes: c.notes,
      })
    }

    // Geplande items op datum mappen (anchoring als de week-planner) en
    // matchen tegen wat er die dag al gelogd is.
    if (data.schedules.length > 0) {
      const withStart = data.schedules.find(ws => ws.startDate)
      let baseline: Date
      let baselineWeekNumber: number
      if (withStart) {
        baseline = mondayOf(new Date(withStart.startDate!))
        baselineWeekNumber = withStart.weekNumber
      } else {
        const earliest = data.schedules.reduce((a, b) =>
          new Date(a.createdAt) < new Date(b.createdAt) ? a : b,
        )
        baseline = mondayOf(new Date(earliest.createdAt))
        baselineWeekNumber = earliest.weekNumber
      }

      // Tellers per dag: hoeveel logs kunnen nog een gepland item "afvinken".
      const sessionProgramIdsByIso = new Map<string, Set<string>>()
      const looseSessionsByIso = new Map<string, number>()
      const cardioCountByIso = new Map<string, number>()
      for (const s of data.sessions) {
        if (!s.completedAt) continue
        const iso = isoDate(new Date(s.scheduledAt))
        if (s.programId) {
          const set = sessionProgramIdsByIso.get(iso) ?? new Set<string>()
          set.add(s.programId)
          sessionProgramIdsByIso.set(iso, set)
        } else {
          looseSessionsByIso.set(iso, (looseSessionsByIso.get(iso) ?? 0) + 1)
        }
      }
      for (const c of data.cardio) {
        const iso = isoDate(new Date(c.completedAt))
        cardioCountByIso.set(iso, (cardioCountByIso.get(iso) ?? 0) + 1)
      }

      for (const ws of data.schedules) {
        const start = ws.startDate
          ? mondayOf(new Date(ws.startDate))
          : addDays(baseline, (ws.weekNumber - baselineWeekNumber) * 7)
        for (const day of ws.days) {
          const date = addDays(start, day.dayOfWeek)
          const iso = isoDate(date)
          // Backwards-compat: legacy programId op de dag zonder items[].
          const items = (day.items.length > 0 ? day.items : (day.programId && day.program ? [{
            id: `legacy-${day.id}`,
            order: 0,
            programId: day.programId,
            program: day.program,
            quickCategory: null,
            quickName: null,
            quickDurationSec: null,
            plannedDurationSec: null,
            notes: null,
            _count: { exercises: 0 },
            hasContent: true,
            sessionLogs: [] as { id: string }[],
          }] : []))
          for (const item of items) {
            const category = (item.quickCategory ?? 'STRENGTH') as Category
            const isRealItem = !item.id.startsWith('legacy-')
            // Al gelogd? Eerst op identiteit (sessionLogs op het item zelf),
            // want dat is exact. De datum+teller-heuristiek eronder is alleen
            // nog nodig voor sessies van vóór deze koppeling en voor clients die
            // het item niet meesturen (iOS).
            let matched = (item.sessionLogs?.length ?? 0) > 0
            if (!matched) {
              if (item.programId) {
                matched = sessionProgramIdsByIso.get(iso)?.has(item.programId) ?? false
              } else if (category === 'CARDIO') {
                const left = cardioCountByIso.get(iso) ?? 0
                if (left > 0) { cardioCountByIso.set(iso, left - 1); matched = true }
              } else {
                const left = looseSessionsByIso.get(iso) ?? 0
                if (left > 0) { looseSessionsByIso.set(iso, left - 1); matched = true }
              }
            }
            if (matched) continue
            push(iso, {
              kind: 'planned',
              id: item.id,
              name: item.programId ? (item.program?.name ?? 'Programma') : (item.quickName ?? 'Workout'),
              category,
              status: date < today ? 'missed' : 'planned',
              durationSec: item.plannedDurationSec ?? item.quickDurationSec,
              programId: item.programId,
              notes: item.notes,
              itemId: isRealItem ? item.id : null,
              hasExercises: item.hasContent ?? ((item._count?.exercises ?? 0) > 0),
            })
          }
        }
      }
    }

    return map
  }, [data, today])

  const selectedDate = useMemo(() => new Date(`${selectedIso}T00:00:00`), [selectedIso])
  const selectedEvents = eventsByIso.get(selectedIso) ?? []
  const isToday = sameDay(selectedDate, today)
  const monthLabel = `${MONTH_LABELS_NL[month0]} ${year}`

  function navMonth(delta: number) {
    const d = new Date(year, month0 + delta, 1)
    setYear(d.getFullYear())
    setMonth0(d.getMonth())
  }
  function navToday() {
    setYear(today.getFullYear())
    setMonth0(today.getMonth())
    setSelectedIso(isoDate(today))
  }

  // Start-CTA: vandaag geselecteerd + nog een gepland item open.
  //
  // Het itemId gaat mee. Zonder dat viel de runner terug op het OUDSTE actieve
  // programma, dus tikken op workout B startte programma A — en een quick
  // workout kwam altijd op een leeg ad-hoc scherm uit, hoe zorgvuldig de
  // therapeut hem ook had opgebouwd.
  const startTarget = (() => {
    if (!isToday) return null
    const open = selectedEvents.find(e => e.kind === 'planned' && e.status === 'planned')
    if (!open || open.kind !== 'planned') return null
    if (open.category === 'CARDIO') {
      return open.itemId ? `/athlete/cardio/new?itemId=${open.itemId}` : '/athlete/cardio/new'
    }
    if (open.itemId && (open.hasExercises || open.programId)) {
      return `/athlete/session?itemId=${open.itemId}`
    }
    // Gepland, maar de therapeut heeft geen oefeningen klaargezet: dan is een
    // lege ad-hoc sessie het eerlijke aanbod.
    return open.programId ? '/athlete/session' : '/athlete/session?mode=quick'
  })()

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4 mbt-stagger">
        {/* Hero */}
        <div>
          <Kicker>WEEKSCHEMA</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(44px, 12vw, 80px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            KALENDER
          </h1>
        </div>

        {/* Periodiserings-context van de huidige week (subtiel, alleen als
            de therapeut een fase/notitie heeft ingesteld). */}
        <WeekPhaseLine />

        {/* Maand-nav */}
        <div className="flex items-center justify-between">
          <span
            className="athletic-mono"
            style={{ color: P.ink, fontSize: 14, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            {monthLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navMonth(-1)}
              className="athletic-tap p-2 rounded-lg"
              style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, color: P.ink }}
              aria-label="Vorige maand"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={navToday}
              className="athletic-tap px-3 py-2 rounded-lg athletic-mono"
              style={{
                background: P.surface,
                border: `1px solid ${P.lineStrong}`,
                color: P.ink,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.12em',
              }}
            >
              VANDAAG
            </button>
            <button
              type="button"
              onClick={() => navMonth(1)}
              className="athletic-tap p-2 rounded-lg"
              style={{ background: P.surface, border: `1px solid ${P.lineStrong}`, color: P.ink }}
              aria-label="Volgende maand"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Maand-grid */}
        <Tile style={{ padding: 10 }}>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS_SHORT.map(l => (
              <div
                key={l}
                className="text-center athletic-mono"
                style={{ color: P.inkDim, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em' }}
              >
                {l}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map(date => {
              const iso = isoDate(date)
              const inMonth = date.getMonth() === month0
              const isTd = sameDay(date, today)
              const isSelected = iso === selectedIso
              const events = eventsByIso.get(iso) ?? []
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedIso(iso)}
                  className="athletic-tap flex flex-col items-center justify-start rounded-xl pt-1.5 pb-1"
                  style={{
                    minHeight: 46,
                    background: isSelected ? P.surfaceHi : 'transparent',
                    border: isSelected
                      ? `1.5px solid ${P.brand}`
                      : isTd
                        ? `1.5px solid ${P.lineStrong}`
                        : '1.5px solid transparent',
                    opacity: inMonth ? 1 : 0.35,
                  }}
                  aria-label={`${date.getDate()} ${MONTH_LABELS_NL[date.getMonth()]}`}
                  aria-pressed={isSelected}
                >
                  <span
                    className="athletic-mono"
                    style={{
                      fontSize: 13,
                      fontWeight: isTd || isSelected ? 900 : 700,
                      color: isTd ? P.brand : P.ink,
                      lineHeight: '18px',
                    }}
                  >
                    {date.getDate()}
                  </span>
                  {/* Bolletjes: kleur = trainingstype; gepland gedimd, gemist extra gedimd */}
                  <span className="flex items-center justify-center gap-[3px] mt-1" style={{ minHeight: 6 }}>
                    {events.slice(0, 3).map(e => (
                      <span
                        key={`${e.kind}-${e.id}`}
                        className="rounded-full"
                        style={{
                          width: 5,
                          height: 5,
                          background: eventColor(e),
                          opacity: e.kind === 'planned' ? (e.status === 'missed' ? 0.3 : 0.55) : 1,
                        }}
                      />
                    ))}
                    {events.length > 3 && (
                      <span style={{ color: P.inkMuted, fontSize: 8, fontWeight: 900, lineHeight: '6px' }}>+</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Geselecteerde dag */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2
              style={{
                color: P.ink,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
              }}
            >
              {DAY_NAMES[(selectedDate.getDay() + 6) % 7]} {selectedDate.getDate()} {MONTH_LABELS_NL[selectedDate.getMonth()].slice(0, 3)}
            </h2>
            {isToday && (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: 'rgba(232,122,85,0.12)',
                  border: `1px solid ${P.brand}`,
                  color: P.brand,
                  fontFamily: mono,
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                VANDAAG
              </span>
            )}
          </div>
          {startTarget && (
            <DarkButton href={startTarget} variant="primary" size="sm">
              START →
            </DarkButton>
          )}
        </div>

        {/* Sessies van de dag */}
        {isLoading ? (
          <Tile style={{ padding: 24, textAlign: 'center' }}>
            <MetaLabel>LADEN…</MetaLabel>
          </Tile>
        ) : selectedEvents.length === 0 ? (
          <Tile style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ marginBottom: 6, color: P.ink, display: 'flex', justifyContent: 'center' }}><IconSleep size={32} /></div>
            <Kicker>RUSTDAG</Kicker>
            <p style={{ marginTop: 8, color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
              Geen trainingen op deze dag.
            </p>
          </Tile>
        ) : (
          <div className="space-y-2 mbt-stagger">
            {selectedEvents.map(e => (
              <EventCard key={`${e.kind}-${e.id}`} event={e} onClick={() => setDetail(e)} />
            ))}
          </div>
        )}

        <DarkButton href="/athlete/workouts/new" variant="secondary" className="w-full">
          + WORKOUT TOEVOEGEN
        </DarkButton>
      </div>

      {detail && (
        <EventDetailSheet event={detail} isToday={isToday} dateLabel={`${DAY_NAMES[(selectedDate.getDay() + 6) % 7]} ${selectedDate.getDate()} ${MONTH_LABELS_NL[selectedDate.getMonth()]}`} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

// Shape van patient.calendarRange — handmatig getypeerd omdat de tRPC-
// inference op deze nested select te diep is voor TS (zelfde patroon als de
// week-planner).
type CalendarData = {
  sessions: Array<{
    id: string
    scheduledAt: string | Date
    completedAt: string | Date | null
    status: string
    completedAll: boolean
    duration: number | null
    programId: string | null
    programName: string | null
    painLevel: number | null
    exertionLevel: number | null
    exerciseCount: number
  }>
  cardio: Array<{
    id: string
    completedAt: string | Date
    activity: string
    protocol: string
    durationSec: number
    distanceM: number | null
    avgHeartRate: number | null
    zone: number | null
    rpe: number | null
    painLevel: number | null
    avgPaceSecPerKm: number | null
    notes: string | null
  }>
  schedules: Array<{
    id: string
    weekNumber: number
    startDate: string | Date | null
    createdAt: string | Date
    days: Array<{
      id: string
      dayOfWeek: number
      programId: string | null
      program: { id: string; name: string } | null
      items: Array<{
        id: string
        order: number
        programId: string | null
        program: { id: string; name: string } | null
        quickCategory: string | null
        quickName: string | null
        quickDurationSec: number | null
        /** Volgt uit de oefeningen/blokken; wint van quickDurationSec. */
        plannedDurationSec?: number | null
        notes: string | null
        /** >0 = de therapeut heeft oefeningen klaargezet. */
        _count?: { exercises: number }
        /** Server-signaal: oefeningen, cardio-blokken óf een programma. Cardio
         *  heeft géén oefeningen, dus op _count alleen gaan is fout. */
        hasContent?: boolean
        /** Gevuld = al afgevinkt tegen dit item (identiteit, geen heuristiek). */
        sessionLogs?: Array<{ id: string; completedAt: string | null; completedAll: boolean }>
      }>
    }>
  }>
}

// ─── Sessie-kaart in de daglijst ─────────────────────────────────────────────

function EventCard({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const color = eventColor(event)
  const statusChip =
    event.kind === 'session'
      ? (event.status === 'partial'
          ? { label: 'DEELS', color: P.orange }
          : { label: '✓ GEDAAN', color: P.lime })
      : event.kind === 'cardio'
        ? { label: '✓ GEDAAN', color: P.lime }
        : event.status === 'missed'
          ? { label: 'GEMIST', color: P.danger }
          : { label: 'GEPLAND', color: P.inkMuted }

  const meta: string[] = []
  if (event.kind === 'session') {
    if (event.durationSec) meta.push(fmtDuration(event.durationSec))
    meta.push(`${event.exerciseCount} OEF`)
    if (event.rpe != null) meta.push(`RPE ${event.rpe}`)
  } else if (event.kind === 'cardio') {
    meta.push(fmtDuration(event.durationSec))
    if (event.distanceM) meta.push(`${(event.distanceM / 1000).toFixed(1)} KM`)
    if (event.zone) meta.push(`Z${event.zone}`)
    if (event.rpe != null) meta.push(`RPE ${event.rpe}`)
  } else {
    meta.push(CATEGORY_LABELS[event.category].toUpperCase())
    if (event.durationSec) meta.push(fmtDuration(event.durationSec))
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-tap mbt-card-hover w-full flex items-center gap-3 rounded-xl text-left"
      style={{
        background: P.surface,
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${P.line}`,
        padding: '12px 14px',
        opacity: event.kind === 'planned' && event.status === 'missed' ? 0.75 : 1,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}1A`, border: `1px solid ${color}40`, color }}
      >
        <CategoryIcon category={event.category} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{ color: P.ink, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}
        >
          {event.name}
        </p>
        <div
          style={{
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            fontWeight: 700,
            color: P.inkMuted,
            marginTop: 3,
            textTransform: 'uppercase',
          }}
        >
          {meta.join(' · ')}
        </div>
      </div>
      <span
        className="athletic-mono shrink-0"
        style={{ color: statusChip.color, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em' }}
      >
        {statusChip.label}
      </span>
    </button>
  )
}

// ─── Detail-sheet ─────────────────────────────────────────────────────────────

function EventDetailSheet({
  event,
  isToday,
  dateLabel,
  onClose,
}: {
  event: CalEvent
  isToday: boolean
  dateLabel: string
  onClose: () => void
}) {
  const router = useRouter()
  const color = eventColor(event)
  // Oefening-details alleen ophalen voor gelogde kracht-sessies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailQuery = (trpc.patient.sessionDetail.useQuery as any)(
    { sessionId: event.id },
    { enabled: event.kind === 'session', staleTime: 60_000 },
  ) as { data: SessionDetailData | undefined; isLoading: boolean }

  // Inhoud van een gepland item — zodat je vóór het starten ziet wat er op de
  // rol staat. eslint-disable want de tRPC-hook is hier los getypeerd.
  const plannedItemId = event.kind === 'planned' ? event.itemId : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentQuery = (trpc.patient.getTodayExercises.useQuery as any)(
    { itemId: plannedItemId ?? undefined },
    { enabled: event.kind === 'planned' && event.hasExercises && !!plannedItemId, staleTime: 60_000 },
  ) as {
    data:
      | { exercises: { exerciseId: string; name: string; sets: number; reps: number; repUnit?: string; supersetGroup?: string | null }[] }
      | undefined
    isLoading: boolean
  }

  // Startknop voor een gepland item. Vandaag → direct; andere dag → bevestigen.
  const startPlanned = () => {
    if (event.kind !== 'planned' || !event.itemId) return
    const target =
      event.category === 'CARDIO'
        ? `/athlete/cardio/new?itemId=${event.itemId}`
        : event.hasExercises || event.programId
          ? `/athlete/session?itemId=${event.itemId}`
          : null
    if (!target) return
    if (isToday || window.confirm(`Deze training staat gepland voor ${dateLabel.toLowerCase()}. Wil je hem nu doen?`)) {
      router.push(target)
    }
  }
  const canStartPlanned =
    event.kind === 'planned' && !!event.itemId && (event.category === 'CARDIO' || event.hasExercises || !!event.programId)

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-label={event.name}>
      <div className="mbt-backdrop absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="mbt-sheet relative w-full rounded-t-3xl flex flex-col"
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          maxWidth: 480,
          margin: '0 auto',
          maxHeight: '85dvh',
        }}
      >
        <div className="flex-none px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${P.line}` }}>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: P.lineStrong }} />
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}1A`, border: `1px solid ${color}40`, color }}
              >
                <CategoryIcon category={event.category} size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate" style={{ color: P.ink, fontSize: 16, fontWeight: 900 }}>{event.name}</p>
                <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>
                  {dateLabel}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="athletic-tap p-1 rounded-lg shrink-0"
              style={{ color: P.inkMuted }}
              aria-label="Sluiten"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-[max(env(safe-area-inset-bottom),24px)]">
          {/* Stat-regel */}
          <div className="flex flex-wrap gap-2">
            {event.kind !== 'planned' && (
              <StatChip icon={<Clock className="w-3.5 h-3.5" />} label={fmtDuration(event.kind === 'session' ? (event.durationSec ?? 0) : event.durationSec)} />
            )}
            {event.kind === 'cardio' && event.distanceM != null && (
              <StatChip icon={<MapPin className="w-3.5 h-3.5" />} label={`${(event.distanceM / 1000).toFixed(2)} km`} />
            )}
            {event.kind === 'cardio' && event.paceSecPerKm != null && (
              <StatChip icon={<Flame className="w-3.5 h-3.5" />} label={fmtPace(event.paceSecPerKm)} />
            )}
            {event.kind === 'cardio' && event.avgHeartRate != null && (
              <StatChip icon={<HeartPulse className="w-3.5 h-3.5" />} label={`${event.avgHeartRate} bpm`} />
            )}
            {event.kind !== 'planned' && event.rpe != null && <StatChip label={`RPE ${event.rpe}/10`} />}
            {event.kind !== 'planned' && event.pain != null && <StatChip label={`Pijn ${event.pain}/10`} color={event.pain >= 5 ? P.danger : undefined} />}
            {event.kind === 'planned' && (
              <StatChip
                label={event.status === 'missed' ? 'Gemist' : 'Gepland'}
                color={event.status === 'missed' ? P.danger : undefined}
              />
            )}
            {event.kind === 'planned' && event.durationSec != null && (
              <StatChip icon={<Clock className="w-3.5 h-3.5" />} label={fmtDuration(event.durationSec)} />
            )}
          </div>

          {/* Gepland item: inhoud-preview + starten (vandaag direct, andere dag met bevestiging) */}
          {event.kind === 'planned' && (
            <>
              {event.hasExercises &&
                (contentQuery.isLoading ? (
                  <MetaLabel>INHOUD LADEN…</MetaLabel>
                ) : contentQuery.data && contentQuery.data.exercises.length > 0 ? (
                  <div className="space-y-2">
                    <MetaLabel>OEFENINGEN</MetaLabel>
                    {contentQuery.data.exercises.map(ex => (
                      <div
                        key={`${ex.exerciseId}-${ex.name}`}
                        className="flex items-center gap-3 rounded-xl"
                        style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, padding: '10px 12px' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ color: P.ink, fontSize: 13, fontWeight: 800 }}>
                            {ex.supersetGroup ? `${ex.supersetGroup} · ` : ''}{ex.name}
                          </p>
                          <p
                            className="athletic-mono"
                            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', marginTop: 2, textTransform: 'uppercase' }}
                          >
                            {formatSetsReps(ex.sets, null, ex.reps, null, ex.repUnit)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null)}
              {canStartPlanned && (
                <DarkButton onClick={startPlanned} variant="primary" className="w-full">
                  Start →
                </DarkButton>
              )}
            </>
          )}

          {/* Kracht-sessie: gelogde oefeningen */}
          {event.kind === 'session' && (
            detailQuery.isLoading ? (
              <MetaLabel>OEFENINGEN LADEN…</MetaLabel>
            ) : detailQuery.data && detailQuery.data.exerciseLogs.length > 0 ? (
              <div className="space-y-2 mbt-stagger">
                <MetaLabel>OEFENINGEN</MetaLabel>
                {detailQuery.data.exerciseLogs.map(l => (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl"
                    style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, padding: '10px 12px' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ color: P.ink, fontSize: 13, fontWeight: 800 }}>{l.name}</p>
                      <p
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', marginTop: 2, textTransform: 'uppercase' }}
                      >
                        {[
                          l.setsCompleted != null && l.repsCompleted != null ? `${l.setsCompleted} × ${l.repsCompleted}` : null,
                          formatWeightsPerSet(l.weightsPerSet, l.weight),
                          (l.painDuring ?? l.painLevel) != null ? `pijn ${l.painDuring ?? l.painLevel}` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MetaLabel>GEEN OEFENING-DETAILS</MetaLabel>
            )
          )}

          {/* Notities */}
          {((event.kind === 'cardio' && event.notes) || (event.kind === 'planned' && event.notes)) && (
            <div>
              <MetaLabel>NOTITIE</MetaLabel>
              <p style={{ color: P.ink, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
                {event.kind === 'cardio' ? event.notes : event.notes}
              </p>
            </div>
          )}
          {event.kind === 'session' && detailQuery.data?.notes && (
            <div>
              <MetaLabel>NOTITIE</MetaLabel>
              <p style={{ color: P.ink, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{detailQuery.data.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type SessionDetailData = {
  id: string
  notes: string | null
  exerciseLogs: Array<{
    id: string
    name: string
    category: string | null
    setsCompleted: number | null
    repsCompleted: number | null
    weight: number | null
    weightsPerSet: unknown
    painLevel: number | null
    painDuring: number | null
    supersetGroup: string | null
  }>
}

function StatChip({ icon, label, color }: { icon?: React.ReactNode; label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 athletic-mono"
      style={{
        background: P.surfaceLow,
        border: `1px solid ${P.line}`,
        color: color ?? P.ink,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.06em',
      }}
    >
      {icon}
      {label}
    </span>
  )
}
