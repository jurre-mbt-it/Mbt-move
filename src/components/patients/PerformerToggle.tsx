'use client'

import { P } from '@/components/dark-ui'

export type PerformerFilter = 'all' | 'patient' | 'therapist'

const OPTIONS: Array<{ key: PerformerFilter; label: string }> = [
  { key: 'all', label: 'Alles' },
  { key: 'patient', label: 'Patiënt' },
  { key: 'therapist', label: 'Therapeut' },
]

export function PerformerToggle({
  value,
  onChange,
  ariaLabel = 'Filter op uitvoerder',
}: {
  value: PerformerFilter
  onChange: (v: PerformerFilter) => void
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid grid-cols-3 rounded-xl"
      style={{ background: P.surface, border: `1px solid ${P.line}`, padding: 3, gap: 3 }}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className="athletic-mono athletic-tap"
            style={{
              padding: '8px 10px',
              borderRadius: 9,
              background: active ? P.surfaceHi : 'transparent',
              color: active ? P.ink : P.inkMuted,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
