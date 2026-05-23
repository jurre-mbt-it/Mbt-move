/**
 * Print-light variant van het athletic-dark design-systeem.
 *
 * Witte pagina + zwarte tekst voor leesbaarheid op papier, maar de
 * herkenbare athletic-dark brand-accenten (lime, mono uppercase labels,
 * 900-weight display nummers) blijven dominant.
 *
 * Kleuren spiegelen `constants/theme.ts` in mbt-gym waar mogelijk; daar
 * waar print om aanpassing vraagt (achtergrond, body-tekst) wordt
 * een lichte variant gebruikt.
 */

export const PRINT_PALETTE = {
  bg: '#FFFFFF',
  surface: '#F7F8F6', // licht panel
  surfaceHi: '#EFF1ED', // iets dieper
  line: '#E4E8E2', // border-tint
  ink: '#0A0E0F', // zwart-near (=web P.bg)
  inkMuted: '#4A5454', // =web P.inkDim
  inkDim: '#8A9594',
  // Signature MBT brand-color — gebruikt op web in athletic-dark dark-ui
  // als P.brand. Anchor-kleur voor headers, section-strips, kicker accents.
  brand: '#e87a55',
  brandDeep: '#c9613f',
  // Lime spiegelt de web `P.lime` / `P.limeDark` — bright voor decoratieve
  // accenten (4px balken), dark voor tekst/borders waar contrast op wit moet.
  lime: '#65A30D',
  limeBright: '#BEF264',
  gold: '#D97706', // amber voor PARTIAL — donkerder dan #F4C261 op wit
  danger: '#DC2626', // donkerder rood dan #F87171 op wit
  ice: '#1E40AF',
} as const

/**
 * Volledige CSS als string — wordt inline in <style> van iedere PDF
 * geïnjecteerd. Geen external stylesheets om expo-print + offline-print
 * te garanderen.
 *
 * `@page` margins zijn klein zodat het athletic-dark logo-blok bovenaan
 * volledig zichtbaar is, maar genoeg ruimte laat voor printer-rand.
 */
export const PDF_BASE_CSS = `
  /* Satoshi — zelfde brand-sans als de web-app (zie src/app/globals.css).
     De PDF mag onbestelbaar zijn zonder internet bij genereren — als de
     font niet laadt valt de browser terug op de system-stack hieronder. */
  @import url('https://api.fontshare.com/v2/css?f[]=satoshi@900,700,500,400&display=swap');

  @page {
    size: A4;
    margin: 14mm 14mm 18mm 14mm;
  }

  @media print {
    html, body { background: #fff !important; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    .avoid-break { break-inside: avoid; }
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: ${PRINT_PALETTE.bg};
    color: ${PRINT_PALETTE.ink};
    font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .pdf-root {
    max-width: 182mm;
    margin: 0 auto;
    padding: 0;
  }

  /* ── Header (brand-oranje balk + logo + meta) ─────────────────────── */
  .pdf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0 14px 0;
    border-bottom: 4px solid ${PRINT_PALETTE.brand};
    margin-bottom: 18px;
  }
  .pdf-header__brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .pdf-header__brand img {
    height: 38px;
    width: auto;
    display: block;
  }
  .pdf-header__wordmark {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pdf-header__name {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.ink};
  }
  .pdf-header__tag {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 8.5px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
  }
  .pdf-header__meta {
    text-align: right;
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
    line-height: 1.6;
  }

  /* ── Hero (patient + datum + samenvatting) ────────────────────────── */
  .pdf-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 18px;
  }
  .pdf-hero__title {
    font-weight: 900;
    font-size: 28px;
    line-height: 1.05;
    letter-spacing: -0.025em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.ink};
    margin: 4px 0 0 0;
  }
  .pdf-hero__kicker {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.brand};
    margin: 0;
  }
  .pdf-hero__sub {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
    margin-top: 6px;
  }

  /* Display-cijfers — Whoop/Strava grote getallen, 900-weight, krap kerning */
  .display {
    font-weight: 900;
    letter-spacing: -0.03em;
    line-height: 1;
    color: ${PRINT_PALETTE.ink};
  }
  .display-xl { font-size: 36px; }
  .display-lg { font-size: 28px; }
  .display-md { font-size: 22px; }

  /* Mono uppercase labels — "MOBILITY ASSESSMENT", "TESTS GESCOORD" etc. */
  .meta {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
  }
  .meta-lg {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.ink};
  }

  /* ── Tile-blok (achtergrond) ──────────────────────────────────────── */
  .tile {
    background: ${PRINT_PALETTE.surface};
    border: 1px solid ${PRINT_PALETTE.line};
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  .tile--inset {
    background: ${PRINT_PALETTE.surfaceHi};
    border-radius: 6px;
    padding: 10px 12px;
  }
  .tile--accent {
    border-left: 4px solid ${PRINT_PALETTE.brand};
  }

  /* ── Stats grid (4-up samenvatting) ───────────────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
  .stat {
    background: ${PRINT_PALETTE.surface};
    border: 1px solid ${PRINT_PALETTE.line};
    border-radius: 10px;
    padding: 12px;
  }
  .stat__value {
    margin-top: 6px;
    font-weight: 900;
    font-size: 28px;
    letter-spacing: -0.025em;
    line-height: 1.05;
  }
  .stat__sub {
    margin-top: 2px;
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
  }

  /* ── Section heading per archetype/blok ───────────────────────────── */
  .section {
    margin-top: 22px;
    margin-bottom: 8px;
  }
  .section--break {
    page-break-before: auto;
    break-before: auto;
  }
  .section__bar {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 8px 12px;
    background: ${PRINT_PALETTE.ink};
    color: #fff;
    border-radius: 6px;
    border-left: 4px solid ${PRINT_PALETTE.brand};
  }
  .section__title {
    font-weight: 900;
    font-size: 14px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #fff;
  }
  .section__count {
    margin-left: auto;
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.16em;
    color: ${PRINT_PALETTE.limeBright};
  }

  /* ── Score-rij (test met kleur-coding) ────────────────────────────── */
  .row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid ${PRINT_PALETTE.line};
    border-left-width: 3px;
    margin-bottom: 6px;
    background: #fff;
  }
  .row--pass    { border-left-color: ${PRINT_PALETTE.lime};   background: rgba(101, 163, 13, 0.05); }
  .row--partial { border-left-color: ${PRINT_PALETTE.gold};   background: rgba(217, 119, 6, 0.05); }
  .row--fail    { border-left-color: ${PRINT_PALETTE.danger}; background: rgba(220, 38, 38, 0.05); }
  .row--none    { border-left-color: ${PRINT_PALETTE.inkDim}; background: #fff; }

  .row__main { flex: 1 1 auto; min-width: 0; }
  .row__name { font-weight: 700; font-size: 12px; color: ${PRINT_PALETTE.ink}; }
  .row__notes {
    font-size: 11px; color: ${PRINT_PALETTE.inkMuted};
    margin-top: 4px; line-height: 1.5;
    white-space: pre-wrap;
  }
  .row__criteria {
    font-size: 10.5px; color: ${PRINT_PALETTE.inkMuted};
    margin-top: 4px; line-height: 1.5;
    white-space: pre-wrap;
  }

  .badge {
    flex: 0 0 auto;
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.14em;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid;
    text-transform: uppercase;
    line-height: 1;
  }
  .badge--pass    { color: #fff; background: ${PRINT_PALETTE.lime};   border-color: ${PRINT_PALETTE.lime}; }
  .badge--partial { color: #fff; background: ${PRINT_PALETTE.gold};   border-color: ${PRINT_PALETTE.gold}; }
  .badge--fail    { color: #fff; background: ${PRINT_PALETTE.danger}; border-color: ${PRINT_PALETTE.danger}; }
  .badge--none    { color: ${PRINT_PALETTE.inkMuted}; background: transparent; border-color: ${PRINT_PALETTE.line}; }

  /* ── Mobilizations-blokje bij FAIL ────────────────────────────────── */
  .mobilizations {
    margin-top: 6px;
    padding: 8px 10px;
    background: rgba(220, 38, 38, 0.04);
    border: 1px dashed ${PRINT_PALETTE.danger};
    border-radius: 4px;
  }
  .mobilizations__label {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.danger};
  }
  .mobilizations__list {
    margin: 4px 0 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .mobilizations__item {
    font-size: 11px;
    background: #fff;
    border: 1px solid ${PRINT_PALETTE.line};
    border-radius: 4px;
    padding: 5px 8px;
    line-height: 1.3;
  }
  .mobilizations__cat {
    display: block;
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
    margin-top: 2px;
  }

  /* ── Programming template (per archetype summary) ─────────────────── */
  .summary {
    margin-top: 10px;
    padding: 10px 12px;
    background: ${PRINT_PALETTE.surfaceHi};
    border-radius: 6px;
  }
  .summary__row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 10px;
    padding: 4px 0;
    border-top: 1px solid ${PRINT_PALETTE.line};
  }
  .summary__row:first-child { border-top: 0; }
  .summary__label {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
    padding-top: 2px;
  }
  .summary__value { font-size: 11.5px; line-height: 1.5; }
  .summary__value--empty { color: ${PRINT_PALETTE.inkDim}; font-style: italic; }

  /* ── Tabellen (sessies, 1RM lijst) ────────────────────────────────── */
  table.table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  .table th, .table td {
    padding: 7px 8px;
    text-align: left;
    border-bottom: 1px solid ${PRINT_PALETTE.line};
    font-size: 11px;
    line-height: 1.4;
    vertical-align: top;
  }
  .table th {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkMuted};
    border-bottom: 2px solid ${PRINT_PALETTE.ink};
  }
  .table td.num {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    text-align: right;
  }
  .table tr.row-pain td   { background: rgba(220, 38, 38, 0.04); }

  /* ── Footer (laatste pagina) ──────────────────────────────────────── */
  .pdf-footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid ${PRINT_PALETTE.line};
    display: flex;
    justify-content: space-between;
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 8px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${PRINT_PALETTE.inkDim};
  }

  /* ── Print-control bovenaan (verbergen bij print) ─────────────────── */
  .print-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding: 10px 14px;
    background: ${PRINT_PALETTE.ink};
    color: #fff;
    margin: -14px -14px 18px -14px;
  }
  .print-bar button {
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 8px 14px;
    border-radius: 6px;
    border: 0;
    cursor: pointer;
  }
  .print-bar button.primary { background: ${PRINT_PALETTE.limeBright}; color: ${PRINT_PALETTE.ink}; }
  .print-bar button.ghost   { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.3); }

  /* ── Stoplicht-rij (Pass/Partial/Fail samenvatting per archetype) ── */
  .stoplight {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .stoplight__chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 999px;
    background: #fff;
    border: 1px solid ${PRINT_PALETTE.line};
    font-family: ui-monospace, Menlo, "SF Mono", monospace;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .stoplight__dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }

  /* ── Mini-sparkline (geen JS chart lib in PDF) ───────────────────── */
  .spark { display: block; }
`
