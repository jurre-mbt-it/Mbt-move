import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { renderInvoicePdf } from '@/lib/shop/invoice/render'
import { invoiceDataFromOrder } from '@/lib/shop/email/order-emails'

/**
 * Factuur-PDF voor een order. Admin-only (preview). TODO productie: de koper
 * mag z'n eigen factuur ook downloaden (entitlement-check op ShopCustomer).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // Identiteit op supabaseUserId, niet op e-mailadres. Een e-mail-lookup zou
  // een ongebonden ADMIN-rij aan iedereen geven die zich met dat adres
  // registreert (audit 2026-07-27, H2).
  const caller = await prisma.user.findUnique({
    where: { supabaseUserId: user.id },
    select: { role: true },
  })
  if (caller?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const order = await prisma.shopOrder.findUnique({
    where: { id: orderId },
    include: { items: { select: { nameSnapshot: true, priceCents: true } } },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pdf = await renderInvoicePdf(
    invoiceDataFromOrder({
      email: order.email,
      buyerName: order.buyerName,
      invoiceNumber: order.invoiceNumber,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      amountCents: order.amountCents,
      items: order.items,
    }),
  )

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factuur-${order.invoiceNumber ?? 'concept'}.pdf"`,
    },
  })
}
