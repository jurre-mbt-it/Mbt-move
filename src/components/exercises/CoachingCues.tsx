'use client'

import { useState } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import { P, DarkInput } from '@/components/dark-ui'

interface CoachingCuesProps {
  label?: string
  placeholder?: string
  value: string[]
  onChange: (v: string[]) => void
  maxItems?: number
}

export function CoachingCues({
  placeholder = 'Voeg een cue toe...',
  value,
  onChange,
  maxItems = 20,
}: CoachingCuesProps) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setDraft('')
  }

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  const move = (from: number, to: number) => {
    const next = [...value]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ol className="space-y-1.5">
          {value.map((cue, i) => (
            <li key={i} className="flex items-center gap-2 group">
              <span
                className="athletic-mono shrink-0 text-right"
                style={{
                  color: P.inkMuted,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  width: 20,
                }}
              >
                {i + 1}.
              </span>
              <div
                className="flex-1 flex items-center gap-2 rounded-lg"
                style={{
                  background: P.surfaceHi,
                  border: `1px solid ${P.line}`,
                  padding: '8px 12px',
                }}
              >
                <GripVertical
                  className="w-3.5 h-3.5 shrink-0 cursor-grab"
                  style={{ color: P.inkDim }}
                />
                <span
                  className="flex-1"
                  style={{ color: P.ink, fontSize: 13, lineHeight: '18px' }}
                >
                  {cue}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="athletic-tap opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ color: P.inkMuted }}
                  aria-label="Verwijder"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="athletic-tap leading-none"
                  style={{
                    color: i === 0 ? P.inkDim : P.inkMuted,
                    fontSize: 11,
                  }}
                  aria-label="Omhoog"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="athletic-tap leading-none"
                  style={{
                    color: i === value.length - 1 ? P.inkDim : P.inkMuted,
                    fontSize: 11,
                  }}
                  aria-label="Omlaag"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {value.length < maxItems && (
        <div className="flex gap-2">
          <DarkInput
            placeholder={placeholder}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            className="flex-1"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="athletic-tap rounded-xl shrink-0 flex items-center justify-center"
            style={{
              background: draft.trim() ? P.lime : P.surfaceHi,
              color: draft.trim() ? P.bg : P.inkDim,
              border: `1px solid ${draft.trim() ? P.lime : P.lineStrong}`,
              width: 48,
              height: 48,
              fontSize: 16,
              fontWeight: 900,
            }}
            aria-label="Toevoegen"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
