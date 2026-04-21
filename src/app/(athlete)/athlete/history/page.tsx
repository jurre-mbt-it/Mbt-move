'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  MetricTile,
} from '@/components/dark-ui'

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

export default function AthleteHistoryPage() {
  const { data: sessions, isLoading } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })
  const [expanded, setExpanded] = useState<string | null>(null)

  const history = sessions ?? []
  const totalMinutes = history.reduce((s, h) => s + h.durationMinutes, 0)

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Kicker>VOORTGANG · {history.length} SESSIES</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(44px, 12vw, 80px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            VOORTGANG
          </h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="STREAK" value={5} unit="DG" tint={P.gold} />
          <MetricTile
            label="TOTAAL"
            value={history.length}
            tint={P.lime}
          />
          <MetricTile
            label="TIJD"
            value={Math.round(totalMinutes / 60)}
            unit="U"
            tint={P.ice}
          />
        </div>

        {/* Session list header */}
        <div className="pt-2">
          <Kicker style={{ marginBottom: 8 }}>SESSIEGESCHIEDENIS</Kicker>
        </div>

        {isLoading && (
          <Tile style={{ padding: 24, textAlign: 'center' }}>
            <MetaLabel>LADEN…</MetaLabel>
          </Tile>
        )}

        {!isLoading && history.length === 0 && (
          <Tile style={{ padding: 32, textAlign: 'center' }}>
            <MetaLabel>NOG GEEN SESSIES VOLTOOID</MetaLabel>
          </Tile>
        )}

        <div className="space-y-2">
          {history.map(session => {
            const isOpen = expanded === session.id
            return (
              <div
                key={session.id}
                className="rounded-xl overflow-hidden"
                style={{
                  background: P.surface,
                  borderLeft: `3px solid ${P.lime}`,
                  border: `1px solid ${P.line}`,
                }}
              >
                <button
                  type="button"
                  className="w-full text-left flex items-center gap-3"
                  style={{ padding: '12px 14px' }}
                  onClick={() => setExpanded(isOpen ? null : session.id)}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.line}`,
                      color: P.lime,
                      fontWeight: 900,
                      fontSize: 16,
                    }}
                  >
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{
                        color: P.ink,
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {new Date(session.completedAt).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </p>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        letterSpacing: '0.14em',
                        fontWeight: 700,
                        color: P.inkMuted,
                        marginTop: 3,
                        textTransform: 'uppercase',
                      }}
                    >
                      <span>{session.exerciseCount} OEF</span>
                      <span style={{ color: P.inkDim }}>·</span>
                      <span>{session.durationMinutes} MIN</span>
                      {session.programName && (
                        <>
                          <span style={{ color: P.inkDim }}>·</span>
                          <span className="truncate">{session.programName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {session.painLevel !== null && (
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: 10,
                          letterSpacing: '0.14em',
                          fontWeight: 700,
                          color: P.inkMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        PIJN {session.painLevel}/10
                      </span>
                    )}
                    <span style={{ color: P.inkMuted, fontSize: 16 }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div
                    className="space-y-3"
                    style={{
                      padding: '12px 14px',
                      borderTop: `1px solid ${P.line}`,
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className="rounded-xl text-center"
                        style={{
                          background: P.surfaceLow,
                          border: `1px solid ${P.line}`,
                          padding: 12,
                        }}
                      >
                        <p
                          className="athletic-display"
                          style={{
                            color: P.ink,
                            fontSize: 22,
                            fontWeight: 900,
                            lineHeight: '26px',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {session.durationMinutes}
                        </p>
                        <div style={{ marginTop: 4 }}>
                          <MetaLabel>MIN DUUR</MetaLabel>
                        </div>
                      </div>
                      <div
                        className="rounded-xl text-center"
                        style={{
                          background: P.surfaceLow,
                          border: `1px solid ${P.line}`,
                          padding: 12,
                        }}
                      >
                        <p
                          className="athletic-display"
                          style={{
                            color: P.ink,
                            fontSize: 22,
                            fontWeight: 900,
                            lineHeight: '26px',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {session.exerciseCount}
                        </p>
                        <div style={{ marginTop: 4 }}>
                          <MetaLabel>OEFENINGEN</MetaLabel>
                        </div>
                      </div>
                      {session.painLevel !== null && (
                        <div
                          className="rounded-xl text-center"
                          style={{
                            background: P.surfaceLow,
                            border: `1px solid ${P.line}`,
                            padding: 12,
                          }}
                        >
                          <p
                            className="athletic-display"
                            style={{
                              color: P.danger,
                              fontSize: 22,
                              fontWeight: 900,
                              lineHeight: '26px',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {session.painLevel}/10
                          </p>
                          <div style={{ marginTop: 4 }}>
                            <MetaLabel>PIJN</MetaLabel>
                          </div>
                        </div>
                      )}
                      {session.exertionLevel !== null && (
                        <div
                          className="rounded-xl text-center"
                          style={{
                            background: P.surfaceLow,
                            border: `1px solid ${P.line}`,
                            padding: 12,
                          }}
                        >
                          <p
                            className="athletic-display"
                            style={{
                              color: P.gold,
                              fontSize: 22,
                              fontWeight: 900,
                              lineHeight: '26px',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {session.exertionLevel}/10
                          </p>
                          <div style={{ marginTop: 4 }}>
                            <MetaLabel>INSPANNING</MetaLabel>
                          </div>
                        </div>
                      )}
                    </div>
                    {session.notes && (
                      <p
                        style={{
                          color: P.inkMuted,
                          fontSize: 12,
                          fontStyle: 'italic',
                          lineHeight: 1.5,
                        }}
                      >
                        &ldquo;{session.notes}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
