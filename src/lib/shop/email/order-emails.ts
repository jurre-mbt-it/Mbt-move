import { renderInvoicePdf, type InvoiceData, type InvoiceKind } from '@/lib/shop/invoice/render'
import { renderInvoiceUbl } from '@/lib/shop/invoice/ubl'
import { getAppUrl } from '@/lib/app-url'
import { INVOICE_COMPANY } from '@/lib/shop/invoice/company'

export type OrderEmailItem = {
  nameSnapshot: string
  priceCents: number
  kind?: InvoiceKind
  quantity?: number
  vatRate?: number
}

export type OrderForEmail = {
  email: string
  buyerName: string | null
  invoiceNumber: string | null
  paidAt: Date | null
  createdAt: Date
  amountCents: number
  items: OrderEmailItem[]
  shippingCents?: number
  buyerAddress?: { street?: string; postalCode?: string; city?: string; country?: string }
}

const BRAND = {
  bg: '#0E2729',
  surface: '#15363A',
  surfaceHi: '#1C4448',
  ink: '#F5F2ED',
  inkMuted: '#9EB5B3',
  brand: '#E87A55',
  line: 'rgba(212,232,230,0.20)',
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function shell(opts: { heading: string; bodyHtml: string; ctaUrl?: string; ctaLabel?: string }): string {
  const cta = opts.ctaUrl
    ? `<tr><td style="padding:24px 28px 0 28px;">
         <a href="${opts.ctaUrl}" style="display:block;background:${BRAND.brand};color:${BRAND.bg};text-decoration:none;text-align:center;padding:16px 24px;border-radius:12px;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">${opts.ctaLabel ?? 'OPENEN'}</a>
       </td></tr>`
    : ''
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>MBT·Gym</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:20px;overflow:hidden;">
      <tr><td style="padding:28px 28px 12px 28px;"><div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:11px;letter-spacing:0.2em;color:${BRAND.brand};font-weight:900;">● MBT · GYM</div></td></tr>
      <tr><td style="padding:8px 28px 0 28px;"><h1 style="margin:0;padding:4px 0 0 0;font-size:28px;line-height:34px;font-weight:900;letter-spacing:-1px;color:${BRAND.ink};text-transform:uppercase;">${opts.heading}</h1></td></tr>
      <tr><td style="padding:14px 28px 0 28px;color:${BRAND.inkMuted};font-size:15px;line-height:22px;">${opts.bodyHtml}</td></tr>
      ${cta}
      <tr><td style="padding:24px 28px 28px 28px;border-top:1px solid ${BRAND.line};margin-top:20px;"><div style="font-family:ui-monospace,Menlo,'SF Mono',monospace;font-size:10px;letter-spacing:0.14em;color:${BRAND.inkMuted};text-transform:uppercase;font-weight:700;">MOVEMENT BASED THERAPY · movementbasedtherapy.nl</div></td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

export function buildConfirmationEmail(order: OrderForEmail): { subject: string; html: string } {
  const first = escapeHtml((order.buyerName ?? '').split(' ')[0] || 'sporter')
  const names = order.items.map((i) => escapeHtml(i.nameSnapshot)).join(', ')
  const rawNames = order.items.map((i) => i.nameSnapshot).join(', ')
  const hasProgram = order.items.some((i) => i.kind === 'PROGRAM')

  // Fysiek artikel / dienst zonder programma: geen "programma staat klaar" en
  // geen login-CTA. De koper neemt het artikel mee uit de praktijk.
  if (!hasProgram) {
    return {
      subject: `Bedankt voor je bestelling · ${rawNames}`,
      html: shell({
        heading: `Hallo ${first}`,
        bodyHtml: `Bedankt voor je aankoop van <strong style="color:${BRAND.ink};">${names}</strong>. Je neemt 'm mee uit onze praktijk. De factuur ontvang je apart per e-mail.`,
      }),
    }
  }

  return {
    subject: `Je programma staat klaar · ${rawNames}`,
    html: shell({
      heading: `Hallo ${first}`,
      bodyHtml: `Bedankt voor je aankoop. Je programma <strong style="color:${BRAND.ink};">${names}</strong> staat voor je klaar. Log in om aan de slag te gaan; je volgt het op je eigen tempo, op web en mobiel.`,
      ctaUrl: `${getAppUrl()}/mijn-programmas`,
      ctaLabel: 'Programma openen →',
    }),
  }
}

export function buildInvoiceEmail(order: OrderForEmail): { subject: string; html: string } {
  const first = escapeHtml((order.buyerName ?? '').split(' ')[0] || 'sporter')
  const num = escapeHtml(order.invoiceNumber ?? '')
  const subject = `Je factuur van MBT Gym · ${order.invoiceNumber ?? ''}`
  const html = shell({
    heading: 'Je factuur',
    bodyHtml: `Hoi ${first}, in de bijlage vind je de factuur (${num}) voor je aankoop. Bewaar 'm voor je eigen administratie. Veel succes met trainen!`,
  })
  return { subject, html }
}

export function invoiceDataFromOrder(order: OrderForEmail): InvoiceData {
  const when = order.paidAt ?? order.createdAt
  return {
    invoiceNumber: order.invoiceNumber ?? 'CONCEPT',
    dateLabel: dateLabel(when),
    isoDate: when.toISOString().slice(0, 10),
    buyerName: order.buyerName ?? order.email,
    buyerEmail: order.email,
    buyerAddress: order.buyerAddress,
    items: order.items.map((i) => ({
      name: i.nameSnapshot,
      priceCents: i.priceCents,
      kind: i.kind,
      quantity: i.quantity,
      vatRate: i.vatRate,
    })),
    vatRate: INVOICE_COMPANY.defaultVatRate,
    shippingCents: order.shippingCents,
  }
}

async function resendSend(payload: Record<string, unknown>): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const from = process.env.RESEND_FROM ?? process.env.RESEND_FROM_EMAIL ?? 'MBT Gym <noreply@mbt-gym.nl>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, ...payload }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Verstuurt twee e-mails na een aankoop: (1) bevestiging met het programma,
 * (2) een factuur-e-mail met de factuur-PDF als bijlage.
 * Geeft terug wat er gelukt is; faalt nooit hard (no_api_key → niet verstuurd).
 */
export async function sendOrderEmails(
  order: OrderForEmail,
): Promise<{ confirmation: boolean; invoice: boolean; reason?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { confirmation: false, invoice: false, reason: 'no_api_key' }
  }

  const confirm = buildConfirmationEmail(order)
  const confirmationOk = await resendSend({ to: order.email, subject: confirm.subject, html: confirm.html })

  const pdf = await renderInvoicePdf(invoiceDataFromOrder(order))
  const inv = buildInvoiceEmail(order)
  const invoiceOk = await resendSend({
    to: order.email,
    subject: inv.subject,
    html: inv.html,
    attachments: [
      { filename: `factuur-${order.invoiceNumber ?? 'concept'}.pdf`, content: pdf.toString('base64') },
    ],
  })

  return { confirmation: confirmationOk, invoice: invoiceOk }
}

/**
 * Stuurt een kopie van de factuur (PDF + UBL e-factuur) naar de boekhoud-mailbox
 * (`BOOKKEEPING_EMAIL`, bv. de Exact Online "Scan & Herken"-inbox of de
 * accountant). De UBL-bijlage laat Exact de regels automatisch herkennen.
 * Best-effort: faalt nooit hard.
 */
export async function sendBookkeepingCopy(
  order: OrderForEmail,
): Promise<{ sent: boolean; reason?: string }> {
  const to = process.env.BOOKKEEPING_EMAIL
  if (!to) return { sent: false, reason: 'no_bookkeeping_email' }
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'no_api_key' }

  const data = invoiceDataFromOrder(order)
  const num = order.invoiceNumber ?? 'concept'
  const pdf = await renderInvoicePdf(data)
  const ubl = renderInvoiceUbl(data)

  const ok = await resendSend({
    to,
    subject: `Verkoopfactuur ${num} · ${INVOICE_COMPANY.name}`,
    html: shell({
      heading: 'Verkoopfactuur',
      bodyHtml: `Automatische kopie voor de boekhouding. Factuur <strong style="color:${BRAND.ink};">${escapeHtml(num)}</strong>, totaal € ${(order.amountCents / 100).toFixed(2).replace('.', ',')}. PDF en UBL e-factuur zitten in de bijlage.`,
    }),
    attachments: [
      { filename: `factuur-${num}.pdf`, content: pdf.toString('base64') },
      { filename: `factuur-${num}.xml`, content: Buffer.from(ubl, 'utf8').toString('base64') },
    ],
  })

  return { sent: ok }
}
