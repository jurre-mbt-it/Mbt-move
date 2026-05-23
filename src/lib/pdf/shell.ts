import { PDF_BASE_CSS } from './styles'
import { getLogoDataUri } from './logo'
import { esc, formatDateMono } from './format'

export type ShellOpts = {
  /** Browser tab + PDF metadata title. */
  documentTitle: string
  /** Bovenaan rechts: bv. "MOBILITY ASSESSMENT" / "VOORTGANGSRAPPORT". */
  headerTag: string
  /** Datum die naast headerTag verschijnt (Date of ISO string). */
  headerDate: Date | string
  /** Rendered body HTML (zonder <html> shell). */
  contentHtml: string
  /**
   * Auto-print bij open (alleen relevant voor web-route — uitzetten
   * voor expo-print, want die rendert headless en gebruikt geen window).
   */
  autoPrint?: boolean
}

/**
 * Wrap content in een complete <html> pagina met inline CSS, logo-header
 * en footer. Resultaat is self-contained (geen external assets) zodat
 * expo-print 'm 1-op-1 naar PDF kan converteren.
 */
export function renderPdfDocument(opts: ShellOpts): string {
  const logoUri = getLogoDataUri()
  const dateStr = formatDateMono(opts.headerDate)
  const generatedAt = formatDateMono(new Date())

  // Auto-print script: triggert pas wanneer afbeeldingen geladen zijn,
  // zodat het logo in de PDF zit. window.print() faalt soms in chrome
  // wanneer images nog laden — vandaar de load-handler.
  const autoPrintScript = opts.autoPrint
    ? `<script>
        window.addEventListener('load', function () {
          setTimeout(function () { window.print(); }, 250);
        });
      </script>`
    : ''

  const printBar = opts.autoPrint
    ? `<div class="print-bar no-print">
        <button class="ghost" onclick="window.close()">Sluiten</button>
        <button class="primary" onclick="window.print()">Print / opslaan als PDF</button>
      </div>`
    : ''

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.documentTitle)}</title>
  <style>${PDF_BASE_CSS}</style>
</head>
<body>
  ${printBar}
  <div class="pdf-root">
    <header class="pdf-header avoid-break">
      <div class="pdf-header__brand">
        <img src="${logoUri}" alt="MBT" />
        <div class="pdf-header__wordmark">
          <span class="pdf-header__name">Movement Based Therapy</span>
          <span class="pdf-header__tag">Performance Driven Recovery</span>
        </div>
      </div>
      <div class="pdf-header__meta">
        ${esc(opts.headerTag)}<br/>
        ${esc(dateStr)}
      </div>
    </header>

    <main>${opts.contentHtml}</main>

    <footer class="pdf-footer">
      <span>MBT · Vertrouwelijk · uitsluitend voor patiënt &amp; behandelaar</span>
      <span>Gegenereerd ${esc(generatedAt)}</span>
    </footer>
  </div>
  ${autoPrintScript}
</body>
</html>`
}
