'use client'

/**
 * Bedankt-/statuspagina na de Mollie-checkout. Mollie stuurt de koper hierheen
 * terug met ?order=<id>. We pollen de orderstatus; die query synct ook met
 * Mollie, zodat de order ook zonder webhook (bv. lokaal) wordt afgerond.
 */
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { P } from '@/lib/shop/palette'

function Bedankt() {
  const orderId = useSearchParams().get('order') ?? ''

  const { data } = trpc.shop.orderStatus.useQuery(
    { orderId },
    {
      enabled: !!orderId,
      // Blijven pollen zolang de betaling nog niet rond is.
      refetchInterval: (q) => {
        const s = (q.state.data as { status?: string } | undefined)?.status
        return !s || s === 'PENDING' ? 2000 : false
      },
    },
  )

  if (!orderId) {
    return <Centered title="Geen bestelling gevonden" body="Er is geen bestelling meegegeven." />
  }

  const status = data?.status

  if (status === 'PAID') {
    return (
      <Centered
        title="Gelukt, bedankt!"
        body={
          <>
            Je betaling is gelukt. We hebben je een bevestiging en de factuur
            {data?.invoiceNumber ? ` (${data.invoiceNumber})` : ''} gemaild.
            {data && data.productNames.length > 0 ? (
              <>
                {' '}
                Je aankoop: <strong style={{ color: P.ink }}>{data.productNames.join(', ')}</strong>.
              </>
            ) : null}
          </>
        }
        cta={{ href: '/mijn-programmas', label: 'Naar mijn programma’s →' }}
      />
    )
  }

  if (status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELED') {
    return (
      <Centered
        title="Betaling niet voltooid"
        body="Je betaling is niet afgerond. Er is niets afgeschreven. Je kunt het opnieuw proberen."
        cta={{ href: '/shop', label: 'Terug naar de shop' }}
      />
    )
  }

  return (
    <Centered
      title="Even geduld"
      body="We bevestigen je betaling. Dit duurt meestal maar een paar seconden."
    />
  )
}

function Centered({
  title,
  body,
  cta,
}: {
  title: string
  body: React.ReactNode
  cta?: { href: string; label: string }
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-5 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-4 text-base" style={{ color: P.inkMuted }}>
        {body}
      </p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          style={{ background: P.brand, color: P.bg }}
        >
          {cta.label}
        </Link>
      )}
    </div>
  )
}

export default function BedanktPage() {
  return (
    <Suspense fallback={null}>
      <Bedankt />
    </Suspense>
  )
}
