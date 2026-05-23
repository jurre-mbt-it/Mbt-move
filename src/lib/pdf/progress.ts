import { esc, formatDateLong, formatDateShort } from './format'
import { renderPdfDocument } from './shell'
import { PRINT_PALETTE } from './styles'

export type ProgressSession = {
  id: string
  /** ISO timestamp van completedAt. */
  date: string
  durationMinutes: number
  painLevel: number | null
  exertionLevel: number | null
  notes: string | null
}

export type OneRmPoint = { date: string; oneRm: number }

export type RehabCriterionForPdf = {
  id: string
  order: number
  name: string
  targetValue: string
  targetUnit: string | null
  isBonus: boolean
  isBilateral: boolean
  status: 'NOT_MET' | 'IN_PROGRESS' | 'MET'
  measurementValue: string | null
  measurementDate: Date | string | null
  notes: string | null
}

export type RehabPhaseForPdf = {
  id: string
  order: number
  shortName: string
  name: string
  keyGoals: string[]
  typicalStartWeek: number | null
  typicalEndWeek: number | null
  progress: { total: number; met: number; inProgress: number; pct: number }
  criteria: RehabCriterionForPdf[]
}

export type RehabTrackerForPdf = {
  protocol: {
    name: string
    description: string | null
    sourceReference: string | null
  }
  surgeryDate: Date | string | null
  injuryDate: Date | string | null
  activatedAt: Date | string
  activatedByName: string
  weeksSinceSurgery: number | null
  expectedPhaseOrder: number | null
  progress: { total: number; met: number; inProgress: number; pct: number }
  phases: RehabPhaseForPdf[]
}

export type ProgressForPdf = {
  patient: { name: string | null; email: string }
  /** Datum waarop dit rapport is opgevraagd (default: now). */
  generatedAt?: Date | string
  /** Aantal dagen waarover de data gaat (default 90). */
  windowDays?: number
  sessions: ProgressSession[]
  oneRmByExercise: Record<string, OneRmPoint[]>
  totalSessions: number
  avgPain: number | null
  avgExertion: number | null
  /** Optioneel: actief rehab-protocol met fases en criteria-status. */
  rehabTracker?: RehabTrackerForPdf | null
  /**
   * Optioneel: vrije notitie van de behandelaar die bij dit rapport hoort
   * (bv toelichting voor verwijzer, advies aan de patient). Verschijnt
   * prominent bovenaan onder de patient-naam.
   */
  note?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Klein SVG-sparkline voor 1RM-tijdreeks. */
function sparkline(points: OneRmPoint[], color: string = PRINT_PALETTE.lime): string {
  if (points.length === 0) return ''
  const width = 180
  const height = 36
  const padding = 2
  const values = points.map((p) => p.oneRm)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const dx = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0
  const coords = points.map((p, i) => {
    const x = padding + i * dx
    const y = padding + (height - padding * 2) * (1 - (p.oneRm - min) / range)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polyline = `<polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}" />`
  // Eindpunt dot
  const last = points[points.length - 1]
  const lastX = padding + (points.length - 1) * dx
  const lastY = padding + (height - padding * 2) * (1 - (last.oneRm - min) / range)
  return `
    <svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${polyline}
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.5" fill="${color}" />
    </svg>
  `
}

// ── Sections ───────────────────────────────────────────────────────────
function renderHero(p: ProgressForPdf): string {
  const patientName = p.patient.name ?? p.patient.email
  const windowDays = p.windowDays ?? 90
  return `
    <section class="pdf-hero avoid-break">
      <div>
        <p class="pdf-hero__kicker">Voortgangsrapport</p>
        <h1 class="pdf-hero__title">${esc(patientName)}</h1>
        <p class="pdf-hero__sub">Laatste ${windowDays} dagen &middot; ${p.totalSessions} ${p.totalSessions === 1 ? 'sessie' : 'sessies'}</p>
      </div>
      <div style="text-align:right;">
        <p class="meta">Gegenereerd</p>
        <p class="display display-md" style="margin-top:4px;">${esc(formatDateLong(p.generatedAt ?? new Date()))}</p>
      </div>
    </section>
  `
}


function renderOneRm(byExercise: Record<string, OneRmPoint[]>): string {
  const entries = Object.entries(byExercise).filter(([, pts]) => pts.length > 0)
  if (entries.length === 0) return ''

  // Sorteer op aantal datapunten desc (meest gelogde eerst)
  entries.sort((a, b) => b[1].length - a[1].length)

  const rows = entries
    .map(([name, pts]) => {
      const sorted = [...pts].sort((a, b) => (a.date < b.date ? -1 : 1))
      const start = sorted[0]
      const current = sorted[sorted.length - 1]
      const diff = current.oneRm - start.oneRm
      const diffColor =
        diff > 0 ? PRINT_PALETTE.lime : diff < 0 ? PRINT_PALETTE.danger : PRINT_PALETTE.inkMuted
      const sign = diff > 0 ? '+' : ''
      return `
        <tr class="avoid-break">
          <td><strong>${esc(name)}</strong></td>
          <td>${sparkline(sorted, diffColor)}</td>
          <td class="num">${start.oneRm}<span style="color:#8A9594;font-size:9px;"> kg</span></td>
          <td class="num"><strong>${current.oneRm}</strong><span style="color:#8A9594;font-size:9px;"> kg</span></td>
          <td class="num" style="color:${diffColor}; font-weight:700;">${sign}${diff}<span style="color:#8A9594;font-size:9px;font-weight:400;"> kg</span></td>
          <td class="num">${sorted.length}</td>
        </tr>
      `
    })
    .join('')

  return `
    <section class="section">
      <div class="section__bar">
        <span class="section__title">Krachtopbouw &mdash; geschat 1RM</span>
        <span class="section__count">${entries.length} ${entries.length === 1 ? 'oefening' : 'oefeningen'}</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Oefening</th>
            <th style="width:190px;">Trend</th>
            <th class="num" style="width:55px;">Start</th>
            <th class="num" style="width:60px;">Huidig</th>
            <th class="num" style="width:55px;">Verschil</th>
            <th class="num" style="width:32px;">Sets</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `
}

function renderNoteBlock(note: string | null | undefined): string {
  if (!note || !note.trim()) return ''
  return `
    <section class="tile tile--accent avoid-break" style="margin-bottom:16px;">
      <p class="meta">Notitie behandelaar</p>
      <p style="margin-top:6px; line-height:1.55; white-space:pre-wrap; font-size:12.5px;">${esc(note.trim())}</p>
    </section>
  `
}

// ── Rehab protocol sectie ──────────────────────────────────────────────
function statusBadge(status: 'NOT_MET' | 'IN_PROGRESS' | 'MET'): string {
  if (status === 'MET') return `<span class="badge badge--pass">behaald</span>`
  if (status === 'IN_PROGRESS') return `<span class="badge badge--partial">bezig</span>`
  return `<span class="badge badge--none">open</span>`
}

function statusRowClass(status: 'NOT_MET' | 'IN_PROGRESS' | 'MET'): string {
  if (status === 'MET') return 'row--pass'
  if (status === 'IN_PROGRESS') return 'row--partial'
  return 'row--none'
}

/** Mini-fillbar voor fase-voortgang (0-100%). */
function progressBar(pct: number, color: string): string {
  const clamped = Math.max(0, Math.min(100, pct))
  return `
    <span style="display:inline-block; width:80px; height:6px; background:${PRINT_PALETTE.line}; border-radius:3px; overflow:hidden; vertical-align:middle; margin-right:6px;">
      <span style="display:block; width:${clamped}%; height:100%; background:${color}; border-radius:3px;"></span>
    </span>
  `
}

function renderRehabPhase(phase: RehabPhaseForPdf, isExpected: boolean): string {
  const phaseColor =
    phase.progress.pct === 100
      ? PRINT_PALETTE.lime
      : phase.progress.pct > 0
        ? PRINT_PALETTE.gold
        : PRINT_PALETTE.inkDim
  const weekRange =
    phase.typicalStartWeek != null
      ? `WEEK ${phase.typicalStartWeek}${
          phase.typicalEndWeek != null && phase.typicalEndWeek !== phase.typicalStartWeek
            ? `–${phase.typicalEndWeek}`
            : '+'
        }`
      : null

  // Filter ouvertures: criteria met meting EERST, daarna gewone, met bonus achteraan
  const criteriaSorted = [...phase.criteria].sort((a, b) => {
    if (a.isBonus !== b.isBonus) return a.isBonus ? 1 : -1
    return a.order - b.order
  })

  const criteriaRows = criteriaSorted
    .map((c) => {
      const dateStr = c.measurementDate ? formatDateShort(c.measurementDate) : ''
      const meas = c.measurementValue
        ? `<strong>${esc(c.measurementValue)}</strong>`
        : `<span style="color:${PRINT_PALETTE.inkDim};">—</span>`
      return `
        <div class="row ${statusRowClass(c.status)}">
          <div class="row__main">
            <div class="row__name">
              ${esc(c.name)}
              ${c.isBilateral ? `<span class="meta" style="margin-left:6px; font-size:8px;">L/R</span>` : ''}
              ${c.isBonus ? `<span class="meta" style="margin-left:6px; font-size:8px; color:${PRINT_PALETTE.ice};">BONUS</span>` : ''}
            </div>
            <div style="display:flex; gap:14px; align-items:baseline; margin-top:3px; flex-wrap:wrap;">
              <span class="meta">Doel: ${esc(c.targetValue)}${c.targetUnit ? ` ${esc(c.targetUnit)}` : ''}</span>
              <span style="font-size:11px; color:${PRINT_PALETTE.ink};">
                Meting: ${meas}${c.targetUnit && c.measurementValue ? `<span style="color:${PRINT_PALETTE.inkMuted};"> ${esc(c.targetUnit)}</span>` : ''}
              </span>
              ${dateStr ? `<span class="meta">${esc(dateStr)}</span>` : ''}
            </div>
            ${c.notes ? `<div class="row__notes">${esc(c.notes)}</div>` : ''}
          </div>
          ${statusBadge(c.status)}
        </div>
      `
    })
    .join('')

  const keyGoals = phase.keyGoals && phase.keyGoals.length > 0
    ? `
      <div style="margin-top:6px;">
        <span class="meta">Doelen:</span>
        <span style="font-size:11px; color:${PRINT_PALETTE.ink}; margin-left:6px;">
          ${phase.keyGoals.map(esc).join(' &middot; ')}
        </span>
      </div>
    `
    : ''

  const expectedBadge = isExpected
    ? `<span class="badge badge--pass" style="margin-left:8px;">verwacht nu</span>`
    : ''

  return `
    <div class="tile avoid-break" style="${isExpected ? `border-left:4px solid ${PRINT_PALETTE.lime}; padding-left:14px;` : ''}">
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
          <span class="meta-lg" style="font-size:13px;">${esc(phase.shortName)}</span>
          <span style="color:${PRINT_PALETTE.inkMuted}; font-size:12px;">${esc(phase.name)}</span>
          ${expectedBadge}
          ${weekRange ? `<span class="meta" style="margin-left:4px;">${weekRange}</span>` : ''}
        </div>
        <div style="display:flex; align-items:center;">
          ${progressBar(phase.progress.pct, phaseColor)}
          <span class="meta-lg" style="font-size:11px;">
            ${phase.progress.met}/${phase.progress.total}
          </span>
        </div>
      </div>
      ${keyGoals}
      <div style="margin-top:10px;">${criteriaRows}</div>
    </div>
  `
}

function renderRehabSection(tracker: RehabTrackerForPdf): string {
  const surgeryStr = tracker.surgeryDate ? formatDateLong(tracker.surgeryDate) : null
  const injuryStr = tracker.injuryDate ? formatDateLong(tracker.injuryDate) : null
  const weeksLabel = tracker.weeksSinceSurgery != null
    ? `${tracker.weeksSinceSurgery >= 0 ? tracker.weeksSinceSurgery : `pre-op ${Math.abs(tracker.weeksSinceSurgery)}`} wkn`
    : '—'
  const overallColor =
    tracker.progress.pct >= 80 ? PRINT_PALETTE.lime
    : tracker.progress.pct >= 40 ? PRINT_PALETTE.gold
    : PRINT_PALETTE.danger

  const expectedPhase = tracker.expectedPhaseOrder != null
    ? tracker.phases.find((p) => p.order === tracker.expectedPhaseOrder)
    : null

  return `
    <section class="section">
      <div class="section__bar">
        <span class="section__title">Protocol &mdash; ${esc(tracker.protocol.name)}</span>
        <span class="section__count">${tracker.progress.met}/${tracker.progress.total} criteria behaald</span>
      </div>

      <div class="stats-grid avoid-break" style="margin-top:10px; grid-template-columns: repeat(4, 1fr);">
        <div class="stat">
          <p class="meta">Operatie</p>
          <p class="stat__value" style="font-size:18px;">${surgeryStr ? esc(surgeryStr) : '—'}</p>
        </div>
        <div class="stat">
          <p class="meta">Sinds operatie</p>
          <p class="stat__value" style="color:${PRINT_PALETTE.ice};">${esc(weeksLabel)}</p>
        </div>
        <div class="stat">
          <p class="meta">Verwachte fase</p>
          <p class="stat__value" style="font-size:18px;">${expectedPhase ? esc(expectedPhase.shortName) : '—'}</p>
          ${expectedPhase ? `<p class="stat__sub">${esc(expectedPhase.name)}</p>` : ''}
        </div>
        <div class="stat">
          <p class="meta">Totale voortgang</p>
          <p class="stat__value" style="color:${overallColor};">${tracker.progress.pct}<span style="font-size:14px;color:#8A9594;">%</span></p>
          <p class="stat__sub">${tracker.progress.met} behaald · ${tracker.progress.inProgress} bezig</p>
        </div>
      </div>

      ${injuryStr ? `
        <p class="meta" style="margin-top:8px;">Blessuredatum: <span style="font-family:inherit; text-transform:none; letter-spacing:0; color:${PRINT_PALETTE.ink}; font-weight:400;">${esc(injuryStr)}</span></p>
      ` : ''}

      <div style="margin-top:12px;">
        ${tracker.phases
          .map((phase) => renderRehabPhase(phase, phase.order === tracker.expectedPhaseOrder))
          .join('')}
      </div>
    </section>
  `
}

// ── Main entry ────────────────────────────────────────────────────────
export function renderProgressPdfHtml(opts: {
  progress: ProgressForPdf
  autoPrint?: boolean
}): string {
  const p = opts.progress
  const patientName = p.patient.name ?? p.patient.email

  const content = `
    ${renderHero(p)}
    ${renderNoteBlock(p.note)}
    ${p.rehabTracker ? renderRehabSection(p.rehabTracker) : ''}
    ${renderOneRm(p.oneRmByExercise)}
  `

  return renderPdfDocument({
    documentTitle: `Voortgangsrapport — ${patientName}`,
    headerTag: 'Voortgangsrapport',
    headerDate: p.generatedAt ?? new Date(),
    contentHtml: content,
    autoPrint: opts.autoPrint,
  })
}
