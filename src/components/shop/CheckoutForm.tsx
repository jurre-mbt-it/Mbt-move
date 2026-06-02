'use client'

/**
 * Gast-checkout op de productpagina. Verzamelt naam/e-mail (en bij een fysiek
 * artikel het verzendadres), maakt via tRPC een Mollie-betaling aan en stuurt
 * de koper door naar de iDEAL-checkout.
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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
    if (!name.trim()) return toast.error('Vul je naam in')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return toast.error('Vul een geldig e-mailadres in')
    if (requiresShipping && (!address.trim() || !postalCode.trim() || !city.trim())) {
      return toast.error('Vul je verzendadres in')
    }
    checkout.mutate({
      slug,
      name: name.trim(),
      email: email.trim(),
      marketingOptIn: optIn,
      shipping: requiresShipping
        ? { address: address.trim(), postalCode: postalCode.trim(), city: city.trim(), country: 'NL' }
        : undefined,
    })
  }

  const busy = checkout.isPending || checkout.isSuccess

  return (
    <div className="mt-5 space-y-3">
      <DarkInput placeholder="Naam" value={name} onChange={(e) => setName(e.target.value)} />
      <DarkInput
        type="email"
        placeholder="E-mailadres"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
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
