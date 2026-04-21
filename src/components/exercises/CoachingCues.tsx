'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X, GripVertical } from 'lucide-react'

interface CoachingCuesProps {
  label?: string
  placeholder?: string
  value: string[]
  onChange: (v: string[]) => void
  maxItems?: number
}

export function CoachingCues({
  label = 'Coaching cues',
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
              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
              <div className="flex-1 flex items-center gap-2 bg-[#1C2425] rounded-lg px-3 py-2 text-sm border border-[rgba(255,255,255,0.12)]">
                <GripVertical className="w-3.5 h-3.5 text-zinc-300 shrink-0 cursor-grab" />
                <span className="flex-1">{cue}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#7B8889] hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="text-[#7B8889] hover:text-[#F5F7F6] disabled:opacity-30 text-xs leading-none"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, i + 1)}
                  className="text-[#7B8889] hover:text-[#F5F7F6] disabled:opacity-30 text-xs leading-none"
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
          <Input
            placeholder={placeholder}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="icon" onClick={add} disabled={!draft.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
