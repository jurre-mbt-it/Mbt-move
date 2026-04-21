'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import {
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  Tile,
} from '@/components/dark-ui'

// ─── Mock 1RM progression data ────────────────────────────────────────────────
const MOCK_1RM_DATA = [
  {
    exerciseId: '1',
    name: 'Bulgarian Split Squat',
    data: [
      { session: 1, date: '2026-01-10', value: 75 },
      { session: 2, date: '2026-01-17', value: 78 },
      { session: 3, date: '2026-01-24', value: 80 },
      { session: 4, date: '2026-01-31', value: 83 },
      { session: 5, date: '2026-02-07', value: 88 },
      { session: 6, date: '2026-02-14', value: 88 },
      { session: 7, date: '2026-02-21', value: 92 },
    ],
  },
  {
    exerciseId: '4',
    name: 'Single Leg Deadlift',
    data: [
      { session: 1, date: '2026-01-10', value: 50 },
      { session: 2, date: '2026-01-17', value: 53 },
      { session: 3, date: '2026-01-24', value: 55 },
      { session: 4, date: '2026-01-31', value: 55 },
      { session: 5, date: '2026-02-07', value: 58 },
      { session: 6, date: '2026-02-14', value: 60 },
      { session: 7, date: '2026-02-21', value: 65 },
    ],
  },
]

// ─── Mock tendinopathy pain data ───────────────────────────────────────────────
const MOCK_TENDINOPATHY_DATA = [
  { session: 1, date: '2026-01-10', painDuring: 3, painAfter24h: 4, morningStiffness: 3 },
  { session: 2, date: '2026-01-17', painDuring: 4, painAfter24h: 4, morningStiffness: 3 },
  { session: 3, date: '2026-01-24', painDuring: 3, painAfter24h: 3, morningStiffness: 2 },
  { session: 4, date: '2026-01-31', painDuring: 3, painAfter24h: 2, morningStiffness: 2 },
  { session: 5, date: '2026-02-07', painDuring: 2, painAfter24h: 2, morningStiffness: 1 },
  { session: 6, date: '2026-02-14', painDuring: 2, painAfter24h: 1, morningStiffness: 1 },
  { session: 7, date: '2026-02-21', painDuring: 2, painAfter24h: 1, morningStiffness: 1 },
]

const DAY_SHORT = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

export default function ProgressPage() {
  const { data: sessions } = trpc.patient.getSessionHistory.useQuery({ limit: 50 })
  const { data: program } = trpc.patient.getActiveProgram.useQuery()

  const history = sessions ?? []
  const streak = 5 // TODO: compute from consecutive days

  const avgPain =
    history.filter((s) => s.painLevel !== null).length > 0
      ? history.filter((s) => s.painLevel !== null).reduce((sum, s) => sum + (s.painLevel ?? 0), 0) /
        history.filter((s) => s.painLevel !== null).length
      : null

  const totalSessionsPlanned = program ? program.weeks * program.daysPerWeek : 0
  const adherence =
    totalSessionsPlanned > 0
      ? Math.min(Math.round((history.length / totalSessionsPlanned) * 100), 100)
      : 0

  // Pain trend: recent 3 vs older
  const painSessions = history.filter((s) => s.painLevel !== null)
  const recentPain =
    painSessions.slice(0, 3).reduce((a, b) => a + (b.painLevel ?? 0), 0) /
    Math.max(painSessions.slice(0, 3).length, 1)
  const olderPain =
    painSessions.slice(3).reduce((a, b) => a + (b.painLevel ?? 0), 0) /
    Math.max(painSessions.slice(3).length, 1)
  const painImproving = painSessions.length >= 4 && recentPain < olderPain

  // Volume per week from session history
  const weeklyVolume: { week: number; volume: number; label: string }[] = []
  if (program) {
    for (let w = 1; w <= program.currentWeek; w++) {
      weeklyVolume.push({ week: w, volume: 0, label: `W${w}` })
    }
    history.forEach((s) => {
      // Estimate week from completedAt vs program startDate
      if (program.startDate) {
        const start = new Date(program.startDate)
        const completed = new Date(s.completedAt)
        const daysSince = Math.max(
          0,
          Math.floor((completed.getTime() - start.getTime()) / 86_400_000),
        )
        const weekIdx = Math.min(Math.floor(daysSince / 7), weeklyVolume.length - 1)
        if (weeklyVolume[weekIdx]) {
          weeklyVolume[weekIdx].volume += s.durationMinutes
        }
      }
    })
  }
  const maxVolume = Math.max(...weeklyVolume.map((w) => w.volume), 1)

  // This week's sessions
  const today = new Date().getDay()
  const todayDayNum = today === 0 ? 7 : today
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const thisWeekSessions = history.filter((s) => new Date(s.completedAt) >= weekStart)
  const daysWithSessions = new Set(
    thisWeekSessions.map((s) => {
      const d = new Date(s.completedAt).getDay()
      return d === 0 ? 7 : d
    }),
  )

  return (
    <DarkScreen>
      <div className="max-w-lg w-full mx-auto px-4 pt-10 pb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Voortgang</Kicker>
          <Display size="md">OVERZICHT</Display>
          {program && (
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              {program.name}
            </MetaLabel>
          )}
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 gap-3">
          <MetricTile label="Streak" value={streak} unit="dagen" tint={P.gold} />
          <MetricTile label="Voltooid" value={history.length} unit="sessies" tint={P.lime} />
        </div>

        {/* Adherence */}
        {totalSessionsPlanned > 0 && (
          <Tile>
            <div className="flex items-center justify-between mb-2">
              <MetaLabel>Adherentie</MetaLabel>
              <span
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 14, fontWeight: 900 }}
              >
                {adherence}%
              </span>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden mb-2"
              style={{ backgroundColor: P.surfaceHi }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${adherence}%`, backgroundColor: P.lime }}
              />
            </div>
            <p style={{ color: P.inkMuted, fontSize: 12 }}>
              {history.length} van {totalSessionsPlanned} geplande sessies gedaan
            </p>
          </Tile>
        )}

        {/* Pain trend */}
        {painSessions.length > 0 && (
          <Tile>
            <div className="flex items-center gap-2 mb-3">
              <MetaLabel>Pijnverloop</MetaLabel>
              {avgPain !== null && (
                <span
                  className="athletic-mono ml-auto"
                  style={{ color: P.inkMuted, fontSize: 11 }}
                >
                  gem. {Math.round(avgPain * 10) / 10}/10
                </span>
              )}
            </div>
            <div className="flex items-end gap-1.5 h-20 mb-2">
              {[...history]
                .reverse()
                .slice(0, 10)
                .map((s, i) => {
                  const pain = s.painLevel ?? 0
                  const heightPct = (pain / 10) * 100
                  const color = pain <= 3 ? P.lime : pain <= 6 ? P.gold : P.danger
                  return (
                    <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-md transition-all relative"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: color,
                          minHeight: 4,
                        }}
                      >
                        <span
                          className="athletic-mono absolute -top-5 left-1/2 -translate-x-1/2"
                          style={{ color, fontSize: 10, fontWeight: 900 }}
                        >
                          {pain}
                        </span>
                      </div>
                      <span
                        className="athletic-mono"
                        style={{ color: P.inkDim, fontSize: 10 }}
                      >
                        S{i + 1}
                      </span>
                    </div>
                  )
                })}
            </div>
            {painImproving && (
              <p
                className="athletic-mono"
                style={{
                  color: P.lime,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                }}
              >
                ↓ Je pijn verbetert de laatste 3 sessies — goed bezig!
              </p>
            )}
          </Tile>
        )}

        {/* Volume per week */}
        {weeklyVolume.length > 0 && (
          <Tile>
            <div className="flex items-center gap-2 mb-3">
              <MetaLabel>Volume per week</MetaLabel>
              <span
                className="athletic-mono ml-auto"
                style={{ color: P.inkMuted, fontSize: 11 }}
              >
                minuten
              </span>
            </div>
            <div className="flex items-end gap-2 h-24">
              {weeklyVolume.map((w) => {
                const heightPct = (w.volume / maxVolume) * 100
                const isCurrent = w.week === program?.currentWeek
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                    <span
                      className="athletic-mono"
                      style={{
                        color: isCurrent ? P.lime : P.inkMuted,
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      {w.volume}
                    </span>
                    <div
                      className="w-full rounded-t-lg"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: isCurrent ? P.lime : P.surfaceHi,
                        minHeight: 4,
                      }}
                    />
                    <span
                      className="athletic-mono"
                      style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.06em' }}
                    >
                      {w.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </Tile>
        )}

        {/* This week calendar */}
        <Tile>
          <div className="flex items-center gap-2 mb-3">
            <MetaLabel>Sessies deze week</MetaLabel>
          </div>
          <div className="flex gap-1.5">
            {DAY_SHORT.map((d, i) => {
              const dayNum = i + 1
              const hadSession = daysWithSessions.has(dayNum)
              const isToday = dayNum === todayDayNum
              return (
                <div key={d} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="athletic-mono w-full aspect-square rounded-xl flex items-center justify-center max-w-[36px]"
                    style={
                      hadSession
                        ? { backgroundColor: P.lime, color: P.bg, fontSize: 12, fontWeight: 900 }
                        : isToday
                          ? {
                              backgroundColor: P.surfaceHi,
                              color: P.gold,
                              fontSize: 12,
                              fontWeight: 900,
                              border: `1px solid ${P.gold}`,
                            }
                          : {
                              backgroundColor: P.surfaceHi,
                              color: P.inkDim,
                              fontSize: 12,
                              fontWeight: 900,
                            }
                    }
                  >
                    {hadSession ? '✓' : d.slice(0, 1)}
                  </div>
                  <span
                    className="athletic-mono"
                    style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em' }}
                  >
                    {d}
                  </span>
                </div>
              )
            })}
          </div>
        </Tile>

        {/* ── 1RM Progressie ─────────────────────────────────────────────── */}
        <Tile>
          <div className="flex items-center gap-2 mb-3">
            <MetaLabel>1RM Progressie</MetaLabel>
          </div>
          <div className="flex flex-col gap-4">
            {MOCK_1RM_DATA.map((ex) => {
              const first = ex.data[0]?.value ?? 0
              const last = ex.data[ex.data.length - 1]?.value ?? 0
              const pctChange = first > 0 ? Math.round(((last - first) / first) * 100) : 0
              const maxVal = Math.max(...ex.data.map((d) => d.value))
              const minVal = Math.min(...ex.data.map((d) => d.value))
              const range = maxVal - minVal || 1
              const last3 = ex.data.slice(-3).map((d) => d.value)
              const isStagnant = last3.length === 3 && last3[2] <= last3[0]
              const suggestion = isStagnant
                ? 'Deload aanbevolen — 3 sessies geen progressie'
                : `Volgende sessie: probeer ${last + 2.5} kg`
              return (
                <div key={ex.exerciseId} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{ex.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="athletic-mono"
                        style={{ color: P.ink, fontSize: 13, fontWeight: 900 }}
                      >
                        {last} kg
                      </span>
                      <span
                        className="athletic-mono px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: P.surfaceHi,
                          color: pctChange >= 0 ? P.lime : P.danger,
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {pctChange >= 0 ? '+' : ''}
                        {pctChange}%
                      </span>
                    </div>
                  </div>
                  {/* Mini line chart using SVG */}
                  <svg
                    viewBox={`0 0 ${ex.data.length * 30} 40`}
                    className="w-full"
                    style={{ height: 40 }}
                  >
                    <polyline
                      fill="none"
                      stroke={P.lime}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={ex.data
                        .map((d, i) => {
                          const x = i * 30 + 5
                          const y = 35 - ((d.value - minVal) / range) * 30
                          return `${x},${y}`
                        })
                        .join(' ')}
                    />
                    {ex.data.map((d, i) => {
                      const x = i * 30 + 5
                      const y = 35 - ((d.value - minVal) / range) * 30
                      const isLast = i === ex.data.length - 1
                      return (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r={isLast ? 4 : 2.5}
                          fill={isLast ? P.lime : P.bg}
                          stroke={P.lime}
                          strokeWidth="1.5"
                        />
                      )
                    })}
                  </svg>
                  <p
                    className="athletic-mono"
                    style={{
                      color: isStagnant ? P.gold : P.inkMuted,
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'none',
                      fontWeight: 500,
                    }}
                  >
                    {suggestion}
                  </p>
                </div>
              )
            })}
          </div>
        </Tile>

        {/* ── Tendinopathie monitor ──────────────────────────────────────── */}
        <Tile>
          <div className="flex items-center gap-2 mb-1">
            <MetaLabel>Tendinopathie monitor</MetaLabel>
          </div>
          <p style={{ color: P.inkMuted, fontSize: 12, marginBottom: 12 }}>
            Pijn tijdens · 24u na · Ochtend stijfheid
          </p>

          {/* Silbernagel status */}
          {(() => {
            const last3 = MOCK_TENDINOPATHY_DATA.slice(-3).map((d) => d.painDuring)
            const latestPain =
              MOCK_TENDINOPATHY_DATA[MOCK_TENDINOPATHY_DATA.length - 1]?.painDuring ?? 0
            const rising = last3.length === 3 && last3[2] > last3[0] + 1
            let status: 'green' | 'yellow' | 'red' = 'green'
            if (latestPain > 7 || rising) status = 'red'
            else if (latestPain > 5) status = 'yellow'
            const statusConfig = {
              green: { label: 'Belasting OK', color: P.lime },
              yellow: { label: 'Verhoogde pijn, monitor', color: P.gold },
              red: { label: 'Stop, consult therapeut', color: P.danger },
            }[status]
            return (
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3"
                style={{
                  backgroundColor: P.surfaceHi,
                  borderLeft: `3px solid ${statusConfig.color}`,
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: statusConfig.color }}
                />
                <span
                  className="athletic-mono"
                  style={{
                    color: statusConfig.color,
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                  }}
                >
                  SILBERNAGEL: {statusConfig.label.toUpperCase()}
                </span>
              </div>
            )
          })()}

          {/* Multi-line mini chart */}
          {(() => {
            const data = MOCK_TENDINOPATHY_DATA
            const n = data.length
            return (
              <div className="flex flex-col gap-2">
                <svg viewBox={`0 0 ${n * 30} 50`} className="w-full" style={{ height: 50 }}>
                  {/* painDuring — gold */}
                  <polyline
                    fill="none"
                    stroke={P.gold}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={data
                      .map((d, i) => `${i * 30 + 5},${45 - (d.painDuring / 10) * 40}`)
                      .join(' ')}
                  />
                  {/* painAfter24h — ice */}
                  <polyline
                    fill="none"
                    stroke={P.ice}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={data
                      .map(
                        (d, i) => `${i * 30 + 5},${45 - ((d.painAfter24h ?? 0) / 10) * 40}`,
                      )
                      .join(' ')}
                  />
                  {/* morningStiffness — purple */}
                  <polyline
                    fill="none"
                    stroke={P.purple}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={data
                      .map(
                        (d, i) =>
                          `${i * 30 + 5},${45 - ((d.morningStiffness ?? 0) / 10) * 40}`,
                      )
                      .join(' ')}
                  />
                </svg>
                <div className="flex gap-3">
                  <span
                    className="athletic-mono flex items-center gap-1"
                    style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: P.gold }}
                    />
                    TIJDENS
                  </span>
                  <span
                    className="athletic-mono flex items-center gap-1"
                    style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: P.ice }}
                    />
                    24U NA
                  </span>
                  <span
                    className="athletic-mono flex items-center gap-1"
                    style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: P.purple }}
                    />
                    OCHTEND
                  </span>
                </div>
                <Link
                  href="/patient/follow-up"
                  className="athletic-mono inline-flex items-center gap-1 mt-1"
                  style={{
                    color: P.lime,
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                  }}
                >
                  + 24U FOLLOW-UP INVULLEN
                </Link>
              </div>
            )
          })()}
        </Tile>

        {/* Pain report CTA */}
        <Tile href="/patient/pain" accentBar={P.danger}>
          <div className="flex items-center gap-3">
            <span
              className="athletic-mono"
              style={{ color: P.danger, fontSize: 22, fontWeight: 900 }}
              aria-hidden
            >
              +
            </span>
            <div className="flex-1">
              <p
                className="athletic-mono"
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                PIJN RAPPORTEREN
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>Los van een sessie</p>
            </div>
            <span style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>
              →
            </span>
          </div>
        </Tile>
      </div>
    </DarkScreen>
  )
}
