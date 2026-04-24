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
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { Plus, ChevronLeft } from 'lucide-react'

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
  /** Patiënt van dit schema (nodig om te bepalen of quick-create "alleen voor patiënt" kan). */
  patientId: string | null
  patientName?: string | null
  onPick: (programId: string | null) => void
}

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'Alle' },
  ...EXERCISE_CATEGORIES.map(c => ({ value: c.value, label: c.label })),
]

type Mode = 'pick' | 'create'
type Destination = 'patient' | 'library'

export function DayPicker({ open, onOpenChange, dayLabel, programs, patientId, patientName, onPick }: Props) {
  const [mode, setMode] = useState<Mode>('pick')
  const [category, setCategory] = useState<string>('ALL')

  // Create form state
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<string>('STRENGTH')
  const [destination, setDestination] = useState<Destination>(patientId ? 'patient' : 'library')

  const utils = trpc.useUtils()
  const createProgram = trpc.programs.create.useMutation()

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
    setMode('pick')
  }

  const resetCreate = () => {
    setNewName('')
    setNewCategory('STRENGTH')
    setDestination(patientId ? 'patient' : 'library')
  }

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Geef het programma een naam')
      return
    }
    try {
      const program = await createProgram.mutateAsync({
        name: newName.trim(),
        patientId: destination === 'patient' ? patientId ?? null : null,
        isTemplate: destination === 'library',
        type: newCategory as 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY',
      })
      await utils.programs.list.invalidate()
      toast.success('Programma aangemaakt en geplaatst — voeg oefeningen toe in de programma-editor')
      handlePick(program.id)
      resetCreate()
    } catch {
      toast.error('Aanmaken mislukt')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setMode('pick') }}>
      <DialogContent className="max-w-lg" style={{ background: P.surface, color: P.ink, borderRadius: 16 }}>
        <DialogHeader>
          <DialogTitle style={{ color: P.ink, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 13 }}>
            {mode === 'create' ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('pick')}
                  className="athletic-tap w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ background: P.surfaceHi }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                Nieuw programma
              </span>
            ) : (
              <>{dayLabel} — programma kiezen</>
            )}
          </DialogTitle>
        </DialogHeader>

        {mode === 'pick' ? (
          <>
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
                  Geen programma&apos;s in deze categorie. Maak er een aan.
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

            {/* Nieuw programma (quick-create) */}
            <button
              type="button"
              onClick={() => setMode('create')}
              className="athletic-tap w-full text-left px-3 py-2 rounded-lg mt-2 inline-flex items-center gap-2"
              style={{
                background: 'rgba(190,242,100,0.08)',
                color: P.lime,
                border: `1px solid ${P.lime}`,
              }}
            >
              <Plus className="w-4 h-4" />
              <span className="font-semibold text-sm">Nieuw programma aanmaken</span>
            </button>

            {/* Rustdag */}
            <button
              type="button"
              onClick={() => handlePick(null)}
              className="athletic-tap w-full text-left px-3 py-2 rounded-lg"
              style={{
                background: P.surfaceLow,
                color: P.inkMuted,
                border: `1px dashed ${P.line}`,
              }}
            >
              <span className="font-semibold text-sm">— Rustdag —</span>
            </button>
          </>
        ) : (
          // CREATE MODE
          <div className="space-y-3 pt-1">
            <div>
              <label className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
                NAAM
              </label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="bv. Krachttraining onderlichaam"
                className="mt-1 w-full h-9 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#BEF264]"
                style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}` }}
                autoFocus
              />
            </div>

            <div>
              <label className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
                CATEGORIE
              </label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {EXERCISE_CATEGORIES.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setNewCategory(c.value)}
                    className="athletic-tap px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: newCategory === c.value ? P.lime : P.surfaceHi,
                      color: newCategory === c.value ? '#0F1516' : P.ink,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
                OPSLAAN ALS
              </label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => setDestination('patient')}
                  disabled={!patientId}
                  className="athletic-tap px-3 py-2 rounded-lg text-xs font-bold text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: destination === 'patient' ? 'rgba(190,242,100,0.12)' : P.surfaceHi,
                    color: destination === 'patient' ? P.lime : P.ink,
                    border: `1px solid ${destination === 'patient' ? P.lime : 'transparent'}`,
                    letterSpacing: '0.04em',
                  }}
                  title={!patientId ? 'Koppel eerst een patiënt aan het schema' : undefined}
                >
                  Alleen voor
                  <br />
                  <span style={{ textTransform: 'none', color: P.inkMuted, fontWeight: 600 }}>
                    {patientName ?? 'deze patiënt'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDestination('library')}
                  className="athletic-tap px-3 py-2 rounded-lg text-xs font-bold text-left"
                  style={{
                    background: destination === 'library' ? 'rgba(190,242,100,0.12)' : P.surfaceHi,
                    color: destination === 'library' ? P.lime : P.ink,
                    border: `1px solid ${destination === 'library' ? P.lime : 'transparent'}`,
                    letterSpacing: '0.04em',
                  }}
                >
                  Opslaan in
                  <br />
                  <span style={{ textTransform: 'none', color: P.inkMuted, fontWeight: 600 }}>
                    bibliotheek
                  </span>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setMode('pick')} disabled={createProgram.isPending}>
                Annuleren
              </Button>
              <Button
                style={{ background: P.lime, color: '#0F1516' }}
                onClick={handleCreate}
                disabled={createProgram.isPending || !newName.trim()}
              >
                {createProgram.isPending ? 'Bezig…' : 'Aanmaken en plaatsen'}
              </Button>
            </div>
          </div>
        )}
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
