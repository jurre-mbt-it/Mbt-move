'use client'

import { useMemo } from 'react'
import { BodyFigure } from './BodyFigure'
import { P, Tile, Kicker, MetaLabel } from '@/components/dark-ui'
import {
  calculateRecoveryStates,
  getRecoveryColor,
  formatHoursRemaining,
  type ExerciseSession,
  type MuscleRecoveryState,
} from '@/lib/recovery-estimation'

interface Props {
  sessions: ExerciseSession[]
  showBodyFigure?: boolean
}

export function RecoveryPanel({ sessions, showBodyFigure = true }: Props) {
  const recoveryStates = useMemo(
    () => calculateRecoveryStates(sessions),
    [sessions],
  )

  const recovered = recoveryStates.filter(s => s.status === 'recovered').length
  const recovering = recoveryStates.filter(s => s.status === 'recovering').length
  const fatigued = recoveryStates.filter(s => s.status === 'fatigued').length
  const avgRecovery = recoveryStates.length > 0
    ? Math.round(recoveryStates.reduce((sum, s) => sum + s.recoveryPercent, 0) / recoveryStates.length)
    : 100

  const readinessColor = avgRecovery >= 75 ? P.lime : avgRecovery >= 50 ? P.gold : P.danger
  const readinessLabel = avgRecovery >= 75 ? 'Klaar om te trainen' : avgRecovery >= 50 ? 'Gedeeltelijk hersteld' : 'Rust aanbevolen'

  return (
    <div className="space-y-3">
      {/* Overall readiness tile */}
      <Tile accentBar={readinessColor}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Kicker style={{ color: readinessColor }}>READINESS</Kicker>
            <div
              className="athletic-display"
              style={{
                color: P.ink,
                fontSize: 22,
                lineHeight: '26px',
                letterSpacing: '-0.02em',
                fontWeight: 900,
                textTransform: 'uppercase',
                paddingTop: 4,
              }}
            >
              {readinessLabel}
            </div>
            <div style={{ marginTop: 4 }}>
              <MetaLabel>GEMIDDELD {avgRecovery}% HERSTELD</MetaLabel>
            </div>
          </div>
          <span
            className="athletic-display"
            style={{
              color: readinessColor,
              fontSize: 44,
              lineHeight: '44px',
              letterSpacing: '-0.035em',
              fontWeight: 900,
            }}
          >
            {avgRecovery}%
          </span>
        </div>

        {/* Mini stats */}
        <div
          className="grid grid-cols-3 gap-2 mt-4 pt-3"
          style={{ borderTop: `1px solid ${P.line}` }}
        >
          <MiniStat count={recovered} label="HERSTELD" tint={P.lime} />
          <MiniStat count={recovering} label="HERSTELLEND" tint={P.gold} />
          <MiniStat count={fatigued} label="BELAST" tint={P.danger} />
        </div>
      </Tile>

      {/* Body figure — hidden op mobile (match iOS), zichtbaar vanaf md */}
      {showBodyFigure && recoveryStates.length > 0 && (
        <div className="hidden md:block">
          <Tile>
            <Kicker style={{ marginBottom: 12 }}>SPIERHERSTEL OVERZICHT</Kicker>
            <BodyFigure recoveryStates={recoveryStates} />
          </Tile>
        </div>
      )}

      {/* Muscle list */}
      {recoveryStates.length > 0 && (
        <Tile>
          <Kicker style={{ marginBottom: 12 }}>HERSTEL PER SPIERGROEP</Kicker>
          <div className="space-y-2">
            {recoveryStates.map(state => (
              <MuscleRecoveryRow key={state.muscle} state={state} />
            ))}
          </div>
        </Tile>
      )}

      {recoveryStates.length === 0 && (
        <Tile>
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
            <MetaLabel style={{ color: P.inkMuted }}>GEEN SPIERBELASTING DATA</MetaLabel>
            <p
              className="max-w-[260px]"
              style={{
                color: P.inkMuted,
                fontSize: 12,
                lineHeight: '17px',
                marginTop: 2,
              }}
            >
              Het herstelmodel werkt op basis van oefeningen uit je programma.
              Quick workouts tellen mee voor ACWR maar niet voor spierbelasting.
            </p>
          </div>
        </Tile>
      )}
    </div>
  )
}

function MiniStat({ count, label, tint }: { count: number; label: string; tint: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="athletic-display"
        style={{
          color: tint,
          fontSize: 20,
          lineHeight: '22px',
          fontWeight: 900,
          letterSpacing: '-0.02em',
        }}
      >
        {count}
      </span>
      <MetaLabel style={{ color: P.inkMuted, fontSize: 9 }}>{label}</MetaLabel>
    </div>
  )
}

function MuscleRecoveryRow({ state }: { state: MuscleRecoveryState }) {
  const color = getRecoveryColor(state.recoveryPercent)

  return (
    <div
      className="flex items-center gap-3 rounded-xl"
      style={{
        backgroundColor: P.surfaceLow,
        padding: '10px 12px',
        border: `1px solid ${P.line}`,
      }}
    >
      <span
        aria-hidden
        className="shrink-0"
        style={{
          width: 3,
          height: 28,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />

      <span
        className="flex-1 truncate"
        style={{
          color: P.ink,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.01em',
        }}
      >
        {state.muscle}
      </span>

      <span
        className="athletic-mono shrink-0"
        style={{
          color: P.inkMuted,
          fontSize: 10,
          letterSpacing: '0.12em',
          fontWeight: 700,
          textTransform: 'uppercase',
          width: 44,
          textAlign: 'right',
        }}
      >
        {formatHoursRemaining(state.hoursRemaining)}
      </span>

      <div
        className="h-1.5 rounded-full overflow-hidden shrink-0"
        style={{ width: 56, backgroundColor: P.surfaceHi }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${state.recoveryPercent}%`, background: color }}
        />
      </div>

      <span
        className="athletic-mono shrink-0"
        style={{
          color,
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.04em',
          width: 38,
          textAlign: 'right',
        }}
      >
        {state.recoveryPercent}%
      </span>
    </div>
  )
}
