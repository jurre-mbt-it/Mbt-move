'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import {
  ChevronLeft, Clock, ChevronDown, ChevronUp, Lightbulb,
  TrendingUp, TrendingDown, CheckCircle2, SkipForward, Minus, Plus, Trophy, Bell,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player') as any, { ssr: false }) as any

// ─── Brand colors ─────────────────────────────────────────────────────────────
const MBT_GREEN = '#BEF264'
const MBT_DARK = '#1C2425'

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

// Pijn kleur: algemeen (niet-tendinopathie): <3 groen, 3-5 geel, 5+ rood
// Tendinopathie (Silbernagel): ≤5 groen, 5-7 geel, >7 rood
function painColor(pain: number, isTendinopathy = false): string {
  if (isTendinopathy) {
    if (pain <= 5) return MBT_GREEN
    if (pain <= 7) return '#f97316'
    return '#ef4444'
  }
  if (pain < 3) return MBT_GREEN
  if (pain <= 5) return '#f97316'
  return '#ef4444'
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
const SMILEY_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', MBT_GREEN]

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
          <circle cx="60" cy="60" r={r} fill="none" stroke="#f4f4f5" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke={MBT_GREEN} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{seconds}</span>
          <span className="text-xs text-muted-foreground">sec</span>
        </div>
      </div>
      <button
        onClick={onSkip}
        className="flex items-center gap-1.5 text-sm text-[#7B8889] font-medium"
      >
        <SkipForward className="w-4 h-4" /> Sla rust over
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
      <div className="absolute inset-0 bg-black/40" onClick={onSave} />
      <div
        className="relative w-full rounded-t-3xl px-5 pt-5 pb-8 space-y-5"
        style={{ background: '#fff', maxWidth: 480, margin: '0 auto' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-[rgba(255,255,255,0.08)] rounded-full mx-auto mb-1" />

        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-base">Hoe voelde het?</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{exerciseName}</p>
          </div>
          {autoCloseIn > 0 && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: MBT_GREEN }}
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
                className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all active:scale-95"
                style={{
                  background: selected ? SMILEY_COLORS[i] + '22' : '#1C2425',
                  border: selected ? `2px solid ${SMILEY_COLORS[i]}` : '2px solid transparent',
                  minHeight: 44,
                }}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[10px] font-medium" style={{ color: selected ? SMILEY_COLORS[i] : '#7B8889' }}>
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
              <p className="text-sm font-medium">Pijn tijdens oefening (NRS)</p>
              <span className="text-sm font-bold" style={{ color: feedback.painDuring !== null ? painColor(feedback.painDuring ?? 0, true) : '#7B8889' }}>
                {feedback.painDuring !== null ? `${feedback.painDuring}/10 — ${painLabel(feedback.painDuring ?? 0, true)}` : 'Geen'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onChange({ painDuring: feedback.painDuring === i ? null : i, pain: feedback.painDuring === i ? null : i })}
                  className="flex-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                  style={{
                    height: 44,
                    background: feedback.painDuring === i ? painColor(i, true) : '#1C2425',
                    color: feedback.painDuring === i ? 'white' : '#7B8889',
                  }}
                >
                  {i}
                </button>
              ))}
            </div>
            {(feedback.painDuring ?? 0) > 5 && (
              <div
                className="mt-2 rounded-xl px-3 py-2 text-xs font-medium"
                style={{
                  background: (feedback.painDuring ?? 0) > 7 ? 'rgba(248,113,113,0.10)' : '#fff7ed',
                  color: (feedback.painDuring ?? 0) > 7 ? '#F87171' : '#c2410c',
                }}
              >
                {(feedback.painDuring ?? 0) > 7
                  ? '⛔ Pijn te hoog — stop en consult de therapeut.'
                  : '⚠️ Verhoogde pijn. Noteer dit en monitor de volgende sessies.'}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Je ontvangt morgenochtend een herinnering voor de 24u-check.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Pijn tijdens oefening</p>
              <span className="text-sm font-bold" style={{ color: feedback.pain !== null ? painColor(feedback.pain ?? 0) : MBT_GREEN }}>
                {feedback.pain !== null ? `${feedback.pain}/10` : 'Geen'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onChange({ pain: feedback.pain === i ? null : i })}
                  className="flex-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                  style={{
                    height: 44,
                    background: feedback.pain === i ? painColor(i) : '#1C2425',
                    color: feedback.pain === i ? 'white' : '#7B8889',
                  }}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional weight / RPE */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Gewicht (kg)</p>
            <div className="flex items-center gap-2 justify-between border rounded-xl px-3" style={{ height: 44 }}>
              <button
                className="p-1"
                onClick={() => onChange({ weight: Math.max(0, (feedback.weight ?? 0) - 2.5) })}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-sm">{feedback.weight ?? 0}</span>
              <button
                className="p-1"
                onClick={() => onChange({ weight: (feedback.weight ?? 0) + 2.5 })}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">RPE (/10)</p>
            <div className="flex items-center gap-2 justify-between border rounded-xl px-3" style={{ height: 44 }}>
              <button
                className="p-1"
                onClick={() => onChange({ rpe: Math.max(1, (feedback.rpe ?? 5) - 1) })}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-sm">{feedback.rpe ?? 5}</span>
              <button
                className="p-1"
                onClick={() => onChange({ rpe: Math.min(10, (feedback.rpe ?? 5) + 1) })}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <Button
          onClick={onSave}
          className="w-full font-semibold text-base"
          style={{ height: 48, background: MBT_GREEN }}
        >
          Opslaan
        </Button>
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
  onFinish: (sessionSmiley: number | null, durationSeconds: number) => void
  isSaving: boolean
  tendinopathyMode?: boolean
  sessionOneRmPRs?: Record<string, number>
}) {
  const [sessionSmiley, setSessionSmiley] = useState<number | null>(null)
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
    <div className="min-h-screen flex flex-col" style={{ background: '#0A0E0F' }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-6 text-center" style={{ background: MBT_DARK }}>
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="text-white text-2xl font-bold">Sessie voltooid!</h1>
        <p className="text-[#7B8889] text-sm mt-1">{exercises.length} oefeningen</p>

        {/* Editable duration with computed start/finish times */}
        <div className="mt-4 bg-[#141A1B]/10 rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[#7B8889] text-xs">Duur</span>
            <div className="flex items-center gap-3">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={() => setDurationMinutes(m => Math.max(1, m - 5))}
              >
                <Minus className="w-3.5 h-3.5 text-white" />
              </button>
              <span className="text-white font-bold text-lg w-16 text-center tabular-nums">
                {durationMinutes} min
              </span>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onClick={() => setDurationMinutes(m => m + 5)}
              >
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
          <div className="flex justify-between text-xs text-[#7B8889]">
            <span>Start: {fmtTime(startTime)}</span>
            <span>Einde: {fmtTime(finishTime)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Avg feeling */}
        {avgSmileyIdx !== null && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4 flex items-center gap-3">
              <div className="text-3xl">{SMILIES[avgSmileyIdx]}</div>
              <div>
                <p className="font-semibold text-sm">Gemiddeld gevoel</p>
                <p className="text-xs text-muted-foreground">
                  {SMILEY_LABELS[avgSmileyIdx]} · {avgSmiley?.toFixed(1)}/5
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 1RM PRs */}
        {sessionOneRmPRs && Object.keys(sessionOneRmPRs).length > 0 && (
          <Card style={{ borderRadius: '14px', border: '2px solid #BEF264' }}>
            <CardContent className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" style={{ color: '#BEF264' }} />
                <p className="font-bold text-sm" style={{ color: '#BEF264' }}>Nieuw(e) 1RM PR(s)! 🎉</p>
              </div>
              {exercises.filter(e => sessionOneRmPRs[e.uid]).map(e => (
                <div key={e.uid} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate">{e.name}</span>
                  <span className="font-bold" style={{ color: '#BEF264' }}>{sessionOneRmPRs[e.uid]} kg</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Exercise recap */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-3 space-y-3">
            <p className="font-semibold text-sm">Oefeningen</p>
            {exercises.map(e => {
              const fb = feedback[e.uid]
              const pain = tendinopathyMode ? (fb?.painDuring ?? fb?.pain) : fb?.pain
              return (
                <div key={e.uid} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                    style={{ background: fb?.smiley ? SMILEY_COLORS[(fb.smiley - 1)] + '22' : '#1C2425' }}
                  >
                    {fb?.smiley ? SMILIES[fb.smiley - 1] : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
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
                      className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                      style={{ background: painColor(pain ?? 0, tendinopathyMode) }}
                    >
                      {pain}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Tendinopathie follow-up reminder */}
        {tendinopathyMode && (
          <Card style={{ borderRadius: '14px', background: 'rgba(190,242,100,0.10)', border: '1.5px solid #BEF26433' }}>
            <CardContent className="px-4 py-3 flex items-start gap-3">
              <Bell className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#BEF264' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#BEF264' }}>24u follow-up herinnering</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Morgenochtend ontvang je een herinnering om de pijn 24u na de sessie en de ochtend stijfheid in te vullen.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overall session smiley */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <p className="font-semibold text-sm mb-1">Hoe voelt je lichaam nu?</p>
            <p className="text-xs text-muted-foreground mb-3">Totale sessie gevoel</p>
            <div className="flex gap-2 justify-between">
              {SMILIES.map((emoji, i) => {
                const val = i + 1
                const selected = sessionSmiley === val
                return (
                  <button
                    key={val}
                    onClick={() => setSessionSmiley(selected ? null : val)}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-2xl transition-all active:scale-95"
                    style={{
                      minHeight: 44,
                      background: selected ? SMILEY_COLORS[i] + '22' : '#1C2425',
                      border: selected ? `2px solid ${SMILEY_COLORS[i]}` : '2px solid transparent',
                    }}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: selected ? SMILEY_COLORS[i] : '#7B8889' }}
                    >
                      {SMILEY_LABELS[i]}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 pb-8">
        <Button
          onClick={() => onFinish(sessionSmiley, durationMinutes * 60)}
          disabled={isSaving}
          className="w-full text-base font-semibold"
          style={{ height: 48, background: MBT_GREEN }}
        >
          {isSaving ? 'Opslaan…' : 'Opslaan & afsluiten'}
        </Button>
      </div>
    </div>
  )
}

// ─── Main Session Page ────────────────────────────────────────────────────────

export default function SessionPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: sessionData, isLoading } = trpc.patient.getTodayExercises.useQuery()
  const logSession = trpc.patient.logSession.useMutation()

  const exercises: SessionExercise[] = sessionData?.exercises ?? []

  const [expanded, setExpanded] = useState<string | null>(null)
  const [setsCompleted, setSetsCompleted] = useState<Record<string, number>>({})
  const [done, setDone] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<Record<string, FeedbackEntry>>({})
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null)
  const [feedbackTimer, setFeedbackTimer] = useState(3)
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
  // Mock previous best 1RM per exerciseId (would come from DB in production)
  const MOCK_PREV_1RM: Record<string, number> = { '1': 88, '2': 0, '4': 65, '5': 0 }

  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const doneRef = useRef(done)
  useEffect(() => { doneRef.current = done }, [done])

  // Set initial expanded after exercises load
  useEffect(() => {
    if (exercises.length > 0 && expanded === null) {
      setExpanded(exercises[0].uid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.length])

  // Session elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

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
      // Check against mock previous best
      const prevBest = MOCK_PREV_1RM[exerciseId] ?? 0
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
      if (next < totalSets) {
        startRestTimer(restSec)
      }
      return { ...prev, [uid]: next }
    })
  }, [startRestTimer])

  const markExerciseDone = useCallback((uid: string) => {
    setFeedback(prev => ({
      ...prev,
      [uid]: prev[uid] ?? { smiley: null, pain: null, weight: null, rpe: null },
    }))
    clearInterval(feedbackTimerRef.current!)
    setFeedbackTimer(3)
    setShowFeedbackFor(uid)
  }, [])

  const saveFeedback = useCallback((uid: string) => {
    setDone(prev => new Set(prev).add(uid))
    setShowFeedbackFor(null)
    clearInterval(feedbackTimerRef.current!)
    const next = exercises.find(e => !doneRef.current.has(e.uid) && e.uid !== uid)
    setExpanded(next?.uid ?? null)
  }, [exercises])

  const saveFeedbackRef = useRef(saveFeedback)
  useEffect(() => { saveFeedbackRef.current = saveFeedback }, [saveFeedback])

  useEffect(() => {
    if (showFeedbackFor === null) return
    setFeedbackTimer(3)
    let count = 3
    feedbackTimerRef.current = setInterval(() => {
      count -= 1
      setFeedbackTimer(count)
      if (count <= 0) {
        clearInterval(feedbackTimerRef.current!)
        saveFeedbackRef.current(showFeedbackFor)
      }
    }, 1000)
    return () => clearInterval(feedbackTimerRef.current!)
  }, [showFeedbackFor])

  const handleFeedbackChange = useCallback((uid: string, partial: Partial<FeedbackEntry>) => {
    clearInterval(feedbackTimerRef.current!)
    setFeedbackTimer(0)
    setFeedback(prev => ({ ...prev, [uid]: { ...prev[uid], ...partial } }))
  }, [])

  const handleFinish = useCallback(async (sessionSmiley: number | null, durationSeconds: number) => {
    const tendinopathyMode = sessionData?.program?.tendinopathyMode ?? false
    const pains = Object.values(feedback).filter(f => f.pain !== null).map(f => f.pain!)
    const avgPain = pains.length > 0 ? Math.round(pains.reduce((a, b) => a + b, 0) / pains.length) : null
    const exertionLevel = sessionSmiley !== null ? Math.max(1, 11 - sessionSmiley * 2) : null

    const completedAt = new Date()
    const scheduledAt = new Date(completedAt.getTime() - durationSeconds * 1000)

    await logSession.mutateAsync({
      programId: sessionData?.program?.id,
      scheduledAt: scheduledAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      painLevel: avgPain,
      exertionLevel,
      exercises: exercises.map(e => {
        const weights = setWeights[e.uid] ?? []
        const lastWeight = weights.filter(w => w > 0).slice(-1)[0] ?? null
        const reps = extraReps[e.uid] ?? e.reps
        const programTrack1rm = sessionData?.program?.trackOneRepMax ?? false
        const estimated1rm = (programTrack1rm && lastWeight && lastWeight > 0)
          ? calcEpley(lastWeight, reps)
          : null
        return {
          exerciseId: e.exerciseId,
          setsCompleted: setsCompleted[e.uid] ?? 0,
          repsCompleted: reps,
          painLevel: tendinopathyMode ? (feedback[e.uid]?.painDuring ?? null) : (feedback[e.uid]?.pain ?? null),
          weight: lastWeight,
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

    router.push('/patient/dashboard')
  }, [sessionData, feedback, elapsed, exercises, setsCompleted, extraReps, logSession, router, utils])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0E0F' }}>
        <p className="text-muted-foreground text-sm">Sessie laden…</p>
      </div>
    )
  }

  if (!sessionData?.program || exercises.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#0A0E0F' }}>
        <div className="text-5xl">🏖️</div>
        <p className="font-semibold text-lg">Geen sessie vandaag</p>
        <p className="text-muted-foreground text-sm">Je hebt vandaag geen oefeningen gepland. Geniet van je rustdag!</p>
        <Button variant="outline" onClick={() => router.push('/patient/dashboard')}>
          Terug naar dashboard
        </Button>
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
          className="w-full flex items-center gap-3 text-left px-4 py-3"
          style={{ minHeight: 56 }}
          onClick={() => setExpanded(isExpanded ? null : e.uid)}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold transition-all"
            style={{
              background: isDone ? MBT_GREEN : allSetsDone && !isDone ? MBT_GREEN + '33' : '#1C2425',
              color: isDone ? 'white' : '#52525b',
            }}
          >
            {isDone ? '✓' : e.sets > 0 ? `${sets}/${e.sets}` : '—'}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('font-semibold text-sm truncate', isDone && 'line-through text-muted-foreground')}>
              {e.name}
            </p>
            <p className="text-xs text-muted-foreground">{e.sets} × {e.reps} {e.repUnit}</p>
          </div>
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-[#7B8889] shrink-0" />
            : <ChevronDown className="w-4 h-4 text-[#7B8889] shrink-0" />
          }
        </button>

        {/* Done view — tap to review what you did */}
        {isExpanded && isDone && (() => {
          const fb = feedback[e.uid]
          return (
            <div className="border-t px-4 pb-4 pt-3 space-y-3">
              <div className="space-y-1.5">
                {Array.from({ length: e.sets }, (_, i) => {
                  const w = setWeights[e.uid]?.[i] ?? 0
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 rounded-xl"
                      style={{ height: 44, background: MBT_GREEN + '15', border: `1px solid ${MBT_GREEN}33` }}
                    >
                      <span className="text-sm font-medium" style={{ color: MBT_GREEN }}>Set {i + 1} ✓</span>
                      <span className="text-sm text-muted-foreground">{w > 0 ? `${w} kg` : '—'}</span>
                    </div>
                  )
                })}
              </div>
              {fb && (fb.smiley !== null || fb.pain !== null) && (
                <div className="flex items-center gap-3 px-1">
                  {fb.smiley !== null && <span className="text-2xl">{SMILIES[fb.smiley - 1]}</span>}
                  <span className="text-xs text-muted-foreground">
                    {fb.smiley !== null && SMILEY_LABELS[fb.smiley - 1]}
                    {fb.pain !== null && `${fb.smiley !== null ? ' · ' : ''}Pijn ${fb.pain}/10`}
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        {/* Expanded content */}
        {isExpanded && !isDone && (
          <div className="border-t px-4 pb-4 pt-3 space-y-4">
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
                      style={{ background: MBT_GREEN }}
                    >
                      <span className="text-white text-xl ml-1">▶</span>
                    </div>
                  }
                />
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
                      className="w-full flex items-center justify-between px-4 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
                      style={{
                        height: 48,
                        background: isSetDone
                          ? MBT_GREEN + '22'
                          : sets === setNum - 1 ? MBT_DARK : '#1C2425',
                        color: isSetDone
                          ? MBT_GREEN
                          : sets === setNum - 1 ? 'white' : '#a1a1aa',
                        border: isSetDone ? `1.5px solid ${MBT_GREEN}` : '1.5px solid transparent',
                      }}
                    >
                      <span>Set {setNum}</span>
                      <span>{isSetDone ? `✓ ${w > 0 ? w + ' kg' : 'Klaar'}` : sets === setNum - 1 ? 'Tik om te voltooien →' : '—'}</span>
                    </button>
                    {isSetDone && (
                      <div className="flex items-center gap-2 px-2 py-1">
                        <span className="text-xs text-muted-foreground flex-1">Gewicht set {setNum}</span>
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: '#1C2425' }}
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
                        <span className="text-sm font-semibold w-14 text-center tabular-nums">{w} kg</span>
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center"
                          style={{ background: '#1C2425' }}
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
              const prevBest = MOCK_PREV_1RM[e.exerciseId] ?? 0
              const isPR = est1rm !== null && est1rm > prevBest && prevBest > 0
              return est1rm ? (
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
                  style={{
                    background: isPR ? '#BEF26422' : '#1C2425',
                    border: isPR ? '1.5px solid #BEF264' : '1.5px solid transparent',
                  }}
                >
                  <TrendingUp className="w-4 h-4 shrink-0" style={{ color: isPR ? '#BEF264' : '#a1a1aa' }} />
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground">Geschatte 1RM</span>
                    <span className="text-sm font-bold ml-2" style={{ color: isPR ? '#BEF264' : '#1a1a1a' }}>
                      {est1rm} kg
                    </span>
                  </div>
                  {isPR && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white animate-bounce"
                      style={{ background: '#BEF264' }}
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
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                {showExtraFor === e.uid
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />}
                Extra parameters
              </button>
              {showExtraFor === e.uid && (
                <div className="mt-2 border rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Reps gedaan</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: '#1C2425' }}
                        onClick={() => setExtraReps(prev => ({ ...prev, [e.uid]: Math.max(1, (prev[e.uid] ?? e.reps) - 1) }))}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-semibold w-8 text-center tabular-nums">{extraReps[e.uid] ?? e.reps}</span>
                      <button
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: '#1C2425' }}
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
                  className="flex items-center gap-1.5 text-xs font-semibold mb-2"
                  style={{ color: MBT_GREEN }}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Coaching cues {showCues ? '▲' : '▼'}
                </button>
                {showCues && (
                  <ul className="space-y-1.5">
                    {cues.map((cue, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="font-bold mt-px" style={{ color: MBT_GREEN }}>·</span>
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
                  <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: '#fefce8' }}>
                    <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-amber-700">
                      <span className="font-semibold">Te moeilijk?</span> Probeer: {variants.easier}
                    </span>
                  </div>
                )}
                {variants.harder && (
                  <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(190,242,100,0.10)' }}>
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: MBT_GREEN }} />
                    <span style={{ color: '#BEF264' }}>
                      <span className="font-semibold">Te makkelijk?</span> Probeer: {variants.harder}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Mark exercise done — only shown after all sets are ticked */}
            {allSetsDone && (
              <button
                onClick={() => markExerciseDone(e.uid)}
                className="w-full rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ height: 48, background: MBT_GREEN }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Oefening afgerond
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Build ordered list of cards (supersets grouped)
  const processedSupersets = new Set<string>()
  const cards: React.ReactElement[] = []

  exercises.forEach(e => {
    if (e.supersetGroup) {
      if (processedSupersets.has(e.supersetGroup)) return
      processedSupersets.add(e.supersetGroup)
      const group = supersetGroups.get(e.supersetGroup)!
      const colors = SUPERSET_COLORS[e.supersetGroup] ?? SUPERSET_COLORS.A
      cards.push(
        <div
          key={`superset-${e.supersetGroup}`}
          className="rounded-2xl overflow-hidden"
          style={{ border: `2px solid ${colors.border}`, background: colors.bg }}
        >
          <div className="px-4 py-1.5 flex items-center gap-1.5" style={{ background: colors.border + '44' }}>
            <span className="text-[10px] font-bold tracking-wider" style={{ color: colors.text }}>
              SUPERSET {e.supersetGroup}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: colors.border + '44' }}>
            {group.map(ex => renderExercise(ex))}
          </div>
        </div>
      )
    } else {
      cards.push(
        <Card key={e.uid} style={{ borderRadius: '14px' }}>
          <CardContent className="p-0">
            {renderExercise(e)}
          </CardContent>
        </Card>
      )
    }
  })

  return (
    <div className="min-h-screen pb-6" style={{ background: '#0A0E0F' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3 border-b" style={{ background: '#fff' }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => router.back()} className="p-2 -ml-2" style={{ minWidth: 44, minHeight: 44 }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {sessionData.program.name} · Week {sessionData.program.currentWeek}
            </p>
            <p className="font-semibold text-sm">
              <span style={{ color: doneCount > 0 ? MBT_GREEN : undefined }}>{doneCount}</span>
              /{exercises.length} gedaan
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums pr-1">
            <Clock className="w-3.5 h-3.5" />
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>
        <Progress
          value={progress}
          className="h-2"
          style={{ '--progress-color': MBT_GREEN } as React.CSSProperties}
        />
      </div>

      {/* Exercise cards */}
      <div className="px-4 pt-4 space-y-3">
        {cards}
      </div>

      {/* Finish CTA */}
      {doneCount > 0 && (
        <div className="px-4 pt-4">
          <Button
            onClick={() => setPhase('summary')}
            className="w-full text-base font-semibold"
            style={{
              height: 48,
              background: doneCount === exercises.length ? MBT_GREEN : MBT_DARK,
            }}
          >
            {doneCount === exercises.length
              ? 'Sessie afronden 🎉'
              : `Doorgaan (${doneCount}/${exercises.length})`}
          </Button>
        </div>
      )}

      {/* Rest Timer overlay */}
      {showRestTimer && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className="rounded-3xl px-8 py-8 text-center space-y-2 mx-4 w-full max-w-xs"
            style={{ background: '#fff' }}
          >
            <p className="font-bold text-lg">Rust</p>
            <p className="text-xs text-muted-foreground mb-4">Adem rustig door je neus</p>
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
          autoCloseIn={feedbackTimer}
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
      style={{ background: highlight ? MBT_GREEN + '22' : '#1C2425' }}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className="text-sm font-bold mt-0.5"
        style={{ color: highlight ? MBT_GREEN : undefined }}
      >
        {value}
      </p>
    </div>
  )
}
