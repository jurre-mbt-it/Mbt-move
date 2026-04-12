'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/lib/trpc/client'
import { Database, Download, Users, Activity, TrendingUp, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { IconLock } from '@/components/icons'

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
      icon: Database,
      bg: '#f0fdfa',
      color: '#0f766e',
    },
    {
      label: 'Patiënten met toestemming',
      value: isLoading ? '…' : (aggregates?.totalConsenting ?? 0).toLocaleString('nl-NL'),
      icon: Users,
      bg: '#eff6ff',
      color: '#1d4ed8',
    },
    {
      label: 'Gemiddelde leeftijd',
      value: isLoading ? '…' : aggregates?.averageAge ? `${aggregates.averageAge} jr` : '—',
      icon: TrendingUp,
      bg: '#fefce8',
      color: '#a16207',
    },
    {
      label: 'Gem. pijnniveau',
      value: isLoading ? '…' : aggregates?.averagePainLevel != null ? `${aggregates.averagePainLevel}/10` : '—',
      icon: Activity,
      bg: '#fff1f2',
      color: '#be123c',
    },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Title + export */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Research Database</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Geanonimiseerde trainingsdata van patiënten met toestemming.{' '}
            <span className="font-medium text-zinc-700">
              Alleen aggregaties zichtbaar — geen individuele records.
            </span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportCSV}
            disabled={isExporting || isLoading}
          >
            <Download className="w-4 h-4" />
            CSV export
          </Button>
        </div>
      </div>

      {/* Security notice */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
        style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
      >
        <IconLock size={18} />
        <div>
          <p className="font-semibold" style={{ color: '#92400e' }}>Beveiligingsregels actief</p>
          <p style={{ color: '#78350f' }}>
            AnonymousIdMapping is nooit toegankelijk via deze interface. Export bevat uitsluitend
            AnonymizedRecord rijen. Geen individuele identificatie mogelijk.
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(stat => (
          <Card key={stat.label} style={{ borderRadius: '12px' }}>
            <CardContent className="p-5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: stat.bg }}
              >
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Diagnosis breakdown */}
      <Card style={{ borderRadius: '12px' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" style={{ color: '#4ECDC4' }} />
            Verdeling per diagnose categorie
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
              Laden…
            </div>
          ) : !aggregates?.byDiagnosis?.length ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
              Nog geen data beschikbaar
            </div>
          ) : (
            <div className="space-y-2.5">
              {aggregates.byDiagnosis.map(row => {
                const max = aggregates.byDiagnosis[0]?.count ?? 1
                const pct = Math.round((row.count / max) * 100)
                return (
                  <div key={row.category} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-40 shrink-0 truncate">{row.category}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#f4f4f5' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: '#4ECDC4' }}
                      />
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs w-12 text-center justify-center shrink-0"
                    >
                      {row.count}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export info */}
      <Card style={{ borderRadius: '12px' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" style={{ color: '#4ECDC4' }} />
            Data export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            De CSV export bevat uitsluitend rijen uit de <code className="bg-zinc-100 px-1 rounded text-xs">anonymized_records</code> tabel.
            De koppeltabel <code className="bg-zinc-100 px-1 rounded text-xs">anonymous_id_mappings</code> is nooit inbegrepen in exports.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              { col: 'anonymousId', desc: 'Willekeurig gegenereerde ID (niet terug te voeren naar patiënt)' },
              { col: 'ageAtRecord', desc: 'Leeftijd in jaren op moment van registratie' },
              { col: 'diagnosisCategory', desc: 'Genormaliseerde diagnose categorie' },
              { col: 'painLevel / exertionLevel', desc: 'Pijn (0-10) en RPE (0-10)' },
              { col: 'sessionDuration', desc: 'Sessieduur in seconden' },
              { col: 'recordDate', desc: 'Datum van de sessie (geen tijdstip)' },
            ].map(item => (
              <div key={item.col} className="flex flex-col gap-0.5">
                <code className="text-xs font-mono bg-zinc-100 px-1.5 py-0.5 rounded w-fit">
                  {item.col}
                </code>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
          <Button
            className="gap-2 text-white"
            style={{ background: '#4ECDC4' }}
            onClick={handleExportCSV}
            disabled={isExporting || isLoading || (aggregates?.totalRecords ?? 0) === 0}
          >
            <Download className="w-4 h-4" />
            Download CSV ({(aggregates?.totalRecords ?? 0).toLocaleString('nl-NL')} records)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
