'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ExerciseCard } from '@/components/exercises/ExerciseCard'
import { ExerciseVideoModal, type ExerciseForModal } from '@/components/exercises/ExerciseVideoModal'
import {
  EXERCISE_CATEGORIES,
  BODY_REGIONS,
  DIFFICULTIES,
} from '@/lib/exercise-constants'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Filter,
  FolderOpen,
  ChevronRight,
  X,
  Play,
  Edit,
} from 'lucide-react'

type ExerciseItem = {
  id: string
  name: string
  category: string
  bodyRegion: string[]
  difficulty: string
  mediaType?: string | null
  videoUrl?: string | null
  thumbnailUrl?: string | null
  description?: string | null
  tags?: string[]
  muscleLoads?: Record<string, number>
}

export default function ExercisesPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)
  const [activeCollection, setActiveCollection] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(true)
  const [modalExercise, setModalExercise] = useState<ExerciseForModal | null>(null)

  const { data: exercises = [], isLoading } = trpc.exercises.list.useQuery(undefined, {
    staleTime: 30_000,
  })

  const { data: collections = [] } = trpc.exercises.listCollections.useQuery(undefined, {
    staleTime: 30_000,
  })

  // When a collection is active, fetch its exercise IDs
  const { data: collectionExercises } = trpc.exercises.getCollectionExercises.useQuery(
    { collectionId: activeCollection! },
    { enabled: !!activeCollection, staleTime: 10_000 },
  )

  const collectionExerciseIds = useMemo(() => {
    if (!collectionExercises) return null
    return new Set(collectionExercises.map(e => e.id))
  }, [collectionExercises])

  const filtered = useMemo(() => {
    return (exercises as ExerciseItem[]).filter((ex) => {
      if (query && !ex.name.toLowerCase().includes(query.toLowerCase()) &&
          !(ex.tags ?? []).some((t: string) => t.includes(query.toLowerCase()))) return false
      if (selectedCategory && ex.category !== selectedCategory) return false
      if (selectedRegion && !(ex.bodyRegion as string[]).includes(selectedRegion)) return false
      if (selectedDifficulty && ex.difficulty !== selectedDifficulty) return false
      // Filter by collection
      if (activeCollection && collectionExerciseIds && !collectionExerciseIds.has(ex.id)) return false
      return true
    })
  }, [exercises, query, selectedCategory, selectedRegion, selectedDifficulty, activeCollection, collectionExerciseIds])

  const activeFilterCount = [selectedCategory, selectedRegion, selectedDifficulty].filter(Boolean).length

  const clearFilters = () => {
    setSelectedCategory(null)
    setSelectedRegion(null)
    setSelectedDifficulty(null)
  }

  function openPreview(ex: ExerciseItem) {
    setModalExercise({
      id: ex.id,
      name: ex.name,
      description: ex.description,
      category: ex.category,
      difficulty: ex.difficulty,
      videoUrl: ex.videoUrl,
      muscleLoads: ex.muscleLoads,
      editHref: `/therapist/exercises/${ex.id}/edit`,
    })
  }

  return (
    <div className="flex gap-0">
      {/* Collections sidebar — desktop only */}
      <aside className="hidden md:block w-52 shrink-0 border-r pr-4 mr-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Collecties</h3>
          <Link href="/therapist/exercises/collections">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        <button
          onClick={() => setActiveCollection(null)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
            activeCollection === null ? 'bg-[#1C2425] font-medium' : 'text-muted-foreground hover:bg-[#1C2425]'
          )}
        >
          <FolderOpen className="w-4 h-4" />
          Alle oefeningen
          <span className="ml-auto text-xs text-muted-foreground">{exercises.length}</span>
        </button>

        {collections.map(col => (
          <button
            key={col.id}
            onClick={() => setActiveCollection(activeCollection === col.id ? null : col.id)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
              activeCollection === col.id ? 'bg-[#1C2425] font-medium' : 'text-muted-foreground hover:bg-[#1C2425]'
            )}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
            <span className="truncate">{col.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{col.count}</span>
          </button>
        ))}

        <div className="pt-2 border-t">
          <Link
            href="/therapist/exercises/collections"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Beheer collecties
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Mobile collection chips */}
        <div className="flex md:hidden gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setActiveCollection(null)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              activeCollection === null ? 'text-white border-transparent' : 'border-[rgba(255,255,255,0.12)] text-muted-foreground'
            )}
            style={activeCollection === null ? { background: '#BEF264' } : {}}
          >
            Alle ({exercises.length})
          </button>
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => setActiveCollection(activeCollection === col.id ? null : col.id)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                activeCollection === col.id ? 'text-white border-transparent' : 'border-[rgba(255,255,255,0.12)] text-muted-foreground'
              )}
              style={activeCollection === col.id ? { background: col.color } : {}}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
              {col.name}
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Oefeningen</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {filtered.length} oefening{filtered.length !== 1 ? 'en' : ''}
              {activeCollection && ` in collectie`}
              {' · '}
              <span className="text-xs">Klik op een kaart om de video te bekijken</span>
            </p>
          </div>
          <Link href="/therapist/exercises/new">
            <Button style={{ background: '#BEF264' }} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nieuwe oefening</span>
            </Button>
          </Link>
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Zoek oefeningen, tags..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
            />
            {query && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery('')}>
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="h-4 w-4 p-0 text-xs flex items-center justify-center" style={{ background: '#BEF264' }}>
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <div className="flex border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('grid')}
              className={cn('px-3 py-2 transition-colors', view === 'grid' ? 'bg-[#BEF264] text-white' : 'hover:bg-[#1C2425]')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('px-3 py-2 transition-colors', view === 'list' ? 'bg-[#BEF264] text-white' : 'hover:bg-[#1C2425]')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 p-4 bg-[#1C2425] rounded-xl border">
            {/* Category filter */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categorie</p>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setSelectedCategory(selectedCategory === c.value ? null : c.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      selectedCategory === c.value
                        ? 'border-transparent text-white'
                        : 'border-[rgba(255,255,255,0.12)] bg-[#141A1B] text-muted-foreground hover:border-[rgba(255,255,255,0.2)]'
                    )}
                    style={selectedCategory === c.value ? { background: '#BEF264' } : {}}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Region filter */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lichaamsdeel</p>
              <div className="flex flex-wrap gap-1.5">
                {BODY_REGIONS.slice(0, 6).map(r => (
                  <button
                    key={r.value}
                    onClick={() => setSelectedRegion(selectedRegion === r.value ? null : r.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      selectedRegion === r.value
                        ? 'bg-[#BEF264] text-white border-[#BEF264]'
                        : 'border-[rgba(255,255,255,0.12)] bg-[#141A1B] text-muted-foreground hover:border-[rgba(255,255,255,0.2)]'
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty filter */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Niveau</p>
              <div className="flex gap-1.5">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDifficulty(selectedDifficulty === d.value ? null : d.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      selectedDifficulty === d.value
                        ? 'bg-[#BEF264] text-white border-[#BEF264]'
                        : 'border-[rgba(255,255,255,0.12)] bg-[#141A1B] text-muted-foreground hover:border-[rgba(255,255,255,0.2)]'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex items-end">
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                  <X className="w-3 h-3" /> Wis filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Exercise grid / list */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-[#1C2425] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-[#1C2425] flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-[#7B8889]" />
            </div>
            <h3 className="font-medium">Geen oefeningen gevonden</h3>
            <p className="text-sm text-muted-foreground mt-1">Probeer andere zoektermen of filters</p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Filters wissen
              </Button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                onPreview={() => openPreview(ex)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center gap-4 p-4 rounded-xl border hover:border-[rgba(255,255,255,0.16)] hover:bg-[#1C2425] transition-colors cursor-pointer"
                onClick={() => openPreview(ex)}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm"
                  style={{ background: '#BEF264' }}
                >
                  {ex.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{ex.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{ex.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {EXERCISE_CATEGORIES.find(c => c.value === ex.category)?.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {DIFFICULTIES.find(d => d.value === ex.difficulty)?.label}
                  </Badge>
                  {ex.videoUrl && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#BEF26420' }}>
                      <Play className="w-3.5 h-3.5" style={{ color: '#BEF264' }} />
                    </div>
                  )}
                </div>
                <Link
                  href={`/therapist/exercises/${ex.id}/edit`}
                  onClick={e => e.stopPropagation()}
                  className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] transition-colors shrink-0"
                >
                  <Edit className="w-4 h-4 text-[#7B8889]" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video preview modal */}
      <ExerciseVideoModal
        open={!!modalExercise}
        onClose={() => setModalExercise(null)}
        exercise={modalExercise}
      />
    </div>
  )
}
