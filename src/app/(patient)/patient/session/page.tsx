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
  TrendingUp, TrendingDown, CheckCircle2, SkipForward, Minus, Plus
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player') as any, { ssr: false }) as any

// ─── Brand colors ─────────────────────────────────────────────────────────────
const MBT_GREEN = '#3ECF6A'
const MBT_DARK = '#1A3A3A'

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
}

type FeedbackEntry = {
  smiley: number | null
  pain: number | null
  weight: number | null
  rpe: number | null
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
        className="flex items-center gap-1.5 text-sm text-zinc-400 font-medium"
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
}: {
  exerciseName: string
  feedback: FeedbackEntry
  onChange: (f: Partial<FeedbackEntry>) => void
  onSave: () => void
  autoCloseIn: number
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onSave} />
      <div
        className="relative w-full rounded-t-3xl px-5 pt-5 pb-8 space-y-5"
        style={{ background: '#fff', maxWidth: 480, margin: '0 auto' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-1" />

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
                  background: selected ? SMILEY_COLORS[i] + '22' : '#f4f4f5',
                  border: selected ? `2px solid ${SMILEY_COLORS[i]}` : '2px solid transparent',
                  minHeight: 44,
                }}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[10px] font-medium" style={{ color: selected ? SMILEY_COLORS[i] : '#71717a' }}>
                  {SMILEY_LABELS[i]}
                </span>
              </button>
            )
          })}
        </div>

        {/* NRS Pain slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Pijn tijdens oefening</p>
            <span className="text-sm font-bold" style={{ color: feedback.pain !== null && feedback.pain > 5 ? '#ef4444' : MBT_GREEN }}>
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
                  background: feedback.pain === i
                    ? i <= 3 ? MBT_GREEN : i <= 6 ? '#f97316' : '#ef4444'
                    : '#f4f4f5',
                  color: feedback.pain === i ? 'white' : '#71717a',
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

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
  elapsed,
  onFinish,
  isSaving,
}: {
  exercises: SessionExercise[]
  feedback: Record<string, FeedbackEntry>
  elapsed: number
  onFinish: (sessionSmiley: number | null) => void
  isSaving: boolean
}) {
  const [sessionSmiley, setSessionSmiley] = useState<number | null>(null)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  const smiliesGiven = Object.values(feedback).filter(f => f.smiley !== null)
  const avgSmiley = smiliesGiven.length > 0
    ? smiliesGiven.reduce((sum, f) => sum + (f.smiley ?? 0), 0) / smiliesGiven.length
    : null
  const avgSmileyIdx = avgSmiley !== null ? Math.round(avgSmiley) - 1 : null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-5 pt-14 pb-6 text-center" style={{ background: MBT_DARK }}>
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="text-white text-2xl font-bold">Sessie voltooid!</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {mins}:{secs.toString().padStart(2, '0')} · {exercises.length} oefeningen
        </p>
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

        {/* Exercise recap */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-3 space-y-3">
            <p className="font-semibold text-sm">Oefeningen</p>
            {exercises.map(e => {
              const fb = feedback[e.uid]
              return (
                <div key={e.uid} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                    style={{ background: fb?.smiley ? SMILEY_COLORS[(fb.smiley - 1)] + '22' : '#f4f4f5' }}
                  >
                    {fb?.smiley ? SMILIES[fb.smiley - 1] : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.sets} sets
                      {fb?.weight ? ` · ${fb.weight}kg` : ''}
                      {fb?.pain !== null && fb?.pain !== undefined ? ` · pijn ${fb.pain}/10` : ''}
                    </p>
                  </div>
                  {fb?.pain !== null && fb?.pain !== undefined && (
                    <div
                      className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                      style={{
                        background: (fb.pain ?? 0) <= 3
                          ? MBT_GREEN
                          : (fb.pain ?? 0) <= 6 ? '#f97316' : '#ef4444',
                      }}
                    >
                      {fb.pain}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

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
                      background: selected ? SMILEY_COLORS[i] + '22' : '#f4f4f5',
                      border: selected ? `2px solid ${SMILEY_COLORS[i]}` : '2px solid transparent',
                    }}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: selected ? SMILEY_COLORS[i] : '#71717a' }}
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
          onClick={() => onFinish(sessionSmiley)}
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

  const handleFinish = useCallback(async (sessionSmiley: number | null) => {
    const pains = Object.values(feedback).filter(f => f.pain !== null).map(f => f.pain!)
    const avgPain = pains.length > 0 ? Math.round(pains.reduce((a, b) => a + b, 0) / pains.length) : null
    const exertionLevel = sessionSmiley !== null ? Math.max(1, 11 - sessionSmiley * 2) : null

    await logSession.mutateAsync({
      programId: sessionData?.program?.id,
      scheduledAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: elapsed,
      painLevel: avgPain,
      exertionLevel,
      exercises: exercises.map(e => ({
        exerciseId: e.exerciseId,
        setsCompleted: setsCompleted[e.uid] ?? 0,
        repsCompleted: e.reps,
        painLevel: feedback[e.uid]?.pain ?? null,
      })),
    })

    router.push('/patient/dashboard')
  }, [sessionData, feedback, elapsed, exercises, setsCompleted, logSession, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <p className="text-muted-foreground text-sm">Sessie laden…</p>
      </div>
    )
  }

  if (!sessionData?.program || exercises.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#FAFAFA' }}>
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
        elapsed={elapsed}
        onFinish={handleFinish}
        isSaving={logSession.isPending}
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
              background: isDone ? MBT_GREEN : allSetsDone && !isDone ? MBT_GREEN + '33' : '#f4f4f5',
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
            ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
          }
        </button>

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
            <div className="grid grid-cols-4 gap-2">
              <ParamPill label="Sets" value={String(e.sets)} />
              <ParamPill label="Reps" value={`${e.reps} ${e.repUnit}`} />
              <ParamPill label="Rust" value={`${e.restTime}s`} />
              <ParamPill label="Sets klaar" value={`${sets}/${e.sets}`} highlight />
            </div>

            {/* Set buttons — one per set for tactile feedback */}
            <div className="space-y-2">
              {Array.from({ length: e.sets }, (_, i) => {
                const setNum = i + 1
                const isSetDone = sets >= setNum
                return (
                  <button
                    key={setNum}
                    disabled={isSetDone || sets < setNum - 1}
                    onClick={() => !isSetDone && markSetDone(e.uid, e.restTime || 60, e.sets)}
                    className="w-full flex items-center justify-between px-4 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
                    style={{
                      height: 48,
                      background: isSetDone
                        ? MBT_GREEN + '22'
                        : sets === setNum - 1 ? MBT_DARK : '#f4f4f5',
                      color: isSetDone
                        ? MBT_GREEN
                        : sets === setNum - 1 ? 'white' : '#a1a1aa',
                      border: isSetDone ? `1.5px solid ${MBT_GREEN}` : '1.5px solid transparent',
                    }}
                  >
                    <span>Set {setNum}</span>
                    <span>{isSetDone ? '✓ Klaar' : sets === setNum - 1 ? 'Tik om te voltooien →' : '—'}</span>
                  </button>
                )
              })}
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
                  <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: '#f0fdf4' }}>
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: MBT_GREEN }} />
                    <span style={{ color: '#166534' }}>
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
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
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
          feedback={feedback[showFeedbackFor] ?? { smiley: null, pain: null, weight: null, rpe: null }}
          onChange={partial => handleFeedbackChange(showFeedbackFor, partial)}
          onSave={() => saveFeedback(showFeedbackFor)}
          autoCloseIn={feedbackTimer}
        />
      )}
    </div>
  )
}

function ParamPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-xl p-2 text-center"
      style={{ background: highlight ? MBT_GREEN + '22' : '#f4f4f5' }}
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
