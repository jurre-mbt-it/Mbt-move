'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { Display, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { InsightCard, type InsightCardData } from '@/components/insights/InsightCard'

const URGENCY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

/** Zelfde relatieve tijd als op het dashboard, waar de stil-lijst vandaan komt. */
function timeAgo(d: Date | string, now: number): string {
  const t = new Date(d).getTime()
  const min = Math.round((now - t) / 60000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min} min`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} u`
  const days = Math.floor((now - t) / 86400000)
  if (days === 1) return 'gisteren'
  if (days < 7) return `${days} dgn`
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export default function SignalsDashboardPage() {
  const portal = usePortal()
  const { data, isLoading, refetch } = trpc.insights.getDashboard.useQuery()

  // Dag/weekgrenzen één keer bij mount vastleggen — zelfde waarden als op het
  // dashboard, zodat beide pagina's dezelfde query-cache delen.
  const [{ now, dayStart, weekStart }] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return { now: Date.now(), dayStart: d.toISOString(), weekStart: monday.toISOString() }
  })
  // Stil (≥ 7 dagen niets gelogd) hoort bij de signalen, niet op het dashboard:
  // het is een signaal om op te volgen, geen dagelijks cijfer.
  const { data: dash, isLoading: dashLoading } = trpc.patients.therapistDashboard.useQuery({
    dayStart,
    weekStart,
  })
  const silent = dash?.silentPatients ?? []

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

        {!isLoading && !dashLoading && insights.length === 0 && silentPatients.length === 0 && silent.length === 0 && (
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

        {/* Stil · geen enkele log in 7+ dagen. Stond eerder op het dashboard;
            hoort hier omdat het om opvolging vraagt, niet om een dagcijfer. */}
        {!dashLoading && silent.length > 0 && (
          <section className="space-y-3">
            <MetaLabel>Stil · al 7+ dagen niets gelogd · {silent.length}</MetaLabel>
            <Tile>
              <div className="flex flex-wrap gap-2">
                {silent.map((p) => (
                  <Link
                    key={p.patientId}
                    href={`${portal.patients}/${p.patientId}`}
                    className="athletic-mono athletic-tap inline-flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: P.control,
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
                        background: P.gold,
                        display: 'inline-block',
                      }}
                    />
                    {p.name}
                    <span style={{ color: P.inkDim }}>
                      {p.lastActivityAt ? timeAgo(p.lastActivityAt, now) : 'nooit'}
                    </span>
                  </Link>
                ))}
              </div>
            </Tile>
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
                    href={`${portal.patients}/${p.patientId}`}
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
                        background: P.brand,
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
