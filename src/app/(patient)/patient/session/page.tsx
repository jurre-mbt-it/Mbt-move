'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getTodayExercises, TODAY_DAY, DAY_NAMES } from '@/lib/patient-constants'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import { VideoPlayer } from '@/components/exercises/VideoPlayer'
import {
  CheckCircle2, ChevronLeft, Clock, Minus, Plus,
  ChevronDown, ChevronUp, SkipForward, MessageCircle,
  TrendingDown, TrendingUp, Lightbulb,
} from 'lucide-react'

// ─── Smiley config ───────────────────────────────────────────────────────────
const SMILEYS = [
  { value: 1 as const, emoji: '😫', label: 'Veel te zwaar' },
  { value: 2 as const, emoji: '😕', label: 'Zwaar' },
  { value: 3 as const, emoji: '😐', label: 'Oké' },
  { value: 4 as const, emoji: '🙂', label: 'Goed' },
  { value: 5 as const, emoji: '😄', label: 'Uitstekend' },
]

// ─── Variant suggestions (mock) ───────────────────────────────────────────────
const VARIANTS: Record<string, { easier: string | null; harder: string | null }> = {
  'uid-1': { easier: 'Goblet Squat', harder: 'Pistol Squat' },
  'uid-2': { easier: 'Leg Curl machine', harder: 'Nordic + gewichten' },
  'uid-3': { easier: 'Seated hip rotation', harder: 'Hip 90/90 + forward lean' },
  'uid-4': { easier: 'Romanian Deadlift', harder: 'Single Leg DL + gewichten' },
  'uid-5': { easier: 'Squat jump', harder: 'Depth jump' },
  'uid-6': { easier: 'Band rotatie (zittend)', harder: 'Cable externe rotatie' },
}

// ─── Coaching cues (mock) ────────────────────────────────────────────────────
const COACHING: Record<string, string[]> = {
  'uid-1': ['Knie over de teen houden', 'Romp rechtop, niet voorover leunen', 'Zak gecontroleerd en explosief omhoog'],
  'uid-2': ['Enkels goed gefixeerd op de bank', 'Excentrische fase: 3-4 seconden', 'Gebruik handen bij val om te stabiliseren'],
  'uid-3': ['Beide zitknobbels op de grond', 'Adem uit bij het voorover leunen', 'Houd elke positie 30 seconden'],
  'uid-4': ['Blik 45° omlaag gericht', 'Achterste been recht naar achteren', 'Hinge vanuit de heup — niet de rug'],
  'uid-5': ['Land zacht op de bal van de voet', 'Knieën niet naar binnen laten zakken', 'Spring direct terug omhoog voor reactiesnelheid'],
  'uid-6': ['Elleboog 90° vast langs het lichaam', 'Beweging alleen in de schouder', 'Geen compensatie met de romp of schouderblad'],
}

// ─── Types ───────────────────────────────────────────────────────────────────
type SmileyValue = 1 | 2 | 3 | 4 | 5

type ExerciseLog = {
  exerciseId: string
  setsCompleted: number
  repsCompleted: number
  weight: number | null
  painLevel: number | null
  done: boolean
  smiley: SmileyValue | null
}

type RestTimer = { uid: string; seconds: number; total: number }

// ─── Main session page ────────────────────────────────────────────────────────
export default function SessionPage() {
  const router = useRouter()
  const exercises = getTodayExercises()

  const [logs, setLogs] = useState<Record<string, ExerciseLog>>(() =>
    Object.fromEntries(exercises.map(e => [e.uid, {
      exerciseId: e.exerciseId,
      setsCompleted: e.sets,
      repsCompleted: e.reps,
      weight: null,
      painLevel: null,
      done: false,
      smiley: null,
    }]))
  )
  const [expanded, setExpanded] = useState<string | null>(exercises[0]?.uid ?? null)
  const [elapsed, setElapsed] = useState(0)
  const [smileyModal, setSmileyModal] = useState<{ uid: string } | null>(null)
  const [pendingSmiley, setPendingSmiley] = useState<SmileyValue | null>(null)
  const [pendingPain, setPendingPain] = useState<number | null>(null)
  const [autoTimer, setAutoTimer] = useState(3)
  const [restTimer, setRestTimer] = useState<RestTimer | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  // Session clock
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Smiley auto-dismiss
  useEffect(() => {
    if (!smileyModal) return
    setAutoTimer(3)
    const interval = setInterval(() => {
      setAutoTimer(t => {
        if (t <= 1) {
          clearInterval(interval)
          return 0
        }
        return t - 1
      })
    }, 1000)
    const timeout = setTimeout(() => handleSmileyDone(), 3000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smileyModal?.uid])

  // Rest timer countdown
  useEffect(() => {
    if (!restTimer || restTimer.seconds <= 0) {
      if (restTimer?.seconds === 0) setRestTimer(null)
      return
    }
    const t = setTimeout(() => setRestTimer(r => r ? { ...r, seconds: r.seconds - 1 } : null), 1000)
    return () => clearTimeout(t)
  }, [restTimer])

  const doneCount = Object.values(logs).filter(l => l.done).length
  const allDone = doneCount === exercises.length && exercises.length > 0
  const progress = exercises.length > 0 ? (doneCount / exercises.length) * 100 : 0
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  function handleMarkDone(uid: string) {
    setLogs(prev => ({ ...prev, [uid]: { ...prev[uid], done: true } }))
    setSmileyModal({ uid })
    setPendingSmiley(null)
    setPendingPain(null)
  }

  function handleSmileyDone() {
    if (!smileyModal) return
    const { uid } = smileyModal
    const exercise = exercises.find(e => e.uid === uid)
    setLogs(prev => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        painLevel: pendingPain,
        smiley: pendingSmiley ?? 3,
      }
    }))
    setSmileyModal(null)
    // Start rest timer
    if (exercise && exercise.rest > 0) {
      setRestTimer({ uid, seconds: exercise.rest, total: exercise.rest })
    }
    // Advance to next
    const next = exercises.find(e => !logs[e.uid]?.done && e.uid !== uid)
    if (next) setExpanded(next.uid)
    // Check all done
    const nowDone = doneCount + 1
    if (nowDone === exercises.length) {
      setTimeout(() => setShowSummary(true), exercise?.rest ? exercise.rest * 1000 + 300 : 300)
    }
  }

  function updateLog(uid: string, field: keyof ExerciseLog, value: number | null) {
    setLogs(prev => ({ ...prev, [uid]: { ...prev[uid], [field]: value } }))
  }

  // Group by superset
  const groups: Array<{ supersetGroup: string | null; exercises: typeof exercises }> = []
  for (const e of exercises) {
    if (e.supersetGroup) {
      const existing = groups.find(g => g.supersetGroup === e.supersetGroup)
      if (existing) existing.exercises.push(e)
      else groups.push({ supersetGroup: e.supersetGroup, exercises: [e] })
    } else {
      groups.push({ supersetGroup: null, exercises: [e] })
    }
  }

  if (showSummary) {
    return (
      <SessionSummary
        exercises={exercises}
        logs={logs}
        elapsed={elapsed}
        onFinish={() => router.push('/patient/dashboard')}
      />
    )
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#FAFAFA' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 px-4 pt-12 pb-3 border-b bg-white">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => router.back()} className="p-1 -ml-1 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{DAY_NAMES[TODAY_DAY - 1]} · Week 1</p>
            <p className="font-semibold text-sm">{doneCount}/{exercises.length} gedaan</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums">{mins}:{secs.toString().padStart(2, '0')}</span>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Rest timer banner */}
      {restTimer && (
        <div className="mx-4 mt-3 rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: '#1A1A1A' }}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" style={{ color: '#3ECF6A' }} />
            <span className="text-white text-sm font-semibold">Rusttijd</span>
            <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: '#333' }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  background: '#3ECF6A',
                  width: `${(restTimer.seconds / restTimer.total) * 100}%`,
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold tabular-nums" style={{ color: '#3ECF6A' }}>
              {restTimer.seconds}s
            </span>
            <button
              onClick={() => setRestTimer(null)}
              className="flex items-center gap-1 text-xs text-zinc-400"
            >
              <SkipForward className="w-4 h-4" /> Skip
            </button>
          </div>
        </div>
      )}

      {/* Exercise groups */}
      <div className="px-4 pt-4 space-y-3">
        {groups.map((group, gi) => {
          const colors = group.supersetGroup ? SUPERSET_COLORS[group.supersetGroup] : null
          const cards = group.exercises.map(e => (
            <ExerciseCard
              key={e.uid}
              exercise={e}
              log={logs[e.uid]}
              isExpanded={expanded === e.uid}
              cues={COACHING[e.uid] ?? []}
              variants={VARIANTS[e.uid] ?? { easier: null, harder: null }}
              onToggleExpand={() => setExpanded(expanded === e.uid ? null : e.uid)}
              onUpdateLog={(field, value) => updateLog(e.uid, field, value)}
              onMarkDone={() => handleMarkDone(e.uid)}
              onUnmark={() => setLogs(prev => ({ ...prev, [e.uid]: { ...prev[e.uid], done: false, smiley: null } }))}
            />
          ))

          if (colors) {
            return (
              <div key={gi} className="rounded-2xl border-2 overflow-hidden"
                style={{ borderColor: colors.border, background: colors.bg }}>
                <div className="px-4 py-2 flex items-center gap-2 border-b"
                  style={{ borderColor: colors.border }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.text }}>
                    Superset {group.supersetGroup}
                  </span>
                  <span className="text-xs" style={{ color: colors.text }}>
                    · {group.exercises.length} oefeningen
                  </span>
                </div>
                <div className="p-2 space-y-2">{cards}</div>
              </div>
            )
          }
          return <div key={gi}>{cards}</div>
        })}
      </div>

      {/* Bottom action */}
      {doneCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 pt-3
          bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA] to-transparent">
          <button
            onClick={() => setShowSummary(true)}
            className="w-full h-12 rounded-xl text-base font-semibold text-white transition-all"
            style={{ background: allDone ? '#3ECF6A' : '#1A1A1A' }}
          >
            {allDone ? '🎉 Sessie afronden' : `Samenvatting bekijken (${doneCount}/${exercises.length})`}
          </button>
        </div>
      )}

      {/* Smiley modal */}
      {smileyModal && (
        <SmileyModal
          autoTimer={autoTimer}
          pendingSmiley={pendingSmiley}
          pendingPain={pendingPain}
          onSelectSmiley={setPendingSmiley}
          onSelectPain={setPendingPain}
          onSubmit={handleSmileyDone}
        />
      )}
    </div>
  )
}

// ─── Exercise card ────────────────────────────────────────────────────────────
function ExerciseCard({
  exercise, log, isExpanded, cues, variants,
  onToggleExpand, onUpdateLog, onMarkDone, onUnmark,
}: {
  exercise: ReturnType<typeof getTodayExercises>[number]
  log: ExerciseLog
  isExpanded: boolean
  cues: string[]
  variants: { easier: string | null; harder: string | null }
  onToggleExpand: () => void
  onUpdateLog: (field: keyof ExerciseLog, value: number | null) => void
  onMarkDone: () => void
  onUnmark: () => void
}) {
  const [showCues, setShowCues] = useState(false)
  const [showVariants, setShowVariants] = useState(false)

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden"
      style={{
        borderColor: log.done ? '#bbf7d0' : '#e4e4e7',
        background: log.done ? '#f0fdf4' : 'white',
      }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={onToggleExpand}
      >
        <button
          className="shrink-0"
          onClick={e => { e.stopPropagation(); log.done ? onUnmark() : onMarkDone() }}
        >
          <CheckCircle2
            className="w-6 h-6 transition-colors"
            style={{ color: log.done ? '#3ECF6A' : '#d4d4d8' }}
            fill={log.done ? '#3ECF6A' : 'none'}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold text-sm', log.done && 'line-through text-muted-foreground')}>
            {exercise.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {exercise.sets} sets × {exercise.reps} {exercise.repUnit}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{exercise.rest}s rust</span>
            {log.smiley && (
              <span className="text-sm ml-1">
                {SMILEYS.find(s => s.value === log.smiley)?.emoji}
              </span>
            )}
          </div>
        </div>
        {isExpanded
          ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t" style={{ borderColor: log.done ? '#bbf7d0' : '#f4f4f5' }}>
          {/* Video */}
          {exercise.videoUrl && (
            <VideoPlayer url={exercise.videoUrl} />
          )}

          <div className="px-4 py-4 space-y-4">
            {/* Log inputs */}
            <div className="grid grid-cols-3 gap-3">
              <LogInput
                label="Sets"
                value={log.setsCompleted}
                min={0} max={20}
                onChange={v => onUpdateLog('setsCompleted', v)}
              />
              <LogInput
                label={`Reps (${exercise.repUnit})`}
                value={log.repsCompleted}
                min={0} max={100}
                onChange={v => onUpdateLog('repsCompleted', v)}
              />
              <LogInput
                label="Gewicht (kg)"
                value={log.weight ?? 0}
                min={0} max={500} step={2.5}
                onChange={v => onUpdateLog('weight', v)}
              />
            </div>

            {/* Coaching cues */}
            {cues.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold w-full text-left"
                  style={{ color: '#6366f1' }}
                  onClick={() => setShowCues(v => !v)}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Coaching cues
                  {showCues ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                </button>
                {showCues && (
                  <ul className="mt-2 space-y-1">
                    {cues.map((cue, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#6366f1', marginTop: 4 }} />
                        {cue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Variant suggestions */}
            {(variants.easier || variants.harder) && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold w-full text-left text-amber-600"
                  onClick={() => setShowVariants(v => !v)}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Varianten
                  {showVariants ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                </button>
                {showVariants && (
                  <div className="mt-2 space-y-1.5">
                    {variants.easier && (
                      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                        style={{ background: '#f0fdf4' }}>
                        <TrendingDown className="w-3.5 h-3.5 shrink-0" style={{ color: '#22c55e' }} />
                        <span className="text-muted-foreground">Te zwaar?</span>
                        <span className="font-semibold" style={{ color: '#15803d' }}>{variants.easier}</span>
                      </div>
                    )}
                    {variants.harder && (
                      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                        style={{ background: '#fefce8' }}>
                        <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: '#ca8a04' }} />
                        <span className="text-muted-foreground">Te makkelijk?</span>
                        <span className="font-semibold" style={{ color: '#a16207' }}>{variants.harder}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mark done / message */}
            <div className="flex gap-2">
              <button
                onClick={log.done ? onUnmark : onMarkDone}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: log.done ? '#f0fdf4' : '#3ECF6A',
                  color: log.done ? '#15803d' : 'white',
                }}
              >
                {log.done ? '✓ Afgerond' : 'Afgerond →'}
              </button>
              <button
                className="px-3 py-2.5 rounded-xl border flex items-center justify-center"
                style={{ borderColor: '#e4e4e7' }}
                onClick={() => {/* navigate to messages */}}
                title="Bericht aan therapeut"
              >
                <MessageCircle className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Smiley modal ─────────────────────────────────────────────────────────────
function SmileyModal({
  autoTimer, pendingSmiley, pendingPain,
  onSelectSmiley, onSelectPain, onSubmit,
}: {
  autoTimer: number
  pendingSmiley: SmileyValue | null
  pendingPain: number | null
  onSelectSmiley: (v: SmileyValue) => void
  onSelectPain: (v: number | null) => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onSubmit} />
      <div className="relative w-full bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl">
        {/* Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-4" />

        <p className="text-center font-bold text-base mb-1">Hoe voelde dat?</p>
        <p className="text-center text-xs text-muted-foreground mb-4">
          Auto-door in {autoTimer}s
        </p>

        {/* Smileys */}
        <div className="flex justify-between gap-2 mb-5">
          {SMILEYS.map(s => (
            <button
              key={s.value}
              onClick={() => { onSelectSmiley(s.value); onSubmit() }}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all"
              style={{
                background: pendingSmiley === s.value ? '#f0fdf4' : '#f4f4f5',
                border: pendingSmiley === s.value ? '2px solid #3ECF6A' : '2px solid transparent',
                transform: pendingSmiley === s.value ? 'scale(1.08)' : 'scale(1)',
              }}
            >
              <span className="text-2xl">{s.emoji}</span>
              <span className="text-[10px] text-muted-foreground leading-tight text-center px-0.5">
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Pain NRS */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Pijn? (optioneel, NRS 0-10)
          </p>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => onSelectPain(pendingPain === i ? null : i)}
                className="flex-1 h-8 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: pendingPain === i
                    ? i <= 3 ? '#22c55e' : i <= 6 ? '#f97316' : '#ef4444'
                    : '#f4f4f5',
                  color: pendingPain === i ? 'white' : '#71717a',
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onSubmit}
          className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#1A1A1A' }}
        >
          Verder →
        </button>
      </div>
    </div>
  )
}

// ─── Session summary ──────────────────────────────────────────────────────────
function SessionSummary({
  exercises, logs, elapsed, onFinish,
}: {
  exercises: ReturnType<typeof getTodayExercises>
  logs: Record<string, ExerciseLog>
  elapsed: number
  onFinish: () => void
}) {
  const doneCount = Object.values(logs).filter(l => l.done).length
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  const smileys = Object.values(logs).map(l => l.smiley).filter(Boolean) as SmileyValue[]
  const avgSmiley = smileys.length > 0
    ? Math.round(smileys.reduce((a, b) => a + b, 0) / smileys.length)
    : null
  const avgSmileyObj = SMILEYS.find(s => s.value === avgSmiley)

  const pains = Object.values(logs).map(l => l.painLevel).filter(v => v !== null) as number[]
  const avgPain = pains.length > 0
    ? Math.round(pains.reduce((a, b) => a + b, 0) / pains.length * 10) / 10
    : null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-6 pt-16 pb-6 text-center" style={{ background: '#1A1A1A' }}>
        <div className="text-5xl mb-3">
          {doneCount === exercises.length ? '🎉' : '✅'}
        </div>
        <h1 className="text-white text-2xl font-bold">
          {doneCount === exercises.length ? 'Sessie voltooid!' : 'Goed gedaan!'}
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {doneCount} van {exercises.length} oefeningen · {mins}:{secs.toString().padStart(2, '0')} min
        </p>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            value={`${mins}:${secs.toString().padStart(2, '0')}`}
            label="Duur"
            icon="⏱️"
          />
          <StatTile
            value={avgSmileyObj?.emoji ?? '—'}
            label="Gem. gevoel"
            icon={null}
            isEmoji
          />
          <StatTile
            value={avgPain !== null ? `${avgPain}/10` : '—'}
            label="Gem. pijn"
            icon="🦵"
          />
        </div>

        {/* Exercise breakdown */}
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Oefeningen</p>
          </div>
          <div className="divide-y">
            {exercises.map(e => {
              const log = logs[e.uid]
              const smileyObj = SMILEYS.find(s => s.value === log.smiley)
              return (
                <div key={e.uid} className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle2
                    className="w-4 h-4 shrink-0"
                    style={{ color: log.done ? '#3ECF6A' : '#d4d4d8' }}
                    fill={log.done ? '#3ECF6A' : 'none'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.setsCompleted}×{log.repsCompleted}
                      {log.weight ? ` · ${log.weight}kg` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {smileyObj && <span className="text-lg">{smileyObj.emoji}</span>}
                    {log.painLevel !== null && (
                      <span className="text-xs text-muted-foreground">
                        pijn {log.painLevel}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Motivational message */}
        {avgSmileyObj && (
          <div className="rounded-2xl px-4 py-3 text-sm"
            style={{ background: '#f0fdf4', color: '#15803d' }}>
            {avgSmiley && avgSmiley >= 4
              ? '💪 Je voelde je goed vandaag — dat is een geweldige sessie!'
              : avgSmiley && avgSmiley <= 2
                ? '🫂 Zwaar gevoel vandaag? Dat is normaal. Bespreek het met je therapeut.'
                : '👍 Solide sessie. Blijf zo doorgaan!'}
          </div>
        )}
      </div>

      <div className="px-4 pb-8">
        <button
          onClick={onFinish}
          className="w-full h-12 rounded-xl text-base font-semibold text-white"
          style={{ background: '#3ECF6A' }}
        >
          Sessie opslaan
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function LogInput({
  label, value, min = 0, max = 999, step = 1, onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] text-muted-foreground text-center leading-tight">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: '#f4f4f5' }}
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-10 text-center font-bold text-sm tabular-nums">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: '#f4f4f5' }}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function StatTile({ value, label, icon, isEmoji = false }: {
  value: string; label: string; icon: string | null; isEmoji?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border px-3 py-3 text-center">
      <p className={isEmoji ? 'text-2xl mb-0.5' : 'text-base font-bold'}>{value}</p>
      {icon && !isEmoji && <p className="text-xs text-muted-foreground">{icon}</p>}
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
