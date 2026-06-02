import Link from 'next/link'
import { gateShopPreview } from '@/lib/shop/access'
import { P } from '@/lib/shop/palette'

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Pre-launch: alleen zichtbaar voor ingelogde admin (Jurre). Anders 404.
  const { isPreview } = await gateShopPreview()

  return (
    <div
      className="athletic-dark min-h-dvh flex flex-col"
      style={{ background: P.bg, color: P.ink }}
    >
      {isPreview && (
        <div
          className="w-full text-center text-[11px] font-semibold tracking-wide py-1.5 px-4"
          style={{ background: P.brand, color: P.bg }}
        >
          PREVIEW · alleen voor jou zichtbaar · de shop staat nog niet live
        </div>
      )}

      <header
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{ borderColor: P.line, background: 'rgba(10,14,15,0.82)' }}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between px-5 h-16">
          <Link href="/shop" className="font-bold tracking-tight text-lg">
            MBT<span style={{ color: P.brand }}>·</span>Gym
          </Link>
          <nav className="flex items-center gap-6 text-sm" style={{ color: P.inkMuted }}>
            <Link href="/shop" className="hover:text-white transition-colors">
              Programma&apos;s
            </Link>
            <Link href="/intake" className="hover:text-white transition-colors">
              Vind jouw schema
            </Link>
            <Link href="/mijn-programmas" className="hover:text-white transition-colors">
              Mijn programma&apos;s
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t mt-20" style={{ borderColor: P.line }}>
        <div className="mx-auto max-w-6xl px-5 py-10 text-xs leading-relaxed">
          <p className="mb-2 font-medium" style={{ color: P.inkMuted }}>
            MBT Gym · Movement Based Therapy, Amsterdam
          </p>
          <p style={{ color: P.inkDim }}>
            Onze programma&apos;s zijn educatieve trainings- en oefenprogramma&apos;s en vervangen
            geen individueel fysiotherapeutisch onderzoek, diagnose of behandeling. Twijfel je, of
            heb je klachten met alarmsignalen (hevige of nachtelijke pijn, uitstraling, krachtsverlies,
            recent trauma)? Raadpleeg een (sport)arts of fysiotherapeut.
          </p>
        </div>
      </footer>
    </div>
  )
}
