import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/auth/require-role'
import { P } from '@/lib/shop/palette'
import { formatPriceCents } from '@/lib/shop/format'
import { heroGradient } from '@/lib/shop/gradient'
import { BODY_REGION_LABELS, KIND_LABELS, LEVEL_LABELS } from '@/lib/shop/labels'
import { isShopPublic } from '@/lib/shop/access'
import { isMollieConfigured } from '@/lib/shop/mollie'
import { CheckoutForm } from '@/components/shop/CheckoutForm'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await prisma.shopProduct.findUnique({ where: { slug } })
  if (!product) notFound()

  // Niet-gepubliceerde producten alleen voor admin (preview).
  const user = await getServerUser()
  const isDraft = product.status !== 'PUBLISHED'
  if (isDraft && user?.role !== 'ADMIN') notFound()

  const priceExVat = Math.round(product.priceCents / (1 + product.vatRate / 100))
  const isProgram = product.kind === 'PROGRAM'
  const isService = product.kind === 'SERVICE'
  const isPhysical = product.kind === 'PHYSICAL'
  const soldOut = isPhysical && product.stockQty !== null && product.stockQty <= 0
  // Koopbaar als de shop publiek staat (of admin test) én Mollie is geconfigureerd.
  const purchasable =
    (isShopPublic() || user?.role === 'ADMIN') &&
    isMollieConfigured() &&
    !soldOut &&
    !(isService && !!product.bookingUrl)

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Link
        href="/shop"
        className="text-sm transition-colors hover:text-white"
        style={{ color: P.inkMuted }}
      >
        ← Terug naar de shop
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        {/* Linker kolom — inhoud */}
        <div>
          <div
            className="aspect-[16/9] rounded-2xl border mb-8 relative overflow-hidden"
            style={{
              borderColor: P.line,
              background: product.heroImageUrl
                ? `center / cover no-repeat url(${product.heroImageUrl})`
                : heroGradient(product.slug),
            }}
          >
            {!product.heroImageUrl && (
              <span
                className="absolute bottom-4 left-5 text-xs font-bold uppercase tracking-[0.22em]"
                style={{ color: 'rgba(255,255,255,0.42)' }}
              >
                MBT·Gym
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {!isProgram && (
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: P.surfaceHi, color: P.brand, border: `1px solid ${P.line}` }}
              >
                {KIND_LABELS[product.kind]}
              </span>
            )}
            {product.level && (
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: P.surfaceHi, color: P.brand, border: `1px solid ${P.line}` }}
              >
                {LEVEL_LABELS[product.level]}
              </span>
            )}
            {product.durationWeeks ? (
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.line}` }}
              >
                {product.durationWeeks} weken
              </span>
            ) : null}
            {product.bodyRegion.map((r) => (
              <span
                key={r}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.line}` }}
              >
                {BODY_REGION_LABELS[r] ?? r}
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{product.name}</h1>
          {product.tagline && (
            <p className="mt-3 text-lg" style={{ color: P.inkMuted }}>
              {product.tagline}
            </p>
          )}

          {product.description && (
            <p className="mt-6 whitespace-pre-line leading-relaxed" style={{ color: P.ink }}>
              {product.description}
            </p>
          )}

          {product.highlights.length > 0 && (
            <ul className="mt-8 space-y-3">
              {product.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: P.brand, color: P.bg }}
                  >
                    ✓
                  </span>
                  <span style={{ color: P.ink }}>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Rechter kolom — koopkaart (sticky) */}
        <div>
          <div
            className="lg:sticky lg:top-24 rounded-2xl border p-6"
            style={{ borderColor: P.lineStrong, background: P.surface }}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {formatPriceCents(product.priceCents, product.currency)}
              </span>
              <span className="text-xs" style={{ color: P.inkDim }}>
                incl. {product.vatRate}% btw
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: P.inkDim }}>
              ({formatPriceCents(priceExVat, product.currency)} excl. btw)
              {isProgram ? ' · eenmalig, levenslange toegang' : null}
              {isPhysical ? (product.requiresShipping ? ' · exclusief verzendkosten' : '') : null}
            </p>

            {soldOut && (
              <p className="mt-3 text-sm font-semibold" style={{ color: P.brand }}>
                Tijdelijk uitverkocht
              </p>
            )}

            {/* Afrekenen volgt zodra Mollie is aangesloten. Voor diensten met een
                boekingslink kan de bezoeker nu al een afspraak plannen. */}
            {isService && product.bookingUrl ? (
              <a
                href={product.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block w-full rounded-xl px-5 py-3.5 text-center font-extrabold transition-transform hover:-translate-y-0.5"
                style={{ background: P.brand, color: P.bg, letterSpacing: '0.03em' }}
              >
                Plan je afspraak
              </a>
            ) : purchasable ? (
              <CheckoutForm slug={product.slug} requiresShipping={isPhysical && product.requiresShipping} />
            ) : (
              <>
                <button
                  disabled
                  className="mt-5 w-full rounded-xl px-5 py-3.5 font-extrabold opacity-60"
                  style={{ background: P.brand, color: P.bg, letterSpacing: '0.03em' }}
                >
                  Binnenkort te koop
                </button>
                <p className="mt-3 text-center text-xs" style={{ color: P.inkDim }}>
                  Betalen via iDEAL volgt zodra de shop live gaat.
                </p>
              </>
            )}

            <div className="mt-6 space-y-2 text-sm" style={{ color: P.inkMuted }}>
              {(isProgram
                ? ['Direct toegang na aankoop', 'Volg het op web en mobiel', 'Door fysiotherapeuten samengesteld']
                : isPhysical
                  ? [
                      product.requiresShipping ? 'Wordt naar je opgestuurd' : 'Direct mee te nemen in onze praktijk',
                      'Door onze fysiotherapeuten geselecteerd',
                    ]
                  : ['Bij een van onze fysiotherapeuten', 'Door fysiotherapeuten uitgevoerd']
              ).map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span style={{ color: P.brand }}>✓</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
