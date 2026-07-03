'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { trpc } from '@/lib/trpc/client'
import {
  Search, X, Plus, Play, Heart,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
  DarkInput,
  DarkTextarea,
} from '@/components/dark-ui'
import {
  IconStrength,
  IconLightning,
  IconHeart,
  IconMoodVeryLow,
  IconMoodLow,
  IconMoodNeutral,
  IconMoodGood,
  IconMoodGreat,
} from '@/components/icons'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = dynamic(() => import('react-player') as any, { ssr: false }) as any

type DbExercise = {
  id: string
  name: string
  category: string
  videoUrl?: string | null
  isFavorite?: boolean
  [key: string]: unknown
}

// Item uit patient.mostUsedExercises — DbExercise + gebruiks-teller.
type UsedExercise = DbExercise & { count: number }

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

const CATEGORY_LABELS_NL: Record<string, string> = {
  STRENGTH: 'KRACHT',
  MOBILITY: 'MOBILITEIT',
  PLYOMETRICS: 'PLYOMETRIE',
  CARDIO: 'CARDIO',
  STABILITY: 'STABILITEIT',
}

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
  videoUrl: string | null
  /** Gewicht (kg) per set als strings — alleen voor de bewerkbare quick-workout. */
  weights?: string[]
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
    videoUrl: (ex.videoUrl as string | null | undefined) ?? null,
    weights: ['', '', ''],
  }
}

/** Schaal het gewicht-array mee met het aantal sets (zoals het therapeut-scherm). */
function resizeWeights(current: string[], target: number): string[] {
  const n = Math.max(1, target)
  if (current.length === n) return current
  if (current.length > n) return current.slice(0, n)
  return [...current, ...Array(n - current.length).fill('')]
}

export default function AthleteSessionPage() {
  // useSearchParams vereist een Suspense-boundary (zelfde patroon als
  // workouts/new); voorkomt ook de flash van programma-oefeningen in quick
  // mode die de oude useEffect-detectie gaf.
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: P.bg, color: P.ink }} />
      }
    >
      <AthleteSessionPageInner />
    </Suspense>
  )
}

function AthleteSessionPageInner() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: sessionData, isLoading } = trpc.patient.getTodayExercises.useQuery()
  // Cast naar lokaal shallow type; tRPC inference is te diep voor TS (TS2589).
  const dbExercisesQuery = trpc.exercises.list.useQuery(undefined, { staleTime: 60_000 })
  const dbExercises: DbExercise[] = (dbExercisesQuery.data as DbExercise[] | undefined) ?? []
  // Meest gebruikte oefeningen van de atleet zelf (eigen historie).
  const mostUsedQuery = trpc.patient.mostUsedExercises.useQuery(undefined, { staleTime: 60_000 })
  const mostUsed: UsedExercise[] = (mostUsedQuery.data as UsedExercise[] | undefined) ?? []
  const toggleFavorite = trpc.exercises.toggleFavorite.useMutation()
  const logSession = trpc.patient.logSession.useMutation()

  // Favorieten = oefeningen met de isFavorite-vlag uit exercises.list.
  const favorites: DbExercise[] = dbExercises.filter(e => e.isFavorite === true)

  // Optimistisch hart togglen: pas de gecachete lijst direct aan zodat de
  // favorieten-sectie meteen meebeweegt; draai terug bij een fout.
  function toggleFav(id: string) {
    const flip = (old: unknown) =>
      ((old as DbExercise[] | undefined)?.map(e =>
        e.id === id ? { ...e, isFavorite: !e.isFavorite } : e
      )) as never
    utils.exercises.list.setData(undefined, flip)
    toggleFavorite.mutate(
      { exerciseId: id },
      { onError: () => utils.exercises.list.setData(undefined, flip) }
    )
  }

  // Quick mode detection — direct uit de URL, geen effect-flash
  const searchParams = useSearchParams()
  const isQuickMode = searchParams.get('mode') === 'quick'

  const programExercises: LiveExercise[] = (sessionData?.exercises ?? []).map(e => ({
    uid: e.uid,
    exerciseId: e.exerciseId,
    name: e.name,
    category: e.category,
    sets: e.sets,
    reps: e.reps,
    repUnit: e.repUnit,
    restTime: e.restTime,
    videoUrl: e.videoUrl ?? null,
    weights: Array(Math.max(1, e.sets)).fill(''),
  }))

  // Extra exercises added during session
  const [extraExercises, setExtraExercises] = useState<LiveExercise[]>([])
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [addExerciseQuery, setAddExerciseQuery] = useState('')
  const [videoModal, setVideoModal] = useState<{ url: string; name: string } | null>(null)
  const [sessionRpe, setSessionRpe] = useState<number | null>(null)
  const [sessionPain, setSessionPain] = useState<number | null>(null)
  // Quick-workout afrond-popup: feel-score / notities / aanpasbare duur / pijn.
  const [feelScore, setFeelScore] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const [painEnabled, setPainEnabled] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)

  // Tijdens de programma-sessie gelogde waarden (gewicht/sets/reps per uid).
  // Programma-oefeningen worden elke render opnieuw uit de query afgeleid, dus
  // de invoer leeft hier los van die afleiding en wint bij het samenvoegen.
  const [logByUid, setLogByUid] = useState<Record<string, Partial<LiveExercise>>>({})

  const baseExercises = isQuickMode ? [] : programExercises
  const exercises: LiveExercise[] = [...baseExercises, ...extraExercises].map(e =>
    logByUid[e.uid] ? { ...e, ...logByUid[e.uid] } : e
  )

  const [state, setState] = useState<SessionState>('ready')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startTimeRef = useRef<number | null>(null)

  // Start timer when session becomes active. In quick-mode is de bewerkbare
  // lijst zélf de live sessie, dus daar loopt de timer al vanaf binnenkomst.
  useEffect(() => {
    if (state !== 'active' && !isQuickMode) return
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state, isQuickMode])

  const current = exercises[currentIndex]
  const todayDayNum = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  function addExercise(ex: DbExercise) {
    setExtraExercises(prev => [...prev, dbExerciseToLive(ex)])
    setShowAddExercise(false)
    setAddExerciseQuery('')
  }

  // Bewerk een quick-oefening (sets/reps/gewicht). Schaalt het gewicht-array
  // mee als het aantal sets verandert, zodat de grid blijft kloppen.
  function updateExtra(uid: string, patch: Partial<LiveExercise>) {
    setExtraExercises(prev => prev.map(e => {
      if (e.uid !== uid) return e
      const merged = { ...e, ...patch }
      if (patch.sets !== undefined) {
        merged.weights = resizeWeights(merged.weights ?? [], patch.sets)
      }
      return merged
    }))
  }

  // Alleen zelf toegevoegde oefeningen zijn verwijderbaar (vóór de start);
  // programma-oefeningen blijven staan.
  function removeExercise(uid: string) {
    setExtraExercises(prev => prev.filter(e => e.uid !== uid))
  }

  // Log-invoer tijdens de actieve programma-sessie (gewicht/sets/reps). Werkt
  // voor zowel programma- als toegevoegde oefeningen; de override wint.
  function updateLog(uid: string, patch: Partial<LiveExercise>) {
    setLogByUid(prev => ({ ...prev, [uid]: { ...(prev[uid] ?? {}), ...patch } }))
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
    // Duur: in quick-mode de (aanpasbare) ingevulde minuten, anders de live tijd.
    const durationSeconds = isQuickMode
      ? Math.max(1, Math.round(Number(durationInput) || Math.max(1, Math.round(elapsed / 60)))) * 60
      : Math.max(elapsed, 1)
    const painLevel = isQuickMode ? (painEnabled ? (sessionPain ?? 0) : 0) : sessionPain
    try {
      await logSession.mutateAsync({
        programId: isQuickMode ? undefined : sessionData?.program?.id,
        scheduledAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds,
        painLevel,
        exertionLevel: sessionRpe,
        feelScore,
        notes: notes.trim() || undefined,
        completedAll: completed.size >= exercises.length,
        exercises: exercises.map(e => {
          // Gewicht per set → getallen; lege velden blijven null.
          const ws = (e.weights ?? [])
            .map(w => (w === '' ? null : Number(w)))
            .filter(n => n === null || !Number.isNaN(n)) as Array<number | null>
          const lastFilled = ws.length ? ([...ws].reverse().find(n => n !== null) ?? null) : null
          return {
            exerciseId: e.exerciseId,
            setsCompleted: e.sets,
            repsCompleted: e.reps,
            repUnit: e.repUnit,
            weight: lastFilled,
            weightsPerSet: ws.length ? ws : undefined,
            painLevel,
          }
        }),
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
        <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4 mbt-stagger">
          <Link
            href="/athlete/dashboard"
            className="athletic-tap inline-flex"
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

          {/* Workout-samenvatting: oefeningen · sets · richttijd */}
          {exercises.length > 0 && (
            <div
              className="rounded-xl flex items-center px-4 py-3"
              style={{
                background: P.surface,
                borderLeft: `3px solid ${P.brand}`,
                border: `1px solid ${P.line}`,
              }}
            >
              <span
                className="athletic-mono"
                style={{ color: P.ink, fontSize: 12, fontWeight: 900, letterSpacing: '0.12em' }}
              >
                {exercises.length} OEFENING{exercises.length > 1 ? 'EN' : ''}
                <span style={{ color: P.inkDim }}> · </span>
                {exercises.reduce((a, e) => a + e.sets, 0)} SETS
                <span style={{ color: P.inkDim }}> · </span>
                <span style={{ color: P.brand }}>
                  ±{Math.max(5, Math.round(exercises.reduce((a, e) => a + e.sets * (e.restTime + 45), 0) / 60 / 5) * 5)} MIN
                </span>
              </span>
            </div>
          )}

          {/* Exercise list */}
          {exercises.length === 0 && isQuickMode ? (
            <button
              type="button"
              onClick={() => setShowAddExercise(true)}
              className="athletic-tap w-full flex flex-col items-center justify-center py-12 rounded-2xl text-center gap-3"
              style={{
                background: 'rgba(232,122,85,0.06)',
                border: `2px dashed ${P.brand}`,
              }}
            >
              <span
                className="flex items-center justify-center rounded-full"
                style={{ width: 64, height: 64, background: 'rgba(232,122,85,0.14)', color: P.brand }}
              >
                <IconStrength size={32} />
              </span>
              <span
                style={{
                  color: P.brand,
                  fontWeight: 900,
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                TIK OM OEFENINGEN TE KIEZEN
              </span>
              <span
                style={{
                  color: P.inkMuted,
                  fontSize: 12,
                  lineHeight: 1.5,
                  maxWidth: 240,
                }}
              >
                Kies uit favorieten, meest gebruikt of de hele bibliotheek — en start direct.
              </span>
            </button>
          ) : isQuickMode ? (
            <div className="space-y-2 mbt-stagger">
              {exercises.map((e, i) => (
                <QuickEditRow
                  key={e.uid}
                  index={i}
                  ex={e}
                  onUpdate={updateExtra}
                  onRemove={removeExercise}
                  onVideo={() => e.videoUrl && setVideoModal({ url: e.videoUrl, name: e.name })}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2 mbt-stagger">
              {exercises.map((e, i) => {
                const clickable = !!e.videoUrl
                const removable = extraExercises.some(x => x.uid === e.uid)
                const Inner = clickable ? 'button' : 'div'
                return (
                  <div
                    key={e.uid}
                    className={`flex items-center gap-0 rounded-xl w-full overflow-hidden ${clickable ? 'mbt-card-hover' : ''}`}
                    style={{
                      background: P.surface,
                      borderLeft: `3px solid ${P.brand}`,
                      border: `1px solid ${P.line}`,
                    }}
                  >
                    <Inner
                      type={clickable ? 'button' : undefined}
                      onClick={
                        clickable
                          ? () => setVideoModal({ url: e.videoUrl!, name: e.name })
                          : undefined
                      }
                      className={`flex items-center gap-3 flex-1 min-w-0 text-left ${clickable ? 'athletic-tap' : ''}`}
                      style={{ padding: '12px 14px' }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: P.surfaceHi,
                          border: `1px solid ${P.line}`,
                          color: P.brand,
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
                          {CATEGORY_LABELS_NL[e.category] ?? e.category} · {e.sets} × {e.reps} {e.repUnit}
                        </div>
                      </div>
                      {clickable && (
                        <span
                          aria-hidden
                          className="inline-flex items-center justify-center rounded-full shrink-0"
                          style={{
                            width: 28,
                            height: 28,
                            background: 'rgba(232,122,85,0.15)',
                            color: P.brand,
                          }}
                        >
                          <Play className="w-3.5 h-3.5" style={{ marginLeft: 1 }} fill="currentColor" />
                        </span>
                      )}
                    </Inner>
                    {removable && (
                      <button
                        type="button"
                        onClick={() => removeExercise(e.uid)}
                        className="athletic-tap self-stretch px-3 transition-colors"
                        style={{ color: P.inkDim }}
                        aria-label={`Verwijder ${e.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add exercise button — niet tonen naast de grote lege-staat-CTA */}
          {!(exercises.length === 0 && isQuickMode) && (
            <button
              type="button"
              onClick={() => setShowAddExercise(true)}
              className="athletic-tap mbt-btn-hover w-full flex items-center justify-center gap-2 rounded-xl"
              style={{
                padding: '14px 16px',
                border: `2px dashed ${P.brand}`,
                color: P.brand,
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
          )}

          {/* Actieknop. Quick = direct afronden (de lijst is al de live sessie);
              programma = focus-modus starten. Pas tonen als er iets is. */}
          {exercises.length > 0 && (
            isQuickMode ? (
              <DarkButton
                variant="primary"
                size="lg"
                onClick={() => {
                  setDurationInput(String(Math.max(1, Math.round(elapsed / 60))))
                  setPainEnabled(sessionPain != null)
                  setFinishOpen(true)
                }}
                className="w-full"
              >
                WORKOUT AFRONDEN
              </DarkButton>
            ) : (
              <DarkButton
                variant="primary"
                size="lg"
                onClick={() => setState('active')}
                className="w-full"
              >
                ▶ START SESSIE
              </DarkButton>
            )
          )}
        </div>

        {/* Quick-workout afrond-popup met feel-score, RPE, pijn, duur, notities */}
        {finishOpen && isQuickMode && (
          <QuickFinishModal
            durationMin={Math.max(1, Math.round(elapsed / 60))}
            durationInput={durationInput}
            onDurationChange={setDurationInput}
            exertionLevel={sessionRpe}
            onExertionChange={setSessionRpe}
            feelScore={feelScore}
            onFeelChange={setFeelScore}
            painEnabled={painEnabled}
            onTogglePain={() => setPainEnabled(v => !v)}
            painLevel={sessionPain}
            onPainChange={setSessionPain}
            notes={notes}
            onNotesChange={setNotes}
            error={error}
            loading={logSession.isPending}
            onCancel={() => setFinishOpen(false)}
            onSubmit={handleFinish}
          />
        )}

        {/* Add exercise bottom sheet */}
        {showAddExercise && (
          <AddExerciseSheet
            query={addExerciseQuery}
            onQueryChange={setAddExerciseQuery}
            filtered={filteredLibrary}
            favorites={favorites}
            mostUsed={mostUsed}
            added={extraExercises}
            onAdd={addExercise}
            onToggleFavorite={toggleFav}
            onClose={() => { setShowAddExercise(false); setAddExerciseQuery('') }}
          />
        )}

        {videoModal && (
          <VideoModal
            url={videoModal.url}
            name={videoModal.name}
            onClose={() => setVideoModal(null)}
          />
        )}
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg w-full mx-auto px-4 space-y-4 text-center mbt-stagger">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{
              background: 'rgba(232,122,85,0.12)',
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

          {/* RPE — verplicht voor workload */}
          <div className="text-left">
            <div className="flex items-baseline justify-between mb-2">
              <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>
                Hoe zwaar voelde de sessie?
              </p>
              <span
                className="athletic-mono"
                style={{
                  color: sessionRpe !== null ? P.brand : P.inkMuted,
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {sessionRpe !== null ? `${sessionRpe}/10` : '—'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSessionRpe(sessionRpe === n ? null : n)}
                  className="athletic-tap flex-1 rounded-lg athletic-mono transition-all"
                  style={{
                    height: 44,
                    background: sessionRpe === n ? P.brand : P.surfaceHi,
                    color: sessionRpe === n ? P.bg : P.inkMuted,
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p style={{ color: P.inkMuted, fontSize: 10, marginTop: 6 }}>
              1 = heel licht · 10 = maximaal
            </p>
          </div>

          {/* Pijn-score (0-10) — optioneel */}
          <div className="text-left">
            <div className="flex items-baseline justify-between mb-2">
              <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>
                Pijn tijdens de sessie
              </p>
              <span
                className="athletic-mono"
                style={{
                  color: sessionPain !== null ? P.danger : P.inkMuted,
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {sessionPain !== null ? `${sessionPain}/10` : 'Geen'}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }, (_, i) => i).map(n => {
                // Heatmap: groen → goud → rood. 0-2 groen, 3-5 goud, 6-10 rood.
                const baseColor = n < 3 ? P.lime : n < 6 ? P.gold : P.danger
                const selected = sessionPain === n
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSessionPain(selected ? null : n)}
                    className="athletic-tap flex-1 rounded-lg athletic-mono transition-all"
                    style={{
                      height: 36,
                      background: selected ? baseColor : `${baseColor}1F`,
                      color: selected ? P.bg : baseColor,
                      border: selected
                        ? `2px solid ${baseColor}`
                        : `1px solid ${baseColor}33`,
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>

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
                color: P.brand,
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

        {/* Voortgangsbalk: afgeronde oefeningen */}
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: P.surfaceHi }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={exercises.length}
          aria-valuenow={completed.size}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: P.lime,
              width: `${exercises.length > 0 ? Math.round((completed.size / exercises.length) * 100) : 0}%`,
              transition: 'width 360ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        {/* Hero: current exercise — klikbaar als er een video is */}
        <Tile
          accentBar={P.brand}
          style={{ padding: 20 }}
          onClick={
            current?.videoUrl
              ? () => setVideoModal({ url: current.videoUrl!, name: current.name })
              : undefined
          }
        >
          <div className="flex items-center justify-between">
            <Kicker>VANDAAG · ACTIEF</Kicker>
            {current?.videoUrl && (
              <span
                aria-hidden
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: 28,
                  height: 28,
                  background: P.brand,
                  color: P.bg,
                }}
              >
                <Play className="w-3.5 h-3.5" style={{ marginLeft: 1 }} fill="currentColor" />
              </span>
            )}
          </div>
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
              {current?.videoUrl ? ' · TAP VOOR VIDEO' : ''}
            </MetaLabel>
          </div>
        </Tile>

        {/* Rest info */}
        <Tile>
          <div className="text-center">
            <MetaLabel>RUST · {current?.restTime ?? 60}S TUSSEN SETS</MetaLabel>
          </div>
        </Tile>

        {/* Loggen: gewicht/sets/reps voor de huidige oefening */}
        {current && (
          <Tile style={{ padding: 16 }}>
            <Kicker>LOGGEN</Kicker>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <QuickField
                label="Sets"
                value={current.sets ? String(current.sets) : ''}
                onChange={(v) => {
                  const n = Math.max(1, Number(v) || 1)
                  updateLog(current.uid, { sets: n, weights: resizeWeights(current.weights ?? [], n) })
                }}
              />
              <QuickField
                label="Reps"
                value={current.reps ? String(current.reps) : ''}
                onChange={(v) => updateLog(current.uid, { reps: Math.max(0, Number(v) || 0) })}
              />
            </div>
            <div className="mt-3">
              <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
                GEWICHT (KG) · PER SET
              </span>
              <div
                className="grid gap-1.5 mt-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(1, current.sets || 1), 6)}, minmax(0, 1fr))` }}
              >
                {(current.weights ?? []).map((w, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.1em' }}>
                      S{i + 1}
                    </span>
                    <DarkInput
                      value={w}
                      onChange={(e) => {
                        const next = [...(current.weights ?? [])]
                        next[i] = e.target.value
                        updateLog(current.uid, { weights: next })
                      }}
                      inputMode="decimal"
                      style={{ padding: '6px 8px', fontSize: 13 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Tile>
        )}

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
          className="athletic-tap mbt-btn-hover w-full flex items-center justify-center gap-2 rounded-xl"
          style={{
            padding: '12px 16px',
            border: `1px dashed ${P.brand}`,
            color: P.brand,
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
          favorites={favorites}
          mostUsed={mostUsed}
          added={extraExercises}
          onAdd={addExercise}
          onToggleFavorite={toggleFav}
          onClose={() => { setShowAddExercise(false); setAddExerciseQuery('') }}
        />
      )}

      {videoModal && (
        <VideoModal
          url={videoModal.url}
          name={videoModal.name}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  )
}

// ─── Video modal — fullscreen overlay met player ─────────────────────────────

function VideoModal({
  url,
  name,
  onClose,
}: {
  url: string
  name: string
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Lock body scroll while open
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${P.line}` }}
        >
          <span
            className="truncate"
            style={{
              color: P.ink,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {name}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="athletic-tap p-1 rounded-lg shrink-0"
            style={{ color: P.inkMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="aspect-video bg-black">
          <ReactPlayer
            src={url}
            width="100%"
            height="100%"
            controls
            playing
            playsinline
          />
        </div>
      </div>
    </div>
  )
}

// ─── Add-exercise bottom sheet (favorieten · meest gebruikt · alle) ──────────

// Eén rij in de picker — klikbaar om toe te voegen, met een los hart-knopje
// rechts om te favorieten. `badge` vervangt de standaard "3 × 10 REPS"-regel
// (gebruikt voor de "× gebruikt"-teller in de meest-gebruikt sectie).
function ExerciseRow({
  ex,
  added,
  onAdd,
  onToggleFavorite,
  badge,
}: {
  ex: DbExercise
  added: LiveExercise[]
  onAdd: (ex: DbExercise) => void
  onToggleFavorite: (id: string) => void
  badge?: string
}) {
  const alreadyAdded = added.some(ae => ae.exerciseId === ex.id)
  const isFav = ex.isFavorite === true
  return (
    <div
      className="mbt-card-hover w-full flex items-center gap-2 rounded-xl"
      style={{
        background: alreadyAdded ? 'rgba(232,122,85,0.10)' : P.surfaceLow,
        border: `1px solid ${alreadyAdded ? P.lime : P.line}`,
        padding: '8px 10px 8px 14px',
      }}
    >
      <button
        type="button"
        className="flex items-center gap-3 flex-1 min-w-0 text-left transition-all active:scale-[0.98]"
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
            style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em' }}
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
            {ex.category} · {badge ?? '3 × 10 REPS'}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onToggleFavorite(ex.id)}
        className="shrink-0 p-2 rounded-lg transition-all active:scale-90"
        aria-label={isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
      >
        <Heart
          className="w-4 h-4"
          style={{ color: isFav ? '#f87171' : P.inkMuted, fill: isFav ? '#f87171' : 'transparent' }}
        />
      </button>
      {!alreadyAdded && <Plus className="w-4 h-4 shrink-0" style={{ color: P.inkMuted }} />}
    </div>
  )
}

// ─── Reusable add-exercise bottom sheet ──────────────────────────────────────

function AddExerciseSheet({
  query,
  onQueryChange,
  filtered,
  favorites,
  mostUsed,
  added,
  onAdd,
  onToggleFavorite,
  onClose,
}: {
  query: string
  onQueryChange: (q: string) => void
  filtered: DbExercise[]
  favorites: DbExercise[]
  mostUsed: UsedExercise[]
  added: LiveExercise[]
  onAdd: (ex: DbExercise) => void
  onToggleFavorite: (id: string) => void
  onClose: () => void
}) {
  const searching = query.trim().length > 0

  // Escape sluit de sheet; scroll-lock zolang die open is (zelfde gedrag als
  // de VideoModal).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="mbt-backdrop absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="mbt-sheet relative w-full rounded-t-3xl flex flex-col"
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          maxWidth: 480,
          margin: '0 auto',
          // dvh i.p.v. vh: rekent de iOS Safari-toolbar mee, anders steekt de
          // sheet onder de zichtbare viewport uit.
          maxHeight: '80dvh',
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
                // ≥16px: voorkomt dat iOS Safari inzoomt bij focus (waardoor
                // de hele sheet buiten beeld schoof). Geen autoFocus om
                // dezelfde reden — het toetsenbord klapte direct open.
                fontSize: 16,
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),32px)] space-y-5">
          {searching ? (
            // Zoekmodus: platte gefilterde lijst (oud gedrag).
            filtered.length === 0 ? (
              <div className="text-center py-6">
                <MetaLabel>GEEN OEFENINGEN GEVONDEN</MetaLabel>
              </div>
            ) : (
              <div className="space-y-2 mbt-stagger">
                {filtered.map(ex => (
                  <ExerciseRow
                    key={ex.id}
                    ex={ex}
                    added={added}
                    onAdd={onAdd}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            )
          ) : (
            // Bladermodus: snelkoppelingen bovenaan, dan de hele bibliotheek.
            <>
              {favorites.length > 0 && (
                <div className="space-y-2 mbt-stagger">
                  <MetaLabel>★ FAVORIETEN</MetaLabel>
                  {favorites.map(ex => (
                    <ExerciseRow
                      key={`fav-${ex.id}`}
                      ex={ex}
                      added={added}
                      onAdd={onAdd}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </div>
              )}

              {mostUsed.length > 0 && (
                <div className="space-y-2 mbt-stagger">
                  <MetaLabel>↻ MEEST GEBRUIKT</MetaLabel>
                  {mostUsed.map(ex => (
                    <ExerciseRow
                      key={`mu-${ex.id}`}
                      ex={ex}
                      added={added}
                      onAdd={onAdd}
                      onToggleFavorite={onToggleFavorite}
                      badge={`${ex.count}× GEBRUIKT`}
                    />
                  ))}
                </div>
              )}

              <div className="space-y-2 mbt-stagger">
                {(favorites.length > 0 || mostUsed.length > 0) && (
                  <MetaLabel>ALLE OEFENINGEN</MetaLabel>
                )}
                {filtered.length === 0 ? (
                  <div className="text-center py-6">
                    <MetaLabel>GEEN OEFENINGEN GEVONDEN</MetaLabel>
                  </div>
                ) : (
                  filtered.map(ex => (
                    <ExerciseRow
                      key={ex.id}
                      ex={ex}
                      added={added}
                      onAdd={onAdd}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quick-workout: bewerkbare oefening-rij (sets/reps/gewicht) ───────────────

function QuickField({
  label,
  value,
  onChange,
  inputMode = 'numeric',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'numeric' | 'decimal'
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
        {label.toUpperCase()}
      </span>
      <DarkInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        style={{ padding: '8px 10px', fontSize: 15 }}
      />
    </label>
  )
}

function QuickEditRow({
  index,
  ex,
  onUpdate,
  onRemove,
  onVideo,
}: {
  index: number
  ex: LiveExercise
  onUpdate: (uid: string, patch: Partial<LiveExercise>) => void
  onRemove: (uid: string) => void
  onVideo: () => void
}) {
  const setsCount = Math.max(1, ex.sets || 1)
  const weights = ex.weights && ex.weights.length === setsCount
    ? ex.weights
    : resizeWeights(ex.weights ?? [], setsCount)

  return (
    <div
      className="rounded-xl"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${P.brand}`,
        padding: '12px 14px',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: P.surfaceHi, border: `1px solid ${P.line}`, color: P.brand, fontFamily: mono, fontSize: 13, fontWeight: 900 }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ color: P.ink, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>
            {ex.name}
          </p>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700, color: P.inkMuted, marginTop: 2, textTransform: 'uppercase' }}>
            {CATEGORY_LABELS_NL[ex.category] ?? ex.category}
          </div>
        </div>
        {ex.videoUrl && (
          <button
            type="button"
            onClick={onVideo}
            aria-label={`Video ${ex.name}`}
            className="athletic-tap inline-flex items-center justify-center rounded-full shrink-0"
            style={{ width: 28, height: 28, background: 'rgba(232,122,85,0.15)', color: P.brand }}
          >
            <Play className="w-3.5 h-3.5" style={{ marginLeft: 1 }} fill="currentColor" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(ex.uid)}
          aria-label={`Verwijder ${ex.name}`}
          className="athletic-tap shrink-0"
          style={{ color: P.inkDim, padding: 4 }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <QuickField
          label="Sets"
          value={ex.sets ? String(ex.sets) : ''}
          onChange={(v) => onUpdate(ex.uid, { sets: Math.max(1, Number(v) || 1) })}
        />
        <QuickField
          label="Reps"
          value={ex.reps ? String(ex.reps) : ''}
          onChange={(v) => onUpdate(ex.uid, { reps: Math.max(0, Number(v) || 0) })}
        />
      </div>

      <div className="mt-3">
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
          GEWICHT (KG) · PER SET
        </span>
        <div
          className="grid gap-1.5 mt-1.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(setsCount, 6)}, minmax(0, 1fr))` }}
        >
          {weights.map((w, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.1em' }}>
                S{i + 1}
              </span>
              <DarkInput
                value={w}
                onChange={(e) => {
                  const next = [...weights]
                  next[i] = e.target.value
                  onUpdate(ex.uid, { weights: next })
                }}
                inputMode="decimal"
                style={{ padding: '6px 8px', fontSize: 13 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Feel-score (1-5 smiley) — zelfde set als het therapeut-scherm ───────────

const FEEL_OPTIONS: Array<{ value: number; Icon: typeof IconMoodNeutral; label: string; color: string }> = [
  { value: 1, Icon: IconMoodVeryLow, label: 'Slecht', color: P.danger },
  { value: 2, Icon: IconMoodLow, label: 'Matig', color: P.danger },
  { value: 3, Icon: IconMoodNeutral, label: 'Oké', color: P.gold },
  { value: 4, Icon: IconMoodGood, label: 'Goed', color: P.lime },
  { value: 5, Icon: IconMoodGreat, label: 'Top', color: P.lime },
]

function FeelPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 mt-2">
      {FEEL_OPTIONS.map(({ value: v, Icon, label, color }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={label}
            aria-pressed={active}
            className="athletic-tap flex flex-col items-center justify-center gap-1 rounded-lg py-2"
            style={{
              background: active ? color : P.surfaceHi,
              color: active ? P.bg : P.inkMuted,
              border: `1px solid ${active ? color : P.lineStrong}`,
            }}
          >
            <Icon size={22} />
            <span className="athletic-mono" style={{ fontSize: 9, letterSpacing: '0.08em', fontWeight: 800 }}>
              {label.toUpperCase()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ScalePicker({
  value,
  onChange,
  min = 0,
  max = 10,
  colorHigh,
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  colorHigh: string
}) {
  return (
    <div className="flex gap-1 mt-2">
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => {
        const active = value === n
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : n)}
            className="athletic-tap flex-1 rounded-lg athletic-mono transition-all"
            style={{
              height: 40,
              background: active ? colorHigh : P.surfaceHi,
              color: active ? P.bg : P.inkMuted,
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

// ─── Quick-workout afrond-popup (RPE / gevoel / pijn / duur / notities) ───────

function QuickFinishModal({
  durationMin,
  durationInput,
  onDurationChange,
  exertionLevel,
  onExertionChange,
  feelScore,
  onFeelChange,
  painEnabled,
  onTogglePain,
  painLevel,
  onPainChange,
  notes,
  onNotesChange,
  error,
  loading,
  onCancel,
  onSubmit,
}: {
  durationMin: number
  durationInput: string
  onDurationChange: (v: string) => void
  exertionLevel: number | null
  onExertionChange: (v: number | null) => void
  feelScore: number | null
  onFeelChange: (v: number) => void
  painEnabled: boolean
  onTogglePain: () => void
  painLevel: number | null
  onPainChange: (v: number | null) => void
  notes: string
  onNotesChange: (v: string) => void
  error: string | null
  loading: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Workout afronden"
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col max-h-[92vh]"
        style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${P.line}` }}>
          <div className="flex flex-col gap-0.5">
            <Kicker>Afronden</Kicker>
            <span className="athletic-display" style={{ fontSize: 20, letterSpacing: '-0.02em', color: P.ink }}>
              WORKOUT AFRONDEN
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Sluiten"
            className="athletic-tap athletic-mono"
            style={{ color: P.inkMuted, fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 overflow-y-auto">
          <section>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'rgba(244,194,97,0.12)', color: P.gold }}
              >
                <IconLightning size={14} />
              </span>
              <MetaLabel style={{ color: P.gold }}>Hoe zwaar voelde de sessie? /10</MetaLabel>
            </div>
            <ScalePicker value={exertionLevel} onChange={onExertionChange} min={1} max={10} colorHigh={P.gold} />
          </section>

          <section>
            <MetaLabel style={{ color: P.lime }}>Hoe voelde het?</MetaLabel>
            <FeelPicker value={feelScore} onChange={onFeelChange} />
          </section>

          <section>
            {painEnabled ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(248,113,113,0.12)', color: P.danger }}
                    >
                      <IconHeart size={14} />
                    </span>
                    <MetaLabel style={{ color: P.danger }}>Pijn /10</MetaLabel>
                  </div>
                  <button
                    type="button"
                    onClick={onTogglePain}
                    className="athletic-mono athletic-tap"
                    style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}
                  >
                    GEEN PIJN
                  </button>
                </div>
                <ScalePicker value={painLevel} onChange={onPainChange} min={0} max={10} colorHigh={P.danger} />
              </>
            ) : (
              <button
                type="button"
                onClick={onTogglePain}
                className="athletic-mono athletic-tap w-full rounded-lg py-2.5 flex items-center justify-center gap-2"
                style={{ background: P.surfaceHi, color: P.danger, border: `1px dashed ${P.danger}`, fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}
              >
                <IconHeart size={13} /> + PIJN TOEVOEGEN
              </button>
            )}
          </section>

          <section>
            <MetaLabel>Duur (minuten)</MetaLabel>
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.04em' }}>
              Voorgesteld op basis van de tijd ({durationMin}m) — pas aan indien nodig
            </p>
            <DarkInput
              value={durationInput}
              onChange={(e) => onDurationChange(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              style={{ padding: '10px 12px', fontSize: 16, marginTop: 6, maxWidth: 140 }}
            />
          </section>

          <section>
            <MetaLabel>Notities</MetaLabel>
            <DarkTextarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Hoe ging het, bijzonderheden…"
              rows={3}
              style={{ marginTop: 6 }}
            />
          </section>

          {error && <p style={{ color: P.danger, fontSize: 13 }}>{error}</p>}
        </div>

        <div className="px-5 py-4 flex items-center gap-3" style={{ borderTop: `1px solid ${P.line}` }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="athletic-mono athletic-tap rounded-lg px-4 py-3"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em', fontWeight: 800 }}
          >
            ANNULEREN
          </button>
          <div className="flex-1">
            <DarkButton size="lg" onClick={onSubmit} disabled={loading} loading={loading}>
              {loading ? 'OPSLAAN…' : 'OPSLAAN & AFSLUITEN'}
            </DarkButton>
          </div>
        </div>
      </div>
    </div>
  )
}
