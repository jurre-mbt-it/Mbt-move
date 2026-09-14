'use client'

import { HeartPulse, X } from 'lucide-react'
import { P } from '@/components/dark-ui'
import { CARDIO_ACTIVITIES } from '@/lib/cardio-constants'
import { summarize, totalDurationSec, type StructuredCardio } from '@/lib/cardio-workout'

/**
 * De cardio-workout uit de blokkenbouwer als rij tussen de oefeningrijen
 * (builder en planner). Klik = bouwer openen; het kruisje haalt hem weg.
 */
export function CardioRow({ workout, onClick, onRemove }: {
  workout: StructuredCardio
  onClick: (() => void) | null
  onRemove?: (() => void) | null
}) {
  const min = Math.round(totalDurationSec(workout.blocks) / 60)
  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
      <button
        type="button"
        onClick={onClick ?? undefined}
        disabled={!onClick}
        title={summarize(workout.blocks)}
        className="flex-1 min-w-0 flex items-center gap-2 text-left"
        style={{ color: P.ink, cursor: onClick ? 'pointer' : 'default' }}
      >
        <span className="flex shrink-0" style={{ color: P.danger }}><HeartPulse size={13} /></span>
        <span className="flex-1 min-w-0 truncate text-xs font-semibold">{CARDIO_ACTIVITIES[workout.activity]?.label ?? 'Cardio'}</span>
        <span className="athletic-mono shrink-0" style={{ fontSize: 10, color: P.inkMuted, letterSpacing: '0.06em' }}>{min} MIN</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Cardio-workout verwijderen" className="shrink-0 p-0.5" style={{ color: P.inkMuted }}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
