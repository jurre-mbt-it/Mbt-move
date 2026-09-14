'use client'

import { useState } from 'react'
import { DarkButton, DarkDialog, DarkDialogContent, DarkDialogHeader, DarkDialogTitle, DarkMenuSelect, MetaLabel, P } from '@/components/dark-ui'

const NAMEN = ['Anna Voorbeeld', 'Bram Test', 'Cas Demo', 'Dana Proef', 'Eli Kiezer', 'Fee Lijst', 'Gijs Rij', 'Hava Zoek', 'Ilse Klik', 'Jip Optie', 'Kai Naam', 'Loes Twaalf']
const OPTIES = NAMEN.map((n, i) => ({ value: `p${i + 1}`, label: n }))

export function Preview() {
  const [open, setOpen] = useState(false)
  const [inDialoog, setInDialoog] = useState('')
  const [opPagina, setOpPagina] = useState('')
  return (
    <div className="min-h-screen p-8 space-y-6" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-md space-y-2">
        <MetaLabel>Op de pagina (werkt)</MetaLabel>
        <DarkMenuSelect value={opPagina} onValueChange={setOpPagina} placeholder="kies patiënt" options={OPTIES} ariaLabel="Patiënt op pagina" />
        <p data-testid="op-pagina" style={{ fontSize: 12, color: P.inkMuted }}>gekozen: {opPagina || '–'}</p>
      </div>
      <DarkButton onClick={() => setOpen(true)}>+ Nieuw rapport</DarkButton>
      <DarkDialog open={open} onOpenChange={setOpen}>
        <DarkDialogContent>
          <DarkDialogHeader>
            <DarkDialogTitle>Nieuw testrapport</DarkDialogTitle>
          </DarkDialogHeader>
          <div className="space-y-2">
            <MetaLabel>Patiënt</MetaLabel>
            <DarkMenuSelect value={inDialoog} onValueChange={setInDialoog} placeholder="kies patiënt" options={OPTIES} ariaLabel="Patiënt in dialoog" />
            <p data-testid="in-dialoog" style={{ fontSize: 12, color: P.inkMuted }}>gekozen: {inDialoog || '–'}</p>
          </div>
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}
