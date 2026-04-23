'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Display, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { InsightCard, type InsightCardData } from '@/components/insights/InsightCard'

const URGENCY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

export default function SignalsDashboardPage() {
  const { data, isLoading, refetch } = trpc.insights.getDashboard.useQuery()

  const insights = (data?.insights ?? []) as unknown as InsightCardData[]
  const silentPatients = data?.silentPatients ?? []

  const { today, thisWeek } = useMemo(() => {
    const now = Date.now()
    const oneDay = 24 * 3600 * 1000
    const today: InsightCardData[] = []
    const thisWeek: InsightCardData[] = []
    for (const i of insights) {
      const ageMs = now - new Date(i.createdAt).getTime()
      if (i.urgency === 'CRITICAL' || i.urgency === 'HIGH') {
        if (ageMs <= oneDay) today.push(i)
        else thisWeek.push(i)
      } else {
        thisWeek.push(i)
      }
    }
    today.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency])
    thisWeek.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency])
    return { today, thisWeek }
  }, [insights])

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-24 space-y-6">
        <div className="space-y-1">
          <Kicker>Clinical Insight Engine</Kicker>
          <Display size="md">SIGNALEN</Display>
          <MetaLabel style={{ textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
            Regelgebaseerde suggesties op basis van patient-reported outcomes
          </MetaLabel>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <span
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}
            >
              LADEN…
            </span>
          </div>
        )}

        {!isLoading && insights.length === 0 && silentPatients.length === 0 && (
          <Tile>
            <div className="py-10 text-center space-y-3">
              <p style={{ color: P.ink, fontSize: 14 }}>
                Nog geen actieve signalen.
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12 }}>
                Activeer de engine per patiënt via hun detailpagina.
              </p>
            </div>
          </Tile>
        )}

        {/* Vandaag */}
        {!isLoading && today.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <MetaLabel>Vandaag · {today.length}</MetaLabel>
            </div>
            {today.map((i) => (
              <InsightCard key={i.id} insight={i} onChange={refetch} />
            ))}
          </section>
        )}

        {/* Deze week */}
        {!isLoading && thisWeek.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <MetaLabel>Deze week · {thisWeek.length}</MetaLabel>
            </div>
            {thisWeek.map((i) => (
              <InsightCard key={i.id} insight={i} onChange={refetch} />
            ))}
          </section>
        )}

        {/* Geactiveerde patiënten zonder signalen */}
        {!isLoading && silentPatients.length > 0 && (
          <section className="space-y-3">
            <MetaLabel>Geactiveerd · geen signalen · {silentPatients.length}</MetaLabel>
            <Tile>
              <div className="flex flex-wrap gap-2">
                {silentPatients.map((p) => (
                  <Link
                    key={p.patientId}
                    href={`/therapist/patients/${p.patientId}`}
                    className="athletic-mono inline-flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: P.surfaceHi,
                      color: P.inkMuted,
                      fontSize: 11,
                      letterSpacing: '0.05em',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: P.lime,
                        display: 'inline-block',
                      }}
                    />
                    {p.name}
                  </Link>
                ))}
              </div>
            </Tile>
          </section>
        )}
      </div>
    </div>
  )
}
