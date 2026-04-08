'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  calculateACWR,
  ACWR_ZONE_CONFIG,
  type SessionWorkload,
} from '@/lib/workload-monitoring'
import { Activity, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, BarChart3 } from 'lucide-react'

interface Props {
  sessions: SessionWorkload[]
}

export function WorkloadPanel({ sessions }: Props) {
  const acwr = useMemo(() => calculateACWR(sessions), [sessions])
  const zone = ACWR_ZONE_CONFIG[acwr.zone]

  const changeIcon = acwr.weekOverWeekChange > 10
    ? <TrendingUp className="w-3.5 h-3.5" />
    : acwr.weekOverWeekChange < -10
      ? <TrendingDown className="w-3.5 h-3.5" />
      : <Minus className="w-3.5 h-3.5" />

  const maxWeekly = Math.max(...acwr.weeklyHistory.map(w => w.totalSRPE), 1)

  return (
    <div className="space-y-4">
      {/* ACWR Gauge */}
      <Card style={{ borderRadius: '12px' }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: zone.bg }}
            >
              <Zap className="w-6 h-6" style={{ color: zone.color }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{zone.label}</p>
              <p className="text-xs text-muted-foreground">{zone.description}</p>
            </div>
          </div>

          {/* ACWR bar visualization */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>ACWR (Acute:Chronic Ratio)</span>
              <span className="font-bold text-sm" style={{ color: zone.color }}>{acwr.acwr}</span>
            </div>
            <div className="relative h-3 bg-zinc-100 rounded-full overflow-hidden">
              {/* Zone markers */}
              <div className="absolute inset-0 flex">
                <div className="h-full" style={{ width: '26.7%', background: '#dbeafe' }} /> {/* 0-0.8 */}
                <div className="h-full" style={{ width: '16.7%', background: '#ccfbf1' }} /> {/* 0.8-1.3 */}
                <div className="h-full" style={{ width: '6.7%', background: '#fef3c7' }} />  {/* 1.3-1.5 */}
                <div className="h-full flex-1" style={{ background: '#fee2e2' }} />          {/* 1.5+ */}
              </div>
              {/* Pointer */}
              <div
                className="absolute top-0 h-full w-1 rounded-full bg-[#1A3A3A] z-10 transition-all duration-500"
                style={{ left: `${Math.min(100, (acwr.acwr / 3) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>0.8</span>
              <span>1.3</span>
              <span>1.5</span>
              <span>3.0</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{acwr.acuteWorkload}</p>
            <p className="text-[10px] text-muted-foreground">Acute (sRPE)</p>
            <p className="text-[10px] text-muted-foreground">Deze week</p>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{acwr.chronicWorkload}</p>
            <p className="text-[10px] text-muted-foreground">Chronic (sRPE)</p>
            <p className="text-[10px] text-muted-foreground">4-wk gem.</p>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <span
                className="text-lg font-bold"
                style={{ color: Math.abs(acwr.weekOverWeekChange) > 25 ? '#ef4444' : Math.abs(acwr.weekOverWeekChange) > 10 ? '#f59e0b' : '#14B8A6' }}
              >
                {acwr.weekOverWeekChange > 0 ? '+' : ''}{acwr.weekOverWeekChange}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Week-op-week</p>
            <div className="flex justify-center mt-0.5" style={{ color: Math.abs(acwr.weekOverWeekChange) > 25 ? '#ef4444' : '#14B8A6' }}>
              {changeIcon}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly bar chart */}
      {acwr.weeklyHistory.length > 0 && (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                Weekelijkse belasting (sRPE)
              </p>
            </div>
            <div className="flex items-end gap-2 h-32">
              {acwr.weeklyHistory.map((week, i) => {
                const pct = (week.totalSRPE / maxWeekly) * 100
                const isCurrentWeek = i === acwr.weeklyHistory.length - 1
                const barColor = isCurrentWeek ? zone.color : '#d4d4d8'

                return (
                  <div key={week.weekLabel} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold" style={{ color: isCurrentWeek ? zone.color : '#a1a1aa' }}>
                      {week.totalSRPE}
                    </span>
                    <div className="w-full flex items-end justify-center" style={{ height: '90px' }}>
                      <div
                        className="w-full max-w-[32px] rounded-t-md transition-all duration-500"
                        style={{ height: `${Math.max(4, pct)}%`, background: barColor }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{week.weekLabel}</span>
                    <span className="text-[10px] text-muted-foreground">{week.sessionCount}x</span>
                  </div>
                )
              })}
            </div>

            {/* Gabbett recommendation */}
            {Math.abs(acwr.weekOverWeekChange) > 10 && (
              <div
                className="mt-3 rounded-lg p-2.5 flex items-start gap-2"
                style={{ background: Math.abs(acwr.weekOverWeekChange) > 25 ? '#fee2e2' : '#fef3c7' }}
              >
                <AlertTriangle
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: Math.abs(acwr.weekOverWeekChange) > 25 ? '#ef4444' : '#f59e0b' }}
                />
                <div className="text-xs">
                  <p className="font-semibold" style={{ color: Math.abs(acwr.weekOverWeekChange) > 25 ? '#991b1b' : '#92400e' }}>
                    {acwr.weekOverWeekChange > 25
                      ? 'Sterke stijging in belasting'
                      : acwr.weekOverWeekChange > 10
                        ? 'Geleidelijke stijging'
                        : 'Daling in belasting'}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Gabbett adviseert max 10% stijging per week. Huidige verandering: {acwr.weekOverWeekChange > 0 ? '+' : ''}{acwr.weekOverWeekChange}%.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Session details this week */}
      {acwr.weeklyHistory.length > 0 && (
        <Card style={{ borderRadius: '12px' }}>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
              Sessieoverzicht deze week
            </p>
            {(() => {
              const currentWeek = acwr.weeklyHistory[acwr.weeklyHistory.length - 1]
              return (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Sessies</p>
                    <p className="font-semibold">{currentWeek.sessionCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gem. RPE</p>
                    <p className="font-semibold">{currentWeek.avgRPE}/10</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gem. duur</p>
                    <p className="font-semibold">{currentWeek.avgDuration} min</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Totale sRPE</p>
                    <p className="font-semibold">{currentWeek.totalSRPE}</p>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
