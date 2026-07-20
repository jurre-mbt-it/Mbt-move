'use client'

import { useMemo } from 'react'
import type { BuilderExercise } from './types'
import { AlertTriangle } from 'lucide-react'
import { strengthMuscleDose } from '@/lib/muscle-fatigue'

interface Props {
  exercises: BuilderExercise[]
  currentDay: number
  currentWeek: number
}

// Antagonist-paren in de 12-regio-vocabulaire (§1.0).
const MUSCLE_PAIRS: [string, string][] = [
  ['Quadriceps', 'Hamstrings'],
  ['Borst',      'Bovenrug'],
  ['Core',       'Onderrug'],
]

// Evidence-range harde sets per spiergroep per week (Schoenfeld 2017).
const WEEKLY_SETS_MIN = 10
const WEEKLY_SETS_MAX = 20

const LOAD_COLORS = [
  '', '#c6f7f2', '#5eead4', '#e87a55', '#0D9488', '#134E4A',
]

export function MuscleBalancePanel({ exercises, currentDay, currentWeek }: Props) {
  const dayExercises = exercises.filter(e => e.day === currentDay && e.week === currentWeek)

  const totals = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const ex of dayExercises) {
      // Dezelfde dose-functie als de logged-fatigue-engine, zodat geplande
      // belasting en gelogde vermoeidheid dezelfde taal spreken. BuilderExercise
      // heeft geen movementPattern/loadType → damageFactor valt terug op 1.0.
      const stim = {
        muscleLoads: ex.muscleLoads ?? {},
        sets: ex.sets,
        reps: ex.reps ?? 10,
        repUnit: ex.repUnit ?? 'reps',
        completedAt: new Date(), // niet gebruikt voor de dose zelf
      }
      for (const muscle of Object.keys(ex.muscleLoads ?? {})) {
        acc[muscle] = (acc[muscle] ?? 0) + strengthMuscleDose(stim, muscle)
      }
    }
    return acc
  }, [dayExercises])

  // Wekelijkse "harde sets" per spiergroep (involvement ≥ 3) over de hele week.
  // Dit is de maat waarin therapeuten redeneren (Schoenfeld 2017: ~10-20/week).
  const weeklyHardSets = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const ex of exercises) {
      if (ex.week !== currentWeek) continue
      for (const [muscle, load] of Object.entries(ex.muscleLoads ?? {})) {
        if (load >= 3) acc[muscle] = (acc[muscle] ?? 0) + ex.sets
      }
    }
    return Object.entries(acc).sort(([, a], [, b]) => b - a)
  }, [exercises, currentWeek])

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
        <p
          className="text-xs text-muted-foreground mt-0.5"
          title="Belastingspunten = spierbelasting van de oefening × sets, gewogen naar reps (laag = zwaarder) en extra gewicht. Relatief binnen deze dag — bedoeld om verhoudingen te zien, geen absolute maat."
        >
          Dag {currentDay} · Week {currentWeek} · belastingspunten
        </p>
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
            const color = LOAD_COLORS[intensity] ?? '#e87a55'

            return (
              <div key={muscle} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate">{muscle}</span>
                  <span className="font-semibold shrink-0 ml-1" style={{ color }}>{Math.round(load)}</span>
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

      {/* Kleur-legenda: intensiteit t.o.v. de zwaarst belaste spiergroep. */}
      {sorted.length > 0 && (
        <div className="px-3 py-1.5 border-t shrink-0 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">licht</span>
          <div className="flex-1 flex gap-0.5">
            {LOAD_COLORS.slice(1).map(c => (
              <div key={c} className="h-1.5 flex-1 rounded-sm" style={{ background: c }} />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">zwaar</span>
        </div>
      )}

      {/* Wekelijkse harde sets per spiergroep (Schoenfeld 10-20/week) */}
      {weeklyHardSets.length > 0 && (
        <div className="px-3 py-2 border-t shrink-0 space-y-1">
          <p
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            title="Harde sets = sets van oefeningen met belasting ≥ 3 voor die spiergroep, opgeteld over de hele week. Richtlijn 10-20 sets per spiergroep per week (Schoenfeld 2017)."
          >
            Harde sets · week {currentWeek}
          </p>
          {weeklyHardSets.map(([muscle, sets]) => {
            const color =
              sets < WEEKLY_SETS_MIN ? '#f59e0b' :
              sets <= WEEKLY_SETS_MAX ? '#10b981' :
              '#e87a55'
            const state =
              sets < WEEKLY_SETS_MIN ? 'onder' :
              sets <= WEEKLY_SETS_MAX ? 'op peil' :
              'hoog'
            return (
              <div key={muscle} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate">{muscle}</span>
                <span className="shrink-0 ml-1 font-semibold" style={{ color }}>
                  {sets} · {state}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Imbalance warnings */}
      {imbalances.length > 0 && (
        <div className="px-3 py-2 border-t shrink-0 space-y-1.5">
          <p className="text-xs font-semibold flex items-center gap-1" style={{ color: '#f59e0b' }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Onevenwichtigheden
          </p>
          {imbalances.map(([a, b]) => (
            <div
              key={`${a}-${b}`}
              className="text-xs rounded px-2 py-1"
              style={{ color: '#fbbf24', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}
              title="Meer dan 2× verschil in belasting tussen dit spierpaar op deze dag."
            >
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
              {Math.round(Object.values(totals).reduce((a, b) => a + b, 0))}
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
