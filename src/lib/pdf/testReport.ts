/**
 * Testrapport-PDF (Return to Sport / voortgangsmeting).
 *
 * Reproduceert het MBT-template: hero → patiëntgegevens → genummerde
 * categorieën met per test een doelzone-balk (rood/oranje/groen) + marker →
 * totaaloverzicht → interpretatie → vervolgadvies → volgend testmoment →
 * contact. Self-contained HTML (inline CSS) zodat print/expo-print 'm 1-op-1
 * naar PDF zet. Zone/plot-logica komt uit `@/lib/test-report/compute`.
 */
import { esc } from './format'
import { renderPdfDocument } from './shell'
import {
  computePlottedValue,
  computeZone,
  axisFraction,
  formatNumber,
  formatPlotted,
  ZONE_LABEL,
  ZONE_COLOR,
  type TestSpec,
  type TestZone,
} from '@/lib/test-report/compute'

// ── Types (subset van de Prisma `get`-output) ────────────────────────────
type EntryInput = TestSpec & {
  category: string
  categoryOrder: number
  name: string
  subtitle: string | null
  source: string | null
  unitPrimary: string | null
  unitSecondary: string | null
  leftPrimary: number | null
  rightPrimary: number | null
  leftSecondary: number | null
  rightSecondary: number | null
  singleValue: number | null
  textValue: string | null
  plottedValueOverride: number | null
  zoneOverride: TestZone | null
  /** Vrije toelichting van de therapeut bij deze test; komt onder de rij te
   *  staan. Stond eerder in het model maar werd niet afgedrukt. */
  notes: string | null
}

export type TestReportForPdf = {
  performedAt: Date | string
  measurementNumber: number | null
  subtitle: string | null
  trajectLabel: string | null
  location: string | null
  injuryGoal: string | null
  rehabPhaseLabel: string | null
  interpretation: string | null
  nextTestMoment: string | null
  nextTestGoal: string | null
  patient: { name: string | null; email: string; dateOfBirth: Date | string | null }
  therapist: { name: string | null; email: string; jobTitle: string | null }
  entries: EntryInput[]
  advice: Array<{ title: string; body: string }>
}

// ── Helpers ──────────────────────────────────────────────────────────────
function age(dob: Date | string | null): string {
  if (!dob) return ''
  const d = typeof dob === 'string' ? new Date(dob) : dob
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return `${a} jr`
}

function fmtDate(value: Date | string | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

const CATEGORY_NUM = (i: number) => String(i + 1).padStart(2, '0')

function unit(u: string | null): string {
  return u ? ` ${esc(u)}` : ''
}

/** L/R (of enkel) waarde-weergave, met optionele tweede eenheid. */
function renderValues(e: EntryInput): string {
  if (e.kind === 'SINGLE') {
    const v = e.textValue ?? `${formatNumber(e.singleValue)}${unit(e.unitPrimary)}`
    return `<span class="tr-val">${esc(v)}</span>`
  }
  const side = (label: string, primary: number | null, secondary: number | null) => {
    const sec =
      secondary != null && e.unitSecondary
        ? ` · ${formatNumber(secondary)}${unit(e.unitSecondary)}`
        : ''
    return `<span class="tr-side"><span class="tr-side__l">${label}</span> ${formatNumber(primary)}${unit(e.unitPrimary)}${sec}</span>`
  }
  return `${side('L', e.leftPrimary, e.leftSecondary)}${side('R', e.rightPrimary, e.rightSecondary)}`
}

/** Kolomkop boven de gemeten waarde: "Symmetrie", "Score", of wat de plot meet. */
function plotKolom(entries: EntryInput[]): string {
  const eersteEenheid = entries.find((e) => e.plotUnit)?.plotUnit ?? ''
  return eersteEenheid === '%' ? 'Symmetrie' : 'Uitslag'
}

/** De drempel waar deze test op beoordeeld wordt, als tekst. */
function doelTekst(spec: TestSpec): string {
  const teken = spec.higherIsBetter ? '≥' : '≤'
  return `${teken} ${formatNumber(spec.zoneGreenMin)}${esc(spec.plotUnit ?? '')}`
}

/** Eén waarde in een cel: getal plus eenheid klein erachter. */
function cel(value: number | null, eenheid: string | null): string {
  if (value == null) return '<span class="tr-tab__leeg">—</span>'
  return `${formatNumber(value)}${eenheid ? `<i>${esc(eenheid)}</i>` : ''}`
}

function renderTestRij(e: EntryInput): string {
  const spec = e as TestSpec
  const plotted = computePlottedValue(spec, e)
  const zone = computeZone(spec, e)
  // Kleur alleen als de uitslag BUITEN de doelzone valt. Een rapport waarin
  // elke regel een kleur heeft, leest als een dashboard en niet als een
  // bevinding; het oog moet naar de twee waarden die aandacht vragen.
  const kleur = zone === 'GREEN' || zone == null ? '' : ` style="color:${ZONE_COLOR[zone]};"`

  const waarden =
    e.kind === 'SINGLE'
      ? `<td class="tr-tab__num" colspan="2">${e.textValue ? esc(e.textValue) : cel(e.singleValue, e.unitPrimary)}</td>`
      : `<td class="tr-tab__num">${cel(e.leftPrimary, e.unitPrimary)}</td>
         <td class="tr-tab__num">${cel(e.rightPrimary, e.unitPrimary)}</td>`

  const notitie = e.notes?.trim()
    ? `<tr class="tr-tab__notitierij"><td colspan="5" class="tr-tab__notitie">${esc(e.notes.trim())}</td></tr>`
    : ''

  return `
    <tr class="avoid-break">
      <th scope="row">
        <span class="tr-tab__naam">${esc(e.name)}</span>
        ${e.subtitle ? `<span class="tr-tab__sub">${esc(e.subtitle)}</span>` : ''}
      </th>
      ${waarden}
      <td class="tr-tab__num tr-tab__uitslag"${kleur}>
        ${esc(formatPlotted(spec, plotted))}
        ${zone && zone !== 'GREEN' ? `<span class="tr-tab__zone">${esc(ZONE_LABEL[zone])}</span>` : ''}
      </td>
      <td class="tr-tab__num tr-tab__doel">${doelTekst(spec)}</td>
    </tr>
    ${notitie}
  `
}

function renderCategory(num: number, category: string, source: string | null, entries: EntryInput[]): string {
  return `
    <section class="tr-cat">
      <div class="tr-cat__head avoid-break">
        <span class="tr-cat__num">${CATEGORY_NUM(num)}</span>
        <span class="tr-cat__title">${esc(category)}</span>
        ${source ? `<span class="tr-cat__src">${esc(source)}</span>` : ''}
      </div>
      <table class="tr-tab">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col" class="tr-tab__num">Links</th>
            <th scope="col" class="tr-tab__num">Rechts</th>
            <th scope="col" class="tr-tab__num">${plotKolom(entries)}</th>
            <th scope="col" class="tr-tab__num">Doel</th>
          </tr>
        </thead>
        <tbody>${entries.map(renderTestRij).join('')}</tbody>
      </table>
    </section>
  `
}

/**
 * Het enige beeld in het rapport: elke test op zijn eigen as, met de doelzone
 * als lichte band en de uitslag als één streep. Hiervoor stond onder iedere
 * test een balk in rood-oranje-groen, negen keer op één pagina; dat was de
 * reden dat het rapport als een gegenereerd dashboard las (oordeel Jurre,
 * 25-08). Nu draagt één figuur de vergelijking en blijft de rest tekst.
 *
 * De assen verschillen per test (mobiliteit wordt op 95% beoordeeld, kracht op
 * 90%), dus ze staan bewust onder elkaar en niet op één gedeelde schaal: dat
 * zou de vergelijking suggereren die er niet is.
 */
function renderOverview(groups: Array<{ category: string; entries: EntryInput[] }>): string {
  const rijen = groups
    .flatMap((g, gi) =>
      g.entries.map((e) => {
        const spec = e as TestSpec
        const plotted = computePlottedValue(spec, e)
        const zone = computeZone(spec, e)
        const f = axisFraction(spec, plotted)
        const doel = axisFraction(spec, spec.zoneGreenMin) ?? 0
        // Doelzone: van de drempel naar de kant waar "goed" ligt.
        const band = spec.higherIsBetter
          ? `left:${(doel * 100).toFixed(2)}%;right:0;`
          : `left:0;right:${((1 - doel) * 100).toFixed(2)}%;`
        const merk =
          f == null
            ? ''
            : `<span class="tr-fig__merk" style="left:${(f * 100).toFixed(2)}%;${zone && zone !== 'GREEN' ? `background:${ZONE_COLOR[zone]};` : ''}"></span>`
        return `
          <tr class="avoid-break">
            <th scope="row">
              <span class="tr-fig__cat">${esc(g.category)}</span>
              <span class="tr-fig__naam">${esc(e.name)}</span>
            </th>
            <td class="tr-fig__spoor">
              <span class="tr-fig__as"></span>
              <span class="tr-fig__band" style="${band}"></span>
              ${merk}
            </td>
            <td class="tr-fig__val">${esc(formatPlotted(spec, plotted))}</td>
          </tr>
        `
      }),
    )
    .join('')
  return `
    <section class="tr-section">
      <div class="tr-h3">Alle testen tegen hun doel</div>
      <table class="tr-fig">${rijen}</table>
      <p class="tr-fig__legenda">De lichte band is de doelzone van die test, de streep is de uitslag van vandaag.</p>
    </section>
  `
}

function renderInterpretation(text: string | null, num: number): string {
  if (!text || !text.trim()) return ''
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => `<p class="tr-para">${esc(p.trim())}</p>`)
    .join('')
  return `
    <section class="tr-section avoid-break">
      <div class="tr-h3"><span class="tr-h3__num">${CATEGORY_NUM(num)}</span> INTERPRETATIE</div>
      ${paras}
    </section>
  `
}

function renderAdvice(advice: Array<{ title: string; body: string }>, num: number): string {
  if (advice.length === 0) return ''
  const rows = advice
    .map(
      (a) => `
        <div class="tr-adv__row avoid-break">
          <span class="tr-adv__text"><strong>${esc(a.title)}</strong> ${esc(a.body)}</span>
        </div>
      `,
    )
    .join('')
  return `
    <section class="tr-section avoid-break">
      <div class="tr-h3"><span class="tr-h3__num">${CATEGORY_NUM(num)}</span> VERVOLGADVIES</div>
      <div class="tr-adv">${rows}</div>
    </section>
  `
}

function renderNextMoment(moment: string | null, goal: string | null): string {
  if (!moment && !goal) return ''
  return `
    <section class="tr-next avoid-break">
      <div>
        <div class="tr-next__label">Volgend testmoment</div>
        ${moment ? `<div class="tr-next__moment">${esc(moment)}</div>` : ''}
      </div>
      ${goal ? `<div class="tr-next__goal">${esc(goal)}</div>` : ''}
    </section>
  `
}

// ── Hoofd-entry ───────────────────────────────────────────────────────────
export function renderTestReportPdfHtml(opts: {
  report: TestReportForPdf
  autoPrint?: boolean
}): string {
  const r = opts.report
  const patientName = r.patient.name ?? r.patient.email
  const therapistName = r.therapist.name ?? r.therapist.email
  const ageStr = age(r.patient.dateOfBirth)

  // Entries groeperen per categorie, in categoryOrder.
  const groupMap = new Map<string, { categoryOrder: number; category: string; source: string | null; entries: EntryInput[] }>()
  for (const e of r.entries) {
    const key = e.category
    if (!groupMap.has(key)) {
      groupMap.set(key, { categoryOrder: e.categoryOrder, category: e.category, source: e.source, entries: [] })
    }
    groupMap.get(key)!.entries.push(e)
  }
  const groups = [...groupMap.values()].sort((a, b) => a.categoryOrder - b.categoryOrder)

  const meting =
    r.measurementNumber != null
      ? `Meting ${String(r.measurementNumber).padStart(2, '0')}${r.trajectLabel ? ' ' + r.trajectLabel : ' van revalidatietraject'}`
      : ''

  // Sectie-nummers lopen door na de categorieën (Totaaloverzicht is ongenummerd
  // in het template, Interpretatie/Vervolgadvies krijgen de volgende nummers).
  const interpNum = groups.length
  const adviceNum = groups.length + 1

  const content = `
    <style>${TESTREPORT_CSS}</style>

    <section class="tr-hero avoid-break">
      <p class="tr-hero__kicker">Return to sport · voortgangsmeting</p>
      <h1 class="tr-hero__title">TESTRAPPORT</h1>
      <div class="tr-hero__subrow">
        <span>${esc(r.subtitle ?? '')}</span>
        ${meting ? `<span class="tr-hero__meting">${esc(meting)}</span>` : ''}
      </div>
    </section>

    <section class="tr-grid avoid-break">
      ${cell('Naam', `<strong>${esc(patientName)}</strong>`)}
      ${cell('Geboortedatum', `<strong>${esc(fmtDate(r.patient.dateOfBirth))}</strong>${ageStr ? ` <span class="tr-grid__muted">(${esc(ageStr)})</span>` : ''}`)}
      ${cell('Behandelaar', `<strong>${esc(therapistName)}</strong>${r.therapist.jobTitle ? ` <span class="tr-grid__muted">${esc(r.therapist.jobTitle)}</span>` : ''}`)}
      ${cell('Locatie', `<strong>${esc(r.location ?? '—')}</strong>`)}
      ${cell('Blessure / doel', esc(r.injuryGoal ?? '—'))}
      ${cell('Fase revalidatie', esc(r.rehabPhaseLabel ?? '—'))}
    </section>

    <div class="tr-h2 tr-h2--results">Testresultaten</div>

    ${groups.map((g, i) => renderCategory(i, g.category, g.source, g.entries)).join('')}

    ${renderOverview(groups)}
    ${renderInterpretation(r.interpretation, interpNum)}
    ${renderAdvice(r.advice, adviceNum)}
    ${renderNextMoment(r.nextTestMoment, r.nextTestGoal)}

    <section class="tr-contact avoid-break">
      <div><span class="tr-contact__h">Contact</span>info@movementbasedtherapy.nl<br/>+31 (0)20 123 45 67</div>
      <div><span class="tr-contact__h">Locaties</span>Houthavens · NDSM · Oostenburg</div>
      <div><span class="tr-contact__h">Web</span>www.movementbasedtherapy.nl</div>
    </section>
  `

  return renderPdfDocument({
    documentTitle: `Testrapport, ${patientName}`,
    headerTag: 'Testdatum',
    headerDate: r.performedAt,
    brandTag: 'Sportfysiotherapie · Amsterdam',
    contentHtml: content,
    autoPrint: opts.autoPrint,
  })
}

function cell(label: string, value: string): string {
  return `
    <div class="tr-grid__cell">
      <div class="tr-grid__label">${esc(label)}</div>
      <div class="tr-grid__value">${value}</div>
    </div>
  `
}

// ── CSS ────────────────────────────────────────────────────────────────────
const TESTREPORT_CSS = `
  /* ────────────────────────────────────────────────────────────────────
     HUISSTIJL, omgezet 25-08-2026 naar de stijl van movementbasedtherapy.nl
     (docs/design-systeem.md daar). Drie dragende regels, ook op papier:

       1. Vierkant. Nergens een afgeronde hoek.
       2. Oranje is actie en aanwijzing, mint is meting. Mint is op wit te
          licht voor tekst, dus die kleur draagt hier één vlak: het
          totaaloverzicht, het enige blok dat puur uitslag is.
       3. Lijnen dragen het ontwerp. Haarlijnen op 20% en 38% dekking, geen
          enkele slagschaduw, geen grijze vulvlakken meer.

     Het blijft een wit, zakelijk document: dit gaat naar een verwijzer of een
     collega die het uitprint en in een dossier stopt. De donkere grond van de
     app hoort daar niet; de herkenning zit in de letter, de haarlijn en het
     oranje.

     De regels hieronder overschrijven bewust ook een paar klassen uit
     styles.ts (.pdf-header, .pdf-footer): die stylesheet staat nog op de oude
     print-variant en wordt gedeeld met assessment.ts, progress.ts en
     runningAnalysis.ts. Die drie zijn NIET omgezet; converteer je die later,
     haal deze overrides dan hierheen weg en zet ze centraal.
     ──────────────────────────────────────────────────────────────────── */

  @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  .pdf-root {
    --ink: #0A1C1D;
    --ink-zacht: rgba(10, 28, 29, 0.66);
    --ink-dof: rgba(10, 28, 29, 0.45);
    --lijn: rgba(10, 28, 29, 0.20);
    --lijn-sterk: rgba(10, 28, 29, 0.38);
    --oranje: #e87a55;
    --mint: #b8d8d5;
    --mint-vlak: #eef6f5;
    --display: 'Big Shoulders Display', 'Archivo Narrow', Impact, sans-serif;
    --body: 'Inter Tight', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, "SF Mono", monospace;
  }

  body { font-family: var(--body); color: var(--ink); }
  .pdf-root * { border-radius: 0 !important; }

  /* ── Briefhoofd en voettekst (uit shell.ts) ───────────────────────── */
  .pdf-header {
    border-bottom: 1px solid var(--lijn-sterk);
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .pdf-header__name {
    font-family: var(--display); font-weight: 700; font-size: 15px;
    letter-spacing: 0.005em; text-transform: uppercase; color: var(--ink);
  }
  .pdf-header__tag, .pdf-header__meta {
    font-family: var(--mono); font-weight: 400; font-size: 8px;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dof);
  }
  .pdf-header__meta { font-size: 8.5px; line-height: 1.7; }
  .pdf-footer {
    border-top: 1px solid var(--lijn);
    font-family: var(--mono); font-weight: 400; font-size: 8px;
    letter-spacing: 0.05em; color: var(--ink-dof);
  }

  /* ── Hero ─────────────────────────────────────────────────────────── */
  .tr-hero { margin-bottom: 18px; }
  .tr-hero__kicker {
    font-family: var(--mono); font-size: 8.5px; font-weight: 500;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--oranje); margin: 0;
  }
  .tr-hero__title {
    font-family: var(--display); font-weight: 700; font-size: 62px; line-height: 0.92;
    letter-spacing: 0.005em; text-transform: uppercase;
    margin: 6px 0 10px 0; color: var(--ink);
  }
  .tr-hero__subrow {
    display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
    border-top: 1px solid var(--lijn-sterk); padding-top: 7px;
    font-size: 11.5px; color: var(--ink-zacht);
  }
  .tr-hero__meting {
    font-family: var(--mono); font-size: 9px; letter-spacing: 0.05em;
    color: var(--ink-dof); white-space: nowrap;
  }

  /* ── Kopgegevens: haarlijnenraster ────────────────────────────────── */
  .tr-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
    border: 1px solid var(--lijn-sterk); margin-bottom: 20px;
  }
  .tr-grid__cell { padding: 10px 12px; border-right: 1px solid var(--lijn); border-bottom: 1px solid var(--lijn); }
  .tr-grid__cell:nth-child(3n) { border-right: 0; }
  .tr-grid__cell:nth-child(n+4) { border-bottom: 0; }
  .tr-grid__label {
    font-family: var(--mono); font-size: 7.5px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--oranje); margin-bottom: 4px;
  }
  .tr-grid__value { font-size: 12.5px; color: var(--ink); line-height: 1.4; }
  .tr-grid__value strong { font-weight: 600; }
  .tr-grid__muted { color: var(--ink-dof); font-weight: 400; font-size: 11px; }

  /* ── Sectiekoppen ─────────────────────────────────────────────────── */
  .tr-h2 {
    display: flex; align-items: center; gap: 9px;
    font-family: var(--display); font-weight: 700; font-size: 19px;
    letter-spacing: 0.005em; text-transform: uppercase;
    color: var(--ink); margin: 24px 0 10px 0;
  }
  .tr-h2--results { margin-top: 10px; }

  /* ── Categorie ────────────────────────────────────────────────────── */
  .tr-cat { margin-top: 22px; }
  .tr-cat__head {
    display: flex; align-items: baseline; gap: 10px;
    border-bottom: 1px solid var(--lijn-sterk); padding-bottom: 6px;
  }
  .tr-cat__num { font-family: var(--mono); font-size: 11px; font-weight: 500; letter-spacing: 0.05em; color: var(--oranje); }
  .tr-cat__title {
    font-family: var(--display); font-weight: 700; font-size: 23px;
    letter-spacing: 0.005em; text-transform: uppercase; color: var(--ink);
  }
  .tr-cat__src {
    margin-left: auto; font-family: var(--mono); font-size: 8px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dof);
  }

  /* ── Testtabel ────────────────────────────────────────────────────────
     Eén tabel per categorie in plaats van acht losse kaartrijen met elk een
     stoplichtbalk. Getallen rechts uitgelijnd op tabulaire cijfers, zodat de
     kolom leest als een meting en niet als een opsomming. */
  .tr-tab { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .tr-tab thead th {
    font-family: var(--mono); font-size: 7.5px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dof);
    text-align: left; padding: 8px 0 5px 0; border-bottom: 1px solid var(--lijn);
    vertical-align: bottom;
  }
  .tr-tab thead th.tr-tab__num { text-align: right; }
  .tr-tab tbody th {
    text-align: left; font-weight: 400; padding: 9px 10px 9px 0; vertical-align: baseline;
    border-bottom: 1px solid var(--lijn);
  }
  .tr-tab tbody td { padding: 9px 0 9px 10px; vertical-align: baseline; border-bottom: 1px solid var(--lijn); }
  .tr-tab__naam { font-weight: 600; font-size: 12.5px; color: var(--ink); }
  .tr-tab__sub { display: block; color: var(--ink-dof); font-size: 10.5px; margin-top: 1px; }
  .tr-tab__num {
    text-align: right; white-space: nowrap;
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums; color: var(--ink);
  }
  .tr-tab__num i { font-style: normal; color: var(--ink-dof); font-size: 9px; margin-left: 3px; }
  .tr-tab__leeg { color: var(--ink-dof); }
  .tr-tab__uitslag { font-size: 14px; font-weight: 500; }
  .tr-tab__zone {
    display: block; font-family: var(--mono); font-size: 7.5px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px;
  }
  .tr-tab__doel { color: var(--ink-dof); }
  .tr-tab__notitierij td { padding: 0 0 10px 0; border-bottom: 1px solid var(--lijn); }
  .tr-tab__notitie { font-size: 11px; line-height: 1.55; color: var(--ink-zacht); }

  /* ── De figuur: alle testen tegen hun eigen doel ──────────────────── */
  .tr-fig { width: 100%; border-collapse: collapse; margin-top: 2px; }
  .tr-fig th, .tr-fig td { padding: 8px 0; vertical-align: middle; border-bottom: 1px solid var(--lijn); }
  .tr-fig tr:last-child th, .tr-fig tr:last-child td { border-bottom: 0; }
  .tr-fig th { text-align: left; font-weight: 400; width: 32%; padding-right: 14px; }
  .tr-fig__cat {
    display: block; font-family: var(--mono); font-size: 7px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dof);
  }
  .tr-fig__naam { font-size: 11.5px; color: var(--ink); }
  .tr-fig__spoor { position: relative; height: 15px; }
  .tr-fig__as { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: var(--lijn); }
  .tr-fig__band { position: absolute; top: 4px; bottom: 4px; background: var(--mint); }
  .tr-fig__merk { position: absolute; top: 1px; bottom: 1px; width: 2px; margin-left: -1px; background: var(--ink); }
  .tr-fig__val {
    width: 62px; text-align: right; font-family: var(--mono); font-size: 11px;
    font-variant-numeric: tabular-nums; color: var(--ink); padding-left: 12px;
  }
  .tr-fig__legenda {
    margin: 10px 0 0 0; font-family: var(--mono); font-size: 7.5px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dof);
  }

  /* ── Interpretatie en advies ──────────────────────────────────────── */
  .tr-section { margin-top: 24px; }
  .tr-h3 {
    display: flex; align-items: center; gap: 9px;
    font-family: var(--display); font-weight: 700; font-size: 19px;
    letter-spacing: 0.005em; text-transform: uppercase;
    color: var(--ink); border-bottom: 1px solid var(--lijn-sterk); padding-bottom: 6px; margin-bottom: 11px;
  }
  .tr-h3__num { font-family: var(--mono); font-weight: 500; color: var(--oranje); font-size: 11px; letter-spacing: 0.05em; }
  .tr-para { font-size: 12px; line-height: 1.65; color: var(--ink); margin: 0 0 9px 0; }

  .tr-adv__row { padding: 9px 0; border-bottom: 1px solid var(--lijn); }
  .tr-adv__text { font-size: 12px; line-height: 1.6; color: var(--ink); }
  .tr-adv__text strong { font-weight: 600; }

  /* ── Volgend testmoment ───────────────────────────────────────────── */
  .tr-next {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    background: #ffffff; color: var(--ink);
    border: 1px solid var(--lijn-sterk); border-left: 3px solid var(--oranje);
    padding: 13px 16px; margin-top: 20px;
  }
  .tr-next__label {
    font-family: var(--mono); font-size: 7.5px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--oranje);
  }
  .tr-next > div:first-child { flex: 1 1 auto; min-width: 0; }
  .tr-next__moment {
    font-family: var(--display); font-weight: 700; font-size: 17px;
    letter-spacing: 0.005em; margin-top: 4px; line-height: 1.15;
  }
  .tr-next__goal {
    flex: 0 0 auto; max-width: 42%;
    text-align: right; font-family: var(--mono); font-size: 9px; font-weight: 400;
    color: var(--ink-zacht); letter-spacing: 0.02em; white-space: pre-line; line-height: 1.5;
  }

  /* ── Contactregel ─────────────────────────────────────────────────── */
  .tr-contact {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    border-top: 1px solid var(--oranje); padding-top: 11px; margin-top: 28px;
    font-size: 11px; color: var(--ink);
  }
  .tr-contact div:nth-child(3) { text-align: right; }
  .tr-contact__h {
    display: block; font-family: var(--mono); font-size: 7.5px; font-weight: 400;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink-dof); margin-bottom: 4px;
  }
`
