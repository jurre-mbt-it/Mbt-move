/**
 * Admin product-bouwer voor de consumenten-shop.
 * Alleen bereikbaar voor role = ADMIN (gated via (admin)/layout).
 *
 * Hier koppel je een Program-template aan een verkoopbaar product, zet je
 * prijs/teksten en publiceer je het. De storefront (/shop) toont alleen
 * PUBLISHED-producten; concepten blijven verborgen. Het aanmaken/bewerken
 * loopt via de begeleide ProductWizard met live preview en checklist.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dumbbell, Package, CalendarClock } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, Kicker, Display, P } from '@/components/dark-ui'
import { formatPriceCents } from '@/lib/shop/format'
import { heroGradient } from '@/lib/shop/gradient'
import { KIND_LABELS, STATUS_LABELS } from '@/lib/shop/labels'
import { ProductWizard, type AdminProduct } from '@/components/shop/admin/ProductWizard'
import { AccessRequestsPanel } from '@/components/shop/admin/AccessRequestsPanel'

type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: P.inkMuted,
  PUBLISHED: P.brand,
  ARCHIVED: P.inkDim,
}

const KIND_ICON = {
  PROGRAM: Dumbbell,
  PHYSICAL: Package,
  SERVICE: CalendarClock,
} as const

export default function AdminShopPage() {
  const { data: products = [], isLoading } = trpc.shop.adminList.useQuery()
  const { data: programs = [] } = trpc.shop.adminListPrograms.useQuery()
  const { data: therapists = [] } = trpc.shop.adminListTherapists.useQuery()

  // null = lijst, 'new' = nieuw product, anders het product dat bewerkt wordt.
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <Kicker>Shop</Kicker>
          <Display>
            {editing === 'new'
              ? 'Nieuw product'
              : editing
                ? editing.name || 'Product bewerken'
                : 'Producten'}
          </Display>
        </div>
        {!editing && (
          <div className="flex gap-3">
            <DarkButton href="/admin/shop/verkopen" variant="secondary" size="sm">
              Verkoop &amp; omzet
            </DarkButton>
            <DarkButton href="/shop" variant="secondary" size="sm">
              Bekijk storefront
            </DarkButton>
            <DarkButton onClick={() => setEditing('new')} size="sm">
              + Nieuw product
            </DarkButton>
          </div>
        )}
      </div>

      {editing ? (
        <ProductWizard
          product={editing === 'new' ? null : editing}
          programs={programs}
          therapists={therapists}
          onClose={() => setEditing(null)}
        />
      ) : (
        <>
          <AccessRequestsPanel />
          {isLoading ? (
        <p style={{ color: P.inkMuted }}>Laden…</p>
      ) : products.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-12 text-center"
          style={{ borderColor: P.lineStrong, color: P.inkMuted }}
        >
          <p className="font-medium">Nog geen producten.</p>
          <p className="mt-1 text-sm" style={{ color: P.inkDim }}>
            Maak je eerste product en koppel het aan een van je schema-templates.
          </p>
          <div className="mt-5">
            <DarkButton onClick={() => setEditing('new')} size="sm">
              + Nieuw product
            </DarkButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const KindIcon = KIND_ICON[p.kind as keyof typeof KIND_ICON] ?? Dumbbell
            const stockKnown = p.kind === 'PHYSICAL' && p.stockQty != null
            const soldOut = stockKnown && p.stockQty! <= 0
            const lowStock = stockKnown && !soldOut && p.stockQty! <= 3
            return (
              <div
                key={p.id}
                className="rounded-xl border p-4 flex items-center gap-4 transition-colors"
                style={{ borderColor: P.line, background: P.surface }}
              >
                <div
                  className="relative h-14 w-20 shrink-0 rounded-lg overflow-hidden"
                  style={{
                    background: p.heroImageUrl
                      ? `center / cover no-repeat url(${p.heroImageUrl})`
                      : heroGradient(p.slug),
                  }}
                >
                  <span
                    className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md"
                    style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.85)' }}
                  >
                    <KindIcon size={12} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold truncate">{p.name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: STATUS_COLOR[p.status as Status], background: P.surfaceHi }}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                    {soldOut && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: '#f87171', background: P.surfaceHi }}
                      >
                        Uitverkocht
                      </span>
                    )}
                    {lowStock && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: '#fbbf24', background: P.surfaceHi }}
                      >
                        Nog {p.stockQty} op voorraad
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: P.inkDim }}>
                    /{p.slug} · {KIND_LABELS[p.kind]}
                    {p.kind === 'PROGRAM'
                      ? p.program
                        ? ` · ${p.program.name}`
                        : ' · geen schema gekoppeld'
                      : ''}
                    {stockKnown && !soldOut && !lowStock ? ` · voorraad ${p.stockQty}` : ''}
                    {p.therapist
                      ? ` · ${p.therapist.name || [p.therapist.firstName, p.therapist.lastName].filter(Boolean).join(' ')}`
                      : ''}
                  </div>
                </div>
                <span className="font-bold shrink-0">
                  {formatPriceCents(p.priceCents, p.currency)}
                </span>
                <div className="flex gap-3 shrink-0">
                  <Link
                    href={`/programma/${p.slug}`}
                    className="text-sm hover:text-white transition-colors"
                    style={{ color: P.inkMuted }}
                  >
                    Preview
                  </Link>
                  <button
                    onClick={() => setEditing(p)}
                    className="text-sm font-medium"
                    style={{ color: P.brand }}
                  >
                    Bewerk
                  </button>
                </div>
              </div>
            )
          })}
        </div>
          )}
        </>
      )}
    </div>
  )
}
