'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, X, Search, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { P, DarkInput, MetaLabel } from '@/components/dark-ui'

interface ProgressionPickerProps {
  easierVariantId: string | null
  harderVariantId: string | null
  currentId?: string
  onChangeEasier: (id: string | null) => void
  onChangeHarder: (id: string | null) => void
}

function ExercisePicker({
  label,
  icon,
  color,
  selectedId,
  excludeId,
  onSelect,
}: {
  label: string
  icon: React.ReactNode
  color: string
  selectedId: string | null
  excludeId?: string
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const { data, isLoading } = trpc.exercises.list.useQuery(undefined, {
    staleTime: 60_000,
  })
  const allExercises = (data ?? []) as Array<{ id: string; name: string; difficulty: string }>

  const exercises = allExercises.filter(
    e => e.id !== excludeId && e.name.toLowerCase().includes(query.toLowerCase()),
  )
  const selected = allExercises.find(e => e.id === selectedId)

  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2"
        style={{
          color: P.ink,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {icon}
        <span>{label}</span>
      </div>

      {selected ? (
        <div
          className="flex items-center justify-between rounded-lg"
          style={{
            background: `${color}18`,
            border: `1px solid ${color}55`,
            padding: '10px 14px',
          }}
        >
          <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
            {selected.name}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="athletic-tap"
            style={{ color: P.inkMuted }}
            aria-label="Verwijder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="athletic-tap w-full flex items-center gap-2 rounded-xl"
            style={{
              background: P.surfaceHi,
              border: `1px solid ${P.lineStrong}`,
              color: P.inkMuted,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 700,
              textAlign: 'left',
            }}
          >
            <Search className="w-4 h-4" />
            Zoek oefening...
          </button>

          {open && (
            <div
              className="absolute top-full mt-1 w-full z-50 rounded-xl overflow-hidden"
              style={{
                background: P.surface,
                border: `1px solid ${P.lineStrong}`,
                boxShadow: '0 10px 30px -10px rgba(0,0,0,0.6)',
              }}
            >
              <div className="p-2" style={{ borderBottom: `1px solid ${P.line}` }}>
                <DarkInput
                  placeholder="Zoeken..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                  style={{ padding: '8px 12px', fontSize: 13 }}
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: P.inkMuted }} />
                  </div>
                ) : exercises.length === 0 ? (
                  <p
                    className="athletic-mono"
                    style={{
                      color: P.inkMuted,
                      padding: '10px 14px',
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Geen oefeningen gevonden
                  </p>
                ) : (
                  exercises.map(ex => (
                    <button
                      key={ex.id}
                      type="button"
                      className="athletic-tap w-full text-left flex items-center justify-between transition-colors"
                      style={{
                        padding: '10px 14px',
                        color: P.ink,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = P.surfaceHi)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => {
                        onSelect(ex.id)
                        setOpen(false)
                        setQuery('')
                      }}
                    >
                      <span>{ex.name}</span>
                      <MetaLabel style={{ color: P.inkMuted }}>{ex.difficulty}</MetaLabel>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProgressionPicker({
  easierVariantId,
  harderVariantId,
  currentId,
  onChangeEasier,
  onChangeHarder,
}: ProgressionPickerProps) {
  return (
    <div className="space-y-4">
      <ExercisePicker
        label="Makkelijkere variant"
        icon={<ArrowDown className="w-4 h-4" style={{ color: P.ice }} />}
        color={P.ice}
        selectedId={easierVariantId}
        excludeId={currentId}
        onSelect={onChangeEasier}
      />
      <ExercisePicker
        label="Moeilijkere variant"
        icon={<ArrowUp className="w-4 h-4" style={{ color: P.gold }} />}
        color={P.gold}
        selectedId={harderVariantId}
        excludeId={currentId}
        onSelect={onChangeHarder}
      />
    </div>
  )
}
