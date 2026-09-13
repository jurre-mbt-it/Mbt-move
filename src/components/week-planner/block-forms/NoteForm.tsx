'use client'

import { DarkInput, DarkTextarea } from '@/components/dark-ui'
import type { BlockDraft } from '@/lib/planner-blocks'
import { Field } from './fields'

export function NoteForm({ draft, onChange }: { draft: BlockDraft; onChange: (d: BlockDraft) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Notitie voor de atleet" hint="Staat op zijn plek in de training, zoals je hem hier neerzet.">
        <DarkTextarea
          autoFocus rows={5} value={draft.text ?? ''} maxLength={500}
          onChange={e => onChange({ ...draft, text: e.target.value })}
          placeholder="Bijv. verzamelen bij zaal 1, of: vandaag ligt de nadruk op tempo."
        />
      </Field>
      <Field label="Videolink (optioneel)" hint="Een link naar YouTube of Vimeo; de atleet opent hem vanuit de training.">
        <DarkInput
          type="url" value={draft.videoUrl ?? ''} placeholder="https://"
          onChange={e => onChange({ ...draft, videoUrl: e.target.value.trim() || null })}
        />
      </Field>
    </div>
  )
}
