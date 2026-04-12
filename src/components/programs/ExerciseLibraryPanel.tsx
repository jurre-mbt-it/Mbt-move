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

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH:    '#4ECDC4',
  MOBILITY:    '#60a5fa',
  PLYOMETRICS: '#f59e0b',
  CARDIO:      '#f87171',
  STABILITY:   '#a78bfa',
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
  const color = CATEGORY_COLORS[exercise.category] ?? '#4ECDC4'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group flex items-center gap-2 px-2 py-2 rounded-lg border bg-white transition-all text-sm touch-none',
        isDragging ? 'opacity-40 shadow-lg cursor-grabbing' : 'hover:border-zinc-300 hover:bg-zinc-50 cursor-grab'
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-zinc-300 shrink-0" />

      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
      />

      <span className="flex-1 truncate font-medium text-xs">{exercise.name}</span>

      <button
        type="button"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onAdd(exercise)}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center hover:bg-zinc-200 shrink-0"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}

interface ExerciseLibraryPanelProps {
  onAdd: (ex: LibraryExercise) => void
  exercises?: LibraryExercise[]
}

export function ExerciseLibraryPanel({ onAdd, exercises: propExercises }: ExerciseLibraryPanelProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const allExercises = (propExercises ?? []) as LibraryExercise[]

  const filtered = useMemo(() =>
    allExercises.filter(e => {
      if (category && e.category !== category) return false
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false
      return true
    }), [allExercises, query, category])

  return (
    <div className="flex flex-col h-full">
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
                  ? 'text-white border-transparent'
                  : 'border-zinc-200 text-muted-foreground hover:border-zinc-400 bg-white'
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
      </div>

      <div className="px-3 py-2 border-t shrink-0">
        <p className="text-xs text-muted-foreground">
          Sleep of klik <Plus className="w-3 h-3 inline" /> om toe te voegen
        </p>
      </div>
    </div>
  )
}
