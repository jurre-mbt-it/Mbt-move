'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { DARK_CHART_STYLES, DarkMenuSelect, Display, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import {
  asymmetryPct,
  besteSprong,
  formatAsymmetry,
  isEenbenig,
  metingLabel,
  metingOpties,
  trendSeries,
  type JumpMeting,
  type KrachtMeting,
  type Maat,
  type MetingKeuze,
} from '@/lib/kinvent/measurements'
import { kinventSource } from '@/lib/kinvent/labels'

const fmtDatum = (d: Date | string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtKort = (t: number) => new Date(t).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
const n0 = (v: number | null | undefined) => (v == null ? '–' : Math.round(v).toString())
const n1 = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(1))
const n2 = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(2))

const KLEUR: Record<string, string> = { L: P.brand, R: P.lime, S: P.brand, H: P.brand, V: P.gold, RSI: P.brand }

const MAAT_LABEL: Record<Maat, string> = { hoogte: 'Jump height', piek: 'Peak force L / R', verschil: 'Asymmetry L / R', rsi: 'RSI' }

/**
 * Kinvent-metingen van één patiënt: grafiek over de tijd bovenaan, daaronder
 * de lijst met hoofdpunten, uit te klappen tot elke sprong of herhaling.
 * Links-rechts als verschil in procent met richting; dat was Jurres keuze.
 */
export function KinventMeasurements({ patientId }: { patientId: string }) {
  const portal = usePortal()
  const { data, isLoading } = trpc.kinvent.measurementsForPatient.useQuery({ patientId })
  const { data: patient } = trpc.patients.get.useQuery({ id: patientId })
  const jumps: JumpMeting[] = useMemo(() => data?.jumps ?? [], [data])
  const strength: KrachtMeting[] = useMemo(() => data?.strength ?? [], [data])

  const opties = useMemo(() => metingOpties(jumps, strength), [jumps, strength])
  const [metingKey, setMetingKey] = useState<string | null>(null)
  const [maatKeuze, setMaatKeuze] = useState<Maat | null>(null)

  const gekozenKey = metingKey ?? opties[0]?.key ?? 'alles'
  const gekozen = opties.find((o) => o.key === gekozenKey) ?? null
  const maatOpties: Array<{ value: Maat; label: string }> =
    gekozen?.keuze.soort === 'kracht'
      ? [{ value: 'piek', label: MAAT_LABEL.piek }, { value: 'verschil', label: MAAT_LABEL.verschil }]
      : (['hoogte', 'piek', 'verschil', 'rsi'] as Maat[]).map((m) => ({ value: m, label: MAAT_LABEL[m] }))
  const maat: Maat = maatOpties.some((m) => m.value === maatKeuze) ? (maatKeuze as Maat) : maatOpties[0].value

  const trend = useMemo(() => (gekozen ? trendSeries(gekozen.keuze, maat, jumps, strength) : null), [gekozen, maat, jumps, strength])
  const rows = useMemo(() => {
    if (!trend) return []
    const perT = new Map<number, Record<string, number>>()
    for (const serie of trend.series) {
      for (const p of serie.points) {
        const rij = perT.get(p.t) ?? { t: p.t }
        rij[serie.key] = p.v
        perT.set(p.t, rij)
      }
    }
    return [...perT.values()].sort((a, b) => a.t - b.t)
  }, [trend])

  // Lijst: alles van de gekozen meting, nieuwste eerst; zonder keuze alles.
  const lijst = useMemo(() => {
    const items: Array<{ id: string; t: number; soort: 'sprong' | 'kracht'; jump?: JumpMeting; kracht?: KrachtMeting }> = []
    for (const m of jumps) {
      if (gekozen && (gekozen.keuze.soort !== 'sprong' || m.jumpType !== gekozen.keuze.jumpType || isEenbenig(m) !== gekozen.keuze.eenbenig)) continue
      items.push({ id: m.id, t: new Date(m.performedAt).getTime(), soort: 'sprong', jump: m })
    }
    for (const k of strength) {
      if (gekozen && (gekozen.keuze.soort !== 'kracht' || (k.title ?? '') !== gekozen.keuze.title)) continue
      items.push({ id: k.id, t: new Date(k.performedAt).getTime(), soort: 'kracht', kracht: k })
    }
    return items.sort((a, b) => b.t - a.t)
  }, [jumps, strength, gekozen])

  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-24 space-y-5">
        <div>
          <Link href={`${portal.patients}/${patientId}?tab=tests`} className="athletic-label" style={{ color: P.inkMuted, fontSize: 11 }}>
            ← Terug naar {patient?.name ?? 'patiënt'}
          </Link>
          <Kicker>Kinvent · {patient?.name ?? ''}</Kicker>
          <Display size="md">METINGEN</Display>
          <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>
            {jumps.length} sprongmeting{jumps.length === 1 ? '' : 'en'} · {strength.length} krachttest{strength.length === 1 ? '' : 's'}
          </p>
        </div>

        {isLoading ? (
          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>LADEN…</p>
        ) : opties.length === 0 ? (
          <Tile>
            <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen metingen geïmporteerd. Haal ze op vanuit een testrapport.</p>
          </Tile>
        ) : (
          <>
            <Tile>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[220px] flex-1">
                  <MetaLabel>Meting</MetaLabel>
                  <DarkMenuSelect value={gekozenKey} onValueChange={setMetingKey} options={[...opties.map((o) => ({ value: o.key, label: o.label })), { value: 'alles', label: 'Alle metingen (alleen lijst)' }]} ariaLabel="Meting" />
                </div>
                {gekozen && (
                  <div className="min-w-[220px] flex-1">
                    <MetaLabel>Maat</MetaLabel>
                    <DarkMenuSelect value={maat} onValueChange={(v) => setMaatKeuze(v as Maat)} options={maatOpties} ariaLabel="Maat" />
                  </div>
                )}
              </div>

              {trend && (
                <div className="mt-4" style={{ height: 260 }}>
                  {rows.length === 0 ? (
                    <p style={{ color: P.inkMuted, fontSize: 12 }}>Geen waarden voor deze maat.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid {...DARK_CHART_STYLES.grid} />
                        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtKort} {...DARK_CHART_STYLES.axis} />
                        <YAxis unit={trend.unit ? ` ${trend.unit}` : ''} width={64} {...DARK_CHART_STYLES.axis} />
                        <Tooltip
                          {...DARK_CHART_STYLES.tooltip}
                          labelFormatter={(t) => fmtDatum(new Date(Number(t)))}
                          formatter={(v, name) => [`${typeof v === 'number' ? (trend.unit === '%' ? v.toFixed(1) : n1(v)) : v}${trend.unit ? ` ${trend.unit}` : ''}`, String(name)]}
                        />
                        {trend.series.map((serie) => (
                          <Line
                            key={serie.key}
                            type="monotone"
                            dataKey={serie.key}
                            name={serie.label}
                            stroke={KLEUR[serie.key] ?? P.brand}
                            strokeWidth={2}
                            dot={{ r: 3, strokeWidth: 0, fill: KLEUR[serie.key] ?? P.brand }}
                            connectNulls
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
              {trend && trend.series.length > 1 && (
                <div className="flex gap-4 mt-2">
                  {trend.series.map((serie) => (
                    <span key={serie.key} className="athletic-mono" style={{ color: KLEUR[serie.key] ?? P.brand, fontSize: 10, letterSpacing: '0.1em' }}>
                      ● {serie.label.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </Tile>

            <Tile>
              <MetaLabel>{gekozen ? metingLabel(gekozen.keuze) : 'Alle metingen'} · {lijst.length}</MetaLabel>
              <div className="mt-2 space-y-1">
                {lijst.map((item) =>
                  item.jump ? (
                    <SprongRij key={item.id} m={item.jump} open={open.has(item.id)} onToggle={() => toggle(item.id)} toonNaam={!gekozen} />
                  ) : item.kracht ? (
                    <KrachtRij key={item.id} k={item.kracht} open={open.has(item.id)} onToggle={() => toggle(item.id)} toonNaam={!gekozen} />
                  ) : null,
                )}
              </div>
            </Tile>
          </>
        )}
      </div>
    </div>
  )
}

function Rij({ open, onToggle, kop, hoofd, detail }: { open: boolean; onToggle: () => void; kop: React.ReactNode; hoofd: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="rounded-lg" style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left" aria-expanded={open}>
        <div className="min-w-0">{kop}</div>
        <div className="flex items-center gap-3 shrink-0" style={{ fontSize: 12 }}>
          {hoofd}
          <span aria-hidden style={{ color: P.inkDim }}>{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 overflow-x-auto" style={{ borderTop: `1px solid ${P.line}` }}>
          {detail}
        </div>
      )}
    </div>
  )
}

const th = 'text-right py-1 pr-3 font-normal whitespace-nowrap'
const td = 'py-1 pr-3 text-right athletic-mono whitespace-nowrap'

function SprongRij({ m, open, onToggle, toonNaam }: { m: JumpMeting; open: boolean; onToggle: () => void; toonNaam: boolean }) {
  const eenbenig = isEenbenig(m)
  const beste = besteSprong(m.reps)
  const besteL = eenbenig ? besteSprong(m.reps.filter((r) => r.side === 'LEFT')) : null
  const besteR = eenbenig ? besteSprong(m.reps.filter((r) => r.side === 'RIGHT')) : null
  const beideBenen = !!besteL && !!besteR
  const zijde = !eenbenig || beideBenen ? null : besteL ? 'links' : 'rechts'
  const keuze: MetingKeuze = { soort: 'sprong', jumpType: m.jumpType ?? '?', eenbenig }
  // Verschil: tweebenig uit de twee platen van de beste sprong; eenbenig met
  // beide benen in één meting uit de beste sprong per been.
  const verschil = eenbenig
    ? beideBenen ? asymmetryPct(besteL?.peakForceN ?? null, besteR?.peakForceN ?? null) : null
    : asymmetryPct(beste?.peakForceLeftN ?? null, beste?.peakForceRightN ?? null)
  return (
    <Rij
      open={open}
      onToggle={onToggle}
      kop={
        <>
          <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
            {fmtDatum(m.performedAt)}
            {toonNaam ? ` · ${metingLabel(keuze)}` : ''}
            {zijde ? ` · ${zijde}` : ''}
          </p>
          <p style={{ color: P.inkMuted, fontSize: 11 }}>
            {m.reps.length} sprong{m.reps.length === 1 ? '' : 'en'}
            {beideBenen ? ' · links en rechts' : ''}
            {m.bodyWeightKg != null ? ` · ${n1(m.bodyWeightKg)} kg` : ''}
          </p>
        </>
      }
      hoofd={
        <>
          <span className="athletic-mono" style={{ color: P.ink }}>
            {beideBenen ? `${n1(besteL?.jumpHeightCm)} / ${n1(besteR?.jumpHeightCm)} cm` : `${n1(m.peakJumpHeightCm ?? beste?.jumpHeightCm)} cm`}
          </span>
          <span className="athletic-mono" style={{ color: P.inkMuted }}>
            {beideBenen
              ? `${n0(besteL?.peakForceN)} / ${n0(besteR?.peakForceN)} N`
              : eenbenig
                ? `${n0(beste?.peakForceN)} N`
                : `${n0(beste?.peakForceLeftN)} / ${n0(beste?.peakForceRightN)} N`}
          </span>
          {verschil !== null && <span style={{ color: Math.abs(verschil) >= 10 ? P.gold : P.inkMuted }}>{formatAsymmetry(verschil)}</span>}
          <span className="athletic-mono" style={{ color: P.inkMuted }}>
            RSI {beideBenen ? `${n2(besteL?.rsi)} / ${n2(besteR?.rsi)}` : n2(m.rsi ?? beste?.rsi)}
          </span>
        </>
      }
      detail={
        <table className="w-full mt-2" style={{ fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr className="athletic-mono" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.1em' }}>
              <th className="text-left py-1 pr-3 font-normal">#</th>
              <th className={th}>JUMP HEIGHT</th>
              <th className={th}>FLIGHT TIME</th>
              <th className={th}>CONTACT TIME</th>
              <th className={th}>PEAK L</th>
              <th className={th}>PEAK R</th>
              <th className={th}>PEAK FORCE</th>
              <th className={th}>NET FORCE</th>
              <th className={th}>PEAK POWER</th>
              <th className={th}>RFD</th>
              <th className={th}>RFD L</th>
              <th className={th}>RFD R</th>
              <th className={th}>RSI</th>
              <th className={th}>TIME TO STAB.</th>
              <th className={th}>IMPULSE 1</th>
              <th className={th}>IMPULSE 2</th>
            </tr>
          </thead>
          <tbody>
            {m.reps.map((r) => (
              <tr key={r.ordinal} style={{ borderTop: `1px solid ${P.line}`, color: P.ink }}>
                <td className="py-1 pr-3" style={{ color: P.inkMuted }}>{r.ordinal}{r.side === 'LEFT' ? ' L' : r.side === 'RIGHT' ? ' R' : ''}</td>
                <td className={td}>{n1(r.jumpHeightCm)} cm</td>
                <td className={td}>{n0(r.flightTimeMs)} ms</td>
                <td className={td}>{r.contactTimeMs ? `${n0(r.contactTimeMs)} ms` : '–'}</td>
                <td className={td}>{n0(r.peakForceLeftN)}</td>
                <td className={td}>{n0(r.peakForceRightN)}</td>
                <td className={td}>{n0(r.peakForceN)} N</td>
                <td className={td}>{n0(r.netMaxForceN)} N</td>
                <td className={td}>{n0(r.maxPowerW)} W</td>
                <td className={td}>{n0(r.rfdTotal)}</td>
                <td className={td}>{n0(r.rfdLeft)}</td>
                <td className={td}>{n0(r.rfdRight)} N/s</td>
                <td className={td}>{n2(r.rsi)}</td>
                <td className={td}>{r.timeToStabilizeMs ? `${n0(r.timeToStabilizeMs)} ms` : '–'}</td>
                <td className={td}>{n1(r.propulsiveImpulsePhase1)}</td>
                <td className={td}>{n1(r.propulsiveImpulsePhase2)} N·s</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}

function KrachtRij({ k, open, onToggle, toonNaam }: { k: KrachtMeting; open: boolean; onToggle: () => void; toonNaam: boolean }) {
  const bilateraal = k.leftMaxKg != null && k.rightMaxKg != null
  const verschil = bilateraal ? asymmetryPct(k.leftMaxKg, k.rightMaxKg) : null
  return (
    <Rij
      open={open}
      onToggle={onToggle}
      kop={
        <>
          <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
            {fmtDatum(k.performedAt)}
            {toonNaam ? ` · ${metingLabel({ soort: 'kracht', title: k.title ?? '' })}` : ''}
          </p>
          <p style={{ color: P.inkMuted, fontSize: 11 }}>
            {k.reps.length} herhaling{k.reps.length === 1 ? '' : 'en'} · {kinventSource(k.deviceType, k.exerciseType)}
          </p>
        </>
      }
      hoofd={
        <>
          <span className="athletic-mono" style={{ color: P.ink }}>
            {bilateraal ? `${n1(k.leftMaxKg)} / ${n1(k.rightMaxKg)} kg` : `${n1(k.singleMaxKg ?? k.leftMaxKg ?? k.rightMaxKg)} kg`}
          </span>
          {bilateraal && <span style={{ color: verschil !== null && Math.abs(verschil) >= 10 ? P.gold : P.inkMuted }}>{formatAsymmetry(verschil)}</span>}
        </>
      }
      detail={
        <table className="w-full mt-2" style={{ fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr className="athletic-mono" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.1em' }}>
              <th className="text-left py-1 pr-3 font-normal">#</th>
              <th className="text-left py-1 pr-3 font-normal">ZIJDE</th>
              <th className={th}>PEAK FORCE</th>
              <th className={th}>MEAN FORCE</th>
              <th className={th}>RFD TO PEAK</th>
              <th className={th}>MEAN RFD</th>
              <th className={th}>TIME TO PEAK</th>
              <th className={th}>IMPULSE</th>
            </tr>
          </thead>
          <tbody>
            {k.reps.map((r) => (
              <tr key={r.ordinal} style={{ borderTop: `1px solid ${P.line}`, color: P.ink }}>
                <td className="py-1 pr-3" style={{ color: P.inkMuted }}>{r.ordinal}</td>
                <td className="py-1 pr-3">{r.side === 'LEFT' ? 'links' : r.side === 'RIGHT' ? 'rechts' : 'beide'}</td>
                <td className={td}>{n1(r.maxKg)} kg</td>
                <td className={td}>{n1(r.averageKg)} kg</td>
                <td className={td}>{n1(r.rfdToMax)} kg/s</td>
                <td className={td}>{n1(r.rfdAverage)} kg/s</td>
                <td className={td}>{n0(r.timeToMaxMs)} ms</td>
                <td className={td}>{n1(r.impulseNs)} N·s</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}
