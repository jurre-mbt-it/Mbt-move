import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isShopPublic } from '@/lib/shop/access'

/**
 * Publieke catalogus-feed: GET /api/shop/catalog.json
 *
 * Single source of truth voor de externe oppervlakken. De mobiele app
 * (mbt-gym-mobile) en de statische website (movementbasedtherapy.nl / mbt-forest)
 * lezen deze read-only feed en linken naar `url` (de webcheckout op mbt-gym.nl).
 * Zo verkoopt alleen het web en tonen app + site alleen — geen Apple/Google
 * in-app-commissie.
 *
 * Achter dezelfde gate als de storefront: tot de launch (SHOP_PUBLIC uit) geeft
 * de feed een lege lijst terug, zodat concept-producten niet uitlekken. CORS is
 * open omdat het puur publieke, gepubliceerde catalogusdata is.
 */
export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mbt-gym.nl').replace(/\/$/, '')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  // Tot de launch niets prijsgeven (storefront-gate).
  if (!isShopPublic()) {
    return NextResponse.json({ products: [], updatedAt: null }, { headers: CORS })
  }

  const products = await prisma.shopProduct.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      slug: true,
      name: true,
      kind: true,
      tagline: true,
      description: true,
      priceCents: true,
      currency: true,
      vatRate: true,
      level: true,
      durationWeeks: true,
      bodyRegion: true,
      heroImageUrl: true,
      highlights: true,
      requiresShipping: true,
      stockQty: true,
      bookingUrl: true,
      updatedAt: true,
    },
  })

  const updatedAt = products.reduce<Date | null>(
    (max, p) => (max === null || p.updatedAt > max ? p.updatedAt : max),
    null,
  )

  return NextResponse.json(
    {
      updatedAt: updatedAt?.toISOString() ?? null,
      products: products.map((p) => ({
        slug: p.slug,
        name: p.name,
        kind: p.kind,
        tagline: p.tagline,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        vatRate: p.vatRate,
        level: p.level,
        durationWeeks: p.durationWeeks,
        bodyRegion: p.bodyRegion,
        heroImageUrl: p.heroImageUrl,
        highlights: p.highlights,
        // Alleen de in-/uit-voorraad-vlag publiceren, niet het exacte aantal.
        inStock: p.stockQty === null ? null : p.stockQty > 0,
        requiresShipping: p.requiresShipping,
        bookingUrl: p.bookingUrl,
        // Canonieke webpagina/checkout — externe surfaces hoeven de interne
        // routenaam niet te kennen.
        url: `${SITE_URL}/programma/${p.slug}`,
      })),
    },
    { headers: CORS },
  )
}
