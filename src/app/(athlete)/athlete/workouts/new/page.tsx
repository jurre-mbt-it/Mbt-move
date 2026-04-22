'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  WORKOUT_TYPES,
  saveWorkout,
  getSavedWorkouts,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@/lib/workout-constants'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { WORKOUT_ICON_MAP } from '@/components/icons'
import { trpc } from '@/lib/trpc/client'
import {
  X, Plus, Search, Check,
  Play, Pause, Minus, ChevronDown,
} from 'lucide-react'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
  DarkInput,
  DarkTextarea,
  CATEGORY_COLORS,
} from '@/components/dark-ui'

type Step = 'pick-type' | 'build' | 'pick-exercises' | 'active' | 'complete'

type RealExercise = {
  id: string
  name: string
  category: 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
  muscleLoads: Record<string, number>
  difficulty: string
}

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

function categoryColor(cat: string): string {
  return (CATEGORY_COLORS as Record<string, string>)[cat] ?? P.lime
}

export default function NewWorkoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: P.bg, color: P.ink }} />
      }
    >
      <NewWorkoutPageInner />
    </Suspense>
  )
}

function NewWorkoutPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const utils = trpc.useUtils()
  const logSession = trpc.patient.logSession.useMutation()
  const [step, setStep] = useState<Step>(editId ? 'build' : 'pick-type')
  const [workoutType, setWorkoutType] = useState('')
  const [workoutName, setWorkoutName] = useState('Nieuwe Workout')
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null)
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [feedback, setFeedback] = useState({ effort: 5, pain: 0, satisfaction: 7, notes: '' })
  const [manualDuration, setManualDuration] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveAsProgram, setSaveAsProgram] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Hydrate from saved workout wanneer ?id= aanwezig is (iOS-parity voor tap-op-row)
  useEffect(() => {
    if (!editId) return
    const all = getSavedWorkouts()
    const w = all.find((x) => x.id === editId)
    if (!w) return
    setEditingWorkoutId(w.id)
    setEditingCreatedAt(w.createdAt)
    setWorkoutType(w.type)
    setWorkoutName(w.name || 'Workout')
    setExercises(w.exercises)
    if (w.feedback) setFeedback(w.feedback)
    setStep('build')
  }, [editId])

  // Timer
  useEffect(() => {
    if (step === 'active' && !paused && startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000))
      }, 1000)
      return () => clearInterval(timerRef.current!)
    }
    if (timerRef.current) clearInterval(timerRef.current)
  }, [step, paused, startTime])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  function selectType(type: string) {
    setWorkoutType(type)
    setStep('build')
  }

  function addExercise(ex: RealExercise) {
    const newEx: WorkoutExercise = {
      id: `we-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      exerciseId: ex.id,
      name: ex.name,
      category: ex.category,
      sets: [{ reps: 10, weight: 0, completed: false }, { reps: 10, weight: 0, completed: false }],
    }
    setExercises(prev => [...prev, newEx])
    setStep('build')
  }

  function removeExercise(id: string) {
    setExercises(prev => prev.filter(e => e.id !== id))
  }

  function addSet(exerciseId: string) {
    setExercises(prev => prev.map(e => {
      if (e.id !== exerciseId) return e
      const lastSet = e.sets[e.sets.length - 1]
      return { ...e, sets: [...e.sets, { reps: lastSet?.reps ?? 10, weight: lastSet?.weight ?? 0, completed: false }] }
    }))
  }

  function removeSet(exerciseId: string, setIndex: number) {
    setExercises(prev => prev.map(e => {
      if (e.id !== exerciseId || e.sets.length <= 1) return e
      return { ...e, sets: e.sets.filter((_, i) => i !== setIndex) }
    }))
  }

  const updateSet = useCallback((exerciseId: string, setIndex: number, field: keyof WorkoutSet, value: number | boolean) => {
    setExercises(prev => prev.map(e => {
      if (e.id !== exerciseId) return e
      return { ...e, sets: e.sets.map((s, i) => i === setIndex ? { ...s, [field]: value } : s) }
    }))
  }, [])

  function toggleSetComplete(exerciseId: string, setIndex: number) {
    updateSet(exerciseId, setIndex, 'completed', !exercises.find(e => e.id === exerciseId)?.sets[setIndex]?.completed)
  }

  function toggleExerciseComplete(exerciseId: string) {
    const ex = exercises.find(e => e.id === exerciseId)
    if (!ex) return
    const allDone = ex.sets.every(s => s.completed)
    setExercises(prev => prev.map(e => {
      if (e.id !== exerciseId) return e
      return { ...e, sets: e.sets.map(s => ({ ...s, completed: !allDone })) }
    }))
  }

  function startWorkout() {
    setStartTime(new Date())
    setStep('active')
  }

  function completeWorkout() {
    if (timerRef.current) clearInterval(timerRef.current)
    setManualDuration(startTime ? Math.round((Date.now() - startTime.getTime()) / 60000) : 0)
    setStep('complete')
  }

  async function saveAndFinish() {
    setSaveError(null)
    const now = new Date()
    const durationMinutes = Math.round(manualDuration ?? (startTime ? (now.getTime() - startTime.getTime()) / 60000 : 0))
    const durationSeconds = Math.max(durationMinutes * 60, 60)

    const workout: Workout = {
      id: editingWorkoutId ?? `w-${Date.now()}`,
      name: workoutName,
      type: workoutType,
      description: '',
      exercises,
      createdAt: editingCreatedAt ?? now.toISOString(),
      startedAt: startTime?.toISOString(),
      completedAt: now.toISOString(),
      duration: durationMinutes,
      feedback,
    }
    saveWorkout(workout)

    // Save to database for workload/dashboard tracking
    try {
      await logSession.mutateAsync({
        scheduledAt: (startTime ?? now).toISOString(),
        completedAt: now.toISOString(),
        durationSeconds,
        painLevel: Math.round(feedback.pain),
        exertionLevel: Math.round(feedback.effort),
        exercises: exercises.map(ex => ({
          exerciseId: ex.exerciseId,
          setsCompleted: ex.sets.filter(s => s.completed).length || ex.sets.length,
          repsCompleted: ex.sets[0]?.reps ?? 10,
          painLevel: null,
        })),
      })
      await Promise.all([
        utils.patient.getWorkloadSessions.invalidate(),
        utils.patient.getRecoverySessions.invalidate(),
        utils.patient.getSessionHistory.invalidate(),
      ])
      router.push('/athlete/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      console.error('Session database save failed:', msg)
      setSaveError(`Opslaan mislukt: ${msg}`)
    }
  }

  const typeInfo = WORKOUT_TYPES.find(t => t.value === workoutType)
  const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0)
  const completedSets = exercises.reduce((acc, e) => acc + e.sets.filter(s => s.completed).length, 0)

  // Step 1: Pick workout type
  if (step === 'pick-type') {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.16em',
              fontWeight: 800,
              color: P.inkMuted,
              textTransform: 'uppercase',
            }}
          >
            ← TERUG
          </button>
          <div>
            <Kicker>WORKOUT · NIEUW</Kicker>
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
              KIES TYPE
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {WORKOUT_TYPES.map(type => {
              const Icon = WORKOUT_ICON_MAP[type.value]
              return (
                <Tile
                  key={type.value}
                  onClick={() => selectType(type.value)}
                  accentBar={type.color}
                  style={{ padding: 16 }}
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{
                        background: P.surfaceHi,
                        border: `1px solid ${P.line}`,
                      }}
                    >
                      {Icon ? <Icon size={28} /> : (
                        <span style={{ fontSize: 24 }}>{type.icon}</span>
                      )}
                    </div>
                    <p
                      style={{
                        color: P.ink,
                        fontSize: 14,
                        fontWeight: 900,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {type.label}
                    </p>
                    <MetaLabel style={{ textTransform: 'none', letterSpacing: '0.02em', fontSize: 11 }}>
                      {type.description}
                    </MetaLabel>
                  </div>
                </Tile>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Step: Pick exercises (library)
  if (step === 'pick-exercises') {
    return <ExercisePickerView exercises={exercises} onAdd={addExercise} onBack={() => setStep('build')} />
  }

  // Step: Complete / feedback
  if (step === 'complete') {
    const duration = manualDuration ?? (startTime ? Math.round((Date.now() - startTime.getTime()) / 60000) : 0)
    const startStr = startTime ? startTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '--:--'
    const endStr = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
          <div>
            <Kicker>WORKOUT · VOLTOOID</Kicker>
            <h1
              className="athletic-display"
              style={{
                color: P.ink,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1.02,
                fontSize: 'clamp(36px, 10vw, 64px)',
                paddingTop: 4,
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              {workoutName}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span style={{ fontSize: 18 }}>{typeInfo?.icon}</span>
              <MetaLabel>{typeInfo?.label?.toUpperCase()}</MetaLabel>
            </div>
          </div>

          {/* Time summary */}
          <Tile>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <MetaLabel>START</MetaLabel>
                <p
                  className="athletic-display"
                  style={{
                    color: P.ink,
                    fontSize: 22,
                    fontWeight: 900,
                    lineHeight: '26px',
                    letterSpacing: '-0.02em',
                    marginTop: 6,
                  }}
                >
                  {startStr}
                </p>
              </div>
              <div>
                <MetaLabel>EINDE</MetaLabel>
                <p
                  className="athletic-display"
                  style={{
                    color: P.ink,
                    fontSize: 22,
                    fontWeight: 900,
                    lineHeight: '26px',
                    letterSpacing: '-0.02em',
                    marginTop: 6,
                  }}
                >
                  {endStr}
                </p>
              </div>
              <div>
                <MetaLabel>DUUR (MIN)</MetaLabel>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input
                    type="number"
                    min={0}
                    value={duration}
                    onChange={e => setManualDuration(Math.max(0, Number(e.target.value) || 0))}
                    className="text-center rounded-lg outline-none"
                    style={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.lineStrong}`,
                      color: P.ink,
                      width: 64,
                      padding: '4px 6px',
                      fontFamily: mono,
                      fontSize: 18,
                      fontWeight: 900,
                    }}
                  />
                </div>
              </div>
            </div>
          </Tile>

          {/* Feedback sliders */}
          <Tile>
            <Kicker style={{ marginBottom: 16 }}>HOE WAS JE WORKOUT?</Kicker>
            <div className="space-y-5">
              <FeedbackSlider
                label="INSPANNING"
                value={feedback.effort}
                onChange={v => setFeedback(f => ({ ...f, effort: v }))}
                min={1} max={10}
                leftLabel="MAKKELIJK" rightLabel="MAXIMAAL"
                color={P.lime}
              />
              <FeedbackSlider
                label="PIJN"
                value={feedback.pain}
                onChange={v => setFeedback(f => ({ ...f, pain: v }))}
                min={0} max={10}
                leftLabel="GEEN" rightLabel="VEEL"
                color={P.danger}
              />
              <FeedbackSlider
                label="TEVREDENHEID"
                value={feedback.satisfaction}
                onChange={v => setFeedback(f => ({ ...f, satisfaction: v }))}
                min={1} max={10}
                leftLabel="TELEURGESTELD" rightLabel="TOP!"
                color={P.gold}
              />

              <div>
                <div style={{ marginBottom: 8 }}>
                  <MetaLabel>NOTITIES (OPTIONEEL)</MetaLabel>
                </div>
                <DarkTextarea
                  value={feedback.notes}
                  onChange={e => setFeedback(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Hoe ging het? Opmerkingen..."
                  style={{ minHeight: 80 }}
                />
              </div>
            </div>
          </Tile>

          {/* Save as program option */}
          <Tile>
            <Kicker style={{ marginBottom: 8 }}>OPSLAAN ALS PROGRAMMA?</Kicker>
            <p
              style={{
                color: P.inkMuted,
                fontSize: 12,
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              Sla deze workout op als programma zodat je hem opnieuw kunt gebruiken.
            </p>
            <button
              type="button"
              onClick={() => setSaveAsProgram(p => !p)}
              className="w-full rounded-xl transition-colors"
              style={{
                padding: '10px 14px',
                border: `2px solid ${saveAsProgram ? P.lime : P.line}`,
                background: saveAsProgram ? 'rgba(190,242,100,0.10)' : 'transparent',
                color: saveAsProgram ? P.lime : P.inkMuted,
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              {saveAsProgram ? '✓ OPSLAAN ALS PROGRAMMA' : 'OPSLAAN ALS PROGRAMMA'}
            </button>
            {saveAsProgram && (
              <div style={{ marginTop: 10 }}>
                <DarkInput
                  value={workoutName}
                  onChange={e => setWorkoutName(e.target.value)}
                  placeholder="Naam van het programma..."
                />
              </div>
            )}
          </Tile>

          {saveError && (
            <p style={{ color: P.danger, fontSize: 13, textAlign: 'center' }}>{saveError}</p>
          )}
          <DarkButton
            variant="primary"
            size="lg"
            onClick={saveAndFinish}
            disabled={logSession.isPending}
            className="w-full"
          >
            {logSession.isPending ? 'OPSLAAN…' : 'OPSLAAN & AFSLUITEN'}
          </DarkButton>
        </div>
      </div>
    )
  }

  // Step: Build / Active workout (shared layout)
  const isActive = step === 'active'

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-32 space-y-4">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => isActive ? undefined : router.back()}
            className="flex items-center gap-1"
            style={{
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.16em',
              fontWeight: 800,
              color: P.inkMuted,
              textTransform: 'uppercase',
            }}
          >
            {isActive ? <ChevronDown className="w-4 h-4" /> : '←'}
            {isActive ? '' : ' TERUG'}
          </button>
          <div className="flex items-center gap-2">
            {isActive ? (
              <div
                className="flex items-center gap-2 rounded-full"
                style={{
                  background: paused ? P.purple : P.lime,
                  color: P.bg,
                  padding: '6px 14px',
                  fontFamily: mono,
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                }}
              >
                {paused
                  ? <Play className="w-3.5 h-3.5" onClick={() => setPaused(false)} />
                  : <Pause className="w-3.5 h-3.5" onClick={() => setPaused(true)} />
                }
                {formatTime(elapsed)}
              </div>
            ) : (
              <DarkButton
                variant="primary"
                size="sm"
                onClick={startWorkout}
                disabled={exercises.length === 0}
              >
                ▶ START
              </DarkButton>
            )}
          </div>
        </div>

        {/* Hero: workout name */}
        <div>
          <Kicker>
            {typeInfo ? `${typeInfo.label.toUpperCase()}` : 'WORKOUT'}
            {isActive && ` · ${completedSets}/${totalSets} SETS`}
          </Kicker>
          <input
            value={workoutName}
            onChange={e => setWorkoutName(e.target.value)}
            className="athletic-display w-full bg-transparent outline-none"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(36px, 10vw, 64px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              border: 'none',
              margin: 0,
            }}
          />
        </div>

        {/* Exercise cards */}
        <div className="space-y-2">
          {exercises.map(ex => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              isActive={isActive}
              onAddSet={() => addSet(ex.id)}
              onRemoveSet={(idx) => removeSet(ex.id, idx)}
              onRemove={() => removeExercise(ex.id)}
              onUpdateSet={(idx, field, value) => updateSet(ex.id, idx, field, value)}
              onToggleComplete={(idx) => toggleSetComplete(ex.id, idx)}
              onToggleExercise={() => toggleExerciseComplete(ex.id)}
            />
          ))}

          {/* Add exercise button */}
          {!isActive && (
            <button
              type="button"
              className="w-full rounded-2xl flex items-center justify-center gap-2 transition-colors"
              style={{
                padding: 16,
                border: `2px dashed ${P.lime}`,
                color: P.lime,
                background: 'transparent',
                fontFamily: mono,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
              onClick={() => setStep('pick-exercises')}
            >
              <Plus className="w-4 h-4" /> OEFENING TOEVOEGEN
            </button>
          )}

          {exercises.length === 0 && (
            <Tile style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🏁</div>
              <Kicker>DE STARTLIJN</Kicker>
              <p
                style={{
                  marginTop: 10,
                  color: P.inkMuted,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                Voeg oefeningen toe om te beginnen.
              </p>
            </Tile>
          )}
        </div>
      </div>

      {/* Bottom action */}
      {isActive && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-4">
          <div className="max-w-lg mx-auto">
            <DarkButton
              variant="secondary"
              size="lg"
              onClick={completeWorkout}
              className="w-full"
            >
              WORKOUT AFRONDEN ✓
            </DarkButton>
          </div>
        </div>
      )}
    </div>
  )
}

// Stepper component for +/− number control
function Stepper({ value, onChange, min = 0, step = 1, label, unit }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; label: string; unit?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        style={{
          fontFamily: mono,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.14em',
          color: P.inkMuted,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <div className="flex items-center gap-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-8 h-8 rounded-l-lg flex items-center justify-center"
          style={{
            background: P.surfaceHi,
            border: `1px solid ${P.line}`,
            color: P.inkMuted,
          }}
        >
          <Minus className="w-3 h-3" />
        </button>
        <div
          className="h-8 min-w-[3rem] px-2 flex items-center justify-center"
          style={{
            background: P.surfaceLow,
            borderTop: `1px solid ${P.line}`,
            borderBottom: `1px solid ${P.line}`,
          }}
        >
          <span
            style={{
              color: P.ink,
              fontFamily: mono,
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            {value}
            {unit ? (
              <span style={{ fontSize: 10, color: P.inkMuted, marginLeft: 2 }}>{unit}</span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(value + step)}
          className="w-8 h-8 rounded-r-lg flex items-center justify-center"
          style={{
            background: P.surfaceHi,
            border: `1px solid ${P.line}`,
            color: P.inkMuted,
          }}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// Exercise card component
function ExerciseCard({
  exercise, isActive, onAddSet, onRemoveSet, onRemove, onUpdateSet, onToggleComplete, onToggleExercise,
}: {
  exercise: WorkoutExercise
  isActive: boolean
  onAddSet: () => void
  onRemoveSet: (idx: number) => void
  onRemove: () => void
  onUpdateSet: (idx: number, field: keyof WorkoutSet, value: number | boolean) => void
  onToggleComplete: (idx: number) => void
  onToggleExercise: () => void
}) {
  const color = categoryColor(exercise.category)

  const totalSetsCount = exercise.sets.length
  const defaultReps = exercise.sets[0]?.reps ?? 10
  const defaultWeight = exercise.sets[0]?.weight ?? 0
  const allCompleted = exercise.sets.every(s => s.completed)

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: allCompleted && isActive ? 'rgba(190,242,100,0.06)' : P.surface,
        border: `1px solid ${allCompleted && isActive ? P.lime : P.line}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* Header: circle + name + remove */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        {isActive ? (
          <button
            type="button"
            onClick={onToggleExercise}
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors"
            style={allCompleted
              ? { background: P.lime, border: `2px solid ${P.lime}` }
              : { background: 'transparent', border: `2px solid ${P.inkDim}` }
            }
          >
            {allCompleted && <Check className="w-3.5 h-3.5" style={{ color: P.bg }} />}
          </button>
        ) : (
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: color }}
          />
        )}
        <span
          className="flex-1 truncate"
          style={{
            color: P.ink,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '-0.01em',
          }}
        >
          {exercise.name}
        </span>
        {!isActive && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0"
            style={{ color: P.inkMuted }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Steppers row */}
      <div className="flex items-end justify-around px-3 pb-3">
        <Stepper
          label="SETS"
          value={totalSetsCount}
          min={1}
          onChange={v => {
            if (v > totalSetsCount) onAddSet()
            else if (v < totalSetsCount && totalSetsCount > 1) onRemoveSet(totalSetsCount - 1)
          }}
        />
        <Stepper
          label="REPS"
          value={defaultReps}
          min={1}
          onChange={v => exercise.sets.forEach((_, idx) => onUpdateSet(idx, 'reps', v))}
        />
        <Stepper
          label="GEWICHT"
          value={defaultWeight}
          min={0}
          step={2.5}
          unit="KG"
          onChange={v => exercise.sets.forEach((_, idx) => onUpdateSet(idx, 'weight', v))}
        />
      </div>

      {/* Per-set completion row (active mode) */}
      {isActive && (
        <div
          className="flex gap-1.5 px-3 pb-3 overflow-x-auto"
          style={{ borderTop: `1px solid ${P.line}`, paddingTop: 10 }}
        >
          {exercise.sets.map((set, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onToggleComplete(idx)}
              className="flex items-center gap-1 rounded-full transition-colors shrink-0"
              style={{
                padding: '4px 10px',
                background: set.completed ? 'rgba(190,242,100,0.12)' : P.surfaceLow,
                border: `1px solid ${set.completed ? P.lime : P.line}`,
                color: set.completed ? P.lime : P.inkMuted,
                fontFamily: mono,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              <Check className="w-3 h-3" />
              SET {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Exercise picker view
function ExercisePickerView({
  exercises, onAdd, onBack,
}: {
  exercises: WorkoutExercise[]
  onAdd: (ex: RealExercise) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const { data: allExercises = [], isLoading } = trpc.exercises.list.useQuery(
    {
      query: search || undefined,
      category: categoryFilter || undefined,
    },
    { staleTime: 30_000 }
  )

  const addedIds = new Set(exercises.map(e => e.exerciseId))

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        <button
          type="button"
          onClick={onBack}
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: '0.16em',
            fontWeight: 800,
            color: P.inkMuted,
            textTransform: 'uppercase',
          }}
        >
          ← TERUG
        </button>

        <div>
          <Kicker>BIBLIOTHEEK · KIES OEFENING</Kicker>
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
            OEFENINGEN
          </h1>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            className="w-4 h-4"
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: P.inkMuted,
              pointerEvents: 'none',
            }}
          />
          <DarkInput
            placeholder="Zoek oefeningen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className="shrink-0 rounded-full transition-colors"
            style={{
              padding: '6px 14px',
              background: !categoryFilter ? P.lime : P.surface,
              color: !categoryFilter ? P.bg : P.inkMuted,
              border: `1px solid ${!categoryFilter ? P.lime : P.line}`,
              fontFamily: mono,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            ALLES
          </button>
          {EXERCISE_CATEGORIES.map(cat => {
            const active = categoryFilter === cat.value
            const color = categoryColor(cat.value)
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategoryFilter(active ? null : cat.value)}
                className="shrink-0 rounded-full transition-colors"
                style={{
                  padding: '6px 14px',
                  background: active ? color : P.surface,
                  color: active ? P.bg : P.inkMuted,
                  border: `1px solid ${active ? color : P.line}`,
                  fontFamily: mono,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Exercise list */}
        {isLoading ? (
          <Tile style={{ padding: 32, textAlign: 'center' }}>
            <MetaLabel>LADEN…</MetaLabel>
          </Tile>
        ) : (
          <div className="space-y-2">
            {allExercises.map(ex => {
              const alreadyAdded = addedIds.has(ex.id)
              const color = categoryColor(ex.category)
              const muscles = Object.keys(ex.muscleLoads ?? {}).join(', ')
              const catLabel = EXERCISE_CATEGORIES.find(c => c.value === ex.category)?.label
              return (
                <button
                  key={ex.id}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => !alreadyAdded && onAdd(ex as RealExercise)}
                  className="w-full flex items-center gap-3 rounded-xl text-left transition-all active:scale-[0.98]"
                  style={{
                    background: P.surface,
                    padding: '12px 14px',
                    borderLeft: `3px solid ${color}`,
                    border: `1px solid ${P.line}`,
                    opacity: alreadyAdded ? 0.5 : 1,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.line}`,
                      color,
                      fontFamily: mono,
                      fontSize: 14,
                      fontWeight: 900,
                    }}
                  >
                    {ex.name[0]?.toUpperCase() ?? '·'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{
                        color: P.ink,
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {ex.name}
                    </p>
                    <div
                      className="truncate"
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        letterSpacing: '0.14em',
                        fontWeight: 700,
                        color: P.inkMuted,
                        marginTop: 3,
                        textTransform: 'uppercase',
                      }}
                    >
                      <span style={{ color }}>{catLabel}</span>
                      {muscles ? ` · ${muscles}` : ''}
                    </div>
                  </div>
                  {alreadyAdded ? (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: P.lime, color: P.bg }}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full shrink-0"
                      style={{ border: `2px solid ${P.lineStrong}` }}
                    />
                  )}
                </button>
              )
            })}
            {allExercises.length === 0 && (
              <Tile style={{ padding: 32, textAlign: 'center' }}>
                <MetaLabel>GEEN OEFENINGEN GEVONDEN</MetaLabel>
              </Tile>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Feedback slider component
function FeedbackSlider({
  label, value, onChange, min, max, leftLabel, rightLabel, color,
}: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; leftLabel: string; rightLabel: string; color: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <MetaLabel>{label}</MetaLabel>
        <span
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 900,
            color,
          }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${pct}%, ${P.surfaceHi} ${pct}%)`,
        }}
      />
      <div
        className="flex justify-between mt-1"
        style={{
          fontFamily: mono,
          fontSize: 10,
          letterSpacing: '0.14em',
          fontWeight: 700,
          color: P.inkDim,
          textTransform: 'uppercase',
        }}
      >
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}
