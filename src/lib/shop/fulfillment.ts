import 'server-only'
import type { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPayment, type MolliePaymentStatus } from '@/lib/shop/mollie'
import { nextInvoiceNumber } from '@/lib/shop/invoice/number'
import { sendOrderEmails, sendBookkeepingCopy, type OrderForEmail } from '@/lib/shop/email/order-emails'

const orderInclude = {
  customer: true,
  items: { include: { product: { select: { kind: true, vatRate: true, requiresShipping: true } } } },
} as const

function mapStatus(s: MolliePaymentStatus): OrderStatus | null {
  switch (s) {
    case 'paid':
      return 'PAID'
    case 'canceled':
      return 'CANCELED'
    case 'expired':
      return 'EXPIRED'
    case 'failed':
      return 'FAILED'
    default:
      return null // open/pending/authorized → nog niets te doen
  }
}

type OrderWithRels = Awaited<ReturnType<typeof loadOrder>>

async function loadOrder(orderId: string) {
  return prisma.shopOrder.findUnique({ where: { id: orderId }, include: orderInclude })
}

function toEmailModel(order: NonNullable<OrderWithRels>): OrderForEmail {
  const hasAddress = !!(order.shippingAddress || order.shippingCity)
  return {
    email: order.email,
    buyerName: order.buyerName ?? order.customer?.name ?? null,
    invoiceNumber: order.invoiceNumber,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    amountCents: order.amountCents,
    shippingCents: order.shippingCents,
    buyerAddress: hasAddress
      ? {
          street: order.shippingAddress ?? undefined,
          postalCode: order.shippingPostalCode ?? undefined,
          city: order.shippingCity ?? undefined,
          country: order.shippingCountry ?? undefined,
        }
      : undefined,
    items: order.items.map((it) => ({
      nameSnapshot: it.nameSnapshot,
      priceCents: it.priceCents,
      kind: it.product.kind,
      quantity: it.quantity,
      vatRate: it.product.vatRate,
    })),
  }
}

/**
 * Brengt een order in lijn met de werkelijke Mollie-status. Idempotent: een
 * order wordt maar één keer op PAID gezet (met factuurnummer, toegangsrechten
 * en e-mails). Wordt aangeroepen door de webhook én door de bedankt-pagina, en
 * is veilig om vaker te draaien.
 */
export async function syncOrderWithMollie(orderId: string): Promise<OrderStatus> {
  const order = await loadOrder(orderId)
  if (!order) throw new Error('order_not_found')
  if (order.status === 'PAID') return 'PAID'
  if (!order.molliePaymentId) return order.status

  const payment = await getPayment(order.molliePaymentId)
  const mapped = mapStatus(payment.status)
  if (!mapped || mapped === order.status) return order.status

  if (mapped !== 'PAID') {
    // Mislukt/geannuleerd/verlopen: status bijwerken, verder niets.
    await prisma.shopOrder.update({ where: { id: order.id }, data: { status: mapped } })
    return mapped
  }

  // Betaald: in één transactie afronden (status + factuurnummer + toegang).
  const needsShipping = order.items.some(
    (it) => it.product.kind === 'PHYSICAL' || it.product.requiresShipping,
  )
  await prisma.$transaction(async (tx) => {
    // Dubbele afhandeling voorkomen (race met de webhook).
    const fresh = await tx.shopOrder.findUnique({ where: { id: order.id }, select: { status: true } })
    if (fresh?.status === 'PAID') return

    const invoiceNumber = order.invoiceNumber ?? (await nextInvoiceNumber(tx))
    await tx.shopOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        invoiceNumber,
        invoicedAt: new Date(),
        fulfillmentStatus: needsShipping ? 'PENDING' : 'NONE',
      },
    })

    // Toegangsrecht voor digitale producten (schema's).
    for (const it of order.items) {
      if (it.product.kind !== 'PROGRAM') continue
      await tx.shopEntitlement.upsert({
        where: { customerId_productId: { customerId: order.customerId, productId: it.productId } },
        create: { customerId: order.customerId, productId: it.productId, orderId: order.id },
        update: { orderId: order.id, revokedAt: null },
      })
    }

    // Voorraad afboeken voor fysieke artikelen waarvan de voorraad wordt
    // bijgehouden (stockQty null = niet bijgehouden, dan niets doen).
    for (const it of order.items) {
      if (it.product.kind !== 'PHYSICAL') continue
      await tx.shopProduct.updateMany({
        where: { id: it.productId, stockQty: { not: null } },
        data: { stockQty: { decrement: it.quantity } },
      })
      // Niet onder nul laten zakken (race tussen twee gelijktijdige betalingen).
      await tx.shopProduct.updateMany({
        where: { id: it.productId, stockQty: { lt: 0 } },
        data: { stockQty: 0 },
      })
    }
  })

  // E-mails buiten de transactie (best-effort, nooit hard falen).
  const updated = await loadOrder(order.id)
  if (updated) {
    const model = toEmailModel(updated)
    try {
      await sendOrderEmails(model)
      await sendBookkeepingCopy(model)
    } catch {
      // Logging gebeurt elders; de betaling is al verwerkt.
    }
  }

  return 'PAID'
}

/** Variant voor de webhook: vind de order op basis van het Mollie payment-id. */
export async function syncOrderByPaymentId(paymentId: string): Promise<OrderStatus | null> {
  const order = await prisma.shopOrder.findUnique({
    where: { molliePaymentId: paymentId },
    select: { id: true },
  })
  if (!order) return null
  return syncOrderWithMollie(order.id)
}
