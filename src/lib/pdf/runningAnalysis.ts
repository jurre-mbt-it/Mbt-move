/**
 * Hardloopanalyse-PDF (2D videoanalyse).
 *
 * Reproduceert het MBT-template: hero → patiëntgegevens → totaalscore
 * achteraanzicht → 01 achteraanzicht (L/R-cards met score-balk) → 02 zijaanzicht
 * (hoekmetingen met ideale-range band-balk) → 03 loopmetrics (tegels) →
 * opmerkingen therapeut → vervolg → volgend analysemoment → contact.
 * Self-contained HTML; zone-logica uit `@/lib/running-analysis/compute`.
 */
import { esc } from './format'
import { renderPdfDocument } from './shell'
import { METRICS, REAR_SOURCE } from '@/lib/running-analysis/catalog'
import {
  rearZone,
  rearSegments,
  rearFraction,
  sideStatus,
  sideSegments,
  sideFraction,
  rearTotal,
  formatNumber,
  REAR_ZONE_LABEL,
  SIDE_STATUS_LABEL,
  ZONE_COLOR,
  type ZoneSegment,
} from '@/lib/running-analysis/compute'

type ItemInput = {
  section: 'REAR' | 'SIDE'
  key: string
  label: string
  value: number | null
  comment: string | null
  idealMin: number | null
  idealMax: number | null
  axisMin: number | null
  axisMax: number | null
  unit: string | null
}

export type RunningAnalysisForPdf = {
  performedAt: Date | string
  goal: string | null
  location: string | null
  subtitle: string | null
  viewLabel: string | null
  cadence: number | null
  strideLength: number | null
  stepLength: number | null
  groundContact: number | null
  flightTime: number | null
  dutyFactor: number | null
  metricComments: Record<string, string> | null
  therapistComments: string | null
  nextMoment: string | null
  patient: { name: string | null; email: string; dateOfBirth: Date | string | null }
  therapist: { name: string | null; email: string; jobTitle: string | null }
  items: ItemInput[]
  advice: Array<{ title: string; body: string }>
}

function fmtDate(value: Date | string | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

function segHtml(segments: ZoneSegment[]): string {
  return segments
    .map(
      (s) =>
        `<span class="ra-seg" style="left:${(s.from * 100).toFixed(2)}%;width:${((s.to - s.from) * 100).toFixed(2)}%;background:${ZONE_COLOR[s.zone]};"></span>`,
    )
    .join('')
}

function pinHtml(frac: number | null): string {
  return frac == null
    ? ''
    : `<span class="ra-pin" style="left:${(frac * 100).toFixed(2)}%;"></span>`
}

/** Achteraanzicht-balk (0-100) met optionele ticks 0/70/85/100. */
function rearBar(value: number | null, opts?: { pct?: boolean }): string {
  const ticks = [0, 70, 85, 100]
    .map((v, i, arr) => {
      const align = i === 0 ? 'left:0;' : i === arr.length - 1 ? 'right:0;' : `left:${v}%;transform:translateX(-50%);`
      return `<span class="ra-tick" style="${align}">${v}${opts?.pct ? '%' : ''}</span>`
    })
    .join('')
  return `
    <div class="ra-track">${segHtml(rearSegments())}${pinHtml(rearFraction(value))}</div>
    <div class="ra-ticks">${ticks}</div>
  `
}

function renderTotal(items: ItemInput[]): string {
  const rear = items.filter((i) => i.section === 'REAR')
  const total = rearTotal(rear.map((i) => i.value))
  const zone = rearZone(total)
  const color = zone ? ZONE_COLOR[zone] : '#0A0E0F'
  return `
    <section class="ra-total avoid-break">
      <div class="ra-total__left">
        <div class="ra-total__label">Totaalscore achteraanzicht</div>
        <div class="ra-total__pct" style="color:${color};">${total == null ? '—' : total + '%'}</div>
        ${zone ? `<div class="ra-total__zone" style="color:${color};">${esc(REAR_ZONE_LABEL[zone])}</div>` : ''}
      </div>
      <div class="ra-total__bar">${rearBar(total, { pct: true })}</div>
    </section>
  `
}

function renderRearCard(it: ItemInput): string {
  const zone = rearZone(it.value)
  const color = zone ? ZONE_COLOR[zone] : '#0A0E0F'
  return `
    <div class="ra-card avoid-break">
      <div class="ra-card__top">
        <span class="ra-card__label">${esc(it.label)}</span>
        <span class="ra-card__pct" style="color:${color};">${it.value == null ? '—' : it.value + '%'}</span>
      </div>
      ${it.comment ? `<div class="ra-card__comment">${esc(it.comment)}</div>` : '<div class="ra-card__comment">&nbsp;</div>'}
      <div class="ra-card__bar">${rearBar(it.value)}</div>
    </div>
  `
}

function renderSideRow(it: ItemInput): string {
  const range = {
    idealMin: it.idealMin ?? 0,
    idealMax: it.idealMax ?? 0,
    axisMin: it.axisMin ?? 0,
    axisMax: it.axisMax ?? 100,
  }
  const zone = sideStatus(it.value, range)
  const color = zone ? ZONE_COLOR[zone] : '#0A0E0F'
  const unit = it.unit ?? '°'
  return `
    <div class="ra-side avoid-break">
      <div class="ra-side__top">
        <span class="ra-side__name">${esc(it.label)}</span>
        <span class="ra-side__ideal">ideaal ${formatNumber(it.idealMin)}${esc(unit)} tot ${formatNumber(it.idealMax)}${esc(unit)}</span>
        <span class="ra-side__status" style="color:${color};">
          ${zone ? `<span class="ra-side__statuslabel">${esc(SIDE_STATUS_LABEL[zone])}</span>` : ''}
          <span class="ra-side__val">${it.value == null ? '—' : formatNumber(it.value) + esc(unit)}</span>
        </span>
      </div>
      <div class="ra-track ra-track--side">${segHtml(sideSegments(range))}${pinHtml(sideFraction(it.value, range))}</div>
      ${it.comment ? `<div class="ra-side__comment">→ ${esc(it.comment)}</div>` : ''}
    </div>
  `
}

function renderMetrics(a: RunningAnalysisForPdf): string {
  const tiles = METRICS.map((m) => {
    const value = a[m.key]
    const note = a.metricComments?.[m.key]?.trim()
    return `
      <div class="ra-metric">
        <div class="ra-metric__label">${esc(m.label)}</div>
        <div class="ra-metric__value">${value == null ? '—' : esc(formatNumber(value))}</div>
        <div class="ra-metric__unit">${esc(m.unit)}</div>
        ${note ? `<div class="ra-metric__comment">${esc(note)}</div>` : ''}
      </div>
    `
  }).join('')
  return `
    <section class="ra-section">
      <div class="ra-cat__head avoid-break">
        <span class="ra-cat__num">03</span>
        <span class="ra-cat__title">LOOPMETRICS</span>
        <span class="ra-cat__src">→ GEMIDDELDE OVER DE ANALYSE</span>
      </div>
      <div class="ra-metrics">${tiles}</div>
    </section>
  `
}

function renderComments(text: string | null): string {
  if (!text || !text.trim()) return ''
  return `
    <section class="ra-section avoid-break">
      <div class="ra-h2"><span class="ra-h2__dot"></span> OPMERKINGEN THERAPEUT</div>
      <div class="ra-commentbox">${esc(text).replace(/\n/g, '<br/>')}</div>
    </section>
  `
}

function renderAdvice(advice: Array<{ title: string; body: string }>): string {
  if (advice.length === 0) return ''
  const rows = advice
    .map(
      (a) => `
        <div class="ra-adv__row avoid-break">
          <span class="ra-adv__arrow">→</span>
          <span class="ra-adv__text"><strong>${esc(a.title)}</strong> ${esc(a.body)}</span>
        </div>`,
    )
    .join('')
  return `
    <section class="ra-section avoid-break">
      <div class="ra-h2"><span class="ra-h2__dot"></span> VERVOLG</div>
      <div class="ra-adv">${rows}</div>
    </section>
  `
}

function renderNext(moment: string | null): string {
  if (!moment) return ''
  return `
    <section class="ra-next avoid-break">
      <div class="ra-next__label">Volgend analysemoment</div>
      <div class="ra-next__moment">→ ${esc(moment)}</div>
    </section>
  `
}

export function renderRunningAnalysisPdfHtml(opts: {
  analysis: RunningAnalysisForPdf
  autoPrint?: boolean
}): string {
  const a = opts.analysis
  const patientName = a.patient.name ?? a.patient.email
  const therapistName = a.therapist.name ?? a.therapist.email
  const rear = a.items.filter((i) => i.section === 'REAR')
  const side = a.items.filter((i) => i.section === 'SIDE')

  const content = `
    <style>${RUNNING_CSS}</style>

    <section class="ra-hero avoid-break">
      <p class="ra-hero__kicker">● Looptechniek · 2D videoanalyse</p>
      <h1 class="ra-hero__title">HARDLOOPANALYSE</h1>
      <div class="ra-hero__subrow">
        <span>${esc(a.subtitle ?? '')}</span>
        ${a.viewLabel ? `<span class="ra-hero__view">→ ${esc(a.viewLabel)}</span>` : ''}
      </div>
    </section>

    <section class="ra-grid avoid-break">
      ${cell('Naam', `<strong>${esc(patientName)}</strong>`)}
      ${cell('Datum', `<strong>${esc(fmtDate(a.performedAt))}</strong>`)}
      ${cell('Behandelaar', `<strong>${esc(therapistName)}</strong>${a.therapist.jobTitle ? ` <span class="ra-grid__muted">${esc(a.therapist.jobTitle)}</span>` : ''}`)}
      ${cell('Locatie', `<strong>${esc(a.location ?? '—')}</strong>`)}
      ${cell('Doel', `<strong>${esc(a.goal ?? '—')}</strong>`)}
    </section>

    ${renderTotal(a.items)}

    <section class="ra-section">
      <div class="ra-cat__head avoid-break">
        <span class="ra-cat__num">01</span>
        <span class="ra-cat__title">ACHTERAANZICHT</span>
        <span class="ra-cat__src">→ ${esc(REAR_SOURCE)}</span>
      </div>
      <div class="ra-cards">${rear.map(renderRearCard).join('')}</div>
    </section>

    <section class="ra-section">
      <div class="ra-cat__head avoid-break">
        <span class="ra-cat__num">02</span>
        <span class="ra-cat__title">ZIJAANZICHT</span>
        <span class="ra-cat__src">→ GROENE ZONE = IDEALE RANGE</span>
      </div>
      ${side.map(renderSideRow).join('')}
    </section>

    ${renderMetrics(a)}
    ${renderComments(a.therapistComments)}
    ${renderAdvice(a.advice)}
    ${renderNext(a.nextMoment)}

    <section class="ra-contact avoid-break">
      <div><span class="ra-contact__h">Contact</span>info@movementbasedtherapy.nl<br/>+31 (0)20 123 45 67</div>
      <div><span class="ra-contact__h">Locaties</span>Houthavens · NDSM · Oostenburg</div>
      <div><span class="ra-contact__h">Web</span>www.movementbasedtherapy.nl</div>
    </section>
  `

  return renderPdfDocument({
    documentTitle: `Hardloopanalyse, ${patientName}`,
    headerTag: 'Analysedatum',
    headerDate: a.performedAt,
    brandTag: 'Sportfysiotherapie · Amsterdam',
    contentHtml: content,
    autoPrint: opts.autoPrint,
  })
}

function cell(label: string, value: string): string {
  return `
    <div class="ra-grid__cell">
      <div class="ra-grid__label">● ${esc(label)}</div>
      <div class="ra-grid__value">${value}</div>
    </div>
  `
}

const RUNNING_CSS = `
  .ra-hero { margin-bottom: 14px; }
  .ra-hero__kicker { font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; color: #e87a55; margin: 0; }
  .ra-hero__title { font-weight: 900; font-size: 52px; line-height: 0.95; letter-spacing: -0.03em; margin: 4px 0 8px 0; color: #0A0E0F; }
  .ra-hero__subrow { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; border-top: 2px solid #0A0E0F; padding-top: 6px; font-size: 11px; color: #4A5454; }
  .ra-hero__view { font-family: ui-monospace, Menlo, monospace; font-size: 10px; white-space: nowrap; }

  .ra-grid { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid #0A0E0F; margin-bottom: 16px; }
  .ra-grid__cell { padding: 9px 11px; border-right: 1px solid #E4E8E2; }
  .ra-grid__cell:last-child { border-right: 0; }
  .ra-grid__label { font-family: ui-monospace, Menlo, monospace; font-size: 7.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #e87a55; margin-bottom: 3px; }
  .ra-grid__value { font-size: 12px; color: #0A0E0F; line-height: 1.3; }
  .ra-grid__value strong { font-weight: 800; }
  .ra-grid__muted { color: #8A9594; font-weight: 500; font-size: 10px; }

  /* Bars */
  .ra-track { position: relative; height: 12px; border-radius: 2px; overflow: hidden; background: #E4E8E2; }
  .ra-track--side { height: 11px; margin-top: 4px; }
  .ra-seg { position: absolute; top: 0; bottom: 0; }
  .ra-pin { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: #0A0E0F; z-index: 2; }
  .ra-ticks { position: relative; height: 11px; margin-top: 2px; }
  .ra-tick { position: absolute; top: 0; font-family: ui-monospace, Menlo, monospace; font-size: 7.5px; color: #8A9594; }

  /* Totaalscore */
  .ra-total { display: flex; align-items: center; gap: 20px; background: #F7F8F6; border: 1px solid #E4E8E2; border-left: 4px solid #e87a55; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; }
  .ra-total__left { flex: 0 0 auto; }
  .ra-total__label { font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #4A5454; }
  .ra-total__pct { font-weight: 900; font-size: 44px; line-height: 1; letter-spacing: -0.03em; }
  .ra-total__zone { font-family: ui-monospace, Menlo, monospace; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; }
  .ra-total__bar { flex: 1 1 auto; }

  /* Categorie-kop */
  .ra-section { margin-top: 20px; }
  .ra-cat__head { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid #0A0E0F; padding-bottom: 5px; margin-bottom: 12px; }
  .ra-cat__num { font-family: ui-monospace, Menlo, monospace; font-size: 13px; font-weight: 900; color: #e87a55; }
  .ra-cat__title { font-weight: 900; font-size: 19px; letter-spacing: -0.01em; text-transform: uppercase; color: #0A0E0F; }
  .ra-cat__src { margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #8A9594; }

  /* Achteraanzicht-cards */
  .ra-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ra-card { border: 1px solid #E4E8E2; border-radius: 8px; padding: 11px 12px; }
  .ra-card__top { display: flex; justify-content: space-between; align-items: baseline; }
  .ra-card__label { font-family: ui-monospace, Menlo, monospace; font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #4A5454; }
  .ra-card__pct { font-weight: 900; font-size: 24px; letter-spacing: -0.02em; line-height: 1; }
  .ra-card__comment { font-size: 11px; color: #0A0E0F; margin: 5px 0 9px 0; line-height: 1.35; }
  .ra-card__bar {}

  /* Zijaanzicht-rijen */
  .ra-side { margin-bottom: 13px; }
  .ra-side__top { display: flex; align-items: baseline; gap: 8px; }
  .ra-side__name { font-weight: 800; font-size: 13px; color: #0A0E0F; }
  .ra-side__ideal { font-family: ui-monospace, Menlo, monospace; font-size: 9px; color: #8A9594; }
  .ra-side__status { margin-left: auto; display: inline-flex; align-items: baseline; gap: 8px; }
  .ra-side__statuslabel { font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.1em; }
  .ra-side__val { font-weight: 900; font-size: 18px; letter-spacing: -0.02em; }
  .ra-side__comment { font-size: 11px; color: #4A5454; margin-top: 4px; line-height: 1.4; }

  /* Loopmetrics */
  .ra-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .ra-metric { border: 1px solid #E4E8E2; border-radius: 8px; padding: 11px 12px; }
  .ra-metric__label { font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #8A9594; }
  .ra-metric__value { font-weight: 900; font-size: 28px; letter-spacing: -0.03em; line-height: 1.1; color: #0A0E0F; }
  .ra-metric__unit { font-family: ui-monospace, Menlo, monospace; font-size: 9px; color: #8A9594; }
  .ra-metric__comment { font-size: 9px; color: #4A5454; line-height: 1.35; margin-top: 5px; }

  /* Opmerkingen / vervolg */
  .ra-h2 { display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #0A0E0F; margin: 0 0 10px 0; }
  .ra-h2__dot { width: 9px; height: 9px; border-radius: 999px; background: #e87a55; display: inline-block; }
  .ra-commentbox { border: 1px solid #E4E8E2; border-radius: 8px; padding: 12px 14px; font-size: 12px; line-height: 1.6; color: #0A0E0F; }
  .ra-adv__row { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid #EFF1ED; }
  .ra-adv__arrow { color: #e87a55; font-weight: 900; }
  .ra-adv__text { font-size: 12px; line-height: 1.5; color: #0A0E0F; }
  .ra-adv__text strong { font-weight: 800; }

  .ra-next { background: #0A0E0F; color: #fff; border-radius: 6px; padding: 12px 16px; margin-top: 16px; }
  .ra-next__label { font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8A9594; }
  .ra-next__moment { font-weight: 800; font-size: 14px; margin-top: 3px; }

  .ra-contact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; border-top: 3px solid #e87a55; padding-top: 10px; margin-top: 24px; font-size: 11px; color: #0A0E0F; }
  .ra-contact div:nth-child(3) { text-align: right; }
  .ra-contact__h { display: block; font-family: ui-monospace, Menlo, monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8A9594; margin-bottom: 3px; }
`
