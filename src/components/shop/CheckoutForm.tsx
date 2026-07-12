'use client'

/**
 * Checkout op de productpagina — alleen voor ingelogde kopers. Naam en e-mail
 * komen uit het account (server-side), dus die worden hier niet meer gevraagd.
 * Bij een fysiek artikel vult de koper een verzendadres in. De mutatie maakt een
 * Mollie-betaling en stuurt door naar de iDEAL-checkout.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, DarkInput } from '@/components/dark-ui'
import { P } from '@/lib/shop/palette'

export function CheckoutForm({
  slug,
  requiresShipping,
}: {
  slug: string
  requiresShipping: boolean
}) {
  const [address, setAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [optIn, setOptIn] = useState(false)

  const checkout = trpc.shop.checkout.useMutation({
    onSuccess: (data) => {
      // Door naar de Mollie iDEAL-checkout.
      window.location.href = data.checkoutUrl
    },
    onError: (e) => toast.error(e.message),
  })

  function submit() {
    if (requiresShipping && (!address.trim() || !postalCode.trim() || !city.trim())) {
      return toast.error('Vul je verzendadres in')
    }
    checkout.mutate({
      slug,
      marketingOptIn: optIn,
      shipping: requiresShipping
        ? { address: address.trim(), postalCode: postalCode.trim(), city: city.trim(), country: 'NL' }
        : undefined,
    })
  }

  const busy = checkout.isPending || checkout.isSuccess

  return (
    <div className="mt-5 space-y-3">
      {requiresShipping && (
        <>
          <DarkInput
            placeholder="Straat en huisnummer"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <DarkInput
              placeholder="Postcode"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
            <DarkInput placeholder="Plaats" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </>
      )}

      <label className="flex items-start gap-2 text-xs" style={{ color: P.inkDim }}>
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="mt-0.5"
        />
        <span>Houd me op de hoogte van nieuwe schema&apos;s en tips (optioneel).</span>
      </label>

      <DarkButton onClick={submit} loading={busy} className="w-full">
        Afrekenen met iDEAL
      </DarkButton>
      <p className="text-center text-xs" style={{ color: P.inkDim }}>
        Je rekent veilig af via Mollie. Na betaling krijg je direct een bevestiging en de factuur per
        e-mail.
      </p>
    </div>
  )
}
