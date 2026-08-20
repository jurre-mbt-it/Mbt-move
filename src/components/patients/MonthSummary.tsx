'use client'

/**
 * Maandoverzicht van één persoon, boven de sessielijst.
 *
 * Beantwoordt de vraag waarmee je de historie opent: wat heeft deze persoon
 * deze maand gedaan, en hoe verhoudt zich dat tot wat er gepland stond. De
 * lijst eronder blijft het detail.
 *
 * Krachtsessies tellen mee in tijd en aantal, maar hebben geen afstand: daar
 * blijft de kolom leeg in plaats van een nul te tonen die niets betekent.
 */

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Kicker, MetaLabel, P, CARD, Tile } from '@/components/dark-ui'

const BUCKETS = [
  { key: 'strength', label: 'Kracht', color: P.brand },
  { key: 'run', label: 'Hardlopen', color: P.lime },
  { key: 'bike', label: 'Fietsen', color: P.ice },
  { key: 'other', label: 'Overig', color: P.gold },
] as const

type BucketKey = (typeof BUCKETS)[number]['key']
type DayRow = { date: string } & Record<BucketKey, { min: number; m: number; kcal: number; n: number }>

const MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** YYYY-MM van vandaag, `back` maanden terug. */
function monthKey(back = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - back)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

function hm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}u ${m}m` : `${m}m`
}

export function MonthSummary({ patientId }: { patientId: string }) {
  // Laatste 12 maanden, nieuwste eerst.
  const options = useMemo(() => Array.from({ length: 12 }, (_, i) => monthKey(i)), [])
  const [month, setMonth] = useState(() => monthKey(0))

  const { data, isLoading } = trpc.patients.monthlySummary.useQuery(
    { patientId, month },
    { staleTime: 30_000 },
  )

  // Eigen useMemo: anders is `days` elke render een nieuwe array en herberekent
  // de schaal hieronder onnodig.
  const days = useMemo(() => (data?.days ?? []) as DayRow[], [data])
  const totals = data?.totals

  // Schaal van de staafjes: de drukste dag van de maand is vol.
  const maxMin = useMemo(
    () =>
      Math.max(
        1,
        ...days.map((d) => BUCKETS.reduce((sum, b) => sum + d[b.key].min, 0)),
      ),
    [days],
  )

  const doneOfPlanned =
    totals && totals.planned > 0 ? `${totals.sessions} van ${totals.planned} gepland` : null

  return (
    <Tile>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Kicker>Maandoverzicht</Kicker>
          <MetaLabel>{monthLabel(month)}</MetaLabel>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="athletic-mono rounded-lg px-3 py-1.5"
          style={{...CARD, color: P.ink,
            fontSize: 12,}}
          aria-label="Kies een maand"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {monthLabel(o)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="athletic-mono mt-4" style={{ color: P.inkDim, fontSize: 11 }}>
          LADEN…
        </p>
      ) : !totals || totals.sessions === 0 ? (
        <p className="mt-4" style={{ color: P.inkMuted, fontSize: 13 }}>
          Niets gelogd in {monthLabel(month)}.
          {totals && totals.planned > 0 ? ` Er stonden wel ${totals.planned} sessies gepland.` : ''}
        </p>
      ) : (
        <>
          {/* Totalen */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat value={String(totals.sessions)} unit="sessies" sub={doneOfPlanned} />
            <Stat value={hm(totals.minutes)} unit="tijd" />
            <Stat
              value={totals.distanceM > 0 ? (totals.distanceM / 1000).toFixed(1) : '—'}
              unit="km"
            />
            <Stat value={totals.kcal > 0 ? String(totals.kcal) : '—'} unit="kcal" />
          </div>

          {/* Staafjes per dag, gestapeld per soort */}
          <div className="mt-5 flex items-end gap-[3px]" style={{ height: 96 }}>
            {days.map((d) => {
              const total = BUCKETS.reduce((sum, b) => sum + d[b.key].min, 0)
              return (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col justify-end"
                  style={{ minWidth: 4, height: '100%' }}
                  title={`${new Date(`${d.date}T12:00:00`).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                  })}: ${hm(total)}`}
                >
                  {BUCKETS.map((b) =>
                    d[b.key].min > 0 ? (
                      <div
                        key={b.key}
                        style={{
                          height: `${(d[b.key].min / maxMin) * 100}%`,
                          background: b.color,
                          borderRadius: 1,
                          marginTop: 1,
                        }}
                      />
                    ) : null,
                  )}
                </div>
              )
            })}
          </div>

          {/* Legenda: alleen wat er deze maand echt in zit */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {BUCKETS.filter((b) => days.some((d) => d[b.key].n > 0)).map((b) => {
              const n = days.reduce((sum, d) => sum + d[b.key].n, 0)
              const min = days.reduce((sum, d) => sum + d[b.key].min, 0)
              return (
                <span
                  key={b.key}
                  className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: P.inkMuted }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: b.color }}
                  />
                  {b.label} · {n}× · {hm(min)}
                </span>
              )
            })}
          </div>
        </>
      )}
    </Tile>
  )
}

function Stat({ value, unit, sub }: { value: string; unit: string; sub?: string | null }) {
  return (
    <div>
      <p style={{ color: P.ink, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</p>
      <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.14em' }}>
        {unit.toUpperCase()}
      </p>
      {sub ? (
        <p className="mt-0.5" style={{ color: P.inkMuted, fontSize: 11 }}>
          {sub}
        </p>
      ) : null}
    </div>
  )
}
