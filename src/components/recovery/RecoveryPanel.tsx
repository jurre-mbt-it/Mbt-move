'use client'

import { useMemo } from 'react'
import { BodyFigure } from './BodyFigure'
import { Card, CardContent } from '@/components/ui/card'
import {
  calculateRecoveryStates,
  getRecoveryColor,
  getRecoveryLabel,
  formatHoursRemaining,
  type ExerciseSession,
  type MuscleRecoveryState,
} from '@/lib/recovery-estimation'
import { Activity, Zap, Clock, CheckCircle2 } from 'lucide-react'

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

  // Overall readiness
  const readinessColor = avgRecovery >= 75 ? '#14B8A6' : avgRecovery >= 50 ? '#f59e0b' : '#ef4444'
  const readinessLabel = avgRecovery >= 75 ? 'Klaar om te trainen' : avgRecovery >= 50 ? 'Gedeeltelijk hersteld' : 'Rust aanbevolen'

  return (
    <div className="space-y-4">
      {/* Overall readiness card */}
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: readinessColor + '20' }}
            >
              <Zap className="w-6 h-6" style={{ color: readinessColor }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{readinessLabel}</p>
              <p className="text-xs text-muted-foreground">
                Gemiddeld {avgRecovery}% hersteld
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: readinessColor }}>
                {avgRecovery}%
              </p>
            </div>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#14B8A6' }} />
              <span>{recovered} hersteld</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
              <span>{recovering} herstellend</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Activity className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
              <span>{fatigued} belast</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Body figure */}
      {showBodyFigure && (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">
              Spierherstel overzicht
            </h3>
            <BodyFigure recoveryStates={recoveryStates} />
          </CardContent>
        </Card>
      )}

      {/* Muscle list */}
      {recoveryStates.length > 0 && (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
              Herstel per spiergroep
            </h3>
            {recoveryStates.map(state => (
              <MuscleRecoveryRow key={state.muscle} state={state} />
            ))}
          </CardContent>
        </Card>
      )}

      {recoveryStates.length === 0 && (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Activity className="w-8 h-8 text-zinc-300" />
            <p className="text-sm text-muted-foreground">Nog geen sessiegegevens</p>
            <p className="text-xs text-muted-foreground">Na je eerste sessie verschijnt hier het herstelmodel</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MuscleRecoveryRow({ state }: { state: MuscleRecoveryState }) {
  const color = getRecoveryColor(state.recoveryPercent)

  return (
    <div className="flex items-center gap-3">
      {/* Color indicator */}
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: color }}
      />

      {/* Muscle name */}
      <span className="text-sm flex-1 truncate">{state.muscle}</span>

      {/* Time remaining */}
      <span className="text-xs text-muted-foreground shrink-0 w-12 text-right">
        {formatHoursRemaining(state.hoursRemaining)}
      </span>

      {/* Progress bar */}
      <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${state.recoveryPercent}%`, background: color }}
        />
      </div>

      {/* Percentage */}
      <span className="text-xs font-semibold shrink-0 w-10 text-right" style={{ color }}>
        {state.recoveryPercent}%
      </span>
    </div>
  )
}
