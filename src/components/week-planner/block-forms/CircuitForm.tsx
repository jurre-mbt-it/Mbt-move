'use client'

/**
 * Een circuit is een groepsletter met rondes en (optioneel) een tijdslimiet.
 * Dit formulier maakt of bewerkt die groep; de oefeningen komen daarna via
 * het oefeningformulier met de letter voorgeselecteerd.
 */

import { useEffect } from 'react'
import { DarkInput, DarkTextarea, P } from '@/components/dark-ui'
import { NumberField } from '@/components/dark-ui/NumberField'
import { GROUP_LETTERS, groupLabel, nextFreeGroupLetter, type ItemGroup, type ItemGroups, type PlannerBlock } from '@/lib/planner-blocks'
import { Field, MmSsInput, NullableNumField } from './fields'

export type CircuitDraft = {
  letter: string
  name: string
  rounds: number
  timeCapSec: number | null
  restSec: number | null
  description: string
}

export const emptyCircuit = (): CircuitDraft => ({ letter: 'A', name: '', rounds: 3, timeCapSec: null, restSec: 60, description: '' })

export function circuitFromGroup(letter: string, g: ItemGroup): CircuitDraft {
  return {
    letter,
    name: g.name ?? '',
    rounds: g.rounds ?? 1,
    timeCapSec: g.timeCapSec ?? null,
    restSec: g.restSec ?? null,
    description: g.description ?? '',
  }
}

export function circuitToGroup(c: CircuitDraft): ItemGroup {
  return {
    kind: 'CIRCUIT',
    name: c.name.trim(),
    rounds: c.rounds,
    ...(c.description.trim() ? { description: c.description.trim() } : {}),
    ...(c.timeCapSec ? { timeCapSec: c.timeCapSec } : {}),
    ...(c.restSec != null ? { restSec: c.restSec } : {}),
  }
}

export function CircuitForm({ draft, onChange, blocks, groups }: {
  draft: CircuitDraft
  onChange: (d: CircuitDraft) => void
  blocks: PlannerBlock[]
  groups: ItemGroups
}) {
  const vrij = nextFreeGroupLetter(blocks, groups)
  // Eerste vrije letter als startwaarde, één keer per opening.
  useEffect(() => {
    if (vrij && !draft.name && draft.letter !== vrij && !groups[draft.letter]) onChange({ ...draft, letter: vrij })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vrij])

  const set = (patch: Partial<CircuitDraft>) => onChange({ ...draft, ...patch })
  const bestaand = !!groups[draft.letter]

  return (
    <div className="space-y-4">
      {!vrij && !bestaand && (
        <p className="text-xs" style={{ color: P.danger }}>Alle zes de letters zijn in gebruik. Verwijder eerst een groep.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_170px_110px] gap-3">
        <Field label="Naam van het circuit" hint="Bijv. Finisher of Conditie-blok.">
          <DarkInput autoFocus value={draft.name} maxLength={60} onChange={e => set({ name: e.target.value })} placeholder="Circuit" />
        </Field>
        <Field label="Letter" hint={bestaand ? 'Bestaande groep bewerken.' : 'Vrije letter.'}>
          <select
            value={draft.letter} onChange={e => set({ letter: e.target.value })} aria-label="Groepsletter"
            className="w-full h-9 px-2 rounded-lg text-sm focus:outline-none"
            style={{ background: P.field, color: P.ink, border: `1px solid ${P.line}` }}
          >
            {GROUP_LETTERS.map(l => <option key={l} value={l}>{groupLabel(l, groups)}</option>)}
          </select>
        </Field>
        <Field label="Rondes" hint="1 tot 10.">
          <NumberField value={draft.rounds} onCommit={n => set({ rounds: Math.max(1, Math.min(10, n)) })} min={1} max={10} aria-label="Aantal rondes" className="h-9" />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[160px_160px_minmax(0,1fr)] gap-3">
        <Field label="Tijdslimiet (optioneel)" hint="Zoveel mogelijk rondes binnen deze tijd.">
          <MmSsInput valueSec={draft.timeCapSec} onChange={sec => set({ timeCapSec: sec })} ariaLabel="Tijdslimiet" />
        </Field>
        <Field label="Rust tussen rondes" hint="Seconden.">
          <NullableNumField value={draft.restSec} onChange={v => set({ restSec: v })} min={0} max={600} step={15} ariaLabel="Rust tussen rondes" className="h-9" />
        </Field>
        <Field label="Beschrijving (optioneel)" hint="Hoe het circuit wordt uitgevoerd.">
          <DarkTextarea rows={2} maxLength={300} value={draft.description} onChange={e => set({ description: e.target.value })} placeholder="Bijv. alle oefeningen achter elkaar, dan rust" />
        </Field>
      </div>
    </div>
  )
}
