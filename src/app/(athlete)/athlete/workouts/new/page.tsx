'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  WORKOUT_TYPES,
  saveWorkout,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from '@/lib/workout-constants'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { WORKOUT_ICON_MAP } from '@/components/icons'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft, X, Plus, Search, Check, ChevronRight,
  Dumbbell, Play, Pause, Square, Minus, ChevronDown,
} from 'lucide-react'

type Step = 'pick-type' | 'build' | 'pick-exercises' | 'active' | 'complete'

type RealExercise = {
  id: string
  name: string
  category: 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'
  muscleLoads: Record<string, number>
  difficulty: string
}

export default function NewWorkoutPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const logSession = trpc.patient.logSession.useMutation()
  const [step, setStep] = useState<Step>('pick-type')
  const [workoutType, setWorkoutType] = useState('')
  const [workoutName, setWorkoutName] = useState('Nieuwe Workout')
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [feedback, setFeedback] = useState({ effort: 5, pain: 0, satisfaction: 7, notes: '' })
  const [manualDuration, setManualDuration] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveAsProgram, setSaveAsProgram] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      id: `w-${Date.now()}`,
      name: workoutName,
      type: workoutType,
      description: '',
      exercises,
      createdAt: now.toISOString(),
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
      <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
        <div className="px-4 pt-12 pb-6" style={{ background: '#1C2425' }}>
          <button onClick={() => router.back()} className="text-[#7B8889] flex items-center gap-1 text-sm mb-3">
            <ArrowLeft className="w-4 h-4" /> Terug
          </button>
          <h1 className="text-white text-xl font-bold">Nieuwe Workout</h1>
          <p className="text-[#7B8889] text-sm mt-1">Kies je workout type</p>
        </div>
        <div className="px-4 -mt-3 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {WORKOUT_TYPES.map(type => (
              <Card
                key={type.value}
                style={{ borderRadius: '14px', cursor: 'pointer' }}
                className="hover:shadow-md transition-shadow"
                onClick={() => selectType(type.value)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: type.color + '20' }}
                  >
                    {(() => { const Icon = WORKOUT_ICON_MAP[type.value]; return Icon ? <Icon size={28} /> : type.icon })()}
                  </div>
                  <p className="text-sm font-bold">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </CardContent>
              </Card>
            ))}
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
      <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
        <div className="px-4 pt-12 pb-6" style={{ background: '#1C2425' }}>
          <p className="text-[#7B8889] text-xs uppercase tracking-wider">Workout Voltooid</p>
          <h1 className="text-white text-xl font-bold mt-1">{workoutName}</h1>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-lg">{typeInfo?.icon}</span>
            <span className="text-[#7B8889] text-sm">{typeInfo?.label}</span>
          </div>
        </div>

        <div className="px-4 -mt-3 space-y-4 pb-6">
          {/* Time summary */}
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Start</p>
                  <p className="text-lg font-bold mt-1">{startStr}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Einde</p>
                  <p className="text-lg font-bold mt-1">{endStr}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Duur (min)</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <input
                      type="number"
                      min={0}
                      value={duration}
                      onChange={e => setManualDuration(Math.max(0, Number(e.target.value) || 0))}
                      className="w-14 text-lg font-bold text-center bg-[#1C2425] rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-[#BEF264]"
                    />
                    <span className="text-lg font-bold">&apos;</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback sliders */}
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="p-4 space-y-5">
              <p className="font-bold text-sm">Hoe was je workout?</p>

              <FeedbackSlider
                label="Inspanning"
                value={feedback.effort}
                onChange={v => setFeedback(f => ({ ...f, effort: v }))}
                min={1} max={10}
                leftLabel="Makkelijk" rightLabel="Maximaal"
                color="#BEF264"
              />
              <FeedbackSlider
                label="Pijn"
                value={feedback.pain}
                onChange={v => setFeedback(f => ({ ...f, pain: v }))}
                min={0} max={10}
                leftLabel="Geen" rightLabel="Veel"
                color="#ef4444"
              />
              <FeedbackSlider
                label="Tevredenheid"
                value={feedback.satisfaction}
                onChange={v => setFeedback(f => ({ ...f, satisfaction: v }))}
                min={1} max={10}
                leftLabel="Teleurgesteld" rightLabel="Top!"
                color="#f97316"
              />

              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Notities (optioneel)</p>
                <textarea
                  value={feedback.notes}
                  onChange={e => setFeedback(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Hoe ging het? Opmerkingen..."
                  className="w-full border rounded-xl p-3 text-sm resize-none h-20 bg-[#141A1B]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Save as program option */}
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">Workout opslaan als programma?</p>
              <p className="text-xs text-muted-foreground mb-3">Sla deze workout op als programma zodat je hem opnieuw kunt gebruiken.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSaveAsProgram(p => !p)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                  style={saveAsProgram ? { borderColor: '#BEF264', color: '#BEF264', background: '#BEF26410' } : { borderColor: 'rgba(255,255,255,0.12)', color: '#a1a1aa' }}
                >
                  {saveAsProgram ? '✓ Opslaan als programma' : 'Opslaan als programma'}
                </button>
              </div>
              {saveAsProgram && (
                <input
                  type="text"
                  value={workoutName}
                  onChange={e => setWorkoutName(e.target.value)}
                  placeholder="Naam van het programma..."
                  className="mt-2 w-full border rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#BEF264]"
                />
              )}
            </CardContent>
          </Card>

          {saveError && (
            <p className="text-sm text-red-500 text-center px-2">{saveError}</p>
          )}
          <Button
            className="w-full text-white font-semibold"
            style={{ background: '#BEF264', borderRadius: '14px', height: '48px' }}
            onClick={saveAndFinish}
            disabled={logSession.isPending}
          >
            {logSession.isPending ? 'Opslaan…' : 'Opslaan & afsluiten'}
          </Button>
        </div>
      </div>
    )
  }

  // Step: Build / Active workout (shared layout)
  const isActive = step === 'active'

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-4" style={{ background: '#1C2425' }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => isActive ? undefined : router.back()} className="text-[#7B8889] flex items-center gap-1 text-sm">
            {isActive ? <ChevronDown className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            {isActive ? '' : 'Terug'}
          </button>
          <div className="flex items-center gap-2">
            {isActive ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-mono font-bold"
                style={{ background: paused ? '#a78bfa' : '#BEF264' }}
              >
                {paused ? <Play className="w-3.5 h-3.5" onClick={() => setPaused(false)} /> : <Pause className="w-3.5 h-3.5" onClick={() => setPaused(true)} />}
                {formatTime(elapsed)}
              </div>
            ) : (
              <Button
                size="sm"
                className="text-white font-semibold gap-1.5"
                style={{ background: '#BEF264' }}
                onClick={startWorkout}
                disabled={exercises.length === 0}
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Start
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={workoutName}
            onChange={e => setWorkoutName(e.target.value)}
            className="text-white text-lg font-bold bg-transparent border-none outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-base">{typeInfo?.icon}</span>
          <span className="text-[#7B8889] text-sm">{typeInfo?.label}</span>
          {isActive && (
            <span className="text-[#7B8889] text-xs ml-auto">{completedSets}/{totalSets} sets</span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3 pb-28">
        {/* Exercise cards */}
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
            className="w-full border-2 border-dashed rounded-2xl p-4 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:border-[#BEF264] hover:text-[#BEF264] transition-colors"
            onClick={() => setStep('pick-exercises')}
          >
            <Plus className="w-4 h-4" /> Oefening toevoegen
          </button>
        )}

        {exercises.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">De startlijn</p>
            <p className="text-xs text-muted-foreground mt-2">Voeg oefeningen toe om te beginnen</p>
          </div>
        )}
      </div>

      {/* Bottom action */}
      {isActive && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-4">
          <Button
            className="w-full font-semibold text-base"
            style={{ background: '#1C2425', borderRadius: '14px', height: '52px' }}
            onClick={completeWorkout}
          >
            Workout Afronden
          </Button>
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
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] uppercase text-muted-foreground font-medium tracking-wide">{label}</span>
      <div className="flex items-center gap-0">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-7 h-7 rounded-l-lg bg-[#1C2425] flex items-center justify-center active:bg-[rgba(255,255,255,0.08)] transition-colors"
        >
          <Minus className="w-3 h-3 text-[#7B8889]" />
        </button>
        <div className="h-7 min-w-[2.5rem] px-1 bg-[#1C2425] flex items-center justify-center border-y border-[rgba(255,255,255,0.06)]">
          <span className="text-sm font-bold tabular-nums">{value}{unit ? <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span> : null}</span>
        </div>
        <button
          onClick={() => onChange(value + step)}
          className="w-7 h-7 rounded-r-lg bg-[#1C2425] flex items-center justify-center active:bg-[rgba(255,255,255,0.08)] transition-colors"
        >
          <Plus className="w-3 h-3 text-[#7B8889]" />
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
  const color = exercise.category === 'STRENGTH' ? '#BEF264'
    : exercise.category === 'MOBILITY' ? '#60a5fa'
    : exercise.category === 'PLYOMETRICS' ? '#f97316'
    : exercise.category === 'CARDIO' ? '#ef4444' : '#a78bfa'

  const totalSetsCount = exercise.sets.length
  const defaultReps = exercise.sets[0]?.reps ?? 10
  const defaultWeight = exercise.sets[0]?.weight ?? 0
  const allCompleted = exercise.sets.every(s => s.completed)

  return (
    <div
      className="rounded-xl border bg-[#141A1B] overflow-hidden transition-all"
      style={allCompleted && isActive ? { borderColor: '#BEF264', background: '#BEF26408' } : {}}
    >
      {/* Header: circle + name + remove */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        {isActive ? (
          <button
            onClick={onToggleExercise}
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
            style={allCompleted
              ? { borderColor: '#BEF264', background: '#BEF264' }
              : { borderColor: '#4A5454' }
            }
          >
            {allCompleted && <Check className="w-3.5 h-3.5 text-white" />}
          </button>
        ) : (
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        )}
        <span className="flex-1 text-sm font-semibold truncate">{exercise.name}</span>
        {!isActive && (
          <button onClick={onRemove} className="text-zinc-300 hover:text-destructive shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Steppers row */}
      <div className="flex items-end justify-around px-3 pb-3">
        <Stepper
          label="Sets"
          value={totalSetsCount}
          min={1}
          onChange={v => {
            if (v > totalSetsCount) onAddSet()
            else if (v < totalSetsCount && totalSetsCount > 1) onRemoveSet(totalSetsCount - 1)
          }}
        />
        <Stepper
          label="Reps"
          value={defaultReps}
          min={1}
          onChange={v => exercise.sets.forEach((_, idx) => onUpdateSet(idx, 'reps', v))}
        />
        <Stepper
          label="Gewicht"
          value={defaultWeight}
          min={0}
          step={2.5}
          unit="kg"
          onChange={v => exercise.sets.forEach((_, idx) => onUpdateSet(idx, 'weight', v))}
        />
      </div>

      {/* Per-set completion row (active mode) */}
      {isActive && (
        <div className="flex gap-1.5 px-3 pb-3 overflow-x-auto">
          {exercise.sets.map((set, idx) => (
            <button
              key={idx}
              onClick={() => onToggleComplete(idx)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0"
              style={set.completed
                ? { background: '#BEF26420', color: '#BEF264' }
                : { background: '#1C2425', color: '#a1a1aa' }
              }
            >
              <Check className="w-3 h-3" />
              Set {idx + 1}
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

  const CATEGORY_COLORS: Record<string, string> = {
    STRENGTH: '#BEF264',
    MOBILITY: '#60a5fa',
    PLYOMETRICS: '#f97316',
    CARDIO: '#ef4444',
    STABILITY: '#a78bfa',
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1C2425' }}>
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-[#7B8889] flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Terug
          </button>
          <h1 className="text-white text-lg font-bold">Oefeningen</h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-3 pb-6">
        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Zoek oefeningen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-[#141A1B]"
              style={{ borderRadius: '12px' }}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition-colors ${!categoryFilter ? 'bg-[#1A3A3A] text-white' : 'bg-[#141A1B] text-muted-foreground border'}`}
            onClick={() => setCategoryFilter(null)}
          >
            Alles
          </button>
          {EXERCISE_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition-colors ${categoryFilter === cat.value ? 'text-white' : 'bg-[#141A1B] text-muted-foreground border'}`}
              style={categoryFilter === cat.value ? { background: CATEGORY_COLORS[cat.value] } : {}}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Exercise list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Laden…</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allExercises.map(ex => {
              const alreadyAdded = addedIds.has(ex.id)
              const color = CATEGORY_COLORS[ex.category] ?? '#BEF264'
              const muscles = Object.keys(ex.muscleLoads ?? {}).join(', ')
              return (
                <Card
                  key={ex.id}
                  style={{ borderRadius: '12px', opacity: alreadyAdded ? 0.5 : 1 }}
                  className={alreadyAdded ? '' : 'hover:shadow-md transition-shadow cursor-pointer'}
                  onClick={() => !alreadyAdded && onAdd(ex as RealExercise)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: color + '20' }}
                    >
                      <Dumbbell className="w-5 h-5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ex.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {EXERCISE_CATEGORIES.find(c => c.value === ex.category)?.label}{muscles ? ` · ${muscles}` : ''}
                      </p>
                    </div>
                    {alreadyAdded ? (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#BEF264' }}>
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full border-2 border-[rgba(255,255,255,0.12)]" />
                    )}
                  </CardContent>
                </Card>
              )
            })}
            {allExercises.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">Geen oefeningen gevonden</p>
              </div>
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
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{label}</p>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${((value - min) / (max - min)) * 100}%, #e4e4e7 ${((value - min) / (max - min)) * 100}%)`,
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}
