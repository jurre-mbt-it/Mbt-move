'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { P } from '@/components/dark-ui'

export type ProgramOption = {
  id: string
  name: string
  dominantCategory?: string | null
  isTemplate?: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayLabel: string
  programs: ProgramOption[]
  onPick: (programId: string | null) => void
}

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'Alle' },
  ...EXERCISE_CATEGORIES.map(c => ({ value: c.value, label: c.label })),
]

export function DayPicker({ open, onOpenChange, dayLabel, programs, onPick }: Props) {
  const [category, setCategory] = useState<string>('ALL')

  const filtered = useMemo(
    () =>
      programs.filter(p => {
        if (p.isTemplate) return false
        if (category === 'ALL') return true
        return p.dominantCategory === category
      }),
    [programs, category],
  )

  const handlePick = (programId: string | null) => {
    onPick(programId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" style={{ background: P.surface, color: P.ink, borderRadius: 16 }}>
        <DialogHeader>
          <DialogTitle style={{ color: P.ink, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 13 }}>
            {dayLabel} — programma kiezen
          </DialogTitle>
        </DialogHeader>

        {/* Categorie-chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {CATEGORY_OPTIONS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={cn(
                'athletic-tap px-2.5 py-1 rounded-full text-xs font-bold tracking-wide transition-colors',
              )}
              style={{
                background: category === c.value ? P.lime : P.surfaceHi,
                color: category === c.value ? '#0F1516' : P.ink,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Program list */}
        <div className="max-h-72 overflow-y-auto space-y-1 mt-2">
          {filtered.length === 0 ? (
            <p style={{ color: P.inkMuted, fontSize: 12, padding: '16px 4px' }}>
              Geen programma&apos;s in deze categorie. Maak er een aan via /therapist/programs.
            </p>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePick(p.id)}
                className="athletic-tap w-full text-left px-3 py-2 rounded-lg transition-colors hover:brightness-110"
                style={{ background: P.surfaceHi, color: P.ink }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: categoryColor(p.dominantCategory) }}
                  />
                  <span className="font-semibold text-sm truncate">{p.name}</span>
                  {p.dominantCategory && (
                    <span
                      className="athletic-mono ml-auto text-[10px] tracking-wider"
                      style={{ color: P.inkMuted }}
                    >
                      {categoryLabel(p.dominantCategory)}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Rustdag */}
        <button
          type="button"
          onClick={() => handlePick(null)}
          className="athletic-tap w-full text-left px-3 py-2 rounded-lg mt-2"
          style={{
            background: P.surfaceLow,
            color: P.inkMuted,
            border: `1px dashed ${P.line}`,
          }}
        >
          <span className="font-semibold text-sm">— Rustdag —</span>
        </button>
      </DialogContent>
    </Dialog>
  )
}

function categoryLabel(cat: string | null | undefined): string {
  const found = EXERCISE_CATEGORIES.find(c => c.value === cat)
  return found?.label ?? ''
}

function categoryColor(cat: string | null | undefined): string {
  switch (cat) {
    case 'STRENGTH': return '#BEF264'
    case 'MOBILITY': return '#60a5fa'
    case 'PLYOMETRICS': return '#f59e0b'
    case 'CARDIO': return '#f87171'
    case 'STABILITY': return '#a78bfa'
    default: return '#7B8889'
  }
}
