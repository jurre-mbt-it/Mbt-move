'use client'

import { useMemo } from 'react'
import { P, Tile, Kicker, MetaLabel } from '@/components/dark-ui'
import {
  calculateACWR,
  ACWR_ZONE_CONFIG,
  type SessionWorkload,
} from '@/lib/workload-monitoring'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'

interface Props {
  sessions: SessionWorkload[]
}

export function WorkloadPanel({ sessions }: Props) {
  const acwr = useMemo(() => calculateACWR(sessions), [sessions])
  const zone = ACWR_ZONE_CONFIG[acwr.zone]

  const maxWeekly = Math.max(...acwr.weeklyHistory.map(w => w.totalSRPE), 1)
  const needlePercent = ((Math.min(1.8, Math.max(0.4, acwr.acwr)) - 0.4) / 1.4) * 100

  const wowAbs = Math.abs(acwr.weekOverWeekChange)
  const wowColor = wowAbs > 25 ? P.danger : wowAbs > 10 ? P.gold : P.lime
  const changeIcon =
    acwr.weekOverWeekChange > 10 ? (
      <TrendingUp className="w-3.5 h-3.5" />
    ) : acwr.weekOverWeekChange < -10 ? (
      <TrendingDown className="w-3.5 h-3.5" />
    ) : (
      <Minus className="w-3.5 h-3.5" />
    )

  return (
    <div className="space-y-3">
      {/* Load Insights ACWR tile */}
      <Tile accentBar={zone.color}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <Kicker style={{ color: zone.color }}>LOAD INSIGHTS</Kicker>
            <div
              className="athletic-display"
              style={{
                color: zone.color,
                fontSize: 40,
                lineHeight: '44px',
                letterSpacing: '-0.035em',
                fontWeight: 900,
                paddingTop: 4,
                marginTop: 2,
              }}
            >
              {acwr.acwr}
            </div>
            <div style={{ marginTop: 6 }}>
              <MetaLabel style={{ color: zone.color }}>{zone.label.toUpperCase()}</MetaLabel>
            </div>
          </div>
          <div className="text-right">
            <MetaLabel>DOELZONE</MetaLabel>
            <div
              className="athletic-mono"
              style={{
                color: P.lime,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '0.08em',
                marginTop: 4,
              }}
            >
              1.0 – 1.3
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Zone target bracket */}
          <div className="flex mb-1.5" aria-hidden>
            <div style={{ width: `${(0.6 / 1.4) * 100}%` }} />
            <div style={{ width: `${(0.3 / 1.4) * 100}%` }} className="relative">
              <div className="absolute top-0 left-0 right-0 text-center">
                <MetaLabel style={{ color: P.lime, fontSize: 9 }}>DOEL</MetaLabel>
              </div>
            </div>
          </div>

          {/* Track — gesegmenteerd */}
          <div
            className="relative h-2.5 rounded-full overflow-visible flex"
            style={{ backgroundColor: P.surfaceLow }}
          >
            <div style={{ width: `${(0.4 / 1.4) * 100}%`, borderRadius: '999px 0 0 999px', background: P.ice, opacity: 0.55 }} />
            <div style={{ width: `${(0.2 / 1.4) * 100}%`, background: P.lime, opacity: 0.55 }} />
            <div style={{ width: `${(0.3 / 1.4) * 100}%`, background: P.lime }} />
            <div style={{ width: `${(0.2 / 1.4) * 100}%`, background: P.gold }} />
            <div style={{ flex: 1, borderRadius: '0 999px 999px 0', background: P.danger }} />

            {/* Needle */}
            <div
              className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded-full z-10 transition-all duration-700"
              style={{
                left: `calc(${needlePercent}% - 1.5px)`,
                background: P.ink,
                boxShadow: '0 0 0 2px rgba(0,0,0,0.5)',
              }}
            />
          </div>

          {/* Scale labels */}
          <div
            className="athletic-mono flex justify-between mt-2 px-0.5"
            style={{
              color: P.inkMuted,
              fontSize: 10,
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            <span>0.4</span>
            <span>0.8</span>
            <span>1.0</span>
            <span>1.3</span>
            <span>1.5</span>
            <span>1.8</span>
          </div>
        </div>
      </Tile>

      {/* Stats trio */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="ACUTE" value={acwr.acuteWorkload} sub="DEZE WEEK" tint={P.ink} />
        <StatTile label="CHRONIC" value={acwr.chronicWorkload} sub="4-WK GEM." tint={P.ink} />
        <StatTile
          label="WOW"
          value={`${acwr.weekOverWeekChange > 0 ? '+' : ''}${acwr.weekOverWeekChange}%`}
          sub={
            <span className="flex items-center justify-center gap-1" style={{ color: wowColor }}>
              {changeIcon}
              <span>WEEK-OP-WEEK</span>
            </span>
          }
          tint={wowColor}
        />
      </div>

      {/* Weekly bar chart */}
      {acwr.weeklyHistory.length > 0 && (
        <Tile>
          <Kicker style={{ marginBottom: 12 }}>WEKELIJKSE BELASTING · sRPE</Kicker>
          <div className="flex items-end gap-2" style={{ height: 128 }}>
            {acwr.weeklyHistory.map((week, i) => {
              const pct = (week.totalSRPE / maxWeekly) * 100
              const isCurrentWeek = i === acwr.weeklyHistory.length - 1
              const barColor = isCurrentWeek ? zone.color : P.inkDim

              return (
                <div key={week.weekLabel} className="flex-1 flex flex-col items-center gap-1.5">
                  <span
                    className="athletic-mono"
                    style={{
                      color: isCurrentWeek ? zone.color : P.inkMuted,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {week.totalSRPE}
                  </span>
                  <div
                    className="w-full flex items-end justify-center"
                    style={{ height: 82 }}
                  >
                    <div
                      className="w-full max-w-[32px] rounded-t-md transition-all duration-500"
                      style={{ height: `${Math.max(4, pct)}%`, background: barColor }}
                    />
                  </div>
                  <span
                    className="athletic-mono"
                    style={{
                      color: isCurrentWeek ? P.ink : P.inkMuted,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {week.weekLabel}
                  </span>
                  <span
                    className="athletic-mono"
                    style={{
                      color: P.inkDim,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {week.sessionCount}×
                  </span>
                </div>
              )
            })}
          </div>

          {/* Gabbett recommendation */}
          {wowAbs > 10 && (
            <div
              className="mt-4 rounded-xl p-3 flex items-start gap-2.5"
              style={{
                background: wowAbs > 25 ? 'rgba(248,113,113,0.12)' : 'rgba(244,194,97,0.12)',
                border: `1px solid ${wowAbs > 25 ? 'rgba(248,113,113,0.3)' : 'rgba(244,194,97,0.3)'}`,
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: wowAbs > 25 ? P.danger : P.gold }}
              />
              <div className="flex-1 min-w-0">
                <div
                  style={{
                    color: wowAbs > 25 ? P.danger : P.gold,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.01em',
                    textTransform: 'uppercase',
                  }}
                >
                  {acwr.weekOverWeekChange > 25
                    ? 'Sterke stijging in belasting'
                    : acwr.weekOverWeekChange > 10
                      ? 'Geleidelijke stijging'
                      : 'Daling in belasting'}
                </div>
                <p
                  style={{
                    color: P.inkMuted,
                    fontSize: 12,
                    lineHeight: '17px',
                    marginTop: 4,
                  }}
                >
                  Gabbett adviseert max 10% stijging per week. Huidige verandering:{' '}
                  {acwr.weekOverWeekChange > 0 ? '+' : ''}
                  {acwr.weekOverWeekChange}%.
                </p>
              </div>
            </div>
          )}
        </Tile>
      )}

      {/* Session details this week */}
      {acwr.weeklyHistory.length > 0 && (
        <Tile>
          <Kicker style={{ marginBottom: 12 }}>SESSIEOVERZICHT DEZE WEEK</Kicker>
          {(() => {
            const currentWeek = acwr.weeklyHistory[acwr.weeklyHistory.length - 1]
            return (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <SessionStat label="SESSIES" value={currentWeek.sessionCount} />
                <SessionStat label="GEM. RPE" value={`${currentWeek.avgRPE}/10`} />
                <SessionStat label="GEM. DUUR" value={`${currentWeek.avgDuration} min`} />
                <SessionStat label="TOTALE sRPE" value={currentWeek.totalSRPE} />
              </div>
            )
          })()}
        </Tile>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  sub,
  tint,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tint: string
}) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center text-center gap-1"
      style={{ backgroundColor: P.surface, padding: '14px 8px' }}
    >
      <MetaLabel style={{ color: P.inkMuted, fontSize: 9 }}>{label}</MetaLabel>
      <span
        className="athletic-display"
        style={{
          color: tint,
          fontSize: 22,
          lineHeight: '24px',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          paddingTop: 2,
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="athletic-mono"
          style={{
            color: P.inkMuted,
            fontSize: 9,
            letterSpacing: '0.12em',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}

function SessionStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <MetaLabel style={{ color: P.inkMuted, fontSize: 10 }}>{label}</MetaLabel>
      <div
        style={{
          color: P.ink,
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  )
}
