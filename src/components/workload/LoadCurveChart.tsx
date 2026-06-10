'use client'

/**
 * Belasting-curve: fitness-fatigue (supercompensatie) grafiek over kracht +
 * cardio, gedeeld door therapeut (patiëntdossier · Voortgang), atleet en
 * patiënt. Zie src/lib/training-load.ts voor het model.
 *
 * Visueel: dagelijkse load als staafjes, Fitheid (lime) en Vermoeidheid
 * (oranje) als lijnen, Vorm (ijsblauw) eronder met een gestippelde
 * overreaching-grens op −30.
 */

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import {
  DARK_CHART_STYLES,
  DarkChartTooltip,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import type { LoadPoint, LoadStatus, LoadStatusKey } from '@/lib/training-load'

const STATUS_COLORS: Record<LoadStatusKey, string> = {
  overreaching: P.danger,
  productief: P.lime,
  neutraal: P.inkMuted,
  fris: P.ice,
  ontraind: P.gold,
}

export type LoadCurveData = {
  points: LoadPoint[]
  acwr: number | null
  status: LoadStatus
  today: LoadPoint | null
  sessionCount: number
}

export function LoadCurveChart({ data, compact = false }: { data: LoadCurveData; compact?: boolean }) {
  const { points, acwr, status, today, sessionCount } = data
  const statusColor = STATUS_COLORS[status.key]

  if (sessionCount === 0) {
    return (
      <Tile>
        <MetaLabel>BELASTING</MetaLabel>
        <div className="py-6 text-center">
          <p style={{ color: P.inkMuted, fontSize: 13 }}>
            Nog geen gelogde trainingen — de belasting-curve verschijnt zodra er sessies of cardio gelogd zijn.
          </p>
        </div>
      </Tile>
    )
  }

  // NL korte datum op de x-as; alleen begin/eind + maandwissels leesbaar houden.
  const chartData = points.map(p => ({
    ...p,
    dag: p.date.slice(8, 10) + '/' + p.date.slice(5, 7),
    Belasting: p.load,
    Fitheid: p.fitness,
    Vermoeidheid: p.fatigue,
    Vorm: p.form,
  }))

  return (
    <Tile>
      <div className="space-y-3">
        {/* Header: status + kerngetallen */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <MetaLabel>BELASTING · KRACHT + CARDIO</MetaLabel>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="athletic-mono px-2 py-0.5 rounded-md"
                style={{
                  background: `${statusColor}1A`,
                  border: `1px solid ${statusColor}55`,
                  color: statusColor,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {status.label}
              </span>
              {acwr !== null && (
                <span
                  className="athletic-mono"
                  title="Acute:Chronic Workload Ratio (EWMA 7d/28d) — indicatief, geen harde voorspeller"
                  style={{
                    color: acwr > 1.5 ? P.danger : acwr > 1.3 ? P.gold : acwr < 0.8 ? P.ice : P.inkMuted,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                  }}
                >
                  ACWR {acwr.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <HeaderStat label="FITHEID" value={today?.fitness ?? 0} color={P.lime} />
            <HeaderStat label="VERMOEIDHEID" value={today?.fatigue ?? 0} color={P.goldWarm} />
            <HeaderStat label="VORM" value={today?.form ?? 0} color={P.ice} signed />
          </div>
        </div>

        <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>{status.description}</p>

        <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...DARK_CHART_STYLES.grid} />
            <XAxis dataKey="dag" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...DARK_CHART_STYLES.axis} width={42} />
            <Tooltip content={<DarkChartTooltip />} />
            {/* Overreaching-grens (vorm < −30) + nullijn */}
            <ReferenceLine y={0} stroke={P.lineStrong} />
            <ReferenceLine
              y={-30}
              stroke={P.danger}
              strokeDasharray="4 4"
              label={{ value: 'overreaching', position: 'insideBottomLeft', fill: P.danger, fontSize: 10 }}
            />
            <Bar dataKey="Belasting" fill="rgba(232,122,85,0.28)" radius={[2, 2, 0, 0]} maxBarSize={8} />
            <Line type="monotone" dataKey="Fitheid" stroke={P.lime} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="Vermoeidheid" stroke={P.goldWarm} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Vorm" stroke={P.ice} strokeWidth={2} dot={false} strokeDasharray="6 3" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legenda + duiding */}
        <div className="flex items-center gap-4 flex-wrap" style={{ color: P.inkMuted, fontSize: 11 }}>
          <LegendDot color={P.lime} label="Fitheid (42d)" />
          <LegendDot color={P.goldWarm} label="Vermoeidheid (7d)" />
          <LegendDot color={P.ice} label="Vorm = fitheid − vermoeidheid" />
          <LegendDot color="rgba(232,122,85,0.6)" label="Dagbelasting (RPE × min)" />
        </div>
        {!compact && (
          <p style={{ color: P.inkDim, fontSize: 11, lineHeight: 1.5 }}>
            Trainen laat de fitheid-lijn langzaam stijgen; stoppen laat &apos;m wegzakken. Stijgt
            vermoeidheid veel sneller dan fitheid (vorm onder −30), dan zit je in de
            overreaching-zone. ACWR is een indicatie, geen harde voorspeller.
          </p>
        )}
      </div>
    </Tile>
  )
}

function HeaderStat({ label, value, color, signed = false }: {
  label: string; value: number; color: string; signed?: boolean
}) {
  return (
    <div className="text-right">
      <MetaLabel>{label}</MetaLabel>
      <div
        className="athletic-display"
        style={{ color, fontSize: 24, lineHeight: '28px', letterSpacing: '-0.02em' }}
      >
        {signed && value > 0 ? '+' : ''}{Math.round(value)}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
