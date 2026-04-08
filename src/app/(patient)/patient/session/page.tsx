'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getTodayExercises, TODAY_DAY, DAY_NAMES } from '@/lib/patient-constants'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import {
  ChevronLeft, Clock, ChevronDown, ChevronUp, Lightbulb,
  TrendingUp, TrendingDown, CheckCircle2, SkipForward, Minus, Plus
} from 'lucide-react'

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

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

type FeedbackEntry = {
  smiley: number | null
  pain: number | null
  weight: number | null
  rpe: number | null
}

const SMILIES = ['😫', '😕', '😐', '🙂', '😄']
const SMILEY_LABELS = ['Zwaar', 'Moeilijk', 'Oké', 'Goed', 'Super']
const SMILEY_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']

// ─── Circular Timer SVG ───────────────────────────────────────────────────────

function CircularTimer({ seconds, total, onSkip }: { seconds: number; total: number; onSkip: () => void }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const progress = seconds / total
  const offset = circ * (1 - progress)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#f4f4f5" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={r} fill="none" stroke="#3ECF6A" strokeWidth="8"
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
              style={{ background: '#3ECF6A' }}
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
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-all"
                style={{
                  background: selected ? SMILEY_COLORS[i] + '22' : '#f4f4f5',
                  border: selected ? `2px solid ${SMILEY_COLORS[i]}` : '2px solid transparent',
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
            <span className="text-sm font-bold" style={{ color: feedback.pain !== null && feedback.pain > 5 ? '#ef4444' : '#3ECF6A' }}>
              {feedback.pain !== null ? `${feedback.pain}/10` : 'Geen'}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => onChange({ pain: feedback.pain === i ? null : i })}
                className="flex-1 h-9 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: feedback.pain === i
                    ? i <= 3 ? '#22c55e' : i <= 6 ? '#f97316' : '#ef4444'
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
            <div className="flex items-center gap-2 justify-between border rounded-xl px-3 py-2">
              <button onClick={() => onChange({ weight: Math.max(0, (feedback.weight ?? 0) - 2.5) })}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-sm">{feedback.weight ?? 0}</span>
              <button onClick={() => onChange({ weight: (feedback.weight ?? 0) + 2.5 })}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">RPE (/10)</p>
            <div className="flex items-center gap-2 justify-between border rounded-xl px-3 py-2">
              <button onClick={() => onChange({ rpe: Math.max(1, (feedback.rpe ?? 5) - 1) })}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-semibold text-sm">{feedback.rpe ?? 5}</span>
              <button onClick={() => onChange({ rpe: Math.min(10, (feedback.rpe ?? 5) + 1) })}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <Button onClick={onSave} className="w-full h-12 font-semibold text-base" style={{ background: '#3ECF6A' }}>
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
}: {
  exercises: ReturnType<typeof getTodayExercises>
  feedback: Record<string, FeedbackEntry>
  elapsed: number
  onFinish: () => void
}) {
  const router = useRouter()
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
      <div className="px-5 pt-14 pb-6 text-center" style={{ background: '#1A1A1A' }}>
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="text-white text-2xl font-bold">Sessie voltooid!</h1>
        <p className="text-zinc-400 text-sm mt-1">{mins}:{secs.toString().padStart(2, '0')} · {exercises.length} oefeningen</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Avg feeling */}
        {avgSmileyIdx !== null && (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="px-4 py-4 flex items-center gap-3">
              <div className="text-3xl">{SMILIES[avgSmileyIdx]}</div>
              <div>
                <p className="font-semibold text-sm">Gemiddeld gevoel</p>
                <p className="text-xs text-muted-foreground">{SMILEY_LABELS[avgSmileyIdx]} · {avgSmiley?.toFixed(1)}/5</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Exercise recap */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-3 space-y-2">
            <p className="font-semibold text-sm mb-3">Oefeningen</p>
            {exercises.map(e => {
              const fb = feedback[e.uid]
              return (
                <div key={e.uid} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-lg"
                    style={{ background: '#f4f4f5' }}
                  >
                    {fb?.smiley ? SMILIES[fb.smiley - 1] : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.sets} sets · {fb?.weight ? `${fb.weight}kg` : 'geen gewicht'}
                      {fb?.pain !== null && fb?.pain !== undefined ? ` · pijn ${fb.pain}/10` : ''}
                    </p>
                  </div>
                  {fb?.pain !== null && fb?.pain !== undefined && (
                    <div
                      className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0"
                      style={{ background: (fb.pain ?? 0) <= 3 ? '#22c55e' : (fb.pain ?? 0) <= 6 ? '#f97316' : '#ef4444' }}
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
            <p className="font-semibold text-sm mb-3">Hoe was de sessie overall?</p>
            <div className="flex gap-2 justify-between">
              {SMILIES.map((emoji, i) => {
                const val = i + 1
                const selected = sessionSmiley === val
                return (
                  <button
                    key={val}
                    onClick={() => setSessionSmiley(selected ? null : val)}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-all"
                    style={{
                      background: selected ? SMILEY_COLORS[i] + '22' : '#f4f4f5',
                      border: selected ? `2px solid ${SMILEY_COLORS[i]}` : '2px solid transparent',
                    }}
                  >
                    <span className="text-2xl">{emoji}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 pb-8">
        <Button
          onClick={() => { onFinish(); router.push('/patient/dashboard') }}
          className="w-full h-12 text-base font-semibold"
          style={{ background: '#3ECF6A' }}
        >
          Opslaan & afsluiten
        </Button>
      </div>
    </div>
  )
}

// ─── Main Session Page ────────────────────────────────────────────────────────

export default function SessionPage() {
  const router = useRouter()
  const exercises = getTodayExercises()

  const [expanded, setExpanded] = useState<string | null>(exercises[0]?.uid ?? null)
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

  // Session elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Feedback auto-close
  useEffect(() => {
    if (showFeedbackFor === null) return
    setFeedbackTimer(3)
    feedbackTimerRef.current = setInterval(() => {
      setFeedbackTimer(prev => {
        if (prev <= 1) {
          clearInterval(feedbackTimerRef.current!)
          handleFeedbackSave()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(feedbackTimerRef.current!)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFeedbackFor])

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

  const startRestTimer = (restSec: number) => {
    setRestDuration(restSec)
    setRestSecondsLeft(restSec)
    setShowRestTimer(true)
  }

  const skipRest = useCallback(() => {
    clearInterval(restTimerRef.current!)
    setShowRestTimer(false)
  }, [])

  const markSetDone = (uid: string, restSec: number, totalSets: number) => {
    const current = setsCompleted[uid] ?? 0
    const next = current + 1
    setSetsCompleted(prev => ({ ...prev, [uid]: next }))
    if (next < totalSets) {
      startRestTimer(restSec)
    }
  }

  const markExerciseDone = (uid: string) => {
    const entry: FeedbackEntry = { smiley: null, pain: null, weight: null, rpe: null }
    setFeedback(prev => ({ ...prev, [uid]: entry }))
    clearInterval(feedbackTimerRef.current!)
    setShowFeedbackFor(uid)
  }

  const handleFeedbackChange = (uid: string, partial: Partial<FeedbackEntry>) => {
    clearInterval(feedbackTimerRef.current!)
    setFeedbackTimer(0)
    setFeedback(prev => ({ ...prev, [uid]: { ...prev[uid], ...partial } }))
  }

  const handleFeedbackSave = useCallback(() => {
    if (!showFeedbackFor) return
    const uid = showFeedbackFor
    setDone(prev => new Set(prev).add(uid))
    setShowFeedbackFor(null)
    clearInterval(feedbackTimerRef.current!)
    // Auto-expand next undone exercise
    const next = exercises.find(e => !done.has(e.uid) && e.uid !== uid)
    setExpanded(next?.uid ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFeedbackFor, done, exercises])

  if (phase === 'summary') {
    return (
      <SessionSummary
        exercises={exercises}
        feedback={feedback}
        elapsed={elapsed}
        onFinish={() => {}}
      />
    )
  }

  // Group exercises by superset for visual grouping
  const supersetGroups = new Map<string, typeof exercises>()
  const standalones: typeof exercises = []
  exercises.forEach(e => {
    if (e.supersetGroup) {
      const g = supersetGroups.get(e.supersetGroup) ?? []
      g.push(e)
      supersetGroups.set(e.supersetGroup, g)
    } else {
      standalones.push(e)
    }
  })

  const renderExercise = (e: typeof exercises[number], inSuperset = false) => {
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
          onClick={() => setExpanded(isExpanded ? null : e.uid)}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold transition-all"
            style={{
              background: isDone ? '#3ECF6A' : '#f4f4f5',
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
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#3ECF6A' }}>
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
              <ParamPill label="Rust" value={`${e.rest}s`} />
              <ParamPill label="Sets klaar" value={`${sets}/${e.sets}`} highlight />
            </div>

            {/* Coaching cues */}
            {cues.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCuesFor(showCues ? null : e.uid)}
                  className="flex items-center gap-1.5 text-xs font-semibold mb-2"
                  style={{ color: '#3ECF6A' }}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Coaching cues {showCues ? '▲' : '▼'}
                </button>
                {showCues && (
                  <ul className="space-y-1.5">
                    {cues.map((cue, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="font-bold" style={{ color: '#3ECF6A' }}>·</span>
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
                    <span className="text-amber-700"><span className="font-semibold">Te moeilijk?</span> Probeer: {variants.easier}</span>
                  </div>
                )}
                {variants.harder && (
                  <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ background: '#f0fdf4' }}>
                    <TrendingUp className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    <span className="text-green-700"><span className="font-semibold">Te makkelijk?</span> Probeer: {variants.harder}</span>
                  </div>
                )}
              </div>
            )}

            {/* Set tracker */}
            {!allSetsDone ? (
              <button
                onClick={() => markSetDone(e.uid, e.rest || 60, e.sets)}
                className="w-full py-3 rounded-2xl text-white text-sm font-bold transition-all"
                style={{ background: '#1A1A1A' }}
              >
                Set {sets + 1} van {e.sets} klaar →
              </button>
            ) : (
              <button
                onClick={() => markExerciseDone(e.uid)}
                className="w-full py-3 rounded-2xl text-white text-sm font-bold transition-all"
                style={{ background: '#3ECF6A' }}
              >
                <CheckCircle2 className="inline w-4 h-4 mr-1.5 mb-0.5" />
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
  const cards: JSX.Element[] = []

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
            {group.map(ex => renderExercise(ex, true))}
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
          <button onClick={() => router.back()} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{DAY_NAMES[TODAY_DAY - 1]} · Week 1</p>
            <p className="font-semibold text-sm">{doneCount}/{exercises.length} gedaan</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
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
            className="w-full h-12 text-base font-semibold"
            style={{ background: doneCount === exercises.length ? '#3ECF6A' : '#1A1A1A' }}
          >
            {doneCount === exercises.length ? 'Sessie afronden 🎉' : `Doorgaan (${doneCount}/${exercises.length})`}
          </Button>
        </div>
      )}

      {/* Rest Timer overlay */}
      {showRestTimer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-3xl px-8 py-8 text-center space-y-2 mx-4 w-full max-w-xs" style={{ background: '#fff' }}>
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
          onSave={handleFeedbackSave}
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
      style={{ background: highlight ? '#f0fdf4' : '#f4f4f5' }}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold mt-0.5" style={{ color: highlight ? '#15803d' : undefined }}>{value}</p>
    </div>
  )
}
