/** Rendert een voorbeeld-factuur naar sample-factuur.pdf om het ontwerp te bekijken. */
import { writeFileSync } from 'fs'
import { renderInvoicePdf } from '../src/lib/shop/invoice/render'

async function main() {
  const pdf = await renderInvoicePdf({
    invoiceNumber: '2026-0007',
    dateLabel: '14 mei 2026',
    buyerName: 'Sanne de Vries',
    buyerEmail: 'demo.koper1@example.com',
    items: [{ name: 'Hardloop Krachtschema (Beginner)', priceCents: 2995 }],
    vatRate: 21,
  })
  writeFileSync('sample-factuur.pdf', pdf)
  console.log('geschreven: sample-factuur.pdf,', pdf.length, 'bytes')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
