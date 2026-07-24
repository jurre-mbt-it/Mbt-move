'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { useCustomParams } from '@/hooks/useCustomParams'
import { useAutosave, loadDraft } from '@/hooks/useAutosave'
import { IconWarning } from '@/components/icons'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent, type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

import { ExerciseLibraryPanel } from './ExerciseLibraryPanel'
import { ProgramExerciseBlock } from './ProgramExerciseBlock'
import { SupersetGroupBlock } from './SupersetGroupBlock'
import { MuscleBalancePanel } from './MuscleBalancePanel'
import { IncompletePracticeBanner } from '@/components/practice/IncompletePracticeBanner'
import type { BuilderExercise, BuilderResource, ProgramState } from './types'
import { SUPERSET_LETTERS, DAY_LABELS } from '@/lib/program-constants'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

import {
  Eye, Copy, Plus, Trash2, Rocket, Check, AlertCircle, Loader2,
  ChevronLeft, Layers, Search, CheckCircle2, X, BarChart2, Info,
  User, ChevronDown, ChevronsUpDown, ChevronsDownUp,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

// ─── Drop zone for a single day column ────────────────────────────────────────
function DayDropZone({
  day, week, children, isEmpty,
}: { day: number; week: number; children: React.ReactNode; isEmpty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${week}-${day}`,
    data: { type: 'day-column', day, week },
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-24 rounded-xl p-2 transition-colors',
        isOver ? 'bg-[#e87a5510] border-2 border-dashed border-[#E87A55]' : 'border-2 border-dashed border-transparent',
        isEmpty && !isOver && 'border-[rgba(212,232,230,0.12)] border-dashed'
      )}
    >
      {isEmpty && !isOver && (
        <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted-foreground">
          <Plus className="w-5 h-5 mb-1 opacity-30" />
          Sleep of klik + om toe te voegen
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Drag overlay mini-card ────────────────────────────────────────────────────
function DragOverlayCard({ name }: { name: string }) {
  return (
    <div className="bg-[#15363A] border rounded-lg shadow-xl px-3 py-2 text-sm font-semibold flex items-center gap-2 opacity-95">
      <div className="w-2 h-2 rounded-full bg-[#E87A55]" />
      {name}
    </div>
  )
}

// ─── Main ProgramBuilder ───────────────────────────────────────────────────────
type ProgramStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'

interface ProgramBuilderProps {
  initialState?: Partial<ProgramState> & { exercises?: BuilderExercise[] }
  programId?: string
  initialStatus?: ProgramStatus
  /** Quick-add: id van een oefening die direct na laden van de bibliotheek aan
   *  het programma wordt toegevoegd (wordt door /programs/new uit query gelezen). */
  initialAddExerciseId?: string
  /** Waar de terug-pijl in de top-bar naartoe gaat. Default is de
   *  therapeut-programmalijst; de athlete-pagina geeft hier het eigen
   *  dashboard mee. */
  backHref?: string
}

export function ProgramBuilder({ initialState, programId, initialStatus, initialAddExerciseId, backHref = '/therapist/programs' }: ProgramBuilderProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Na opslaan doorsturen naar een oorspronkelijke pagina (bv week-planner).
  // Alleen single-leading-slash paden — //evil.tld is protocol-relatief en
  // zou een open redirect zijn.
  const rawReturnTo = searchParams?.get('returnTo') ?? null
  const returnTo = rawReturnTo && /^\/[^/\\]/.test(rawReturnTo) ? rawReturnTo : null

  const [program, setProgram] = useState<ProgramState>(() => ({
    name: initialState?.name ?? '',
    description: initialState?.description ?? '',
    patientId: initialState?.patientId ?? null,
    weeks: initialState?.weeks ?? 1,
    daysPerWeek: initialState?.daysPerWeek ?? 3,
    currentWeek: 1,
    currentDay: 1,
    isTemplate: initialState?.isTemplate ?? false,
    tendinopathyMode: (initialState as Partial<ProgramState> | undefined)?.tendinopathyMode ?? false,
    trackOneRepMax: (initialState as Partial<ProgramState> | undefined)?.trackOneRepMax ?? false,
    dailyTarget: (initialState as Partial<ProgramState> | undefined)?.dailyTarget ?? null,
    flexibleSchedule: (initialState as Partial<ProgramState> | undefined)?.flexibleSchedule ?? false,
    weeklyTarget: (initialState as Partial<ProgramState> | undefined)?.weeklyTarget ?? null,
    reviewAfterWeeks: (initialState as Partial<ProgramState> | undefined)?.reviewAfterWeeks ?? null,
    exercises: initialState?.exercises ?? [],
    resources: (initialState as Partial<ProgramState> | undefined)?.resources ?? [],
  }))
  // Houdt bij of de gebruiker zelf de naam heeft aangeraakt. Zo niet, mag de
  // auto-suggestie de naam blijven bijwerken als patient/oefeningen wijzigen.
  // Bestaande programma's met een naam → meteen "user-edited" zodat we 'm
  // nooit overschrijven.
  const [nameUserEdited, setNameUserEdited] = useState<boolean>(() => {
    const n = (initialState?.name ?? '').trim()
    return n.length > 0 && n !== 'Nieuw programma'
  })
  const [exercises, setExercises] = useState<BuilderExercise[]>(
    initialState?.exercises ?? []
  )
  // Educatie-blokken ("Leer") — parallel aan exercises, per dag/week.
  const [resources, setResources] = useState<BuilderResource[]>(
    (initialState as Partial<ProgramState> | undefined)?.resources ?? []
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  // Import-from-template (laad een bestaande template in dit programma)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importQuery, setImportQuery] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false)
  const [mobileBalanceOpen, setMobileBalanceOpen] = useState(false)
  const [mobileSelected, setMobileSelected] = useState<Set<string>>(new Set())
  const [mobileQuery, setMobileQuery] = useState('')
  const [mobileCategory, setMobileCategory] = useState<string | null>(null)

  // Houdt het programma-id bij dat we momenteel bewerken. Bij een nieuw
  // programma wordt dit gevuld zodra autosave het record heeft aangemaakt.
  const [currentProgramId, setCurrentProgramId] = useState<string | undefined>(programId)
  // Live status (CONCEPT/LIVE) zodat de header laat zien of de patient 'm
  // al kan zien. Nieuwe programma's beginnen als DRAFT.
  const [currentStatus, setCurrentStatus] = useState<ProgramStatus>(initialStatus ?? 'DRAFT')

  // ── Deploy dialog state ───────────────────────────────────────────────────
  const [deployDialogOpen, setDeployDialogOpen] = useState(false)
  const [deployPatientId, setDeployPatientId] = useState<string | null>(null)
  const [deployPatientSearch, setDeployPatientSearch] = useState('')
  const [deployInstructions, setDeployInstructions] = useState('')
  const [deployBusy, setDeployBusy] = useState(false)
  /** Bij eerste deploy: optioneel ook als sjabloon in de bibliotheek bewaren
   *  zodat de therapeut 'm later opnieuw kan toepassen op een andere patient.
   *  Default false: patient-programma's blijven alleen bij die patient zichtbaar. */
  const [deploySaveAsTemplate, setDeploySaveAsTemplate] = useState(false)
  /** Bij update van een al-ACTIVE programma: kiezen of de patient een mail
   *  krijgt of dat we alleen opslaan. Default true: meestal wil je informeren
   *  bij een bewuste update. */
  const [deploySendEmail, setDeploySendEmail] = useState(true)

  const { params: customParams } = useCustomParams()
  const utils = trpc.useUtils()
  const createProgram = trpc.programs.create.useMutation()
  const saveProgram = trpc.programs.save.useMutation()
  const duplicateProgram = trpc.programs.duplicate.useMutation()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: importTemplates = [] } = (trpc.programs.list.useQuery as any)(
    { isTemplate: true },
    { enabled: importDialogOpen, staleTime: 30_000 },
  ) as { data: Array<{ id: string; name: string; weeks: number; daysPerWeek: number; _count: { exercises: number } }> }
  // Patiënten van deze therapeut — voor pill in header en deploy-picker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: patientsRaw = [] } = (trpc.patients.list.useQuery as any)(undefined, { staleTime: 60_000 }) as { data: Array<{
    id: string
    name: string | null
    email: string | null
    avatarUrl: string | null
  }> }
  // Therapeut/admin kan ook een schema voor zichzelf bouwen (persoonlijke
  // training). De eigen User zit niet in patients.list (gefilterd op
  // PATIENT/ATHLETE), dus prependen we een synthetische "mezelf"-entry zodat
  // de picker een naam toont en currentPatient/deploy correct resolven.
  const { data: me } = trpc.auth.getMe.useQuery()
  const patientsList = useMemo(() => {
    if (!me || (me.role !== 'THERAPIST' && me.role !== 'ADMIN')) return patientsRaw
    const self = {
      id: me.id,
      name: me.name ? `${me.name} (mezelf)` : 'Mezelf (eigen training)',
      email: me.email ?? null,
      avatarUrl: me.avatarUrl ?? null,
    }
    return [self, ...patientsRaw.filter(p => p.id !== me.id)]
  }, [me, patientsRaw])
  const currentPatient = patientsList.find(p => p.id === program.patientId) ?? null
  const currentPatientFirstName = currentPatient?.name?.trim().split(/\s+/)[0] ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: libraryExercises = [] } = (trpc.exercises.list.useQuery as any)(undefined, { staleTime: 60_000 }) as { data: Array<{
    id: string
    name: string
    category: string
    difficulty: string
    videoUrl: string | null
    easierVariantId: string | null
    harderVariantId: string | null
    muscleLoads: Record<string, number>
    trackOneRepMax?: boolean
    defaultExtraParams?: unknown
    bodyRegion?: string[]
  }> }
  const saving = createProgram.isPending || saveProgram.isPending

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // ── Derived ─────────────────────────────────────────────────────────────────
  // In flexibele-week-modus heeft "dag van de week" geen betekenis — patient
  // doet het programma 'n vrij aantal keer per week. Daarom pool alle oefeningen
  // van de huidige week samen (i.p.v. filteren op currentDay).
  const dayExercises = useMemo(() =>
    exercises
      .filter(e =>
        e.week === program.currentWeek
        && (program.flexibleSchedule ? true : e.day === program.currentDay)
      )
      .sort((a, b) => {
        if (a.supersetGroup && a.supersetGroup === b.supersetGroup) return a.supersetOrder - b.supersetOrder
        return 0
      }),
    [exercises, program.currentDay, program.currentWeek, program.flexibleSchedule]
  )

  // Educatie-blokken voor de huidige dag/week (zelfde pool-logica als oefeningen).
  const dayResources = useMemo(() =>
    resources.filter(r =>
      r.week === program.currentWeek
      && (program.flexibleSchedule ? true : r.day === program.currentDay)
    ),
    [resources, program.currentDay, program.currentWeek, program.flexibleSchedule]
  )

  const selectedUids = exercises.filter(e => e.selected).map(e => e.uid)

  const supersetGroups = useMemo(() => {
    const groups: Record<string, BuilderExercise[]> = {}
    for (const ex of dayExercises) {
      if (ex.supersetGroup) {
        groups[ex.supersetGroup] = groups[ex.supersetGroup] ?? []
        groups[ex.supersetGroup].push(ex)
      }
    }
    return groups
  }, [dayExercises])

  // Exercises not in any superset (shown individually)
  const freeExercises = dayExercises.filter(e => !e.supersetGroup)

  // All items in render order: superset groups + free exercises
  const orderedItems = useMemo(() => {
    const seen = new Set<string>()
    const result: Array<{ type: 'superset'; group: string } | { type: 'free'; ex: BuilderExercise }> = []
    for (const ex of dayExercises) {
      if (ex.supersetGroup) {
        if (!seen.has(ex.supersetGroup)) {
          seen.add(ex.supersetGroup)
          result.push({ type: 'superset', group: ex.supersetGroup })
        }
      } else {
        result.push({ type: 'free', ex })
      }
    }
    return result
  }, [dayExercises])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const updateEx = useCallback((uid: string, patch: Partial<BuilderExercise>) => {
    setExercises(prev => {
      // Wijzigingen aan extraParams syncen we naar alle andere instances van
      // dezelfde oefening in het programma — anders wijken de parameters
      // tussen w1/w2/w3 etc. uit elkaar zonder dat de gebruiker dat verwacht.
      if (patch.extraParams !== undefined) {
        const target = prev.find(e => e.uid === uid)
        if (target) {
          return prev.map(e =>
            e.exerciseId === target.exerciseId
              ? { ...e, ...patch }
              : e
          )
        }
      }
      return prev.map(e => e.uid === uid ? { ...e, ...patch } : e)
    })
  }, [])

  const removeEx = useCallback((uid: string) => {
    setExercises(prev => prev.filter(e => e.uid !== uid))
  }, [])

  // ── Educatie-blokken ("Leer") ───────────────────────────────────────────────
  const addResourceFromLibrary = useCallback((r: {
    id: string; title: string; format: 'VIDEO' | 'PDF';
    videoUrl?: string | null; thumbnailUrl?: string | null;
  }) => {
    const newRes: BuilderResource = {
      uid: `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      resourceId: r.id,
      title: r.title,
      format: r.format,
      videoUrl: r.videoUrl ?? null,
      thumbnailUrl: r.thumbnailUrl ?? null,
      day: program.currentDay,
      week: program.currentWeek,
    }
    setResources(prev => [...prev, newRes])
  }, [program.currentDay, program.currentWeek])

  const removeResource = useCallback((uid: string) => {
    setResources(prev => prev.filter(r => r.uid !== uid))
  }, [])

  const toggleSelect = useCallback((uid: string) => {
    setExercises(prev => prev.map(e => e.uid === uid ? { ...e, selected: !e.selected } : e))
  }, [])

  const swapVariant = useCallback((uid: string, direction: 'easier' | 'harder') => {
    setExercises(prev => prev.map(e => {
      if (e.uid !== uid) return e
      const targetId = direction === 'easier' ? e.easierVariantId : e.harderVariantId
      if (!targetId) return e
      const source = libraryExercises
      const target = source.find((le: { id: string }) => le.id === targetId) as typeof libraryExercises[number] | undefined
      if (!target) { toast.error('Variant niet gevonden in bibliotheek'); return e }
      toast.success(`Gewisseld naar: ${target.name}`)
      return {
        ...e,
        exerciseId: target.id,
        name: target.name,
        category: target.category as string,
        difficulty: target.difficulty as string,
        muscleLoads: target.muscleLoads as unknown as Record<string, number>,
        videoUrl: target.videoUrl,
        easierVariantId: (target as { easierVariantId?: string | null }).easierVariantId ?? null,
        harderVariantId: (target as { harderVariantId?: string | null }).harderVariantId ?? null,
      }
    }))
  }, [libraryExercises])

  const addFromLibrary = useCallback((ex: {
    id: string; name: string; category: string; difficulty: string;
    muscleLoads: unknown; videoUrl?: string | null;
    easierVariantId?: string | null; harderVariantId?: string | null;
    trackOneRepMax?: boolean;
    defaultExtraParams?: unknown;
    defaultRepUnit?: string;
  }) => {
    const inheritedParams = (Array.isArray(ex.defaultExtraParams) ? ex.defaultExtraParams : [])
      .map((p, i) => ({
        ...(p as object),
        id: `p-${Date.now()}-${i}`, // nieuwe instance-id zodat update-by-id niet kruist met andere exercises
      })) as BuilderExercise['extraParams']
    const inheritedRepUnit = (ex.defaultRepUnit === 'sec' || ex.defaultRepUnit === 'sec/zijde' || ex.defaultRepUnit === 'min')
      ? ex.defaultRepUnit
      : 'reps'
    const inheritedReps = inheritedRepUnit.startsWith('sec') ? 30 : 10
    const newEx: BuilderExercise = {
      uid: `uid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      exerciseId: ex.id,
      name: ex.name,
      category: ex.category,
      difficulty: ex.difficulty,
      muscleLoads: ex.muscleLoads as unknown as Record<string, number>,
      easierVariantId: null,
      harderVariantId: null,
      videoUrl: ex.videoUrl,
      sets: 3,
      setsMax: null,
      reps: inheritedReps,
      repsMax: null,
      repUnit: inheritedRepUnit,
      rest: 60,
      extraParams: inheritedParams,
      notes: null,
      intensityType: 'NONE',
      intensityMin: null,
      intensityMax: null,
      intensityText: null,
      supersetGroup: null,
      supersetOrder: 0,
      selected: false,
      trackOneRepMax: ex.trackOneRepMax ?? false,
      day: program.currentDay,
      week: program.currentWeek,
    }
    setExercises(prev => [...prev, newEx])
    // Vers toegevoegde oefening meteen open — daar ga je nu doseren.
    setExpandedUids(prev => new Set(prev).add(newEx.uid))
  }, [program.currentDay, program.currentWeek])

  // Create superset from selected exercises
  const createSuperset = () => {
    if (selectedUids.length < 2) return
    const usedLetters = new Set(exercises.map(e => e.supersetGroup).filter(Boolean))
    const letter = SUPERSET_LETTERS.find(l => !usedLetters.has(l)) ?? 'A'
    setExercises(prev => prev.map((e, idx) =>
      selectedUids.includes(e.uid)
        ? { ...e, supersetGroup: letter, supersetOrder: selectedUids.indexOf(e.uid), selected: false }
        : e
    ))
    toast.success(`Superset ${letter} aangemaakt`)
  }

  const dissolveSuperset = (group: string) => {
    setExercises(prev => prev.map(e =>
      e.supersetGroup === group ? { ...e, supersetGroup: null, supersetOrder: 0 } : e
    ))
  }

  const clearSelection = () => setExercises(prev => prev.map(e => ({ ...e, selected: false })))

  // ── Kaart uitklappen/inklappen ─────────────────────────────────────────────
  // Ingeklapt = één samengevatte doseerregel; alleen de kaarten waar je aan
  // werkt staan open. Nieuw toegevoegde oefeningen klappen automatisch uit.
  const [expandedUids, setExpandedUids] = useState<Set<string>>(new Set())
  const toggleExpanded = useCallback((uid: string) => {
    setExpandedUids(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }, [])
  const dayUids = dayExercises.map(e => e.uid)
  const allDayExpanded = dayUids.length > 0 && dayUids.every(uid => expandedUids.has(uid))
  const toggleExpandAllForDay = () => {
    setExpandedUids(prev => {
      const next = new Set(prev)
      if (allDayExpanded) dayUids.forEach(uid => next.delete(uid))
      else dayUids.forEach(uid => next.add(uid))
      return next
    })
  }

  // ── Week verwijderen ────────────────────────────────────────────────────────
  // Verwijdert de inhoud van week `w` en schuift alle latere weken één plek
  // naar voren, zodat er geen gat in de nummering valt.
  const removeWeek = (w: number) => {
    if (program.weeks <= 1) return
    const inWeek = exercises.filter(e => e.week === w).length
      + resources.filter(r => r.week === w).length
    if (inWeek > 0) {
      const ok = confirm(`Week ${w} bevat ${inWeek} item(s). Week en inhoud verwijderen?`)
      if (!ok) return
    }
    setExercises(prev => prev
      .filter(e => e.week !== w)
      .map(e => e.week > w ? { ...e, week: e.week - 1 } : e))
    setResources(prev => prev
      .filter(r => r.week !== w)
      .map(r => r.week > w ? { ...r, week: r.week - 1 } : r))
    setProgram(p => ({
      ...p,
      weeks: p.weeks - 1,
      currentWeek: Math.min(p.currentWeek > w ? p.currentWeek - 1 : p.currentWeek, p.weeks - 1),
    }))
    toast.success(`Week ${w} verwijderd`)
  }

  // ── Bulk-kopie: dag → dag / week → week ───────────────────────────────────
  const copyDayTo = (toWeek: number, toDay: number) => {
    const fromWeek = program.currentWeek
    const fromDay = program.currentDay
    if (fromWeek === toWeek && fromDay === toDay) return

    const source = exercises.filter(e => e.week === fromWeek && e.day === fromDay)
    if (source.length === 0) {
      toast.error('Deze dag heeft geen oefeningen om te kopiëren')
      return
    }
    const existing = exercises.filter(e => e.week === toWeek && e.day === toDay)
    if (existing.length > 0) {
      const ok = confirm(
        `W${toWeek} D${toDay} heeft al ${existing.length} oefening(en). Overschrijven?`
      )
      if (!ok) return
    }

    const now = Date.now()
    const clones: BuilderExercise[] = source.map((e, idx) => ({
      ...e,
      uid: `uid-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      week: toWeek,
      day: toDay,
      selected: false,
    }))

    setExercises(prev => [
      ...prev.filter(e => !(e.week === toWeek && e.day === toDay)),
      ...clones,
    ])
    toast.success(
      `${source.length} oefening(en) gekopieerd naar W${toWeek} D${toDay}`
    )
  }

  const copyWeekTo = (toWeek: number) => {
    const fromWeek = program.currentWeek
    if (fromWeek === toWeek) return
    const source = exercises.filter(e => e.week === fromWeek)
    if (source.length === 0) {
      toast.error('Deze week heeft geen oefeningen om te kopiëren')
      return
    }
    const existing = exercises.filter(e => e.week === toWeek)
    if (existing.length > 0) {
      const ok = confirm(
        `Week ${toWeek} heeft al ${existing.length} oefening(en). Overschrijven?`
      )
      if (!ok) return
    }
    const now = Date.now()
    const clones: BuilderExercise[] = source.map((e, idx) => ({
      ...e,
      uid: `uid-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      week: toWeek,
      selected: false,
    }))
    setExercises(prev => [
      ...prev.filter(e => e.week !== toWeek),
      ...clones,
    ])
    toast.success(`Week ${fromWeek} gekopieerd naar Week ${toWeek}`)
  }

  // ── dnd-kit handlers ─────────────────────────────────────────────────────────
  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return

    const activeData = active.data.current
    const overData = over.data.current

    // Library item dropped anywhere in the canvas (day column or on top of an existing exercise)
    if (activeData?.type === 'library-exercise') {
      const ex = activeData.exercise as { id: string; name: string; category: string; difficulty: string; muscleLoads: unknown; videoUrl?: string | null }
      // Resolve target day/week: prefer explicit day-column data, fall back to current view
      const targetDay = overData?.type === 'day-column' ? overData.day : program.currentDay
      const targetWeek = overData?.type === 'day-column' ? overData.week : program.currentWeek
      const exWithDefaults = ex as typeof ex & { trackOneRepMax?: boolean; defaultExtraParams?: unknown; defaultRepUnit?: string }
      const inheritedParams = (Array.isArray(exWithDefaults.defaultExtraParams) ? exWithDefaults.defaultExtraParams : [])
        .map((p, i) => ({
          ...(p as object),
          id: `p-${Date.now()}-${i}`,
        })) as BuilderExercise['extraParams']
      const inheritedRepUnit = (exWithDefaults.defaultRepUnit === 'sec' || exWithDefaults.defaultRepUnit === 'sec/zijde' || exWithDefaults.defaultRepUnit === 'min')
        ? exWithDefaults.defaultRepUnit
        : 'reps'
      // Voor seconden-oefeningen (plank/wall sit/etc) wil je niet een
      // standaard van 10 reps; zet een zinvolle hold-duur als startwaarde.
      const inheritedReps = inheritedRepUnit.startsWith('sec') ? 30 : 10
      const newEx: BuilderExercise = {
        uid: `uid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        exerciseId: ex.id,
        name: ex.name,
        category: ex.category,
        difficulty: ex.difficulty,
        muscleLoads: ex.muscleLoads as unknown as Record<string, number>,
        easierVariantId: null,
        harderVariantId: null,
        videoUrl: ex.videoUrl,
        sets: 3, setsMax: null, reps: inheritedReps, repsMax: null, repUnit: inheritedRepUnit, rest: 60,
        extraParams: inheritedParams, notes: null, intensityType: 'NONE', intensityMin: null, intensityMax: null, intensityText: null, supersetGroup: null, supersetOrder: 0, selected: false,
        trackOneRepMax: exWithDefaults.trackOneRepMax ?? false,
        day: targetDay, week: targetWeek,
      }
      setExercises(prev => [...prev, newEx])
      return
    }

    // Reorder within canvas — verplaats in de hoofd-array zodat de render-
    // volgorde (dayExercises is derived) meteen mee-schuift.
    if (activeData?.type === 'canvas-exercise' && active.id !== over.id) {
      setExercises(prev => {
        const oldIdx = prev.findIndex(e => e.uid === active.id)
        const newIdx = prev.findIndex(e => e.uid === over.id)
        if (oldIdx === -1 || newIdx === -1) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const draftKey = useMemo(() => `mbt-program-draft-${programId ?? 'new'}`, [programId])

  // Restore localStorage draft once on mount (only for the matching draftKey).
  // Drafts represent the user's most recent unsaved edits, so they take
  // precedence over the server snapshot in initialState.
  useEffect(() => {
    const draft = loadDraft<{
      program: Partial<ProgramState>
      exercises: BuilderExercise[]
    }>(draftKey)
    if (!draft) return
    setProgram(p => ({ ...p, ...draft.program }))
    setExercises(draft.exercises ?? [])
    // Concepten van de gebruiker hebben hun eigen naam — niet overschrijven
    // met de auto-suggestie.
    if (draft.program?.name && draft.program.name.trim().length > 0) {
      setNameUserEdited(true)
    }
    toast.info('Concept hersteld', { duration: 2000 })
    // We intentionally only run this once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only the fields the server cares about — used as the autosave value.
  type AutosaveValue = {
    program: {
      name: string
      description: string | null | undefined
      patientId: string | null | undefined
      weeks: number
      daysPerWeek: number
      isTemplate: boolean
      tendinopathyMode: boolean
      trackOneRepMax: boolean
      dailyTarget: number | null
      flexibleSchedule: boolean
      weeklyTarget: number | null
      reviewAfterWeeks: number | null
    }
    exercises: BuilderExercise[]
    resources: BuilderResource[]
  }
  const formValue: AutosaveValue = useMemo(() => ({
    program: {
      name: program.name,
      description: program.description,
      patientId: program.patientId,
      weeks: program.weeks,
      daysPerWeek: program.daysPerWeek,
      isTemplate: program.isTemplate,
      tendinopathyMode: program.tendinopathyMode,
      trackOneRepMax: program.trackOneRepMax,
      dailyTarget: program.tendinopathyMode ? (program.dailyTarget ?? null) : null,
      flexibleSchedule: program.flexibleSchedule ?? false,
      weeklyTarget: program.weeklyTarget ?? null,
      reviewAfterWeeks: program.reviewAfterWeeks ?? null,
    },
    exercises,
    resources,
  }), [program, exercises, resources])

  // ── Quick-add via URL: één-malig de gevraagde oefening toevoegen zodra
  // de bibliotheek geladen is.
  const quickAddDoneRef = useRef(false)
  useEffect(() => {
    if (!initialAddExerciseId || quickAddDoneRef.current) return
    if (libraryExercises.length === 0) return
    const ex = libraryExercises.find(l => l.id === initialAddExerciseId)
    if (!ex) {
      quickAddDoneRef.current = true
      toast.error('Oefening niet gevonden in bibliotheek')
      return
    }
    quickAddDoneRef.current = true
    addFromLibrary(ex)
    toast.success(`"${ex.name}" toegevoegd`)
  }, [initialAddExerciseId, libraryExercises, addFromLibrary])

  // ── Smart name suggestion ──────────────────────────────────────────────────
  // Dominante body-region uit de gesleepte oefeningen. FULL_BODY tellen we
  // niet mee — dat geeft geen sturende suffix.
  const REGION_LABELS_NL: Record<string, string> = {
    KNEE: 'Knie', SHOULDER: 'Schouder', BACK: 'Rug', ANKLE: 'Enkel',
    HIP: 'Heup', CERVICAL: 'Cervicaal', THORACIC: 'Thoracaal', LUMBAR: 'Lumbaal',
    ELBOW: 'Elleboog', WRIST: 'Pols', FOOT: 'Voet',
  }
  const dominantRegion = useMemo(() => {
    if (exercises.length === 0) return null
    const libMap = new Map(libraryExercises.map(l => [l.id, l]))
    const counts: Record<string, number> = {}
    for (const ex of exercises) {
      const lib = libMap.get(ex.exerciseId)
      const regions = (lib?.bodyRegion ?? []) as string[]
      for (const r of regions) {
        if (r === 'FULL_BODY') continue
        counts[r] = (counts[r] ?? 0) + 1
      }
    }
    let best: string | null = null
    let bestCount = 0
    for (const [r, c] of Object.entries(counts)) {
      if (c > bestCount) { best = r; bestCount = c }
    }
    return best
  }, [exercises, libraryExercises])

  // Auto-suggestie: vult de naam zolang de gebruiker 'm zelf nog niet heeft
  // bewerkt. Zodra ze typen blijft de naam staan zoals zij 'm willen.
  useEffect(() => {
    if (nameUserEdited) return
    let suggested = ''
    if (currentPatient?.name) {
      const first = currentPatient.name.trim().split(/\s+/)[0]
      suggested = `Revalidatieprogramma ${first}`
    } else if (program.isTemplate) {
      suggested = 'Sjabloon'
    }
    if (dominantRegion && REGION_LABELS_NL[dominantRegion]) {
      const label = REGION_LABELS_NL[dominantRegion]
      suggested = suggested ? `${suggested} – ${label}` : label
    }
    if (suggested && suggested !== program.name) {
      setProgram(p => ({ ...p, name: suggested }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameUserEdited, currentPatient, dominantRegion, program.isTemplate])

  // No useCallback: tRPC mutation refs in the dep array trigger
  // "excessively deep type instantiation". The autosave hook stores the
  // latest onSave via a ref, so a fresh function each render is fine.
  const persist = async (val: AutosaveValue) => {
    // Geen lege naam-saves: server eist min(1) en we willen geen naamloze
    // DRAFT records aanmaken. Zodra de gebruiker de naam invult of de auto-
    // suggestie 'm vult, wordt deze save automatisch opnieuw getriggerd.
    if (!val.program.name.trim()) return
    const exercisePayload = val.exercises.map((ex, i) => ({
      exerciseId: ex.exerciseId,
      week: ex.week,
      day: ex.day,
      order: i,
      sets: ex.sets,
      setsMax: ex.setsMax ?? null,
      reps: ex.reps,
      repsMax: ex.repsMax ?? null,
      repUnit: ex.repUnit,
      restTime: ex.rest,
      supersetGroup: ex.supersetGroup ?? null,
      supersetOrder: ex.supersetOrder,
      notes: ex.notes?.trim() ? ex.notes : null,
      intensityType: ex.intensityType ?? 'NONE',
      intensityMin: ex.intensityMin ?? null,
      intensityMax: ex.intensityMax ?? null,
      intensityText: ex.intensityText?.trim() ? ex.intensityText : null,
      extraParams: ex.extraParams && ex.extraParams.length > 0 ? ex.extraParams : null,
    }))
    const resourcePayload = val.resources.map((r, i) => ({
      resourceId: r.resourceId,
      week: r.week,
      day: r.day,
      order: i,
    }))
    // Bibliotheek-save mag geen patientId houden, anders staat een template
    // gekoppeld aan een patiënt in de lijst.
    const patientIdForSave = val.program.isTemplate ? null : val.program.patientId || undefined
    if (currentProgramId) {
      await saveProgram.mutateAsync({
        id: currentProgramId,
        name: val.program.name,
        description: val.program.description ?? undefined,
        weeks: val.program.weeks,
        daysPerWeek: val.program.daysPerWeek,
        isTemplate: val.program.isTemplate,
        patientId: patientIdForSave,
        flexibleSchedule: val.program.flexibleSchedule,
        weeklyTarget: val.program.flexibleSchedule ? val.program.weeklyTarget : null,
        reviewAfterWeeks: val.program.reviewAfterWeeks,
        tendinopathyMode: val.program.tendinopathyMode,
        trackOneRepMax: val.program.trackOneRepMax,
        dailyTarget: val.program.tendinopathyMode ? val.program.dailyTarget : null,
        exercises: exercisePayload,
        resources: resourcePayload,
      })
    } else {
      const created = await createProgram.mutateAsync({
        name: val.program.name,
        description: val.program.description ?? undefined,
        weeks: val.program.weeks,
        daysPerWeek: val.program.daysPerWeek,
        isTemplate: val.program.isTemplate,
        patientId: patientIdForSave ?? undefined,
        flexibleSchedule: val.program.flexibleSchedule,
        weeklyTarget: val.program.flexibleSchedule ? val.program.weeklyTarget : null,
        reviewAfterWeeks: val.program.reviewAfterWeeks,
        tendinopathyMode: val.program.tendinopathyMode,
        trackOneRepMax: val.program.trackOneRepMax,
        dailyTarget: val.program.tendinopathyMode ? val.program.dailyTarget : null,
      })
      if (val.exercises.length > 0 || val.resources.length > 0) {
        await saveProgram.mutateAsync({
          id: created.id,
          exercises: exercisePayload,
          resources: resourcePayload,
        })
      }
      setCurrentProgramId(created.id)
      // URL stil naar /edit/{id} zetten zonder route-navigatie: geen
      // Suspense/AppLoader-flash en geen remount. PageTransition mapt
      // /programs/new en /programs/{id}/edit op één stabiele key, dus de
      // subtree (incl. net-toegevoegde oefeningen) blijft staan. Een refresh
      // laadt daarna gewoon /edit/{id} vanuit de server.
      window.history.replaceState(null, '', `/therapist/programs/${created.id}/edit`)
    }
  }

  const autosave = useAutosave({
    value: formValue,
    onSave: persist,
    draftKey,
    debounceMs: 1500,
  })

  // Eén toast per error → succes-transitie zodat opslaan-fouten zichtbaar zijn
  // ook als de gebruiker niet op de inline-status let.
  const errorToastShownRef = useState<{ shown: boolean }>({ shown: false })[0]
  useEffect(() => {
    if (autosave.status === 'error' && !errorToastShownRef.shown) {
      errorToastShownRef.shown = true
      const msg =
        autosave.error instanceof Error ? autosave.error.message : 'Opslaan mislukt'
      toast.error(`Programma niet opgeslagen: ${msg}`)
    } else if (autosave.status === 'saved' && errorToastShownRef.shown) {
      errorToastShownRef.shown = false
    }
  }, [autosave.status, autosave.error, errorToastShownRef])

  const handleDeploy = async () => {
    if (!program.name.trim()) {
      toast.error('Geef het programma eerst een naam')
      return
    }
    if (exercises.length === 0) {
      toast.error('Voeg eerst oefeningen toe voordat je deployt')
      return
    }
    // Eerst alle wijzigingen committen — anders deployt de modal een out-of-date
    // versie als de patiënt aangepast wordt vlak voor klikken.
    try {
      await autosave.saveNow()
    } catch {
      toast.error('Opslaan mislukt — kon niet deployen')
      return
    }
    if (!currentProgramId && !program.isTemplate) {
      toast.error('Sla het programma eerst op')
      return
    }
    setDeployPatientId(program.patientId ?? null)
    setDeployInstructions('')
    setDeployPatientSearch('')
    setDeploySaveAsTemplate(false)
    setDeploySendEmail(true)
    setDeployDialogOpen(true)
  }

  const filteredDeployPatients = useMemo(() => {
    const q = deployPatientSearch.trim().toLowerCase()
    if (!q) return patientsList
    return patientsList.filter(p =>
      (p.name?.toLowerCase().includes(q) ?? false)
      || (p.email?.toLowerCase().includes(q) ?? false)
    )
  }, [patientsList, deployPatientSearch])

  const confirmDeploy = async () => {
    if (!deployPatientId) {
      toast.error('Kies een patiënt')
      return
    }
    const target = patientsList.find(p => p.id === deployPatientId)
    if (!target) {
      toast.error('Patiënt niet gevonden')
      return
    }
    setDeployBusy(true)
    try {
      // Sjabloon → eerst dupliceren als concreet programma voor deze patiënt;
      // het sjabloon zelf laten we ongemoeid in de bibliotheek staan.
      let targetProgramId = currentProgramId
      let createdFromTemplate = false
      if (program.isTemplate) {
        if (!currentProgramId) {
          toast.error('Sla het sjabloon eerst op')
          return
        }
        const dup = await duplicateProgram.mutateAsync({
          id: currentProgramId,
          name: program.name,
          patientId: deployPatientId,
          isTemplate: false,
        })
        targetProgramId = dup.id
        createdFromTemplate = true
      } else if (program.patientId !== deployPatientId) {
        // Niet-sjabloon, andere patiënt gekozen → patientId mee saven.
        await saveProgram.mutateAsync({
          id: currentProgramId!,
          patientId: deployPatientId,
        })
      }
      if (!targetProgramId) {
        toast.error('Programma niet gevonden')
        return
      }
      await saveProgram.mutateAsync({
        id: targetProgramId,
        status: 'ACTIVE',
        startDate: new Date().toISOString(),
      })

      // Mail versturen — bij ACTIVE-update kan de therapeut kiezen 'alleen
      // opslaan' (deploySendEmail=false). Bij eerste deploy / template-toepassen
      // sturen we altijd. Graceful failure: als mail niet lukt, deploy blijft.
      const wasAlreadyActive = currentStatus === 'ACTIVE' && !createdFromTemplate
      const shouldSendMail = !(wasAlreadyActive && !deploySendEmail)
      let mailSent = true
      let mailSkipped = false
      if (!shouldSendMail) {
        mailSkipped = true
        mailSent = false
      } else if (target.email) {
        try {
          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: target.email,
              patientName: target.name ?? 'patiënt',
              programName: program.name,
              startDate: new Date().toISOString(),
              extraInstructions: deployInstructions.trim() || undefined,
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || json?.sent === false) mailSent = false
        } catch {
          mailSent = false
        }
      } else {
        mailSent = false
      }

      if (!createdFromTemplate) {
        setProgram(p => ({ ...p, patientId: deployPatientId }))
        setCurrentStatus('ACTIVE')
      }

      // Save-as-template: wanneer de therapeut bij eerste-deploy heeft
      // aangevinkt om óók een sjabloon in de bibliotheek te bewaren, maak
      // een kopie met isTemplate=true + patientId=null. Best-effort: faalt
      // 'ie, dan deploy is nog wel gelukt — alleen toast met fallback.
      if (deploySaveAsTemplate && !createdFromTemplate && targetProgramId) {
        try {
          await duplicateProgram.mutateAsync({
            id: targetProgramId,
            name: program.name,
            isTemplate: true,
            patientId: null,
          })
        } catch {
          toast.warning('Programma gedeployed — sjabloon-kopie mislukte, kun je later met "Opslaan als sjabloon" doen.', { duration: 6000 })
        }
      }
      setDeployDialogOpen(false)

      // Onderscheid in messaging: bij update van een al-ACTIVE programma is
      // dit alleen een mail-notificatie — de wijzigingen waren al live via
      // autosave. Bij eerste deploy is dit het echte live-zetten.
      if (createdFromTemplate) {
        toast.success(`Programma toegepast op ${target.name ?? 'patiënt'} en gedeployed.`, { duration: 4000 })
        router.push(`/therapist/programs/${targetProgramId}/edit`)
      } else if (mailSkipped) {
        toast.success('Wijzigingen opgeslagen — geen mail verstuurd.', { duration: 4000 })
      } else if (mailSent) {
        toast.success(
          wasAlreadyActive ? 'Update-mail verstuurd aan patiënt.' : 'Programma gedeployed en mail verstuurd.',
          { duration: 4000 },
        )
      } else if (target.email) {
        toast.warning(
          wasAlreadyActive ? 'Update opgeslagen — mail kon niet worden verstuurd.' : 'Programma gedeployed — mail kon niet worden verstuurd.',
          { duration: 5000 },
        )
      } else {
        toast.success(
          wasAlreadyActive ? 'Update opgeslagen (geen mail — patiënt heeft geen e-mailadres).' : 'Programma gedeployed (geen mail — patiënt heeft geen e-mailadres).',
          { duration: 4000 },
        )
      }
      if (returnTo && !createdFromTemplate) router.push(returnTo)
    } catch {
      toast.error('Deployen mislukt')
    } finally {
      setDeployBusy(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    const name = templateName.trim() || program.name
    // Sjabloon-save: notes NIET meekopiëren — die zijn patiënt-specifiek
    // bedoeld en horen niet in een herbruikbaar sjabloon te staan.
    const exercisePayload = exercises.map((ex, i) => ({
      exerciseId: ex.exerciseId,
      week: ex.week, day: ex.day, order: i,
      sets: ex.sets, setsMax: ex.setsMax ?? null,
      reps: ex.reps, repsMax: ex.repsMax ?? null,
      repUnit: ex.repUnit, restTime: ex.rest,
      supersetGroup: ex.supersetGroup ?? null,
      supersetOrder: ex.supersetOrder, notes: null,
      intensityType: ex.intensityType ?? 'NONE',
      intensityMin: ex.intensityMin ?? null,
      intensityMax: ex.intensityMax ?? null,
      intensityText: ex.intensityText?.trim() ? ex.intensityText : null,
      // Voorschrift-parameters horen wél in het sjabloon (niet patiënt-specifiek).
      extraParams: ex.extraParams && ex.extraParams.length > 0 ? ex.extraParams : null,
    }))
    const resourcePayload = resources.map((r, i) => ({
      resourceId: r.resourceId, week: r.week, day: r.day, order: i,
    }))
    setTemplateSaving(true)
    try {
      if (currentProgramId) {
        // If this already is a program, duplicate it as template
        await duplicateProgram.mutateAsync({
          id: currentProgramId,
          name: templateCategory ? `[${templateCategory}] ${name}` : name,
          isTemplate: true,
          patientId: null,
        })
      } else {
        const created = await createProgram.mutateAsync({
          name: templateCategory ? `[${templateCategory}] ${name}` : name,
          description: program.description ?? undefined,
          weeks: program.weeks, daysPerWeek: program.daysPerWeek,
          isTemplate: true, patientId: null,
          tendinopathyMode: program.tendinopathyMode,
          trackOneRepMax: program.trackOneRepMax,
          dailyTarget: program.tendinopathyMode ? program.dailyTarget : null,
        })
        if (exercises.length > 0 || resources.length > 0) {
          await saveProgram.mutateAsync({
            id: created.id,
            exercises: exercisePayload,
            resources: resourcePayload,
          })
        }
      }
      toast.success('Opgeslagen als template in de bibliotheek')
      setTemplateDialogOpen(false)
    } catch {
      toast.error('Opslaan mislukt')
    } finally {
      setTemplateSaving(false)
    }
  }

  // ── Import vanaf template ────────────────────────────────────────────────────
  async function handleImportTemplate(templateId: string) {
    if (exercises.length > 0) {
      const ok = window.confirm(
        'Hiermee vervang je het huidige programma met de inhoud van de template. Doorgaan?',
      )
      if (!ok) return
    }
    try {
      const tpl = await utils.programs.get.fetch({ id: templateId })
      if (!tpl) { toast.error('Template niet gevonden'); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tplExercises = (tpl as any).exercises as Array<{
        id: string; exerciseId: string; week: number; day: number;
        sets: number; setsMax?: number | null; reps: number; repsMax?: number | null;
        repUnit: string; restTime: number;
        supersetGroup: string | null; supersetOrder: number;
        notes?: string | null;
        intensityType?: string; intensityMin?: number | null;
        intensityMax?: number | null; intensityText?: string | null;
        extraParams?: BuilderExercise['extraParams'] | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exercise: any
      }>
      const mapped: BuilderExercise[] = tplExercises.map(pe => ({
        uid: pe.id,
        exerciseId: pe.exerciseId,
        name: pe.exercise.name,
        category: pe.exercise.category,
        difficulty: pe.exercise.difficulty,
        muscleLoads: Object.fromEntries((pe.exercise.muscleLoads ?? []).map((ml: { muscle: string; load: number }) => [ml.muscle, ml.load])),
        easierVariantId: pe.exercise.easierVariantId ?? null,
        harderVariantId: pe.exercise.harderVariantId ?? null,
        videoUrl: pe.exercise.videoUrl ?? null,
        trackOneRepMax: pe.exercise.trackOneRepMax ?? false,
        sets: pe.sets,
        setsMax: pe.setsMax ?? null,
        reps: pe.reps,
        repsMax: pe.repsMax ?? null,
        repUnit: (pe.repUnit as BuilderExercise['repUnit']) ?? 'reps',
        rest: pe.restTime,
        extraParams: pe.extraParams ?? [],
        notes: pe.notes ?? null,
        intensityType: (pe.intensityType as BuilderExercise['intensityType']) ?? 'NONE',
        intensityMin: pe.intensityMin ?? null,
        intensityMax: pe.intensityMax ?? null,
        intensityText: pe.intensityText ?? null,
        supersetGroup: pe.supersetGroup ?? null,
        supersetOrder: pe.supersetOrder,
        selected: false,
        day: pe.day,
        week: pe.week,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedResources: BuilderResource[] = ((tpl as any).resources ?? []).map((pr: any) => ({
        uid: pr.id,
        resourceId: pr.resourceId,
        title: pr.resource?.title ?? 'Educatie',
        format: (pr.resource?.format as 'VIDEO' | 'PDF') ?? 'PDF',
        videoUrl: pr.resource?.videoUrl ?? null,
        thumbnailUrl: pr.resource?.thumbnailUrl ?? null,
        day: pr.day,
        week: pr.week,
      }))
      setProgram(p => ({
        ...p,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: p.name && p.name !== 'Nieuw programma' ? p.name : (tpl as any).name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        weeks: (tpl as any).weeks,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        daysPerWeek: (tpl as any).daysPerWeek,
      }))
      setExercises(mapped)
      setResources(mappedResources)
      setImportDialogOpen(false)
      setImportQuery('')
      toast.success(`Template geladen — ${mapped.length} oefeningen overgenomen.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Laden mislukt')
    }
  }

  // ── Week/day navigation ───────────────────────────────────────────────────────
  // Toon zowel de "default" days (1..daysPerWeek) als de days die feitelijk
  // bezet zijn door exercises. Dat is nodig omdat ProgramExercise.day nu via
  // changeDay vanuit de week-planner naar elk weekday (1=Ma..7=Zo) verplaatst
  // kan worden — anders rendert de builder alleen 1..daysPerWeek en zie je
  // verplaatste exercises niet.
  const dayUnion = new Set<number>()
  for (let i = 1; i <= program.daysPerWeek; i++) dayUnion.add(i)
  for (const ex of exercises) if (ex.day >= 1 && ex.day <= 7) dayUnion.add(ex.day)
  const days = [...dayUnion].sort((a, b) => a - b)
  const weeks = Array.from({ length: program.weeks }, (_, i) => i + 1)

  const exerciseCountForDay = (day: number, week: number) =>
    exercises.filter(e => e.day === day && e.week === week).length

  // Week-navigatie naast de dag-tabs (was: los in de topbalk). Hover over een
  // week toont een verwijder-kruisje; de laatste week kan niet weg.
  const weekNav = (
    <div className="hidden md:flex items-center gap-1 shrink-0">
      {weeks.map(w => (
        <div key={w} className="relative group/week">
          <button
            onClick={() => setProgram(p => ({ ...p, currentWeek: w }))}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
              program.currentWeek === w ? 'bg-[#E87A55] text-[#0E2729]' : 'text-muted-foreground hover:bg-[#1C4448]'
            )}
          >
            W{w}
          </button>
          {program.weeks > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); removeWeek(w) }}
              title={`Week ${w} verwijderen`}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full hidden group-hover/week:flex items-center justify-center bg-[#1C4448] border border-[rgba(212,232,230,0.15)] text-[#9EB5B3] hover:text-[#F0796C] hover:border-[#F0796C]/50"
            >
              <X className="w-2 h-2" strokeWidth={3} />
            </button>
          )}
        </div>
      ))}
      {program.weeks < 8 && (
        <button
          onClick={() => setProgram(p => ({ ...p, weeks: p.weeks + 1, currentWeek: p.weeks + 1 }))}
          title="Week toevoegen"
          className="px-1.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-[#1C4448] flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Week</span>
        </button>
      )}
      <div className="w-px h-5 mx-1 bg-[rgba(212,232,230,0.10)]" />
    </div>
  )

  const activeEx = activeId ? exercises.find(e => e.uid === activeId) : null
  const activeLibraryName = activeId?.startsWith('library-')
    ? activeId.replace('library-', '')
    : null

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full -m-4 md:-m-6">

        {/* ── Top bar ── */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 border-b bg-[#15363A] shrink-0">
          <button onClick={() => router.push(backHref)} className="text-muted-foreground hover:text-foreground shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Input
            value={program.name}
            onChange={e => {
              setNameUserEdited(true)
              setProgram(p => ({ ...p, name: e.target.value }))
            }}
            placeholder={program.isTemplate ? 'Naam van sjabloon…' : 'Naam programma…'}
            className={cn(
              // Dit veld moet als titel lezen, niet als invoervak: geen rand,
              // geen vulling, geen padding. Zonder bg-transparent erft het de
              // veldkleur en staat er een blok om de titel.
              // De placeholder blijft gedempt. In goud las hij als een ingevulde
              // naam, en hij stond naast twee gouden pillen die iets anders
              // zeggen. Dat je nog een naam moet invullen, zegt de uitgeschakelde
              // Deployen-knop al.
              'h-8 text-sm font-semibold border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 min-w-0',
            )}
          />

          {/* Patient-pill: laat zien voor wie dit programma is. Voor sjablonen
              tonen we een Sjabloon-pill ipv patientnaam. */}
          {program.isTemplate ? (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(158,181,179,0.15)',
                color: '#9EB5B3',
                border: '1px solid rgba(158,181,179,0.30)',
                letterSpacing: '0.05em',
              }}
              title="Dit programma is een sjabloon en niet aan een patiënt gekoppeld."
            >
              <Layers className="w-2.5 h-2.5" />
              Sjabloon
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
                  style={
                    currentPatientFirstName
                      ? { background: 'rgba(159,206,201,0.12)', color: '#9FCEC9', border: '1px solid rgba(159,206,201,0.35)', letterSpacing: '0.05em' }
                      : { background: 'rgba(245,185,66,0.10)', color: '#F5B942', border: '1px solid rgba(245,185,66,0.30)', letterSpacing: '0.05em' }
                  }
                  title={
                    currentPatientFirstName
                      ? `Programma voor ${currentPatient?.name ?? currentPatientFirstName}. Klik om te wijzigen.`
                      : 'Nog geen patiënt gekoppeld. Klik om te kiezen of doe het bij Deployen.'
                  }
                >
                  <User className="w-2.5 h-2.5" />
                  {currentPatientFirstName ? `Voor: ${currentPatientFirstName}` : 'Geen patiënt'}
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Koppel aan patiënt
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {patientsList.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nog geen patiënten</div>
                ) : (
                  patientsList.map(p => (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => setProgram(prev => ({ ...prev, patientId: p.id }))}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: program.patientId === p.id ? '#9FCEC9' : '#86A3A1' }} />
                      <span className="truncate">{p.name ?? p.email ?? 'Onbekende patiënt'}</span>
                      {program.patientId === p.id && <Check className="w-3 h-3 ml-auto text-[#9FCEC9]" />}
                    </DropdownMenuItem>
                  ))
                )}
                {program.patientId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setProgram(prev => ({ ...prev, patientId: null }))}
                      className="text-xs text-muted-foreground"
                    >
                      <X className="w-3 h-3 mr-1.5" />
                      Patiënt loskoppelen
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!program.isTemplate && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
              style={
                currentStatus === 'ACTIVE'
                  ? { background: 'rgba(232,122,85,0.12)', color: '#E87A55', border: '1px solid rgba(232,122,85,0.35)' }
                  : currentStatus === 'COMPLETED' || currentStatus === 'ARCHIVED'
                  ? { background: 'rgba(158,181,179,0.15)', color: '#9EB5B3', border: '1px solid rgba(158,181,179,0.30)' }
                  : { background: 'rgba(245,185,66,0.12)', color: '#F5B942', border: '1px solid rgba(245,185,66,0.35)' }
              }
              title={
                currentStatus === 'ACTIVE'
                  ? 'Het programma is live — wijzigingen die je hier maakt worden direct opgeslagen en zijn meteen zichtbaar bij de patiënt.'
                  : currentStatus === 'DRAFT'
                  ? 'Concept — patiënt ziet dit nog niet. Klik DEPLOYEN om actief te maken.'
                  : currentStatus === 'COMPLETED'
                  ? 'Programma is afgerond.'
                  : 'Programma is gearchiveerd.'
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    currentStatus === 'ACTIVE' ? '#E87A55'
                    : currentStatus === 'DRAFT' ? '#F5B942'
                    : '#9EB5B3',
                }}
              />
              {currentStatus === 'ACTIVE' ? 'Live'
                : currentStatus === 'DRAFT' ? 'Concept'
                : currentStatus === 'COMPLETED' ? 'Afgerond'
                : 'Archief'}
            </span>
          )}
          <div className="flex-1" />

          <div className="hidden md:flex items-center gap-1">
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setImportDialogOpen(true)}>
              <Copy className="w-3.5 h-3.5" />
              Vanaf template
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => { setTemplateName(program.name); setTemplateCategory(''); setTemplateDialogOpen(true) }}>
              <Layers className="w-3.5 h-3.5" />
              Opslaan als template
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setPreviewOpen(true)}>
              <Eye className="w-3.5 h-3.5" />
              Preview
            </Button>
          </div>

          <div
            className="flex items-center gap-1.5 h-7 px-2 text-xs shrink-0 select-none"
            title={autosave.lastSavedAt ? `Laatst opgeslagen om ${autosave.lastSavedAt.toLocaleTimeString('nl-NL')}` : ''}
          >
            {autosave.status === 'saving' && (
              <><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Opslaan…</span></>
            )}
            {autosave.status === 'pending' && (
              <><Loader2 className="w-3 h-3 animate-spin opacity-50 text-muted-foreground" /><span className="text-muted-foreground">Wijzigingen…</span></>
            )}
            {autosave.status === 'saved' && (
              <><Check className="w-3 h-3" style={{ color: '#E87A55' }} /><span className="text-muted-foreground">Opgeslagen</span></>
            )}
            {autosave.status === 'error' && (
              <button
                type="button"
                onClick={() => { void autosave.saveNow() }}
                className="flex items-center gap-1 text-[#F0796C] hover:text-[#F59B92]"
              >
                <AlertCircle className="w-3 h-3" /> Opslaan mislukt — opnieuw
              </button>
            )}
          </div>
          <Button
            size="sm"
            className="gap-1.5 h-7 text-xs shrink-0"
            style={
              // Uitgeschakeld krijgt een eigen vlakke kleur. De standaard
              // 50% dekking maakt van het oranje een modderige bruine tint die
              // eerder kapot lijkt dan uitgeschakeld.
              saving || !program.name.trim()
                ? { background: '#1C4448', color: '#86A3A1', border: '1px solid rgba(212,232,230,0.09)', opacity: 1 }
                : currentStatus === 'ACTIVE'
                  ? { background: 'transparent', color: '#E87A55', border: '1px solid rgba(232,122,85,0.35)' }
                  : { background: '#E87A55' }
            }
            onClick={handleDeploy}
            disabled={saving || !program.name.trim()}
            title={
              !program.name.trim()
                ? 'Geef het programma eerst een naam'
                : currentStatus === 'ACTIVE'
                  ? 'Wijzigingen zijn direct zichtbaar. Klik om te kiezen: mail sturen of alleen opslaan.'
                  : undefined
            }
          >
            <Rocket className="w-3.5 h-3.5" />
            {saving
              ? '...'
              : program.isTemplate
                ? 'Toepassen op patiënt'
                : currentStatus === 'ACTIVE'
                  ? 'Update'
                  : 'Deployen'}
          </Button>
        </div>

        {/* ── Program settings bar: tendinopathy toggle ── */}
        <div className="flex items-center gap-3 px-3 md:px-4 py-1.5 border-b bg-[#1C4448] shrink-0">
          <button
            type="button"
            onClick={() => setProgram(p => ({ ...p, tendinopathyMode: !p.tendinopathyMode }))}
            className="flex items-center gap-2 text-xs font-medium"
          >
            <div
              className="w-8 h-4 rounded-full relative transition-colors flex items-center"
              style={{ background: program.tendinopathyMode ? '#E87A55' : '#86A3A1' }}
            >
              <div
                className="w-3 h-3 bg-[#F5F2ED] rounded-full absolute shadow transition-transform"
                style={{ transform: program.tendinopathyMode ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </div>
            <span className={program.tendinopathyMode ? 'text-[#E87A55] font-semibold' : 'text-muted-foreground'}>
              Tendinopathie pijn tracking
            </span>
          </button>
          <div className="relative group">
            <Info className="w-3.5 h-3.5 text-[#9EB5B3] cursor-help" />
            <div className="absolute left-5 top-0 z-50 w-64 hidden group-hover:block bg-[#E87A55] text-[#0E2729] text-xs rounded-lg px-3 py-2 shadow-xl">
              Voor peesproblematiek (achilles, patella, RC): splitst pijn in tijdens vs 24u erna + ochtend stijfheid. Gebruikt Silbernagel-protocol grenzen.
            </div>
          </div>
          {program.tendinopathyMode && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: '#e87a5522', color: '#E87A55' }}
            >
              Actief voor alle oefeningen
            </span>
          )}
          {/* Dagdoel: hoe vaak per dag de patient elke ISO-oefening moet doen.
              Stuurt de dagelijkse herinneringen + voortgang in de app aan. Leeg
              = geen dag-flow, alleen de reactieve 24u-check. */}
          {program.tendinopathyMode && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">×</span>
              <input
                type="number"
                min={1}
                max={10}
                placeholder="1"
                value={program.dailyTarget ?? ''}
                onChange={e => {
                  const v = e.target.value
                  setProgram(p => ({ ...p, dailyTarget: v === '' ? null : Math.max(1, Math.min(10, Number(v))) }))
                }}
                className="w-12 h-6 text-center text-xs font-bold bg-[#1C4448] rounded border border-[rgba(212,232,230,0.10)] focus:outline-none focus:ring-1 focus:ring-[#E87A55]"
                title="Aantal keer per dag dat de patiënt elke oefening doet"
              />
              <span className="text-[10px] text-muted-foreground">/ dag</span>
            </div>
          )}

          <div className="w-px h-4 bg-[rgba(212,232,230,0.08)] mx-1 hidden sm:block" />

          {/* 1RM toggle */}
          <button
            type="button"
            onClick={() => setProgram(p => ({ ...p, trackOneRepMax: !p.trackOneRepMax }))}
            className="flex items-center gap-2 text-xs font-medium"
          >
            <div
              className="w-8 h-4 rounded-full relative transition-colors flex items-center"
              style={{ background: program.trackOneRepMax ? '#E87A55' : '#86A3A1' }}
            >
              <div
                className="w-3 h-3 bg-[#F5F2ED] rounded-full absolute shadow transition-transform"
                style={{ transform: program.trackOneRepMax ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </div>
            <span className={program.trackOneRepMax ? 'text-[#E87A55] font-semibold' : 'text-muted-foreground'}>
              1RM tracking
            </span>
          </button>
          {program.trackOneRepMax && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: '#e87a5522', color: '#E87A55' }}
            >
              Epley per sessie
            </span>
          )}

          <div className="w-px h-4 bg-[rgba(212,232,230,0.08)] mx-1 hidden sm:block" />

          {/* Flexibele week-toggle — patient kan elke dag het programma starten;
              klaar zodra weeklyTarget keer voltooid binnen één week (Mo-Su). */}
          <button
            type="button"
            onClick={() => setProgram(p => ({
              ...p,
              flexibleSchedule: !p.flexibleSchedule,
              weeklyTarget: !p.flexibleSchedule && !p.weeklyTarget ? 3 : p.weeklyTarget,
              // Bij aanzetten van flex: terug naar dag 1 zodat nieuwe oefeningen
              // niet per ongeluk in een onzichtbare day-bucket landen.
              currentDay: !p.flexibleSchedule ? 1 : p.currentDay,
            }))}
            className="flex items-center gap-2 text-xs font-medium"
          >
            <div
              className="w-8 h-4 rounded-full relative transition-colors flex items-center"
              style={{ background: program.flexibleSchedule ? '#E87A55' : '#86A3A1' }}
            >
              <div
                className="w-3 h-3 bg-[#F5F2ED] rounded-full absolute shadow transition-transform"
                style={{ transform: program.flexibleSchedule ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </div>
            <span className={program.flexibleSchedule ? 'text-[#E87A55] font-semibold' : 'text-muted-foreground'}>
              Flexibele week
            </span>
          </button>
          {program.flexibleSchedule && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">×</span>
              <input
                type="number"
                min={1}
                max={14}
                value={program.weeklyTarget ?? ''}
                onChange={e => {
                  const v = e.target.value
                  setProgram(p => ({ ...p, weeklyTarget: v === '' ? null : Math.max(1, Math.min(14, Number(v))) }))
                }}
                className="w-12 h-6 text-center text-xs font-bold bg-[#1C4448] rounded border border-[rgba(212,232,230,0.10)] focus:outline-none focus:ring-1 focus:ring-[#E87A55]"
              />
              <span className="text-[10px] text-muted-foreground">/ week</span>
            </div>
          )}

          <div className="w-px h-4 bg-[rgba(212,232,230,0.08)] mx-1 hidden sm:block" />

          {/* Controle-interval — na hoeveel weken zónder wijziging de therapeut
              een controle-signaal krijgt. Leeg = standaard 8 weken. */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Controleren na</span>
            <input
              type="number"
              min={1}
              max={104}
              placeholder="8"
              value={program.reviewAfterWeeks ?? ''}
              onChange={e => {
                const v = e.target.value
                setProgram(p => ({ ...p, reviewAfterWeeks: v === '' ? null : Math.max(1, Math.min(104, Number(v))) }))
              }}
              className="w-12 h-6 text-center text-xs font-bold bg-[#1C4448] rounded border border-[rgba(212,232,230,0.10)] focus:outline-none focus:ring-1 focus:ring-[#E87A55]"
            />
            <span className="text-[10px] text-muted-foreground">weken</span>
            <div className="relative group">
              <Info className="w-3.5 h-3.5 text-[#9EB5B3] cursor-help" />
              <div className="absolute left-5 top-0 z-50 w-64 hidden group-hover:block bg-[#E87A55] text-[#0E2729] text-xs rounded-lg px-3 py-2 shadow-xl">
                Na zoveel weken zonder wijziging krijg je een signaal om het schema te controleren. Leeg = standaard 8 weken. Elke aanpassing reset de teller.
              </div>
            </div>
          </div>

          {/* Destination toggle — bepaalt of Opslaan naar deze patiënt of de
              bibliotheek gaat. Zonder patiënt is alleen "Bibliotheek" mogelijk. */}
          <div className="ml-auto hidden md:flex items-center gap-1">
            <span className="athletic-mono text-[10px] tracking-wider text-[#9EB5B3] mr-1">
              OPSLAAN ALS
            </span>
            <button
              type="button"
              onClick={() => setProgram(p => ({ ...p, isTemplate: false }))}
              disabled={!program.patientId}
              className="athletic-tap px-2.5 py-0.5 rounded text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: !program.isTemplate && program.patientId ? '#E87A55' : 'transparent',
                color: !program.isTemplate && program.patientId ? '#081A1C' : '#9EB5B3',
                border: '1px solid rgba(212,232,230,0.12)',
                letterSpacing: '0.04em',
              }}
              title={!program.patientId ? 'Eerst een patiënt koppelen' : 'Alleen voor deze patiënt'}
            >
              Patiënt
            </button>
            <button
              type="button"
              onClick={() => setProgram(p => ({ ...p, isTemplate: true }))}
              className="athletic-tap px-2.5 py-0.5 rounded text-[11px] font-bold transition-colors"
              style={{
                background: program.isTemplate ? '#E87A55' : 'transparent',
                color: program.isTemplate ? '#081A1C' : '#9EB5B3',
                border: '1px solid rgba(212,232,230,0.12)',
                letterSpacing: '0.04em',
              }}
              title="Deel met de hele praktijk-bibliotheek"
            >
              Bibliotheek
            </button>
          </div>
        </div>

        {/* Mobile action row: week tabs + balance toggle */}
        <div className="flex md:hidden items-center gap-1 px-3 py-2 border-b bg-[#15363A] overflow-x-auto">
          {weeks.map(w => (
            <button
              key={w}
              onClick={() => setProgram(p => ({ ...p, currentWeek: w }))}
              className={cn(
                'shrink-0 px-3 py-1 rounded text-xs font-medium transition-colors',
                program.currentWeek === w ? 'bg-[#E87A55] text-[#0E2729]' : 'text-muted-foreground bg-[#1C4448]'
              )}
            >
              Week {w}
            </button>
          ))}
          {program.weeks < 8 && (
            <button
              onClick={() => setProgram(p => ({ ...p, weeks: p.weeks + 1 }))}
              className="shrink-0 px-2 py-1 rounded text-xs text-muted-foreground bg-[#1C4448]"
            >
              + Week
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              onClick={() => setMobileBalanceOpen(true)}
              className="p-1.5 rounded bg-[#1C4448] text-muted-foreground"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPreviewOpen(true)}
              className="p-1.5 rounded bg-[#1C4448] text-muted-foreground"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Layout ── */}
        <div className="flex flex-1 min-h-0">

          {/* LEFT: library — desktop only */}
          <div className="hidden md:flex w-56 shrink-0 border-r overflow-hidden flex-col">
            <ExerciseLibraryPanel onAdd={addFromLibrary} onAddResource={addResourceFromLibrary} exercises={libraryExercises.length > 0 ? libraryExercises as never : undefined} />
          </div>

          {/* CENTER: canvas */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Day tabs — verbergen in flex-modus omdat dag-van-de-week dan
                geen betekenis heeft. Bulk-kopie + superset-acties krijgen in
                flex-modus een eigen smalle toolbar zodat ze toch beschikbaar
                blijven. */}
            {!program.flexibleSchedule ? (
              <div className="flex items-center gap-1 px-3 md:px-4 pt-3 pb-2 border-b shrink-0 overflow-x-auto">
                {weekNav}
                {days.map(d => {
                  const count = exerciseCountForDay(d, program.currentWeek)
                  return (
                    <button
                      key={d}
                      onClick={() => setProgram(p => ({ ...p, currentDay: d }))}
                      className={cn(
                        'shrink-0 flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors',
                        program.currentDay === d ? 'text-[#0E2729]' : 'text-muted-foreground hover:bg-[#1C4448]'
                      )}
                      style={program.currentDay === d ? { background: '#E87A55' } : {}}
                    >
                      {DAY_LABELS[d - 1]}
                      {count > 0 && (
                        <span
                          className="text-xs rounded-full px-1.5 py-0"
                          style={{
                            background: program.currentDay === d ? 'rgba(14,39,41,0.22)' : 'rgba(212,232,230,0.12)',
                            color: program.currentDay === d ? '#0E2729' : '#9EB5B3',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}

                {program.daysPerWeek < 7 && (
                  <button
                    onClick={() => setProgram(p => ({ ...p, daysPerWeek: p.daysPerWeek + 1 }))}
                    className="shrink-0 px-2 py-1.5 rounded-lg text-xs md:text-sm text-muted-foreground hover:bg-[#1C4448] flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Dag</span>
                  </button>
                )}

                {/* Bulk-kopie menu + uitklap-alles — tonen alleen bij inhoud */}
                {dayExercises.length > 0 && (
                  <div className="ml-auto shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleExpandAllForDay}
                      title={allDayExpanded ? 'Alles inklappen' : 'Alles uitklappen'}
                      className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:bg-[#1C4448] flex items-center gap-1 transition-colors"
                    >
                      {allDayExpanded
                        ? <ChevronsDownUp className="w-3.5 h-3.5" />
                        : <ChevronsUpDown className="w-3.5 h-3.5" />}
                    </button>
                    <CopyMenu
                      weeks={weeks}
                      days={days}
                      currentWeek={program.currentWeek}
                      currentDay={program.currentDay}
                      exerciseCountForDay={exerciseCountForDay}
                      onCopyDay={copyDayTo}
                      onCopyWeek={copyWeekTo}
                    />
                  </div>
                )}

                {selectedUids.length >= 2 && (
                  <div className={cn('flex items-center gap-2 shrink-0', dayExercises.length > 0 ? '' : 'ml-auto')}>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={createSuperset}>
                      <Layers className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Superset</span>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              (
                <div className="flex items-center gap-2 px-3 md:px-4 pt-3 pb-2 border-b shrink-0">
                  {weekNav}
                  <div className="flex-1" />
                  {dayExercises.length > 0 && (
                    <CopyMenu
                      weeks={weeks}
                      days={days}
                      currentWeek={program.currentWeek}
                      currentDay={program.currentDay}
                      exerciseCountForDay={exerciseCountForDay}
                      onCopyDay={copyDayTo}
                      onCopyWeek={copyWeekTo}
                    />
                  )}
                  {selectedUids.length >= 2 && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={createSuperset}>
                        <Layers className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Superset</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
                        ✕
                      </Button>
                    </>
                  )}
                </div>
              )
            )}

            {/* Exercises */}
            <div className="flex-1 overflow-y-auto px-3 md:px-4 py-3 pb-32 md:pb-4">
              <DayDropZone day={program.currentDay} week={program.currentWeek} isEmpty={dayExercises.length === 0}>
                <SortableContext
                  items={orderedItems.flatMap(i => i.type === 'free' ? [i.ex.uid] : [])}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {orderedItems.map(item => {
                      if (item.type === 'superset') {
                        const groupExercises = supersetGroups[item.group] ?? []
                        return (
                          <div key={`ss-${item.group}`}>
                            <SupersetGroupBlock
                              groupLetter={item.group}
                              exercises={groupExercises}
                              onUpdate={updateEx}
                              onRemove={removeEx}
                              onToggleSelect={toggleSelect}
                              onSwapVariant={swapVariant}
                              allExercises={libraryExercises as never}
                              customParams={customParams}
                              expandedUids={expandedUids}
                              onToggleExpanded={toggleExpanded}
                            />
                            <button
                              onClick={() => dissolveSuperset(item.group)}
                              className="text-xs text-muted-foreground hover:text-destructive ml-2 mt-0.5"
                            >
                              Groep opheffen
                            </button>
                          </div>
                        )
                      }
                      return (
                        <ProgramExerciseBlock
                          key={item.ex.uid}
                          exercise={item.ex}
                          onUpdate={updateEx}
                          onRemove={removeEx}
                          onToggleSelect={toggleSelect}
                          onSwapVariant={swapVariant}
                          allExercises={libraryExercises as never}
                          customParams={customParams}
                          expanded={expandedUids.has(item.ex.uid)}
                          onToggleExpanded={toggleExpanded}
                        />
                      )
                    })}
                  </div>
                </SortableContext>
              </DayDropZone>

              {/* Educatie-blokken voor deze dag ("Leer") */}
              {dayResources.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                    Educatie
                  </p>
                  {dayResources.map(r => (
                    <div
                      key={r.uid}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-[#15363A]"
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: r.format === 'PDF' ? '#7FB0D8' : '#E87A55' }}
                      />
                      <span className="flex-1 truncate text-sm font-medium">{r.title}</span>
                      <span
                        className="text-[9px] font-bold tracking-wider shrink-0"
                        style={{ color: r.format === 'PDF' ? '#7FB0D8' : '#E87A55' }}
                      >
                        {r.format}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeResource(r.uid)}
                        aria-label={`Verwijder ${r.title}`}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile: floating add button */}
            <div className="md:hidden fixed bottom-20 right-4 z-20">
              <Button
                onClick={() => setMobileLibraryOpen(true)}
                className="w-12 h-12 rounded-full shadow-lg"
                style={{ background: '#E87A55' }}
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* RIGHT: muscle balance — desktop only */}
          <div className="hidden md:flex w-52 shrink-0 border-l overflow-hidden flex-col">
            <MuscleBalancePanel
              exercises={exercises}
              currentDay={program.currentDay}
              currentWeek={program.currentWeek}
            />
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeId && (
          <DragOverlayCard
            name={
              activeEx?.name ??
              (activeId.startsWith('library-')
                ? activeId.replace('library-', '')
                : activeId)
            }
          />
        )}
      </DragOverlay>

      {/* Mobile library dialog */}
      <Dialog open={mobileLibraryOpen} onOpenChange={(open) => {
        setMobileLibraryOpen(open)
        if (!open) { setMobileSelected(new Set()); setMobileQuery(''); setMobileCategory(null) }
      }}>
        <DialogContent className="p-0 flex flex-col gap-0" style={{ borderRadius: '16px', maxHeight: '85vh' }}>
          {/* Header */}
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle>Oefening toevoegen</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Zoeken..."
                value={mobileQuery}
                onChange={e => setMobileQuery(e.target.value)}
                className="pl-9"
              />
              {mobileQuery && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setMobileQuery('')}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            {/* Category filters */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {EXERCISE_CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setMobileCategory(mobileCategory === c.value ? null : c.value)}
                  className={cn(
                    'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    mobileCategory === c.value ? 'text-[#0E2729] border-transparent' : 'border-[rgba(212,232,230,0.12)] text-muted-foreground bg-[#15363A]'
                  )}
                  style={mobileCategory === c.value ? { background: '#E87A55' } : {}}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
            {(libraryExercises)
              .filter(ex => {
                if (mobileCategory && ex.category !== mobileCategory) return false
                if (mobileQuery && !ex.name.toLowerCase().includes(mobileQuery.toLowerCase())) return false
                return true
              })
              .map(ex => {
                const selected = mobileSelected.has(ex.id)
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setMobileSelected(prev => {
                      const next = new Set(prev)
                      selected ? next.delete(ex.id) : next.add(ex.id)
                      return next
                    })}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all',
                      selected
                        ? 'border-[#E87A55] bg-[rgba(232,122,85,0.12)]'
                        : 'border-[rgba(212,232,230,0.06)] bg-[#15363A] hover:border-[rgba(212,232,230,0.12)]'
                    )}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: { STRENGTH: '#5FD08A', MOBILITY: '#7FB0D8', PLYOMETRICS: '#F5B942', CARDIO: '#F0796C', STABILITY: '#45A8A2' }[ex.category] ?? '#5FD08A' }}
                    />
                    <span className="flex-1 text-sm font-medium">{ex.name}</span>
                    {selected && <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#E87A55' }} />}
                  </button>
                )
              })
            }
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t shrink-0">
            <Button
              className="w-full gap-2"
              style={{ background: '#E87A55' }}
              disabled={mobileSelected.size === 0}
              onClick={() => {
                const source = libraryExercises
                source
                  .filter(ex => mobileSelected.has(ex.id))
                  .forEach(ex => addFromLibrary(ex))
                toast.success(`${mobileSelected.size} oefening${mobileSelected.size > 1 ? 'en' : ''} toegevoegd`)
                setMobileLibraryOpen(false)
                setMobileSelected(new Set())
                setMobileQuery('')
                setMobileCategory(null)
              }}
            >
              <Plus className="w-4 h-4" />
              {mobileSelected.size === 0
                ? 'Selecteer oefeningen'
                : `${mobileSelected.size} oefening${mobileSelected.size > 1 ? 'en' : ''} toevoegen`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vanaf-template import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Programma vanaf template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Zoek template..."
                value={importQuery}
                onChange={e => setImportQuery(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {importTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  Nog geen templates in je bibliotheek.
                </p>
              )}
              {importTemplates
                .filter(t => !importQuery.trim() || t.name.toLowerCase().includes(importQuery.toLowerCase()))
                .map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleImportTemplate(t.id)}
                    className="w-full text-left p-2.5 rounded-lg border hover:border-[#E87A55]/40 transition-colors"
                    style={{ borderColor: 'rgba(212,232,230,0.10)' }}
                  >
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.weeks} wk · {t.daysPerWeek}/wk · {t._count.exercises} oefeningen
                    </p>
                  </button>
                ))}
            </div>
            {exercises.length > 0 && (
              <p className="text-[11px] text-[#F5B942]">
                <IconWarning size={13} className="inline-block mr-1 align-[-2px]" /> Huidige oefeningen worden vervangen door de template.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Opslaan-als-template dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Opslaan als template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Sla dit programma op als herbruikbaar template in de praktijkbibliotheek.
            </p>
            <div>
              <Label className="text-xs">Naam template</Label>
              <input
                className="w-full mt-1.5 h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#E87A55]"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder={program.name}
              />
            </div>
            <div>
              <Label className="text-xs">Categorie (optioneel)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {['Knie', 'Schouder', 'Rug', 'Heup', 'Enkel', 'Full Body', 'Revalidatie', 'Preventie'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTemplateCategory(templateCategory === cat ? '' : cat)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      templateCategory === cat
                        ? 'text-[#0E2729] border-transparent'
                        : 'border-[rgba(212,232,230,0.12)] text-muted-foreground hover:border-[rgba(212,232,230,0.2)]'
                    )}
                    style={templateCategory === cat ? { background: '#E87A55' } : {}}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                style={{ background: '#E87A55' }}
                onClick={handleSaveAsTemplate}
                disabled={templateSaving}
                className="flex-1"
              >
                {templateSaving ? 'Opslaan...' : 'Opslaan als template'}
              </Button>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Annuleren</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0" style={{ borderRadius: '16px' }}>
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview — {program.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Zo ziet de patiënt het programma · {program.weeks} weken · {program.daysPerWeek}×/week
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {Array.from({ length: program.weeks }, (_, wi) => wi + 1).map(week => (
              <div key={week}>
                <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Week {week}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Array.from({ length: program.daysPerWeek }, (_, di) => di + 1).map(day => {
                    const dayExs = exercises.filter(e => e.week === week && e.day === day)
                    return (
                      <div key={day} className="border rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">{DAY_LABELS[day - 1]}</span>
                          <span className="text-xs text-muted-foreground">{dayExs.length} oef.</span>
                        </div>
                        {dayExs.length === 0 ? (
                          <p className="text-xs text-[#9EB5B3] italic">Rustdag</p>
                        ) : (
                          dayExs.map((ex, i) => (
                            <div key={ex.uid} className="text-xs space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[#9EB5B3] w-4 shrink-0">{i + 1}.</span>
                                <span className="font-medium truncate">{ex.name}</span>
                              </div>
                              <div className="pl-5 text-muted-foreground">
                                {ex.sets}×{ex.reps} {ex.repUnit} · {ex.rest}s rust
                              </div>
                              {ex.extraParams.length > 0 && (
                                <div className="pl-5 flex flex-wrap gap-1">
                                  {ex.extraParams.map(p => (
                                    <span key={p.id} className="bg-[#1C4448] rounded px-1.5 py-0.5 text-xs">
                                      {p.label}: {p.value}{p.unit}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile muscle balance dialog */}
      <Dialog open={mobileBalanceOpen} onOpenChange={setMobileBalanceOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-hidden flex flex-col p-0" style={{ borderRadius: '16px' }}>
          <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              Spiergroep balans
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <MuscleBalancePanel
              exercises={exercises}
              currentDay={program.currentDay}
              currentWeek={program.currentWeek}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Deploy dialog ────────────────────────────────────────────────────── */}
      <Dialog open={deployDialogOpen} onOpenChange={(o) => !o && !deployBusy && setDeployDialogOpen(false)}>
        <DialogContent className="max-w-md" style={{ borderRadius: '16px' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              {program.isTemplate
                ? 'Toepassen op patiënt'
                : currentStatus === 'ACTIVE'
                  ? 'Programma updaten'
                  : 'Programma deployen'}
            </DialogTitle>
            <DialogDescription>
              {program.isTemplate
                ? 'Kies een patiënt — er wordt een kopie van dit sjabloon aangemaakt en direct live gezet.'
                : currentStatus === 'ACTIVE'
                  ? 'Wijzigingen zijn al opgeslagen en direct zichtbaar bij de patiënt. Kies hieronder of je de patiënt op de hoogte wil brengen via mail of dat je alleen opslaat.'
                  : 'Bevestig welke patiënt dit programma krijgt en stuur eventueel een bericht mee.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {/* Praktijk-incompleet waarschuwing — toont alleen als praktijk-
                profiel onvolledig is. Mail gaat dan zonder footer. */}
            <IncompletePracticeBanner variant="inline" />

            {/* Patient picker */}
            <div className="space-y-1.5">
              <Label className="text-xs">Patiënt</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Zoek patiënt…"
                  value={deployPatientSearch}
                  onChange={e => setDeployPatientSearch(e.target.value)}
                  className="pl-8"
                  disabled={deployBusy}
                />
              </div>
              <div className="max-h-44 overflow-y-auto pr-1 space-y-1 mt-1">
                {patientsList.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    Nog geen patiënten gekoppeld.
                  </p>
                ) : filteredDeployPatients.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    Geen patiënten gevonden.
                  </p>
                ) : (
                  filteredDeployPatients.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setDeployPatientId(p.id)}
                      disabled={deployBusy}
                      className="w-full text-left"
                    >
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors"
                        style={
                          deployPatientId === p.id
                            ? { borderColor: '#9FCEC9', background: 'rgba(159,206,201,0.10)' }
                            : { borderColor: 'rgba(212,232,230,0.10)' }
                        }
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#1C4448' }}>
                          <User className="w-3.5 h-3.5 text-[#9EB5B3]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name ?? 'Onbekende patiënt'}</p>
                          {p.email && (
                            <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                          )}
                        </div>
                        {deployPatientId === p.id && <Check className="w-3.5 h-3.5 text-[#9FCEC9]" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Mail-keuze — alleen voor update van een al-ACTIVE patient-programma.
                Bij eerste deploy of template-toepassen sturen we altijd mail
                (dat is dan de eerste keer dat de patient weet dat 'ie iets heeft). */}
            {currentStatus === 'ACTIVE' && !program.isTemplate && (
              <div className="space-y-1.5">
                <Label className="text-xs">Wat wil je doen?</Label>
                <div className="space-y-1.5">
                  <label
                    className="flex items-start gap-2 cursor-pointer select-none rounded-lg px-3 py-2 border transition-colors"
                    style={
                      deploySendEmail
                        ? { borderColor: '#9FCEC9', background: 'rgba(159,206,201,0.10)' }
                        : { borderColor: 'rgba(212,232,230,0.10)' }
                    }
                  >
                    <input
                      type="radio"
                      name="deployMailChoice"
                      checked={deploySendEmail}
                      onChange={() => setDeploySendEmail(true)}
                      disabled={deployBusy}
                      className="mt-0.5 w-4 h-4 accent-[#9FCEC9] shrink-0"
                    />
                    <div className="flex-1 text-xs">
                      <p className="font-semibold">Patient op de hoogte brengen</p>
                      <p className="text-muted-foreground mt-0.5">
                        Stuur een update-mail met optioneel bericht.
                      </p>
                    </div>
                  </label>
                  <label
                    className="flex items-start gap-2 cursor-pointer select-none rounded-lg px-3 py-2 border transition-colors"
                    style={
                      !deploySendEmail
                        ? { borderColor: '#9FCEC9', background: 'rgba(159,206,201,0.10)' }
                        : { borderColor: 'rgba(212,232,230,0.10)' }
                    }
                  >
                    <input
                      type="radio"
                      name="deployMailChoice"
                      checked={!deploySendEmail}
                      onChange={() => setDeploySendEmail(false)}
                      disabled={deployBusy}
                      className="mt-0.5 w-4 h-4 accent-[#9FCEC9] shrink-0"
                    />
                    <div className="flex-1 text-xs">
                      <p className="font-semibold">Alleen opslaan, geen mail</p>
                      <p className="text-muted-foreground mt-0.5">
                        Wijzigingen zijn al live — geen extra notificatie naar patiënt.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Extra instructions — verbergen als therapeut bij update koos voor
                alleen-opslaan (geen mail = geen bericht om mee te sturen). */}
            {!(currentStatus === 'ACTIVE' && !program.isTemplate && !deploySendEmail) && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Extra bericht voor patiënt <span className="text-muted-foreground font-normal">(optioneel)</span>
                </Label>
                <Textarea
                  placeholder="Bijv. begin rustig deze week, focus op techniek boven gewicht…"
                  value={deployInstructions}
                  onChange={e => setDeployInstructions(e.target.value)}
                  disabled={deployBusy}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  Wordt meegestuurd in de mail naar de patiënt.
                </p>
              </div>
            )}

            {/* Save-as-template optie — alleen tonen voor eerste-deploy (DRAFT),
                niet voor "stuur update-mail" op een al-actief programma waar het
                originele programma al een patient-kopie is. */}
            {currentStatus === 'DRAFT' && !program.isTemplate && (
              <label className="flex items-start gap-2 cursor-pointer select-none rounded-lg p-2 -mx-2 hover:bg-[rgba(212,232,230,0.03)]">
                <input
                  type="checkbox"
                  checked={deploySaveAsTemplate}
                  onChange={(e) => setDeploySaveAsTemplate(e.target.checked)}
                  disabled={deployBusy}
                  className="mt-0.5 w-4 h-4 accent-[#E87A55] shrink-0"
                />
                <div className="flex-1 text-xs">
                  <p className="font-semibold">Ook opslaan als sjabloon in bibliotheek</p>
                  <p className="text-muted-foreground mt-0.5">
                    Standaard verschijnt dit programma alleen bij {(() => {
                      const target = patientsList.find(p => p.id === deployPatientId)
                      return target?.name?.split(' ')[0] ?? 'de patiënt'
                    })()}. Vink aan om óók een herbruikbare kopie in je hoofd-bibliotheek te bewaren.
                  </p>
                </div>
              </label>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDeployDialogOpen(false)} disabled={deployBusy}>
                Annuleren
              </Button>
              <Button
                className="flex-1 gap-2"
                style={{ background: '#E87A55', color: '#0E2729' }}
                disabled={!deployPatientId || deployBusy}
                onClick={confirmDeploy}
              >
                <Rocket className="w-4 h-4" />
                {deployBusy
                  ? 'Bezig…'
                  : program.isTemplate
                    ? 'Toepassen + deploy'
                    : currentStatus === 'ACTIVE'
                      ? (deploySendEmail ? 'Update + mail' : 'Alleen opslaan')
                      : 'Deploy + mail'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DndContext>
  )
}

// ─── Bulk-copy menu (dag → dag / week → week) ─────────────────────────────────

function CopyMenu({
  weeks,
  days,
  currentWeek,
  currentDay,
  exerciseCountForDay,
  onCopyDay,
  onCopyWeek,
}: {
  weeks: number[]
  days: number[]
  currentWeek: number
  currentDay: number
  exerciseCountForDay: (day: number, week: number) => number
  onCopyDay: (toWeek: number, toDay: number) => void
  onCopyWeek: (toWeek: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  // Bij open: positioneer fixed t.o.v. viewport via button's bounding rect.
  // Wordt ge-portald naar body zodat parent-overflow-clipping niet stoort.
  useEffect(() => {
    if (!open) { setMenuPos(null); return }
    const updatePos = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)  // capture-fase voor inner scrolls
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        title="Kopieer deze dag of week"
        className="shrink-0 flex items-center gap-1 px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-[#1C4448] transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Kopieer</span>
      </button>
    )
  }

  const menuJsx = menuPos && (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={() => setOpen(false)}
      />
      <div
        className="fixed z-[70] rounded-xl shadow-2xl overflow-hidden"
        style={{
          top: menuPos.top,
          right: menuPos.right,
          background: '#15363A',
          border: '1px solid rgba(212,232,230,0.12)',
          minWidth: 280,
        }}
      >
          <div className="flex border-b" style={{ borderColor: 'rgba(212,232,230,0.08)' }}>
            <button
              type="button"
              onClick={() => setMode('day')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-bold tracking-wider uppercase transition-colors',
                mode === 'day' ? 'text-[#E87A55]' : 'text-muted-foreground',
              )}
              style={mode === 'day' ? { background: 'rgba(232,122,85,0.08)' } : {}}
            >
              Dag → dag
            </button>
            <button
              type="button"
              onClick={() => setMode('week')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-bold tracking-wider uppercase transition-colors',
                mode === 'week' ? 'text-[#E87A55]' : 'text-muted-foreground',
              )}
              style={mode === 'week' ? { background: 'rgba(232,122,85,0.08)' } : {}}
            >
              Week → week
            </button>
          </div>

          <div className="p-3">
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
              {mode === 'day'
                ? `Kopieer W${currentWeek} D${currentDay} naar …`
                : `Kopieer Week ${currentWeek} naar …`}
            </p>

            {mode === 'day' ? (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {weeks.map((w) => (
                  <div key={w}>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
                      Week {w}
                    </p>
                    <div className="grid grid-cols-7 gap-1">
                      {days.map((d) => {
                        const isCurrent = w === currentWeek && d === currentDay
                        const cnt = exerciseCountForDay(d, w)
                        return (
                          <button
                            key={`${w}-${d}`}
                            type="button"
                            disabled={isCurrent}
                            onClick={() => {
                              onCopyDay(w, d)
                              setOpen(false)
                            }}
                            title={isCurrent ? 'Huidige dag' : `W${w} D${d}${cnt > 0 ? ` (${cnt})` : ''}`}
                            className={cn(
                              'aspect-square rounded text-[10px] font-bold transition-colors flex flex-col items-center justify-center',
                              isCurrent
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:bg-[#E87A55] hover:text-[#0E2729]',
                            )}
                            style={{
                              background: cnt > 0 ? 'rgba(232,122,85,0.08)' : 'rgba(212,232,230,0.04)',
                              color: cnt > 0 ? '#E87A55' : '#9EB5B3',
                              border: '1px solid rgba(212,232,230,0.08)',
                            }}
                          >
                            <span>D{d}</span>
                            {cnt > 0 && <span className="text-[8px] opacity-70">{cnt}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {weeks.filter(w => w !== currentWeek).map((w) => {
                  const total = days.reduce((acc, d) => acc + exerciseCountForDay(d, w), 0)
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        onCopyWeek(w)
                        setOpen(false)
                      }}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#1C4448] transition-colors"
                      style={{ color: '#F5F2ED' }}
                    >
                      <span>Week {w}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {total > 0 ? `${total} bestaand` : 'leeg'}
                      </span>
                    </button>
                  )
                })}
                {weeks.length <= 1 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Er is maar één week. Voeg eerst een week toe om te kopiëren.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(false)}
        className="shrink-0 flex items-center gap-1 px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ background: '#1C4448', color: '#E87A55' }}
      >
        <Copy className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Kopieer</span>
      </button>
      {/* Portaal naar body zodat parent overflow-y-auto het menu niet
          afsnijdt en stacking-contexts geen z-index conflicten geven. */}
      {typeof window !== 'undefined' && menuJsx && createPortal(menuJsx, document.body)}
    </>
  )
}
