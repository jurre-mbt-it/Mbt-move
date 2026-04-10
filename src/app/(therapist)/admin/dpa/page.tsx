'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc/client'
import { CheckCircle2, Clock, Download, Search, Users } from 'lucide-react'
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Verwerkingsovereenkomst (DPA)</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Overzicht patiëntacceptaties · Huidige versie: {DPA_VERSION}
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 shrink-0"
          onClick={downloadCsv}
          disabled={patients.length === 0}
        >
          <Download className="w-4 h-4" />
          CSV exporteren
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Totaal patiënten</span>
            </div>
            <p className="text-2xl font-bold">{patients.length}</p>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4" style={{ color: '#4ECDC4' }} />
              <span className="text-xs text-muted-foreground">Geaccepteerd</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#0D6B6E' }}>{acceptedCount}</p>
          </CardContent>
        </Card>
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Openstaand</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam of e-mail…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card style={{ borderRadius: '14px', overflow: 'hidden' }}>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {query ? 'Geen patiënten gevonden' : 'Geen patiënten gekoppeld aan uw account'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Header row */}
            <div className="grid grid-cols-4 gap-4 px-4 py-3 bg-zinc-50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>Patiënt</span>
              <span>Status</span>
              <span>Versie</span>
              <span>Datum</span>
            </div>
            {filtered.map(p => (
              <div key={p.id} className="grid grid-cols-4 gap-4 px-4 py-3 items-center hover:bg-zinc-50 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                </div>
                <div>
                  {p.accepted ? (
                    <Badge
                      className="text-xs gap-1"
                      style={{ background: '#f0fdfa', color: '#0D6B6E', border: 'none' }}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Geaccepteerd
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs gap-1 text-amber-600 border-amber-200"
                    >
                      <Clock className="w-3 h-3" /> Openstaand
                    </Badge>
                  )}
                </div>
                <div className="text-sm">
                  {p.dpaAcceptedVersion ? (
                    <span className="font-mono text-xs">{p.dpaAcceptedVersion}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
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
      </Card>

      <p className="text-xs text-muted-foreground">
        Dit overzicht toont uitsluitend patiënten die aan uw account zijn gekoppeld.
        Bewaar deze export conform de bewaartermijn van 15 jaar (WGBO).
      </p>
    </div>
  )
}
