'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

import { ExerciseLibraryPanel } from './ExerciseLibraryPanel'
import { ProgramExerciseBlock } from './ProgramExerciseBlock'
import { SupersetGroupBlock } from './SupersetGroupBlock'
import { MuscleBalancePanel } from './MuscleBalancePanel'
import type { BuilderExercise, ProgramState } from './types'
import { SUPERSET_LETTERS, DAY_LABELS } from '@/lib/program-constants'
import { MOCK_EXERCISES, EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

import {
  Save, Eye, Copy, FileDown, Plus, Trash2,
  ChevronLeft, ChevronRight, Layers, Search, CheckCircle2, X,
} from 'lucide-react'
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
        isOver ? 'bg-[#3ECF6A10] border-2 border-dashed border-[#3ECF6A]' : 'border-2 border-dashed border-transparent',
        isEmpty && !isOver && 'border-zinc-200 border-dashed'
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
    <div className="bg-white border rounded-lg shadow-xl px-3 py-2 text-sm font-semibold flex items-center gap-2 opacity-95">
      <div className="w-2 h-2 rounded-full bg-[#3ECF6A]" />
      {name}
    </div>
  )
}

// ─── Main ProgramBuilder ───────────────────────────────────────────────────────
interface ProgramBuilderProps {
  initialState?: Partial<ProgramState> & { exercises?: BuilderExercise[] }
  programId?: string
}

export function ProgramBuilder({ initialState, programId }: ProgramBuilderProps) {
  const router = useRouter()

  const [program, setProgram] = useState<ProgramState>(() => ({
    name: initialState?.name ?? 'Nieuw programma',
    description: initialState?.description ?? '',
    patientId: initialState?.patientId ?? null,
    weeks: initialState?.weeks ?? 1,
    daysPerWeek: initialState?.daysPerWeek ?? 3,
    currentWeek: 1,
    currentDay: 1,
    isTemplate: initialState?.isTemplate ?? false,
    exercises: initialState?.exercises ?? [],
  }))
  const [exercises, setExercises] = useState<BuilderExercise[]>(
    initialState?.exercises ?? []
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false)
  const [mobileSelected, setMobileSelected] = useState<Set<string>>(new Set())
  const [mobileQuery, setMobileQuery] = useState('')
  const [mobileCategory, setMobileCategory] = useState<string | null>(null)
  const createProgram = trpc.programs.create.useMutation()
  const saveProgram = trpc.programs.save.useMutation()
  const { data: libraryExercises = [] } = trpc.exercises.list.useQuery(undefined, { staleTime: 60_000 })
  const saving = createProgram.isPending || saveProgram.isPending

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // ── Derived ─────────────────────────────────────────────────────────────────
  const dayExercises = useMemo(() =>
    exercises
      .filter(e => e.day === program.currentDay && e.week === program.currentWeek)
      .sort((a, b) => {
        if (a.supersetGroup && a.supersetGroup === b.supersetGroup) return a.supersetOrder - b.supersetOrder
        return 0
      }),
    [exercises, program.currentDay, program.currentWeek]
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
    setExercises(prev => prev.map(e => e.uid === uid ? { ...e, ...patch } : e))
  }, [])

  const removeEx = useCallback((uid: string) => {
    setExercises(prev => prev.filter(e => e.uid !== uid))
  }, [])

  const toggleSelect = useCallback((uid: string) => {
    setExercises(prev => prev.map(e => e.uid === uid ? { ...e, selected: !e.selected } : e))
  }, [])

  const swapVariant = useCallback((uid: string, direction: 'easier' | 'harder') => {
    setExercises(prev => prev.map(e => {
      if (e.uid !== uid) return e
      // In production: look up the variant exercise and replace
      toast.info('Variant wisselen werkt met live data')
      return e
    }))
  }, [])

  const addFromLibrary = useCallback((ex: { id: string; name: string; category: string; difficulty: string; muscleLoads: unknown; videoUrl?: string | null; easierVariantId?: string | null; harderVariantId?: string | null }) => {
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
      reps: 10,
      repUnit: 'reps',
      rest: 60,
      extraParams: [],
      supersetGroup: null,
      supersetOrder: 0,
      selected: false,
      day: program.currentDay,
      week: program.currentWeek,
    }
    setExercises(prev => [...prev, newEx])
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
        sets: 3, reps: 10, repUnit: 'reps', rest: 60,
        extraParams: [], supersetGroup: null, supersetOrder: 0, selected: false,
        day: targetDay, week: targetWeek,
      }
      setExercises(prev => [...prev, newEx])
      return
    }

    // Reorder within canvas
    if (activeData?.type === 'canvas-exercise' && active.id !== over.id) {
      setExercises(prev => {
        const ids = prev.filter(e => e.day === program.currentDay && e.week === program.currentWeek)
          .map(e => e.uid)
        const oldIdx = ids.indexOf(active.id as string)
        const newIdx = ids.indexOf(over.id as string)
        if (oldIdx === -1 || newIdx === -1) return prev
        const reordered = arrayMove(ids, oldIdx, newIdx)
        const posMap = Object.fromEntries(reordered.map((uid, i) => [uid, i]))
        return prev.map(e => posMap[e.uid] !== undefined ? { ...e, supersetOrder: posMap[e.uid] } : e)
      })
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const exercisePayload = exercises.map((ex, i) => ({
      exerciseId: ex.exerciseId,
      week: ex.week,
      day: ex.day,
      order: i,
      sets: ex.sets,
      reps: ex.reps,
      repUnit: ex.repUnit,
      restTime: ex.rest,
      supersetGroup: ex.supersetGroup ?? null,
      supersetOrder: ex.supersetOrder,
      notes: null,
    }))

    try {
      if (programId) {
        await saveProgram.mutateAsync({
          id: programId,
          name: program.name,
          description: program.description ?? undefined,
          weeks: program.weeks,
          daysPerWeek: program.daysPerWeek,
          isTemplate: program.isTemplate,
          exercises: exercisePayload,
        })
      } else {
        const created = await createProgram.mutateAsync({
          name: program.name,
          description: program.description ?? undefined,
          weeks: program.weeks,
          daysPerWeek: program.daysPerWeek,
          isTemplate: program.isTemplate,
          patientId: program.patientId ?? null,
        })
        // Save exercises to the newly created program
        if (exercises.length > 0) {
          await saveProgram.mutateAsync({
            id: created.id,
            exercises: exercisePayload,
          })
        }
        router.push(`/therapist/programs/${created.id}/edit`)
        toast.success('Programma aangemaakt')
        return
      }
      toast.success('Programma opgeslagen')
    } catch {
      toast.error('Opslaan mislukt')
    }
  }

  const handleSaveAsTemplate = () => {
    setTemplateDialogOpen(false)
    toast.success('Opgeslagen als template')
  }

  // ── Week/day navigation ───────────────────────────────────────────────────────
  const days = Array.from({ length: program.daysPerWeek }, (_, i) => i + 1)
  const weeks = Array.from({ length: program.weeks }, (_, i) => i + 1)

  const exerciseCountForDay = (day: number, week: number) =>
    exercises.filter(e => e.day === day && e.week === week).length

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
        <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 border-b bg-white shrink-0">
          <button onClick={() => router.push('/therapist/programs')} className="text-muted-foreground hover:text-foreground shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Input
            value={program.name}
            onChange={e => setProgram(p => ({ ...p, name: e.target.value }))}
            className="h-8 text-sm font-semibold border-0 shadow-none focus-visible:ring-0 px-0 min-w-0"
          />
          <div className="flex-1" />

          {/* Week tabs — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1">
            {weeks.map(w => (
              <button
                key={w}
                onClick={() => setProgram(p => ({ ...p, currentWeek: w }))}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  program.currentWeek === w ? 'bg-zinc-900 text-white' : 'text-muted-foreground hover:bg-zinc-100'
                )}
              >
                W{w}
              </button>
            ))}
            {program.weeks < 8 && (
              <button
                onClick={() => setProgram(p => ({ ...p, weeks: p.weeks + 1 }))}
                className="px-1.5 py-1 rounded text-xs text-muted-foreground hover:bg-zinc-100"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1">
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setTemplateDialogOpen(true)}>
              <Layers className="w-3.5 h-3.5" />
              Als template
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => toast.info('PDF export werkt met Supabase')}>
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </div>

          <Button
            size="sm"
            className="gap-1.5 h-7 text-xs shrink-0"
            style={{ background: '#3ECF6A' }}
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '...' : 'Opslaan'}
          </Button>
        </div>

        {/* Mobile week tabs */}
        <div className="flex md:hidden items-center gap-1 px-3 py-2 border-b bg-white overflow-x-auto">
          {weeks.map(w => (
            <button
              key={w}
              onClick={() => setProgram(p => ({ ...p, currentWeek: w }))}
              className={cn(
                'shrink-0 px-3 py-1 rounded text-xs font-medium transition-colors',
                program.currentWeek === w ? 'bg-zinc-900 text-white' : 'text-muted-foreground bg-zinc-100'
              )}
            >
              Week {w}
            </button>
          ))}
          {program.weeks < 8 && (
            <button
              onClick={() => setProgram(p => ({ ...p, weeks: p.weeks + 1 }))}
              className="shrink-0 px-2 py-1 rounded text-xs text-muted-foreground bg-zinc-100"
            >
              + Week
            </button>
          )}
        </div>

        {/* ── Layout ── */}
        <div className="flex flex-1 min-h-0">

          {/* LEFT: library — desktop only */}
          <div className="hidden md:flex w-56 shrink-0 border-r overflow-hidden flex-col">
            <ExerciseLibraryPanel onAdd={addFromLibrary} exercises={libraryExercises.length > 0 ? libraryExercises as never : undefined} />
          </div>

          {/* CENTER: canvas */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* Day tabs */}
            <div className="flex items-center gap-1 px-3 md:px-4 pt-3 pb-2 border-b shrink-0 overflow-x-auto">
              {days.map(d => {
                const count = exerciseCountForDay(d, program.currentWeek)
                return (
                  <button
                    key={d}
                    onClick={() => setProgram(p => ({ ...p, currentDay: d }))}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors',
                      program.currentDay === d ? 'text-white' : 'text-muted-foreground hover:bg-zinc-100'
                    )}
                    style={program.currentDay === d ? { background: '#3ECF6A' } : {}}
                  >
                    {DAY_LABELS[d - 1]}
                    {count > 0 && (
                      <span
                        className="text-xs rounded-full px-1.5 py-0"
                        style={{
                          background: program.currentDay === d ? 'rgba(255,255,255,0.3)' : '#e4e4e7',
                          color: program.currentDay === d ? '#fff' : '#71717a',
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
                  className="shrink-0 px-2 py-1.5 rounded-lg text-xs md:text-sm text-muted-foreground hover:bg-zinc-100 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dag</span>
                </button>
              )}

              {selectedUids.length >= 2 && (
                <div className="ml-auto flex items-center gap-2 shrink-0">
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

            {/* Exercises */}
            <div className="flex-1 overflow-y-auto px-3 md:px-4 py-3 pb-32 md:pb-4">
              <DayDropZone day={program.currentDay} week={program.currentWeek} isEmpty={dayExercises.length === 0}>
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
                      <SortableContext
                        key={item.ex.uid}
                        items={[item.ex.uid]}
                        strategy={verticalListSortingStrategy}
                      >
                        <ProgramExerciseBlock
                          exercise={item.ex}
                          onUpdate={updateEx}
                          onRemove={removeEx}
                          onToggleSelect={toggleSelect}
                          onSwapVariant={swapVariant}
                        />
                      </SortableContext>
                    )
                  })}
                </div>
              </DayDropZone>
            </div>

            {/* Mobile: floating add button */}
            <div className="md:hidden fixed bottom-20 right-4 z-20">
              <Button
                onClick={() => setMobileLibraryOpen(true)}
                className="w-12 h-12 rounded-full shadow-lg"
                style={{ background: '#3ECF6A' }}
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
                    mobileCategory === c.value ? 'text-white border-transparent' : 'border-zinc-200 text-muted-foreground bg-white'
                  )}
                  style={mobileCategory === c.value ? { background: '#3ECF6A' } : {}}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
            {(libraryExercises.length > 0 ? libraryExercises : MOCK_EXERCISES)
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
                        ? 'border-[#3ECF6A] bg-[#f0fdf4]'
                        : 'border-zinc-100 bg-white hover:border-zinc-200'
                    )}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: { STRENGTH: '#3ECF6A', MOBILITY: '#60a5fa', PLYOMETRICS: '#f59e0b', CARDIO: '#f87171', STABILITY: '#a78bfa' }[ex.category] ?? '#3ECF6A' }}
                    />
                    <span className="flex-1 text-sm font-medium">{ex.name}</span>
                    {selected && <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#3ECF6A' }} />}
                  </button>
                )
              })
            }
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t shrink-0">
            <Button
              className="w-full gap-2"
              style={{ background: '#3ECF6A' }}
              disabled={mobileSelected.size === 0}
              onClick={() => {
                const source = libraryExercises.length > 0 ? libraryExercises : MOCK_EXERCISES
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

      {/* Template dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Opslaan als template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Dit programma wordt opgeslagen als herbruikbaar template voor de praktijk.
            </p>
            <div className="flex gap-2">
              <Button style={{ background: '#3ECF6A' }} onClick={handleSaveAsTemplate} className="flex-1">
                Opslaan als template
              </Button>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                Annuleren
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DndContext>
  )
}
