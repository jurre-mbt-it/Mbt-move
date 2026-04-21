'use client'

import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/exercise-constants'
import { cn } from '@/lib/utils'

interface MuscleLoadSlidersProps {
  value: Partial<Record<MuscleGroup, number>>
  onChange: (v: Partial<Record<MuscleGroup, number>>) => void
}

const LOAD_LABELS = ['', 'Licht', 'Matig', 'Gemiddeld', 'Hoog', 'Maximaal']
const LOAD_COLORS = ['', '#c6f7f2', '#5eead4', '#BEF264', '#0D9488', '#134E4A']

export function MuscleLoadSliders({ value, onChange }: MuscleLoadSlidersProps) {
  const handleChange = (muscle: MuscleGroup, load: number) => {
    if (load === 0) {
      const next = { ...value }
      delete next[muscle]
      onChange(next)
    } else {
      onChange({ ...value, [muscle]: load })
    }
  }

  const activeCount = Object.values(value).filter(v => v && v > 0).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {activeCount > 0 ? `${activeCount} spiergroep${activeCount !== 1 ? 'en' : ''} actief` : 'Schuif een slider om spiergroepbelasting in te stellen'}
      </p>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {MUSCLE_GROUPS.map(muscle => {
          const load = value[muscle] ?? 0
          const color = LOAD_COLORS[load] ?? LOAD_COLORS[0]
          const label = LOAD_LABELS[load] ?? ''

          return (
            <div key={muscle} className="grid grid-cols-[140px_1fr_60px] items-center gap-3">
              <span className={cn('text-sm truncate', load > 0 ? 'font-medium' : 'text-muted-foreground')}>
                {muscle}
              </span>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={load}
                onChange={e => handleChange(muscle, Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: load === 0
                    ? 'rgba(255,255,255,0.12)'
                    : `linear-gradient(to right, ${color} 0%, ${color} ${(load / 5) * 100}%, #e4e4e7 ${(load / 5) * 100}%, #e4e4e7 100%)`,
                  accentColor: '#BEF264',
                }}
              />
              <span
                className="text-xs text-right font-medium"
                style={{ color: load > 0 ? LOAD_COLORS[load] : '#a1a1aa' }}
              >
                {load > 0 ? label : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(value)
            .filter(([, v]) => v && v > 0)
            .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
            .map(([muscle, load]) => (
              <span
                key={muscle}
                className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                style={{ background: LOAD_COLORS[load ?? 0] ?? '#BEF264' }}
              >
                {muscle} · {load}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
