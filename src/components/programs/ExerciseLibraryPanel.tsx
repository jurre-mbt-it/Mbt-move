'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { SUPERSET_COLORS } from '@/lib/program-constants'
import { cn } from '@/lib/utils'
import { Search, Plus, GripVertical, X } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH:    '#5FD08A',
  MOBILITY:    '#7FB0D8',
  PLYOMETRICS: '#F5B942',
  CARDIO:      '#F0796C',
  STABILITY:   '#45A8A2',
}

interface LibraryExercise {
  id: string
  name: string
  category: string
  bodyRegion: string[]
  difficulty: string
  mediaType?: string | null
  videoUrl?: string | null
  thumbnailUrl?: string | null
  description?: string | null
  tags: string[]
  instructions: string[]
  muscleLoads: Record<string, number>
  isPublic: boolean
  createdById: string
  createdAt: Date
}

function DraggableLibraryItem({
  exercise,
  onAdd,
}: {
  exercise: LibraryExercise
  onAdd: (ex: LibraryExercise) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-${exercise.id}`,
    data: { type: 'library-exercise', exercise },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const color = CATEGORY_COLORS[exercise.category] ?? '#E87A55'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group flex items-center gap-2 px-2 py-2 rounded-lg border bg-[#15363A] transition-all text-sm touch-none',
        isDragging ? 'opacity-40 shadow-lg cursor-grabbing' : 'hover:border-[rgba(212,232,230,0.16)] hover:bg-[#1C4448] cursor-grab'
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-[#9EB5B3] shrink-0" />

      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
      />

      <span className="flex-1 truncate font-medium text-xs">{exercise.name}</span>

      <button
        type="button"
        aria-label={`Voeg ${exercise.name} toe aan programma`}
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onAdd(exercise)}
        className="w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 hover:bg-[#E87A55] hover:text-[#0E2729]"
        style={{ background: 'rgba(232,122,85,0.12)', color: '#E87A55', border: '1px solid rgba(232,122,85,0.30)' }}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export interface LibraryResource {
  id: string
  title: string
  format: 'VIDEO' | 'PDF'
  videoUrl?: string | null
  thumbnailUrl?: string | null
}

function ResourceLibraryItem({
  resource,
  onAdd,
}: {
  resource: LibraryResource
  onAdd: (r: LibraryResource) => void
}) {
  const color = resource.format === 'PDF' ? '#7FB0D8' : '#E87A55'
  return (
    <div className="group flex items-center gap-2 px-2 py-2 rounded-lg border bg-[#15363A] text-sm hover:border-[rgba(212,232,230,0.16)] hover:bg-[#1C4448]">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 truncate font-medium text-xs">{resource.title}</span>
      <span className="text-[9px] font-bold tracking-wider shrink-0" style={{ color }}>
        {resource.format}
      </span>
      <button
        type="button"
        aria-label={`Voeg ${resource.title} toe aan programma`}
        onClick={() => onAdd(resource)}
        className="w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 hover:bg-[#E87A55] hover:text-[#0E2729]"
        style={{ background: 'rgba(232,122,85,0.12)', color: '#E87A55', border: '1px solid rgba(232,122,85,0.30)' }}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

interface ExerciseLibraryPanelProps {
  onAdd: (ex: LibraryExercise) => void
  exercises?: LibraryExercise[]
  /** Optioneel: educatie toevoegen via de "Leer"-tab. Zonder deze prop
   *  verschijnt de tab niet (backwards-compatible). */
  onAddResource?: (r: LibraryResource) => void
}

export function ExerciseLibraryPanel({ onAdd, exercises: propExercises, onAddResource }: ExerciseLibraryPanelProps) {
  const [tab, setTab] = useState<'move' | 'learn'>('move')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [quickAddCategory, setQuickAddCategory] = useState<string | null>(null)
  const [resourceQuery, setResourceQuery] = useState('')
  const utils = trpc.useUtils()
  const createExercise = trpc.exercises.create.useMutation({
    onSuccess: () => utils.exercises.list.invalidate(),
  })

  // Educatie-bibliotheek (alleen ophalen wanneer de Leer-tab actief is).
  const resourcesQuery = trpc.education.list.useQuery(undefined, {
    enabled: tab === 'learn' && !!onAddResource,
  })
  const filteredResources = useMemo(() => {
    const all = resourcesQuery.data ?? []
    if (!resourceQuery.trim()) return all
    const q = resourceQuery.toLowerCase()
    return all.filter(r => r.title.toLowerCase().includes(q))
  }, [resourcesQuery.data, resourceQuery])

  const allExercises = (propExercises ?? []) as LibraryExercise[]

  const filtered = useMemo(() =>
    allExercises.filter(e => {
      if (category && e.category !== category) return false
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false
      return true
    }), [allExercises, query, category])

  return (
    <div className="flex flex-col h-full">
      {/* Beweeg / Leer tab-strip (Leer alleen als onAddResource is meegegeven) */}
      {onAddResource && (
        <div className="flex gap-1 px-3 pt-3 shrink-0">
          {([['move', 'Exercise'], ['learn', 'Educatie']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                tab === key
                  ? 'text-[#0E2729] border-transparent'
                  : 'border-[rgba(212,232,230,0.12)] text-muted-foreground hover:border-[rgba(212,232,230,0.2)] bg-[#15363A]',
              )}
              style={tab === key ? { background: '#E87A55' } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {onAddResource && tab === 'learn' ? (
        <>
          <div className="px-3 pt-2 pb-2 border-b space-y-2 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Educatie</p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Zoeken..."
                value={resourceQuery}
                onChange={e => setResourceQuery(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {resourcesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Laden…</p>
            ) : filteredResources.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Geen educatie-content. Een admin voegt deze toe via Admin → Educatie.
              </p>
            ) : (
              filteredResources.map(r => (
                <ResourceLibraryItem
                  key={r.id}
                  resource={{ id: r.id, title: r.title, format: r.format, videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl }}
                  onAdd={onAddResource}
                />
              ))
            )}
          </div>
          <div className="px-3 py-2 border-t shrink-0">
            <p className="text-xs text-muted-foreground">
              Klik <Plus className="w-3 h-3 inline" /> om aan de huidige dag toe te voegen
            </p>
          </div>
        </>
      ) : (
      <>
      <div className="px-3 pt-3 pb-2 border-b space-y-2 shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Oefeningen</p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
          {query && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQuery('')}>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {EXERCISE_CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(category === c.value ? null : c.value)}
              className={cn(
                'px-1.5 py-0.5 rounded text-xs font-medium transition-colors border',
                category === c.value
                  ? 'text-[#0E2729] border-transparent'
                  : 'border-[rgba(212,232,230,0.12)] text-muted-foreground hover:border-[rgba(212,232,230,0.2)] bg-[#15363A]'
              )}
              style={category === c.value ? { background: CATEGORY_COLORS[c.value] } : {}}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Geen oefeningen</p>
        ) : (
          filtered.map(ex => (
            <DraggableLibraryItem key={ex.id} exercise={ex} onAdd={onAdd} />
          ))
        )}

        {/* Quick-add: wanneer er niks matcht en er is een zoekterm */}
        {query.trim().length >= 2 && filtered.length === 0 && (
          <div className="mt-2 p-2 rounded border border-dashed" style={{ borderColor: '#E87A55' }}>
            {!quickAddCategory ? (
              <button
                type="button"
                onClick={() => setQuickAddCategory('STRENGTH')}
                className="w-full text-xs text-left px-2 py-1.5 rounded hover:bg-[rgba(212,232,230,0.06)]"
                style={{ color: '#E87A55', fontWeight: 700 }}
              >
                + Voeg &ldquo;{query.trim()}&rdquo; toe als nieuwe oefening
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Categorie voor &ldquo;{query.trim()}&rdquo;</p>
                <div className="flex flex-wrap gap-1">
                  {EXERCISE_CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setQuickAddCategory(c.value)}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-xs font-medium border',
                        quickAddCategory === c.value ? 'text-[#0E2729] border-transparent' : 'border-[rgba(212,232,230,0.12)] text-muted-foreground',
                      )}
                      style={quickAddCategory === c.value ? { background: CATEGORY_COLORS[c.value] } : {}}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
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
                        onAdd({
                          id: created.id,
                          name: created.name,
                          category: created.category,
                          bodyRegion: created.bodyRegion as string[],
                          difficulty: created.difficulty,
                          tags: created.tags,
                          instructions: created.instructions,
                          muscleLoads: created.muscleLoads as unknown as Record<string, number>,
                          isPublic: created.isPublic,
                          createdById: created.createdById,
                          createdAt: new Date(created.createdAt),
                        })
                        setQuery('')
                        setQuickAddCategory(null)
                        toast.success(`"${created.name}" toegevoegd`)
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Toevoegen mislukt')
                      }
                    }}
                    className="px-2 py-1 rounded text-xs font-bold"
                    style={{ background: '#E87A55', color: '#0E2729' }}
                  >
                    TOEVOEGEN
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickAddCategory(null)}
                    className="px-2 py-1 text-xs text-muted-foreground"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t shrink-0">
        <p className="text-xs text-muted-foreground">
          Sleep of klik <Plus className="w-3 h-3 inline" /> om toe te voegen
        </p>
      </div>
      </>
      )}
    </div>
  )
}
