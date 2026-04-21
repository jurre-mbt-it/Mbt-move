'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  DARK_CHART_STYLES,
  DarkChartTooltip,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  Tile,
} from '@/components/dark-ui'

function PainDot({ level }: { level: number }) {
  const color = level <= 3 ? P.lime : level <= 6 ? P.gold : P.danger
  return (
    <span
      className="athletic-mono inline-flex items-center gap-1"
      style={{ color, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em' }}
    >
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ backgroundColor: color }}
      />
      {level}/10
    </span>
  )
}

export default function HistoryPage() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeChart, setActiveChart] = useState<'volume' | 'pain'>('volume')

  const { data: sessions = [], isLoading } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })

  const totalMin = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const avgPain =
    sessions.filter((s) => s.painLevel !== null).length > 0
      ? sessions
          .filter((s) => s.painLevel !== null)
          .reduce((sum, s, _, arr) => sum + (s.painLevel ?? 0) / arr.length, 0)
      : null

  const chartData = [...sessions].reverse().map((s, i) => ({
    name: new Date(s.completedAt).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    }),
    sessieNr: i + 1,
    duur: s.durationMinutes,
    pain: s.painLevel ?? 0,
  }))

  return (
    <DarkScreen>
      <div className="max-w-lg w-full mx-auto px-4 pt-10 pb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Geschiedenis</Kicker>
          <Display size="md">VOORTGANG</Display>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {sessions.length} sessies afgerond
          </MetaLabel>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <MetricTile label="Totaal" value={sessions.length} tint={P.lime} />
          <MetricTile
            label="Gem. pijn"
            value={avgPain !== null ? avgPain.toFixed(1) : '—'}
            tint={avgPain !== null && avgPain <= 3 ? P.lime : avgPain !== null && avgPain <= 6 ? P.gold : P.danger}
          />
          <MetricTile label="Min" value={totalMin} tint={P.ice} />
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <Tile>
            <div className="flex items-center justify-between mb-3">
              <MetaLabel>Grafiek</MetaLabel>
              <div
                className="flex rounded-xl overflow-hidden athletic-mono"
                style={{ border: `1px solid ${P.lineStrong}` }}
              >
                <button
                  type="button"
                  onClick={() => setActiveChart('volume')}
                  className="athletic-tap px-3 py-1.5 transition-all"
                  style={{
                    backgroundColor: activeChart === 'volume' ? P.lime : 'transparent',
                    color: activeChart === 'volume' ? P.bg : P.inkMuted,
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                  }}
                >
                  VOLUME
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChart('pain')}
                  className="athletic-tap px-3 py-1.5 transition-all"
                  style={{
                    backgroundColor: activeChart === 'pain' ? P.lime : 'transparent',
                    color: activeChart === 'pain' ? P.bg : P.inkMuted,
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                  }}
                >
                  PIJN
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid {...DARK_CHART_STYLES.grid} />
                <XAxis dataKey="name" {...DARK_CHART_STYLES.axis} />
                <YAxis {...DARK_CHART_STYLES.axis} />
                <Tooltip content={<DarkChartTooltip />} cursor={{ fill: P.surfaceHi }} />
                <Bar
                  dataKey={activeChart === 'volume' ? 'duur' : 'pain'}
                  name={activeChart === 'volume' ? 'Duur (min)' : 'Pijn (/10)'}
                  radius={[4, 4, 0, 0]}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        activeChart === 'volume'
                          ? P.lime
                          : entry.pain <= 3
                            ? P.lime
                            : entry.pain <= 6
                              ? P.gold
                              : P.danger
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Tile>
        )}

        {/* Session list */}
        <MetaLabel>Sessiegeschiedenis</MetaLabel>

        {isLoading && (
          <p
            className="athletic-mono text-center py-4"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}
          >
            LADEN…
          </p>
        )}

        {!isLoading && sessions.length === 0 && (
          <Tile>
            <p className="text-center py-4" style={{ color: P.inkMuted, fontSize: 13 }}>
              Nog geen sessies voltooid
            </p>
          </Tile>
        )}

        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const isOpen = expanded === session.id
            const date = new Date(session.completedAt)
            const dateStr = date
              .toLocaleDateString('nl-NL', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })
              .toUpperCase()

            return (
              <Tile key={session.id}>
                <button
                  type="button"
                  className="athletic-tap w-full flex items-center gap-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : session.id)}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 3,
                      height: 36,
                      borderRadius: 1.5,
                      backgroundColor: P.lime,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="athletic-mono"
                      style={{
                        color: P.ink,
                        fontSize: 13,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {dateStr}
                    </p>
                    <p
                      className="athletic-mono"
                      style={{
                        color: P.inkMuted,
                        fontSize: 11,
                        marginTop: 2,
                        textTransform: 'none',
                        fontWeight: 500,
                      }}
                    >
                      {session.exerciseCount} oefeningen · {session.durationMinutes} min
                      {session.programName ? ` · ${session.programName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {session.painLevel !== null && <PainDot level={session.painLevel} />}
                    <span style={{ color: P.inkMuted, fontSize: 14 }} aria-hidden>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div
                    className="mt-3 pt-3 flex flex-col gap-2"
                    style={{ borderTop: `1px solid ${P.line}` }}
                  >
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p
                          className="athletic-mono"
                          style={{ color: P.ink, fontSize: 16, fontWeight: 900 }}
                        >
                          {session.exerciseCount}
                        </p>
                        <MetaLabel>Oefeningen</MetaLabel>
                      </div>
                      <div>
                        <p
                          className="athletic-mono"
                          style={{ color: P.ink, fontSize: 16, fontWeight: 900 }}
                        >
                          {session.durationMinutes} min
                        </p>
                        <MetaLabel>Duur</MetaLabel>
                      </div>
                      <div>
                        <p
                          className="athletic-mono"
                          style={{ color: P.ink, fontSize: 16, fontWeight: 900 }}
                        >
                          {session.exertionLevel !== null ? `${session.exertionLevel}/10` : '—'}
                        </p>
                        <MetaLabel>Inspanning</MetaLabel>
                      </div>
                    </div>
                    {session.notes && (
                      <p
                        className="italic rounded-lg px-3 py-2"
                        style={{
                          color: P.inkMuted,
                          fontSize: 12,
                          backgroundColor: P.surfaceHi,
                        }}
                      >
                        &ldquo;{session.notes}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </Tile>
            )
          })}
        </div>
      </div>
    </DarkScreen>
  )
}
