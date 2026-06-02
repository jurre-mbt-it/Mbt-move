/**
 * PREVIEW-demo: koppelt therapeuten aan producten en maakt betaalde demo-orders
 * over de afgelopen 6 maanden, zodat het verkoop-/omzetdashboard echte cijfers
 * toont. Idempotent: verwijdert eerst eerdere demo-orders (molliePaymentId
 * begint met 'demo_'). Verwijderen kan later met hetzelfde filter.
 *
 * Draaien:  npx tsx scripts/seed-demo-orders.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

function createPrisma() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!url || url.includes('localhost')) return new PrismaClient()
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const prisma = createPrisma()

// Vaste "vandaag" voor reproduceerbaarheid (sessiecontext: 2026-05-31).
const TODAY = { year: 2026, month: 5 } // month = 1-based

function lastMonths(n: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = []
  let y = TODAY.year
  let m = TODAY.month
  for (let i = 0; i < n; i++) {
    out.unshift({ year: y, month: m })
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

const BUYERS = [
  { email: 'demo.koper1@example.com', name: 'Sanne de Vries' },
  { email: 'demo.koper2@example.com', name: 'Tom Jansen' },
  { email: 'demo.koper3@example.com', name: 'Lisa Bakker' },
  { email: 'demo.koper4@example.com', name: 'Mark Visser' },
]

async function main() {
  const products = await prisma.shopProduct.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { sortOrder: 'asc' },
  })
  if (products.length === 0) throw new Error('geen producten')

  const therapists = await prisma.user.findMany({
    where: { role: { in: ['THERAPIST', 'ADMIN'] } },
    select: { id: true, name: true, firstName: true },
    take: 3,
  })

  // Therapeuten round-robin koppelen; laat het laatste product bewust zonder.
  if (therapists.length > 0) {
    for (let i = 0; i < products.length - 1; i++) {
      const t = therapists[i % therapists.length]
      await prisma.shopProduct.update({ where: { id: products[i].id }, data: { therapistId: t.id } })
    }
    console.log(`Therapeuten gekoppeld aan ${products.length - 1} producten (${therapists.length} therapeut(en)).`)
  }

  // Demo-kopers upserten.
  const customers = []
  for (const b of BUYERS) {
    const c = await prisma.shopCustomer.upsert({
      where: { email: b.email },
      update: { name: b.name },
      create: { email: b.email, name: b.name },
    })
    customers.push(c)
  }

  // Oude demo-orders weg (items cascaden mee).
  await prisma.shopOrder.deleteMany({ where: { molliePaymentId: { startsWith: 'demo_' } } })

  const months = lastMonths(6)
  let seq = 0
  let totalCents = 0

  for (let mi = 0; mi < months.length; mi++) {
    const { year, month } = months[mi]
    const nOrders = 2 + mi // oplopend volume
    for (let k = 0; k < nOrders; k++) {
      const product = products[Math.floor(Math.random() * products.length)]
      const buyer = customers[Math.floor(Math.random() * customers.length)]
      const day = 1 + Math.floor(Math.random() * 26)
      const when = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
      seq += 1
      const invoiceNumber = `${year}-${String(seq).padStart(4, '0')}`

      await prisma.shopOrder.create({
        data: {
          customerId: buyer.id,
          email: buyer.email,
          buyerName: buyer.name,
          status: 'PAID',
          amountCents: product.priceCents,
          currency: 'EUR',
          molliePaymentId: `demo_${invoiceNumber}`,
          invoiceNumber,
          invoicedAt: when,
          paidAt: when,
          createdAt: when,
          items: {
            create: [
              { productId: product.id, priceCents: product.priceCents, nameSnapshot: product.name },
            ],
          },
        },
      })
      totalCents += product.priceCents
    }
  }

  console.log(`OK ${seq} demo-orders aangemaakt, totaal ${(totalCents / 100).toFixed(2)} omzet over 6 maanden.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
