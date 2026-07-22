import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { P } from '@/lib/shop/palette'
import { formatPriceCents } from '@/lib/shop/format'
import { heroGradient } from '@/lib/shop/gradient'
import { KIND_LABELS, LEVEL_LABELS } from '@/lib/shop/labels'

export const metadata = { title: "Programma's" }

// Altijd verse data: producten/prijzen kunnen net in de admin gewijzigd zijn.
export const dynamic = 'force-dynamic'

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.line}` }}
    >
      {children}
    </span>
  )
}

export default async function ShopCatalogPage() {
  const products = await prisma.shopProduct.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* Hero */}
      <section className="py-16 sm:py-24">
        <p
          className="text-xs font-semibold tracking-[0.2em] uppercase mb-4"
          style={{ color: P.brand }}
        >
          Door fysiotherapeuten samengesteld
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl leading-[1.05]">
          Trainingsschema&apos;s die je écht verder brengen
        </h1>
        <p className="mt-5 max-w-xl text-base" style={{ color: P.inkMuted }}>
          We bouwen deze programma&apos;s op zoals we dat in onze praktijk ook doen: rustig en
          gestructureerd sterker worden, met aandacht voor kracht en controle. Voor hardlopers,
          krachtsporters en herstel na een blessure.
        </p>
        <Link
          href="/intake"
          className="inline-flex mt-8 items-center gap-2 rounded-full px-6 py-3 font-semibold text-sm transition-transform hover:-translate-y-0.5"
          style={{ background: P.brand, color: P.bg }}
        >
          Vind jouw schema →
        </Link>
      </section>

      {/* Grid */}
      {products.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-12 text-center mb-20"
          style={{ borderColor: P.lineStrong, color: P.inkMuted }}
        >
          <p className="font-medium">Nog geen gepubliceerde programma&apos;s.</p>
          <p className="mt-1 text-sm" style={{ color: P.inkDim }}>
            Maak en publiceer producten via{' '}
            <Link href="/admin/shop" className="underline" style={{ color: P.brand }}>
              Admin → Shop
            </Link>
            .
          </p>
        </div>
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-10">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/programma/${product.slug}`}
              className="group rounded-2xl overflow-hidden border flex flex-col transition-all hover:-translate-y-0.5"
              style={{ borderColor: P.line, background: P.surface }}
            >
              <div
                className="aspect-[16/10] relative"
                style={{
                  background: product.heroImageUrl
                    ? `center / cover no-repeat url(${product.heroImageUrl})`
                    : heroGradient(product.slug),
                }}
              >
                {!product.heroImageUrl && (
                  <span
                    className="absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.22em]"
                    style={{ color: 'rgba(212,232,230,0.42)' }}
                  >
                    MBT·Gym
                  </span>
                )}
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {product.kind !== 'PROGRAM' && <Badge>{KIND_LABELS[product.kind]}</Badge>}
                  {product.level && <Badge>{LEVEL_LABELS[product.level]}</Badge>}
                  {product.durationWeeks ? <Badge>{product.durationWeeks} weken</Badge> : null}
                </div>
                <h3 className="font-semibold text-lg leading-snug">{product.name}</h3>
                {product.tagline && (
                  <p className="mt-1 text-sm" style={{ color: P.inkMuted }}>
                    {product.tagline}
                  </p>
                )}
                <div
                  className="mt-4 pt-4 border-t flex items-center justify-between"
                  style={{ borderColor: P.line }}
                >
                  <span className="font-bold">
                    {formatPriceCents(product.priceCents, product.currency)}
                  </span>
                  <span
                    className="text-sm font-medium transition-transform group-hover:translate-x-0.5"
                    style={{ color: P.brand }}
                  >
                    Bekijk →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
