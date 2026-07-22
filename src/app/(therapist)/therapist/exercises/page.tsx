'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { ExerciseCard } from '@/components/exercises/ExerciseCard'
import { MarkMatch } from '@/components/exercises/MarkMatch'
import { ExerciseVideoModal, type ExerciseForModal } from '@/components/exercises/ExerciseVideoModal'
import {
  EXERCISE_CATEGORIES,
  BODY_REGIONS,
  DIFFICULTIES,
} from '@/lib/exercise-constants'
import { keepPreviousData } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { IconFolder } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  CATEGORY_COLORS,
  DarkButton,
  DarkInput,
  Kicker,
  MetaLabel,
  P,
  SkeletonTile,
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
  isFavorite?: boolean
}

export default function ExercisesPage() {
  const portal = usePortal()
  const router = useRouter()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)
  const [activeCollection, setActiveCollection] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(true)
  const [modalExercise, setModalExercise] = useState<ExerciseForModal | null>(null)

  const utils = trpc.useUtils()

  // De zoekopdracht hoort op de server: die kent naast de letterlijke tekst ook
  // typefouten ("squad" → Squat) en synoniemen via tags. Even wachten met
  // versturen, anders gaat er per toetsaanslag een query uit.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  const [suggestOpen, setSuggestOpen] = useState(false)
  const { data: suggesties = [] } = trpc.exercises.suggest.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2, staleTime: 60_000 },
  )

  // Elke zoekterm is een eigen cache-sleutel. Zonder `keepPreviousData` klapt
  // de pagina bij elke toetsaanslag terug naar het laadscherm; nu blijft de
  // vorige uitslag staan tot de nieuwe binnen is.
  const lijstQuery = trpc.exercises.list.useQuery(
    { query: debouncedQuery.length >= 2 ? debouncedQuery : undefined },
    { staleTime: 30_000, placeholderData: keepPreviousData },
  )

  const lijstData = lijstQuery.data as ExerciseItem[] | undefined
  const exercises: ExerciseItem[] = useMemo(() => lijstData ?? [], [lijstData])
  const isLoading = lijstQuery.isLoading

  const toggleFavorite = trpc.exercises.toggleFavorite.useMutation({
    onSuccess: () => {
      void utils.exercises.list.invalidate()
    },
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
    return exercises.filter((ex) => {
      // Bewust géén filter op naam meer: de server heeft al gezocht, inclusief
      // typefouten en tag-synoniemen. Hier nog eens op `includes` filteren
      // gooide precies die treffers weg (op "squad" bleef er niets over).
      if (selectedCategory && ex.category !== selectedCategory) return false
      if (selectedRegion && !(ex.bodyRegion as string[]).includes(selectedRegion)) return false
      if (selectedDifficulty && ex.difficulty !== selectedDifficulty) return false
      // Filter by collection
      if (activeCollection && collectionExerciseIds && !collectionExerciseIds.has(ex.id)) return false
      // Filter op favorieten
      if (favoritesOnly && !ex.isFavorite) return false
      return true
    })
  }, [exercises, selectedCategory, selectedRegion, selectedDifficulty, activeCollection, collectionExerciseIds, favoritesOnly])

  /**
   * Staat er een letterlijke treffer tussen? Zo niet, dan komt de lijst puur
   * uit gelijkenis (typefouten en tag-verwantschap). Dat is nuttig, maar het
   * moet er wel bij staan: "rekken" lijkt volgens trigram-gelijkenis op de tag
   * "trekken", en dan krijg je roei-oefeningen op een zoekterm voor rekken.
   */
  const directeTreffer = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q.length < 2) return true
    // Op tags kijken we naar woordbegin en niet naar "bevat": de tag "trekken"
    // bevat letterlijk "rekken", en dan zou een zoektocht naar rekken zichzelf
    // als directe treffer bestempelen.
    const woordBegin = (tekst: string) =>
      tekst.toLowerCase().split(/[^a-z0-9]+/i).some(w => w.startsWith(q))
    return filtered.some(ex =>
      ex.name.toLowerCase().includes(q) ||
      (ex.tags ?? []).some((t: string) => woordBegin(t)),
    )
  }, [filtered, debouncedQuery])

  const favoritesCount = exercises.filter((ex) => ex.isFavorite).length
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
      editHref: `${portal.base}/exercises/${ex.id}/edit`,
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
            href={`${portal.base}/exercises/collections`}
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
            href={`${portal.base}/exercises/collections`}
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
              background: activeCollection === null ? P.brand : 'transparent',
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
            {!directeTreffer && filtered.length > 0 && (
              <p style={{ color: P.gold, fontSize: 12, marginTop: 4 }}>
                Geen oefening met &ldquo;{debouncedQuery}&rdquo; in de naam of tags. Dit lijkt erop.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DarkButton
              href={`${portal.base}/exercises/collections`}
              size="sm"
              variant="secondary"
            >
              <span className="hidden sm:inline">Collecties</span>
              <span className="sm:hidden inline-flex"><IconFolder size={16} /></span>
            </DarkButton>
            <DarkButton href={`${portal.base}/exercises/new`} size="sm">
              + <span className="hidden sm:inline ml-1">Nieuwe oefening</span>
            </DarkButton>
          </div>
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <DarkInput
              placeholder="Zoek oefeningen, tags…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSuggestOpen(true) }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => { setQuery(''); setSuggestOpen(false) }}
                style={{ color: P.inkMuted, fontSize: 16 }}
              >
                ×
              </button>
            )}

            {/* Woordsuggesties: welke woorden bestaan er in de bibliotheek,
                zodat je je zoekterm kunt afmaken voordat je verder typt. */}
            {suggestOpen && suggesties.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl overflow-hidden"
                style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
              >
                <div className="athletic-mono text-[9px] px-3 pt-2 pb-1" style={{ color: P.inkDim }}>
                  Gerelateerde zoekopties
                </div>
                {suggesties.map(w => (
                  <button
                    key={w}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setQuery(w); setSuggestOpen(false) }}
                    className="w-full text-left px-3 py-2 transition-colors"
                    style={{ color: P.ink, fontSize: 13, background: 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,232,230,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <strong style={{ fontWeight: 700 }}>{w.slice(0, query.trim().length)}</strong>
                    {w.slice(query.trim().length)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-pressed={favoritesOnly}
            aria-label={favoritesOnly ? 'Toon alle oefeningen' : 'Toon alleen favorieten'}
            className="athletic-tap inline-flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors"
            style={{
              background: favoritesOnly ? 'rgba(240,121,108,0.12)' : 'transparent',
              border: `1px solid ${favoritesOnly ? '#F0796C' : P.lineStrong}`,
              color: favoritesOnly ? '#F0796C' : P.inkMuted,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.04em',
            }}
          >
            <Heart
              className="w-3.5 h-3.5"
              style={{
                fill: favoritesOnly ? '#F0796C' : 'transparent',
                strokeWidth: 2,
              }}
            />
            {favoritesOnly ? 'Favorieten' : `Favorieten${favoritesCount > 0 ? ` · ${favoritesCount}` : ''}`}
          </button>

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
                background: view === 'grid' ? P.brand : 'transparent',
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
                background: view === 'list' ? P.brand : 'transparent',
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
                        background: selectedCategory === c.value ? P.brand : P.surfaceHi,
                        color: selectedCategory === c.value ? P.bg : P.inkMuted,
                        border: `1px solid ${selectedCategory === c.value ? P.brand : P.lineStrong}`,
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
                        background: selectedRegion === r.value ? P.brand : P.surfaceHi,
                        color: selectedRegion === r.value ? P.bg : P.inkMuted,
                        border: `1px solid ${selectedRegion === r.value ? P.brand : P.lineStrong}`,
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
                        background: selectedDifficulty === d.value ? P.brand : P.surfaceHi,
                        color: selectedDifficulty === d.value ? P.bg : P.inkMuted,
                        border: `1px solid ${selectedDifficulty === d.value ? P.brand : P.lineStrong}`,
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
          <div className="mbt-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonTile key={i} lines={3} />
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
                query={query}
                exercise={ex}
                onPreview={() => openPreview(ex)}
                onToggleFavorite={(id) => toggleFavorite.mutate({ exerciseId: id })}
                onQuickAdd={(id) => router.push(`${portal.base}/programs/new?addExerciseId=${id}`)}
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
                    <p style={{ color: P.ink, fontSize: 14, fontWeight: 600 }}>
                      <MarkMatch text={ex.name} query={query} />
                    </p>
                    <p
                      className="truncate"
                      style={{ color: P.inkMuted, fontSize: 12 }}
                    >
                      {ex.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite.mutate({ exerciseId: ex.id })
                      }}
                      aria-label={ex.isFavorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
                      className="athletic-tap w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        background: ex.isFavorite ? 'rgba(240,121,108,0.12)' : P.surfaceHi,
                      }}
                    >
                      <Heart
                        className="w-3.5 h-3.5"
                        style={{
                          color: ex.isFavorite ? '#F0796C' : P.inkMuted,
                          fill: ex.isFavorite ? '#F0796C' : 'transparent',
                          strokeWidth: 2,
                        }}
                      />
                    </button>
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
                        style={{ background: 'rgba(232,122,85,0.12)', color: P.lime, fontSize: 12 }}
                      >
                        ▶
                      </span>
                    )}
                  </div>
                  <Link
                    href={`${portal.base}/exercises/${ex.id}/edit`}
                    onClick={e => e.stopPropagation()}
                    onPointerEnter={() => utils.exercises.get.prefetch({ id: ex.id })}
                    onFocus={() => utils.exercises.get.prefetch({ id: ex.id })}
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
