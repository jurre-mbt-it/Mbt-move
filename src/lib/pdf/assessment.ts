import { esc, formatDateLong } from './format'
import { renderPdfDocument } from './shell'

// ── Types ──────────────────────────────────────────────────────────────
type Score = 'NOT_TESTED' | 'FAIL' | 'PARTIAL' | 'PASS'

type Archetype =
  | 'LUMBAR_SPINE' | 'SQUAT_HINGE' | 'PISTOL' | 'LUNGE' | 'THORACIC_SPINE'
  | 'OVERHEAD' | 'FRONT_RACK' | 'PRESS' | 'HANG' | 'BREATHING'

type TestType = 'ACTIVE' | 'PASSIVE' | 'MOTOR_CONTROL' | 'BREATHING'

type Tissue = 'JOINT' | 'SLIDING_SURFACE' | 'MUSCLE_DYNAMICS' | 'MOTOR_CONTROL'

export type AssessmentTestScoreInput = {
  score: Score
  notes: string | null
  test: {
    id: string
    name: string
    description: string
    criteria: string
    testType: TestType
    archetype: Archetype
    order: number
    suggestedMobilizations: Array<{
      exercise: { id: string; name: string; category: string }
    }>
  }
}

export type AssessmentArchetypeSummaryInput = {
  archetype: Archetype
  compensationStrategy: string | null
  primaryTissue: Tissue | null
  mobilityJoint: string | null
  mobilitySlidingSurface: string | null
  mobilityLoadedEndRange: string | null
  motorSkillTransfer: string | null
  motorMovementModification: string | null
}

export type AssessmentForPdf = {
  performedAt: Date | string
  notes: string | null
  patient: { name: string | null; email: string }
  therapist: { name: string | null; email: string }
  scores: AssessmentTestScoreInput[]
  archetypeSummaries: AssessmentArchetypeSummaryInput[]
}

// ── Labels ─────────────────────────────────────────────────────────────
const ARCHETYPE_ORDER: Archetype[] = [
  'LUMBAR_SPINE', 'SQUAT_HINGE', 'PISTOL', 'LUNGE', 'THORACIC_SPINE',
  'OVERHEAD', 'FRONT_RACK', 'PRESS', 'HANG', 'BREATHING',
]

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  LUMBAR_SPINE: 'Lumbar Spine',
  SQUAT_HINGE: 'Squat / Hinge',
  PISTOL: 'Pistol',
  LUNGE: 'Lunge',
  THORACIC_SPINE: 'Thoracic Spine',
  OVERHEAD: 'Overhead',
  FRONT_RACK: 'Front Rack',
  PRESS: 'Press',
  HANG: 'Hang',
  BREATHING: 'Breathing',
}

const TEST_TYPE_LABEL: Record<TestType, string> = {
  ACTIVE: 'Active',
  PASSIVE: 'Passive',
  MOTOR_CONTROL: 'Motor Control',
  BREATHING: 'Breathing',
}

const TISSUE_LABEL: Record<Tissue, string> = {
  JOINT: 'Joint',
  SLIDING_SURFACE: 'Sliding Surface',
  MUSCLE_DYNAMICS: 'Muscle Dynamics',
  MOTOR_CONTROL: 'Motor Control',
}

const SCORE_BADGE: Record<Score, string> = {
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  FAIL: 'FAIL',
  NOT_TESTED: '—',
}

const SCORE_CLASS: Record<Score, string> = {
  PASS: 'pass',
  PARTIAL: 'partial',
  FAIL: 'fail',
  NOT_TESTED: 'none',
}

// ── Render helpers ─────────────────────────────────────────────────────
function renderHero(a: AssessmentForPdf, counts: { scored: number; pass: number; partial: number; fail: number }): string {
  const patientName = a.patient.name ?? a.patient.email
  const therapistName = a.therapist.name ?? a.therapist.email
  return `
    <section class="pdf-hero avoid-break">
      <div>
        <p class="pdf-hero__kicker">Mobility Assessment</p>
        <h1 class="pdf-hero__title">${esc(patientName)}</h1>
        <p class="pdf-hero__sub">${esc(formatDateLong(a.performedAt))} &middot; door ${esc(therapistName)}</p>
      </div>
      <div style="text-align: right;">
        <p class="meta">Tests gescoord</p>
        <p class="display display-lg" style="margin-top:4px;">${counts.scored}</p>
        <div class="stoplight" style="justify-content:flex-end; margin-top:8px;">
          ${chip('lime', counts.pass, 'pass')}
          ${chip('gold', counts.partial, 'part')}
          ${chip('danger', counts.fail, 'fail')}
        </div>
      </div>
    </section>
  `
}

function chip(tone: 'lime' | 'gold' | 'danger', count: number, label: string): string {
  const colorMap = { lime: '#65A30D', gold: '#D97706', danger: '#DC2626' }
  return `
    <span class="stoplight__chip">
      <span class="stoplight__dot" style="background:${colorMap[tone]};"></span>
      ${count} ${esc(label.toUpperCase())}
    </span>
  `
}

function renderAssessmentNotes(notes: string | null): string {
  if (!notes || !notes.trim()) return ''
  return `
    <section class="tile tile--accent avoid-break">
      <p class="meta">Algemene notitie</p>
      <p style="margin-top:6px; line-height:1.5; white-space:pre-wrap;">${esc(notes)}</p>
    </section>
  `
}

/** 4-up samenvatting per archetype: naam + score-counts in stoplight chips. */
function renderArchetypeOverview(byArchetype: Map<Archetype, AssessmentTestScoreInput[]>): string {
  const rows = ARCHETYPE_ORDER.map((arch) => {
    const tests = byArchetype.get(arch) ?? []
    const pass = tests.filter((t) => t.score === 'PASS').length
    const partial = tests.filter((t) => t.score === 'PARTIAL').length
    const fail = tests.filter((t) => t.score === 'FAIL').length
    const scored = pass + partial + fail
    if (scored === 0) return null
    return `
      <div class="row row--${fail > 0 ? 'fail' : partial > 0 ? 'partial' : 'pass'}">
        <div class="row__main">
          <div class="row__name">${esc(ARCHETYPE_LABEL[arch])}</div>
          <div class="stoplight">
            ${pass > 0 ? chip('lime', pass, 'pass') : ''}
            ${partial > 0 ? chip('gold', partial, 'part') : ''}
            ${fail > 0 ? chip('danger', fail, 'fail') : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="display display-md">${scored}</span>
          <span class="meta" style="margin-left:4px;">tests</span>
        </div>
      </div>
    `
  }).filter(Boolean)

  if (rows.length === 0) return ''

  return `
    <section class="avoid-break" style="margin-top:18px;">
      <div class="section__bar">
        <span class="section__title">Samenvatting per archetype</span>
      </div>
      <div style="margin-top:10px;">${rows.join('')}</div>
    </section>
  `
}

/** Per-archetype detailsectie: tests + mobilizations + programming template. */
function renderArchetypeDetail(
  arch: Archetype,
  tests: AssessmentTestScoreInput[],
  summary: AssessmentArchetypeSummaryInput | undefined,
): string {
  // Skip archetypes zonder data (geen scored tests + geen summary)
  const scoredTests = tests.filter((t) => t.score !== 'NOT_TESTED')
  const hasSummary = summary && (
    summary.compensationStrategy || summary.primaryTissue
    || summary.mobilityJoint || summary.mobilitySlidingSurface
    || summary.mobilityLoadedEndRange || summary.motorSkillTransfer
    || summary.motorMovementModification
  )
  if (scoredTests.length === 0 && !hasSummary) return ''

  // Tests groeperen per type, dan per order
  const byType = new Map<TestType, AssessmentTestScoreInput[]>()
  for (const t of scoredTests) {
    const arr = byType.get(t.test.testType) ?? []
    arr.push(t)
    byType.set(t.test.testType, arr)
  }
  for (const arr of byType.values()) arr.sort((a, b) => a.test.order - b.test.order)

  const pass = scoredTests.filter((t) => t.score === 'PASS').length
  const partial = scoredTests.filter((t) => t.score === 'PARTIAL').length
  const fail = scoredTests.filter((t) => t.score === 'FAIL').length

  const testsHtml = (['ACTIVE', 'PASSIVE', 'MOTOR_CONTROL', 'BREATHING'] as const)
    .map((type) => {
      const items = byType.get(type) ?? []
      if (items.length === 0) return ''
      return `
        <div style="margin-top:10px;">
          <p class="meta">${esc(TEST_TYPE_LABEL[type])}</p>
          <div style="margin-top:6px;">
            ${items.map(renderTestRow).join('')}
          </div>
        </div>
      `
    })
    .join('')

  return `
    <section class="section avoid-break">
      <div class="section__bar">
        <span class="section__title">${esc(ARCHETYPE_LABEL[arch])}</span>
        <span class="section__count">${pass} P &middot; ${partial} PA &middot; ${fail} F</span>
      </div>
      ${testsHtml}
      ${hasSummary && summary ? renderSummary(summary) : ''}
    </section>
  `
}

function renderTestRow(t: AssessmentTestScoreInput): string {
  const klass = SCORE_CLASS[t.score]
  const badge = SCORE_BADGE[t.score]
  const showMobilizations = t.score === 'FAIL' && t.test.suggestedMobilizations.length > 0
  return `
    <div class="row row--${klass}">
      <div class="row__main">
        <div class="row__name">${esc(t.test.name)}</div>
        ${t.notes ? `<div class="row__notes">${esc(t.notes)}</div>` : ''}
        ${
          showMobilizations
            ? `
              <div class="mobilizations">
                <div class="mobilizations__label">Voorgestelde mobilisaties</div>
                <ul class="mobilizations__list">
                  ${t.test.suggestedMobilizations
                    .map(
                      (m) => `
                        <li class="mobilizations__item">
                          ${esc(m.exercise.name)}
                          <span class="mobilizations__cat">${esc(m.exercise.category)}</span>
                        </li>
                      `,
                    )
                    .join('')}
                </ul>
              </div>
            `
            : ''
        }
      </div>
      <span class="badge badge--${klass}">${esc(badge)}</span>
    </div>
  `
}

function renderSummary(s: AssessmentArchetypeSummaryInput): string {
  const rows: Array<[string, string | null]> = [
    ['Compensation', s.compensationStrategy],
    ['Primary tissue', s.primaryTissue ? TISSUE_LABEL[s.primaryTissue] : null],
    ['Mobility · joint', s.mobilityJoint],
    ['Mobility · sliding surface', s.mobilitySlidingSurface],
    ['Mobility · loaded end-range', s.mobilityLoadedEndRange],
    ['Motor · skill transfer', s.motorSkillTransfer],
    ['Motor · movement modification', s.motorMovementModification],
  ]
  const visible = rows.filter(([, v]) => v && v.trim())
  if (visible.length === 0) return ''
  return `
    <div class="summary avoid-break">
      <p class="meta" style="margin-bottom:6px;">Programming template</p>
      ${visible
        .map(
          ([label, value]) => `
            <div class="summary__row">
              <div class="summary__label">${esc(label)}</div>
              <div class="summary__value">${esc(value ?? '')}</div>
            </div>
          `,
        )
        .join('')}
    </div>
  `
}

// ── Main entry ────────────────────────────────────────────────────────
export function renderAssessmentPdfHtml(opts: {
  assessment: AssessmentForPdf
  autoPrint?: boolean
}): string {
  const a = opts.assessment
  const patientName = a.patient.name ?? a.patient.email

  const byArchetype = new Map<Archetype, AssessmentTestScoreInput[]>()
  for (const s of a.scores) {
    const arr = byArchetype.get(s.test.archetype) ?? []
    arr.push(s)
    byArchetype.set(s.test.archetype, arr)
  }

  const summaryByArchetype = new Map<Archetype, AssessmentArchetypeSummaryInput>()
  for (const s of a.archetypeSummaries) summaryByArchetype.set(s.archetype, s)

  const counts = {
    pass: a.scores.filter((s) => s.score === 'PASS').length,
    partial: a.scores.filter((s) => s.score === 'PARTIAL').length,
    fail: a.scores.filter((s) => s.score === 'FAIL').length,
    scored: 0,
  }
  counts.scored = counts.pass + counts.partial + counts.fail

  const content = `
    ${renderHero(a, counts)}
    ${renderAssessmentNotes(a.notes)}
    ${renderArchetypeOverview(byArchetype)}
    ${ARCHETYPE_ORDER.map((arch) =>
      renderArchetypeDetail(arch, byArchetype.get(arch) ?? [], summaryByArchetype.get(arch)),
    ).join('')}
  `

  return renderPdfDocument({
    documentTitle: `Mobility Assessment, ${patientName}`,
    headerTag: 'Mobility Assessment',
    headerDate: a.performedAt,
    contentHtml: content,
    autoPrint: opts.autoPrint,
  })
}
