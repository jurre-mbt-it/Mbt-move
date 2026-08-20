import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/auth/require-role'
import { SHOP_BRAND } from '@/lib/shop/brand'
import { P } from '@/lib/shop/palette'
import { heroGradient } from '@/lib/shop/gradient'
import { LEVEL_LABELS } from '@/lib/shop/labels'

export const dynamic = 'force-dynamic'
export const metadata = { title: "Mijn programma's" }

export default async function MyProgramsPage() {
  const user = await getServerUser()

  // Niet ingelogd: kopen en bezitten kan alleen met account.
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Mijn programma&apos;s</h1>
        <p className="mt-2 mb-8" style={{ color: P.inkMuted }}>
          Log in om je aangeschafte programma&apos;s te bekijken.
        </p>
        <Link
          href="/login?next=/mijn-programmas"
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-sm transition-transform hover:-translate-y-0.5"
          style={{ background: P.brand, color: P.bg }}
        >
          Inloggen
        </Link>
      </div>
    )
  }

  // Aankopen van deze gebruiker (match op accountmail), alleen met een schema.
  const entitlements = await prisma.shopEntitlement.findMany({
    where: {
      revokedAt: null,
      customer: { email: user.email.toLowerCase() },
      product: { kind: 'PROGRAM', programId: { not: null }, status: { not: 'ARCHIVED' } },
    },
    orderBy: { grantedAt: 'desc' },
    include: {
      product: {
        select: { slug: true, name: true, level: true, durationWeeks: true, heroImageUrl: true },
      },
    },
  })

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-2" style={{ color: P.brand }}>
        Mijn programma&apos;s
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Aan de slag</h1>
      <p className="mt-2 mb-8" style={{ color: P.inkMuted }}>
        De programma&apos;s die je hebt aangeschaft. Je volgt ze op je eigen tempo, op web en mobiel.
      </p>

      {entitlements.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-12 text-center"
          style={{ borderColor: P.lineStrong, color: P.inkMuted }}
        >
          Je hebt nog geen programma&apos;s. Bekijk de{' '}
          <Link href="/shop" className="underline" style={{ color: P.brand }}>
            programma&apos;s in de shop
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {entitlements.map((e) => (
            <Link
              key={e.id}
              href={`/mijn-programmas/${e.product.slug}`}
              className="group rounded-2xl overflow-hidden border flex flex-col transition-all hover:-translate-y-0.5"
              style={{ borderColor: P.line, background: P.surface }}
            >
              <div
                className="aspect-[16/9] relative"
                style={{
                  background: e.product.heroImageUrl
                    ? `center / cover no-repeat url(${e.product.heroImageUrl})`
                    : heroGradient(e.product.slug),
                }}
              >
                <span
                  className="absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: 'rgba(212,232,230,0.42)' }}
                >
                  {SHOP_BRAND.short}
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1.5">
                  {e.product.level && (
                    <span className="text-[11px] font-semibold" style={{ color: P.brand }}>
                      {LEVEL_LABELS[e.product.level] ?? e.product.level}
                    </span>
                  )}
                  {e.product.durationWeeks ? (
                    <span className="text-[11px]" style={{ color: P.inkDim }}>
                      · {e.product.durationWeeks} weken
                    </span>
                  ) : null}
                </div>
                <h3 className="font-semibold text-lg">{e.product.name}</h3>
                <span
                  className="mt-3 inline-block text-sm font-medium transition-transform group-hover:translate-x-0.5"
                  style={{ color: P.brand }}
                >
                  Open programma →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
