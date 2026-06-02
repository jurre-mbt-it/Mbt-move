/**
 * Stuurt één TESTFACTUUR (PDF + UBL) naar de boekhoud-mailbox (BOOKKEEPING_EMAIL,
 * = Basecone-inbox) om te controleren of de koppeling werkt. Duidelijk gelabeld
 * als TEST zodat 'ie in Basecone makkelijk te herkennen/verwijderen is.
 *
 * Draaien:  npx tsx scripts/send-test-bookkeeping.ts
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { sendBookkeepingCopy, type OrderForEmail } from '../src/lib/shop/email/order-emails'

async function main() {
  const to = process.env.BOOKKEEPING_EMAIL
  console.log('BOOKKEEPING_EMAIL:', to ?? '(ontbreekt!)')
  console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'aanwezig' : '(ontbreekt!)')

  const now = new Date()
  const testOrder: OrderForEmail = {
    email: 'test@movementbasedtherapy.nl',
    buyerName: 'TEST - controle Basecone-koppeling',
    invoiceNumber: 'TEST-0002',
    paidAt: now,
    createdAt: now,
    amountCents: 2995,
    items: [
      {
        nameSnapshot: 'TESTFACTUUR - controle koppeling (mag weg)',
        priceCents: 2995,
        kind: 'PROGRAM',
        quantity: 1,
        vatRate: 21,
      },
    ],
  }

  const res = await sendBookkeepingCopy(testOrder)
  console.log('Resultaat:', res)
  if (!res.sent) {
    console.error('Niet verzonden. Reden:', res.reason ?? 'onbekend')
    process.exit(1)
  }
  console.log('Verzonden naar', to)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
