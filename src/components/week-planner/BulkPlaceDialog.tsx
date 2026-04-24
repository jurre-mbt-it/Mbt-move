'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { P } from '@/components/dark-ui'
import type { ProgramOption } from './DayPicker'

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  programs: ProgramOption[]
  patientId: string | null
  onPlace: (args: { programId: string; weeks: number; daysOfWeek: number[] }) => Promise<void> | void
  placing?: boolean
}

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'Alle' },
  ...EXERCISE_CATEGORIES.map(c => ({ value: c.value, label: c.label })),
]

export function BulkPlaceDialog({ open, onOpenChange, programs, patientId, onPlace, placing }: Props) {
  const [category, setCategory] = useState<string>('ALL')
  const [programId, setProgramId] = useState<string | null>(null)
  const [weeks, setWeeks] = useState(4)
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(new Set([1, 3])) // Di + Do default

  const filtered = useMemo(
    () =>
      programs.filter(p => {
        if (p.isTemplate) return false
        if (category === 'ALL') return true
        return p.dominantCategory === category
      }),
    [programs, category],
  )

  const toggleDay = (d: number) => {
    setDaysOfWeek(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  const canPlace = !!patientId && !!programId && daysOfWeek.size > 0 && weeks > 0

  const handlePlace = async () => {
    if (!canPlace || !programId) return
    await onPlace({
      programId,
      weeks,
      daysOfWeek: Array.from(daysOfWeek).sort(),
    })
    onOpenChange(false)
    // reset
    setProgramId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" style={{ background: P.surface, color: P.ink, borderRadius: 16 }}>
        <DialogHeader>
          <DialogTitle style={{ color: P.ink, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 13 }}>
            Meerdere weken plaatsen
          </DialogTitle>
        </DialogHeader>

        {!patientId && (
          <p style={{ color: P.gold, fontSize: 12 }}>
            Selecteer eerst een patiënt in het schema om meerdere weken tegelijk te plaatsen.
          </p>
        )}

        {/* Categorie-chips */}
        <div className="space-y-1.5">
          <span className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
            CATEGORIE
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className="athletic-tap px-2.5 py-1 rounded-full text-xs font-bold"
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
        </div>

        {/* Program list */}
        <div className="space-y-1.5">
          <span className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
            PROGRAMMA
          </span>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p style={{ color: P.inkMuted, fontSize: 12 }}>Geen programma&apos;s in deze categorie.</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProgramId(p.id)}
                  className={cn('athletic-tap w-full text-left px-3 py-2 rounded-lg')}
                  style={{
                    background: programId === p.id ? 'rgba(190,242,100,0.16)' : P.surfaceHi,
                    border: programId === p.id ? `1px solid ${P.lime}` : `1px solid transparent`,
                    color: P.ink,
                  }}
                >
                  <span className="font-semibold text-sm">{p.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Weken */}
        <div className="flex items-end gap-4">
          <div className="flex-1 space-y-1.5">
            <span className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
              HOEVEEL WEKEN
            </span>
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={e => setWeeks(Math.max(1, Math.min(52, Number(e.target.value))))}
              className="w-20 h-9 text-sm rounded-md px-3 focus:outline-none"
              style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}` }}
            />
          </div>
        </div>

        {/* Dag-vinkjes */}
        <div className="space-y-1.5">
          <span className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
            DAGEN VAN DE WEEK
          </span>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className="athletic-tap w-10 h-10 rounded-lg text-xs font-bold"
                style={{
                  background: daysOfWeek.has(i) ? P.lime : P.surfaceHi,
                  color: daysOfWeek.has(i) ? '#0F1516' : P.ink,
                  letterSpacing: '0.06em',
                }}
              >
                {label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={placing}>
            Annuleren
          </Button>
          <Button
            style={{ background: canPlace ? P.lime : P.surfaceHi, color: canPlace ? '#0F1516' : P.inkMuted }}
            onClick={handlePlace}
            disabled={!canPlace || placing}
          >
            {placing ? 'Bezig…' : 'Plaatsen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
