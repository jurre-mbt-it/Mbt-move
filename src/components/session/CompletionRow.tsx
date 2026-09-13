'use client'

import { Check } from 'lucide-react'
import { P } from '@/components/dark-ui'

/**
 * Eén knop in plaats van set-rijen: de therapeut zette "alleen afvinken" op
 * de rij. Gedeeld door de atleet- en de patiënt-runner.
 */
export function CompletionRow({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button" onClick={onToggle} aria-pressed={done}
      className="athletic-tap w-full flex items-center justify-center gap-2 rounded-xl"
      style={{
        padding: '12px', border: `1.5px solid ${done ? P.lime : P.lineStrong}`,
        background: done ? 'rgba(95,208,138,0.12)' : 'transparent', color: done ? P.lime : P.ink,
        fontFamily: 'var(--font-mono-athletic)', fontSize: 11, fontWeight: 900, letterSpacing: '0.12em',
      }}
    >
      <Check className="w-4 h-4" strokeWidth={3} /> {done ? 'GEDAAN' : 'AFVINKEN'}
    </button>
  )
}
