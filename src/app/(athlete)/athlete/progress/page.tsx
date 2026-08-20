'use client'

/**
 * Atleet-voortgang: belasting-curve (fitness-fatigue over kracht + cardio)
 * + 1RM-progressie per oefening. Mobiel-first, zelfde model als de
 * therapeut-voortgangspagina.
 */

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { LoadCurveChart } from '@/components/workload/LoadCurveChart'
import {
  DARK_CHART_STYLES,
  DarkChartTooltip,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

type OneRmSeries = {
  exerciseId: string
  name: string
  data: Array<{ session: number; date: string; value: number }>
}

export default function AthleteProgressPage() {
  const { data: loadCurve } = trpc.patient.loadCurve.useQuery({ days: 90 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oneRmRaw = [] } = (trpc.patient.getOneRmProgression.useQuery as any)() as {
    data: OneRmSeries[] | undefined
  }
  const oneRm = oneRmRaw ?? []
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const activeSeries = oneRm.find(s => s.name === selectedExercise) ?? oneRm[0] ?? null

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 flex flex-col gap-4 mbt-stagger">
        {/* Hero */}
        <div className="flex flex-col gap-1">
          <Kicker>Belasting & kracht</Kicker>
          <Display size="md">VOORTGANG</Display>
        </div>

        {/* Belasting-curve */}
        {loadCurve ? (
          <LoadCurveChart data={loadCurve} compact />
        ) : (
          <Tile>
            <div className="py-8 text-center">
              <MetaLabel>BELASTING LADEN…</MetaLabel>
            </div>
          </Tile>
        )}

        {/* 1RM progressie */}
        <Tile>
          <div className="space-y-3">
            <MetaLabel>1RM PROGRESSIE</MetaLabel>
            {oneRm.length === 0 ? (
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                Nog geen gewichtsdata, log je gewichten tijdens een sessie en je geschatte
                1RM verschijnt hier.
              </p>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {oneRm.map(s => {
                    const active = s.name === (activeSeries?.name ?? '')
                    return (
                      <button
                        key={s.exerciseId}
                        type="button"
                        onClick={() => setSelectedExercise(s.name)}
                        className="athletic-tap athletic-mono text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                        style={{
                          background: active ? P.ink : P.control,
                          color: active ? P.bg : P.inkMuted,
                          border: `1px solid ${active ? P.ink : P.lineStrong}`,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {s.name}
                      </button>
                    )
                  })}
                </div>
                {activeSeries && activeSeries.data.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart
                        data={activeSeries.data.map(d => ({
                          dag: d.date.slice(8, 10) + '/' + d.date.slice(5, 7),
                          '1RM (kg)': d.value,
                        }))}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid {...DARK_CHART_STYLES.grid} />
                        <XAxis dataKey="dag" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" />
                        <YAxis {...DARK_CHART_STYLES.axis} domain={['auto', 'auto']} />
                        <Tooltip content={<DarkChartTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="1RM (kg)"
                          stroke={P.lime}
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: P.lime }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <div
                      className="grid grid-cols-3 gap-3 text-center pt-3"
                      style={{ borderTop: `1px solid ${P.line}` }}
                    >
                      <OneRmStat label="START" value={activeSeries.data[0]?.value} />
                      <OneRmStat
                        label="NU"
                        value={activeSeries.data[activeSeries.data.length - 1]?.value}
                        color={P.lime}
                      />
                      <OneRmStat
                        label="GROEI"
                        value={pctGrowth(activeSeries.data)}
                        suffix="%"
                        color={P.brand}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </Tile>
      </div>
    </div>
  )
}

function pctGrowth(data: Array<{ value: number }>): number | undefined {
  const first = data[0]?.value
  const last = data[data.length - 1]?.value
  if (!first || !last) return undefined
  return Math.round(((last - first) / first) * 100)
}

function OneRmStat({ label, value, suffix = '', color }: {
  label: string; value: number | undefined; suffix?: string; color?: string
}) {
  return (
    <div>
      <MetaLabel>{label}</MetaLabel>
      <p
        className="athletic-display"
        style={{ color: color ?? P.ink, fontSize: 22, lineHeight: '26px', marginTop: 2 }}
      >
        {value !== undefined ? `${value}${suffix}` : '—'}
      </p>
    </div>
  )
}
