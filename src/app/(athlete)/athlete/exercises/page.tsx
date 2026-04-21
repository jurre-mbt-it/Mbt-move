'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc/client'
import { Plus, Search, Loader2, Dumbbell } from 'lucide-react'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH: '#BEF264',
  MOBILITY: '#60a5fa',
  PLYOMETRICS: '#f97316',
  CARDIO: '#ef4444',
  STABILITY: '#a78bfa',
}

export default function AthleteExercisesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const { data: exercises = [], isLoading } = trpc.exercises.list.useQuery(
    {
      query: search || undefined,
      category: categoryFilter || undefined,
    },
    { staleTime: 30_000 }
  )

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1C2425' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Oefeningen</h1>
            <p className="text-[#7B8889] text-xs mt-1">{exercises.length} oefeningen beschikbaar</p>
          </div>
          <Link href="/athlete/exercises/new">
            <Button size="sm" className="gap-1.5" style={{ background: '#BEF264' }}>
              <Plus className="w-4 h-4" /> Toevoegen
            </Button>
          </Link>
        </div>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Zoek oefening..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-[#141A1B]"
            style={{ borderRadius: '12px' }}
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition-colors ${
              !categoryFilter ? 'bg-[#1A3A3A] text-white' : 'bg-[#141A1B] text-muted-foreground border'
            }`}
            onClick={() => setCategoryFilter(null)}
          >
            Alles
          </button>
          {EXERCISE_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`text-xs px-3 py-1.5 rounded-full shrink-0 transition-colors ${
                categoryFilter === cat.value ? 'text-white' : 'bg-[#141A1B] text-muted-foreground border'
              }`}
              style={categoryFilter === cat.value ? { background: CATEGORY_COLORS[cat.value] } : {}}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Exercise list */}
        {!isLoading && (
          <div className="space-y-2">
            {exercises.map(ex => (
              <Card key={ex.id} style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: (CATEGORY_COLORS[ex.category] ?? '#BEF264') + '20' }}
                  >
                    <Dumbbell className="w-5 h-5" style={{ color: CATEGORY_COLORS[ex.category] ?? '#BEF264' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ex.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{ex.description}</p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ background: (CATEGORY_COLORS[ex.category] ?? '#BEF264') + '20', color: CATEGORY_COLORS[ex.category] ?? '#BEF264' }}
                  >
                    {EXERCISE_CATEGORIES.find(c => c.value === ex.category)?.label ?? ex.category}
                  </span>
                </CardContent>
              </Card>
            ))}

            {exercises.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Dumbbell className="w-8 h-8 text-zinc-300 mb-2" />
                <p className="text-sm text-muted-foreground">Geen oefeningen gevonden</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
