'use client'

/**
 * De workout zoals de therapeut hem voorschreef, voor de atleet.
 *
 * Bestaat omdat dit tot nu toe nergens aankwam: het cardioscherm was volledig
 * handinvoer, dus warming-up, intervallen en cooldown bleven bij de therapeut
 * op het scherm hangen. Read-only met opzet — dit is het voorschrift, niet wat
 * je gedaan hebt; dat vul je eronder in.
 */

import { HR_ZONES } from '@/lib/cardio-constants'
import {
  STEP_META, isRepeat, targetColor, targetHeight, totalDurationSec,
  type StructuredCardio, type WorkoutStep,
} from '@/lib/cardio-workout'
import { P } from '@/components/dark-ui'

const stepLen = (s: WorkoutStep) =>
  s.durationSec != null
    ? `${Math.round(s.durationSec / 60)} min`
    : s.distanceM != null
      ? `${(s.distanceM / 1000).toFixed(2).replace(/\.?0+$/, '')} km`
      : '—'

const stepTarget = (s: WorkoutStep) =>
  s.target.type === 'ZONE'
    ? (s.target.toZone != null
        ? `${HR_ZONES[s.target.zone].label.split(' — ')[0]} → Z${s.target.toZone}`
        : HR_ZONES[s.target.zone].label)
    : s.target.type === 'RPE'
      ? `RPE ${s.target.min}${s.target.max != null ? `-${s.target.max}` : ''}`
      : 'Vrij tempo'

export function PlannedCardioCard({ workout }: { workout: StructuredCardio }) {
  const dur = totalDurationSec(workout.blocks)

  // Grafiek: breedte naar rato van de duur, hoogte = intensiteit.
  const bars: { id: string; w: number; h: number; color: string }[] = []
  for (const b of workout.blocks) {
    if (isRepeat(b)) {
      for (const s of b.steps) {
        bars.push({
          id: `${b.id}-${s.id}`,
          w: (s.durationSec ?? 120) * b.times,
          h: targetHeight(s.target),
          color: targetColor(s.target),
        })
      }
    } else {
      bars.push({ id: b.id, w: b.durationSec ?? 120, h: targetHeight(b.target), color: targetColor(b.target) })
    }
  }
  const total = bars.reduce((s, b) => s + b.w, 0) || 1

  return (
    <div className="rounded-xl p-3" style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold" style={{ color: P.ink }}>Jouw workout</span>
        <span className="athletic-mono text-[10px]" style={{ color: P.inkMuted }}>{Math.round(dur / 60)} min</span>
      </div>

      <div className="flex items-end gap-px h-[52px] mb-2.5">
        {bars.map(b => (
          <span
            key={b.id}
            style={{
              width: `${(b.w / total) * 100}%`,
              height: `${Math.max(10, b.h * 100)}%`,
              background: b.color,
              opacity: 0.85,
              minWidth: 2,
            }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {workout.blocks.map(b =>
          isRepeat(b) ? (
            <div key={b.id} className="rounded-lg p-1.5" style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: P.inkMuted }}>{b.times}× herhalen</div>
              <div className="flex flex-col gap-1">
                {b.steps.map(s => <StepRow key={s.id} step={s} />)}
              </div>
            </div>
          ) : (
            <StepRow key={b.id} step={b} />
          ),
        )}
      </div>
    </div>
  )
}

function StepRow({ step }: { step: WorkoutStep }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: targetColor(step.target) }} />
      <span className="text-[11px] font-semibold shrink-0" style={{ color: P.ink }}>{STEP_META[step.kind].label}</span>
      <span className="athletic-mono text-[10px] shrink-0" style={{ color: P.inkMuted }}>{stepLen(step)}</span>
      <span className="text-[10px] truncate" style={{ color: P.inkDim }}>{stepTarget(step)}</span>
      {step.notes && <span className="text-[10px] truncate ml-auto" style={{ color: P.inkDim }}>{step.notes}</span>}
    </div>
  )
}
