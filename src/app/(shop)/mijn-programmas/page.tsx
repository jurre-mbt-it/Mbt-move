import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { P } from '@/lib/shop/palette'
import { heroGradient } from '@/lib/shop/gradient'
import { LEVEL_LABELS } from '@/lib/shop/labels'

export const dynamic = 'force-dynamic'
export const metadata = { title: "Mijn programma's" }

export default async function MyProgramsPage() {
  // Preview: producten met een gekoppeld schema gelden als "in bezit".
  // In productie wordt dit de lijst met programma's die de ingelogde koper heeft.
  const products = await prisma.shopProduct.findMany({
    where: { programId: { not: null }, status: { not: 'ARCHIVED' } },
    orderBy: [{ sortOrder: 'asc' }],
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

      {products.length === 0 ? (
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
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/mijn-programmas/${p.slug}`}
              className="group rounded-2xl overflow-hidden border flex flex-col transition-all hover:-translate-y-0.5"
              style={{ borderColor: P.line, background: P.surface }}
            >
              <div
                className="aspect-[16/9] relative"
                style={{
                  background: p.heroImageUrl
                    ? `center / cover no-repeat url(${p.heroImageUrl})`
                    : heroGradient(p.slug),
                }}
              >
                <span
                  className="absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: 'rgba(255,255,255,0.42)' }}
                >
                  MBT·Gym
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-1.5">
                  {p.level && (
                    <span className="text-[11px] font-semibold" style={{ color: P.brand }}>
                      {LEVEL_LABELS[p.level] ?? p.level}
                    </span>
                  )}
                  {p.durationWeeks ? (
                    <span className="text-[11px]" style={{ color: P.inkDim }}>
                      · {p.durationWeeks} weken
                    </span>
                  ) : null}
                </div>
                <h3 className="font-semibold text-lg">{p.name}</h3>
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
