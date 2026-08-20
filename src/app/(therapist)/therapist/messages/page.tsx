'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { ChevronRight, MessageSquare } from 'lucide-react'
import { Display, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export default function TherapistMessagesPage() {
  const portal = usePortal()
  const { data: inbox, isLoading } = trpc.messages.inbox.useQuery(undefined, {
    refetchInterval: 30_000,
  })

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <Kicker>COMMUNICATIE</Kicker>
        <Display size="lg">BERICHTEN</Display>
        <MetaLabel style={{ marginTop: 4, textTransform: 'none', fontWeight: 500 }}>
          Vragen en reacties van je atleten
        </MetaLabel>
      </div>

      {isLoading ? (
        <div className="text-center py-10">
          <MetaLabel>LADEN…</MetaLabel>
        </div>
      ) : !inbox || inbox.length === 0 ? (
        <Tile>
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <MessageSquare className="w-8 h-8" style={{ color: P.inkDim }} />
            <p style={{ color: P.ink, fontSize: 15, fontWeight: 700 }}>Nog geen gesprekken</p>
            <p style={{ color: P.inkMuted, fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>
              Zodra een atleet een bericht stuurt, of jij er een start vanaf een
              atletenpagina, verschijnt het gesprek hier.
            </p>
          </div>
        </Tile>
      ) : (
        <div className="space-y-2">
          {inbox.map(t => (
            <Link
              key={t.patientId}
              href={`${portal.base}/messages/${t.patientId}`}
              className="mbt-card-hover athletic-tap flex items-center gap-3 rounded-2xl px-4 py-3.5 w-full"
              style={{
                background: P.surface,
                border: `1px solid ${t.unread > 0 ? 'rgba(232,122,85,0.45)' : P.line}`,
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: P.control, border: `1px solid ${P.line}`, color: P.ink, fontWeight: 900, fontSize: 15 }}
              >
                {(t.patientName[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate" style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>
                    {t.patientName}
                  </p>
                  <span className="athletic-mono shrink-0" style={{ color: P.inkDim, fontSize: 10 }}>
                    {fmtWhen(t.lastAt)}
                  </span>
                </div>
                <p
                  className="truncate"
                  style={{ color: t.unread > 0 ? P.ink : P.inkMuted, fontSize: 12.5, marginTop: 2, fontWeight: t.unread > 0 ? 600 : 400 }}
                >
                  {t.lastFromPatient ? '' : 'Jij: '}
                  {t.lastBody}
                </p>
              </div>
              {t.unread > 0 && (
                <span
                  className="athletic-mono shrink-0 rounded-full flex items-center justify-center"
                  style={{ minWidth: 22, height: 22, padding: '0 6px', background: P.brand, color: P.bg, fontSize: 11, fontWeight: 900 }}
                >
                  {t.unread}
                </span>
              )}
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: P.inkDim }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
