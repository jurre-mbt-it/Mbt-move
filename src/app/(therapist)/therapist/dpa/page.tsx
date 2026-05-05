'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, DarkInput, Kicker, MetaLabel, MetricTile, P, Tile } from '@/components/dark-ui'
import { DPA_VERSION } from '@/lib/dpa-constants'

export default function AdminDpaPage() {
  const [query, setQuery] = useState('')
  const { data: patients = [], isLoading } = trpc.dpa.listPatients.useQuery(undefined, {
    staleTime: 30_000,
  })

  const filtered = patients.filter(p =>
    !query ||
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.email.toLowerCase().includes(query.toLowerCase())
  )

  const acceptedCount = patients.filter(p => p.accepted).length
  const pendingCount = patients.length - acceptedCount

  function downloadCsv() {
    const header = 'Naam,E-mail,DPA versie,Geaccepteerd op,Account aangemaakt\n'
    const rows = patients.map(p =>
      [
        `"${p.name}"`,
        `"${p.email}"`,
        p.dpaAcceptedVersion ?? 'Niet geaccepteerd',
        p.dpaAcceptedAt
          ? new Date(p.dpaAcceptedAt).toLocaleDateString('nl-NL')
          : '',
        new Date(p.createdAt).toLocaleDateString('nl-NL'),
      ].join(',')
    )

    const csv = header + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dpa-overzicht-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Beheer</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            VERWERKINGSOVEREENKOMST
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
            Overzicht patiëntacceptaties · Huidige versie:{' '}
            <span className="athletic-mono" style={{ color: P.ink, fontWeight: 700 }}>
              {DPA_VERSION}
            </span>
          </p>
        </div>
        <DarkButton
          variant="secondary"
          size="sm"
          onClick={downloadCsv}
          disabled={patients.length === 0}
        >
          CSV exporteren
        </DarkButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="Totaal patiënten" value={patients.length} tint={P.ink} />
        <MetricTile label="Geaccepteerd" value={acceptedCount} tint={P.lime} />
        <MetricTile label="Openstaand" value={pendingCount} tint={P.gold} />
      </div>

      {/* Search */}
      <DarkInput
        placeholder="Zoek op naam of e-mail…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="max-w-sm"
      />

      {/* Table */}
      <Tile style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div className="p-4 flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: P.inkMuted, fontSize: 13 }}>
            {query ? 'Geen patiënten gevonden' : 'Geen patiënten gekoppeld aan uw account'}
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div
              className="grid grid-cols-4 gap-4 px-4 py-3 athletic-mono"
              style={{
                background: P.surfaceHi,
                color: P.inkMuted,
                fontSize: 11,
                letterSpacing: '0.14em',
                fontWeight: 700,
                textTransform: 'uppercase',
                borderBottom: `1px solid ${P.line}`,
              }}
            >
              <span>Patiënt</span>
              <span>Status</span>
              <span>Versie</span>
              <span>Datum</span>
            </div>
            {filtered.map((p, idx) => (
              <div
                key={p.id}
                className="grid grid-cols-4 gap-4 px-4 py-3 items-center"
                style={{ borderBottom: idx === filtered.length - 1 ? 'none' : `1px solid ${P.line}` }}
              >
                <div className="min-w-0">
                  <p className="truncate" style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>
                    {p.name}
                  </p>
                  <p
                    className="athletic-mono truncate"
                    style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em', fontWeight: 500 }}
                  >
                    {p.email}
                  </p>
                </div>
                <div>
                  {p.accepted ? (
                    <span
                      className="athletic-mono inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
                      style={{
                        background: 'rgba(190,242,100,0.12)',
                        color: P.lime,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        fontWeight: 800,
                      }}
                    >
                      ● GEACCEPTEERD
                    </span>
                  ) : (
                    <span
                      className="athletic-mono inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
                      style={{
                        background: 'rgba(244,194,97,0.12)',
                        color: P.gold,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        fontWeight: 800,
                      }}
                    >
                      ○ OPENSTAAND
                    </span>
                  )}
                </div>
                <div>
                  {p.dpaAcceptedVersion ? (
                    <span className="athletic-mono" style={{ color: P.ink, fontSize: 12, fontWeight: 700 }}>
                      {p.dpaAcceptedVersion}
                    </span>
                  ) : (
                    <span style={{ color: P.inkDim, fontSize: 12 }}>—</span>
                  )}
                </div>
                <div style={{ color: P.inkMuted, fontSize: 12 }}>
                  {p.dpaAcceptedAt
                    ? new Date(p.dpaAcceptedAt).toLocaleDateString('nl-NL', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                    : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Tile>

      <p style={{ color: P.inkDim, fontSize: 11, lineHeight: 1.5 }}>
        Dit overzicht toont uitsluitend patiënten die aan uw account zijn gekoppeld.
        Bewaar deze export conform de bewaartermijn van 15 jaar (WGBO).
      </p>
    </div>
  )
}
