'use client'

import { SkipForward } from 'lucide-react'
import { P, Kicker } from '@/components/dark-ui'

/**
 * Rusttimer tussen sets — bottom sheet met aftellende ring, +15s en overslaan.
 * Gedeeld door de atleet- en patiënt-sessie-runner.
 */
export function RestSheet({
  secondsLeft,
  total,
  nextLabel,
  onExtend,
  onSkip,
}: {
  secondsLeft: number
  total: number
  nextLabel: string
  onExtend: () => void
  onSkip: () => void
}) {
  const r = 52
  const circ = 2 * Math.PI * r
  const progress = total > 0 ? secondsLeft / total : 0
  const offset = circ * (1 - progress)
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="mbt-backdrop absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onSkip} />
      <div
        className="mbt-sheet relative w-full rounded-t-3xl flex flex-col items-center gap-4 px-5 pt-4 pb-[max(env(safe-area-inset-bottom),24px)]"
        style={{ background: P.surface, border: `1px solid ${P.line}`, maxWidth: 480, margin: '0 auto' }}
      >
        <div className="w-10 h-1 rounded-full" style={{ background: P.lineStrong }} />
        <Kicker>RUST</Kicker>
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={r} fill="none" stroke={P.surfaceHi} strokeWidth="8" />
            <circle
              cx="60" cy="60" r={r} fill="none" stroke={P.brand} strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="athletic-mono" style={{ color: P.ink, fontSize: 28, fontWeight: 900 }}>
              {m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : s}
            </span>
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
              {m > 0 ? 'min' : 'sec'}
            </span>
          </div>
        </div>
        <p style={{ color: P.inkMuted, fontSize: 12.5 }}>{nextLabel}</p>
        <div className="flex gap-2 w-full">
          <button
            type="button"
            onClick={onExtend}
            className="athletic-tap athletic-mono flex-1 rounded-xl py-3"
            style={{
              background: 'transparent',
              border: `1px solid ${P.lineStrong}`,
              color: P.inkMuted,
              fontSize: 11,
              letterSpacing: '0.14em',
              fontWeight: 800,
            }}
          >
            +15S
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="athletic-tap athletic-mono flex-1 rounded-xl py-3 flex items-center justify-center gap-1.5"
            style={{
              background: P.lime,
              border: `1px solid ${P.lime}`,
              color: P.bg,
              fontSize: 11,
              letterSpacing: '0.14em',
              fontWeight: 900,
            }}
          >
            <SkipForward className="w-3.5 h-3.5" />
            SLA RUST OVER
          </button>
        </div>
      </div>
    </div>
  )
}
