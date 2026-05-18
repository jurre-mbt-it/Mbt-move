'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import {
  ChevronLeft, ChevronRight, Clock, ChevronDown, ChevronUp, Lightbulb, LayoutList, Target,
  TrendingUp, TrendingDown, CheckCircle2, SkipForward, Minus, Plus, Trophy, Bell, RotateCcw,
} from 'lucide-react'
import { P, Kicker, MetaLabel, Tile, DarkButton } from '@/components/dark-ui'
import { useDraftBackup, loadDraft, clearStoredDraft } from '@/hooks/useAutosave'
import {
  useBoolPref,
  useStringPref,
  PREF_REST_TIMER_ENABLED,
  PREF_SESSION_VIEW_MODE,
} from '@/hooks/useLocalPref'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player') as any, { ssr: false }) as any

// ─── Static coaching data ─────────────────────────────────────────────────────

const COACHING_CUES: Record<string, string[]> = {
  '1': ['Houd de romp recht, borst omhoog', 'Knie over de tweede teen', 'Druk door de hiel van het voorste been', 'Stabiel bekken — niet laten draaien'],
  '2': ['Gecontroleerde val — niet laten crashen', 'Core strak tijdens de hele beweging', 'Vang jezelf op met de handen bij de bodem', 'Krachtige push terug naar startpositie'],
  '3': ['Beide zitknobbels in contact met de grond', 'Roteer vanuit de heup, niet de romp', 'Houd de rug recht bij het voorover leunen'],
  '4': ['Staand been licht gebogen, niet vergrendeld', 'Hinge vanuit de heup — niet buigen vanuit de rug', 'Houd het zwevende been in lijn met de romp', 'Blik naar de grond — neutrale nek'],
  '5': ['Soft landing — knieën veren mee', 'Land op het midden van de voet', 'Spring omhoog en iets naar voren', 'Stap terug af — spring niet terug'],
  '6': ['Elleboog gefixeerd tegen het lichaam', 'Langzame gecontroleerde beweging', 'Geen compensatie van de schouder of romp'],
}

const VARIANTS: Record<string, { easier?: string; harder?: string }> = {
  '1': { easier: 'Goblet Squat', harder: 'Bulgarian Split Squat + kettlebell' },
  '2': { easier: 'Lying Leg Curl machine', harder: 'Nordic met weerstandsband' },
  '3': { easier: 'Liggende heupstretching', harder: 'Hip 90/90 met actieve rotatie' },
  '4': { easier: 'Romanian Deadlift (bilateral)', harder: 'Single Leg DL + kettlebell' },
  '5': { easier: 'Step-up op box', harder: 'Box Jump + squat hold landing' },
  '6': { easier: 'Interne rotatie met band', harder: 'Externe rotatie met dumbbell' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionExercise = {
  uid: string
  exerciseId: string
  name: string
  category: string
  difficulty: string
  description: string | null
  sets: number
  reps: number
  repUnit: string
  restTime: number
  videoUrl: string | null
  muscleLoads: Record<string, number>
  supersetGroup: string | null
  supersetOrder: number
  notes: string | null
  easierVariantId: string | null
  harderVariantId: string | null
  trackOneRepMax?: boolean
}

type FeedbackEntry = {
  smiley: number | null
  pain: number | null
  weight: number | null
  rpe: number | null
  painDuring: number | null  // tendinopathy: pijn tijdens oefening 0-10
}

// Epley formule: 1RM = weight × (1 + reps/30)
function calcEpley(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

// Pijn kleur: algemeen (niet-tendinopathie): <3 lime, 3-5 gold, 5+ danger
// Tendinopathie (Silbernagel): ≤5 lime, 5-7 gold, >7 danger
function painColor(pain: number, isTendinopathy = false): string {
  if (isTendinopathy) {
    if (pain <= 5) return P.lime
    if (pain <= 7) return P.gold
    return P.danger
  }
  if (pain < 3) return P.lime
  if (pain <= 5) return P.gold
  return P.danger
}

function painLabel(pain: number, isTendinopathy = false): string {
  if (isTendinopathy) {
    if (pain <= 5) return 'OK'
    if (pain <= 7) return 'Let op'
    return 'STOP'
  }
  if (pain < 3) return 'OK'
  if (pain <= 5) return 'Let op'
  return 'Stop'
}

const SMILIES = ['😫', '😕', '😐', '🙂', '😄']
const SMILEY_LABELS = ['Zwaar', 'Moeilijk', 'Oké', 'Goed', 'Super']
const SMILEY_COLORS = [P.danger, P.orange, P.gold, P.limeDeep, P.lime]

// ─── Circular Timer SVG ───────────────────────────────────────────────────────

function CircularTimer({ seconds, total, onSkip }: { seconds: number; total: number; onSkip: () => void }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const progress = total > 0 ? seconds / total : 0
  const offset = circ * (1 - progress)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke={P.surfaceHi} strokeWidth="8" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke={P.brand} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="athletic-mono" style={{ color: P.ink, fontSize: 30, fontWeight: 900 }}>{seconds}</span>
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>sec</span>
        </div>
      </div>
      <button
        onClick={onSkip}
        className="athletic-tap athletic-mono flex items-center gap-1.5"
        style={{ color: P.inkMuted, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}
      >
        <SkipForward className="w-4 h-4" /> SLA RUST OVER
      </button>
    </div>
  )
}

// ─── Smiley Feedback Modal ────────────────────────────────────────────────────

function FeedbackModal({
  exerciseName,
  feedback,
  onChange,
  onSave,
  autoCloseIn,
  tendinopathyMode,
}: {
  exerciseName: string
  feedback: FeedbackEntry
  onChange: (f: Partial<FeedbackEntry>) => void
  onSave: () => void
  autoCloseIn: number
  tendinopathyMode?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onSave} />
      <div
        className="relative w-full rounded-t-3xl px-5 pt-5 pb-8 space-y-5"
        style={{ background: P.surface, maxWidth: 480, margin: '0 auto', border: `1px solid ${P.line}` }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-1" style={{ background: P.lineStrong }} />

        <div className="flex items-start justify-between">
          <div>
            <p style={{ color: P.ink, fontSize: 16, fontWeight: 800 }}>Hoe voelde het?</p>
            <p
              className="truncate max-w-[200px]"
              style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}
            >
              {exerciseName}
            </p>
          </div>
          {autoCloseIn > 0 && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center athletic-mono"
              style={{ background: P.brand, color: P.bg, fontSize: 12, fontWeight: 900 }}
            >
              {autoCloseIn}
            </div>
          )}
        </div>

        {/* Smilies */}
        <div className="flex gap-2 justify-between">
          {SMILIES.map((emoji, i) => {
            const val = i + 1
            const selected = feedback.smiley === val
            return (
              <button
                key={val}
                onClick={() => onChange({ smiley: selected ? null : val })}
                className="athletic-tap flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all"
                style={{
                  background: selected ? SMILEY_COLORS[i] + '22' : P.surfaceHi,
                  border: selected ? `2px solid ${SMILEY_COLORS[i]}` : `2px solid ${P.line}`,
                  minHeight: 44,
                }}
              >
                <span className="text-2xl">{emoji}</span>
                <span
                  className="athletic-mono"
                  style={{ color: selected ? SMILEY_COLORS[i] : P.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}
                >
                  {SMILEY_LABELS[i]}
                </span>
              </button>
            )
          })}
        </div>

        {/* NRS Pain slider — tendinopathie modus: pijnDuring apart */}
        {tendinopathyMode ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>Pijn tijdens oefening (NRS)</p>
              <span
                className="athletic-mono"
                style={{
                  color: feedback.painDuring !== null ? painColor(feedback.painDuring ?? 0, true) : P.inkMuted,
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {feedback.painDuring !== null ? `${feedback.painDuring}/10 — ${painLabel(feedback.painDuring ?? 0, true)}` : 'Geen'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, i) => {
                const selected = feedback.painDuring === i
                const color = painColor(i, true)
                return (
                  <button
                    key={i}
                    onClick={() => onChange({ painDuring: selected ? null : i, pain: selected ? null : i })}
                    className="athletic-tap flex-1 rounded-lg athletic-mono transition-all"
                    style={{
                      height: 44,
                      background: selected ? color : `${color}1F`,
                      color: selected ? P.bg : color,
                      border: selected ? `2px solid ${color}` : `1px solid ${color}33`,
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
            {(feedback.painDuring ?? 0) > 5 && (
              <div
                className="mt-2 rounded-xl px-3 py-2"
                style={{
                  background: (feedback.painDuring ?? 0) > 7 ? 'rgba(248,113,113,0.10)' : 'rgba(244,194,97,0.10)',
                  color: (feedback.painDuring ?? 0) > 7 ? P.danger : P.gold,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {(feedback.painDuring ?? 0) > 7
                  ? '⛔ Pijn te hoog — stop en consult de therapeut.'
                  : '⚠️ Verhoogde pijn. Noteer dit en monitor de volgende sessies.'}
              </div>
            )}
            <p style={{ color: P.inkMuted, fontSize: 10, marginTop: 6 }}>
              Je ontvangt morgenochtend een herinnering voor de 24u-check.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>Pijn tijdens oefening</p>
              <span
                className="athletic-mono"
                style={{
                  color: feedback.pain !== null ? painColor(feedback.pain ?? 0) : P.lime,
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {feedback.pain !== null ? `${feedback.pain}/10` : 'Geen'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, i) => {
                const selected = feedback.pain === i
                const color = painColor(i)
                return (
                  <button
                    key={i}
                    onClick={() => onChange({ pain: selected ? null : i })}
                    className="athletic-tap flex-1 rounded-lg athletic-mono transition-all"
                    style={{
                      height: 44,
                      background: selected ? color : `${color}1F`,
                      color: selected ? P.bg : color,
                      border: selected ? `2px solid ${color}` : `1px solid ${color}33`,
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Gewicht-per-set wordt al ingevoerd in de set-rijen hierboven —
            niet hier nog een keer vragen. RPE komt aan het einde van de
            sessie (1× voor de hele workout) ipv per oefening. */}

        <DarkButton onClick={onSave} size="lg">
          OPSLAAN
        </DarkButton>
      </div>
    </div>
  )
}

// ─── Minute picker — horizontale scroll-wheel met snap per minuut ────────────

function MinutePicker({
  value,
  onChange,
  min = 1,
  max = 120,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  const TICK_W = 14 // px per minuut-tick
  const containerRef = useRef<HTMLDivElement>(null)
  const programmaticScroll = useRef(false)
  const ticks = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max])

  // Scroll naar waarde wanneer prop verandert (incl. eerste render).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const targetLeft = (value - min) * TICK_W
    if (Math.abs(el.scrollLeft - targetLeft) < 1) return
    programmaticScroll.current = true
    el.scrollTo({ left: targetLeft, behavior: 'auto' })
    // Reset flag na frame zodat user-scroll weer telt.
    requestAnimationFrame(() => { programmaticScroll.current = false })
  }, [value, min])

  function handleScroll() {
    if (programmaticScroll.current) return
    const el = containerRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / TICK_W)
    const next = Math.max(min, Math.min(max, min + idx))
    if (next !== value) onChange(next)
  }

  return (
    <div className="relative" style={{ height: 56 }}>
      {/* Center-indicator: oranje verticale lijn met getal-pijl */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: '50%',
          width: 2,
          marginLeft: -1,
          background: P.brand,
          borderRadius: 1,
          zIndex: 2,
        }}
      />
      {/* Fade-outs links/rechts zodat de strook visueel afloopt */}
      <div
        aria-hidden
        className="absolute top-0 bottom-0 left-0 pointer-events-none"
        style={{
          width: 32,
          background: `linear-gradient(to right, ${P.surface}, rgba(20,26,27,0))`,
          zIndex: 1,
        }}
      />
      <div
        aria-hidden
        className="absolute top-0 bottom-0 right-0 pointer-events-none"
        style={{
          width: 32,
          background: `linear-gradient(to left, ${P.surface}, rgba(20,26,27,0))`,
          zIndex: 1,
        }}
      />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-x-auto overflow-y-hidden scrollbar-none"
        style={{
          scrollSnapType: 'x mandatory',
          // Half-screen padding zodat eerste/laatste tick onder de center-cursor kan
          paddingLeft: 'calc(50% - 1px)',
          paddingRight: 'calc(50% - 1px)',
          WebkitOverflowScrolling: 'touch',
          height: '100%',
        }}
      >
        <div className="flex items-end h-full" style={{ minWidth: ticks.length * TICK_W }}>
          {ticks.map(m => {
            const isMajor = m % 5 === 0
            const isTen = m % 10 === 0
            return (
              <div
                key={m}
                className="flex flex-col items-center justify-end shrink-0"
                style={{
                  width: TICK_W,
                  height: '100%',
                  scrollSnapAlign: 'center',
                }}
              >
                {isTen && (
                  <span
                    className="athletic-mono"
                    style={{
                      color: P.inkMuted,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      marginBottom: 2,
                    }}
                  >
                    {m}
                  </span>
                )}
                <div
                  style={{
                    width: 2,
                    height: isTen ? 18 : isMajor ? 14 : 8,
                    background: isMajor ? P.ink : P.inkDim,
                    borderRadius: 1,
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Session Summary ──────────────────────────────────────────────────────────

function SessionSummary({
  exercises,
  feedback,
  setWeights,
  elapsed,
  onFinish,
  isSaving,
  tendinopathyMode,
  sessionOneRmPRs,
}: {
  exercises: SessionExercise[]
  feedback: Record<string, FeedbackEntry>
  setWeights: Record<string, number[]>
  elapsed: number
  onFinish: (
    sessionSmiley: number | null,
    sessionRpe: number | null,
    sessionPain: number | null,
    durationSeconds: number,
  ) => void
  isSaving: boolean
  tendinopathyMode?: boolean
  sessionOneRmPRs?: Record<string, number>
}) {
  const [sessionSmiley, setSessionSmiley] = useState<number | null>(null)
  const [sessionRpe, setSessionRpe] = useState<number | null>(null)
  const [sessionPain, setSessionPain] = useState<number | null>(null)
  const [durationMinutes, setDurationMinutes] = useState(() => Math.max(1, Math.round(elapsed / 60)))

  const now = new Date()
  const finishTime = now
  const startTime = new Date(now.getTime() - durationMinutes * 60 * 1000)
  const fmtTime = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

  const smiliesGiven = Object.values(feedback).filter(f => f.smiley !== null)
  const avgSmiley = smiliesGiven.length > 0
    ? smiliesGiven.reduce((sum, f) => sum + (f.smiley ?? 0), 0) / smiliesGiven.length
    : null
  const avgSmileyIdx = avgSmiley !== null ? Math.round(avgSmiley) - 1 : null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg w-full mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div className="text-center">
          <div className="text-5xl mb-3">🎉</div>
          <Kicker>SESSIE VOLTOOID</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(40px, 10vw, 64px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            KLAAR
          </h1>
          <MetaLabel style={{ marginTop: 6 }}>{exercises.length} OEFENINGEN</MetaLabel>
        </div>

        {/* Editable duration — scroll picker, snap per minuut */}
        <Tile>
          <div className="flex items-center justify-between mb-3">
            <MetaLabel>DUUR</MetaLabel>
            <span
              className="athletic-mono"
              style={{ color: P.brand, fontSize: 22, fontWeight: 900 }}
            >
              {durationMinutes}<span style={{ color: P.inkMuted, fontSize: 12, marginLeft: 4 }}>min</span>
            </span>
          </div>
          <MinutePicker value={durationMinutes} onChange={setDurationMinutes} />
          <div className="flex justify-between mt-3">
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
              Start: {fmtTime(startTime)}
            </span>
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
              Einde: {fmtTime(finishTime)}
            </span>
          </div>
        </Tile>

        {/* Avg feeling */}
        {avgSmileyIdx !== null && (
          <Tile>
            <div className="flex items-center gap-3">
              <div className="text-3xl">{SMILIES[avgSmileyIdx]}</div>
              <div>
                <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>Gemiddeld gevoel</p>
                <MetaLabel style={{ textTransform: 'none', fontWeight: 500 }}>
                  {SMILEY_LABELS[avgSmileyIdx]} · {avgSmiley?.toFixed(1)}/5
                </MetaLabel>
              </div>
            </div>
          </Tile>
        )}

        {/* 1RM PRs */}
        {sessionOneRmPRs && Object.keys(sessionOneRmPRs).length > 0 && (
          <Tile accentBar={P.lime}>
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4" style={{ color: P.lime }} />
              <p
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 13, fontWeight: 900, letterSpacing: '0.12em' }}
              >
                NIEUW(E) 1RM PR(S)! 🎉
              </p>
            </div>
            <div className="space-y-1">
              {exercises.filter(e => sessionOneRmPRs[e.uid]).map(e => (
                <div key={e.uid} className="flex items-center justify-between">
                  <span className="truncate" style={{ color: P.inkMuted, fontSize: 13 }}>{e.name}</span>
                  <span
                    className="athletic-mono"
                    style={{ color: P.lime, fontSize: 14, fontWeight: 900 }}
                  >
                    {sessionOneRmPRs[e.uid]} kg
                  </span>
                </div>
              ))}
            </div>
          </Tile>
        )}

        {/* Exercise recap */}
        <Tile>
          <MetaLabel style={{ marginBottom: 8 }}>OEFENINGEN</MetaLabel>
          <div className="space-y-3">
            {exercises.map(e => {
              const fb = feedback[e.uid]
              const pain = tendinopathyMode ? (fb?.painDuring ?? fb?.pain) : fb?.pain
              return (
                <div key={e.uid} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                    style={{ background: fb?.smiley ? SMILEY_COLORS[(fb.smiley - 1)] + '22' : P.surfaceHi }}
                  >
                    {fb?.smiley ? SMILIES[fb.smiley - 1] : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>{e.name}</p>
                    <p
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}
                    >
                      {e.sets} sets
                      {(() => {
                        const ws = setWeights[e.uid]
                        if (ws && ws.some(w => w > 0)) {
                          const unique = [...new Set(ws.filter(w => w > 0))]
                          return ` · ${unique.length === 1 ? unique[0] + ' kg' : ws.map(w => w + 'kg').join(' / ')}`
                        }
                        return fb?.weight ? ` · ${fb.weight}kg` : ''
                      })()}
                      {pain !== null && pain !== undefined ? ` · pijn ${pain}/10` : ''}
                    </p>
                  </div>
                  {pain !== null && pain !== undefined && (
                    <div
                      className="w-6 h-6 rounded-full athletic-mono flex items-center justify-center shrink-0"
                      style={{ background: painColor(pain ?? 0, tendinopathyMode), color: P.bg, fontSize: 10, fontWeight: 900 }}
                    >
                      {pain}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Tile>

        {/* Tendinopathie follow-up reminder */}
        {tendinopathyMode && (
          <Tile accentBar={P.brand}>
            <div className="flex items-start gap-3">
              <Bell className="w-4 h-4 mt-0.5 shrink-0" style={{ color: P.brand }} />
              <div>
                <p
                  className="athletic-mono"
                  style={{ color: P.brand, fontSize: 12, fontWeight: 900, letterSpacing: '0.12em' }}
                >
                  24U FOLLOW-UP HERINNERING
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
                  Morgenochtend ontvang je een herinnering om de pijn 24u na de sessie en de ochtend stijfheid in te vullen.
                </p>
              </div>
            </div>
          </Tile>
        )}

        {/* Overall session smiley */}
        <Tile>
          <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>Hoe voelt je lichaam nu?</p>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>Totale sessie gevoel</MetaLabel>
          <div className="flex gap-2 justify-between mt-3">
            {SMILIES.map((emoji, i) => {
              const val = i + 1
              const selected = sessionSmiley === val
              return (
                <button
                  key={val}
                  onClick={() => setSessionSmiley(selected ? null : val)}
                  className="athletic-tap flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all"
                  style={{
                    minHeight: 44,
                    background: selected ? SMILEY_COLORS[i] + '22' : P.surfaceHi,
                    border: selected ? `2px solid ${SMILEY_COLORS[i]}` : `2px solid ${P.line}`,
                  }}
                >
                  <span className="text-2xl">{emoji}</span>
                  <span
                    className="athletic-mono"
                    style={{ color: selected ? SMILEY_COLORS[i] : P.inkMuted, fontSize: 10, fontWeight: 700 }}
                  >
                    {SMILEY_LABELS[i]}
                  </span>
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Session-RPE — gevraagde 1× per workout, gaat in de workload-
            berekening (sRPE = RPE × duur). Verplicht. */}
        <Tile>
          <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>Hoe zwaar was de sessie?</p>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            RPE 1 (heel licht) — 10 (maximaal). Gebruikt voor je workload.
          </MetaLabel>
          <div className="grid grid-cols-10 gap-1 mt-3">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(val => {
              const selected = sessionRpe === val
              const color = val <= 3 ? P.lime : val <= 6 ? P.gold : P.danger
              return (
                <button
                  key={val}
                  onClick={() => setSessionRpe(selected ? null : val)}
                  className="athletic-tap rounded-lg athletic-mono transition-all"
                  style={{
                    height: 40,
                    background: selected ? color : P.surfaceHi,
                    color: selected ? P.bg : P.inkMuted,
                    border: selected ? `2px solid ${color}` : `1px solid ${P.line}`,
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {val}
                </button>
              )
            })}
          </div>
          {sessionRpe === null && (
            <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 6 }}>Verplicht voor workload-tracking.</p>
          )}
        </Tile>

        {/* Sessie-pijn — overall pijn-score voor de hele workout, optioneel */}
        <Tile>
          <div className="flex items-baseline justify-between">
            <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>Pijn tijdens de sessie</p>
            <span
              className="athletic-mono"
              style={{
                color: sessionPain !== null ? painColor(sessionPain) : P.inkMuted,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {sessionPain !== null ? `${sessionPain}/10` : 'Geen'}
            </span>
          </div>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            0 = geen pijn · 10 = niet meer te dragen.
          </MetaLabel>
          <div className="grid grid-cols-11 gap-1 mt-3">
            {Array.from({ length: 11 }, (_, i) => i).map(val => {
              const selected = sessionPain === val
              const color = painColor(val)
              return (
                <button
                  key={val}
                  onClick={() => setSessionPain(selected ? null : val)}
                  className="athletic-tap rounded-lg athletic-mono transition-all"
                  style={{
                    height: 36,
                    background: selected ? color : `${color}1F`,
                    color: selected ? P.bg : color,
                    border: selected ? `2px solid ${color}` : `1px solid ${color}33`,
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  {val}
                </button>
              )
            })}
          </div>
        </Tile>

        <DarkButton
          onClick={() => onFinish(sessionSmiley, sessionRpe, sessionPain, durationMinutes * 60)}
          disabled={isSaving || sessionRpe === null}
          loading={isSaving}
          size="lg"
        >
          {isSaving ? 'OPSLAAN…' : 'OPSLAAN & AFSLUITEN'}
        </DarkButton>
      </div>
    </div>
  )
}

// ─── Main Session Page ────────────────────────────────────────────────────────

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionPageInner />
    </Suspense>
  )
}

function SessionPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()

  // Catch-up flow: ?week=N&day=N → laad een specifieke (gemiste) dag i.p.v. vandaag
  const catchUpWeek = Number(searchParams.get('week')) || undefined
  const catchUpDay = Number(searchParams.get('day')) || undefined
  const isCatchUp = catchUpWeek !== undefined && catchUpDay !== undefined

  const { data: sessionData, isLoading } = trpc.patient.getTodayExercises.useQuery(
    isCatchUp ? { week: catchUpWeek, day: catchUpDay } : undefined,
  )
  const logSession = trpc.patient.logSession.useMutation()

  const exercises: SessionExercise[] = sessionData?.exercises ?? []

  const [restTimerEnabled] = useBoolPref(PREF_REST_TIMER_ENABLED, true)
  const [viewModeRaw, setViewMode] = useStringPref(PREF_SESSION_VIEW_MODE, 'focus')
  const viewMode: 'focus' | 'overview' = viewModeRaw === 'overview' ? 'overview' : 'focus'
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [setsCompleted, setSetsCompleted] = useState<Record<string, number>>({})
  const [done, setDone] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<Record<string, FeedbackEntry>>({})
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null)
  const [showRestTimer, setShowRestTimer] = useState(false)
  const [restSecondsLeft, setRestSecondsLeft] = useState(60)
  const [restDuration, setRestDuration] = useState(60)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState<'session' | 'summary'>('session')
  const [showCuesFor, setShowCuesFor] = useState<string | null>(null)
  const [setWeights, setSetWeights] = useState<Record<string, number[]>>({})
  const [showExtraFor, setShowExtraFor] = useState<string | null>(null)
  const [extraReps, setExtraReps] = useState<Record<string, number>>({})
  // 1RM tracking: estimated 1RM per exercise (current session best) and PR tracker
  const [sessionOneRm, setSessionOneRm] = useState<Record<string, number>>({})  // uid -> best estimated 1RM this session
  const [sessionPRs, setSessionPRs] = useState<Record<string, number>>({})      // uid -> new PR value (if PR set)
  // Hoogste ooit gelogde 1RM per exerciseId — echte data uit de DB.
  const { data: prevOneRm = {} } = trpc.patient.getPersonalBests.useQuery(undefined, {
    staleTime: 60_000,
  })

  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const doneRef = useRef(done)
  useEffect(() => { doneRef.current = done }, [done])

  // ── Resume / draft-backup ───────────────────────────────────────────────────
  type SessionDraft = {
    setsCompleted: Record<string, number>
    done: string[]
    feedback: Record<string, FeedbackEntry>
    setWeights: Record<string, number[]>
    extraReps: Record<string, number>
    sessionOneRm: Record<string, number>
    sessionPRs: Record<string, number>
    expanded: string | null
    phase: 'session' | 'summary'
  }

  const draftKey = useMemo(() => {
    const pid = sessionData?.program?.id ?? 'no-program'
    const week = isCatchUp ? catchUpWeek : (sessionData?.program?.currentWeek ?? 1)
    const day = isCatchUp ? catchUpDay : (sessionData?.program?.currentDay ?? 1)
    return `mbt-session-draft-${pid}-${week}-${day}`
  }, [sessionData?.program?.id, sessionData?.program?.currentWeek, sessionData?.program?.currentDay, isCatchUp, catchUpWeek, catchUpDay])

  const [resumeChecked, setResumeChecked] = useState(false)
  const [showResumeBanner, setShowResumeBanner] = useState(false)

  // Detecteer een bestaand concept zodra we de sessie-data hebben.
  useEffect(() => {
    if (resumeChecked) return
    if (!sessionData?.program?.id) return
    const draft = loadDraft<SessionDraft>(draftKey)
    if (draft && (draft.done?.length || Object.keys(draft.setsCompleted ?? {}).length)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowResumeBanner(true)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResumeChecked(true)
  }, [draftKey, resumeChecked, sessionData?.program?.id])

  function handleResume() {
    const draft = loadDraft<SessionDraft>(draftKey)
    if (draft) {
      setSetsCompleted(draft.setsCompleted ?? {})
      setDone(new Set(draft.done ?? []))
      setFeedback(draft.feedback ?? {})
      setSetWeights(draft.setWeights ?? {})
      setExtraReps(draft.extraReps ?? {})
      setSessionOneRm(draft.sessionOneRm ?? {})
      setSessionPRs(draft.sessionPRs ?? {})
      if (draft.expanded) setExpanded(draft.expanded)
      if (draft.phase === 'summary') setPhase('summary')
    }
    setShowResumeBanner(false)
  }

  function handleResetDraft() {
    clearStoredDraft(draftKey)
    setShowResumeBanner(false)
  }

  // Sla de hele sessie-staat continu op (alleen na resume-keuze, en alleen
  // zolang de sessie loopt — niet meer wanneer 'm gefinaliseerd is op de server).
  useDraftBackup<SessionDraft>({
    key: draftKey,
    value: {
      setsCompleted,
      done: [...done],
      feedback,
      setWeights,
      extraReps,
      sessionOneRm,
      sessionPRs,
      expanded,
      phase,
    },
    enabled: !showResumeBanner && !!sessionData?.program?.id,
  })

  // Step-structuur (alleen welke uids horen bij welke stap) — bewust een
  // memo vóór alle early-returns zodat de hooks-volgorde constant blijft.
  // Een step = losse oefening óf een complete superset.
  const stepUids: string[][] = useMemo(() => {
    const processed = new Set<string>()
    const groups = new Map<string, string[]>()
    exercises.forEach(e => {
      if (!e.supersetGroup) return
      const g = groups.get(e.supersetGroup) ?? []
      g.push(e.uid)
      groups.set(e.supersetGroup, g)
    })
    const out: string[][] = []
    exercises.forEach(e => {
      if (e.supersetGroup) {
        if (processed.has(e.supersetGroup)) return
        processed.add(e.supersetGroup)
        out.push(groups.get(e.supersetGroup) ?? [e.uid])
      } else {
        out.push([e.uid])
      }
    })
    return out
  }, [exercises])

  // Set initial expanded after exercises load
  useEffect(() => {
    if (exercises.length > 0 && expanded === null) {
      setExpanded(exercises[0].uid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.length])

  // Spring bij eerste render naar de eerste nog-niet-voltooide stap. Cruciaal
  // bij resume: als iemand 4 oefeningen heeft gedaan moet stap-voor-stap niet
  // teruggaan naar 1. Doe dit maar één keer per page-load.
  const initialStepSyncedRef = useRef(false)
  useEffect(() => {
    if (initialStepSyncedRef.current) return
    if (stepUids.length === 0) return
    initialStepSyncedRef.current = true
    const firstPending = stepUids.findIndex(uids => !uids.every(uid => done.has(uid)))
    if (firstPending > 0) {
      setCurrentStepIndex(firstPending)
    }
  }, [stepUids, done])

  // In focus-mode: spring de eerste niet-afgevinkte oefening van de huidige
  // stap automatisch open zodra de stap wijzigt. We overschrijven niet als
  // de gebruiker handmatig een ándere oefening binnen de huidige stap kiest
  // (bv. een tweede superset-oefening uitklappen).
  useEffect(() => {
    if (viewMode !== 'focus') return
    const stepKeys = stepUids[currentStepIndex]
    if (!stepKeys || stepKeys.length === 0) return
    if (expanded && stepKeys.includes(expanded)) return
    const firstOpen = stepKeys.find(uid => !done.has(uid)) ?? stepKeys[0]
    setExpanded(firstOpen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepIndex, viewMode, stepUids.length])

  // Session elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Cancel an in-flight rest timer if the user disables the preference mid-session.
  useEffect(() => {
    if (!restTimerEnabled && showRestTimer) {
      clearInterval(restTimerRef.current!)
      setShowRestTimer(false)
    }
  }, [restTimerEnabled, showRestTimer])

  // Rest timer countdown
  useEffect(() => {
    if (!showRestTimer) return
    restTimerRef.current = setInterval(() => {
      setRestSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current!)
          setShowRestTimer(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(restTimerRef.current!)
  }, [showRestTimer])

  const doneCount = done.size
  const progress = exercises.length > 0 ? (doneCount / exercises.length) * 100 : 0
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  const startRestTimer = useCallback((restSec: number) => {
    clearInterval(restTimerRef.current!)
    setRestDuration(restSec)
    setRestSecondsLeft(restSec)
    setShowRestTimer(true)
  }, [])

  const skipRest = useCallback(() => {
    clearInterval(restTimerRef.current!)
    setShowRestTimer(false)
  }, [])

  const adjustSetWeight = useCallback((uid: string, setIdx: number, delta: number) => {
    setSetWeights(prev => {
      const arr = [...(prev[uid] ?? [])]
      arr[setIdx] = Math.max(0, Math.round(((arr[setIdx] ?? 0) + delta) * 10) / 10)
      return { ...prev, [uid]: arr }
    })
  }, [])

  const updateOneRm = useCallback((uid: string, exerciseId: string, weights: number[], reps: number) => {
    const best = Math.max(...weights.filter(w => w > 0), 0)
    if (best <= 0) return
    const estimated = calcEpley(best, reps)
    setSessionOneRm(prev => {
      const current = prev[uid] ?? 0
      if (estimated <= current) return prev
      // Vergelijk met all-time best uit de DB.
      const prevBest = prevOneRm[exerciseId] ?? 0
      if (estimated > prevBest) {
        setSessionPRs(p => ({ ...p, [uid]: estimated }))
      }
      return { ...prev, [uid]: estimated }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markSetDone = useCallback((uid: string, restSec: number, totalSets: number) => {
    setSetsCompleted(prev => {
      const next = (prev[uid] ?? 0) + 1
      if (next < totalSets && restTimerEnabled) {
        startRestTimer(restSec)
      }
      return { ...prev, [uid]: next }
    })
  }, [startRestTimer, restTimerEnabled])

  const markExerciseDone = useCallback((uid: string) => {
    // Smiley/pijn/RPE/weight worden alleen aan het einde van de hele sessie
    // gevraagd — geen per-oefening popup meer. Uitzondering: tendinopathie-
    // programma's, daar IS pijn-tijdens-oefening de hele essentie van het
    // protocol (Silbernagel) en moet die per-oefening worden vastgelegd.
    const isTendinopathy = sessionData?.program?.tendinopathyMode ?? false

    if (isTendinopathy) {
      setFeedback(prev => ({
        ...prev,
        [uid]: prev[uid] ?? { smiley: null, pain: null, weight: null, rpe: null, painDuring: null },
      }))
      clearInterval(feedbackTimerRef.current!)
      setShowFeedbackFor(uid)
      return
    }

    // Geen popup → markeer direct done + spring naar volgende oefening.
    setDone(prev => new Set(prev).add(uid))
    const next = exercises.find(e => !doneRef.current.has(e.uid) && e.uid !== uid)
    setExpanded(next?.uid ?? null)
  }, [exercises, sessionData?.program?.tendinopathyMode])

  const saveFeedback = useCallback((uid: string) => {
    setDone(prev => new Set(prev).add(uid))
    setShowFeedbackFor(null)
    clearInterval(feedbackTimerRef.current!)
    const next = exercises.find(e => !doneRef.current.has(e.uid) && e.uid !== uid)
    setExpanded(next?.uid ?? null)
  }, [exercises])

  const handleFeedbackChange = useCallback((uid: string, partial: Partial<FeedbackEntry>) => {
    setFeedback(prev => ({ ...prev, [uid]: { ...prev[uid], ...partial } }))
  }, [])

  const handleFinish = useCallback(async (
    sessionSmiley: number | null,
    sessionRpe: number | null,
    sessionPain: number | null,
    durationSeconds: number,
  ) => {
    const tendinopathyMode = sessionData?.program?.tendinopathyMode ?? false
    // Expliciete sessie-pijn als die is ingevuld, anders fallback op gemiddelde
    // van per-oefening pijn-scores zodat oude flows niets verliezen.
    const perExercisePains = Object.values(feedback).filter(f => f.pain !== null).map(f => f.pain!)
    const avgPerExercisePain =
      perExercisePains.length > 0
        ? Math.round(perExercisePains.reduce((a, b) => a + b, 0) / perExercisePains.length)
        : null
    const painLevel = sessionPain ?? avgPerExercisePain
    // Expliciete RPE direct gebruiken voor exertionLevel (workload sRPE = RPE × duur).
    // Smiley blijft losse "hoe voelt je lichaam"-indicator, maar telt niet mee in workload.
    const exertionLevel = sessionRpe

    const completedAt = new Date()
    const scheduledAt = new Date(completedAt.getTime() - durationSeconds * 1000)

    await logSession.mutateAsync({
      programId: sessionData?.program?.id,
      scheduledAt: scheduledAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      painLevel,
      exertionLevel,
      exercises: exercises.map(e => {
        const weights = setWeights[e.uid] ?? []
        const lastSetWeight = weights.filter(w => w > 0).slice(-1)[0] ?? null
        const feedbackWeight = feedback[e.uid]?.weight ?? null
        const finalWeight = lastSetWeight ?? (feedbackWeight && feedbackWeight > 0 ? feedbackWeight : null)
        const reps = extraReps[e.uid] ?? e.reps
        const programTrack1rm = sessionData?.program?.trackOneRepMax ?? false
        const estimated1rm = (programTrack1rm && finalWeight && finalWeight > 0)
          ? calcEpley(finalWeight, reps)
          : null
        return {
          exerciseId: e.exerciseId,
          setsCompleted: setsCompleted[e.uid] ?? 0,
          repsCompleted: reps,
          painLevel: tendinopathyMode ? (feedback[e.uid]?.painDuring ?? null) : (feedback[e.uid]?.pain ?? null),
          weight: finalWeight,
          estimatedOneRepMax: estimated1rm,
          painDuring: tendinopathyMode ? (feedback[e.uid]?.painDuring ?? null) : null,
        }
      }),
    })

    // Invalidate all patient queries so dashboard shows fresh data immediately
    await Promise.all([
      utils.patient.getWorkloadSessions.invalidate(),
      utils.patient.getRecoverySessions.invalidate(),
      utils.patient.getSessionHistory.invalidate(),
      utils.patient.getTodayExercises.invalidate(),
      utils.patient.getActiveProgram.invalidate(),
    ])

    // Sessie is succesvol gelogd → concept opruimen.
    clearStoredDraft(draftKey)

    router.push('/patient/dashboard')
  }, [sessionData, feedback, elapsed, exercises, setsCompleted, extraReps, logSession, router, utils, draftKey])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <span className="athletic-mono text-[11px]" style={{ color: P.inkMuted, letterSpacing: '0.16em' }}>SESSIE LADEN…</span>
      </div>
    )
  }

  // Flexible-schedule programma: weekly target bereikt → speciale "lekker
  // bezig" boodschap ipv lege rustdag-screen. Patient kan na de reset op
  // maandag weer beginnen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flexProg = sessionData?.program as any
  if (flexProg?.flexibleSchedule && flexProg?.weeklyTargetReached) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: P.bg, color: P.ink }}>
        <div className="text-6xl">🎉</div>
        <p style={{ color: P.lime, fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>
          Goed gedaan!
        </p>
        <p style={{ color: P.ink, fontSize: 15, maxWidth: 360, lineHeight: '22px' }}>
          Je hebt alle programma's voor deze week voltooid — lekker bezig!
        </p>
        <div
          className="athletic-mono px-3 py-1 rounded-full mt-1"
          style={{
            background: 'rgba(232,122,85,0.10)',
            border: `1px solid ${P.lime}`,
            color: P.lime,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          {flexProg.completedThisWeek} / {flexProg.weeklyTarget} deze week
        </div>
        <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
          De teller reset elke maandag — rust uit en kom terug.
        </p>
        <DarkButton variant="secondary" onClick={() => router.push('/patient/dashboard')}>
          Terug naar dashboard
        </DarkButton>
      </div>
    )
  }

  if (!sessionData?.program || exercises.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: P.bg, color: P.ink }}>
        <div className="text-5xl">🏖️</div>
        <p style={{ color: P.ink, fontSize: 18, fontWeight: 800 }}>Geen sessie vandaag</p>
        <p style={{ color: P.inkMuted, fontSize: 13 }}>Je hebt vandaag geen oefeningen gepland. Geniet van je rustdag!</p>
        <DarkButton variant="secondary" onClick={() => router.push('/patient/dashboard')}>
          Terug naar dashboard
        </DarkButton>
      </div>
    )
  }

  if (showResumeBanner) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: P.bg, color: P.ink }}>
        <div
          className="w-full max-w-sm rounded-2xl p-6 space-y-4"
          style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: P.surfaceHi, border: `1px solid ${P.brand}` }}
          >
            <RotateCcw className="w-5 h-5" style={{ color: P.brand }} />
          </div>
          <div>
            <Kicker>Open sessie</Kicker>
            <h2 className="text-lg font-bold mt-1" style={{ color: P.ink }}>
              Verder waar je was?
            </h2>
            <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
              Je hebt deze sessie eerder gestart maar nog niet afgerond. Wil je daar verder gaan?
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <DarkButton onClick={handleResume} size="lg">
              Verder waar je was
            </DarkButton>
            <DarkButton variant="secondary" onClick={handleResetDraft}>
              Opnieuw beginnen
            </DarkButton>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'summary') {
    return (
      <SessionSummary
        exercises={exercises}
        feedback={feedback}
        setWeights={setWeights}
        elapsed={elapsed}
        onFinish={handleFinish}
        isSaving={logSession.isPending}
        tendinopathyMode={sessionData?.program?.tendinopathyMode}
        sessionOneRmPRs={sessionPRs}
      />
    )
  }

  // Group exercises by superset
  const supersetGroups = new Map<string, SessionExercise[]>()
  exercises.forEach(e => {
    if (e.supersetGroup) {
      const g = supersetGroups.get(e.supersetGroup) ?? []
      g.push(e)
      supersetGroups.set(e.supersetGroup, g)
    }
  })

  const renderExercise = (e: SessionExercise) => {
    const isDone = done.has(e.uid)
    const isExpanded = expanded === e.uid
    const sets = setsCompleted[e.uid] ?? 0
    const allSetsDone = sets >= e.sets
    const cues = COACHING_CUES[e.exerciseId] ?? []
    const variants = VARIANTS[e.exerciseId] ?? {}
    const showCues = showCuesFor === e.uid

    return (
      <div key={e.uid}>
        {/* Header row */}
        <button
          className="athletic-tap w-full flex items-center gap-3 text-left px-4 py-3"
          style={{ minHeight: 56 }}
          onClick={() => setExpanded(isExpanded ? null : e.uid)}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 athletic-mono transition-all"
            style={{
              background: isDone ? P.lime : allSetsDone && !isDone ? P.lime + '33' : P.surfaceHi,
              color: isDone ? P.bg : P.inkMuted,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {isDone ? '✓' : e.sets > 0 ? `${sets}/${e.sets}` : '—'}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn('truncate', isDone && 'line-through')}
              style={{ color: isDone ? P.inkMuted : P.ink, fontSize: 14, fontWeight: 700 }}
            >
              {e.name}
            </p>
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}
            >
              {e.sets} × {e.reps} {e.repUnit}
            </p>
          </div>
          {isExpanded
            ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: P.inkMuted }} />
            : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: P.inkMuted }} />
          }
        </button>

        {/* Done view — tap to review what you did */}
        {isExpanded && isDone && (() => {
          const fb = feedback[e.uid]
          return (
            <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: `1px solid ${P.line}` }}>
              <div className="space-y-1.5">
                {Array.from({ length: e.sets }, (_, i) => {
                  const w = setWeights[e.uid]?.[i] ?? 0
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 rounded-xl"
                      style={{ height: 44, background: P.lime + '15', border: `1px solid ${P.lime}33` }}
                    >
                      <span
                        className="athletic-mono"
                        style={{ color: P.lime, fontSize: 13, fontWeight: 800 }}
                      >
                        Set {i + 1} ✓
                      </span>
                      <span style={{ color: P.inkMuted, fontSize: 13 }}>{w > 0 ? `${w} kg` : '—'}</span>
                    </div>
                  )
                })}
              </div>
              {fb && (fb.smiley !== null || fb.pain !== null) && (
                <div className="flex items-center gap-3 px-1">
                  {fb.smiley !== null && <span className="text-2xl">{SMILIES[fb.smiley - 1]}</span>}
                  <span style={{ color: P.inkMuted, fontSize: 11 }}>
                    {fb.smiley !== null && SMILEY_LABELS[fb.smiley - 1]}
                    {fb.pain !== null && `${fb.smiley !== null ? ' · ' : ''}Pijn ${fb.pain}/10`}
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        {/* Expanded content */}
        {isExpanded && !isDone && (() => {
          // Therapeut-notes per programma-oefening overrulen de standaard
          // beschrijving uit de Exercise-library. Lege strings tellen niet.
          const note = e.notes?.trim() || ''
          const desc = e.description?.trim() || ''
          const instructie = note || desc || null
          const isCustom = note.length > 0
          return (
          <div className="px-4 pb-4 pt-3 space-y-4" style={{ borderTop: `1px solid ${P.line}` }}>
            {/* Video player */}
            {e.videoUrl && (
              <div className="rounded-2xl overflow-hidden bg-black aspect-video">
                <ReactPlayer
                  url={e.videoUrl}
                  width="100%"
                  height="100%"
                  controls
                  light
                  playIcon={
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ background: P.brand }}
                    >
                      <span style={{ color: P.bg, fontSize: 20, marginLeft: 4 }}>▶</span>
                    </div>
                  }
                />
              </div>
            )}

            {/* Uitleg/instructie — therapeut-notes overrulen default beschrijving */}
            {instructie && (
              <div
                className="rounded-2xl px-4 py-3"
                style={{
                  background: isCustom ? 'rgba(232,122,85,0.08)' : P.surfaceHi,
                  border: `1px solid ${isCustom ? P.brand + '55' : P.line}`,
                }}
              >
                {isCustom && (
                  <p
                    className="athletic-mono mb-1"
                    style={{ color: P.brand, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em' }}
                  >
                    NOTITIE VAN JE THERAPEUT
                  </p>
                )}
                <p style={{ color: P.ink, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-line' }}>
                  {instructie}
                </p>
              </div>
            )}

            {/* Params grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ParamPill label="Sets" value={String(e.sets)} />
              <ParamPill label="Reps" value={`${e.reps} ${e.repUnit}`} />
              <ParamPill label="Rust" value={`${e.restTime}s`} />
              <ParamPill label="Sets klaar" value={`${sets}/${e.sets}`} highlight />
            </div>

            {/* Set buttons — one per set for tactile feedback, with per-set weight */}
            <div className="space-y-2">
              {Array.from({ length: e.sets }, (_, i) => {
                const setNum = i + 1
                const isSetDone = sets >= setNum
                const w = setWeights[e.uid]?.[i] ?? 0
                return (
                  <div key={setNum} className="space-y-1">
                    <button
                      disabled={isSetDone || sets < setNum - 1}
                      onClick={() => !isSetDone && markSetDone(e.uid, e.restTime || 60, e.sets)}
                      className="athletic-tap w-full flex items-center justify-between px-4 rounded-2xl athletic-mono transition-all"
                      style={{
                        height: 48,
                        background: isSetDone
                          ? P.lime + '22'
                          : sets === setNum - 1 ? P.surfaceHi : P.surface,
                        color: isSetDone
                          ? P.lime
                          : sets === setNum - 1 ? P.ink : P.inkMuted,
                        border: isSetDone ? `1.5px solid ${P.lime}` : `1.5px solid ${P.line}`,
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <span>Set {setNum}</span>
                      <span>{isSetDone ? `✓ ${w > 0 ? w + ' kg' : 'Klaar'}` : sets === setNum - 1 ? 'Tik om te voltooien →' : '—'}</span>
                    </button>
                    {(isSetDone || sets === setNum - 1) && (
                      <div className="flex items-center gap-2 px-2 py-1">
                        <span style={{ color: P.inkMuted, fontSize: 11 }} className="flex-1">Gewicht set {setNum}</span>
                        <button
                          className="athletic-tap w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: P.surfaceHi, color: P.ink }}
                          onClick={() => {
                            adjustSetWeight(e.uid, i, -2.5)
                            if (sessionData?.program?.trackOneRepMax) {
                              const newWeights = [...(setWeights[e.uid] ?? [])]
                              newWeights[i] = Math.max(0, Math.round(((newWeights[i] ?? 0) - 2.5) * 10) / 10)
                              updateOneRm(e.uid, e.exerciseId, newWeights, extraReps[e.uid] ?? e.reps)
                            }
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="athletic-mono w-14 text-center"
                          style={{ color: P.ink, fontSize: 13, fontWeight: 800 }}
                        >
                          {w} kg
                        </span>
                        <button
                          className="athletic-tap w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: P.surfaceHi, color: P.ink }}
                          onClick={() => {
                            adjustSetWeight(e.uid, i, 2.5)
                            if (sessionData?.program?.trackOneRepMax) {
                              const newWeights = [...(setWeights[e.uid] ?? [])]
                              newWeights[i] = Math.round(((newWeights[i] ?? 0) + 2.5) * 10) / 10
                              updateOneRm(e.uid, e.exerciseId, newWeights, extraReps[e.uid] ?? e.reps)
                            }
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 1RM indicator */}
            {(sessionData?.program?.trackOneRepMax) && sets > 0 && (() => {
              const weights = setWeights[e.uid] ?? []
              const bestWeight = Math.max(...weights.filter(w => w > 0), 0)
              const reps = extraReps[e.uid] ?? e.reps
              const est1rm = bestWeight > 0 ? calcEpley(bestWeight, reps) : null
              const prevBest = prevOneRm[e.exerciseId] ?? 0
              const isPR = est1rm !== null && est1rm > prevBest && prevBest > 0
              return est1rm ? (
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
                  style={{
                    background: isPR ? P.lime + '22' : P.surfaceHi,
                    border: isPR ? `1.5px solid ${P.lime}` : `1.5px solid ${P.line}`,
                  }}
                >
                  <TrendingUp className="w-4 h-4 shrink-0" style={{ color: isPR ? P.lime : P.inkMuted }} />
                  <div className="flex-1">
                    <span style={{ color: P.inkMuted, fontSize: 11 }}>Geschatte 1RM</span>
                    <span
                      className="athletic-mono ml-2"
                      style={{ color: isPR ? P.lime : P.ink, fontSize: 14, fontWeight: 900 }}
                    >
                      {est1rm} kg
                    </span>
                  </div>
                  {isPR && (
                    <span
                      className="athletic-mono animate-bounce px-2 py-0.5 rounded-full"
                      style={{ background: P.lime, color: P.bg, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em' }}
                    >
                      NIEUW PR! 🎉
                    </span>
                  )}
                </div>
              ) : null
            })()}

            {/* Extra parameters collapsible */}
            <div>
              <button
                onClick={() => setShowExtraFor(showExtraFor === e.uid ? null : e.uid)}
                className="athletic-tap flex items-center gap-1.5 athletic-mono"
                style={{ color: P.inkMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}
              >
                {showExtraFor === e.uid
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />}
                EXTRA PARAMETERS
              </button>
              {showExtraFor === e.uid && (
                <div
                  className="mt-2 rounded-2xl p-3 space-y-2"
                  style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ color: P.ink, fontSize: 11, fontWeight: 600 }}>Reps gedaan</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="athletic-tap w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: P.surface, color: P.ink }}
                        onClick={() => setExtraReps(prev => ({ ...prev, [e.uid]: Math.max(1, (prev[e.uid] ?? e.reps) - 1) }))}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className="athletic-mono w-8 text-center"
                        style={{ color: P.ink, fontSize: 13, fontWeight: 800 }}
                      >
                        {extraReps[e.uid] ?? e.reps}
                      </span>
                      <button
                        className="athletic-tap w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: P.surface, color: P.ink }}
                        onClick={() => setExtraReps(prev => ({ ...prev, [e.uid]: (prev[e.uid] ?? e.reps) + 1 }))}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Coaching cues */}
            {cues.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCuesFor(showCues ? null : e.uid)}
                  className="athletic-tap flex items-center gap-1.5 athletic-mono mb-2"
                  style={{ color: P.brand, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  COACHING CUES {showCues ? '▲' : '▼'}
                </button>
                {showCues && (
                  <ul className="space-y-1.5">
                    {cues.map((cue, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2"
                        style={{ color: P.inkMuted, fontSize: 12 }}
                      >
                        <span
                          className="mt-px"
                          style={{ color: P.brand, fontWeight: 900 }}
                        >
                          ·
                        </span>
                        {cue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Variants */}
            {(variants.easier || variants.harder) && (
              <div className="space-y-1.5">
                {variants.easier && (
                  <div
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: 'rgba(244,194,97,0.10)' }}
                  >
                    <TrendingDown className="w-3.5 h-3.5 shrink-0" style={{ color: P.gold }} />
                    <span style={{ color: P.gold, fontSize: 12 }}>
                      <span style={{ fontWeight: 700 }}>Te moeilijk?</span> Probeer: {variants.easier}
                    </span>
                  </div>
                )}
                {variants.harder && (
                  <div
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: 'rgba(232,122,85,0.10)' }}
                  >
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: P.lime }} />
                    <span style={{ color: P.lime, fontSize: 12 }}>
                      <span style={{ fontWeight: 700 }}>Te makkelijk?</span> Probeer: {variants.harder}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Mark exercise done — only shown after all sets are ticked */}
            {allSetsDone && (
              <DarkButton
                onClick={() => markExerciseDone(e.uid)}
                size="lg"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                OEFENING AFGEROND
              </DarkButton>
            )}
          </div>
          )
        })()}
      </div>
    )
  }

  // Build ordered steps: een step = losse oefening óf een complete superset.
  // Zelfde data als oude `cards` maar gestructureerd zodat focus-mode er één
  // tegelijk kan tonen en de voortgang per stap kan tellen.
  type Step =
    | { kind: 'single'; key: string; uids: string[]; render: () => React.ReactElement }
    | { kind: 'superset'; key: string; uids: string[]; render: () => React.ReactElement }

  const processedSupersets = new Set<string>()
  const steps: Step[] = []

  exercises.forEach(e => {
    if (e.supersetGroup) {
      if (processedSupersets.has(e.supersetGroup)) return
      processedSupersets.add(e.supersetGroup)
      const group = supersetGroups.get(e.supersetGroup)!
      const colors = SUPERSET_COLORS[e.supersetGroup] ?? SUPERSET_COLORS.A
      const groupKey = e.supersetGroup
      steps.push({
        kind: 'superset',
        key: `superset-${groupKey}`,
        uids: group.map(ex => ex.uid),
        render: () => (
          <div
            key={`superset-${groupKey}`}
            className="rounded-2xl overflow-hidden"
            style={{ border: `2px solid ${colors.border}`, background: P.surface }}
          >
            <div
              className="px-4 py-1.5 flex items-center gap-1.5"
              style={{ background: colors.border + '22' }}
            >
              <span
                className="athletic-mono"
                style={{ color: colors.text, fontSize: 10, fontWeight: 900, letterSpacing: '0.16em' }}
              >
                SUPERSET {groupKey}
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${colors.border}33` }}>
              {group.map((ex, idx) => (
                <div key={ex.uid} style={{ borderTop: idx > 0 ? `1px solid ${colors.border}33` : 'none' }}>
                  {renderExercise(ex)}
                </div>
              ))}
            </div>
          </div>
        ),
      })
    } else {
      const uid = e.uid
      steps.push({
        kind: 'single',
        key: uid,
        uids: [uid],
        render: () => (
          <Tile key={uid} style={{ padding: 0 }}>
            {renderExercise(e)}
          </Tile>
        ),
      })
    }
  })

  // Houd currentStepIndex binnen bounds wanneer exercises veranderen.
  const safeStepIndex = Math.min(currentStepIndex, Math.max(0, steps.length - 1))

  // Voortgangsberekening voor de balk verschilt per modus:
  //  - overview: percentage afgevinkte oefeningen (zoals altijd).
  //  - focus:    percentage afgewerkte stappen — een stap telt als 'klaar'
  //              zodra alle uids in die stap in `done` staan.
  const stepsCompleted = stepUids.filter(uids => uids.every(uid => done.has(uid))).length
  const focusProgress = steps.length > 0 ? ((safeStepIndex + (stepsCompleted > safeStepIndex ? 1 : 0)) / steps.length) * 100 : 0
  const visibleProgress = viewMode === 'focus' ? focusProgress : progress

  const isLastStep = safeStepIndex >= steps.length - 1
  const currentStepUids = stepUids[safeStepIndex] ?? []
  const currentStepDone =
    currentStepUids.length > 0 && currentStepUids.every(uid => done.has(uid))
  const goPrevStep = () => setCurrentStepIndex(i => Math.max(0, i - 1))
  const goNextStep = () => setCurrentStepIndex(i => Math.min(steps.length - 1, i + 1))

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-10 px-4 pt-10 pb-3"
        style={{ background: P.bg, borderBottom: `1px solid ${P.line}` }}
      >
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.back()}
            className="athletic-tap p-2 -ml-2"
            style={{ minWidth: 44, minHeight: 44, color: P.ink }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <span
              className="athletic-mono"
              style={{ color: isCatchUp ? P.gold : P.inkMuted, fontSize: 10, letterSpacing: '0.14em', fontWeight: 700 }}
            >
              {isCatchUp ? 'INHALEN · ' : ''}{sessionData.program.name.toUpperCase()} · WEEK {sessionData.program.currentWeek} · DAG {sessionData.program.currentDay}
            </span>
            <p
              className="athletic-mono"
              style={{ color: P.ink, fontSize: 13, fontWeight: 800, marginTop: 2 }}
            >
              {viewMode === 'focus' ? (
                <>
                  <span style={{ color: P.brand }}>STAP {safeStepIndex + 1}</span>
                  <span style={{ color: P.inkMuted }}> / {steps.length}</span>
                </>
              ) : (
                <>
                  <span style={{ color: doneCount > 0 ? P.lime : P.ink }}>{doneCount}</span>
                  /{exercises.length} GEDAAN
                </>
              )}
            </p>
          </div>
          <div
            className="flex items-center gap-1 athletic-mono pr-1"
            style={{ color: P.inkMuted, fontSize: 12 }}
          >
            <Clock className="w-3.5 h-3.5" />
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-full overflow-hidden" style={{ background: P.surfaceHi }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ background: viewMode === 'focus' ? P.brand : P.lime, width: `${visibleProgress}%` }}
          />
        </div>

        {/* View-mode toggle */}
        <div
          className="mt-3 grid grid-cols-2 gap-1 p-1 rounded-2xl"
          style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
        >
          <button
            onClick={() => setViewMode('focus')}
            className="athletic-tap athletic-mono flex items-center justify-center gap-1.5 rounded-xl transition-all"
            style={{
              height: 36,
              background: viewMode === 'focus' ? P.surface : 'transparent',
              color: viewMode === 'focus' ? P.brand : P.inkMuted,
              border: viewMode === 'focus' ? `1px solid ${P.brand}` : '1px solid transparent',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
            }}
            aria-pressed={viewMode === 'focus'}
          >
            <Target className="w-3.5 h-3.5" />
            STAP VOOR STAP
          </button>
          <button
            onClick={() => setViewMode('overview')}
            className="athletic-tap athletic-mono flex items-center justify-center gap-1.5 rounded-xl transition-all"
            style={{
              height: 36,
              background: viewMode === 'overview' ? P.surface : 'transparent',
              color: viewMode === 'overview' ? P.ink : P.inkMuted,
              border: viewMode === 'overview' ? `1px solid ${P.lineStrong}` : '1px solid transparent',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
            }}
            aria-pressed={viewMode === 'overview'}
          >
            <LayoutList className="w-3.5 h-3.5" />
            OVERZICHT
          </button>
        </div>
      </div>

      {/* Exercise cards */}
      <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-3">
        {viewMode === 'focus' && steps.length > 0 ? (
          <>
            {steps[safeStepIndex].render()}

            {/* Navigatie: vorige / volgende stap */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={goPrevStep}
                disabled={safeStepIndex === 0}
                className="athletic-tap athletic-mono flex items-center justify-center gap-1.5 rounded-2xl transition-all"
                style={{
                  height: 52,
                  background: P.surfaceHi,
                  color: safeStepIndex === 0 ? P.inkDim : P.ink,
                  border: `1.5px solid ${P.line}`,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  opacity: safeStepIndex === 0 ? 0.5 : 1,
                }}
              >
                <ChevronLeft className="w-4 h-4" />
                VORIGE
              </button>
              {isLastStep ? (
                <DarkButton
                  onClick={() => setPhase('summary')}
                  size="lg"
                  variant={doneCount === exercises.length ? 'primary' : 'secondary'}
                >
                  {doneCount === exercises.length ? 'AFRONDEN 🎉' : 'AFRONDEN'}
                </DarkButton>
              ) : (
                <button
                  onClick={goNextStep}
                  className="athletic-tap athletic-mono flex items-center justify-center gap-1.5 rounded-2xl transition-all"
                  style={{
                    height: 52,
                    background: currentStepDone ? P.lime : P.brand,
                    color: P.bg,
                    border: `1.5px solid ${currentStepDone ? P.lime : P.brand}`,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                  }}
                >
                  VOLGENDE
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {steps.map(s => s.render())}

            {/* Finish CTA */}
            {doneCount > 0 && (
              <div className="pt-2">
                <DarkButton
                  onClick={() => setPhase('summary')}
                  size="lg"
                  variant={doneCount === exercises.length ? 'primary' : 'secondary'}
                >
                  {doneCount === exercises.length
                    ? 'SESSIE AFRONDEN 🎉'
                    : `DOORGAAN (${doneCount}/${exercises.length})`}
                </DarkButton>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rest Timer overlay */}
      {showRestTimer && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
        >
          <div
            className="rounded-3xl px-8 py-8 text-center space-y-2 mx-4 w-full max-w-xs"
            style={{ background: P.surface, border: `1px solid ${P.line}` }}
          >
            <Kicker>RUST</Kicker>
            <p style={{ color: P.inkMuted, fontSize: 11, marginBottom: 8 }}>Adem rustig door je neus</p>
            <CircularTimer seconds={restSecondsLeft} total={restDuration} onSkip={skipRest} />
          </div>
        </div>
      )}

      {/* Smiley feedback modal */}
      {showFeedbackFor && (
        <FeedbackModal
          exerciseName={exercises.find(e => e.uid === showFeedbackFor)?.name ?? ''}
          feedback={feedback[showFeedbackFor] ?? { smiley: null, pain: null, weight: null, rpe: null, painDuring: null }}
          onChange={partial => handleFeedbackChange(showFeedbackFor, partial)}
          onSave={() => saveFeedback(showFeedbackFor)}
          autoCloseIn={0}
          tendinopathyMode={sessionData?.program?.tendinopathyMode}
        />
      )}

    </div>
  )
}

function ParamPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-xl p-2 text-center"
      style={{ background: highlight ? P.lime + '22' : P.surfaceHi, border: `1px solid ${P.line}` }}
    >
      <p
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}
      >
        {label}
      </p>
      <p
        className="athletic-mono mt-1"
        style={{ color: highlight ? P.lime : P.ink, fontSize: 13, fontWeight: 900 }}
      >
        {value}
      </p>
    </div>
  )
}
