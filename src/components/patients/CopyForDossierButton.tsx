/**
 * Kopieerknop die een sessie als platte tekst op het klembord zet, klaar om in
 * het EPD te plakken. De tekst wordt pas bij de klik opgebouwd (`getText`),
 * zodat een scherm waarin nog getypt wordt altijd de actuele waarden kopieert.
 */
'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { copyToClipboard } from '@/lib/dossier-report'
import { P } from '@/components/dark-ui'

export function CopyForDossierButton({
  getText,
  label = 'KOPIEER',
  ariaLabel = 'Kopieer voor dossier',
  variant = 'chip',
}: {
  getText: () => string
  label?: string
  ariaLabel?: string
  /** 'chip' = klein knopje op een tegel; 'block' = volle breedte in een footer. */
  variant?: 'chip' | 'block'
}) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    const ok = await copyToClipboard(getText())
    if (!ok) {
      toast.error('Kopiëren mislukt — klembord niet beschikbaar')
      return
    }
    toast.success('Gekopieerd — plak in het dossier')
    // Even bevestigen op de knop zelf: de toast valt bij een lange lijst
    // makkelijk buiten beeld, en dan weet je niet welke tegel je pakte.
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const accent = copied ? P.lime : variant === 'block' ? P.brand : P.inkMuted

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className={
        variant === 'block'
          ? 'athletic-mono athletic-tap w-full rounded-lg py-2.5 flex items-center justify-center gap-2'
          : 'athletic-mono athletic-tap'
      }
      style={
        variant === 'block'
          ? {
              background: P.surfaceLow,
              color: accent,
              border: `1px solid ${accent}`,
              fontSize: 11,
              letterSpacing: '0.1em',
              fontWeight: 800,
            }
          : {
              color: accent,
              fontSize: 10,
              letterSpacing: '0.12em',
              padding: '2px 6px',
              border: `1px solid ${copied ? P.lime : P.lineStrong}`,
              borderRadius: 4,
              background: 'transparent',
            }
      }
    >
      {copied ? 'GEKOPIEERD' : label}
    </button>
  )
}
