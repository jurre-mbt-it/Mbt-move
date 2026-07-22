'use client'

/**
 * Subtiele periodiserings-context voor de patiënt/atleet.
 *
 * Bewust géén gekleurde kalender: één rustige regel (variant "line") boven de
 * kalender met een klein fase-stipje + label + eventuele week-notitie van de
 * therapeut, en in de runner alléén een smalle banner bij een deload-week
 * (variant "deload"). Geen meta ingesteld → rendert niets.
 */

import { trpc } from '@/lib/trpc/client'
import { P } from '@/components/dark-ui'
import { phaseMeta, PHASE_META } from '@/lib/periodization'
import { Moon } from 'lucide-react'

export function WeekPhaseLine({ variant = 'line' }: { variant?: 'line' | 'deload' }) {
  const { data } = trpc.weekSchedules.myWeekMeta.useQuery(undefined, {
    staleTime: 5 * 60_000,
  })
  if (!data) return null

  const phase = phaseMeta(data.phaseType)
  const deload = data.isDeload || data.phaseType === 'DELOAD'

  if (variant === 'deload') {
    // Runner: alleen iets tonen bij een deload-week — uitleg waarom de week
    // bewust lichter is, zodat de atleet niet zelf gaat compenseren.
    if (!deload) return null
    return (
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{
          background: 'rgba(127,176,216,0.08)',
          border: '1px solid rgba(127,176,216,0.22)',
        }}
      >
        <Moon className="w-3.5 h-3.5 shrink-0" style={{ color: PHASE_META.DELOAD.color }} />
        <p className="text-xs" style={{ color: P.inkMuted }}>
          <span className="font-semibold" style={{ color: PHASE_META.DELOAD.color }}>
            Deload-week
          </span>
          {' — '}bewust lichter, focus op herstel.
          {data.weekNote ? ` ${data.weekNote}` : ''}
        </p>
      </div>
    )
  }

  // Kalender-regel: klein stipje + fase-label + notitie, mono en gedempt.
  if (!phase && !deload && !data.weekNote) return null
  const color = deload ? PHASE_META.DELOAD.color : phase?.color ?? P.inkMuted
  const label = deload ? 'Deload-week' : phase ? `${phase.label}-week` : null
  return (
    <div className="flex items-center gap-2 px-1 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <p
        className="athletic-mono text-[11px] tracking-wide truncate"
        style={{ color: P.inkMuted }}
        title={data.weekNote ?? undefined}
      >
        {label && <span style={{ color }}>{label.toUpperCase()}</span>}
        {label && data.weekNote ? ' · ' : ''}
        {data.weekNote ?? ''}
      </p>
    </div>
  )
}
