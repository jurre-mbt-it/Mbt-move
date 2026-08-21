'use client'

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { trpc } from '@/lib/trpc/client'
import {
  Search, X, Plus, Play, Heart, RotateCcw, TrendingUp,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { P, CARD, Kicker, MetaLabel, Tile, DarkButton, DarkInput, DarkTextarea } from '@/components/dark-ui'
import { useDraftBackup, loadDraft, clearStoredDraft } from '@/hooks/useAutosave'
import {
  type SetEntry,
  type LastLog,
  type SessionParam,
  parseKg,
  parseReps,
  fmtKg,
  makeSetEntries,
  prevKgFor,
  prevRepsFor,
  prevSummaryFor,
  seedParams,
  filledParams,
} from '@/lib/session-sets'
import {
  toPrescription,
  formatPrescription,
  computeTargetKg,
  formatTargetKg,
  formatPrescribedParam,
  formatSetsReps,
  type PrescribedParam,
} from '@/lib/prescription'
import { toast } from 'sonner'
import { RestSheet } from '@/components/session/RestSheet'
import { WeekPhaseLine } from '@/components/schedule/WeekPhaseLine'
import { SetRows } from '@/components/session/SetRows'
import { ExtraParamsEditor, RepUnitPicker } from '@/components/session/ExtraParams'
import { isRepBasedUnit, sideVolumeFactor } from '@/lib/program-constants'
import { ExerciseProgressSheet } from '@/components/session/ExerciseProgressSheet'
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

// Categorie-opties voor het snel aanmaken van een oefening vanuit de sessie —
// zelfde enum-waarden als ExerciseInput.category (server).
const CREATE_CATEGORIES = ['STRENGTH', 'CARDIO', 'MOBILITY', 'PLYOMETRICS', 'STABILITY'] as const

const CATEGORY_LABELS_NL: Record<string, string> = {
  STRENGTH: 'KRACHT',
  MOBILITY: 'MOBILITEIT',
  PLYOMETRICS: 'PLYOMETRIE',
  CARDIO: 'CARDIO',
  STABILITY: 'STABILITEIT',
}

const mono =
  'var(--font-mono-athletic)'

type SessionState = 'ready' | 'active' | 'done'

type LiveExercise = {
  uid: string
  exerciseId: string
  name: string
  category: string
  sets: number
  setsMax?: number | null
  reps: number
  repsMax?: number | null
  repUnit: string
  restTime: number
  videoUrl: string | null
  /** Standaard extra parameters uit de oefening-library (ExtraParam[] JSON). */
  defaultExtraParams?: unknown
  /** Per-instance notitie + intensiteits-voorschrift uit het programma. */
  notes?: string | null
  intensityType?: string
  intensityMin?: number | null
  intensityMax?: number | null
  intensityText?: string | null
  /** Read-only voorschrift-parameters (Tempo, Gewicht, Band kleur, …) uit het
   *  programma — getoond als doel-chips. */
  programExtraParams?: PrescribedParam[]
}

function dbExerciseToLive(ex: DbExercise): LiveExercise {
  return {
    uid: `q-${ex.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    exerciseId: ex.id,
    name: ex.name,
    category: ex.category,
    sets: 3,
    reps: 10,
    // Library-eenheid van de oefening (bv. 'sec' voor plank) als startpunt.
    repUnit: typeof ex.defaultRepUnit === 'string' ? ex.defaultRepUnit : 'reps',
    restTime: 60,
    videoUrl: (ex.videoUrl as string | null | undefined) ?? null,
    defaultExtraParams: ex.defaultExtraParams,
    notes: null,
    intensityType: 'NONE',
  }
}

// ─── Set-flow: per-set loggen tijdens de actieve programma-sessie ─────────────
// Types en parse-helpers zijn gedeeld met het patiënt-scherm: src/lib/session-sets.ts

function seedSets(e: LiveExercise): SetEntry[] {
  return makeSetEntries(e.sets, e.reps)
}

/** Concept in localStorage zodat een refresh/app-wissel de sessie niet wist. */
type AthleteSessionDraft = {
  state: SessionState
  currentIndex: number
  completed: string[]
  setLog: Record<string, SetEntry[]>
  paramsByUid?: Record<string, SessionParam[]>
  extraExercises: LiveExercise[]
  startedAt: number | null
  sessionRpe: number | null
  sessionPain: number | null
  feelScore: number | null
  notes: string
}

const DRAFT_PREFIX = 'mbt-athlete-session-'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ruim concepten van eerdere dagen op — die zijn niet meer te hervatten. */
function pruneOldDrafts() {
  if (typeof window === 'undefined') return
  try {
    const today = todayKey()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(DRAFT_PREFIX) && !key.endsWith(today)) {
        localStorage.removeItem(key)
      }
    }
  } catch {}
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
  // Quick mode + gepland item — direct uit de URL, geen effect-flash.
  const searchParams = useSearchParams()
  const isQuickMode = searchParams.get('mode') === 'quick'
  // ?itemId=… → voer exact die geplande workout uit. Zonder dit pakt de server
  // het oudste actieve programma, ongeacht waar je op tikte.
  const plannedItemId = searchParams.get('itemId')
  const { data: sessionData, isLoading } = trpc.patient.getTodayExercises.useQuery(
    plannedItemId ? { itemId: plannedItemId } : undefined,
  )
  // Personal-best 1RM per oefening — voor het omrekenen van %1RM-voorschriften.
  const { data: prevOneRm = {} } = trpc.patient.getPersonalBests.useQuery(undefined, { staleTime: 60_000 })
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
    defaultExtraParams: e.defaultExtraParams,
    notes: e.notes ?? null,
    intensityType: e.intensityType ?? 'NONE',
    intensityMin: e.intensityMin ?? null,
    intensityMax: e.intensityMax ?? null,
    intensityText: e.intensityText ?? null,
    programExtraParams: (e as { programExtraParams?: PrescribedParam[] }).programExtraParams ?? [],
  }))

  // Extra exercises added during session
  const [extraExercises, setExtraExercises] = useState<LiveExercise[]>([])
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [addExerciseQuery, setAddExerciseQuery] = useState('')
  const [videoModal, setVideoModal] = useState<{ url: string; name: string } | null>(null)
  // Voortgang-grafiekje per oefening (bottom-sheet).
  const [progressFor, setProgressFor] = useState<{ id: string; name: string } | null>(null)
  const [sessionRpe, setSessionRpe] = useState<number | null>(null)
  const [sessionPain, setSessionPain] = useState<number | null>(null)
  // Quick-workout afrond-popup: feel-score / notities / aanpasbare duur / pijn.
  const [feelScore, setFeelScore] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [durationInput, setDurationInput] = useState('')
  const [painEnabled, setPainEnabled] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)

  // Tijdens de programma-sessie gelogde sets (kg/reps/afgevinkt per set, per
  // uid). Programma-oefeningen worden elke render opnieuw uit de query
  // afgeleid, dus de invoer leeft hier los van die afleiding.
  const [setLog, setSetLog] = useState<Record<string, SetEntry[]>>({})
  // Extra parameters per oefening (Tempo, RPE, Band kleur, …).
  const [paramsByUid, setParamsByUid] = useState<Record<string, SessionParam[]>>({})

  const baseExercises = isQuickMode ? [] : programExercises
  const exercises: LiveExercise[] = [...baseExercises, ...extraExercises]

  // Vorige-sessie-waarden per exerciseId — ghost/prefill in de set-rijen.
  // Voor zelf toegevoegde oefeningen (quick workout) halen we ze apart op.
  const extraIds = [...new Set(extraExercises.map(e => e.exerciseId))]
  const extraLastQuery = trpc.patient.lastExerciseLogs.useQuery(
    { exerciseIds: extraIds },
    { enabled: extraIds.length > 0, staleTime: 60_000 },
  )
  const lastLogs: Record<string, LastLog> = {
    ...((extraLastQuery.data as Record<string, LastLog> | undefined) ?? {}),
    ...((sessionData?.lastLogs as Record<string, LastLog> | undefined) ?? {}),
  }

  const [state, setState] = useState<SessionState>('ready')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startTimeRef = useRef<number | null>(null)
  // State-spiegel van de starttijd: refs mogen niet tijdens render gelezen
  // worden (react-hooks/refs), maar het concept-backup heeft de waarde nodig.
  const [startedAt, setStartedAt] = useState<number | null>(null)

  // Rusttimer tussen sets — countdown in een bottom-sheet.
  const [restLeft, setRestLeft] = useState(0)
  const [restTotal, setRestTotal] = useState(0)
  const [restLabel, setRestLabel] = useState('')
  const [showRest, setShowRest] = useState(false)
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!showRest) return
    restTimerRef.current = setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current!)
          setShowRest(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(restTimerRef.current!)
  }, [showRest])

  function startRest(seconds: number) {
    clearInterval(restTimerRef.current!)
    setRestTotal(seconds)
    setRestLeft(seconds)
    setShowRest(true)
  }

  function skipRest() {
    clearInterval(restTimerRef.current!)
    setShowRest(false)
  }

  function extendRest(seconds: number) {
    setRestTotal(t => t + seconds)
    setRestLeft(s => s + seconds)
  }

  // Start timer when session becomes active. In quick-mode is de bewerkbare
  // lijst zélf de live sessie, dus daar loopt de timer al vanaf binnenkomst.
  useEffect(() => {
    if (state === 'ready' && !isQuickMode) return
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
      setStartedAt(startTimeRef.current)
    }
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state, isQuickMode])

  // ── Concept-backup: refresh of app-wissel mag de sessie niet wissen ────────
  const draftKey = useMemo(() => {
    // Scope per gepland item wanneer we er één draaien: twee workouts op één
    // dag delen anders dezelfde concept-sleutel en herstellen in elkaars sessie.
    const scope = plannedItemId
      ? `item-${plannedItemId}`
      : isQuickMode ? 'quick' : (sessionData?.program?.id ?? 'program')
    return `${DRAFT_PREFIX}${scope}-${todayKey()}`
  }, [isQuickMode, plannedItemId, sessionData?.program?.id])

  const [resumeChecked, setResumeChecked] = useState(false)
  const [showResumeBanner, setShowResumeBanner] = useState(false)

  useEffect(() => { pruneOldDrafts() }, [])

  // Detecteer een bestaand concept zodra de sessie-data er is.
  useEffect(() => {
    if (resumeChecked) return
    if (!isQuickMode && isLoading) return
    const draft = loadDraft<AthleteSessionDraft>(draftKey)
    const hasContent =
      !!draft &&
      (draft.completed.length > 0 ||
        Object.values(draft.setLog ?? {}).some(sets => sets.some(s => s.done || s.kg !== '')) ||
        draft.extraExercises.length > 0)
    if (hasContent) {
      // Bewust synchroon in de effect-body: localStorage is een extern systeem
      // en dit draait één keer, direct na de eerste data-load.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowResumeBanner(true)
    }
    setResumeChecked(true)
  }, [draftKey, resumeChecked, isLoading, isQuickMode])

  function handleResume() {
    const draft = loadDraft<AthleteSessionDraft>(draftKey)
    if (draft) {
      setSetLog(draft.setLog ?? {})
      setParamsByUid(draft.paramsByUid ?? {})
      setCompleted(new Set(draft.completed ?? []))
      setExtraExercises(draft.extraExercises ?? [])
      setCurrentIndex(draft.currentIndex ?? 0)
      setSessionRpe(draft.sessionRpe ?? null)
      setSessionPain(draft.sessionPain ?? null)
      setFeelScore(draft.feelScore ?? null)
      setNotes(draft.notes ?? '')
      if (draft.startedAt) {
        startTimeRef.current = draft.startedAt
        setStartedAt(draft.startedAt)
        setElapsed(Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000)))
      }
      if (!isQuickMode && draft.state !== 'ready') setState(draft.state)
    }
    setShowResumeBanner(false)
  }

  function handleResetDraft() {
    clearStoredDraft(draftKey)
    setShowResumeBanner(false)
  }

  useDraftBackup<AthleteSessionDraft>({
    key: draftKey,
    value: {
      state,
      currentIndex,
      completed: [...completed],
      setLog,
      paramsByUid,
      extraExercises,
      startedAt,
      sessionRpe,
      sessionPain,
      feelScore,
      notes,
    },
    enabled: !showResumeBanner && resumeChecked,
  })

  const current = exercises[currentIndex]
  const todayDayNum = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  function addExercise(ex: DbExercise) {
    setExtraExercises(prev => [...prev, dbExerciseToLive(ex)])
    setShowAddExercise(false)
    setAddExerciseQuery('')
  }

  // Snel een nieuwe oefening aanmaken vanuit de sessie — als wat je deed niet
  // in de bibliotheek staat. Minimale oefening (naam + categorie KRACHT);
  // details verfijn je later in de bibliotheek. Wordt meteen toegevoegd aan
  // de lopende sessie. creatorProcedure staat dit toe voor athlete/therapist/admin.
  const createExercise = trpc.exercises.create.useMutation()
  async function createAndAddExercise(name: string, category: string) {
    const trimmed = name.trim()
    if (!trimmed || createExercise.isPending) return
    try {
      const created = await createExercise.mutateAsync({ name: trimmed, category: category as never, bodyRegion: [] })
      addExercise(created as unknown as DbExercise)
      utils.exercises.list.invalidate()
      toast.success(`"${trimmed}" aangemaakt en toegevoegd`)
    } catch {
      toast.error('Aanmaken mislukt, probeer het opnieuw')
    }
  }

  // Alleen zelf toegevoegde oefeningen zijn verwijderbaar (vóór de start);
  // programma-oefeningen blijven staan.
  function removeExercise(uid: string) {
    setExtraExercises(prev => prev.filter(e => e.uid !== uid))
  }

  // ── Set-log helpers (actieve programma-sessie) ─────────────────────────────
  // `seed` is de default-rij op basis van het programma (sets × reps), zodat
  // de eerste bewerking altijd op een volledige array werkt.

  function updateSet(uid: string, seed: SetEntry[], idx: number, patch: Partial<SetEntry>) {
    setSetLog(prev => {
      const arr = [...(prev[uid] ?? seed)]
      arr[idx] = { ...arr[idx], ...patch }
      return { ...prev, [uid]: arr }
    })
  }

  function addSet(uid: string, seed: SetEntry[]) {
    setSetLog(prev => {
      const arr = [...(prev[uid] ?? seed)]
      const last = arr[arr.length - 1]
      arr.push({ kg: last?.kg ?? '', reps: last?.reps ?? '', done: false })
      return { ...prev, [uid]: arr }
    })
  }

  /** Set afvinken → rusttimer starten zolang er nog sets te doen zijn. */
  function toggleSetDone(ex: LiveExercise, seed: SetEntry[], idx: number) {
    const entries = setLog[ex.uid] ?? seed
    const wasDone = entries[idx]?.done ?? false
    updateSet(ex.uid, seed, idx, { done: !wasDone })
    if (!wasDone) {
      const nextIdx = entries.findIndex((s, i) => i !== idx && !s.done)
      if (nextIdx !== -1) {
        const pk = prevKgFor(lastLogs[ex.exerciseId], nextIdx)
        const pr = prevRepsFor(lastLogs[ex.exerciseId], nextIdx)
        const hint = pk != null && pk > 0 ? ` · vorige keer ${fmtKg(pk)} kg${pr ? ` × ${pr}` : ''}` : ''
        setRestLabel(`Volgende: set ${nextIdx + 1}${hint}`)
        startRest(ex.restTime || 60)
      }
    }
  }

  /** Start-parameters: library-defaults + waarden van de vorige sessie. Voor
   *  atleet-eigen oefeningen tellen memory-params ook zonder defaults mee. */
  function paramsFor(ex: LiveExercise): SessionParam[] {
    return (
      paramsByUid[ex.uid] ??
      seedParams(ex.defaultExtraParams, lastLogs[ex.exerciseId]?.extraParams, true)
    )
  }

  function updateParams(uid: string, next: SessionParam[]) {
    setParamsByUid(prev => ({ ...prev, [uid]: next }))
  }

  /** Eenheid (reps/sec/min/m) wijzigen — alleen op zelf toegevoegde oefeningen. */
  function setUnit(uid: string, unit: string) {
    setExtraExercises(prev => prev.map(e => (e.uid === uid ? { ...e, repUnit: unit } : e)))
  }

  /** Neem de gewichten/reps van de vorige sessie over in de open velden. */
  function takeOverPrevious(ex: LiveExercise, seed: SetEntry[]) {
    const last = lastLogs[ex.exerciseId]
    if (!last) return
    setSetLog(prev => {
      const arr = (prev[ex.uid] ?? seed).map((s, i) => {
        const kg = prevKgFor(last, i)
        const reps = prevRepsFor(last, i)
        return {
          ...s,
          kg: s.kg !== '' ? s.kg : kg != null ? fmtKg(kg) : s.kg,
          reps: reps != null ? String(reps) : s.reps,
        }
      })
      return { ...prev, [ex.uid]: arr }
    })
  }

  const filteredLibrary = addExerciseQuery
    ? dbExercises.filter(e =>
        e.name.toLowerCase().includes(addExerciseQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(addExerciseQuery.toLowerCase())
      )
    : dbExercises

  function markDone() {
    const uid = exercises[currentIndex]?.uid
    if (uid) setCompleted(prev => new Set(prev).add(uid))
    skipRest()
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setState('done')
    }
  }

  async function handleFinish() {
    setError(null)
    // Beide flows ronden af via de popup: duur = de (aanpasbare) ingevulde
    // minuten, met de live-getelde tijd als vangnet bij lege/onzinnige invoer.
    const inputMin = Math.round(Number(durationInput))
    const durationSeconds = inputMin >= 1 ? inputMin * 60 : Math.max(elapsed, 1)
    // Niet gevraagd of niet ingevuld = `null`, NOOIT 0. Klinisch is "geen pijn
    // gemeld" iets anders dan "pijn 0", en de insights-laag leest `!= null` als
    // "gerapporteerd": readyForProgression eist dat álle recente sessies een
    // pijnscore onder de drempel hebben, dus verzonnen nullen laten dat advies
    // slagen op sessies waar niemand iets invulde.
    const painLevel = painEnabled ? sessionPain : null
    try {
      await logSession.mutateAsync({
        programId: isQuickMode ? undefined : sessionData?.program?.id,
        // Vinkt exact dit geplande item af i.p.v. "er is die dag íets gelogd".
        weekScheduleDayItemId: plannedItemId ?? undefined,
        scheduledAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds,
        painLevel,
        exertionLevel: sessionRpe,
        feelScore,
        notes: notes.trim() || undefined,
        completedAll: completed.size >= exercises.length,
        exercises: exercises.map(e => {
          // Set-flow (programma én quick): kg/reps per set + afvink-status.
          // parseKg accepteert komma én punt — "12,5" ging eerder verloren.
          const entries = setLog[e.uid] ?? seedSets(e)
          const ws = entries.map(s => parseKg(s.kg))
          const rs = entries.map(s => parseReps(s.reps))
          const doneCount = entries.filter(s => s.done).length
          const lastFilled = [...ws].reverse().find(n => n !== null) ?? null
          const firstReps = rs.find(n => n !== null) ?? null
          // WYSIWYG: ook onaangeraakte (geseede) parameterwaarden loggen.
          const params = filledParams(paramsByUid[e.uid] ?? paramsFor(e))
          return {
            exerciseId: e.exerciseId,
            // Niets afgevinkt maar wél ingevuld = alsnog alle sets tellen.
            setsCompleted: doneCount > 0 ? doneCount : entries.length,
            repsCompleted: firstReps ?? e.reps,
            repUnit: e.repUnit,
            weight: lastFilled,
            weightsPerSet: ws,
            repsPerSet: rs,
            extraParams: params.length > 0 ? params : undefined,
            painLevel,
          }
        }),
      })
      await Promise.all([
        utils.patient.muscleFatigue.invalidate(),
        utils.patient.getSessionHistory.invalidate(),
        utils.patient.getTodayExercises.invalidate(),
        utils.patient.getActiveProgram.invalidate(),
      ])
      // Concept opruimen — de sessie staat nu in de database.
      clearStoredDraft(draftKey)
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

  // Non-quick mode with no exercises: lege staat mét uitweg naar een vrije
  // workout, zodat je hier nooit klem staat.
  if (!isQuickMode && exercises.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <div className="text-center space-y-3 px-4 w-full max-w-xs">
          <MetaLabel>GEEN OEFENINGEN VOOR VANDAAG</MetaLabel>
          <div className="flex flex-col gap-2">
            <DarkButton href="/athlete/session?mode=quick" variant="primary">
              START VRIJE WORKOUT
            </DarkButton>
            <DarkButton href="/athlete/dashboard" variant="secondary">
              TERUG NAAR DASHBOARD
            </DarkButton>
          </div>
        </div>
      </div>
    )
  }

  // Concept van eerder vandaag gevonden → eerst vragen of we verdergaan.
  if (showResumeBanner) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: P.bg, color: P.ink }}>
        <div
          className="w-full max-w-sm rounded-2xl p-6 space-y-4"
          style={{...CARD }}
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
              Je hebt deze workout eerder vandaag gestart maar nog niet opgeslagen.
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

          {/* Alleen zichtbaar in een deload-week: uitleg waarom het lichter is. */}
          {!isQuickMode && <WeekPhaseLine variant="deload" />}

          {/* Workout-samenvatting: oefeningen · sets · richttijd */}
          {exercises.length > 0 && (
            <div
              className="rounded-xl flex items-center px-4 py-3"
              style={{...CARD, borderLeft: `3px solid ${P.brand}`,}}
            >
              <span
                className="athletic-mono"
                style={{ color: P.ink, fontSize: 12, fontWeight: 900, letterSpacing: '0.12em' }}
              >
                {exercises.length} OEFENING{exercises.length > 1 ? 'EN' : ''}
                <span style={{ color: P.inkDim }}> · </span>
                {exercises.reduce((a, e) => a + (setLog[e.uid]?.length ?? e.sets), 0)} SETS
                <span style={{ color: P.inkDim }}> · </span>
                <span style={{ color: P.brand }}>
                  ±{Math.max(5, Math.round(exercises.reduce((a, e) => a + (setLog[e.uid]?.length ?? e.sets) * (e.restTime + 45), 0) / 60 / 5) * 5)} MIN
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
                Kies uit favorieten, meest gebruikt of de hele bibliotheek, en start direct.
              </span>
            </button>
          ) : isQuickMode ? (
            <div className="space-y-2 mbt-stagger">
              {exercises.map((e, i) => (
                <QuickEditRow
                  key={e.uid}
                  index={i}
                  ex={e}
                  entries={setLog[e.uid] ?? seedSets(e)}
                  last={lastLogs[e.exerciseId]}
                  params={paramsFor(e)}
                  onParamsChange={(next) => updateParams(e.uid, next)}
                  onUnitChange={(u) => setUnit(e.uid, u)}
                  onProgress={
                    lastLogs[e.exerciseId]
                      ? () => setProgressFor({ id: e.exerciseId, name: e.name })
                      : undefined
                  }
                  onUpdateSet={(idx, patch) => updateSet(e.uid, seedSets(e), idx, patch)}
                  onToggleSet={(idx) => toggleSetDone(e, seedSets(e), idx)}
                  onAddSet={() => addSet(e.uid, seedSets(e))}
                  onTakeOver={() => takeOverPrevious(e, seedSets(e))}
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
                    style={{...CARD, borderLeft: `3px solid ${P.brand}`,}}
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
                          background: P.surfaceLow,
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
                          {CATEGORY_LABELS_NL[e.category] ?? e.category} · {formatSetsReps(e.sets, e.setsMax, e.reps, e.repsMax, e.repUnit)}
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
            onCreate={createAndAddExercise}
            creating={createExercise.isPending}
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

        {/* Rusttimer — ook in quick mode: de lijst is daar de live sessie */}
        {showRest && (
          <RestSheet
            secondsLeft={restLeft}
            total={restTotal}
            nextLabel={restLabel}
            onExtend={() => extendRest(15)}
            onSkip={skipRest}
          />
        )}

        {progressFor && (
          <ExerciseProgressSheet
            exerciseId={progressFor.id}
            exerciseName={progressFor.name}
            onClose={() => setProgressFor(null)}
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

          {/* Samenvatting: duur · afgevinkte sets · totaalvolume */}
          {(() => {
            let setsDone = 0
            let setsTotal = 0
            let volume = 0
            for (const e of exercises) {
              const entries = setLog[e.uid] ?? seedSets(e)
              setsTotal += entries.length
              for (const s of entries) {
                if (s.done) setsDone++
                const kg = parseKg(s.kg)
                const reps = parseReps(s.reps) ?? e.reps
                // Per-zijde telt dubbel (L+R); tijd/afstand-eenheden tellen niet mee in kg-volume.
                if (kg != null && isRepBasedUnit(e.repUnit)) volume += kg * (reps || 0) * sideVolumeFactor(e.repUnit)
              }
            }
            return (
              <div className="grid grid-cols-3 gap-2 text-left">
                {[
                  { label: 'DUUR', value: String(Math.max(1, Math.round(elapsed / 60))), unit: 'min' },
                  { label: 'SETS', value: String(setsDone), unit: `/${setsTotal}` },
                  { label: 'VOLUME', value: Math.round(volume).toLocaleString('nl-NL'), unit: 'kg' },
                ].map(({ label, value, unit }) => (
                  <div
                    key={label}
                    className="rounded-xl px-3 py-2.5"
                    style={{...CARD }}
                  >
                    <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.16em' }}>
                      {label}
                    </span>
                    <div className="athletic-mono" style={{ color: P.ink, fontSize: 17, fontWeight: 900, marginTop: 4 }}>
                      {value}
                      <span style={{ color: P.inkMuted, fontSize: 10, fontWeight: 500, marginLeft: 2 }}>{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Afronden loopt via dezelfde popup als de quick workout:
              RPE, gevoel, optionele pijn, aanpasbare duur en notities. */}
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
            SESSIE AFRONDEN
          </DarkButton>
        </div>

        {finishOpen && (
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
      </div>
    )
  }

  // Active state
  return (
    /* Zonder kader (fase 2): tijdens de sessie is dit een focus-scherm. */
    <div className="min-h-screen" style={{ background: P.flatBg, color: P.ink }}>
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
          style={{ background: P.track }}
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

        {/* Hero: current exercise — klikbaar als er een video is.
            Zonder kader: de oefening staat op de grond, niet in een doos. */}
        <Tile
          accentBar={P.brand}
          style={{ padding: '20px 0', background: 'transparent', border: 'none', boxShadow: 'none' }}
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
          {/* Chips: doel · voorschrift · rust · video — mockup-stijl */}
          {current && (() => {
            // Voorschrift → doel-badge + (waar mogelijk) concreet kg-doel. %1RM
            // tegen personal-best 1RM; "onder daily max" tegen de zwaarste set
            // die vandaag al voor dezelfde oefening is ingevoerd.
            const presc = toPrescription(current)
            const dailyMaxKg =
              presc.intensityType === 'RELATIVE_DAILY_MAX'
                ? exercises
                    .filter(x => x.exerciseId === current.exerciseId)
                    .flatMap(x => (setLog[x.uid] ?? []).map(s => parseKg(s.kg) ?? 0))
                    .reduce((m, kg) => Math.max(m, kg), 0)
                : null
            const targetKg = computeTargetKg(presc, { oneRepMax: prevOneRm[current.exerciseId] ?? null, dailyMaxKg })
            const prescLabel = formatPrescription(presc)
            const targetKgLabel = formatTargetKg(targetKg)
            return (
            <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 12 }}>
              <span
                className="athletic-mono rounded-full"
                style={{ padding: '4px 10px', border: `1px solid ${P.lineStrong}`, color: P.inkMuted, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700 }}
              >
                {(setLog[current.uid] ?? seedSets(current)).length} SETS · DOEL {current.reps} {current.repUnit.toUpperCase()}
              </span>
              {prescLabel && (
                <span
                  className="athletic-mono rounded-full"
                  style={{ padding: '4px 10px', border: `1px solid color-mix(in srgb, ${P.brand} 33%, transparent)`, color: P.brand, fontSize: 9, letterSpacing: '0.14em', fontWeight: 800 }}
                >
                  {prescLabel.toUpperCase()}{targetKgLabel ? ` · ${targetKgLabel.toUpperCase()}` : ''}
                </span>
              )}
              {(current.programExtraParams ?? []).map(p => {
                const label = formatPrescribedParam(p)
                if (!label) return null
                return (
                  <span
                    key={p.id}
                    className="athletic-mono rounded-full"
                    style={{ padding: '4px 10px', border: `1px solid ${P.lineStrong}`, color: P.inkMuted, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700 }}
                  >
                    {label.toUpperCase()}
                  </span>
                )
              })}
              <span
                className="athletic-mono rounded-full"
                style={{ padding: '4px 10px', border: `1px solid ${P.lineStrong}`, color: P.inkMuted, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700 }}
              >
                RUST {current.restTime || 60}S
              </span>
              {current.videoUrl && (
                <span
                  className="athletic-mono rounded-full inline-flex items-center gap-1"
                  style={{ padding: '4px 10px', border: '1px solid rgba(159,206,201,0.35)', color: P.ice, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700 }}
                >
                  <Play className="w-2.5 h-2.5" fill="currentColor" />
                  VIDEO
                </span>
              )}
            </div>
            )
          })()}
          {/* Programma-notitie bij deze oefening (coach-cue / uitvoering). */}
          {current?.notes?.trim() && (
            <div
              className="rounded-2xl px-4 py-3"
              style={{ marginTop: 12, background: P.surfaceHi, border: `1px solid ${P.line}` }}
            >
              <p style={{ color: P.ink, fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-line' }}>
                {current.notes}
              </p>
            </div>
          )}
        </Tile>

        {/* Set-flow: per set kg/reps loggen en afvinken; rust start vanzelf. */}
        {current && (() => {
          const seed = seedSets(current)
          const entries = setLog[current.uid] ?? seed
          const last = lastLogs[current.exerciseId]
          const prevSummary = prevSummaryFor(last)
          const hasPrev = prevSummary !== null

          return (
            <>
              {/* Vorige sessie als anker — één tik neemt de waarden over */}
              {hasPrev && (
                <button
                  type="button"
                  onClick={() => takeOverPrevious(current, seed)}
                  className="athletic-tap w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left"
                  style={{...CARD }}
                >
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: P.ice }}
                  />
                  <span className="flex-1 min-w-0 truncate" style={{ color: P.inkMuted, fontSize: 12 }}>
                    Vorige keer{' '}
                    <span className="athletic-mono" style={{ color: P.ink, fontWeight: 800 }}>
                      {prevSummary}
                    </span>
                  </span>
                  <span
                    className="athletic-mono shrink-0"
                    style={{ color: P.lime, fontSize: 9, letterSpacing: '0.12em', fontWeight: 800 }}
                  >
                    NEEM OVER
                  </span>
                </button>
              )}

              <section className="base-flat-rule" style={{ paddingTop: 16 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <Kicker>SETS</Kicker>
                  <div className="flex items-center gap-2">
                    {/* Voortgang-grafiek — alleen als er historie is */}
                    {hasPrev && (
                      <button
                        type="button"
                        onClick={() => setProgressFor({ id: current.exerciseId, name: current.name })}
                        aria-label={`Voortgang ${current.name}`}
                        className="athletic-tap rounded-full flex items-center justify-center"
                        style={{ width: 28, height: 28, border: `1px solid ${P.lineStrong}`, color: P.inkMuted }}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Eenheid alleen aanpasbaar op zelf toegevoegde oefeningen */}
                    {extraExercises.some(x => x.uid === current.uid) && (
                      <RepUnitPicker
                        value={current.repUnit}
                        onChange={(u) => setUnit(current.uid, u)}
                      />
                    )}
                  </div>
                </div>
                <SetRows
                  entries={entries}
                  last={last}
                  repUnit={current.repUnit}
                  onUpdate={(i, patch) => updateSet(current.uid, seed, i, patch)}
                  onToggle={(i) => toggleSetDone(current, seed, i)}
                  onAdd={() => addSet(current.uid, seed)}
                />
                <div className="mt-2">
                  <ExtraParamsEditor
                    params={paramsFor(current)}
                    onChange={(next) => updateParams(current.uid, next)}
                    addable
                  />
                </div>
              </section>
            </>
          )
        })()}

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
          {exercises.map((e, i) => (
            <div
              key={e.uid}
              className="w-2 h-2 rounded-full"
              style={{
                background: completed.has(e.uid)
                  ? P.lime
                  : i === currentIndex
                    ? P.gold
                    : P.inkDim,
              }}
            />
          ))}
        </div>
      </div>

      {/* Rusttimer — bottom sheet met countdown, +15s en overslaan */}
      {showRest && (
        <RestSheet
          secondsLeft={restLeft}
          total={restTotal}
          nextLabel={restLabel}
          onExtend={() => extendRest(15)}
          onSkip={skipRest}
        />
      )}

      {progressFor && (
        <ExerciseProgressSheet
          exerciseId={progressFor.id}
          exerciseName={progressFor.name}
          onClose={() => setProgressFor(null)}
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
          onCreate={createAndAddExercise}
          creating={createExercise.isPending}
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
        style={{...CARD }}
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
            background: alreadyAdded ? P.lime : P.control,
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
          style={{ color: isFav ? 'var(--p-danger)' : P.inkMuted, fill: isFav ? 'var(--p-danger)' : 'transparent' }}
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
  onCreate,
  creating,
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
  /** Maak een nieuwe oefening (naam + categorie) aan en voeg 'm meteen toe. */
  onCreate?: (name: string, category: string) => void
  creating?: boolean
  onToggleFavorite: (id: string) => void
  onClose: () => void
}) {
  const searching = query.trim().length > 0
  // Gekozen categorie voor een snel-aangemaakte oefening (default KRACHT).
  const [createCat, setCreateCat] = useState<string>('STRENGTH')
  // "Aanmaken"-blok: categorie-keuze + knop. Toont zodra je iets typt — óók als
  // er (deels) matches zijn, want de exacte oefening kan ontbreken.
  const createBlock = onCreate && searching ? (
    <div className="space-y-2">
      <MetaLabel>NIEUWE OEFENING · CATEGORIE</MetaLabel>
      <div className="flex flex-wrap gap-1.5">
        {CREATE_CATEGORIES.map(cat => {
          const active = createCat === cat
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCreateCat(cat)}
              className="athletic-tap athletic-mono rounded-full"
              style={{
                padding: '5px 11px',
                border: `1px solid ${active ? P.brand : P.lineStrong}`,
                background: active ? `color-mix(in srgb, ${P.brand} 12%, transparent)` : 'transparent',
                color: active ? P.brand : P.inkMuted,
                fontSize: 9,
                letterSpacing: '0.12em',
                fontWeight: 800,
              }}
            >
              {CATEGORY_LABELS_NL[cat] ?? cat}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => onCreate(query.trim(), createCat)}
        disabled={creating}
        className="athletic-tap mbt-btn-hover w-full flex items-center justify-center gap-2 rounded-xl"
        style={{
          padding: '12px 16px',
          border: `1px dashed ${P.brand}`,
          color: P.brand,
          background: 'transparent',
          fontFamily: mono,
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          opacity: creating ? 0.6 : 1,
        }}
      >
        <Plus className="w-3.5 h-3.5" />
        {creating ? 'Aanmaken…' : `"${query.trim()}" aanmaken en toevoegen`}
      </button>
    </div>
  ) : null

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
        style={{...CARD, maxWidth: 480,
          margin: '0 auto',
          // dvh i.p.v. vh: rekent de iOS Safari-toolbar mee, anders steekt de
          // sheet onder de zichtbare viewport uit.
          maxHeight: '80dvh',}}
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
                background: P.field,
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
            // Zoekmodus: gefilterde lijst + altijd de "aanmaken"-optie onderaan,
            // zodat een ontbrekende oefening direct aangemaakt kan worden.
            <div className="space-y-3">
              {filtered.length === 0 ? (
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
              )}
              {createBlock}
            </div>
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

// ─── Quick-workout: oefening-kaart met dezelfde set-flow als de programma-
// sessie (set-rijen, ghost-waardes, afvinken → rusttimer) ─────────────────────

function QuickEditRow({
  index,
  ex,
  entries,
  last,
  params,
  onParamsChange,
  onUnitChange,
  onProgress,
  onUpdateSet,
  onToggleSet,
  onAddSet,
  onTakeOver,
  onRemove,
  onVideo,
}: {
  index: number
  ex: LiveExercise
  entries: SetEntry[]
  last?: LastLog
  params: SessionParam[]
  onParamsChange: (next: SessionParam[]) => void
  onUnitChange: (unit: string) => void
  onProgress?: () => void
  onUpdateSet: (idx: number, patch: Partial<SetEntry>) => void
  onToggleSet: (idx: number) => void
  onAddSet: () => void
  onTakeOver: () => void
  onRemove: (uid: string) => void
  onVideo: () => void
}) {
  const prevSummary = prevSummaryFor(last)

  return (
    <div
      className="rounded-xl"
      style={{...CARD, borderLeft: `3px solid ${P.brand}`,
        padding: '12px 14px',}}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.brand, fontFamily: mono, fontSize: 13, fontWeight: 900 }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ color: P.ink, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>
            {ex.name}
          </p>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700, color: P.inkMuted, marginTop: 2, textTransform: 'uppercase' }}>
            {CATEGORY_LABELS_NL[ex.category] ?? ex.category}
            <span style={{ color: P.inkDim }}> · </span>
            {entries.filter(s => s.done).length}/{entries.length} SETS
          </div>
        </div>
        {onProgress && (
          <button
            type="button"
            onClick={onProgress}
            aria-label={`Voortgang ${ex.name}`}
            className="athletic-tap inline-flex items-center justify-center rounded-full shrink-0"
            style={{ width: 28, height: 28, border: `1px solid ${P.lineStrong}`, color: P.inkMuted }}
          >
            <TrendingUp className="w-3.5 h-3.5" />
          </button>
        )}
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

      {/* Vorige sessie als anker — één tik neemt de waarden over */}
      {prevSummary && (
        <button
          type="button"
          onClick={onTakeOver}
          className="athletic-tap mt-3 w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left"
          style={{ background: P.track, border: `1px solid ${P.line}` }}
        >
          <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: P.ice }} />
          <span className="flex-1 min-w-0 truncate" style={{ color: P.inkMuted, fontSize: 12 }}>
            Vorige keer{' '}
            <span className="athletic-mono" style={{ color: P.ink, fontWeight: 800 }}>{prevSummary}</span>
          </span>
          <span
            className="athletic-mono shrink-0"
            style={{ color: P.lime, fontSize: 9, letterSpacing: '0.12em', fontWeight: 800 }}
          >
            NEEM OVER
          </span>
        </button>
      )}

      {/* Eenheid van de reps-kolom — atleet kiest zelf reps/sec/min/m */}
      <div className="mt-3 flex justify-end">
        <RepUnitPicker value={ex.repUnit} onChange={onUnitChange} />
      </div>

      <div className="mt-2">
        <SetRows
          entries={entries}
          last={last}
          repUnit={ex.repUnit}
          onUpdate={onUpdateSet}
          onToggle={onToggleSet}
          onAdd={onAddSet}
        />
      </div>

      <div className="mt-2">
        <ExtraParamsEditor params={params} onChange={onParamsChange} addable />
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
              background: active ? color : P.control,
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
              background: active ? colorHigh : P.control,
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
        style={{...CARD }}
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
                style={{ background: 'rgba(245,185,66,0.12)', color: P.gold }}
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
                      style={{ background: 'rgba(240,121,108,0.12)', color: P.danger }}
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
                style={{ background: P.surfaceLow, color: P.danger, border: `1px dashed ${P.danger}`, fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}
              >
                <IconHeart size={13} /> + PIJN TOEVOEGEN
              </button>
            )}
          </section>

          <section>
            <MetaLabel>Duur (minuten)</MetaLabel>
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.04em' }}>
              Voorgesteld op basis van de tijd ({durationMin}m), pas aan indien nodig
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
