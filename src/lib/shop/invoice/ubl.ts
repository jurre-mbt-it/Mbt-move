import { computeInvoice, type InvoiceData } from './render'
import { INVOICE_COMPANY } from './company'

/**
 * Genereert een UBL 2.1 e-factuur (NLCIUS-profiel) als XML-string. Exact Online
 * (en de meeste NL-boekhoudpakketten) kunnen dit importeren / automatisch
 * herkennen. We sturen dit als bijlage naar de boekhoud-mailbox, naast de PDF.
 *
 * Bedragen komen uit dezelfde `computeInvoice` als de PDF, zodat XML en PDF
 * altijd op de cent gelijk zijn.
 */

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Centen → "29.95" (UBL gebruikt punt-decimalen). */
function dec(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** "1018 LL  Amsterdam" → { zone: "1018 LL", city: "Amsterdam" }. */
function splitZipCity(zipCity: string): { zone: string; city: string } {
  const m = zipCity.trim().match(/^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/)
  if (m) return { zone: m[1].trim(), city: m[2].trim() }
  return { zone: '', city: zipCity.trim() }
}

export function renderInvoiceUbl(data: InvoiceData): string {
  const { lines, subtotalEx, vatByRate, total } = computeInvoice(data)
  const cur = 'EUR'
  const issue = data.isoDate ?? new Date().toISOString().slice(0, 10)
  const supplierAddr = splitZipCity(INVOICE_COMPANY.zipCity)

  const taxSubtotals = vatByRate
    .map((v) => {
      // Netto per tarief = som van regel-ex met dat tarief.
      const taxable = lines.filter((l) => l.rate === v.rate).reduce((a, l) => a + l.lineEx, 0)
      return `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${dec(taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${dec(v.amount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${v.rate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
    })
    .join('\n')

  const totalVat = vatByRate.reduce((a, v) => a + v.amount, 0)

  const invoiceLines = lines
    .map(
      (l, i) => `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cur}">${dec(l.lineEx)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${l.rate}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${cur}">${dec(l.unitEx)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('\n')

  const buyerAddr = data.buyerAddress
  const buyerAddressXml = buyerAddr
    ? `      <cac:PostalAddress>
        ${buyerAddr.street ? `<cbc:StreetName>${esc(buyerAddr.street)}</cbc:StreetName>` : ''}
        ${buyerAddr.city ? `<cbc:CityName>${esc(buyerAddr.city)}</cbc:CityName>` : ''}
        ${buyerAddr.postalCode ? `<cbc:PostalZone>${esc(buyerAddr.postalCode)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:IdentificationCode>${esc(buyerAddr.country || 'NL')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(data.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${issue}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(INVOICE_COMPANY.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(INVOICE_COMPANY.street)}</cbc:StreetName>
        <cbc:CityName>${esc(supplierAddr.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(supplierAddr.zone)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(INVOICE_COMPANY.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(INVOICE_COMPANY.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0106">${esc(INVOICE_COMPANY.kvk)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact><cbc:ElectronicMail>${esc(INVOICE_COMPANY.email)}</cbc:ElectronicMail></cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(data.buyerName)}</cbc:Name></cac:PartyName>
${buyerAddressXml}
      <cac:Contact><cbc:ElectronicMail>${esc(data.buyerEmail)}</cbc:ElectronicMail></cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount><cbc:ID>${esc(INVOICE_COMPANY.iban)}</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${dec(totalVat)}</cbc:TaxAmount>
${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${dec(subtotalEx)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${dec(subtotalEx)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${dec(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${cur}">${dec(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${invoiceLines}
</Invoice>`
}
