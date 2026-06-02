import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import { INVOICE_COMPANY } from './company'
import { MBT_LOGO_DATA_URI } from './logo'

export type InvoiceKind = 'PROGRAM' | 'PHYSICAL' | 'SERVICE'

export type InvoiceLine = {
  name: string
  kind?: InvoiceKind
  quantity?: number // default 1
  priceCents: number // STUKprijs incl. btw
  vatRate?: number // valt terug op InvoiceData.vatRate
}

export type InvoiceData = {
  invoiceNumber: string
  dateLabel: string
  isoDate?: string // YYYY-MM-DD, voor UBL (PDF gebruikt dateLabel)
  buyerName: string
  buyerEmail: string
  buyerAddress?: { street?: string; postalCode?: string; city?: string; country?: string }
  items: InvoiceLine[]
  vatRate: number // standaard/fallback btw-tarief
  shippingCents?: number // verzendkosten incl. btw (0 = geen)
  paymentMethodLabel?: string // bv "iDEAL"
  paid?: boolean // true = al voldaan (iDEAL); false = openstaand (14 dagen)
}

const KIND_CODE: Record<InvoiceKind, string> = {
  PROGRAM: 'SCHEMA',
  PHYSICAL: 'ARTIKEL',
  SERVICE: 'DIENST',
}

function euro(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function qtyLabel(q: number): string {
  return q.toFixed(2).replace('.', ',')
}

/** ISO-datum + 14 dagen → "DD-MM-JJJJ" (vervaldatum bij een openstaande factuur). */
function dueDateLabel(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + 14)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/** Splitst een incl-btw bedrag in netto (ex) en btw. */
function splitVat(inclCents: number, rate: number): { ex: number; vat: number } {
  const ex = Math.round(inclCents / (1 + rate / 100))
  return { ex, vat: inclCents - ex }
}

const BLUE = '#2E6DA4'
const INK = '#1F2933'
const MUTED = '#52606D'
const LINE = '#C9D2DC'

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 44, fontSize: 9.5, color: INK, fontFamily: 'Helvetica', lineHeight: 1.4 },
  row: { flexDirection: 'row' },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 52, height: 52 },
  companyBlock: { width: 270, borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: LINE, paddingVertical: 6 },
  cRow: { flexDirection: 'row', marginVertical: 0.5 },
  cLabel: { width: 64, textAlign: 'right', color: BLUE, marginRight: 10 },
  cValue: { flex: 1 },

  customer: { marginTop: 30 },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: MUTED },

  title: { fontSize: 19, color: BLUE, marginTop: 26 },

  meta: { flexDirection: 'row', marginTop: 12 },
  metaCol: { flex: 1 },
  mRow: { flexDirection: 'row', marginVertical: 1.5 },
  mLabel: { width: 110, color: BLUE },
  mValue: { flex: 1 },

  th: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingBottom: 6, marginTop: 28 },
  td: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: '#EEF1F4' },
  thText: { color: BLUE },
  cArtikel: { width: 70 },
  cOmschr: { flex: 1 },
  cAantal: { width: 60, textAlign: 'right' },
  cPrijs: { width: 80, textAlign: 'right' },
  cBedrag: { width: 80, textAlign: 'right' },

  totals: { width: 250, alignSelf: 'flex-end', marginTop: 18 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 0.75, borderTopColor: LINE },
  tLabelBlue: { color: BLUE },

  footer: { position: 'absolute', bottom: 38, left: 44, right: 44 },
  footerText: { textAlign: 'center', color: MUTED, fontSize: 8.5, lineHeight: 1.5 },
  pageNr: { position: 'absolute', right: 0, bottom: 0, color: MUTED, fontSize: 8 },
})

type ComputedLine = {
  code: string
  name: string
  qty: number
  unitEx: number
  lineEx: number
  rate: number
}

/** Reken alle regels door: per regel netto + btw per tarief gegroepeerd. */
export function computeInvoice(data: InvoiceData): {
  lines: ComputedLine[]
  subtotalEx: number
  vatByRate: Array<{ rate: number; amount: number }>
  total: number
} {
  const lines: ComputedLine[] = []
  const vatMap = new Map<number, number>()
  let subtotalEx = 0
  let total = 0

  const push = (name: string, code: string, qty: number, unitIncl: number, rate: number) => {
    const lineIncl = unitIncl * qty
    const { ex: lineEx, vat } = splitVat(lineIncl, rate)
    const { ex: unitEx } = splitVat(unitIncl, rate)
    lines.push({ code, name, qty, unitEx, lineEx, rate })
    subtotalEx += lineEx
    total += lineIncl
    vatMap.set(rate, (vatMap.get(rate) ?? 0) + vat)
  }

  for (const it of data.items) {
    const rate = it.vatRate ?? data.vatRate
    push(it.name, KIND_CODE[it.kind ?? 'PROGRAM'], it.quantity ?? 1, it.priceCents, rate)
  }
  if (data.shippingCents && data.shippingCents > 0) {
    push('Verzendkosten', 'VERZEND', 1, data.shippingCents, data.vatRate)
  }

  const vatByRate = [...vatMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, amount]) => ({ rate, amount }))

  return { lines, subtotalEx, vatByRate, total }
}

export function InvoiceDoc({ data }: { data: InvoiceData }) {
  const { lines, subtotalEx, vatByRate, total } = computeInvoice(data)
  const method = data.paymentMethodLabel ?? 'iDEAL'
  const paid = data.paid !== false // default: voldaan (shop = vooraf via iDEAL betaald)
  const due = dueDateLabel(data.isoDate)

  const company: Array<[string, string]> = [
    ['Naam:', INVOICE_COMPANY.name],
    ['Adres:', INVOICE_COMPANY.street],
    ['Plaats:', INVOICE_COMPANY.zipCity],
    ['Land:', INVOICE_COMPANY.country],
    ['E-mail:', INVOICE_COMPANY.email],
    ['IBAN:', INVOICE_COMPANY.iban],
    ['KvK:', INVOICE_COMPANY.kvk],
    ['Btw:', INVOICE_COMPANY.vatNumber],
  ]

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Logo linksboven, bedrijfsgegevens rechtsboven */}
        <View style={s.topRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={MBT_LOGO_DATA_URI} style={s.logo} />
          <View style={s.companyBlock}>
            {company.map(([label, value], i) => (
              <View key={i} style={s.cRow}>
                <Text style={s.cLabel}>{label}</Text>
                <Text style={s.cValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.customer}>
          <Text style={s.bold}>{data.buyerName}</Text>
          <Text style={s.muted}>{data.buyerEmail}</Text>
        </View>

        <Text style={s.title}>Factuur</Text>

        <View style={s.meta}>
          <View style={s.metaCol}>
            <MetaRow label="Factuurnummer" value={data.invoiceNumber} />
            <MetaRow label="Factuurdatum" value={data.dateLabel} />
            <MetaRow label="Omschrijving" value="Aankoop in de MBT Gym shop" />
          </View>
          <View style={s.metaCol}>
            <MetaRow label="Betaalwijze" value={paid ? method : 'Overboeking'} />
            <MetaRow label="Status" value={paid ? 'Voldaan' : 'Openstaand'} />
            {paid ? (
              <MetaRow label="Betaaldatum" value={data.dateLabel} />
            ) : (
              <MetaRow label="Vervaldatum" value={due ?? 'binnen 14 dagen'} />
            )}
          </View>
        </View>

        <View style={s.th}>
          <Text style={[s.cArtikel, s.thText]}>Artikel</Text>
          <Text style={[s.cOmschr, s.thText]}>Omschrijving</Text>
          <Text style={[s.cAantal, s.thText]}>Aantal</Text>
          <Text style={[s.cPrijs, s.thText]}>Nettoprijs</Text>
          <Text style={[s.cBedrag, s.thText]}>Bedrag</Text>
        </View>
        {lines.map((l, i) => (
          <View key={i} style={s.td}>
            <Text style={s.cArtikel}>{l.code}</Text>
            <Text style={s.cOmschr}>{l.name}</Text>
            <Text style={s.cAantal}>{qtyLabel(l.qty)}</Text>
            <Text style={s.cPrijs}>€ {euro(l.unitEx)}</Text>
            <Text style={s.cBedrag}>€ {euro(l.lineEx)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.tRow}>
            <Text style={s.muted}>Bedrag excl. btw</Text>
            <Text>€ {euro(subtotalEx)}</Text>
          </View>
          {vatByRate.map((v) => (
            <View key={v.rate} style={s.tRow}>
              <Text style={s.muted}>Btw {v.rate}%</Text>
              <Text>€ {euro(v.amount)}</Text>
            </View>
          ))}
          <View style={s.tRow}>
            <Text style={[s.tLabelBlue, s.bold]}>Totaalbedrag</Text>
            <Text style={s.bold}>€ {euro(total)}</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>
            {paid
              ? `Fijn dat je bij ons hebt besteld. Deze aankoop is voldaan via ${method}, je hoeft niets meer over te maken. Veel plezier en succes met trainen!`
              : `Gelieve het totaalbedrag binnen 14 dagen te voldoen op IBAN ${INVOICE_COMPANY.iban} t.n.v. ${INVOICE_COMPANY.name} o.v.v. factuurnummer ${data.invoiceNumber}.`}
          </Text>
          <Text style={s.pageNr}>1/1</Text>
        </View>
      </Page>
    </Document>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.mRow}>
      <Text style={s.mLabel}>{label}</Text>
      <Text style={s.mValue}>{value}</Text>
    </View>
  )
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc data={data} />)
}
