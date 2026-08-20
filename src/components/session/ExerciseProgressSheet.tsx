'use client'

import { trpc } from '@/lib/trpc/client'
import { X, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { P, CARD, Kicker, MetaLabel } from '@/components/dark-ui'

const mono =
  'var(--font-mono-athletic)'

/**
 * Voortgang van één oefening als bottom-sheet: zwaarste set (kg) en geschatte
 * 1RM per gelogde sessie. Data ligt er al (weightsPerSet/estimatedOneRepMax);
 * dit is alleen een venster erop.
 */
export function ExerciseProgressSheet({
  exerciseId,
  exerciseName,
  onClose,
}: {
  exerciseId: string
  exerciseName: string
  onClose: () => void
}) {
  const { data, isLoading } = trpc.patient.exerciseProgress.useQuery({ exerciseId })

  const points = (data ?? [])
    .filter(d => d.bestKg != null)
    .map(d => ({
      label: new Date(d.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      kg: d.bestKg,
      rm: d.est1Rm,
    }))
  const has1Rm = points.some(p => p.rm != null)
  const latest = points[points.length - 1]
  const first = points[0]
  const delta = latest?.kg != null && first?.kg != null ? Math.round((latest.kg - first.kg) * 10) / 10 : null

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="mbt-backdrop absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="mbt-sheet relative w-full rounded-t-3xl px-5 pt-4 pb-[max(env(safe-area-inset-bottom),24px)]"
        style={{...CARD, maxWidth: 480, margin: '0 auto'}}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: P.lineStrong }} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Kicker>VOORTGANG</Kicker>
            <p className="truncate" style={{ color: P.ink, fontSize: 17, fontWeight: 800, marginTop: 2 }}>
              {exerciseName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="athletic-tap shrink-0" style={{ color: P.inkMuted, padding: 4 }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center"><MetaLabel>LADEN…</MetaLabel></div>
        ) : points.length < 2 ? (
          <div className="py-10 text-center space-y-2">
            <TrendingUp className="w-7 h-7 mx-auto" style={{ color: P.inkDim }} />
            <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
              Nog te weinig gelogde sessies met gewicht voor een grafiek.
              <br />Log deze oefening een paar keer en je voortgang verschijnt hier.
            </p>
          </div>
        ) : (
          <>
            {/* Samenvatting: laatste gewicht + verschil t.o.v. eerste punt */}
            <div className="flex items-baseline gap-3 mt-3">
              <span className="athletic-mono" style={{ color: P.ink, fontSize: 26, fontWeight: 900 }}>
                {String(latest!.kg).replace('.', ',')}
                <span style={{ color: P.inkMuted, fontSize: 12, fontWeight: 500, marginLeft: 3 }}>kg</span>
              </span>
              {delta != null && delta !== 0 && (
                <span
                  className="athletic-mono"
                  style={{ color: delta > 0 ? P.lime : P.gold, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em' }}
                >
                  {delta > 0 ? '+' : ''}{String(delta).replace('.', ',')} kg sinds {first!.label}
                </span>
              )}
            </div>

            <div style={{ width: '100%', height: 190, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="rgba(212,232,230,0.05)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--p-ink-muted)', fontSize: 9, fontFamily: mono }}
                    axisLine={{ stroke: 'rgba(212,232,230,0.12)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--p-ink-muted)', fontSize: 9, fontFamily: mono }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.lineStrong}`,
                      borderRadius: 10,
                      fontSize: 12,
                      color: P.ink,
                    }}
                    labelStyle={{ color: P.inkMuted, fontFamily: mono, fontSize: 10 }}
                    formatter={(value, name) => [
                      `${String(value ?? '—').replace('.', ',')} kg`,
                      name === 'kg' ? 'Zwaarste set' : 'Geschatte 1RM',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="kg"
                    stroke={P.brand}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: P.brand, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                  {has1Rm && (
                    <Line
                      type="monotone"
                      dataKey="rm"
                      stroke={P.ice}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 mt-2">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-3 h-0.5 rounded-full" style={{ background: P.brand }} />
                <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em' }}>ZWAARSTE SET</span>
              </span>
              {has1Rm && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="w-3 h-0.5 rounded-full" style={{ background: P.ice }} />
                  <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em' }}>GESCHATTE 1RM</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
