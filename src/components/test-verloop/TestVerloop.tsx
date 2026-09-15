'use client'

/**
 * Verloop per test: links de tests met hun laatste uitslag, rechts van de
 * gekozen test de grafiek over de tijd met de doellijn van de fase en alle
 * metingen. Zelfde data en regels als de app (components/test-verloop.tsx
 * in mbt-gym-mobile). Ontwerp: docs/superpowers/specs/2026-09-15-test-verloop-design.md.
 *
 * `meekijken` = de behandelaar kijkt mee: conceptmetingen krijgen een label.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { DARK_CHART_STYLES, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import {
  doelLijn,
  formatGetal,
  hoofdUitslag,
  maatEenheid,
  metEenheid,
  zijdenTekst,
  type TestReeks,
  type TestVerloopData,
  type VerloopMaat,
} from '@/lib/test-report/verloop'
import type { TestZone } from '@/lib/test-report/compute'

const ZONE_KLEUR: Record<TestZone, string> = { GREEN: P.lime, ORANGE: P.gold, RED: P.danger }
const ZONE_TEKST: Record<TestZone, string> = { GREEN: 'Doel gehaald', ORANGE: 'In opbouw', RED: 'Nog onder doel' }
const CRIT_KLEUR = { MET: P.lime, IN_PROGRESS: P.gold, NOT_MET: P.inkMuted } as const
const CRIT_TEKST = { MET: 'Behaald', IN_PROGRESS: 'Bezig', NOT_MET: 'Nog niet' } as const
const MAAT_LABEL: Record<VerloopMaat, string> = { lsi: 'LSI', zijden: 'Links / rechts', waarde: 'Uitslag' }

const fmtDatum = (d: string | number) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtAs = (t: number) => new Date(t).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })

export function TestVerloop({
  data,
  isLoading,
  meekijken,
  initialKey,
  criteriumId,
  kinventHref,
}: {
  data: TestVerloopData | undefined
  isLoading: boolean
  meekijken: boolean
  initialKey?: string | null
  criteriumId?: string | null
  kinventHref?: string | null
}) {
  const reeksen = useMemo(() => data?.reeksen ?? [], [data])
  const [gekozenKey, setGekozenKey] = useState<string | null>(initialKey ?? null)
  const gekozen = reeksen.find((r) => r.key === gekozenKey) ?? reeksen[0] ?? null
  // Het criterium uit de link telt alleen voor de test waarvoor hij bedoeld was.
  const criteriumVoorGekozen = gekozen && gekozen.key === initialKey ? criteriumId ?? null : null

  if (isLoading) {
    return (
      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
        LADEN…
      </p>
    )
  }

  if (reeksen.length === 0) {
    return (
      <div className="space-y-3">
        <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
          {meekijken
            ? 'Nog geen ingevulde tests in een testrapport van deze patiënt.'
            : 'Nog geen uitslagen. Zodra je therapeut een testrapport definitief maakt, staan je tests hier.'}
        </p>
        {data?.heeftKinvent && kinventHref && <KinventLink href={kinventHref} />}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start">
      <div className="space-y-2">
        {reeksen.map((r) => {
          const actief = gekozen?.key === r.key
          const kleur = r.laatste.zone ? ZONE_KLEUR[r.laatste.zone] : P.ink
          const zijden = zijdenTekst(r, r.laatste)
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setGekozenKey(r.key)}
              aria-pressed={actief}
              className="w-full text-left flex items-stretch gap-3 px-3 py-2.5 transition-colors"
              style={{
                background: actief ? P.surfaceHi : P.surface,
                borderRadius: 10,
                border: `1px solid ${actief ? P.lineStrong : 'transparent'}`,
              }}
            >
              <span style={{ width: 3, borderRadius: 2, background: kleur, flexShrink: 0 }} />
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{r.naam}</span>
                <span className="block" style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                  {r.punten.length} meting{r.punten.length === 1 ? '' : 'en'} · {fmtDatum(r.laatste.datum)}
                  {meekijken && !r.laatste.definitief ? ' · concept' : ''}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="athletic-mono block" style={{ color: kleur, fontSize: 14 }}>{hoofdUitslag(r, r.laatste)}</span>
                {zijden && <span className="athletic-mono block" style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>{zijden}</span>}
              </span>
            </button>
          )
        })}
        {data?.heeftKinvent && kinventHref && <KinventLink href={kinventHref} />}
      </div>

      {gekozen && <Detail key={gekozen.key} reeks={gekozen} criteriumId={criteriumVoorGekozen} meekijken={meekijken} />}
    </div>
  )
}

function KinventLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5"
      style={{ background: P.surface, borderRadius: 10 }}
    >
      <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: P.ice }} />
      <span className="flex-1">
        <span className="block" style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>Kinvent-metingen</span>
        <span className="block" style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>Sprongen en krachttests per poging</span>
      </span>
      <span style={{ color: P.inkDim }}>›</span>
    </Link>
  )
}

function Detail({ reeks, criteriumId, meekijken }: { reeks: TestReeks; criteriumId: string | null; meekijken: boolean }) {
  const [maatKeuze, setMaatKeuze] = useState<VerloopMaat>(reeks.standaardMaat)
  const maat = reeks.maten.includes(maatKeuze) ? maatKeuze : reeks.standaardMaat
  const criterium = reeks.criteria.find((c) => c.id === (criteriumId ?? reeks.standaardCriteriumId)) ?? null
  const doel = doelLijn(reeks, maat, criterium)
  const eenheid = maatEenheid(reeks, maat)
  const laatsteKleur = reeks.laatste.zone ? ZONE_KLEUR[reeks.laatste.zone] : P.brand

  const rijen = useMemo(
    () =>
      reeks.perDag.map((p) => ({
        t: new Date(p.datum).getTime(),
        L: p.links,
        R: p.rechts,
        LSI: p.lsi ?? (reeks.metric === 'LSI' ? p.geplot : null),
        W: p.waarde ?? p.geplot,
      })),
    [reeks],
  )
  const lijnen: Array<{ key: 'L' | 'R' | 'LSI' | 'W'; naam: string; kleur: string }> =
    maat === 'zijden'
      ? [
          { key: 'L', naam: 'Links', kleur: P.brand },
          { key: 'R', naam: 'Rechts', kleur: P.ice },
        ]
      : maat === 'lsi'
        ? [{ key: 'LSI', naam: 'LSI', kleur: P.lime }]
        : [{ key: 'W', naam: reeks.naam, kleur: P.brand }]
  const genoeg = rijen.filter((r) => lijnen.some((l) => r[l.key] != null)).length >= 2

  const hero =
    maat === 'lsi'
      ? metEenheid(reeks.laatste.lsi, '%')
      : maat === 'waarde'
        ? hoofdUitslag(reeks, reeks.laatste)
        : `${reeks.laatste.links == null ? '–' : formatGetal(reeks.laatste.links)} / ${reeks.laatste.rechts == null ? '–' : formatGetal(reeks.laatste.rechts)}${eenheid ? ` ${eenheid}` : ''}`

  return (
    <Tile>
      <Kicker>{reeks.categorie}</Kicker>
      <h2 className="athletic-display" style={{ color: P.ink, fontSize: 26, lineHeight: '30px', marginTop: 2 }}>
        {reeks.naam.toUpperCase()}
      </h2>
      {reeks.subtitel && <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 2 }}>{reeks.subtitel}</p>}

      {criterium && (
        <div
          className="flex items-center gap-3 mt-4 py-2.5"
          style={{ borderTop: `1px solid ${P.line}`, borderBottom: `1px solid ${P.line}` }}
        >
          <div className="flex-1 min-w-0">
            <MetaLabel>Doel · {criterium.phaseName}</MetaLabel>
            <p style={{ color: P.ink, fontSize: 14, marginTop: 2 }}>{criterium.name}</p>
          </div>
          <span className="athletic-mono" style={{ color: CRIT_KLEUR[criterium.status], fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }}>
            {CRIT_TEKST[criterium.status].toUpperCase()}
          </span>
        </div>
      )}

      {reeks.maten.length > 1 && (
        <div className="flex gap-2 mt-4" role="tablist" aria-label="Maat">
          {reeks.maten.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === maat}
              onClick={() => setMaatKeuze(m)}
              className="athletic-mono px-3 py-1.5"
              style={{
                fontSize: 10,
                letterSpacing: '0.12em',
                borderRadius: 999,
                background: m === maat ? P.surfaceHi : P.surfaceLow,
                color: m === maat ? P.ink : P.inkMuted,
              }}
            >
              {MAAT_LABEL[m].toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-baseline gap-3 flex-wrap mt-4">
        <span className="athletic-display" style={{ color: laatsteKleur, fontSize: 36, lineHeight: '40px' }}>{hero}</span>
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}>
          {fmtDatum(reeks.laatste.datum).toUpperCase()}
        </span>
      </div>

      <div className="mt-3" style={{ height: 240 }}>
        {genoeg ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rijen} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...DARK_CHART_STYLES.grid} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtAs} {...DARK_CHART_STYLES.axis} />
              <YAxis
                width={56}
                domain={[
                  (min: number) => Math.floor(Math.min(min, doel ?? min) * 0.9),
                  (max: number) => Math.ceil(Math.max(max, doel ?? max) * 1.05),
                ]}
                tickFormatter={(v: number) => formatGetal(Math.abs(v) < 10 ? Math.round(v * 100) / 100 : Math.round(v))}
                {...DARK_CHART_STYLES.axis}
              />
              <Tooltip
                {...DARK_CHART_STYLES.tooltip}
                labelFormatter={(t) => fmtDatum(Number(t))}
                formatter={(v, name) => [typeof v === 'number' ? metEenheid(v, eenheid) : String(v), String(name)]}
              />
              {doel != null && (
                <ReferenceLine
                  y={doel}
                  stroke={P.lime}
                  strokeDasharray="4 4"
                  label={{ value: `Doel ${metEenheid(doel, eenheid)}`, position: 'insideTopLeft', fill: P.lime, fontSize: 10 }}
                />
              )}
              {lijnen.map((l) => (
                <Line key={l.key} type="monotone" dataKey={l.key} name={l.naam} stroke={l.kleur} strokeWidth={2} dot={{ r: 3, fill: l.kleur }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: P.inkMuted, fontSize: 12 }}>Eén testdag. De lijn verschijnt vanaf de tweede.</p>
        )}
      </div>
      {maat === 'zijden' && genoeg && (
        <div className="flex gap-4 mt-1">
          <span className="athletic-mono" style={{ color: P.brand, fontSize: 10, letterSpacing: '0.12em' }}>● LINKS</span>
          <span className="athletic-mono" style={{ color: P.ice, fontSize: 10, letterSpacing: '0.12em' }}>● RECHTS</span>
        </div>
      )}
      {reeks.perDag.length < reeks.punten.length && (
        <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 8 }}>
          De grafiek toont per dag de beste poging. Alle pogingen staan hieronder.
        </p>
      )}

      <MetaLabel style={{ marginTop: 18, marginBottom: 6 }}>Alle metingen · {reeks.punten.length}</MetaLabel>
      <div>
        {[...reeks.punten].reverse().map((p, i) => {
          const kleur = p.zone ? ZONE_KLEUR[p.zone] : P.ink
          const zijden = zijdenTekst(reeks, p)
          return (
            <div key={`${p.reportId}-${i}`} className="flex items-baseline gap-3 py-2" style={{ borderTop: i === 0 ? 'none' : `1px solid ${P.line}` }}>
              <div className="flex-1 min-w-0">
                <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>{fmtDatum(p.datum)}</p>
                {(p.zone || (meekijken && !p.definitief)) && (
                  <p style={{ color: P.inkMuted, fontSize: 11 }}>
                    {[p.zone ? ZONE_TEKST[p.zone] : null, meekijken && !p.definitief ? 'concept' : null].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="athletic-mono" style={{ color: kleur, fontSize: 13 }}>{hoofdUitslag(reeks, p)}</p>
                {zijden && <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>{zijden}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </Tile>
  )
}
