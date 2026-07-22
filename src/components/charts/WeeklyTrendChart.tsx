'use client'

import { useMemo } from 'react'
import { P, Kicker, MetaLabel } from '@/components/dark-ui'

type SessionLike = {
  completedAt: string | Date
  exertionLevel: number | null
  painLevel: number | null
  durationSeconds?: number
  durationMinutes?: number
}

type DayStats = {
  label: string
  avgRpe: number | null
  avgPain: number | null
  sRPE: number   // sum RPE × minuten — voor bar-hoogte
  isToday: boolean
}

const DAY_LABELS = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'] as const

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const dow = out.getDay() // 0=zo
  const diff = dow === 0 ? -6 : 1 - dow
  out.setDate(out.getDate() + diff)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Wekelijkse trend: RPE-balken (sRPE als hoogte) + pijn-lijntje overlay.
 * Vervangt de oude RecoveryPanel/WorkloadPanel — eenvoudiger en gebaseerd
 * op direct ingevulde RPE + pijn per sessie. Toont alleen wat er staat,
 * geen voorspellingen.
 */
export function WeeklyTrendChart({ sessions }: { sessions: SessionLike[] }) {
  const days: DayStats[] = useMemo(() => {
    const weekStart = startOfWeek(new Date())
    const todayIdx = (() => {
      const dow = new Date().getDay()
      return dow === 0 ? 6 : dow - 1
    })()

    // Bucket sessies per dag-van-de-week (Ma..Zo)
    const buckets: Array<{ rpe: number[]; pain: number[]; sRPE: number }> = Array.from(
      { length: 7 },
      () => ({ rpe: [], pain: [], sRPE: 0 }),
    )

    for (const s of sessions) {
      const d = new Date(s.completedAt)
      if (d < weekStart) continue
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
      if (dow < 0 || dow > 6) continue
      if (s.exertionLevel !== null && s.exertionLevel !== undefined) {
        buckets[dow].rpe.push(s.exertionLevel)
        const mins =
          s.durationMinutes ??
          (s.durationSeconds ? Math.round(s.durationSeconds / 60) : 0)
        buckets[dow].sRPE += s.exertionLevel * Math.max(mins, 0)
      }
      if (s.painLevel !== null && s.painLevel !== undefined) {
        buckets[dow].pain.push(s.painLevel)
      }
    }

    return buckets.map((b, i) => ({
      label: DAY_LABELS[i],
      avgRpe: b.rpe.length ? b.rpe.reduce((a, n) => a + n, 0) / b.rpe.length : null,
      avgPain: b.pain.length ? b.pain.reduce((a, n) => a + n, 0) / b.pain.length : null,
      sRPE: b.sRPE,
      isToday: i === todayIdx,
    }))
  }, [sessions])

  const weekAvgRpe = (() => {
    const all = sessions
      .filter((s) => new Date(s.completedAt) >= startOfWeek(new Date()))
      .map((s) => s.exertionLevel)
      .filter((v): v is number => v !== null && v !== undefined)
    if (all.length === 0) return null
    return all.reduce((a, n) => a + n, 0) / all.length
  })()

  const weekAvgPain = (() => {
    const all = sessions
      .filter((s) => new Date(s.completedAt) >= startOfWeek(new Date()))
      .map((s) => s.painLevel)
      .filter((v): v is number => v !== null && v !== undefined)
    if (all.length === 0) return null
    return all.reduce((a, n) => a + n, 0) / all.length
  })()

  const maxSrpe = Math.max(...days.map((d) => d.sRPE), 1)
  const hasData = days.some((d) => d.avgRpe !== null || d.avgPain !== null)

  return (
    <div
      className="rounded-2xl"
      style={{ background: P.surface, padding: 16 }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <Kicker>Deze week</Kicker>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: P.brand,
                display: 'inline-block',
              }}
            />
            <span
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}
            >
              RPE
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{
                width: 8,
                height: 2,
                background: P.danger,
                display: 'inline-block',
              }}
            />
            <span
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}
            >
              PIJN
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-4 mb-3">
        <Stat
          label="GEM. RPE"
          value={weekAvgRpe !== null ? weekAvgRpe.toFixed(1) : '—'}
          unit="/10"
          tint={P.brand}
        />
        <Stat
          label="GEM. PIJN"
          value={weekAvgPain !== null ? weekAvgPain.toFixed(1) : '—'}
          unit="/10"
          tint={P.danger}
        />
      </div>

      {hasData ? (
        <ChartBody days={days} maxSrpe={maxSrpe} />
      ) : (
        <div
          className="rounded-xl py-6 text-center"
          style={{ background: P.surfaceLow, border: `1px dashed ${P.line}` }}
        >
          <MetaLabel>Nog geen sessies deze week</MetaLabel>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  unit,
  tint,
}: {
  label: string
  value: string
  unit: string
  tint: string
}) {
  return (
    <div className="flex flex-col">
      <MetaLabel>{label}</MetaLabel>
      <div className="flex items-baseline gap-0.5">
        <span
          style={{
            color: tint,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            fontFamily: 'Inter Tight, Inter, sans-serif',
          }}
        >
          {value}
        </span>
        <span style={{ color: P.inkMuted, fontSize: 10, fontWeight: 700 }}>{unit}</span>
      </div>
    </div>
  )
}

function ChartBody({ days, maxSrpe }: { days: DayStats[]; maxSrpe: number }) {
  // SVG-based zodat de pijn-lijn netjes over de balken loopt.
  const W = 280
  const H = 90
  const cols = days.length
  const colW = W / cols
  const padTop = 6
  const chartH = H - padTop - 14 // ruimte onderaan voor dag-labels

  // Pijn-lijn (0-10 schaal) → y-positie
  const painY = (p: number) => padTop + chartH - (p / 10) * chartH
  const linePoints = days
    .map((d, i) => (d.avgPain !== null ? `${i * colW + colW / 2},${painY(d.avgPain)}` : null))
    .filter((p): p is string => p !== null)
    .join(' ')

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {/* Grid-lijntjes (0, 5, 10) */}
        {[0, 0.5, 1].map((t, i) => (
          <line
            key={i}
            x1={0}
            x2={W}
            y1={padTop + chartH * t}
            y2={padTop + chartH * t}
            stroke={P.line}
            strokeDasharray={t === 0.5 ? '2 4' : undefined}
          />
        ))}

        {/* RPE-balken (hoogte = sRPE relatief aan max) */}
        {days.map((d, i) => {
          const h = d.sRPE > 0 ? (d.sRPE / maxSrpe) * chartH : 0
          const x = i * colW + colW * 0.25
          const w = colW * 0.5
          const y = padTop + chartH - h
          return (
            <rect
              key={`bar-${i}`}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2}
              fill={d.isToday ? P.brand : 'rgba(232,122,85,0.55)'}
            />
          )
        })}

        {/* Pijn-lijn */}
        {linePoints && (
          <polyline
            points={linePoints}
            fill="none"
            stroke={P.danger}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Pijn-dots */}
        {days.map((d, i) =>
          d.avgPain !== null ? (
            <circle
              key={`pain-${i}`}
              cx={i * colW + colW / 2}
              cy={painY(d.avgPain)}
              r={2.5}
              fill={P.danger}
            />
          ) : null,
        )}

        {/* Dag-labels */}
        {days.map((d, i) => (
          <text
            key={`lbl-${i}`}
            x={i * colW + colW / 2}
            y={H - 2}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill={d.isToday ? P.brand : P.inkMuted}
            style={{ fontFamily: 'var(--font-mono-athletic)', letterSpacing: '0.06em' }}
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
