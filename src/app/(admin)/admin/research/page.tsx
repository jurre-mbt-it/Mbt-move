'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { DarkButton, Kicker, MetaLabel, MetricTile, P, Tile } from '@/components/dark-ui'

export default function AdminResearchPage() {
  const [isExporting, setIsExporting] = useState(false)

  const { data: aggregates, isLoading } = trpc.research.getAggregates.useQuery()

  const exportQuery = trpc.research.exportRecords.useQuery(
    { format: 'csv', limit: 10000, offset: 0 },
    { enabled: false }
  )

  async function handleExportCSV() {
    setIsExporting(true)
    try {
      const result = await exportQuery.refetch()
      if (!result.data || result.data.format !== 'csv') return

      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mbt-research-export-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`${result.data.total} records geëxporteerd`)
    } catch {
      toast.error('Export mislukt. Probeer opnieuw.')
    } finally {
      setIsExporting(false)
    }
  }

  const statCards = [
    {
      label: 'Geanonimiseerde records',
      value: isLoading ? '…' : (aggregates?.totalRecords ?? 0).toLocaleString('nl-NL'),
      tint: P.lime,
    },
    {
      label: 'Patiënten met toestemming',
      value: isLoading ? '…' : (aggregates?.totalConsenting ?? 0).toLocaleString('nl-NL'),
      tint: P.ice,
    },
    {
      label: 'Gemiddelde leeftijd',
      value: isLoading ? '…' : aggregates?.averageAge ? `${aggregates.averageAge}` : '—',
      unit: aggregates?.averageAge ? 'jr' : undefined,
      tint: P.gold,
    },
    {
      label: 'Gem. pijnniveau',
      value: isLoading ? '…' : aggregates?.averagePainLevel != null ? `${aggregates.averagePainLevel}` : '—',
      unit: aggregates?.averagePainLevel != null ? '/10' : undefined,
      tint: P.danger,
    },
  ]

  return (
    <div className="max-w-5xl w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Onderzoek</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            RESEARCH DATABASE
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
            Geanonimiseerde trainingsdata van patiënten met toestemming.{' '}
            <span style={{ color: P.ink, fontWeight: 600 }}>
              Alleen aggregaties zichtbaar — geen individuele records.
            </span>
          </p>
        </div>
        <DarkButton
          variant="secondary"
          size="sm"
          onClick={handleExportCSV}
          disabled={isExporting || isLoading}
        >
          CSV export
        </DarkButton>
      </div>

      {/* Security notice */}
      <Tile accentBar={P.gold}>
        <div className="flex flex-col gap-1">
          <span
            className="athletic-mono"
            style={{ color: P.gold, fontSize: 11, letterSpacing: '0.16em', fontWeight: 800 }}
          >
            BEVEILIGINGSREGELS ACTIEF
          </span>
          <p style={{ color: P.ink, fontSize: 13, lineHeight: 1.5 }}>
            AnonymousIdMapping is nooit toegankelijk via deze interface. Export bevat uitsluitend
            AnonymizedRecord rijen. Geen individuele identificatie mogelijk.
          </p>
        </div>
      </Tile>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => (
          <MetricTile
            key={stat.label}
            label={stat.label}
            value={stat.value}
            unit={stat.unit}
            tint={stat.tint}
          />
        ))}
      </div>

      {/* Diagnosis breakdown */}
      <Tile>
        <MetaLabel>Verdeling per diagnose categorie</MetaLabel>
        <div className="mt-3">
          {isLoading ? (
            <div
              className="h-32 flex items-center justify-center"
              style={{ color: P.inkMuted, fontSize: 13 }}
            >
              Laden…
            </div>
          ) : !aggregates?.byDiagnosis?.length ? (
            <div
              className="h-32 flex items-center justify-center"
              style={{ color: P.inkMuted, fontSize: 13 }}
            >
              Nog geen data beschikbaar
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {aggregates.byDiagnosis.map((row) => {
                const max = aggregates.byDiagnosis[0]?.count ?? 1
                const pct = Math.round((row.count / max) * 100)
                return (
                  <div key={row.category} className="flex items-center gap-3">
                    <span
                      className="w-40 shrink-0 truncate"
                      style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}
                    >
                      {row.category}
                    </span>
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: P.surfaceHi }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: P.lime }}
                      />
                    </div>
                    <span
                      className="athletic-mono w-12 text-center shrink-0"
                      style={{ color: P.inkMuted, fontSize: 12, fontWeight: 700 }}
                    >
                      {row.count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Tile>

      {/* Export info */}
      <Tile accentBar={P.lime}>
        <MetaLabel>Data export</MetaLabel>
        <div className="flex flex-col gap-3 mt-3">
          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
            De CSV export bevat uitsluitend rijen uit de{' '}
            <code
              className="athletic-mono"
              style={{
                background: P.surfaceHi,
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 11,
                color: P.ink,
              }}
            >
              anonymized_records
            </code>{' '}
            tabel. De koppeltabel{' '}
            <code
              className="athletic-mono"
              style={{
                background: P.surfaceHi,
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 11,
                color: P.ink,
              }}
            >
              anonymous_id_mappings
            </code>{' '}
            is nooit inbegrepen in exports.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { col: 'anonymousId', desc: 'Willekeurig gegenereerde ID (niet terug te voeren naar patiënt)' },
              { col: 'ageAtRecord', desc: 'Leeftijd in jaren op moment van registratie' },
              { col: 'diagnosisCategory', desc: 'Genormaliseerde diagnose categorie' },
              { col: 'painLevel / exertionLevel', desc: 'Pijn (0-10) en RPE (0-10)' },
              { col: 'sessionDuration', desc: 'Sessieduur in seconden' },
              { col: 'recordDate', desc: 'Datum van de sessie (geen tijdstip)' },
            ].map((item) => (
              <div key={item.col} className="flex flex-col gap-1">
                <code
                  className="athletic-mono w-fit"
                  style={{
                    background: P.surfaceHi,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: P.ink,
                    fontWeight: 700,
                  }}
                >
                  {item.col}
                </code>
                <span style={{ color: P.inkMuted, fontSize: 12 }}>{item.desc}</span>
              </div>
            ))}
          </div>
          <DarkButton
            onClick={handleExportCSV}
            disabled={isExporting || isLoading || (aggregates?.totalRecords ?? 0) === 0}
          >
            Download CSV ({(aggregates?.totalRecords ?? 0).toLocaleString('nl-NL')} records)
          </DarkButton>
        </div>
      </Tile>
    </div>
  )
}
