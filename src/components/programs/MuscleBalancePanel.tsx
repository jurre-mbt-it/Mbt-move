'use client'

import { useMemo } from 'react'
import type { BuilderExercise } from './types'
import { AlertTriangle } from 'lucide-react'

interface Props {
  exercises: BuilderExercise[]
  currentDay: number
  currentWeek: number
}

const MUSCLE_PAIRS: [string, string][] = [
  ['Quadriceps',   'Hamstrings'],
  ['Borst',        'Bovenrug'],
  ['Biceps',       'Triceps'],
  ['Schouders anterieur', 'Schouders posterieur'],
  ['Adductoren',   'Abductoren'],
]

const LOAD_COLORS = [
  '', '#c6f7f2', '#5eead4', '#BEF264', '#0D9488', '#134E4A',
]

export function MuscleBalancePanel({ exercises, currentDay, currentWeek }: Props) {
  const dayExercises = exercises.filter(e => e.day === currentDay && e.week === currentWeek)

  const totals = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const ex of dayExercises) {
      for (const [muscle, load] of Object.entries(ex.muscleLoads ?? {})) {
        acc[muscle] = (acc[muscle] ?? 0) + (load * ex.sets)
      }
    }
    return acc
  }, [dayExercises])

  const maxLoad = Math.max(...Object.values(totals), 1)

  const imbalances = useMemo(() =>
    MUSCLE_PAIRS.filter(([a, b]) => {
      const va = totals[a] ?? 0
      const vb = totals[b] ?? 0
      if (va === 0 && vb === 0) return false
      const ratio = va === 0 || vb === 0 ? 3 : Math.max(va, vb) / Math.min(va, vb)
      return ratio > 2
    }), [totals])

  const sorted = Object.entries(totals)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 border-b shrink-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Spiergroep balans</p>
        <p className="text-xs text-muted-foreground mt-0.5">Dag {currentDay} · Week {currentWeek}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Voeg oefeningen toe om de belasting te zien
          </p>
        ) : (
          sorted.map(([muscle, load]) => {
            const pct = Math.round((load / maxLoad) * 100)
            const intensity = Math.min(5, Math.ceil((load / maxLoad) * 5))
            const color = LOAD_COLORS[intensity] ?? '#BEF264'

            return (
              <div key={muscle} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate">{muscle}</span>
                  <span className="font-semibold shrink-0 ml-1" style={{ color }}>{load}</span>
                </div>
                <div className="h-1.5 bg-[#1C2425] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Imbalance warnings */}
      {imbalances.length > 0 && (
        <div className="px-3 py-2 border-t shrink-0 space-y-1.5">
          <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Onevenwichtigheden
          </p>
          {imbalances.map(([a, b]) => (
            <div key={`${a}-${b}`} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
              {a} vs {b}
            </div>
          ))}
        </div>
      )}

      {/* Total load summary */}
      {sorted.length > 0 && (
        <div className="px-3 py-2 border-t shrink-0">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Totale volume</span>
            <span className="font-semibold text-foreground">
              {Object.values(totals).reduce((a, b) => a + b, 0)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
            <span>Spiergroepen actief</span>
            <span className="font-semibold text-foreground">{sorted.length}</span>
          </div>
        </div>
      )}
    </div>
  )
}
