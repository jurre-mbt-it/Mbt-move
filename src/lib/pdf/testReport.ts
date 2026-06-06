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
  zoneSegments,
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

/** Tick-label: getal + eenheid (symbolen overal, woord-eenheden op de randen). */
function tickLabel(spec: TestSpec, value: number, outer: boolean): string {
  const symbol = /^[%°]/.test(spec.plotUnit)
  const showUnit = spec.plotUnit && (symbol || outer)
  return `${formatNumber(value)}${showUnit ? esc(spec.plotUnit) : ''}`
}

/** De doelzone-balk: gekleurde segmenten + ticks + marker. */
function renderBar(spec: TestSpec, plotted: number | null, opts?: { mini?: boolean }): string {
  const segs = zoneSegments(spec)
  const segHtml = segs
    .map(
      (s) =>
        `<span class="tr-seg" style="left:${(s.from * 100).toFixed(2)}%;width:${((s.to - s.from) * 100).toFixed(2)}%;background:${ZONE_COLOR[s.zone]};"></span>`,
    )
    .join('')

  const frac = axisFraction(spec, plotted)
  const pin =
    frac == null
      ? ''
      : `<span class="tr-pin" style="left:${(frac * 100).toFixed(2)}%;"></span>`

  if (opts?.mini) {
    return `<div class="tr-track tr-track--mini">${segHtml}${pin}</div>`
  }

  // Marker-label boven de balk + ticks eronder.
  const zone = computeZone(spec, plotted)
  const pinLabel =
    frac == null
      ? ''
      : `<span class="tr-pinlabel" style="left:${(frac * 100).toFixed(2)}%;color:${zone ? ZONE_COLOR[zone] : '#0A0E0F'};">${esc(formatPlotted(spec, plotted))}</span>`

  const ticks = [spec.axisMin, spec.zoneOrangeMin, spec.zoneGreenMin, spec.axisMax]
    .map((v, i, arr) => {
      const f = axisFraction(spec, v) ?? 0
      const outer = i === 0 || i === arr.length - 1
      const align = i === 0 ? 'left:0;' : i === arr.length - 1 ? 'right:0;' : `left:${(f * 100).toFixed(2)}%;transform:translateX(-50%);`
      return `<span class="tr-tick" style="${align}">${tickLabel(spec, v, outer)}</span>`
    })
    .join('')

  return `
    <div class="tr-barblock">
      <div class="tr-pinrow">${pinLabel}</div>
      <div class="tr-track">${segHtml}${pin}</div>
      <div class="tr-ticks">${ticks}</div>
    </div>
  `
}

function renderTestRow(e: EntryInput): string {
  const spec = e as TestSpec
  const plotted = computePlottedValue(spec, e)
  const zone = computeZone(spec, e)
  return `
    <div class="tr-test avoid-break">
      <div class="tr-test__top">
        <div class="tr-test__name">
          <span class="tr-test__title">${esc(e.name)}</span>
          ${e.subtitle ? `<span class="tr-test__sub">${esc(e.subtitle)}</span>` : ''}
        </div>
        <div class="tr-test__values">${renderValues(e)}</div>
        <div class="tr-test__headline" style="color:${zone ? ZONE_COLOR[zone] : '#0A0E0F'};">
          <span class="tr-test__hl">${esc(formatPlotted(spec, plotted))}</span>
          ${zone ? `<span class="tr-test__zone">${esc(ZONE_LABEL[zone])}</span>` : ''}
        </div>
      </div>
      ${renderBar(spec, plotted)}
    </div>
  `
}

function renderCategory(num: number, category: string, source: string | null, entries: EntryInput[]): string {
  return `
    <section class="tr-cat">
      <div class="tr-cat__head avoid-break">
        <span class="tr-cat__num">${CATEGORY_NUM(num)}</span>
        <span class="tr-cat__title">${esc(category)}</span>
        ${source ? `<span class="tr-cat__src">→ ${esc(source)}</span>` : ''}
      </div>
      ${entries.map(renderTestRow).join('')}
    </section>
  `
}

function renderOverview(groups: Array<{ category: string; entries: EntryInput[] }>): string {
  const rows = groups
    .flatMap((g, gi) =>
      g.entries.map((e) => {
        const spec = e as TestSpec
        const plotted = computePlottedValue(spec, e)
        const zone = computeZone(spec, e)
        return `
          <div class="tr-ov__row avoid-break">
            <div class="tr-ov__label">
              <span class="tr-ov__cat">${CATEGORY_NUM(gi)} · ${esc(g.category.toUpperCase())}</span>
              <span class="tr-ov__name">${esc(e.name)}</span>
            </div>
            <div class="tr-ov__bar">${renderBar(spec, plotted, { mini: true })}</div>
            <div class="tr-ov__val" style="color:${zone ? ZONE_COLOR[zone] : '#0A0E0F'};">
              <span class="tr-ov__dot" style="background:${zone ? ZONE_COLOR[zone] : '#8A9594'};"></span>
              ${esc(formatPlotted(spec, plotted))}
            </div>
          </div>
        `
      }),
    )
    .join('')
  return `
    <section class="tr-section">
      <div class="tr-h2"><span class="tr-h2__dot"></span> TOTAALOVERZICHT</div>
      <div class="tr-ov">${rows}</div>
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
          <span class="tr-adv__arrow">→</span>
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
        ${moment ? `<div class="tr-next__moment">→ ${esc(moment)}</div>` : ''}
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
      <p class="tr-hero__kicker">● Return to sport · voortgangsmeting</p>
      <h1 class="tr-hero__title">TESTRAPPORT</h1>
      <div class="tr-hero__subrow">
        <span>${esc(r.subtitle ?? '')}</span>
        ${meting ? `<span class="tr-hero__meting">→ ${esc(meting)}</span>` : ''}
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

    <div class="tr-h2 tr-h2--results"><span class="tr-h2__dot"></span> TESTRESULTATEN</div>
    <div class="tr-legend avoid-break">
      <span class="tr-legend__label">Zones</span>
      ${legend(ZONE_COLOR.RED, 'Rood · onvoldoende')}
      ${legend(ZONE_COLOR.ORANGE, 'Oranje · in opbouw')}
      ${legend(ZONE_COLOR.GREEN, 'Groen · doelzone')}
      <span class="tr-legend__marker">▾ = huidige score</span>
    </div>

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
    documentTitle: `Testrapport — ${patientName}`,
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
      <div class="tr-grid__label">● ${esc(label)}</div>
      <div class="tr-grid__value">${value}</div>
    </div>
  `
}

function legend(color: string, label: string): string {
  return `<span class="tr-legend__item"><span class="tr-legend__chip" style="background:${color};"></span>${esc(label)}</span>`
}

// ── CSS ────────────────────────────────────────────────────────────────────
const TESTREPORT_CSS = `
  .tr-hero { margin-bottom: 16px; }
  .tr-hero__kicker {
    font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; font-weight: 900;
    letter-spacing: 0.18em; text-transform: uppercase; color: #e87a55; margin: 0;
  }
  .tr-hero__title {
    font-weight: 900; font-size: 56px; line-height: 0.95; letter-spacing: -0.03em;
    margin: 4px 0 8px 0; color: #0A0E0F;
  }
  .tr-hero__subrow {
    display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
    border-top: 2px solid #0A0E0F; padding-top: 6px;
    font-size: 11px; color: #4A5454;
  }
  .tr-hero__meting { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #4A5454; white-space: nowrap; }

  .tr-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
    border: 1px solid #0A0E0F; margin-bottom: 18px;
  }
  .tr-grid__cell { padding: 9px 12px; border-right: 1px solid #E4E8E2; border-bottom: 1px solid #E4E8E2; }
  .tr-grid__cell:nth-child(3n) { border-right: 0; }
  .tr-grid__cell:nth-child(n+4) { border-bottom: 0; }
  .tr-grid__label {
    font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase; color: #e87a55; margin-bottom: 3px;
  }
  .tr-grid__value { font-size: 13px; color: #0A0E0F; line-height: 1.35; }
  .tr-grid__value strong { font-weight: 800; }
  .tr-grid__muted { color: #8A9594; font-weight: 500; font-size: 11px; }

  .tr-h2 {
    display: flex; align-items: center; gap: 8px;
    font-weight: 900; font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase;
    color: #0A0E0F; margin: 22px 0 10px 0;
  }
  .tr-h2--results { margin-top: 8px; }
  .tr-h2__dot { width: 9px; height: 9px; border-radius: 999px; background: #e87a55; display: inline-block; }

  .tr-legend {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    background: #F7F8F6; border: 1px solid #E4E8E2; border-radius: 6px;
    padding: 7px 12px; margin-bottom: 16px;
  }
  .tr-legend__label, .tr-legend__marker {
    font-family: ui-monospace, Menlo, monospace; font-size: 8.5px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase; color: #4A5454;
  }
  .tr-legend__marker { margin-left: auto; }
  .tr-legend__item {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: ui-monospace, Menlo, monospace; font-size: 8.5px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; color: #0A0E0F;
  }
  .tr-legend__chip { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }

  /* Categorie */
  .tr-cat { margin-top: 18px; }
  .tr-cat__head {
    display: flex; align-items: baseline; gap: 10px;
    border-bottom: 2px solid #0A0E0F; padding-bottom: 5px; margin-bottom: 12px;
  }
  .tr-cat__num { font-family: ui-monospace, Menlo, monospace; font-size: 13px; font-weight: 900; color: #e87a55; }
  .tr-cat__title { font-weight: 900; font-size: 19px; letter-spacing: -0.01em; text-transform: uppercase; color: #0A0E0F; }
  .tr-cat__src {
    margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 8.5px;
    letter-spacing: 0.12em; text-transform: uppercase; color: #8A9594;
  }

  /* Test-rij */
  .tr-test { margin-bottom: 16px; }
  .tr-test__top { display: flex; align-items: flex-start; gap: 12px; }
  .tr-test__name { flex: 0 0 34%; }
  .tr-test__title { font-weight: 800; font-size: 13px; color: #0A0E0F; }
  .tr-test__sub { color: #8A9594; font-size: 11px; margin-left: 5px; }
  .tr-test__values { flex: 1 1 auto; text-align: right; font-size: 11.5px; color: #0A0E0F; }
  .tr-side { font-family: ui-monospace, Menlo, monospace; white-space: nowrap; margin-left: 12px; }
  .tr-side__l { color: #8A9594; }
  .tr-val { font-family: ui-monospace, Menlo, monospace; }
  .tr-test__headline { flex: 0 0 auto; text-align: right; min-width: 78px; }
  .tr-test__hl { display: block; font-weight: 900; font-size: 20px; letter-spacing: -0.02em; line-height: 1; }
  .tr-test__zone {
    display: block; font-family: ui-monospace, Menlo, monospace; font-size: 7.5px;
    font-weight: 700; letter-spacing: 0.1em; margin-top: 2px;
  }

  /* Doelzone-balk */
  .tr-barblock { margin-top: 4px; }
  .tr-pinrow { position: relative; height: 13px; }
  .tr-pinlabel {
    position: absolute; transform: translateX(-50%); bottom: 0;
    font-family: ui-monospace, Menlo, monospace; font-size: 9px; font-weight: 900; white-space: nowrap;
  }
  .tr-track {
    position: relative; height: 13px; border-radius: 2px; overflow: hidden; background: #E4E8E2;
  }
  .tr-track--mini { height: 9px; }
  .tr-seg { position: absolute; top: 0; bottom: 0; }
  .tr-pin {
    position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px;
    background: #0A0E0F; z-index: 2;
  }
  .tr-ticks {
    position: relative; height: 12px; margin-top: 2px;
  }
  .tr-tick {
    position: absolute; top: 0;
    font-family: ui-monospace, Menlo, monospace; font-size: 8px; color: #8A9594; white-space: nowrap;
  }

  /* Totaaloverzicht */
  .tr-ov { margin-top: 6px; }
  .tr-ov__row { display: flex; align-items: center; gap: 12px; padding: 5px 0; border-top: 1px solid #EFF1ED; }
  .tr-ov__row:first-child { border-top: 0; }
  .tr-ov__label { flex: 0 0 30%; }
  .tr-ov__cat {
    display: block; font-family: ui-monospace, Menlo, monospace; font-size: 7.5px;
    letter-spacing: 0.1em; color: #8A9594;
  }
  .tr-ov__name { font-weight: 700; font-size: 12px; color: #0A0E0F; }
  .tr-ov__bar { flex: 1 1 auto; }
  .tr-ov__val {
    flex: 0 0 auto; min-width: 64px; text-align: right; display: flex; align-items: center;
    justify-content: flex-end; gap: 6px; font-weight: 900; font-size: 14px; letter-spacing: -0.02em;
  }
  .tr-ov__dot { width: 7px; height: 7px; border-radius: 999px; display: inline-block; }

  /* Interpretatie / advies */
  .tr-section { margin-top: 22px; }
  .tr-h3 {
    display: flex; align-items: center; gap: 8px;
    font-weight: 900; font-size: 15px; letter-spacing: 0.03em; text-transform: uppercase;
    color: #0A0E0F; border-bottom: 2px solid #0A0E0F; padding-bottom: 5px; margin-bottom: 10px;
  }
  .tr-h3__num { font-family: ui-monospace, Menlo, monospace; color: #e87a55; font-size: 12px; }
  .tr-h2__dot { flex: 0 0 auto; }
  .tr-para { font-size: 12px; line-height: 1.6; color: #0A0E0F; margin: 0 0 8px 0; }

  .tr-adv__row { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid #EFF1ED; }
  .tr-adv__arrow { color: #e87a55; font-weight: 900; }
  .tr-adv__text { font-size: 12px; line-height: 1.55; color: #0A0E0F; }
  .tr-adv__text strong { font-weight: 800; }

  .tr-next {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    background: #0A0E0F; color: #fff; border-radius: 6px; padding: 12px 16px; margin-top: 18px;
  }
  .tr-next__label {
    font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase; color: #8A9594;
  }
  .tr-next__moment { font-weight: 800; font-size: 14px; margin-top: 3px; }
  .tr-next__goal {
    text-align: right; font-family: ui-monospace, Menlo, monospace; font-size: 10px;
    color: #BEF264; letter-spacing: 0.04em; white-space: pre-line;
  }

  .tr-contact {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    border-top: 3px solid #e87a55; padding-top: 10px; margin-top: 26px;
    font-size: 11px; color: #0A0E0F;
  }
  .tr-contact div:nth-child(3) { text-align: right; }
  .tr-contact__h {
    display: block; font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase; color: #8A9594; margin-bottom: 3px;
  }
`
