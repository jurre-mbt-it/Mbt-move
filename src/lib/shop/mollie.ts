import 'server-only'

/**
 * Dunne wrapper rond de Mollie REST-API (v2). Geen SDK-dependency: we praten
 * direct met de API via fetch. Werkt met zowel test- (`test_...`) als live-keys
 * (`live_...`) in `MOLLIE_API_KEY`; de key bepaalt de modus, niet de code.
 *
 * Bedragen gaan als string met 2 decimalen ("29.95"), zoals Mollie vereist.
 */

const MOLLIE_API = 'https://api.mollie.com/v2'

export function isMollieConfigured(): boolean {
  return !!process.env.MOLLIE_API_KEY
}

export function isMollieTestMode(): boolean {
  return (process.env.MOLLIE_API_KEY ?? '').startsWith('test_')
}

function apiKey(): string {
  const key = process.env.MOLLIE_API_KEY
  if (!key) throw new Error('MOLLIE_API_KEY ontbreekt')
  return key
}

/** Centen → Mollie-bedragstring, bv 2995 → "29.95". */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

export type MolliePaymentStatus =
  | 'open'
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'canceled'
  | 'expired'
  | 'failed'

export type MolliePayment = {
  id: string
  status: MolliePaymentStatus
  amount: { value: string; currency: string }
  method: string | null
  metadata: Record<string, unknown> | null
  _links: { checkout?: { href: string } }
}

async function mollieFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${MOLLIE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => null)) as { detail?: string } | null
  if (!res.ok) {
    throw new Error(`Mollie ${res.status}: ${body?.detail ?? 'onbekende fout'}`)
  }
  return body
}

/**
 * Maakt een betaling aan en geeft o.a. de checkout-URL terug waar de klant
 * iDEAL kiest en betaalt.
 */
export async function createPayment(input: {
  amountCents: number
  currency?: string
  description: string
  redirectUrl: string
  webhookUrl?: string // weglaten in dev (Mollie weigert localhost-webhooks)
  metadata: Record<string, unknown>
}): Promise<MolliePayment> {
  return (await mollieFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { currency: input.currency ?? 'EUR', value: centsToAmount(input.amountCents) },
      description: input.description,
      redirectUrl: input.redirectUrl,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      metadata: input.metadata,
    }),
  })) as MolliePayment
}

/** Haalt de actuele status van een betaling op (gebruikt in de webhook). */
export async function getPayment(id: string): Promise<MolliePayment> {
  return (await mollieFetch(`/payments/${encodeURIComponent(id)}`)) as MolliePayment
}
