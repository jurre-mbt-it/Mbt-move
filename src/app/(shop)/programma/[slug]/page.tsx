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
import { youtubeId, youtubeEmbed } from '@/lib/shop/youtube'
import { CheckoutForm } from '@/components/shop/CheckoutForm'
import { RequestAccessDialog } from '@/components/shop/RequestAccessDialog'

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
  const isLoggedIn = !!user

  // Bezit de ingelogde koper dit digitale programma al? Dan niet nog eens laten
  // kopen, maar doorsturen naar 'mijn programma's'. Match op accountmail.
  let alreadyOwned = false
  if (isLoggedIn && isProgram) {
    const owned = await prisma.shopEntitlement.findFirst({
      where: { revokedAt: null, productId: product.id, customer: { email: user.email.toLowerCase() } },
      select: { id: true },
    })
    alreadyOwned = !!owned
  }

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

          {/* Preview-video (YouTube-embed; andere links als knop). */}
          {product.previewVideoUrl &&
            (() => {
              const ytId = youtubeId(product.previewVideoUrl)
              return ytId ? (
                <div className="mt-10">
                  <h2 className="mb-3 text-lg font-semibold">Bekijk een preview</h2>
                  <div
                    className="aspect-video overflow-hidden rounded-2xl border"
                    style={{ borderColor: P.line }}
                  >
                    <iframe
                      src={youtubeEmbed(ytId)}
                      title={`Preview van ${product.name}`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <a
                  href={product.previewVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-white"
                  style={{ color: P.brand }}
                >
                  ▶ Bekijk een preview-video
                </a>
              )
            })()}
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
              {isPhysical ? (product.requiresShipping ? ' · inclusief verzending' : '') : null}
            </p>

            {soldOut && (
              <p className="mt-3 text-sm font-semibold" style={{ color: P.brand }}>
                Tijdelijk uitverkocht
              </p>
            )}

            {/* Diensten met een boekingslink: direct plannen. Voor de rest geldt:
                kopen kan alleen mét account. Uitgelogd -> inloggen of toegang
                aanvragen; al in bezit -> door naar 'mijn programma's'. */}
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
            ) : alreadyOwned ? (
              <>
                <Link
                  href="/mijn-programmas"
                  className="mt-5 block w-full rounded-xl px-5 py-3.5 text-center font-extrabold transition-transform hover:-translate-y-0.5"
                  style={{ background: P.brand, color: P.bg, letterSpacing: '0.03em' }}
                >
                  Open in mijn programma&apos;s
                </Link>
                <p className="mt-3 text-center text-xs" style={{ color: P.inkDim }}>
                  Je hebt dit programma al. Volg het op web en in de app.
                </p>
              </>
            ) : !purchasable ? (
              <>
                <button
                  disabled
                  className="mt-5 w-full rounded-xl px-5 py-3.5 font-extrabold opacity-60"
                  style={{ background: P.brand, color: P.bg, letterSpacing: '0.03em' }}
                >
                  {soldOut ? 'Uitverkocht' : 'Binnenkort te koop'}
                </button>
                {!soldOut && (
                  <p className="mt-3 text-center text-xs" style={{ color: P.inkDim }}>
                    Betalen via iDEAL volgt zodra de shop live gaat.
                  </p>
                )}
              </>
            ) : isLoggedIn ? (
              <CheckoutForm slug={product.slug} requiresShipping={isPhysical && product.requiresShipping} />
            ) : (
              <>
                <Link
                  href={`/login?next=/programma/${product.slug}`}
                  className="mt-5 block w-full rounded-xl px-5 py-3.5 text-center font-extrabold transition-transform hover:-translate-y-0.5"
                  style={{ background: P.brand, color: P.bg, letterSpacing: '0.03em' }}
                >
                  Inloggen om te kopen
                </Link>
                <RequestAccessDialog
                  productSlug={product.slug}
                  trigger={
                    <button
                      className="mt-3 block w-full rounded-xl px-5 py-3 text-center text-sm font-semibold transition-colors"
                      style={{ border: `1px solid ${P.lineStrong}`, color: P.ink }}
                    >
                      Nog geen account? Vraag toegang aan
                    </button>
                  }
                />
                <p className="mt-3 text-center text-xs" style={{ color: P.inkDim }}>
                  Je koopt onze programma&apos;s met een account.
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
