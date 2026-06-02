import { NextRequest, NextResponse } from 'next/server'
import { syncOrderByPaymentId } from '@/lib/shop/fulfillment'

/**
 * Mollie-webhook. Mollie POST't hier (form-encoded) het payment-id zodra de
 * status wijzigt. We halen zelf de actuele status op (nooit vertrouwen op de
 * inhoud van de POST) en handelen de order af: betaald → factuur + e-mails.
 *
 * Altijd snel 200 teruggeven bij een verwerkte of onbekende betaling, zodat
 * Mollie niet blijft herproberen. Alleen bij een echte serverfout 500 (dan
 * herprobeert Mollie later).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let paymentId: string | null = null
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    paymentId = params.get('id')
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (!paymentId) return NextResponse.json({ ok: false }, { status: 400 })

  try {
    await syncOrderByPaymentId(paymentId)
    return NextResponse.json({ ok: true })
  } catch {
    // Onverwachte fout (bv. Mollie tijdelijk onbereikbaar): laat Mollie herproberen.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
