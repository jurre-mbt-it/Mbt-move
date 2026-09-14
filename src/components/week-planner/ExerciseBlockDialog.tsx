'use client'

/**
 * "+ Oefening": één brede pop-up met links een balk van typen en rechts het
 * formulier van het gekozen type. Toevoegen laat de dialoog open en zet het
 * formulier terug voor de volgende rij; bewerken sluit na opslaan.
 * Werkt op een patiënt-item én op een sjabloon-item (plan-editor).
 * Ontwerp: docs/superpowers/specs/2026-09-13-planner-blokken-design.md §5.2
 */

import { useEffect, useRef, useState } from 'react'
import { Coffee, Dumbbell, HeartPulse, RefreshCw, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import {
  DarkButton, DarkDialog as Dialog, DarkDialogContent as DialogContent, DarkDialogTitle as DialogTitle, P,
} from '@/components/dark-ui'
import { useCategoryColors } from '@/lib/useCategoryColors'
import {
  newBlock, type BlockDraft, type Category, type ItemGroup, type ItemGroups, type PlannerBlock,
} from '@/lib/planner-blocks'
import { ExerciseForm } from './block-forms/ExerciseForm'
import { CircuitForm, circuitFromGroup, circuitToGroup, emptyCircuit, type CircuitDraft } from './block-forms/CircuitForm'
import { NoteForm } from './block-forms/NoteForm'
import { BreakForm } from './block-forms/BreakForm'

export type BlockDialogType = 'exercise' | 'cardio' | 'circuit' | 'note' | 'break'

const TYPES: { key: BlockDialogType; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'exercise', label: 'Oefening', Icon: Dumbbell },
  { key: 'cardio',   label: 'Cardio',   Icon: HeartPulse },
  { key: 'circuit',  label: 'Circuit',  Icon: RefreshCw },
  { key: 'note',     label: 'Notitie',  Icon: StickyNote },
  { key: 'break',    label: 'Pauze',    Icon: Coffee },
]

const TITLES: Record<BlockDialogType, string> = {
  exercise: 'Oefening toevoegen',
  cardio: 'Cardio toevoegen',
  circuit: 'Circuit toevoegen',
  note: 'Notitie toevoegen',
  break: 'Pauze toevoegen',
}

function typeOf(b: PlannerBlock): BlockDialogType {
  if (b.blockKind === 'NOTE') return 'note'
  if (b.blockKind === 'BREAK') return 'break'
  // Een oefeningrij is een oefeningrij, ook als de bibliotheek-oefening cardio
  // heet: het cardio-tabblad is sinds 14-09-2026 de blokkenbouwer, niet dit formulier.
  return 'exercise'
}

function draftFor(type: BlockDialogType, group: string | null): BlockDraft {
  if (type === 'note') return newBlock('NOTE')
  if (type === 'break') return newBlock('BREAK')
  return newBlock('EXERCISE', {
    supersetGroup: group,
    ...(type === 'cardio' ? { repUnit: 'min', reps: 10, sets: 1 } : {}),
  })
}

export function ExerciseBlockDialog({
  open, onClose, dayLabel, workoutName, initialType = 'exercise',
  editBlock, editGroupLetter = null, blocks, groups, defaultCategory, saving, onSubmitBlock, onSubmitGroup, onOpenCardio,
}: {
  open: boolean
  onClose: () => void
  dayLabel: string
  workoutName: string
  initialType?: BlockDialogType
  /** Bestaande rij bewerken; null = nieuw. */
  editBlock: PlannerBlock | null
  /** Bestaand circuit bewerken (letter); null = niet. */
  editGroupLetter?: string | null
  blocks: PlannerBlock[]
  groups: ItemGroups
  defaultCategory: Category
  saving: boolean
  onSubmitBlock: (draft: BlockDraft) => Promise<void>
  onSubmitGroup: (letter: string, group: ItemGroup) => Promise<void>
  /** Cardio hoort in de blokkenbouwer (warming-up, intervallen, cooldown), niet in
   *  een sets/reps-formulier. Geef dit mee en het tabblad Cardio opent die bouwer;
   *  zonder (programma-builder) blijft een kort activiteitsformulier over. */
  onOpenCardio?: () => void
}) {
  const catColors = useCategoryColors()
  const [type, setType] = useState<BlockDialogType>(initialType)
  const [draft, setDraft] = useState<BlockDraft>(() => draftFor(initialType, null))
  const [circuit, setCircuit] = useState<CircuitDraft>(emptyCircuit)
  /** Na een circuit: de letter waar de volgende oefeningen in landen. */
  const [stickyGroup, setStickyGroup] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [toegevoegd, setToegevoegd] = useState(false)
  const zoekRef = useRef<HTMLInputElement | null>(null)

  const bewerken = !!editBlock || !!editGroupLetter

  useEffect(() => {
    if (!open) return
    const groep = editGroupLetter ? groups[editGroupLetter] : undefined
    const t0: BlockDialogType = editBlock ? typeOf(editBlock) : groep ? 'circuit' : initialType
    if (t0 === 'cardio' && onOpenCardio) { onOpenCardio(); return }
    const t = t0
    setType(t)
    setDraft(editBlock ? { ...editBlock } : draftFor(t, null))
    setCircuit(groep && editGroupLetter ? circuitFromGroup(editGroupLetter, groep) : emptyCircuit())
    setStickyGroup(null)
    setFout(null)
    setToegevoegd(false)
    // `groups` bewust niet in de lijst: een opslag onderweg mag het formulier niet resetten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editBlock, editGroupLetter, initialType])

  function kiesType(t: BlockDialogType) {
    if (t === 'cardio' && onOpenCardio) { onOpenCardio(); return }
    setType(t)
    setDraft(draftFor(t, stickyGroup))
    setFout(null)
  }

  function valideer(): string | null {
    if (type === 'circuit') return circuit.name.trim() ? null : 'Geef het circuit een naam.'
    if (draft.blockKind === 'EXERCISE' && !draft.exerciseId) return 'Kies eerst een oefening.'
    if (draft.blockKind === 'NOTE' && !(draft.text ?? '').trim()) return 'De notitie is nog leeg.'
    if (draft.blockKind === 'BREAK' && !draft.durationSec) return 'Geef de pauze een duur.'
    if (draft.repsPerSet && draft.repsPerSet.length !== draft.sets) return 'Vul voor elke set een aantal in.'
    if (draft.videoUrl && !/^https?:\/\/\S+$/i.test(draft.videoUrl)) return 'De videolink moet met http(s) beginnen.'
    return null
  }

  async function verstuur() {
    const f = valideer()
    if (f) { setFout(f); return }
    setFout(null)
    if (type === 'circuit') {
      const letter = circuit.letter
      await onSubmitGroup(letter, circuitToGroup(circuit))
      if (editGroupLetter) { onClose(); return }
      // Door naar de oefeningen van dit circuit.
      setStickyGroup(letter)
      setType('exercise')
      setDraft(draftFor('exercise', letter))
      toast.success(`Circuit ${letter} staat klaar, voeg nu de oefeningen toe`)
      return
    }
    await onSubmitBlock(draft)
    if (bewerken) { onClose(); return }
    setToegevoegd(true)
    setTimeout(() => setToegevoegd(false), 1200)
    setDraft(draftFor(type, stickyGroup))
    setTimeout(() => zoekRef.current?.focus(), 0)
  }

  function leegmaken() {
    setDraft(editBlock ? { ...editBlock } : draftFor(type, stickyGroup))
    setCircuit(editGroupLetter && groups[editGroupLetter] ? circuitFromGroup(editGroupLetter, groups[editGroupLetter]) : emptyCircuit())
    setFout(null)
  }

  const actief = TYPES.find(t => t.key === type) ?? TYPES[0]
  const typeKleur: Record<BlockDialogType, string> = {
    exercise: catColors[defaultCategory === 'CARDIO' ? 'STRENGTH' : defaultCategory] ?? P.ink,
    cardio: catColors.CARDIO ?? P.ice,
    circuit: P.gold,
    note: P.gold,
    break: P.inkDim,
  }
  const knopTekst = saving ? 'Opslaan…'
    : toegevoegd ? 'Toegevoegd'
    : bewerken ? 'Opslaan'
    : type === 'circuit' ? 'Circuit aanmaken'
    : 'Toevoegen aan training'

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-[880px]" style={{ padding: 0, borderRadius: 14 }}>
        <div className="flex flex-col lg:flex-row min-h-[420px]">
          {/* Balk met typen. Bij bewerken ligt het type vast. */}
          {!bewerken && (
            <nav aria-label="Soort blok"
              className="flex lg:flex-col gap-1 p-2 lg:w-[84px] shrink-0 overflow-x-auto"
              style={{ borderRight: `1px solid ${P.line}`, background: P.surfaceLow, borderRadius: '14px 0 0 14px' }}>
              {TYPES.map(t => {
                const isActief = t.key === type
                return (
                  <button key={t.key} type="button" onClick={() => kiesType(t.key)} aria-pressed={isActief}
                    className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg athletic-tap transition-colors shrink-0"
                    style={isActief
                      ? { background: typeKleur[t.key], color: '#0A1C1D' }
                      : { color: P.inkMuted }}>
                    <t.Icon size={18} />
                    <span className="athletic-label" style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.label}</span>
                  </button>
                )
              })}
            </nav>
          )}

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-5 pt-5 pb-3 pr-14">
              <DialogTitle>
                <span className="flex items-center gap-2">
                  <span style={{ color: typeKleur[type] }} className="flex"><actief.Icon size={16} /></span>
                  {bewerken ? `${actief.label} bewerken` : TITLES[type]}
                </span>
              </DialogTitle>
              <p className="athletic-mono mt-1" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {dayLabel} · {workoutName}
              </p>
            </div>

            <div className="px-5 pb-4 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(85dvh - 190px)' }}>
              {type === 'circuit' && <CircuitForm draft={circuit} onChange={setCircuit} blocks={blocks} groups={groups} />}
              {(type === 'exercise' || type === 'cardio') && (
                <ExerciseForm
                  key={draft.id ?? `${type}-${stickyGroup ?? ''}`}
                  mode={type} draft={draft} onChange={setDraft}
                  groups={groups} defaultCategory={defaultCategory} searchRef={zoekRef}
                />
              )}
              {type === 'note' && <NoteForm draft={draft} onChange={setDraft} />}
              {type === 'break' && <BreakForm draft={draft} onChange={setDraft} />}
              {fout && <p className="text-xs mt-3" role="alert" style={{ color: P.danger }}>{fout}</p>}
            </div>

            <div className="px-5 pb-5 pt-3 space-y-2" style={{ borderTop: `1px solid ${P.line}` }}>
              <DarkButton variant="primary" className="w-full" onClick={verstuur} disabled={saving}>
                {knopTekst}
              </DarkButton>
              <DarkButton variant="ghost" className="w-full" onClick={leegmaken} disabled={saving}>
                Leegmaken
              </DarkButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
