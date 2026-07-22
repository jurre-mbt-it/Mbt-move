'use client'

/**
 * Belasting-curve: fitness-fatigue (supercompensatie) grafiek over kracht +
 * cardio, gedeeld door therapeut (patiëntdossier · Voortgang), atleet en
 * patiënt. Zie src/lib/training-load.ts voor het model.
 *
 * Visueel (Combo A): de Vorm-lijn (TSB = fitheid − vermoeidheid) is de held,
 * geplot over gekleurde waardezones. Oriëntatie: vorm omhoog — fris (blauw)
 * boven, optimale adaptatie (groen) en overreaching (rood) onder. De
 * kerngetallen fitheid/vermoeidheid/vorm staan als kaartjes boven de grafiek.
 */

import { useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ReferenceDot, ResponsiveContainer,
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

/**
 * Waardezones op de Vorm-as (TSB), exact gelijk aan loadStatus() in
 * training-load.ts. Van boven (fris/ontraind) naar onder (overreaching).
 */
const ZONES: { key: LoadStatusKey; from: number; to: number; color: string; label: string }[] = [
  { key: 'ontraind', from: 25, to: Infinity, color: P.gold, label: 'Fitheid zakt weg' },
  { key: 'fris', from: 5, to: 25, color: P.ice, label: 'Fris' },
  { key: 'neutraal', from: -10, to: 5, color: P.inkMuted, label: 'Onderhoud' },
  { key: 'productief', from: -30, to: -10, color: P.lime, label: 'Optimaal' },
  { key: 'overreaching', from: -Infinity, to: -30, color: P.danger, label: 'Overreaching' },
]

type ModalityCurve = {
  points: LoadPoint[]
  acwr: number | null
  status: LoadStatus
  today: LoadPoint | null
  sessionCount: number
}

export type LoadCurveData = ModalityCurve & {
  // Onderverdeling per modaliteit — optioneel zodat oudere call-sites blijven
  // werken. Aanwezig sinds computeLoadCurve de kracht/cardio-splitsing geeft.
  strength?: ModalityCurve
  cardio?: (ModalityCurve & { trimp: number | null; hrSessionCount: number })
  firstSessionAt?: string | null
  /** IJkperiode (server): 'building' = gelogde belasting tonen zonder zone-oordeel. */
  calibration?: {
    status: 'building' | 'ready'
    daysLogged: number
    daysNeeded: number
    sessionsLogged: number
    sessionsNeeded: number
  }
}

type Modality = 'all' | 'strength' | 'cardio'

export function LoadCurveChart({ data, compact = false }: { data: LoadCurveData; compact?: boolean }) {
  const [modality, setModality] = useState<Modality>('all')

  // Splitsing alleen aanbieden als de onderverdeling meegestuurd is.
  const hasSplit = Boolean(data.strength && data.cardio)
  const view: ModalityCurve =
    modality === 'strength' && data.strength ? data.strength
    : modality === 'cardio' && data.cardio ? data.cardio
    : data
  const cardioTrimp = modality === 'cardio' ? data.cardio?.trimp ?? null : null

  const { points, acwr, status, today, sessionCount } = view
  const statusColor = STATUS_COLORS[status.key]

  // Hele tegel leeg pas als er over ALLE modaliteiten niets gelogd is.
  if (data.sessionCount === 0) {
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
  const allData = points.map(p => ({
    ...p,
    dag: p.date.slice(8, 10) + '/' + p.date.slice(5, 7),
    Vorm: p.form,
    Belasting: p.load, // dag-totaal sRPE — de staafjes tijdens de ijkperiode
  }))

  // Lege aanloop (geen activiteit) wegsnijden zodat we op de actieve periode
  // inzoomen i.p.v. maanden vlakke nullijn te tonen.
  const firstActive = allData.findIndex(p => p.load > 0 || p.fitness > 0.5 || p.fatigue > 0.5)
  const chartData = firstActive > 0 ? allData.slice(Math.max(0, firstActive - 2)) : allData

  // Vorm-as-domein: altijd genoeg context om de overreaching- (−30) en
  // fris-zones (+25) te tonen, maar meegroeien met uitschieters.
  const forms = chartData.map(p => p.Vorm)
  const dataMin = Math.min(...forms)
  const dataMax = Math.max(...forms)
  const lo = Math.min(-40, Math.floor((dataMin - 5) / 10) * 10)
  const hi = Math.max(35, Math.ceil((dataMax + 5) / 10) * 10)
  const clamp = (v: number) => (v === Infinity ? hi : v === -Infinity ? lo : v)

  const lastDag = chartData[chartData.length - 1]?.dag

  // ── IJkperiode: gelogde belasting tonen, zone-oordeel nog niet ──────────
  // Zonder bekend startniveau leest de eerste week als "van 0 naar 100" en
  // duikt de vorm vals het rood in. We laten daarom wél zien wat er gelogd is
  // (dagstaafjes), maar geen zones, status of vorm-lijn tot de ijk klaar is.
  if (data.calibration && data.calibration.status !== 'ready') {
    const cal = data.calibration
    const dag = Math.min(cal.daysLogged + 1, cal.daysNeeded)
    return (
      <Tile>
        <div className="space-y-3">
          <div>
            <MetaLabel>BELASTING · KRACHT + CARDIO</MetaLabel>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="athletic-mono px-2 py-0.5 rounded-md"
                style={{
                  background: `color-mix(in srgb, ${P.inkMuted} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${P.inkMuted} 33%, transparent)`,
                  color: P.inkMuted,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                IJkperiode · dag {dag}/{cal.daysNeeded}
              </span>
            </div>
          </div>
          <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
            We hebben eerst {cal.daysNeeded} dagen en {cal.sessionsNeeded} trainingen nodig om je
            startniveau te bepalen. Je zit op dag {dag} en hebt{' '}
            {Math.min(cal.sessionsLogged, cal.sessionsNeeded)} van de {cal.sessionsNeeded} trainingen
            gelogd. Tot die tijd zie je hieronder alleen je gelogde belasting, nog zonder zone-oordeel.
          </p>
          <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...DARK_CHART_STYLES.grid} />
              <XAxis dataKey="dag" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" minTickGap={28} />
              <YAxis {...DARK_CHART_STYLES.axis} width={42} />
              <Tooltip content={<DarkChartTooltip />} />
              <Bar dataKey="Belasting" fill={P.inkMuted} radius={[3, 3, 0, 0]} maxBarSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
          <p style={{ color: P.inkDim, fontSize: 11, lineHeight: 1.5 }}>
            Elke staaf is de trainingsbelasting van één dag (duur × zwaarte). Na de ijkperiode
            verschijnen hier je vorm-lijn en de belasting-zones.
          </p>
        </div>
      </Tile>
    )
  }

  return (
    <Tile>
      <div className="space-y-3">
        {/* Modaliteit-toggle — alleen als de onderverdeling beschikbaar is */}
        {hasSplit && (
          <div className="inline-flex rounded-lg p-0.5" style={{ background: P.surfaceLow }}>
            {([
              ['all', 'Alles'],
              ['strength', 'Kracht'],
              ['cardio', 'Cardio'],
            ] as const).map(([key, label]) => {
              const active = modality === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModality(key)}
                  className="athletic-mono athletic-tap rounded-md transition-colors"
                  style={{
                    color: active ? P.bg : P.inkMuted,
                    background: active ? P.ink : 'transparent',
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                    padding: '4px 10px',
                    textTransform: 'uppercase',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* Header: status + kerngetallen */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <MetaLabel>
              BELASTING · {modality === 'strength' ? 'KRACHT' : modality === 'cardio' ? 'CARDIO' : 'KRACHT + CARDIO'}
            </MetaLabel>
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
                  title="Acute:Chronic Workload Ratio (EWMA 7d/28d) — stil trend-cijfer, stuurt de status niet (ratio-maat methodologisch omstreden, Impellizzeri 2020)"
                  style={{
                    // Bewust neutraal: de ACWR is een indicatie, geen oordeel —
                    // kleuren zou 'm weer als verdict laten lezen.
                    color: P.inkMuted,
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
            <HeaderStat label="VORM" value={today?.form ?? 0} color={P.ink} signed />
          </div>
        </div>

        {sessionCount === 0 ? (
          <div className="py-6 text-center">
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              Nog geen {modality === 'cardio' ? 'cardio' : 'krachttraining'} gelogd in deze periode.
            </p>
          </div>
        ) : (
        <>
        <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>{status.description}</p>

        {cardioTrimp !== null && (
          <p
            className="athletic-mono"
            title="Edwards' TRIMP — HR-zone-gewogen cardio-belasting; alleen uit sessies met gemeten hartslag"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em' }}
          >
            HR-BELASTING (TRIMP) <span style={{ color: P.ink, fontWeight: 800 }}>{cardioTrimp}</span>
            {' · '}{data.cardio?.hrSessionCount ?? 0} sessie(s) met hartslag
          </p>
        )}

        <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid {...DARK_CHART_STYLES.grid} />
            {/* Gekleurde waardezones — fris boven, overreaching onder */}
            {ZONES.map(z => (
              <ReferenceArea
                key={z.key}
                y1={clamp(z.from)}
                y2={clamp(z.to)}
                fill={z.color}
                fillOpacity={z.key === 'productief' || z.key === 'overreaching' ? 0.16 : 0.1}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            <XAxis dataKey="dag" {...DARK_CHART_STYLES.axis} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...DARK_CHART_STYLES.axis} width={42} domain={[lo, hi]} allowDataOverflow />
            <Tooltip content={<DarkChartTooltip />} />
            {/* Nullijn + harde overreaching-grens (vorm = −30) */}
            <ReferenceLine y={0} stroke={P.lineStrong} />
            <ReferenceLine y={-30} stroke={P.danger} strokeDasharray="4 4" strokeOpacity={0.6} />
            <Line type="monotone" dataKey="Vorm" stroke={P.ink} strokeWidth={2.5} dot={false} />
            {today && lastDag && (
              <ReferenceDot x={lastDag} y={today.form} r={4} fill={P.ink} stroke={P.bg} strokeWidth={2} />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legenda: vorm-lijn + zones */}
        <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap" style={{ color: P.inkMuted, fontSize: 11 }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 14, height: 2.5, background: P.ink }} />
            Vorm (fitheid − vermoeidheid)
          </span>
          <ZoneSwatch color={P.lime} label="Optimaal" />
          <ZoneSwatch color={P.inkMuted} label="Onderhoud" />
          <ZoneSwatch color={P.ice} label="Fris" />
          <ZoneSwatch color={P.danger} label="Overreaching" />
          {!compact && <ZoneSwatch color={P.gold} label="Fitheid zakt weg" />}
        </div>
        {!compact && (
          <p style={{ color: P.inkDim, fontSize: 11, lineHeight: 1.5 }}>
            De lijn is je vorm. Zakt &apos;ie de groene zone in, dan is de prikkel optimaal voor
            adaptatie — vermoeidheid is dan hoger dan fitheid. Onder de rode grens (−30) zit je in
            overreaching; bovenin betekent fris of juist wegzakkende fitheid. ACWR is een indicatie,
            geen harde voorspeller.
          </p>
        )}
        </>
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

function ZoneSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={{ width: 10, height: 10, background: color, opacity: 0.5 }}
      />
      {label}
    </span>
  )
}
