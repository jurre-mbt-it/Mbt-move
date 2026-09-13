'use client'

import { DarkInput } from '@/components/dark-ui'
import type { BlockDraft } from '@/lib/planner-blocks'
import { Field, MmSsInput } from './fields'

export function BreakForm({ draft, onChange }: { draft: BlockDraft; onChange: (d: BlockDraft) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
      <Field label="Duur" hint="Minuten en seconden, bijvoorbeeld 2:00.">
        <MmSsInput valueSec={draft.durationSec} onChange={sec => onChange({ ...draft, durationSec: sec })} ariaLabel="Duur van de pauze" />
      </Field>
      <Field label="Tekst (optioneel)" hint="Wat de atleet in de pauze doet of ziet.">
        <DarkInput value={draft.text ?? ''} maxLength={200} onChange={e => onChange({ ...draft, text: e.target.value || null })} placeholder="Bijv. drinken en even lopen" />
      </Field>
    </div>
  )
}
