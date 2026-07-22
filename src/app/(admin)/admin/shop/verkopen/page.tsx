/**
 * Verkoop- & omzetdashboard voor de shop. Alleen ADMIN (gated via (admin)/layout).
 * Toont totale omzet, per periode (maand/kwartaal/jaar), per programma en per
 * therapeut — de basis voor omzetverdeling.
 */
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, Kicker, Display, P } from '@/components/dark-ui'
import { formatPriceCents } from '@/lib/shop/format'

type Gran = 'month' | 'quarter' | 'year'

const MONTHS = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

function formatPeriod(period: string, gran: Gran): string {
  if (gran === 'year') return period
  if (gran === 'quarter') {
    const [y, q] = period.split('-')
    return `${q} ${y}`
  }
  const [y, m] = period.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

const GRAN_LABEL: Record<Gran, string> = { month: 'Maand', quarter: 'Kwartaal', year: 'Jaar' }

export default function SalesPage() {
  const [gran, setGran] = useState<Gran>('month')
  const { data, isLoading } = trpc.shop.salesSummary.useQuery({ granularity: gran })

  const maxPeriod = data ? Math.max(1, ...data.byPeriod.map((p) => p.revenueCents)) : 1

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <Kicker>Shop</Kicker>
          <Display>Verkoop &amp; omzet</Display>
        </div>
        <DarkButton href="/admin/shop" variant="secondary" size="sm">
          ← Producten
        </DarkButton>
      </div>

      {/* Periode-keuze */}
      <div className="flex gap-2 mb-6">
        {(['month', 'quarter', 'year'] as Gran[]).map((g) => {
          const active = g === gran
          return (
            <button
              key={g}
              onClick={() => setGran(g)}
              className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
              style={{
                background: active ? P.brand : P.surface,
                color: active ? P.bg : P.inkMuted,
                border: `1px solid ${active ? P.brand : P.line}`,
              }}
            >
              {GRAN_LABEL[g]}
            </button>
          )
        })}
      </div>

      {isLoading || !data ? (
        <p style={{ color: P.inkMuted }}>Laden…</p>
      ) : data.totals.orders === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-12 text-center"
          style={{ borderColor: P.lineStrong, color: P.inkMuted }}
        >
          <p className="font-medium">Nog geen betaalde verkopen.</p>
          <p className="mt-1 text-sm" style={{ color: P.inkDim }}>
            Zodra Mollie is aangesloten en de eerste bestelling binnen is, verschijnt hier je omzet.
          </p>
        </div>
      ) : (
        <>
          {/* KPI's */}
          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            <Kpi label="Totale omzet" value={formatPriceCents(data.totals.revenueCents)} accent />
            <Kpi label="Aantal verkopen" value={String(data.totals.orders)} />
            <Kpi label="Gem. orderwaarde" value={formatPriceCents(data.totals.avgOrderCents)} />
          </div>

          {/* Per periode */}
          <Section title={`Omzet per ${GRAN_LABEL[gran].toLowerCase()}`}>
            <div className="space-y-2.5">
              {data.byPeriod.map((p) => (
                <div key={p.period} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm" style={{ color: P.inkMuted }}>
                    {formatPeriod(p.period, gran)}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: P.surfaceHi }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(p.revenueCents / maxPeriod) * 100}%`, background: P.brand }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold">
                    {formatPriceCents(p.revenueCents)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs" style={{ color: P.inkDim }}>
                    {p.orders}×
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Per programma */}
          <Section title="Per programma">
            <Table
              rows={data.byProduct.map((p) => ({
                key: p.slug,
                name: p.name,
                count: p.count,
                revenueCents: p.revenueCents,
              }))}
            />
          </Section>

          {/* Per therapeut */}
          <Section title="Per therapeut (basis voor omzetverdeling)">
            <Table
              rows={data.byTherapist.map((t) => ({
                key: t.id ?? 'none',
                name: t.name,
                count: t.count,
                revenueCents: t.revenueCents,
              }))}
            />
          </Section>

          <RecentOrders />
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: P.surface, border: `1px solid ${accent ? 'rgba(232,122,85,0.4)' : P.line}` }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: P.inkMuted }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold" style={{ color: accent ? P.brand : P.ink }}>
        {value}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: P.inkMuted }}>
        {title}
      </h2>
      <div className="rounded-2xl p-5" style={{ background: P.surface, border: `1px solid ${P.line}` }}>
        {children}
      </div>
    </div>
  )
}

function RecentOrders() {
  const { data: orders = [], isLoading } = trpc.shop.adminRecentOrders.useQuery({ limit: 15 })
  const send = trpc.shop.sendOrderEmails.useMutation({
    onSuccess: (r) => {
      if (r.reason === 'no_api_key') toast.message('Geen RESEND_API_KEY ingesteld — e-mails niet verstuurd')
      else if (r.confirmation && r.invoice) toast.success('Bevestiging + factuur verstuurd')
      else toast.message(`Bevestiging: ${r.confirmation ? 'ok' : 'mislukt'} · factuur: ${r.invoice ? 'ok' : 'mislukt'}`)
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || orders.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: P.inkMuted }}>
        Recente bestellingen
      </h2>
      <div className="rounded-2xl p-5" style={{ background: P.surface, border: `1px solid ${P.line}` }}>
        <div className="space-y-3.5">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-medium truncate">{o.buyerName ?? o.email}</div>
                <div className="text-xs truncate" style={{ color: P.inkDim }}>
                  {o.invoiceNumber} · {o.productNames.join(', ')}
                  {o.paidAt ? ` · ${new Date(o.paidAt).toLocaleDateString('nl-NL')}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="font-semibold">{formatPriceCents(o.amountCents)}</span>
                <a
                  href={`/api/shop/invoice/${o.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium"
                  style={{ color: P.brand }}
                >
                  Factuur ↓
                </a>
                <button
                  onClick={() => send.mutate({ orderId: o.id })}
                  disabled={send.isPending}
                  className="text-sm transition-colors hover:text-[#F5F2ED] disabled:opacity-50"
                  style={{ color: P.inkMuted }}
                >
                  E-mails versturen
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Table({
  rows,
}: {
  rows: Array<{ key: string; name: string; count: number; revenueCents: number }>
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-4">
          <span className="min-w-0 truncate" style={{ color: P.ink }}>
            {r.name}
          </span>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xs" style={{ color: P.inkDim }}>
              {r.count}× verkocht
            </span>
            <span className="w-24 text-right font-semibold">{formatPriceCents(r.revenueCents)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
