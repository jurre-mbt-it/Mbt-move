'use client'

import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/exercise-constants'
import { P } from '@/components/dark-ui'

interface MuscleLoadSlidersProps {
  value: Partial<Record<MuscleGroup, number>>
  onChange: (v: Partial<Record<MuscleGroup, number>>) => void
}

const LOAD_LABELS = ['', 'LICHT', 'MATIG', 'GEMIDDELD', 'HOOG', 'MAX']
// Athletic-dark: licht→ice, matig→lime-soft, gemiddeld→lime, hoog→gold, max→orange/danger
const LOAD_COLORS = ['', P.ice, P.limeMid, P.lime, P.gold, P.orange]

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
      <p
        className="athletic-mono"
        style={{
          color: P.inkMuted,
          fontSize: 10,
          letterSpacing: '0.14em',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {activeCount > 0
          ? `${activeCount} SPIERGROEP${activeCount !== 1 ? 'EN' : ''} ACTIEF`
          : 'SCHUIF EEN SLIDER OM BELASTING IN TE STELLEN'}
      </p>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {MUSCLE_GROUPS.map(muscle => {
          const load = value[muscle] ?? 0
          const color = LOAD_COLORS[load] ?? LOAD_COLORS[0]
          const label = LOAD_LABELS[load] ?? ''

          return (
            <div
              key={muscle}
              className="grid items-center gap-3"
              style={{ gridTemplateColumns: '120px 1fr 60px' }}
            >
              <span
                className="truncate"
                style={{
                  color: load > 0 ? P.ink : P.inkMuted,
                  fontSize: 13,
                  fontWeight: load > 0 ? 800 : 600,
                  letterSpacing: '-0.01em',
                }}
              >
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
                  background:
                    load === 0
                      ? P.surfaceHi
                      : `linear-gradient(to right, ${color} 0%, ${color} ${(load / 5) * 100}%, ${P.surfaceHi} ${(load / 5) * 100}%, ${P.surfaceHi} 100%)`,
                  accentColor: color || P.lime,
                }}
              />
              <span
                className="athletic-mono text-right"
                style={{
                  color: load > 0 ? color : P.inkDim,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                }}
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
                className="athletic-mono rounded-full"
                style={{
                  background: LOAD_COLORS[load ?? 0] ?? P.lime,
                  color: P.bg,
                  padding: '3px 10px',
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {muscle} · {load}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
