'use client'

/**
 * Readiness-tegel: gauge (0-100) + traffic-light band + uitlegbare bijdrage
 * per signaal + 30-daagse trend. Voedt op de hybride score uit
 * src/lib/readiness.ts. Bij < baseline-drempel toont 'ie de LEARNING-staat.
 */
import dynamic from 'next/dynamic'
import { Tile, Kicker, MetaLabel, P } from '@/components/dark-ui'
import type { Contributor, ReadinessBandKey, ReadinessResult } from '@/lib/readiness'

// Recharts lazy laden: de sparkline is het enige chart-deel van deze tegel en
// hoort niet in de initiële bundle. Container reserveert de hoogte al.
const ReadinessTrendChart = dynamic(
  () => import('./ReadinessTrendChart').then(m => m.ReadinessTrendChart),
  { ssr: false, loading: () => null },
)

const BAND_COLOR: Record<ReadinessBandKey, string> = {
  GREEN: P.lime,
  AMBER: P.gold,
  RED: P.danger,
  LEARNING: P.ice,
}

const STATUS_LABEL: Record<Contributor['status'], string> = {
  above: 'boven normaal',
  within: 'normaal',
  below: 'onder normaal',
  na: 'geen data',
}
const STATUS_COLOR: Record<Contributor['status'], string> = {
  above: P.lime,
  within: P.inkMuted,
  below: P.danger,
  na: P.inkDim,
}

type TrendPoint = { date: string; score: number; band: ReadinessBandKey | 'GREEN' | 'AMBER' | 'RED' }

export function ReadinessCard({
  readiness,
  trend = [],
}: {
  readiness: ReadinessResult
  trend?: TrendPoint[]
}) {
  const color = BAND_COLOR[readiness.band]
  const score = readiness.score

  return (
    <Tile accentBar={color}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Kicker style={{ color }}>READINESS</Kicker>
          <div
            className="athletic-display"
            style={{
              color: P.ink, fontSize: 22, lineHeight: '26px',
              letterSpacing: '-0.02em', fontWeight: 900,
              textTransform: 'uppercase', paddingTop: 4,
            }}
          >
            {readiness.label}
          </div>
          <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: '17px', marginTop: 6 }}>
            {readiness.description}
          </p>
        </div>
        <Gauge score={score} color={color} />
      </div>

      {/* Trend-sparkline */}
      {trend.length >= 3 && score != null && (
        <div className="mt-4" style={{ height: 44 }}>
          <ReadinessTrendChart trend={trend} color={color} />
        </div>
      )}

      {/* Contributor breakdown */}
      <div className="mt-4 pt-3 space-y-2" style={{ borderTop: `1px solid ${P.line}` }}>
        <MetaLabel style={{ color: P.inkMuted }}>WAT BEPAALT DEZE SCORE</MetaLabel>
        {readiness.contributors
          .filter(c => c.key !== 'wellness' || c.points != null)
          .map(c => (
            <ContributorRow key={c.key} c={c} />
          ))}
      </div>

      {readiness.band === 'LEARNING' && (
        <div
          className="mt-3 rounded-xl"
          style={{ backgroundColor: P.surfaceLow, border: `1px solid ${P.line}`, padding: '10px 12px' }}
        >
          <MetaLabel style={{ color: P.ice }}>
            {readiness.baselineNights}/7 NACHTEN · BASELINE OPBOUWEN
          </MetaLabel>
        </div>
      )}
    </Tile>
  )
}

function Gauge({ score, color }: { score: number | null; color: string }) {
  const R = 30
  const C = 2 * Math.PI * R
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const dash = C * 0.75 // 270° boog
  const offset = dash * (1 - pct)

  return (
    <div className="relative shrink-0" style={{ width: 78, height: 78 }}>
      <svg width={78} height={78} viewBox="0 0 78 78" style={{ transform: 'rotate(135deg)' }}>
        <circle
          cx={39} cy={39} r={R} fill="none" stroke={P.surfaceHi} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
        />
        <circle
          cx={39} cy={39} r={R} fill="none" stroke={color} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="athletic-display"
          style={{ color, fontSize: 26, lineHeight: '26px', letterSpacing: '-0.03em', fontWeight: 900 }}
        >
          {score ?? '—'}
        </span>
      </div>
    </div>
  )
}

function ContributorRow({ c }: { c: Contributor }) {
  const color = STATUS_COLOR[c.status]
  const pts = c.points ?? 0
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0" style={{ width: 74, color: P.ink, fontSize: 12, fontWeight: 700 }}>
        {c.label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.track }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${c.points == null ? 0 : pts}%`,
            background: color,
            transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
      <span
        className="athletic-mono shrink-0 text-right"
        style={{ width: 86, color, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}
      >
        {STATUS_LABEL[c.status]}
      </span>
    </div>
  )
}
