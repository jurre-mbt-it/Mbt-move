/**
 * Live-behandeling scherm voor therapeut.
 * Therapeut start een sessie vanuit patient-profiel, logt live sets+reps+pijn,
 * en submit naar `patients.logSessionForPatient`. Port van iOS-scherm
 * `mbt-gym/app/treatment/[patientId].tsx` (leanere web-variant).
 */
'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
  DarkButton,
  DarkHeader,
  DarkInput,
  DarkScreen,
  DarkTextarea,
  Kicker,
  MetaLabel,
  P,
  PulsingDot,
  Tile,
} from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'
import { useDraftBackup, loadDraft, clearStoredDraft } from '@/hooks/useAutosave'
import { PerformerToggle, type PerformerFilter } from '@/components/patients/PerformerToggle'
import {
  STANDARD_PARAMS,
  SUPERSET_COLORS,
  SUPERSET_LETTERS,
} from '@/lib/program-constants'

type ParamType = 'number' | 'text' | 'select' | 'slider'

type LiveExtraParam = {
  id: string
  label: string
  type: ParamType
  value: string | number
  unit?: string
  options?: string[]
  min?: number
  max?: number
}

type SessionPhase = 'WARMUP' | 'MAIN'

type LogRow = {
  uid: string
  exerciseId: string
  name: string
  /** true alleen bij rows die uit een echt programma komen — bepaalt of "Doel: …" zichtbaar is */
  hasProgramTarget: boolean
  targetSets: number
  targetReps: number
  repUnit: string
  setsCompleted: string // text-input
  repsCompleted: string
  /** Per-set gewicht in kg — array-lengte volgt setsCompleted */
  weightsPerSet: string[]
  /** Extra parameters per oefening (Tempo, RPE, Pauze, …) — zelfde shape als program-builder */
  extraParams: LiveExtraParam[]
  /** Superset-label (A..F) of null */
  supersetGroup: string | null
  /** Welk deel van de sessie: warming-up of hoofddeel */
  phase: SessionPhase
  painDuring: string
  /** Per-exercise visibility for toggleable parameters (sets/reps altijd zichtbaar). */
  visible: { weight: boolean; pain: boolean }
}

/**
 * Memory-item zoals teruggegeven door `exercises.lastUsedParams`. Past de
 * laatste waarden van DEZE therapeut voor DEZE oefening op een rij toe —
 * zodat hij niet elke keer Tempo / Band kleur / sets-reps opnieuw hoeft
 * in te tikken.
 */
type LastUsedMemoryItem = {
  setsCompleted: number | null
  repsCompleted: number | null
  repUnit: string
  weightsPerSet?: unknown
  extraParams?: unknown
}

function applyMemoryToRow(
  r: LogRow,
  mem: LastUsedMemoryItem | undefined,
  opts: { fillSetsReps: boolean },
): LogRow {
  if (!mem) return r
  const next: LogRow = { ...r }
  // Extra parameters (Tempo, Band kleur, ...) — vervang als memory iets heeft,
  // zodat de eerder ingevulde waarden voorrang krijgen op kale defaults.
  const memParams = clonePresetParams(mem.extraParams)
  if (memParams.length > 0) next.extraParams = memParams
  if (opts.fillSetsReps) {
    if (mem.setsCompleted != null) next.setsCompleted = String(mem.setsCompleted)
    if (mem.repsCompleted != null) next.repsCompleted = String(mem.repsCompleted)
    if (mem.repUnit) next.repUnit = mem.repUnit
    if (Array.isArray(mem.weightsPerSet) && mem.weightsPerSet.length > 0) {
      const strs = (mem.weightsPerSet as unknown[]).map((w) => (w == null ? '' : String(w)))
      next.weightsPerSet = strs
    }
  }
  return next
}

function clonePresetParams(input: unknown): LiveExtraParam[] {
  if (!Array.isArray(input)) return []
  const out: LiveExtraParam[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const label = String(p.label ?? '')
    if (!label) continue
    const type: ParamType =
      p.type === 'number' || p.type === 'text' || p.type === 'select' || p.type === 'slider'
        ? p.type
        : 'number'
    out.push({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      type,
      value: typeof p.value === 'string' || typeof p.value === 'number' ? p.value : 0,
      unit: typeof p.unit === 'string' ? p.unit : undefined,
      options: Array.isArray(p.options) ? p.options.filter((o): o is string => typeof o === 'string') : undefined,
      min: typeof p.min === 'number' ? p.min : undefined,
      max: typeof p.max === 'number' ? p.max : undefined,
    })
  }
  return out
}

function resizeWeights(current: string[], targetCount: number): string[] {
  if (targetCount <= 0) return ['']
  if (current.length === targetCount) return current
  if (current.length > targetCount) return current.slice(0, targetCount)
  return [...current, ...Array(targetCount - current.length).fill('')]
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function timeInputValue(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export default function TreatmentPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = use(params)
  const router = useRouter()

  const utils = trpc.useUtils()
  const { data: patient, isLoading: patientLoading } = trpc.patients.get.useQuery({ id: patientId })
  const { data: todayData, isLoading: todayLoading } = trpc.patient.getTodayExercises.useQuery({ patientId })
  const [previousPerformer, setPreviousPerformer] = useState<PerformerFilter>('all')
  const { data: previousSessionsRaw = [] } = trpc.patients.recentSessions.useQuery({
    patientId,
    limit: 1,
    performedBy: previousPerformer,
  })
  // Shallow cast — tRPC inference is anders te diep (TS2589) bij iteratie over exercises.
  const previousSessions = previousSessionsRaw as unknown as PreviousSession[]
  const previousSession: PreviousSession | null = previousSessions[0] ?? null
  const draftKey = `mbt-treatment-draft-${patientId}`
  const logMutation = trpc.patients.logSessionForPatient.useMutation({
    onSuccess: () => {
      clearStoredDraft(draftKey)
      toast.success('Sessie gelogd in patient dossier')
      router.push(`/therapist/patients/${patientId}`)
    },
    onError: (e) => toast.error(`Opslaan mislukt: ${e.message}`),
  })

  const [startedAt, setStartedAt] = useState(() => new Date())
  const [editingStart, setEditingStart] = useState(false)
  const [previousOpen, setPreviousOpen] = useState(true)
  const [mode, setMode] = useState<'choose' | 'program' | 'free' | 'previous'>('choose')
  const [rows, setRows] = useState<LogRow[]>([])
  const [dirty, setDirty] = useState(false) // gebruiker heeft lijst aangepast; niet meer auto-repoppen
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [exertionLevel, setExertionLevel] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [nowTick, setNowTick] = useState(Date.now())

  // Live sessie-data wordt op elke wijziging in localStorage geback-upt zodat
  // tab-close / refresh midden in een behandeling de sets niet kwijt maakt.
  // Server-commit gebeurt pas bij "BEHANDELING AFRONDEN".
  type DraftShape = {
    mode: typeof mode
    rows: LogRow[]
    painLevel: number | null
    exertionLevel: number | null
    notes: string
    dirty: boolean
    startedAt?: string
  }
  useEffect(() => {
    const draft = loadDraft<DraftShape>(draftKey)
    if (!draft) return
    setMode(draft.mode)
    setRows(draft.rows)
    setPainLevel(draft.painLevel)
    setExertionLevel(draft.exertionLevel)
    setNotes(draft.notes)
    setDirty(draft.dirty)
    if (draft.startedAt) {
      const d = new Date(draft.startedAt)
      if (!isNaN(d.getTime())) setStartedAt(d)
    }
    toast.info('Live sessie hersteld', { duration: 2000 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useDraftBackup<DraftShape>({
    key: draftKey,
    value: { mode, rows, painLevel, exertionLevel, notes, dirty, startedAt: startedAt.toISOString() },
    enabled: mode !== 'choose' || rows.length > 0 || notes.length > 0,
  })

  // Zodra de sessie écht begint (modus is gekozen), klap "vorige behandeling" in.
  useEffect(() => {
    if (mode !== 'choose') setPreviousOpen(false)
  }, [mode])

  // Bij "Volg programma" → laad programma-oefeningen één keer in.
  // `dirty` voorkomt dat auto-repop na verwijderen van alle rijen gebeurt.
  useEffect(() => {
    if (mode === 'program' && todayData?.exercises && !dirty && rows.length === 0) {
      const initialRows: LogRow[] = todayData.exercises.map((e) => ({
        uid: e.uid,
        exerciseId: e.exerciseId,
        name: e.name,
        hasProgramTarget: true,
        targetSets: e.sets,
        targetReps: e.reps,
        repUnit: e.repUnit,
        setsCompleted: String(e.sets),
        repsCompleted: String(e.reps),
        weightsPerSet: Array(Math.max(1, e.sets)).fill(''),
        extraParams: clonePresetParams(e.defaultExtraParams),
        supersetGroup: e.supersetGroup ?? null,
        phase: 'MAIN',
        painDuring: '',
        visible: { weight: true, pain: true },
      }))
      setRows(initialRows)
      // Memory: vul Tempo / Band kleur / RPE etc. voor uit laatste sessie,
      // maar respecteer sets/reps/repUnit van het programma (dat is doelbewust
      // zo geprogrammeerd).
      const ids = Array.from(new Set(initialRows.map((r) => r.exerciseId)))
      if (ids.length > 0) {
        utils.exercises.lastUsedParams
          .fetch({ exerciseIds: ids, patientId })
          .then((memory) => {
            setRows((prev) =>
              prev.map((r) => applyMemoryToRow(r, memory[r.exerciseId], { fillSetsReps: false })),
            )
          })
          .catch(() => {})
      }
    }
  }, [mode, todayData, dirty, rows.length, utils])

  // Bij "Vorige sessie" → laad de oefeningen uit de laatste sessie als startpunt.
  // Sets/reps/superset/extra params worden overgenomen; weight-velden + pijn
  // worden bewust leeg gezet — dat moet vandaag opnieuw worden ingevuld.
  useEffect(() => {
    if (mode === 'previous' && previousSession && !dirty && rows.length === 0) {
      setRows(
        previousSession.exercises.map((e, idx) => {
          const sets = Math.max(1, e.sets ?? 1)
          return {
            uid: `prev-${Date.now()}-${idx}-${e.id}`,
            exerciseId: e.exerciseId,
            name: e.name,
            hasProgramTarget: false,
            targetSets: 0,
            targetReps: 0,
            repUnit: 'reps',
            setsCompleted: e.sets != null ? String(e.sets) : '',
            repsCompleted: e.reps != null ? String(e.reps) : '',
            weightsPerSet: Array(sets).fill(''),
            extraParams: clonePresetParams(e.extraParams),
            supersetGroup: e.supersetGroup ?? null,
            phase: ((e as { phase?: SessionPhase | null }).phase ?? 'MAIN') as SessionPhase,
            painDuring: '',
            visible: { weight: true, pain: true },
          }
        }),
      )
    }
  }, [mode, previousSession, dirty, rows.length])

  // Live timer tick
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const durationMin = Math.max(1, Math.round((nowTick - startedAt.getTime()) / 60000))

  const updateRow = (uid: string, patch: Partial<LogRow>) => {
    setDirty(true)
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r
      const merged = { ...r, ...patch }
      // Bij wijziging van setsCompleted het weightsPerSet array meeschalen
      if (patch.setsCompleted !== undefined) {
        const target = Math.max(1, Number(patch.setsCompleted) || 1)
        merged.weightsPerSet = resizeWeights(merged.weightsPerSet, target)
      }
      return merged
    }))
  }

  const removeRow = (uid: string) => {
    setDirty(true)
    setRows((prev) => {
      const row = prev.find((r) => r.uid === uid)
      const idx = prev.findIndex((r) => r.uid === uid)
      const next = prev.filter((r) => r.uid !== uid)

      if (row && idx >= 0) {
        // Toon toast met Undo — herstelt op dezelfde positie
        toast(`"${row.name}" verwijderd`, {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              setRows((cur) => {
                if (cur.some((r) => r.uid === uid)) return cur
                const copy = [...cur]
                copy.splice(Math.min(idx, copy.length), 0, row)
                return copy
              })
            },
          },
        })
      }
      return next
    })
  }

  const resetToProgram = () => {
    setDirty(false)
    setRows([]) // triggert de useEffect opnieuw
  }

  const addRow = (ex: { id: string; name: string }, phase: SessionPhase = 'MAIN') => {
    setDirty(true)
    const newUid = `new-${Date.now()}-${ex.id}`
    const newRow: LogRow = {
      uid: newUid,
      exerciseId: ex.id,
      name: ex.name,
      hasProgramTarget: false,
      targetSets: 0,
      targetReps: 0,
      repUnit: 'reps',
      setsCompleted: '',
      repsCompleted: '',
      weightsPerSet: [''],
      extraParams: [],
      supersetGroup: null,
      phase,
      painDuring: '',
      visible: { weight: true, pain: true },
    }
    // Invariant: warm-up rows komen altijd vóór main rows in de array, zodat
    // de twee secties consistent kunnen renderen via filter zonder extra index.
    setRows((prev) => {
      if (phase === 'WARMUP') {
        const lastWarmupIdx = prev.map((r) => r.phase).lastIndexOf('WARMUP')
        const insertAt = lastWarmupIdx + 1
        return [...prev.slice(0, insertAt), newRow, ...prev.slice(insertAt)]
      }
      return [...prev, newRow]
    })
    // Memory-fetch: pak de laatst gebruikte parameters van deze oefening
    // voor déze patiënt en vul de net toegevoegde rij voor.
    // Faalt stil — een lege memory is altijd OK, je krijgt dan gewoon defaults.
    utils.exercises.lastUsedParams
      .fetch({ exerciseIds: [ex.id], patientId })
      .then((memory) => {
        const mem = memory[ex.id]
        if (!mem) return
        setRows((prev) =>
          prev.map((r) => (r.uid === newUid ? applyMemoryToRow(r, mem, { fillSetsReps: true }) : r)),
        )
      })
      .catch(() => {})
  }

  const toggleVisible = (uid: string, field: 'weight' | 'pain') => {
    setDirty(true)
    setRows((prev) =>
      prev.map((r) =>
        r.uid === uid
          ? { ...r, visible: { ...r.visible, [field]: !r.visible[field] } }
          : r,
      ),
    )
  }

  const addExtraParam = (uid: string, tpl: typeof STANDARD_PARAMS[number]) => {
    setDirty(true)
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r
        if (r.extraParams.some((p) => p.label === tpl.label)) return r
        const tplAny = tpl as typeof tpl & { min?: number; max?: number; options?: string[] }
        return {
          ...r,
          extraParams: [
            ...r.extraParams,
            {
              id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              label: tpl.label,
              type: tpl.type,
              value: tpl.type === 'number' || tpl.type === 'slider' ? 0 : '',
              unit: 'unit' in tpl ? tpl.unit : undefined,
              options: tplAny.options,
              min: tplAny.min,
              max: tplAny.max,
            },
          ],
        }
      }),
    )
  }

  const updateExtraParam = (uid: string, paramId: string, value: string | number) => {
    setDirty(true)
    setRows((prev) =>
      prev.map((r) =>
        r.uid !== uid
          ? r
          : { ...r, extraParams: r.extraParams.map((p) => (p.id === paramId ? { ...p, value } : p)) },
      ),
    )
  }

  const removeExtraParam = (uid: string, paramId: string) => {
    setDirty(true)
    setRows((prev) =>
      prev.map((r) =>
        r.uid !== uid
          ? r
          : { ...r, extraParams: r.extraParams.filter((p) => p.id !== paramId) },
      ),
    )
  }

  const setSupersetGroup = (uid: string, group: string | null) => {
    setDirty(true)
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, supersetGroup: group } : r)))
  }

  const applyStartTime = (hhmm: string) => {
    const [hStr, mStr] = hhmm.split(':')
    const h = Number(hStr)
    const m = Number(mStr)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const d = new Date(startedAt)
    d.setHours(h, m, 0, 0)
    // Niet in de toekomst zetten
    const now = new Date()
    if (d.getTime() > now.getTime()) {
      toast.error('Starttijd kan niet in de toekomst liggen')
      return
    }
    setStartedAt(d)
    setEditingStart(false)
  }

  const canSubmit = useMemo(() => rows.length > 0 && !logMutation.isPending, [rows, logMutation.isPending])

  // ── Render-grouping per fase (warming-up boven, hoofddeel onder) ─────────
  // BELANGRIJK: deze hooks moeten boven de early-returns blijven — anders
  // verandert de hook-volgorde tussen renders en crashed React.
  type RenderItem = { kind: 'single'; row: LogRow } | { kind: 'group'; group: string; rows: LogRow[] }

  function buildItems(phaseRows: LogRow[]): RenderItem[] {
    const out: RenderItem[] = []
    const seenGroups = new Set<string>()
    for (const r of phaseRows) {
      if (!r.supersetGroup) {
        out.push({ kind: 'single', row: r })
      } else if (!seenGroups.has(r.supersetGroup)) {
        seenGroups.add(r.supersetGroup)
        out.push({
          kind: 'group',
          group: r.supersetGroup,
          rows: phaseRows.filter((x) => x.supersetGroup === r.supersetGroup),
        })
      }
    }
    return out
  }

  const warmupRows = useMemo(() => rows.filter((r) => r.phase === 'WARMUP'), [rows])
  const mainRows = useMemo(() => rows.filter((r) => r.phase !== 'WARMUP'), [rows])
  const warmupItems = useMemo(() => buildItems(warmupRows), [warmupRows])
  const mainItems = useMemo(() => buildItems(mainRows), [mainRows])

  const itemId = (item: RenderItem, phase: SessionPhase) =>
    item.kind === 'single'
      ? `${phase}-single-${item.row.uid}`
      : `${phase}-group-${item.group}`

  const warmupIds = useMemo(() => warmupItems.map((it) => itemId(it, 'WARMUP')), [warmupItems])
  const mainIds = useMemo(() => mainItems.map((it) => itemId(it, 'MAIN')), [mainItems])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEndForPhase(phase: SessionPhase) {
    return (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const items = phase === 'WARMUP' ? warmupItems : mainItems
      const ids = phase === 'WARMUP' ? warmupIds : mainIds
      const oldIdx = ids.indexOf(active.id as string)
      const newIdx = ids.indexOf(over.id as string)
      if (oldIdx < 0 || newIdx < 0) return
      const reordered = arrayMove(items, oldIdx, newIdx)
      const flat: LogRow[] = []
      for (const item of reordered) {
        if (item.kind === 'single') flat.push(item.row)
        else flat.push(...item.rows)
      }
      setDirty(true)
      // Behoud invariant: warm-up vóór main.
      setRows(phase === 'WARMUP' ? [...flat, ...mainRows] : [...warmupRows, ...flat])
    }
  }

  function handleSubmit() {
    const now = new Date()
    logMutation.mutate({
      patientId,
      programId: todayData?.program?.id ?? undefined,
      scheduledAt: startedAt.toISOString(),
      completedAt: now.toISOString(),
      durationSeconds: Math.max(60, Math.round((now.getTime() - startedAt.getTime()) / 1000)),
      painLevel,
      exertionLevel,
      notes: notes.trim() || undefined,
      exercises: rows.map((r) => {
        const weights = r.visible.weight
          ? r.weightsPerSet.map((w) => (w === '' ? null : Number(w))).filter((n) => n === null || !Number.isNaN(n)) as Array<number | null>
          : null
        // Legacy "weight" = laatste niet-lege set, t.b.v. 1RM/trends die op single weight rekenen
        const lastFilled = weights ? [...weights].reverse().find((n) => n !== null) ?? null : null
        return {
          exerciseId: r.exerciseId,
          setsCompleted: r.setsCompleted ? Number(r.setsCompleted) : undefined,
          repsCompleted: r.repsCompleted ? Number(r.repsCompleted) : undefined,
          weight: lastFilled,
          weightsPerSet: weights,
          extraParams: r.extraParams.length ? r.extraParams : null,
          supersetGroup: r.supersetGroup,
          phase: r.phase,
          // Verborgen parameters worden niet gelogd (null)
          painDuring: r.visible.pain && r.painDuring ? Number(r.painDuring) : null,
        }
      }),
    })
  }

  if (patientLoading || todayLoading) {
    return (
      <DarkScreen>
        <DarkHeader title="Live behandeling" backHref={`/therapist/patients/${patientId}`} />
        <div className="flex-1 flex items-center justify-center">
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
        </div>
      </DarkScreen>
    )
  }

  if (!patient) {
    return (
      <DarkScreen>
        <DarkHeader title="Live behandeling" backHref="/therapist/patients" />
        <div className="max-w-lg w-full mx-auto px-4 py-8 text-center">
          <p style={{ color: P.inkMuted, fontSize: 14 }}>Patiënt niet gevonden of geen actieve koppeling.</p>
        </div>
      </DarkScreen>
    )
  }


  return (
    <DarkScreen>
      <DarkHeader
        title="Live behandeling"
        backHref={`/therapist/patients/${patientId}`}
        right={
          <button
            type="button"
            onClick={() => setEditingStart(true)}
            title="Klik om starttijd aan te passen"
            className="athletic-mono inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px]"
            style={{ color: P.lime, border: `1px solid ${P.lime}`, backgroundColor: P.surface }}
          >
            <PulsingDot color={P.lime} size={6} /> LIVE · {durationMin}M
          </button>
        }
      />

      <div className="max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-5">
        {/* Patient header */}
        <div className="flex flex-col gap-1">
          <Kicker>Patient</Kicker>
          <h1 className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}>
            {(patient.name ?? patient.email).toUpperCase()}
          </h1>
          {todayData?.program && (
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              {todayData.program.name} · Week {todayData.program.currentWeek} · Dag {todayData.program.currentDay}
            </MetaLabel>
          )}
        </div>

        {/* Start-time editor */}
        {editingStart && (
          <Tile>
            <MetaLabel>Starttijd aanpassen</MetaLabel>
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4 }}>
              Sessie gestart om {timeInputValue(startedAt)} — pas aan als je later bent begonnen.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="time"
                defaultValue={timeInputValue(startedAt)}
                onChange={(e) => applyStartTime(e.target.value)}
                className="px-2 py-1.5 rounded"
                style={{
                  background: P.surfaceHi,
                  border: `1px solid ${P.lineStrong}`,
                  color: P.ink,
                  fontSize: 14,
                  colorScheme: 'dark',
                }}
              />
              <button
                type="button"
                onClick={() => setEditingStart(false)}
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}
              >
                SLUITEN
              </button>
            </div>
          </Tile>
        )}

        {/* Vorige behandeling — direct zichtbaar bij start, inklapbaar tijdens sessie */}
        {mode === 'choose' && (
          <PerformerToggle
            value={previousPerformer}
            onChange={setPreviousPerformer}
            ariaLabel="Filter laatste behandeling op uitvoerder"
          />
        )}
        {previousSession ? (
          <PreviousSessionPanel
            session={previousSession}
            patientId={patientId}
            open={previousOpen}
            onToggle={() => setPreviousOpen((v) => !v)}
          />
        ) : mode === 'choose' && previousPerformer !== 'all' ? (
          <Tile>
            <div className="py-4 text-center">
              <p style={{ color: P.inkMuted, fontSize: 12 }}>
                {previousPerformer === 'patient'
                  ? 'Patiënt heeft nog niks zelf gelogd.'
                  : 'Nog geen sessie door therapeut gelogd.'}
              </p>
            </div>
          </Tile>
        ) : null}

        {/* Mode chooser */}
        {mode === 'choose' && (
          <section className="flex flex-col gap-3">
            <Kicker>Hoe wil je starten?</Kicker>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setMode('program')}
                disabled={!todayData?.program}
                className="athletic-tap rounded-xl p-5 text-left"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.brand}`,
                  opacity: todayData?.program ? 1 : 0.4,
                }}
              >
                <Kicker>Volg programma</Kicker>
                <p style={{ color: P.ink, fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                  {todayData?.program?.name ?? 'Geen actief programma'}
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                  {todayData?.exercises.length ?? 0} oefeningen voor vandaag. Je kunt tijdens de sessie aanpassen.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('previous')}
                disabled={!previousSession || previousSession.exercises.length === 0}
                className="athletic-tap rounded-xl p-5 text-left"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.ice}`,
                  opacity: previousSession && previousSession.exercises.length > 0 ? 1 : 0.4,
                }}
              >
                <Kicker>Vorige sessie</Kicker>
                <p style={{ color: P.ink, fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                  {previousSession ? 'Herhaal als startpunt' : 'Geen vorige sessie'}
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                  {previousSession
                    ? `${previousSession.exercises.length} oef. uit ${formatRelativeDate(previousSession.completedAt)}. Sets/reps aanpasbaar.`
                    : 'Nog niets gelogd voor deze patient.'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('free')}
                className="athletic-tap rounded-xl p-5 text-left"
                style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
              >
                <Kicker>Vrije workout</Kicker>
                <p style={{ color: P.ink, fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                  Leeg starten
                </p>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                  Log wat je nu samen doet zonder programma als basis.
                </p>
              </button>
            </div>
          </section>
        )}

        {/* Exercise rows — twee secties: warming-up + hoofddeel */}
        {mode !== 'choose' && (() => {
          const renderItems = (items: RenderItem[]) => items.map((item) => {
            if (item.kind === 'single') {
              const id = `single-${item.row.uid}` // alleen voor key; sortable-id zit in wrapper
              return (
                <SortableSingle key={id} id={item.row.phase === 'WARMUP' ? `WARMUP-single-${item.row.uid}` : `MAIN-single-${item.row.uid}`}>
                  {(dragHandle) => (
                    <ExerciseTile
                      row={item.row}
                      dragHandle={dragHandle}
                      onUpdate={updateRow}
                      onRemove={removeRow}
                      onToggleVisible={toggleVisible}
                      onAddParam={addExtraParam}
                      onUpdateParam={updateExtraParam}
                      onRemoveParam={removeExtraParam}
                      onSetSuperset={setSupersetGroup}
                    />
                  )}
                </SortableSingle>
              )
            }
            const colors = SUPERSET_COLORS[item.group] ?? { bg: 'rgba(255,255,255,0.04)', border: P.lineStrong, text: P.ink }
            const groupPhase: SessionPhase = item.rows[0]?.phase ?? 'MAIN'
            return (
              <SortableGroup key={`group-${item.group}`} id={`${groupPhase}-group-${item.group}`}>
                {(dragHandle) => (
                  <div
                    className="rounded-xl p-2 flex flex-col gap-2"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          {...dragHandle}
                          aria-label="Sleep superset"
                          className="athletic-mono touch-none"
                          style={{ color: colors.text, cursor: 'grab', fontSize: 14, padding: '2px 4px' }}
                        >
                          ⋮⋮
                        </button>
                        <span
                          className="athletic-mono"
                          style={{ color: colors.text, fontSize: 11, letterSpacing: '0.14em', fontWeight: 900 }}
                        >
                          SUPERSET {item.group} · {item.rows.length} oef.
                        </span>
                      </div>
                    </div>
                    {item.rows.map((r, idx) => (
                      <ExerciseTile
                        key={r.uid}
                        row={r}
                        supersetLabel={`${item.group}${idx + 1}`}
                        onUpdate={updateRow}
                        onRemove={removeRow}
                        onToggleVisible={toggleVisible}
                        onAddParam={addExtraParam}
                        onUpdateParam={updateExtraParam}
                        onRemoveParam={removeExtraParam}
                        onSetSuperset={setSupersetGroup}
                      />
                    ))}
                  </div>
                )}
              </SortableGroup>
            )
          })

          return (
            <>
              {/* WARMING UP — altijd zichtbaar zodat de feature ontdekbaar is */}
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Kicker style={{ color: P.gold }}>Warming up · {warmupRows.length}</Kicker>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndForPhase('WARMUP')}>
                  <SortableContext items={warmupIds} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3">
                      {renderItems(warmupItems)}
                    </div>
                  </SortableContext>
                </DndContext>
                <AddExerciseRow
                  onAdd={(ex) => addRow(ex, 'WARMUP')}
                  label="+ Warming-up oefening toevoegen"
                  accent={P.gold}
                />
              </section>

              {/* HOOFDDEEL */}
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Kicker>Oefeningen · {mainRows.length}</Kicker>
                  {mode === 'program' && dirty && (
                    <button
                      type="button"
                      onClick={resetToProgram}
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em' }}
                    >
                      HERSTEL PROGRAMMA
                    </button>
                  )}
                </div>
                {rows.length === 0 && (
                  <Tile>
                    <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 8 }}>
                      Geen oefeningen voor vandaag in het programma. Log een vrije sessie met alleen notities.
                    </p>
                  </Tile>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndForPhase('MAIN')}>
                  <SortableContext items={mainIds} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3">
                      {renderItems(mainItems)}
                    </div>
                  </SortableContext>
                </DndContext>
                <AddExerciseRow onAdd={(ex) => addRow(ex)} />
              </section>
            </>
          )
        })()}

        {/* Overall pain + RPE — visueel onderscheiden met kleur-accenten */}
        {mode !== 'choose' && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Tile accentBar={P.danger}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'rgba(248,113,113,0.12)', color: P.danger, fontSize: 14 }}
              >
                ♥
              </span>
              <MetaLabel style={{ color: P.danger }}>PIJN /10</MetaLabel>
            </div>
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.04em' }}>
              0 = geen pijn · 10 = ondraaglijk
            </p>
            <ScalePicker value={painLevel} onChange={setPainLevel} colorHigh={P.danger} />
          </Tile>
          <Tile accentBar={P.gold}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'rgba(244,194,97,0.12)', color: P.gold, fontSize: 14 }}
              >
                ⚡
              </span>
              <MetaLabel style={{ color: P.gold }}>RPE (inspanning) /10</MetaLabel>
            </div>
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.04em' }}>
              0 = rust · 10 = maximale inspanning
            </p>
            <ScalePicker value={exertionLevel} onChange={setExertionLevel} colorHigh={P.gold} />
          </Tile>
        </section>
        )}

        {/* Notes */}
        {mode !== 'choose' && (
        <section className="flex flex-col gap-2">
          <MetaLabel>Notities</MetaLabel>
          <DarkTextarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Bevindingen, aanpassingen, vervolgplan…" rows={3} />
        </section>
        )}

        {mode !== 'choose' && (
        <DarkButton size="lg" onClick={handleSubmit}
          disabled={!canSubmit} loading={logMutation.isPending}>
          {logMutation.isPending ? 'OPSLAAN…' : `BEHANDELING AFRONDEN (${durationMin}M)`}
        </DarkButton>
        )}
      </div>
    </DarkScreen>
  )
}

type DragHandleProps = Record<string, unknown>

/**
 * Render-prop wrappers voor dnd-kit. We geven `dragHandle` (attributes + listeners
 * gecombineerd) door zodat de child kan kiezen waar de greep zit — bij singles in
 * de title-row, bij supersets in de header-balk.
 */
function SortableSingle({
  id,
  children,
}: {
  id: string
  children: (dragHandle: DragHandleProps) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

function SortableGroup({
  id,
  children,
}: {
  id: string
  children: (dragHandle: DragHandleProps) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

function ExerciseTile({
  row: r,
  supersetLabel,
  dragHandle,
  onUpdate,
  onRemove,
  onToggleVisible,
  onAddParam,
  onUpdateParam,
  onRemoveParam,
  onSetSuperset,
}: {
  row: LogRow
  supersetLabel?: string
  /** Alleen aanwezig voor losse oefeningen (top-niveau). Supersets dragen
   *  als blok — daar zit de greep op de superset-header. */
  dragHandle?: DragHandleProps
  onUpdate: (uid: string, patch: Partial<LogRow>) => void
  onRemove: (uid: string) => void
  onToggleVisible: (uid: string, field: 'weight' | 'pain') => void
  onAddParam: (uid: string, tpl: typeof STANDARD_PARAMS[number]) => void
  onUpdateParam: (uid: string, paramId: string, value: string | number) => void
  onRemoveParam: (uid: string, paramId: string) => void
  onSetSuperset: (uid: string, group: string | null) => void
}) {
  const [paramMenuOpen, setParamMenuOpen] = useState(false)
  const [supersetMenuOpen, setSupersetMenuOpen] = useState(false)
  const setsCount = Math.max(1, Number(r.setsCompleted) || 1)
  const weights = r.weightsPerSet.length === setsCount ? r.weightsPerSet : resizeWeights(r.weightsPerSet, setsCount)
  const availableParams = STANDARD_PARAMS.filter((p) => !r.extraParams.some((ep) => ep.label === p.label))

  const anyMenuOpen = paramMenuOpen || supersetMenuOpen

  return (
    <Tile
      className="!overflow-visible"
      style={anyMenuOpen ? { zIndex: 20 } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {dragHandle && (
              <button
                type="button"
                {...dragHandle}
                aria-label="Sleep oefening"
                className="athletic-mono touch-none shrink-0"
                style={{ color: P.inkDim, cursor: 'grab', fontSize: 14, padding: '0 2px' }}
              >
                ⋮⋮
              </button>
            )}
            {supersetLabel && (
              <span
                className="athletic-mono"
                style={{
                  color: SUPERSET_COLORS[supersetLabel[0]]?.text ?? P.ink,
                  background: SUPERSET_COLORS[supersetLabel[0]]?.bg ?? P.surfaceHi,
                  border: `1px solid ${SUPERSET_COLORS[supersetLabel[0]]?.border ?? P.lineStrong}`,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  padding: '1px 5px',
                  borderRadius: 4,
                }}
              >
                {supersetLabel}
              </span>
            )}
            <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{r.name}</span>
          </div>
          {r.hasProgramTarget && (
            <div className="athletic-mono mt-0.5" style={{ color: P.inkMuted, fontSize: 11, textTransform: 'none', fontWeight: 500 }}>
              Doel: {r.targetSets} × {r.targetReps} {r.repUnit}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 relative">
          <button
            type="button"
            onClick={() => {
              // Al in superset → 1 klik = ontkoppelen (oefening blijft staan,
              // alleen de groep-koppeling vervalt). Nog geen superset → menu.
              if (r.supersetGroup) {
                onSetSuperset(r.uid, null)
                setSupersetMenuOpen(false)
              } else {
                setSupersetMenuOpen((v) => !v)
                setParamMenuOpen(false)
              }
            }}
            title={r.supersetGroup ? 'Klik om uit superset te halen' : 'Voeg toe aan superset'}
            className="athletic-tap athletic-mono"
            style={{
              color: r.supersetGroup ? (SUPERSET_COLORS[r.supersetGroup]?.text ?? P.lime) : P.inkMuted,
              fontSize: 11, letterSpacing: '0.1em', padding: '4px 6px',
              border: `1px solid ${r.supersetGroup ? (SUPERSET_COLORS[r.supersetGroup]?.border ?? P.lime) : P.lineStrong}`,
              borderRadius: 4,
              fontWeight: 900,
            }}
          >
            {r.supersetGroup ?? 'SS'}
          </button>
          {supersetMenuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-10 rounded-lg p-2 flex flex-col gap-1"
              style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}`, minWidth: 140 }}
            >
              <button
                type="button"
                onClick={() => { onSetSuperset(r.uid, null); setSupersetMenuOpen(false) }}
                className="athletic-mono athletic-tap text-left px-2 py-1 rounded"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.08em' }}
              >
                GEEN SUPERSET
              </button>
              {SUPERSET_LETTERS.map((letter) => {
                const c = SUPERSET_COLORS[letter]
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => { onSetSuperset(r.uid, letter); setSupersetMenuOpen(false) }}
                    className="athletic-mono athletic-tap text-left px-2 py-1 rounded"
                    style={{
                      background: r.supersetGroup === letter ? c.bg : 'transparent',
                      color: c.text,
                      fontSize: 11, letterSpacing: '0.08em', fontWeight: 800,
                      border: `1px solid ${r.supersetGroup === letter ? c.border : 'transparent'}`,
                    }}
                  >
                    SUPERSET {letter}
                  </button>
                )
              })}
            </div>
          )}
          <button type="button" onClick={() => onRemove(r.uid)}
            className="athletic-tap athletic-mono"
            style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.12em', padding: '4px 8px' }}>
            ×
          </button>
        </div>
      </div>
      <div
        className="grid gap-2 mt-3"
        style={{ gridTemplateColumns: `repeat(${2 + (r.visible.pain ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        <LabeledInput label="Sets" value={r.setsCompleted} onChange={(v) => onUpdate(r.uid, { setsCompleted: v })} inputMode="numeric" />
        <RepsInput
          unit={r.repUnit}
          onUnitChange={(u) => onUpdate(r.uid, { repUnit: u })}
          value={r.repsCompleted}
          onChange={(v) => onUpdate(r.uid, { repsCompleted: v })}
        />
        {r.visible.pain && (
          <LabeledInput
            label="Pijn /10"
            value={r.painDuring}
            onChange={(v) => onUpdate(r.uid, { painDuring: v })}
            inputMode="numeric"
            onRemove={() => onToggleVisible(r.uid, 'pain')}
          />
        )}
      </div>

      {/* Per-set gewicht: één input per set */}
      {r.visible.weight && (
        <div className="mt-3" style={{ position: 'relative' }}>
          <div className="flex items-center justify-between">
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
              GEWICHT (KG) · PER SET
            </span>
            <button
              type="button"
              onClick={() => onToggleVisible(r.uid, 'weight')}
              aria-label="Verberg gewicht"
              className="athletic-tap"
              style={{
                width: 18, height: 18, borderRadius: 999,
                background: P.surfaceHi, color: P.inkMuted,
                border: `1px solid ${P.lineStrong}`,
                fontSize: 10, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
          <div
            className="grid gap-1.5 mt-1.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(setsCount, 6)}, minmax(0, 1fr))` }}
          >
            {weights.map((w, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.1em' }}>
                  S{idx + 1}
                </span>
                <DarkInput
                  value={w}
                  onChange={(e) => {
                    const next = [...weights]
                    next[idx] = e.target.value
                    onUpdate(r.uid, { weightsPerSet: next })
                  }}
                  inputMode="decimal"
                  style={{ padding: '6px 8px', fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extra parameters (Tempo/RPE/Pauze/…) */}
      {r.extraParams.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.extraParams.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1 px-2 py-1 rounded-md group/param"
              style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}`, fontSize: 12 }}
            >
              <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em' }}>
                {p.label.toUpperCase()}
              </span>
              {p.type === 'number' ? (
                <input
                  type="number"
                  value={p.value as number}
                  min={p.min}
                  max={p.max}
                  onChange={(e) => onUpdateParam(r.uid, p.id, Number(e.target.value))}
                  className="bg-transparent text-center font-semibold focus:outline-none"
                  style={{ color: P.ink, width: 48, fontSize: 13 }}
                />
              ) : p.type === 'slider' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={p.min ?? 0}
                    max={p.max ?? 10}
                    value={p.value as number}
                    onChange={(e) => onUpdateParam(r.uid, p.id, Number(e.target.value))}
                    className="w-16 h-1"
                    style={{ accentColor: P.lime }}
                  />
                  <span className="font-semibold" style={{ color: P.ink, width: 20, textAlign: 'center', fontSize: 13 }}>
                    {p.value}
                  </span>
                </div>
              ) : p.type === 'select' && p.options ? (
                <select
                  value={p.value as string}
                  onChange={(e) => onUpdateParam(r.uid, p.id, e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-none"
                  style={{ color: P.ink }}
                >
                  <option value="">—</option>
                  {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={p.value as string}
                  onChange={(e) => onUpdateParam(r.uid, p.id, e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-none"
                  style={{ color: P.ink, width: 64 }}
                />
              )}
              {p.unit && (
                <span style={{ color: P.inkDim, fontSize: 10 }}>{p.unit}</span>
              )}
              <button
                type="button"
                onClick={() => onRemoveParam(r.uid, p.id)}
                aria-label={`Verwijder ${p.label}`}
                style={{ color: P.inkDim, fontSize: 11, marginLeft: 2 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toggle-rij voor verborgen parameters + + parameter knop */}
      <div className="flex flex-wrap gap-1.5 mt-2 relative">
        {!r.visible.weight && (
          <button
            type="button"
            onClick={() => onToggleVisible(r.uid, 'weight')}
            className="athletic-mono athletic-tap px-2 py-1 rounded-full"
            style={{
              background: P.surfaceHi, color: P.inkMuted,
              border: `1px dashed ${P.lineStrong}`,
              fontSize: 10, letterSpacing: '0.08em', fontWeight: 800,
            }}
          >
            + GEWICHT
          </button>
        )}
        {!r.visible.pain && (
          <button
            type="button"
            onClick={() => onToggleVisible(r.uid, 'pain')}
            className="athletic-mono athletic-tap px-2 py-1 rounded-full"
            style={{
              background: P.surfaceHi, color: P.inkMuted,
              border: `1px dashed ${P.lineStrong}`,
              fontSize: 10, letterSpacing: '0.08em', fontWeight: 800,
            }}
          >
            + PIJN
          </button>
        )}
        {availableParams.length > 0 && (
          <button
            type="button"
            onClick={() => { setParamMenuOpen((v) => !v); setSupersetMenuOpen(false) }}
            className="athletic-mono athletic-tap px-2 py-1 rounded-full"
            style={{
              background: P.surfaceHi, color: P.brand,
              border: `1px dashed ${P.brand}`,
              fontSize: 10, letterSpacing: '0.08em', fontWeight: 800,
            }}
          >
            + PARAMETER
          </button>
        )}
        {paramMenuOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-10 rounded-lg p-1.5 flex flex-col gap-0.5"
            style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}`, minWidth: 180 }}
          >
            {availableParams.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { onAddParam(r.uid, p); setParamMenuOpen(false) }}
                className="athletic-mono athletic-tap text-left px-2 py-1 rounded"
                style={{ color: P.ink, fontSize: 11, letterSpacing: '0.06em' }}
              >
                + {p.label.toUpperCase()}
                {'unit' in p && p.unit && (
                  <span style={{ color: P.inkDim, marginLeft: 4 }}>{p.unit}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Tile>
  )
}

/**
 * Reps-input met inline eenheid-selector (reps · sec · min). Voor
 * isometrische oefeningen (Wall Sit, Plank, ...) klikt de therapeut "sec"
 * aan zonder dat hij naar een ander scherm hoeft — voorkomt dat hij
 * standaard reps invult voor een tijd-gemeten oefening.
 */
function RepsInput({
  unit,
  onUnitChange,
  value,
  onChange,
}: {
  unit: string
  onUnitChange: (u: string) => void
  value: string
  onChange: (v: string) => void
}) {
  const UNITS: Array<{ value: string; label: string }> = [
    { value: 'reps', label: 'REPS' },
    { value: 'sec',  label: 'SEC'  },
    { value: 'min',  label: 'MIN'  },
  ]
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5">
        {UNITS.map((u) => {
          const active = unit === u.value
          return (
            <button
              key={u.value}
              type="button"
              onClick={() => onUnitChange(u.value)}
              className="athletic-mono athletic-tap"
              style={{
                color: active ? P.bg : P.inkMuted,
                background: active ? P.brand : 'transparent',
                border: `1px solid ${active ? P.brand : P.lineStrong}`,
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 10,
                letterSpacing: '0.12em',
                fontWeight: 900,
              }}
            >
              {u.label}
            </button>
          )
        })}
      </div>
      <DarkInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        style={{ padding: '8px 10px', fontSize: 14 }}
      />
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  inputMode,
  onRemove,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'numeric' | 'decimal' | 'text'
  onRemove?: () => void
}) {
  return (
    <div className="flex flex-col gap-1" style={{ position: 'relative' }}>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Verberg ${label}`}
          className="athletic-tap athletic-mono"
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: P.surfaceHi,
            color: P.inkMuted,
            border: `1px solid ${P.lineStrong}`,
            fontSize: 10,
            lineHeight: 1,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      )}
      <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
        {label.toUpperCase()}
      </span>
      <DarkInput value={value} onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode} style={{ padding: '8px 10px', fontSize: 14 }} />
    </div>
  )
}

function AddExerciseRow({
  onAdd,
  label = '+ Oefening toevoegen',
  accent,
}: {
  onAdd: (ex: { id: string; name: string }) => void
  label?: string
  accent?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [quickAddCategory, setQuickAddCategory] = useState<string | null>(null)
  const utils = trpc.useUtils()
  const createExercise = trpc.exercises.create.useMutation({
    onSuccess: () => utils.exercises.list.invalidate(),
  })

  // Collecties voor quick-access chips
  const { data: collections = [] } = trpc.exercises.listCollections.useQuery(
    undefined,
    { enabled: open, staleTime: 60_000 },
  )

  // Cast naar shallow types; tRPC inference is te diep voor TS (TS2589).
  type ExerciseRow = { id: string; name: string; category: string }
  const searchResultsQuery = trpc.exercises.list.useQuery(
    { query: query || undefined },
    { enabled: open && !collectionId, staleTime: 30_000 },
  )
  const searchResults = (searchResultsQuery.data as ExerciseRow[] | undefined) ?? []

  const collectionExercisesQuery = trpc.exercises.getCollectionExercises.useQuery(
    { collectionId: collectionId ?? '' },
    { enabled: open && !!collectionId, staleTime: 30_000 },
  )
  const collectionExercises = (collectionExercisesQuery.data as ExerciseRow[] | undefined) ?? []

  const exercises: ExerciseRow[] = collectionId ? collectionExercises : searchResults

  const filtered = collectionId && query.trim()
    ? exercises.filter((ex) => ex.name.toLowerCase().includes(query.toLowerCase()))
    : exercises

  const close = () => {
    setOpen(false)
    setQuery('')
    setCollectionId(null)
  }

  if (!open) {
    const color = accent ?? P.brand
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="athletic-tap w-full rounded-xl py-3 flex items-center justify-center gap-2"
        style={{
          background: P.surface,
          border: `1px dashed ${accent ?? P.lineStrong}`,
          color,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <Tile>
      <div className="flex items-center justify-between gap-2 mb-2">
        <MetaLabel>
          {collectionId
            ? collections.find((c) => c.id === collectionId)?.name ?? 'Collectie'
            : 'Zoek oefening'}
        </MetaLabel>
        <button
          type="button"
          onClick={close}
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em' }}
        >
          SLUITEN
        </button>
      </div>

      {/* Collection chips voor snelle selectie */}
      {collections.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1"
          style={{ marginBottom: 8 }}
        >
          <Chip
            active={!collectionId}
            onClick={() => setCollectionId(null)}
            color={P.ink}
          >
            ALLE
          </Chip>
          {collections.map((c) => (
            <Chip
              key={c.id}
              active={collectionId === c.id}
              onClick={() => setCollectionId(c.id)}
              color={c.color}
              count={c.count}
            >
              {c.name.toUpperCase()}
            </Chip>
          ))}
        </div>
      )}

      <DarkInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          collectionId
            ? 'Filter binnen deze collectie…'
            : 'Bijv. squat, lunge, mobility…'
        }
        autoFocus
      />
      <div className="flex flex-col gap-1 mt-3 max-h-60 overflow-y-auto">
        {filtered.slice(0, 20).map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => {
              onAdd({ id: ex.id, name: ex.name })
              close()
            }}
            className="athletic-tap text-left rounded-lg px-3 py-2"
            style={{ background: P.surfaceHi }}
          >
            <span style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>{ex.name}</span>
            <span
              className="athletic-mono ml-2"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em' }}
            >
              {ex.category}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p
            style={{
              color: P.inkMuted,
              fontSize: 12,
              padding: 8,
              textAlign: 'center',
            }}
          >
            {collectionId
              ? 'Geen resultaten in deze collectie.'
              : query
                ? 'Geen resultaten. Probeer andere zoektermen.'
                : 'Typ om te zoeken of kies een collectie.'}
          </p>
        )}
      </div>

      {/* Quick-add: typ een niet-bestaande naam, voeg toe met categorie */}
      {!collectionId && query.trim().length >= 2 && (
        <div
          className="mt-3 pt-3 rounded-lg"
          style={{ borderTop: `1px dashed ${P.lineStrong}` }}
        >
          {!quickAddCategory ? (
            <button
              type="button"
              onClick={() => setQuickAddCategory('STRENGTH')}
              className="athletic-tap w-full rounded-lg py-2 flex items-center justify-center gap-2"
              style={{
                background: 'transparent',
                border: `1px dashed ${P.brand}`,
                color: P.brand,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              + Voeg &ldquo;{query.trim()}&rdquo; toe als nieuwe oefening
            </button>
          ) : (
            <div className="space-y-2">
              <MetaLabel>Categorie voor &ldquo;{query.trim()}&rdquo;</MetaLabel>
              <div className="flex flex-wrap gap-1.5">
                {(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setQuickAddCategory(cat)}
                    className="athletic-mono athletic-tap px-2.5 py-1 rounded-full"
                    style={{
                      background: quickAddCategory === cat ? P.brand : P.surfaceHi,
                      color: quickAddCategory === cat ? P.bg : P.inkMuted,
                      border: `1px solid ${quickAddCategory === cat ? P.brand : P.lineStrong}`,
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      fontWeight: 900,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="athletic-tap athletic-mono rounded-lg px-3 py-2"
                  style={{ background: P.brand, color: P.bg, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }}
                  disabled={createExercise.isPending}
                  onClick={async () => {
                    try {
                      const created = await createExercise.mutateAsync({
                        name: query.trim(),
                        category: quickAddCategory as 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY',
                        bodyRegion: [],
                        difficulty: 'BEGINNER',
                        instructions: [],
                        tips: [],
                        tags: [],
                        isPublic: false,
                        muscleLoads: {},
                        loadType: 'BODYWEIGHT',
                        isUnilateral: false,
                      })
                      onAdd({ id: created.id, name: created.name })
                      close()
                      toast.success(`Oefening "${created.name}" toegevoegd aan je bibliotheek`)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Toevoegen mislukt')
                    }
                  }}
                >
                  TOEVOEGEN
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAddCategory(null)}
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}
                >
                  ANNULEREN
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Tile>
  )
}

function Chip({
  children,
  active,
  onClick,
  color,
  count,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  color: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-tap athletic-mono flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black"
      style={{
        background: active ? color : P.surfaceHi,
        color: active ? P.bg : P.inkMuted,
        border: `1px solid ${active ? color : P.lineStrong}`,
        letterSpacing: '0.1em',
      }}
    >
      {children}
      {count !== undefined && (
        <span style={{ opacity: 0.7 }}>{count}</span>
      )}
    </button>
  )
}

type PreviousExercise = {
  id: string
  exerciseId: string
  name: string
  sets: number | null
  reps: number | null
  painLevel: number | null
  weight: number | null
  weightsPerSet: unknown
  extraParams: unknown
  supersetGroup: string | null
  painDuring: number | null
  notes: string | null
}

type PreviousSession = {
  id: string
  completedAt: Date | string | null
  durationMinutes: number | null
  programName: string | null
  therapistId: string | null
  therapistName: string | null
  painLevel: number | null
  exertionLevel: number | null
  notes: string | null
  exercises: PreviousExercise[]
}

function formatRelativeDate(input: Date | string | null): string {
  if (!input) return '—'
  const d = new Date(input)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfThat) / dayMs)
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const dateStr = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  if (dayDiff === 0) return `vandaag · ${time}`
  if (dayDiff === 1) return `gisteren · ${time}`
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} dagen geleden · ${dateStr}`
  if (diffMs < 0) return `${dateStr} · ${time}`
  return `${dateStr} · ${time}`
}

function formatWeights(weightsPerSet: unknown, fallback: number | null): string | null {
  if (Array.isArray(weightsPerSet) && weightsPerSet.length > 0) {
    const cleaned = weightsPerSet.map((w) => (typeof w === 'number' && !Number.isNaN(w) ? `${w}` : '—'))
    if (cleaned.some((c) => c !== '—')) return cleaned.join(' · ') + ' kg'
  }
  if (typeof fallback === 'number' && !Number.isNaN(fallback)) return `${fallback} kg`
  return null
}

function summarizeExtraParams(extraParams: unknown): string | null {
  if (!Array.isArray(extraParams) || extraParams.length === 0) return null
  const parts: string[] = []
  for (const p of extraParams) {
    if (!p || typeof p !== 'object') continue
    const obj = p as Record<string, unknown>
    const label = typeof obj.label === 'string' ? obj.label : null
    const value = obj.value
    if (!label || value === undefined || value === null || value === '') continue
    const unit = typeof obj.unit === 'string' ? obj.unit : ''
    parts.push(`${label} ${value}${unit ? ' ' + unit : ''}`)
  }
  return parts.length ? parts.join(' · ') : null
}

function PreviousSessionPanel({
  session,
  patientId,
  open,
  onToggle,
}: {
  session: PreviousSession
  patientId: string
  open: boolean
  onToggle: () => void
}) {
  const dateLabel = formatRelativeDate(session.completedAt)
  const exerciseCount = session.exercises.length
  // null = legacy log van vóór de therapist-tracking feature; gelijk aan
  // patientId = patient logde zelf via patient-app.
  const performer = session.therapistId === null
    ? '—'
    : session.therapistId === patientId
      ? 'Patiënt zelf'
      : session.therapistName ?? 'Onbekend'

  return (
    <Tile accentBar={P.brand}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 athletic-tap"
        aria-expanded={open}
      >
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          <MetaLabel style={{ color: P.brand }}>VORIGE BEHANDELING</MetaLabel>
          <span
            className="athletic-mono"
            style={{ color: P.ink, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}
          >
            {dateLabel}
          </span>
          <span
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em' }}
          >
            {exerciseCount} oef.
            {session.durationMinutes ? ` · ${session.durationMinutes}m` : ''}
            {session.programName ? ` · ${session.programName}` : ''}
            {` · door ${performer}`}
          </span>
        </div>
        <span
          aria-hidden
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {(session.painLevel !== null || session.exertionLevel !== null) && (
            <div className="flex gap-2 flex-wrap">
              {session.painLevel !== null && (
                <span
                  className="athletic-mono px-2 py-1 rounded"
                  style={{
                    background: 'rgba(248,113,113,0.10)',
                    color: P.danger,
                    border: `1px solid rgba(248,113,113,0.30)`,
                    fontSize: 10, letterSpacing: '0.08em', fontWeight: 800,
                  }}
                >
                  PIJN {session.painLevel}/10
                </span>
              )}
              {session.exertionLevel !== null && (
                <span
                  className="athletic-mono px-2 py-1 rounded"
                  style={{
                    background: 'rgba(244,194,97,0.10)',
                    color: P.gold,
                    border: `1px solid rgba(244,194,97,0.30)`,
                    fontSize: 10, letterSpacing: '0.08em', fontWeight: 800,
                  }}
                >
                  RPE {session.exertionLevel}/10
                </span>
              )}
            </div>
          )}

          {exerciseCount === 0 ? (
            <p style={{ color: P.inkMuted, fontSize: 12 }}>Geen oefeningen gelogd.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {session.exercises.map((ex) => {
                const weights = formatWeights(ex.weightsPerSet, ex.weight)
                const extras = summarizeExtraParams(ex.extraParams)
                return (
                  <li
                    key={ex.id}
                    className="rounded-lg px-2.5 py-2"
                    style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
                        {ex.supersetGroup && (
                          <span
                            className="athletic-mono"
                            style={{
                              color: SUPERSET_COLORS[ex.supersetGroup]?.text ?? P.ink,
                              fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', marginRight: 6,
                            }}
                          >
                            {ex.supersetGroup}
                          </span>
                        )}
                        {ex.name}
                      </span>
                      <span
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
                      >
                        {ex.sets ?? '—'} × {ex.reps ?? '—'}
                      </span>
                    </div>
                    {(weights || extras || ex.painDuring !== null || ex.notes) && (
                      <div
                        className="athletic-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5"
                        style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.04em' }}
                      >
                        {weights && <span>{weights}</span>}
                        {extras && <span>{extras}</span>}
                        {ex.painDuring !== null && (
                          <span style={{ color: P.danger }}>Pijn {ex.painDuring}/10</span>
                        )}
                        {ex.notes && (
                          <span style={{ color: P.inkMuted, textTransform: 'none', fontStyle: 'italic' }}>
                            “{ex.notes}”
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {session.notes && (
            <div
              className="rounded-lg px-2.5 py-2"
              style={{ background: P.surfaceHi, border: `1px dashed ${P.lineStrong}` }}
            >
              <MetaLabel>Notities</MetaLabel>
              <p style={{ color: P.ink, fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>
                {session.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </Tile>
  )
}

function ScalePicker({
  value,
  onChange,
  colorHigh,
}: {
  value: number | null
  onChange: (v: number) => void
  colorHigh: string
}) {
  return (
    <div className="grid grid-cols-11 gap-1 mt-2">
      {Array.from({ length: 11 }, (_, n) => {
        const active = value === n
        const color = n >= 7 ? colorHigh : n >= 4 ? P.gold : P.lime
        return (
          <button key={n} type="button" onClick={() => onChange(n)}
            className="athletic-tap athletic-mono aspect-square rounded flex items-center justify-center"
            style={{
              background: active ? color : P.surfaceHi,
              color: active ? P.bg : P.inkMuted,
              border: active ? `1px solid ${color}` : `1px solid ${P.lineStrong}`,
              fontSize: 12, fontWeight: 900,
            }}>
            {n}
          </button>
        )
      })}
    </div>
  )
}
