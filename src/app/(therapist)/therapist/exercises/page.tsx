'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
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
  CATEGORY_COLORS,
  DarkButton,
  DarkInput,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

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
    // Cast naar shallow type; tRPC inference is te diep voor TS (TS2589).
    const ids = (collectionExercises as { id: string }[]).map(e => e.id)
    return new Set(ids)
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
      <aside
        className="hidden md:flex md:flex-col w-52 shrink-0 pr-4 mr-6 gap-4"
        style={{ borderRight: `1px solid ${P.line}` }}
      >
        <div className="flex items-center justify-between">
          <Kicker>Collecties</Kicker>
          <Link
            href="/therapist/exercises/collections"
            className="athletic-tap w-6 h-6 rounded flex items-center justify-center"
            style={{ color: P.inkMuted, fontSize: 18, lineHeight: 1 }}
          >
            +
          </Link>
        </div>

        <button
          onClick={() => setActiveCollection(null)}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors athletic-tap"
          style={{
            background: activeCollection === null ? P.surfaceHi : 'transparent',
            color: activeCollection === null ? P.ink : P.inkMuted,
            fontSize: 13,
            fontWeight: activeCollection === null ? 700 : 500,
          }}
        >
          Alle oefeningen
          <span
            className="ml-auto athletic-mono"
            style={{ color: P.inkDim, fontSize: 11 }}
          >
            {exercises.length}
          </span>
        </button>

        {collections.map(col => (
          <button
            key={col.id}
            onClick={() => setActiveCollection(activeCollection === col.id ? null : col.id)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors athletic-tap"
            style={{
              background: activeCollection === col.id ? P.surfaceHi : 'transparent',
              color: activeCollection === col.id ? P.ink : P.inkMuted,
              fontSize: 13,
              fontWeight: activeCollection === col.id ? 700 : 500,
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
            <span className="truncate">{col.name}</span>
            <span
              className="ml-auto athletic-mono"
              style={{ color: P.inkDim, fontSize: 11 }}
            >
              {col.count}
            </span>
          </button>
        ))}

        <div className="pt-2" style={{ borderTop: `1px solid ${P.line}` }}>
          <Link
            href="/therapist/exercises/collections"
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}
          >
            BEHEER COLLECTIES →
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Mobile collection chips */}
        <div className="flex md:hidden gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setActiveCollection(null)}
            className="shrink-0 px-3 py-1.5 rounded-full athletic-mono transition-colors"
            style={{
              background: activeCollection === null ? P.lime : 'transparent',
              color: activeCollection === null ? P.bg : P.inkMuted,
              border: activeCollection === null ? 'none' : `1px solid ${P.lineStrong}`,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
            }}
          >
            Alle ({exercises.length})
          </button>
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => setActiveCollection(activeCollection === col.id ? null : col.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full athletic-mono transition-colors"
              style={{
                background: activeCollection === col.id ? col.color : 'transparent',
                color: activeCollection === col.id ? P.bg : P.inkMuted,
                border: activeCollection === col.id ? 'none' : `1px solid ${P.lineStrong}`,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
              {col.name}
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Kicker>Bibliotheek</Kicker>
            <h1
              className="athletic-display"
              style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
            >
              OEFENINGEN
            </h1>
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
              {filtered.length} oefening{filtered.length !== 1 ? 'en' : ''}
              {activeCollection && ` in collectie`}
              {' · '}
              Klik op een kaart voor de video
            </p>
          </div>
          <DarkButton href="/therapist/exercises/new" size="sm">
            + <span className="hidden sm:inline ml-1">Nieuwe oefening</span>
          </DarkButton>
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <DarkInput
              placeholder="Zoek oefeningen, tags…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setQuery('')}
                style={{ color: P.inkMuted, fontSize: 16 }}
              >
                ×
              </button>
            )}
          </div>

          <DarkButton
            variant="secondary"
            size="sm"
            onClick={() => setShowFilters(f => !f)}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </DarkButton>

          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: `1px solid ${P.lineStrong}` }}
          >
            <button
              onClick={() => setView('grid')}
              className="px-3 py-2 athletic-mono transition-colors"
              style={{
                background: view === 'grid' ? P.lime : 'transparent',
                color: view === 'grid' ? P.bg : P.inkMuted,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              GRID
            </button>
            <button
              onClick={() => setView('list')}
              className="px-3 py-2 athletic-mono transition-colors"
              style={{
                background: view === 'list' ? P.lime : 'transparent',
                color: view === 'list' ? P.bg : P.inkMuted,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              LIJST
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <Tile>
            <div className="flex flex-wrap gap-4">
              {/* Category filter */}
              <div className="flex flex-col gap-1.5">
                <MetaLabel>Categorie</MetaLabel>
                <div className="flex flex-wrap gap-1.5">
                  {EXERCISE_CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setSelectedCategory(selectedCategory === c.value ? null : c.value)}
                      className="px-2.5 py-1 rounded-full athletic-mono transition-colors"
                      style={{
                        background: selectedCategory === c.value ? P.lime : P.surfaceHi,
                        color: selectedCategory === c.value ? P.bg : P.inkMuted,
                        border: `1px solid ${selectedCategory === c.value ? P.lime : P.lineStrong}`,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Region filter */}
              <div className="flex flex-col gap-1.5">
                <MetaLabel>Lichaamsdeel</MetaLabel>
                <div className="flex flex-wrap gap-1.5">
                  {BODY_REGIONS.slice(0, 6).map(r => (
                    <button
                      key={r.value}
                      onClick={() => setSelectedRegion(selectedRegion === r.value ? null : r.value)}
                      className="px-2.5 py-1 rounded-full athletic-mono transition-colors"
                      style={{
                        background: selectedRegion === r.value ? P.lime : P.surfaceHi,
                        color: selectedRegion === r.value ? P.bg : P.inkMuted,
                        border: `1px solid ${selectedRegion === r.value ? P.lime : P.lineStrong}`,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty filter */}
              <div className="flex flex-col gap-1.5">
                <MetaLabel>Niveau</MetaLabel>
                <div className="flex gap-1.5">
                  {DIFFICULTIES.map(d => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDifficulty(selectedDifficulty === d.value ? null : d.value)}
                      className="px-2.5 py-1 rounded-full athletic-mono transition-colors"
                      style={{
                        background: selectedDifficulty === d.value ? P.lime : P.surfaceHi,
                        color: selectedDifficulty === d.value ? P.bg : P.inkMuted,
                        border: `1px solid ${selectedDifficulty === d.value ? P.lime : P.lineStrong}`,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="athletic-mono"
                    style={{ color: P.danger, fontSize: 11, letterSpacing: '0.08em', fontWeight: 700 }}
                  >
                    × WIS FILTERS
                  </button>
                </div>
              )}
            </div>
          </Tile>
        )}

        {/* Exercise grid / list */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ background: P.surfaceHi, color: P.inkMuted, fontSize: 22 }}
            >
              ○
            </div>
            <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>Geen oefeningen gevonden</p>
            <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
              Probeer andere zoektermen of filters
            </p>
            {activeFilterCount > 0 && (
              <DarkButton variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>
                Filters wissen
              </DarkButton>
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
          <div className="flex flex-col gap-2">
            {filtered.map((ex) => {
              const categoryColor =
                (CATEGORY_COLORS as Record<string, string>)[ex.category] ?? P.inkDim
              return (
                <div
                  key={ex.id}
                  onClick={() => openPreview(ex)}
                  className={cn(
                    'relative flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors athletic-tap',
                  )}
                  style={{
                    background: P.surface,
                    paddingLeft: 20,
                    borderLeft: `4px solid ${categoryColor}`,
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold"
                    style={{ background: categoryColor, color: P.bg, fontSize: 14 }}
                  >
                    {ex.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: P.ink, fontSize: 14, fontWeight: 600 }}>{ex.name}</p>
                    <p
                      className="truncate"
                      style={{ color: P.inkMuted, fontSize: 12 }}
                    >
                      {ex.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="athletic-mono px-2 py-0.5 rounded-full"
                      style={{
                        background: P.surfaceHi,
                        color: P.inkMuted,
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                      }}
                    >
                      {EXERCISE_CATEGORIES.find(c => c.value === ex.category)?.label}
                    </span>
                    <span
                      className="athletic-mono px-2 py-0.5 rounded-full"
                      style={{
                        border: `1px solid ${P.lineStrong}`,
                        color: P.inkMuted,
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                      }}
                    >
                      {DIFFICULTIES.find(d => d.value === ex.difficulty)?.label}
                    </span>
                    {ex.videoUrl && (
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(190,242,100,0.12)', color: P.lime, fontSize: 12 }}
                      >
                        ▶
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/therapist/exercises/${ex.id}/edit`}
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded-lg shrink-0 athletic-mono"
                    style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}
                  >
                    BEWERK
                  </Link>
                </div>
              )
            })}
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
