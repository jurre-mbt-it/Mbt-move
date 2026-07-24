'use client'

/**
 * Vitals-tegel: HRV, rust-HR, ademfrequentie en huidtemperatuur als trend
 * t.o.v. de eigen 7-daagse baseline. Absolute HRV is NOOIT tussen personen of
 * devices vergelijkbaar (Apple = SDNN), dus we tonen afwijking-van-baseline,
 * niet een ruw getal om mee te benchmarken.
 */
import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Tile, Kicker, MetaLabel, P } from '@/components/dark-ui'

// Recharts lazy laden: de mini-sparklines zijn het enige chart-deel van deze
// tegel. De containers reserveren de hoogte al, dus geen aparte fallback.
const VitalsSparkline = dynamic(
  () => import('./VitalsSparkline').then(m => m.VitalsSparkline),
  { ssr: false, loading: () => null },
)

type VitalsDto = {
  date: string
  hrv: number | null
  hrvType: 'SDNN' | 'RMSSD' | null
  restingHeartRate: number | null
  respiratoryRate: number | null
  wristTempDeviation: number | null
}

export function VitalsCard({ vitals }: { vitals: VitalsDto[] }) {
  const rows = useMemo(() => [...vitals].sort((a, b) => a.date.localeCompare(b.date)), [vitals])
  const last = rows[rows.length - 1] ?? null
  const hrvType = rows.findLast?.(r => r.hrvType)?.hrvType ?? 'SDNN'

  if (!last) {
    return (
      <Tile>
        <Kicker>VITALEN</Kicker>
        <div className="py-6 text-center">
          <MetaLabel style={{ color: P.inkMuted }}>NOG GEEN METINGEN</MetaLabel>
        </div>
      </Tile>
    )
  }

  return (
    <Tile>
      <Kicker>VITALEN</Kicker>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Metric label="HRV" unit="ms" rows={rows} pick={r => r.hrv} digits={0} higherBetter tintHint />
        <Metric label="Rust-HR" unit="bpm" rows={rows} pick={r => r.restingHeartRate} digits={0} higherBetter={false} />
        <Metric label="Ademhaling" unit="/min" rows={rows} pick={r => r.respiratoryRate} digits={1} higherBetter={false} />
        <TempMetric rows={rows} />
      </div>
      <MetaLabel style={{ color: P.inkDim, fontSize: 9, marginTop: 10 }}>
        HRV GEMETEN ALS {hrvType} · ALLEEN T.O.V. JE EIGEN BASELINE TE LEZEN, NIET TUSSEN APPARATEN
      </MetaLabel>
    </Tile>
  )
}

function Metric({
  label, unit, rows, pick, digits, higherBetter, tintHint,
}: {
  label: string
  unit: string
  rows: VitalsDto[]
  pick: (r: VitalsDto) => number | null
  digits: number
  higherBetter: boolean
  tintHint?: boolean
}) {
  const series = rows.map(r => pick(r)).filter((x): x is number => x != null)
  const current = series[series.length - 1] ?? null
  const prior = series.slice(0, -1).slice(-7)
  const baseline = prior.length ? prior.reduce((a, x) => a + x, 0) / prior.length : null
  const delta = current != null && baseline != null ? current - baseline : null

  // Kleur: afwijking in de "goede" richting = lime, "slechte" richting = danger.
  let tint: string = P.inkMuted
  if (delta != null && Math.abs(delta) > (baseline ? baseline * 0.04 : 0.5)) {
    const good = higherBetter ? delta > 0 : delta < 0
    tint = good ? P.lime : P.danger
  }

  const chartData = series.map((v, i) => ({ i, v }))
  return (
    <div className="rounded-xl" style={{ backgroundColor: P.surfaceLow, padding: '10px 11px' }}>
      <MetaLabel style={{ color: P.inkMuted, fontSize: 9 }}>{label}</MetaLabel>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="athletic-display" style={{ color: tintHint ? P.ink : P.ink, fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>
          {current != null ? current.toFixed(digits) : '—'}
        </span>
        <span style={{ color: P.inkDim, fontSize: 10 }}>{unit}</span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="athletic-mono" style={{ color: tint, fontSize: 10, fontWeight: 700 }}>
          {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(digits)} vs basis`}
        </span>
      </div>
      <div style={{ height: 26, marginTop: 4 }}>
        <VitalsSparkline
          data={chartData}
          stroke={tint === P.inkMuted ? P.inkDim : tint}
          domain={['dataMin - 2', 'dataMax + 2']}
        />
      </div>
    </div>
  )
}

function TempMetric({ rows }: { rows: VitalsDto[] }) {
  const series = rows.map(r => r.wristTempDeviation).filter((x): x is number => x != null)
  const current = series[series.length - 1] ?? null
  const tint =
    current == null ? P.inkMuted : Math.abs(current) >= 0.5 ? P.danger : Math.abs(current) <= 0.3 ? P.lime : P.gold
  const chartData = series.map((v, i) => ({ i, v }))
  return (
    <div className="rounded-xl" style={{ backgroundColor: P.surfaceLow, padding: '10px 11px' }}>
      <MetaLabel style={{ color: P.inkMuted, fontSize: 9 }}>Huidtemp.</MetaLabel>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="athletic-display" style={{ color: P.ink, fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>
          {current != null ? `${current > 0 ? '+' : ''}${current.toFixed(1)}` : '—'}
        </span>
        <span style={{ color: P.inkDim, fontSize: 10 }}>°C</span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="athletic-mono" style={{ color: tint, fontSize: 10, fontWeight: 700 }}>
          {current == null ? '—' : Math.abs(current) <= 0.3 ? 'normaal' : 'afwijking'}
        </span>
      </div>
      <div style={{ height: 26, marginTop: 4 }}>
        <VitalsSparkline
          data={chartData}
          stroke={tint === P.inkMuted ? P.inkDim : tint}
          domain={['dataMin - 0.3', 'dataMax + 0.3']}
        />
      </div>
    </div>
  )
}
