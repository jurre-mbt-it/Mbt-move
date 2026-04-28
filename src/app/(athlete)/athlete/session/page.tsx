'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import {
  Search, X, Plus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
} from '@/components/dark-ui'
import { IconStrength } from '@/components/icons'

type DbExercise = {
  id: string
  name: string
  category: string
  [key: string]: unknown
}

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

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
  // Cast naar lokaal shallow type; tRPC inference is te diep voor TS (TS2589).
  const dbExercisesQuery = trpc.exercises.list.useQuery(undefined, { staleTime: 60_000 })
  const dbExercises: DbExercise[] = (dbExercisesQuery.data as DbExercise[] | undefined) ?? []
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <MetaLabel>LADEN…</MetaLabel>
      </div>
    )
  }

  // Non-quick mode with no exercises: show empty state
  if (!isQuickMode && exercises.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <div className="text-center space-y-3 px-4">
          <MetaLabel>GEEN OEFENINGEN VOOR VANDAAG</MetaLabel>
          <div>
            <DarkButton href="/athlete/dashboard" variant="secondary">
              TERUG NAAR DASHBOARD
            </DarkButton>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'ready') {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
          <Link
            href="/athlete/dashboard"
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
          </Link>

          {/* Hero */}
          <div>
            <Kicker>
              {isQuickMode ? 'QUICK · WORKOUT' : `SESSIE · ${exercises.length} OEFENINGEN`}
            </Kicker>
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
              {isQuickMode ? 'QUICK START' : DAY_NAMES[todayDayNum - 1].toUpperCase()}
            </h1>
            {isQuickMode && (
              <div style={{ marginTop: 6 }}>
                <MetaLabel>VOEG OEFENINGEN TOE EN START DIRECT</MetaLabel>
              </div>
            )}
          </div>

          {/* Exercise list */}
          {exercises.length === 0 && isQuickMode ? (
            <div
              className="flex flex-col items-center justify-center py-12 rounded-2xl text-center gap-3"
              style={{
                background: 'rgba(190,242,100,0.06)',
                border: `2px dashed ${P.lime}`,
              }}
            >
              <IconStrength size={40} />
              <p
                style={{
                  color: P.lime,
                  fontWeight: 900,
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                VOEG JE EERSTE OEFENING TOE
              </p>
              <p
                style={{
                  color: P.inkMuted,
                  fontSize: 12,
                  lineHeight: 1.5,
                  maxWidth: 240,
                }}
              >
                Kies oefeningen uit de bibliotheek en begin met trainen.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {exercises.map((e, i) => (
                <div
                  key={e.uid}
                  className="flex items-center gap-3 rounded-xl"
                  style={{
                    background: P.surface,
                    padding: '12px 14px',
                    borderLeft: `3px solid ${P.lime}`,
                    border: `1px solid ${P.line}`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.line}`,
                      color: P.lime,
                      fontFamily: mono,
                      fontSize: 14,
                      fontWeight: 900,
                    }}
                  >
                    {i + 1}
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
                      {e.name}
                    </p>
                    <div
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
                      {e.sets} × {e.reps} {e.repUnit}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add exercise button */}
          <button
            type="button"
            onClick={() => setShowAddExercise(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl transition-all active:scale-[0.98]"
            style={{
              padding: '14px 16px',
              border: `2px dashed ${P.lime}`,
              color: P.lime,
              background: 'transparent',
              fontFamily: mono,
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <Plus className="w-4 h-4" />
            OEFENING TOEVOEGEN
          </button>

          <DarkButton
            variant="primary"
            size="lg"
            disabled={exercises.length === 0}
            onClick={() => setState('active')}
            className="w-full"
          >
            ▶ START SESSIE
          </DarkButton>
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg w-full mx-auto px-4 space-y-4 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{
              background: 'rgba(190,242,100,0.12)',
              border: `1px solid ${P.lime}`,
            }}
          >
            <span style={{ color: P.lime, fontSize: 28, fontWeight: 900 }}>✓</span>
          </div>
          <div>
            <Kicker>SESSIE · VOLTOOID</Kicker>
            <h2
              className="athletic-display"
              style={{
                color: P.ink,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                lineHeight: 1.02,
                fontSize: 40,
                paddingTop: 4,
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              LEKKER BEZIG
            </h2>
          </div>
          <MetaLabel>
            {completed.size}/{exercises.length} OEFENINGEN · {mins}:{secs.toString().padStart(2, '0')}
          </MetaLabel>
          {error && (
            <p style={{ color: P.danger, fontSize: 13 }}>{error}</p>
          )}
          <DarkButton
            variant="primary"
            size="lg"
            disabled={logSession.isPending}
            onClick={handleFinish}
            className="w-full"
          >
            {logSession.isPending ? 'OPSLAAN…' : 'OPSLAAN & AFSLUITEN'}
          </DarkButton>
        </div>
      </div>
    )
  }

  // Active state
  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setState('ready')}
            style={{
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.16em',
              fontWeight: 800,
              color: P.inkMuted,
              textTransform: 'uppercase',
            }}
          >
            ← OVERZICHT
          </button>
          <div className="flex items-center gap-3">
            <span
              style={{
                fontFamily: mono,
                fontSize: 13,
                fontWeight: 900,
                color: P.lime,
                letterSpacing: '0.04em',
              }}
            >
              {mins}:{secs.toString().padStart(2, '0')}
            </span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: '0.14em',
                fontWeight: 700,
                color: P.inkMuted,
                textTransform: 'uppercase',
              }}
            >
              {currentIndex + 1}/{exercises.length}
            </span>
          </div>
        </div>

        {/* Hero: current exercise */}
        <Tile accentBar={P.lime} style={{ padding: 20 }}>
          <Kicker>VANDAAG · ACTIEF</Kicker>
          <div
            className="athletic-display"
            style={{
              color: P.ink,
              fontSize: 32,
              lineHeight: '38px',
              letterSpacing: '-0.03em',
              fontWeight: 900,
              paddingTop: 4,
              marginTop: 8,
              textTransform: 'uppercase',
            }}
          >
            {current?.name ?? '—'}
          </div>
          <div style={{ marginTop: 10 }}>
            <MetaLabel>
              {current
                ? `${current.sets} × ${current.reps} ${current.repUnit.toUpperCase()}`
                : ''}
            </MetaLabel>
          </div>
        </Tile>

        {/* Rest info */}
        <Tile>
          <div className="text-center">
            <MetaLabel>RUST · {current?.restTime ?? 60}S TUSSEN SETS</MetaLabel>
          </div>
        </Tile>

        <DarkButton
          variant="primary"
          size="lg"
          onClick={markDone}
          className="w-full"
        >
          {currentIndex < exercises.length - 1 ? 'VOLGENDE OEFENING →' : 'SESSIE AFRONDEN ✓'}
        </DarkButton>

        {/* Add exercise during session */}
        <button
          type="button"
          onClick={() => setShowAddExercise(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl transition-all active:scale-[0.98]"
          style={{
            padding: '12px 16px',
            border: `1px dashed ${P.lime}`,
            color: P.lime,
            background: 'transparent',
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          OEFENING TOEVOEGEN
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 flex-wrap pt-2">
          {exercises.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: completed.has(i)
                  ? P.lime
                  : i === currentIndex
                    ? P.gold
                    : P.inkDim,
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
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl flex flex-col"
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          maxWidth: 480,
          margin: '0 auto',
          maxHeight: '80vh',
        }}
      >
        <div className="flex-none px-5 pt-4 pb-3">
          <div
            className="w-10 h-1 rounded-full mx-auto mb-3"
            style={{ background: P.lineStrong }}
          />
          <div className="flex items-center justify-between">
            <Kicker>OEFENING · TOEVOEGEN</Kicker>
            <button type="button" onClick={onClose} style={{ color: P.inkMuted }}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative mt-3">
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
            <input
              type="text"
              placeholder="Zoek oefening…"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              className="w-full rounded-xl outline-none"
              style={{
                background: P.surfaceHi,
                border: `1px solid ${P.lineStrong}`,
                color: P.ink,
                padding: '10px 14px 10px 40px',
                fontSize: 14,
              }}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-6">
              <MetaLabel>GEEN OEFENINGEN GEVONDEN</MetaLabel>
            </div>
          ) : (
            filtered.map(ex => {
              const alreadyAdded = added.some(ae => ae.exerciseId === ex.id)
              return (
                <button
                  key={ex.id}
                  type="button"
                  className="w-full flex items-center gap-3 rounded-xl text-left transition-all active:scale-[0.98]"
                  style={{
                    background: alreadyAdded ? 'rgba(190,242,100,0.10)' : P.surfaceLow,
                    border: `1px solid ${alreadyAdded ? P.lime : P.line}`,
                    padding: '12px 14px',
                  }}
                  onClick={() => onAdd(ex)}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: alreadyAdded ? P.lime : P.surfaceHi,
                      color: alreadyAdded ? P.bg : P.ink,
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    {alreadyAdded ? '✓' : ex.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{
                        color: P.ink,
                        fontSize: 13,
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {ex.name}
                    </p>
                    <div
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
                      {ex.category} · 3 × 10 REPS
                    </div>
                  </div>
                  {!alreadyAdded && (
                    <Plus className="w-4 h-4 shrink-0" style={{ color: P.inkMuted }} />
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
