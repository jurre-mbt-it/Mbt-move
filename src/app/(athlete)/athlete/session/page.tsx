'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc/client'
import {
  Play, CheckCircle2, ArrowLeft, Timer, Clock,
  PlusCircle, Search, X, Plus, Zap,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { IconStrength } from '@/components/icons'

type DbExercise = {
  id: string
  name: string
  category: string
  [key: string]: unknown
}

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

type SessionState = 'ready' | 'active' | 'done'

type LiveExercise = {
  uid: string
  exerciseId: string
  name: string
  category: string
  sets: number
  reps: number
  repUnit: string
  restTime: number
}

function dbExerciseToLive(ex: DbExercise): LiveExercise {
  return {
    uid: `q-${ex.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    exerciseId: ex.id,
    name: ex.name,
    category: ex.category,
    sets: 3,
    reps: 10,
    repUnit: 'reps',
    restTime: 60,
  }
}

export default function AthleteSessionPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: sessionData, isLoading } = trpc.patient.getTodayExercises.useQuery()
  const { data: dbExercises = [] } = trpc.exercises.list.useQuery(undefined, { staleTime: 60_000 })
  const logSession = trpc.patient.logSession.useMutation()

  // Quick mode detection
  const [isQuickMode, setIsQuickMode] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsQuickMode(params.get('mode') === 'quick')
  }, [])

  const programExercises: LiveExercise[] = (sessionData?.exercises ?? []).map(e => ({
    uid: e.uid,
    exerciseId: e.exerciseId,
    name: e.name,
    category: e.category,
    sets: e.sets,
    reps: e.reps,
    repUnit: e.repUnit,
    restTime: e.restTime,
  }))

  // Extra exercises added during session
  const [extraExercises, setExtraExercises] = useState<LiveExercise[]>([])
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [addExerciseQuery, setAddExerciseQuery] = useState('')

  const baseExercises = isQuickMode ? [] : programExercises
  const exercises: LiveExercise[] = [...baseExercises, ...extraExercises]

  const [state, setState] = useState<SessionState>('ready')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startTimeRef = useRef<number | null>(null)

  // Start timer when session becomes active
  useEffect(() => {
    if (state !== 'active') return
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state])

  const current = exercises[currentIndex]
  const todayDayNum = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  function addExercise(ex: DbExercise) {
    setExtraExercises(prev => [...prev, dbExerciseToLive(ex)])
    setShowAddExercise(false)
    setAddExerciseQuery('')
  }

  const filteredLibrary = addExerciseQuery
    ? dbExercises.filter(e =>
        e.name.toLowerCase().includes(addExerciseQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(addExerciseQuery.toLowerCase())
      )
    : dbExercises

  function markDone() {
    setCompleted(prev => new Set(prev).add(currentIndex))
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setState('done')
    }
  }

  async function handleFinish() {
    setError(null)
    try {
      await logSession.mutateAsync({
        programId: isQuickMode ? undefined : sessionData?.program?.id,
        scheduledAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds: Math.max(elapsed, 1),
        painLevel: null,
        exertionLevel: null,
        exercises: exercises.map(e => ({
          exerciseId: e.exerciseId,
          setsCompleted: e.sets,
          repsCompleted: e.reps,
          painLevel: null,
        })),
      })
      await Promise.all([
        utils.patient.getWorkloadSessions.invalidate(),
        utils.patient.getRecoverySessions.invalidate(),
        utils.patient.getSessionHistory.invalidate(),
        utils.patient.getTodayExercises.invalidate(),
        utils.patient.getActiveProgram.invalidate(),
      ])
      router.push('/athlete/dashboard')
    } catch (err) {
      console.error('Session save failed:', err)
      setError('Opslaan mislukt. Probeer het opnieuw.')
    }
  }

  if (isLoading && !isQuickMode) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <p className="text-muted-foreground text-sm">Laden…</p>
      </div>
    )
  }

  // Non-quick mode with no exercises: show empty state
  if (!isQuickMode && exercises.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Geen oefeningen voor vandaag</p>
          <Link href="/athlete/dashboard">
            <Button variant="outline">Terug naar dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'ready') {
    return (
      <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
        <div className="px-4 pt-12 pb-8" style={{ background: '#1C2425' }}>
          <Link href="/athlete/dashboard" className="text-[#7B8889] flex items-center gap-1 text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Terug
          </Link>
          {isQuickMode ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5" style={{ color: '#BEF264' }} />
                <h1 className="text-white text-xl font-bold">Quick Workout</h1>
              </div>
              <p className="text-[#7B8889] text-sm">Voeg oefeningen toe en start direct</p>
            </div>
          ) : (
            <div>
              <h1 className="text-white text-xl font-bold">{DAY_NAMES[todayDayNum - 1]}</h1>
              <p className="text-[#7B8889] text-sm mt-1">{exercises.length} oefeningen</p>
            </div>
          )}
        </div>

        <div className="px-4 -mt-3 space-y-3 pb-6">
          {/* Exercise list */}
          {exercises.length === 0 && isQuickMode ? (
            <div
              className="flex flex-col items-center justify-center py-12 rounded-2xl text-center gap-3"
              style={{ background: 'rgba(190,242,100,0.10)', border: '2px dashed #BEF26480' }}
            >
              <div className="text-4xl"><IconStrength size={40} /></div>
              <p className="font-semibold" style={{ color: '#BEF264' }}>Voeg je eerste oefening toe</p>
              <p className="text-sm text-muted-foreground max-w-[240px]">
                Kies oefeningen uit de bibliotheek en begin met trainen
              </p>
            </div>
          ) : (
            exercises.map((e, i) => (
              <Card key={e.uid} style={{ borderRadius: '14px' }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                    style={{ background: 'rgba(190,242,100,0.10)', color: '#BEF264' }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.sets} × {e.reps} {e.repUnit}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* Add exercise button */}
          <button
            onClick={() => setShowAddExercise(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium border-2 border-dashed transition-all active:scale-[0.98]"
            style={{ borderColor: '#BEF26480', color: '#BEF264' }}
          >
            <PlusCircle className="w-4 h-4" />
            Oefening toevoegen
          </button>

          <Button
            className="w-full gap-2 text-white"
            style={{ background: exercises.length > 0 ? '#BEF264' : '#a1a1aa' }}
            disabled={exercises.length === 0}
            onClick={() => setState('active')}
          >
            <Play className="w-4 h-4 fill-current" /> Start sessie
          </Button>
        </div>

        {/* Add exercise bottom sheet */}
        {showAddExercise && (
          <AddExerciseSheet
            query={addExerciseQuery}
            onQueryChange={setAddExerciseQuery}
            filtered={filteredLibrary}
            added={extraExercises}
            onAdd={addExercise}
            onClose={() => { setShowAddExercise(false); setAddExerciseQuery('') }}
          />
        )}
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <div className="text-center space-y-4 px-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(190,242,100,0.10)' }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: '#BEF264' }} />
          </div>
          <h2 className="text-xl font-bold">Sessie voltooid!</h2>
          <p className="text-muted-foreground text-sm">
            {completed.size}/{exercises.length} oefeningen · {mins}:{secs.toString().padStart(2, '0')}
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button
            style={{ background: '#BEF264' }}
            className="text-white"
            disabled={logSession.isPending}
            onClick={handleFinish}
          >
            {logSession.isPending ? 'Opslaan…' : 'Opslaan & afsluiten'}
          </Button>
        </div>
      </div>
    )
  }

  // Active state
  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1C2425' }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setState('ready')} className="text-[#7B8889] flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Overzicht
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[#7B8889] text-sm tabular-nums">
              <Clock className="w-3.5 h-3.5" />
              {mins}:{secs.toString().padStart(2, '0')}
            </div>
            <span className="text-[#7B8889] text-sm">{currentIndex + 1}/{exercises.length}</span>
          </div>
        </div>
        <h1 className="text-white text-lg font-bold">{current?.name ?? '—'}</h1>
        <p className="text-[#7B8889] text-sm mt-1">
          {current ? `${current.sets} × ${current.reps} ${current.repUnit}` : ''}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4 pb-6">
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Timer className="w-4 h-4" />
              <span className="text-sm">Rust: {current?.restTime ?? 60}s tussen sets</span>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full gap-2 text-white" style={{ background: '#BEF264' }} onClick={markDone}>
          <CheckCircle2 className="w-4 h-4" />
          {currentIndex < exercises.length - 1 ? 'Volgende oefening' : 'Sessie afronden'}
        </Button>

        {/* Add exercise during session */}
        <button
          onClick={() => setShowAddExercise(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-dashed transition-all active:scale-[0.98]"
          style={{ borderColor: '#BEF26480', color: '#BEF264' }}
        >
          <Plus className="w-4 h-4" />
          Oefening toevoegen aan sessie
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 flex-wrap">
          {exercises.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: completed.has(i) ? '#BEF264' : i === currentIndex ? '#1C2425' : '#4A5454'
              }}
            />
          ))}
        </div>
      </div>

      {/* Add exercise bottom sheet */}
      {showAddExercise && (
        <AddExerciseSheet
          query={addExerciseQuery}
          onQueryChange={setAddExerciseQuery}
          filtered={filteredLibrary}
          added={extraExercises}
          onAdd={addExercise}
          onClose={() => { setShowAddExercise(false); setAddExerciseQuery('') }}
        />
      )}
    </div>
  )
}

// ─── Reusable add-exercise bottom sheet ──────────────────────────────────────

function AddExerciseSheet({
  query,
  onQueryChange,
  filtered,
  added,
  onAdd,
  onClose,
}: {
  query: string
  onQueryChange: (q: string) => void
  filtered: DbExercise[]
  added: LiveExercise[]
  onAdd: (ex: DbExercise) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl flex flex-col"
        style={{ background: '#fff', maxWidth: 480, margin: '0 auto', maxHeight: '80vh' }}
      >
        <div className="flex-none px-5 pt-4 pb-3">
          <div className="w-10 h-1 bg-[rgba(255,255,255,0.08)] rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <p className="font-bold text-base">Oefening toevoegen</p>
            <button onClick={onClose}><X className="w-5 h-5 text-[#7B8889]" /></button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Zoek oefening…"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-zinc-200"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Geen oefeningen gevonden</p>
          ) : (
            filtered.map(ex => {
              const alreadyAdded = added.some(ae => ae.exerciseId === ex.id)
              return (
                <button
                  key={ex.id}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.98]"
                  style={{
                    background: alreadyAdded ? 'rgba(190,242,100,0.10)' : '#fff',
                    borderColor: alreadyAdded ? '#BEF264' : 'rgba(255,255,255,0.12)',
                  }}
                  onClick={() => onAdd(ex)}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: alreadyAdded ? '#BEF264' : '#1C2425' }}
                  >
                    {alreadyAdded ? '✓' : ex.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">{ex.category} · 3 × 10 reps</p>
                  </div>
                  {!alreadyAdded && (
                    <Plus className="w-4 h-4 shrink-0 text-[#7B8889]" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
