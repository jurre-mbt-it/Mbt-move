'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { Search } from 'lucide-react'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
  DarkInput,
  CATEGORY_COLORS,
} from '@/components/dark-ui'

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

function categoryColor(cat: string): string {
  return (CATEGORY_COLORS as Record<string, string>)[cat] ?? P.lime
}

export default function AthleteExercisesPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: exercises = [], isLoading } = (trpc.exercises.list.useQuery as any)(
    {
      query: search || undefined,
      category: categoryFilter || undefined,
    },
    { staleTime: 30_000 }
  )

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Kicker>BIBLIOTHEEK · {exercises.length} OEFENINGEN</Kicker>
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
            OEFENINGEN
          </h1>
        </div>

        {/* CTA: toevoegen */}
        <DarkButton
          href="/athlete/exercises/new"
          variant="primary"
          className="w-full"
        >
          + NIEUWE OEFENING
        </DarkButton>

        {/* Search */}
        <div style={{ position: 'relative' }}>
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
          <DarkInput
            placeholder="Zoek oefening..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className="shrink-0 rounded-full transition-colors"
            style={{
              padding: '6px 14px',
              background: !categoryFilter ? P.lime : P.surface,
              color: !categoryFilter ? P.bg : P.inkMuted,
              border: `1px solid ${!categoryFilter ? P.lime : P.line}`,
              fontFamily: mono,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            ALLES
          </button>
          {EXERCISE_CATEGORIES.map((cat) => {
            const active = categoryFilter === cat.value
            const color = categoryColor(cat.value)
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategoryFilter(active ? null : cat.value)}
                className="shrink-0 rounded-full transition-colors"
                style={{
                  padding: '6px 14px',
                  background: active ? color : P.surface,
                  color: active ? P.bg : P.inkMuted,
                  border: `1px solid ${active ? color : P.line}`,
                  fontFamily: mono,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Loading */}
        {isLoading && (
          <Tile style={{ padding: 32, textAlign: 'center' }}>
            <MetaLabel>LADEN…</MetaLabel>
          </Tile>
        )}

        {/* Exercise list */}
        {!isLoading && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {exercises.map((ex: any) => {
              const color = categoryColor(ex.category)
              const catLabel =
                EXERCISE_CATEGORIES.find((c) => c.value === ex.category)?.label ??
                ex.category
              return (
                <Link
                  key={ex.id}
                  href={`/athlete/exercises/${ex.id}`}
                  className="athletic-tap flex items-center gap-3 rounded-xl"
                  style={{
                    background: P.surface,
                    padding: '12px 14px',
                    borderLeft: `3px solid ${color}`,
                    border: `1px solid ${P.line}`,
                    textDecoration: 'none',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.line}`,
                      color,
                      fontFamily: mono,
                      fontSize: 14,
                      fontWeight: 900,
                    }}
                  >
                    {ex.name[0]?.toUpperCase() ?? '·'}
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
                      {ex.name}
                    </p>
                    <div
                      className="flex items-center gap-2"
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
                      <span style={{ color }}>{catLabel}</span>
                      {ex.description && (
                        <>
                          <span style={{ color: P.inkDim }}>·</span>
                          <span className="truncate">{ex.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span style={{ color: P.inkDim, fontSize: 18, fontWeight: 900 }} aria-hidden>
                    →
                  </span>
                </Link>
              )
            })}

            {exercises.length === 0 && (
              <Tile style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>💪</div>
                <MetaLabel>GEEN OEFENINGEN GEVONDEN</MetaLabel>
              </Tile>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
