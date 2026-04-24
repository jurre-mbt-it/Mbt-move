/**
 * Assessment detail — take of view een assessment.
 * Tabs per archetype, stoplicht-score per test, programming template per archetype.
 */
'use client'

import { use, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkHeader,
  DarkInput,
  DarkScreen,
  DarkSelect,
  DarkTabs as Tabs,
  DarkTabsContent as TabsContent,
  DarkTabsList as TabsList,
  DarkTabsTrigger as TabsTrigger,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

type ScoreValue = 'NOT_TESTED' | 'FAIL' | 'PARTIAL' | 'PASS'
type Archetype =
  | 'LUMBAR_SPINE'
  | 'SQUAT_HINGE'
  | 'PISTOL'
  | 'LUNGE'
  | 'THORACIC_SPINE'
  | 'OVERHEAD'
  | 'FRONT_RACK'
  | 'PRESS'
  | 'HANG'
  | 'BREATHING'

const ARCHETYPE_ORDER: Archetype[] = [
  'LUMBAR_SPINE',
  'SQUAT_HINGE',
  'PISTOL',
  'LUNGE',
  'THORACIC_SPINE',
  'OVERHEAD',
  'FRONT_RACK',
  'PRESS',
  'HANG',
  'BREATHING',
]

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  LUMBAR_SPINE: 'Lumbar',
  SQUAT_HINGE: 'Squat/Hinge',
  PISTOL: 'Pistol',
  LUNGE: 'Lunge',
  THORACIC_SPINE: 'Thoracic',
  OVERHEAD: 'Overhead',
  FRONT_RACK: 'Front Rack',
  PRESS: 'Press',
  HANG: 'Hang',
  BREATHING: 'Breathing',
}

const SCORE_COLOR: Record<ScoreValue, string> = {
  NOT_TESTED: P.inkDim,
  FAIL: P.danger,
  PARTIAL: P.gold,
  PASS: P.lime,
}

const SCORE_BG: Record<ScoreValue, string> = {
  NOT_TESTED: P.surfaceHi,
  FAIL: 'rgba(248,113,113,0.12)',
  PARTIAL: 'rgba(244,194,97,0.14)',
  PASS: 'rgba(190,242,100,0.14)',
}

const SCORE_LABEL: Record<ScoreValue, string> = {
  NOT_TESTED: '—',
  FAIL: 'FAIL',
  PARTIAL: 'PARTIAL',
  PASS: 'PASS',
}

const TEST_TYPE_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  PASSIVE: 'Passive',
  MOTOR_CONTROL: 'Motor Control',
  BREATHING: 'Breathing',
}

const TISSUE_LABEL: Record<string, string> = {
  JOINT: 'Joint',
  SLIDING_SURFACE: 'Sliding Surface',
  MUSCLE_DYNAMICS: 'Muscle Dynamics',
  MOTOR_CONTROL: 'Motor Control',
}

export default function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: assessment, isLoading } = trpc.assessments.get.useQuery({ id })
  const { data: tests = [] } = trpc.assessments.listTests.useQuery()
  const utils = trpc.useUtils()

  const scoreMutation = trpc.assessments.scoreTest.useMutation({
    onSuccess: () => utils.assessments.get.invalidate({ id }),
    onError: (e) => toast.error(e.message),
  })
  const summaryMutation = trpc.assessments.upsertArchetypeSummary.useMutation({
    onSuccess: () => utils.assessments.get.invalidate({ id }),
    onError: (e) => toast.error(e.message),
  })
  const deleteMutation = trpc.assessments.delete.useMutation({
    onSuccess: () => {
      toast.success('Assessment verwijderd')
      router.push('/therapist/assessments')
    },
    onError: (e) => toast.error(e.message),
  })

  const scoreByTestId = useMemo(() => {
    const m = new Map<string, ScoreValue>()
    assessment?.scores.forEach((s) => m.set(s.testId, s.score as ScoreValue))
    return m
  }, [assessment])

  const scoreRowByTestId = useMemo(() => {
    const m = new Map<string, { notes: string | null } | undefined>()
    assessment?.scores.forEach((s) => m.set(s.testId, { notes: s.notes }))
    return m
  }, [assessment])

  const summaryByArchetype = useMemo(() => {
    const m = new Map<Archetype, NonNullable<typeof assessment>['archetypeSummaries'][number]>()
    assessment?.archetypeSummaries.forEach((s) => m.set(s.archetype as Archetype, s))
    return m
  }, [assessment])

  const testsByArchetype = useMemo(() => {
    const groups = new Map<Archetype, typeof tests>()
    tests.forEach((t) => {
      const arr = groups.get(t.archetype as Archetype) ?? []
      arr.push(t)
      groups.set(t.archetype as Archetype, arr)
    })
    return groups
  }, [tests])

  if (isLoading) {
    return (
      <DarkScreen>
        <DarkHeader title="Assessment" backHref="/therapist/assessments" />
        <div className="p-6">
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
            LADEN…
          </span>
        </div>
      </DarkScreen>
    )
  }
  if (!assessment) {
    return (
      <DarkScreen>
        <DarkHeader title="Niet gevonden" backHref="/therapist/assessments" />
      </DarkScreen>
    )
  }

  const patientName = assessment.patient.name ?? assessment.patient.email
  const totalScored = assessment.scores.filter((s) => s.score !== 'NOT_TESTED').length
  const passCount = assessment.scores.filter((s) => s.score === 'PASS').length
  const failCount = assessment.scores.filter((s) => s.score === 'FAIL').length
  const partialCount = assessment.scores.filter((s) => s.score === 'PARTIAL').length

  return (
    <DarkScreen>
      <DarkHeader title="Assessment" backHref="/therapist/assessments" />
      <div className="max-w-5xl w-full mx-auto px-4 py-4 space-y-5">
        <Tile>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <Kicker>Assessment</Kicker>
              <h1
                className="athletic-display"
                style={{ fontSize: 26, lineHeight: '30px', letterSpacing: '-0.02em', paddingTop: 4 }}
              >
                {patientName.toUpperCase()}
              </h1>
              <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, marginTop: 4, letterSpacing: '0.06em' }}>
                {new Date(assessment.performedAt).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                · {assessment.therapist.name ?? assessment.therapist.email}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
                TESTS GESCOORD
              </p>
              <p
                className="athletic-display"
                style={{ fontSize: 26, lineHeight: '30px', fontWeight: 900, letterSpacing: '-0.02em', marginTop: 2 }}
              >
                {totalScored}/{tests.length}
              </p>
              <div className="flex gap-1.5 mt-1 justify-end">
                <span className="athletic-mono" style={{ color: P.lime, fontSize: 10, letterSpacing: '0.08em' }}>
                  {passCount} PASS
                </span>
                <span className="athletic-mono" style={{ color: P.gold, fontSize: 10, letterSpacing: '0.08em' }}>
                  {partialCount} PART
                </span>
                <span className="athletic-mono" style={{ color: P.danger, fontSize: 10, letterSpacing: '0.08em' }}>
                  {failCount} FAIL
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <DarkButton
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Assessment verwijderen? Alle scores + samenvattingen gaan mee.')) {
                  deleteMutation.mutate({ id })
                }
              }}
            >
              Verwijder
            </DarkButton>
          </div>
        </Tile>

        <Tabs defaultValue="LUMBAR_SPINE" className="space-y-4">
          <TabsList
            className="w-full grid grid-cols-5 md:grid-cols-10 rounded-xl"
            style={{ background: P.surface, border: `1px solid ${P.line}` }}
          >
            {ARCHETYPE_ORDER.map((arch) => {
              const archTests = testsByArchetype.get(arch) ?? []
              const archScored = archTests.filter((t) => {
                const sv = scoreByTestId.get(t.id) ?? 'NOT_TESTED'
                return sv !== 'NOT_TESTED'
              }).length
              const archPass = archTests.filter((t) => scoreByTestId.get(t.id) === 'PASS').length
              const archFail = archTests.filter((t) => scoreByTestId.get(t.id) === 'FAIL').length
              const dotColor =
                archFail > 0 ? P.danger : archPass === archTests.length && archTests.length > 0 ? P.lime : archScored > 0 ? P.gold : P.inkDim
              return (
                <TabsTrigger key={arch} value={arch} className="text-xs px-1">
                  <span className="flex items-center gap-1">
                    <span
                      aria-hidden
                      style={{ width: 6, height: 6, borderRadius: 999, background: dotColor }}
                    />
                    {ARCHETYPE_LABEL[arch]}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {ARCHETYPE_ORDER.map((arch) => {
            const archTests = testsByArchetype.get(arch) ?? []
            const summary = summaryByArchetype.get(arch)
            return (
              <TabsContent key={arch} value={arch} className="space-y-3">
                {archTests.length === 0 && (
                  <Tile>
                    <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                      Geen tests voor deze archetype geseed.
                    </p>
                  </Tile>
                )}

                {/* Group tests by type */}
                {(['ACTIVE', 'PASSIVE', 'MOTOR_CONTROL', 'BREATHING'] as const).map((type) => {
                  const typed = archTests.filter((t) => t.testType === type)
                  if (typed.length === 0) return null
                  return (
                    <div key={type} className="space-y-2">
                      <MetaLabel>{TEST_TYPE_LABEL[type]}</MetaLabel>
                      {typed.map((t) => (
                        <TestRow
                          key={t.id}
                          test={t}
                          currentScore={scoreByTestId.get(t.id) ?? 'NOT_TESTED'}
                          currentNotes={scoreRowByTestId.get(t.id)?.notes ?? null}
                          onScore={(score, notes) =>
                            scoreMutation.mutate({
                              assessmentId: id,
                              testId: t.id,
                              score,
                              notes,
                            })
                          }
                        />
                      ))}
                    </div>
                  )
                })}

                {/* Programming template + compensation + tissue */}
                <ArchetypeSummaryEditor
                  archetype={arch}
                  summary={summary}
                  onSave={(data) =>
                    summaryMutation.mutate({
                      assessmentId: id,
                      archetype: arch,
                      ...data,
                    })
                  }
                  busy={summaryMutation.isPending}
                />
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </DarkScreen>
  )
}

function TestRow({
  test,
  currentScore,
  currentNotes,
  onScore,
}: {
  test: {
    id: string
    name: string
    description: string
    criteria: string
    suggestedMobilizations: Array<{
      id: string
      exercise: { id: string; name: string; category: string }
    }>
  }
  currentScore: ScoreValue
  currentNotes: string | null
  onScore: (score: ScoreValue, notes: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(currentNotes ?? '')

  function setScore(score: ScoreValue) {
    onScore(score, notes || null)
  }

  return (
    <div
      className="rounded-lg"
      style={{
        background: SCORE_BG[currentScore],
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${SCORE_COLOR[currentScore]}`,
        padding: '10px 12px',
      }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{test.name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(['FAIL', 'PARTIAL', 'PASS'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScore(s)}
              aria-label={SCORE_LABEL[s]}
              className="athletic-tap"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: currentScore === s ? SCORE_COLOR[s] : 'transparent',
                color: currentScore === s ? P.bg : P.inkMuted,
                border: `1px solid ${currentScore === s ? SCORE_COLOR[s] : P.lineStrong}`,
                fontSize: 11,
                fontWeight: 900,
                fontFamily: 'Menlo, monospace',
              }}
            >
              {s === 'FAIL' ? 'R' : s === 'PARTIAL' ? 'O' : 'G'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="athletic-mono"
            style={{
              color: P.inkMuted,
              fontSize: 10,
              letterSpacing: '0.12em',
              padding: '4px 8px',
              marginLeft: 4,
            }}
          >
            {expanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3" style={{ paddingTop: 10, borderTop: `1px solid ${P.line}` }}>
          <div>
            <MetaLabel style={{ color: P.inkMuted }}>Uitvoering</MetaLabel>
            <p style={{ color: P.ink, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{test.description}</p>
          </div>
          <div>
            <MetaLabel style={{ color: P.inkMuted }}>Pass-criteria</MetaLabel>
            <p style={{ color: P.ink, fontSize: 12, lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-line' }}>
              {test.criteria}
            </p>
          </div>
          <div>
            <MetaLabel style={{ color: P.inkMuted }}>Notitie</MetaLabel>
            <DarkTextarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaties bij deze test"
            />
            <div className="mt-2 text-right">
              <DarkButton size="sm" variant="secondary" onClick={() => setScore(currentScore)}>
                Notitie opslaan
              </DarkButton>
            </div>
          </div>

          {currentScore === 'FAIL' && test.suggestedMobilizations.length > 0 && (
            <div
              className="rounded-lg"
              style={{ background: P.surfaceHi, padding: '10px 12px', border: `1px solid ${P.line}` }}
            >
              <MetaLabel style={{ color: P.danger }}>Voorgestelde mobilisaties</MetaLabel>
              <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 2, letterSpacing: '0.06em' }}>
                3 suggesties uit de oefeningen-catalog
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {test.suggestedMobilizations.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2"
                    style={{
                      background: P.surface,
                      borderRadius: 6,
                      padding: '6px 10px',
                      border: `1px solid ${P.line}`,
                    }}
                  >
                    <span style={{ color: P.ink, fontSize: 12, fontWeight: 700 }}>{m.exercise.name}</span>
                    <span
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.1em' }}
                    >
                      {m.exercise.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ArchetypeSummaryEditor({
  archetype,
  summary,
  onSave,
  busy,
}: {
  archetype: Archetype
  summary?: {
    compensationStrategy: string | null
    primaryTissue: string | null
    mobilityJoint: string | null
    mobilitySlidingSurface: string | null
    mobilityLoadedEndRange: string | null
    motorSkillTransfer: string | null
    motorMovementModification: string | null
  }
  onSave: (data: {
    compensationStrategy: string | null
    primaryTissue: 'JOINT' | 'SLIDING_SURFACE' | 'MUSCLE_DYNAMICS' | 'MOTOR_CONTROL' | null
    mobilityJoint: string | null
    mobilitySlidingSurface: string | null
    mobilityLoadedEndRange: string | null
    motorSkillTransfer: string | null
    motorMovementModification: string | null
  }) => void
  busy: boolean
}) {
  const [compensation, setCompensation] = useState(summary?.compensationStrategy ?? '')
  const [tissue, setTissue] = useState(summary?.primaryTissue ?? '')
  const [mJoint, setMJoint] = useState(summary?.mobilityJoint ?? '')
  const [mSliding, setMSliding] = useState(summary?.mobilitySlidingSurface ?? '')
  const [mEndRange, setMEndRange] = useState(summary?.mobilityLoadedEndRange ?? '')
  const [mcSkill, setMcSkill] = useState(summary?.motorSkillTransfer ?? '')
  const [mcMod, setMcMod] = useState(summary?.motorMovementModification ?? '')

  function handleSave() {
    onSave({
      compensationStrategy: compensation || null,
      primaryTissue: (tissue || null) as 'JOINT' | 'SLIDING_SURFACE' | 'MUSCLE_DYNAMICS' | 'MOTOR_CONTROL' | null,
      mobilityJoint: mJoint || null,
      mobilitySlidingSurface: mSliding || null,
      mobilityLoadedEndRange: mEndRange || null,
      motorSkillTransfer: mcSkill || null,
      motorMovementModification: mcMod || null,
    })
  }

  return (
    <details className="rounded-xl" style={{ background: P.surface, padding: '14px 16px', marginTop: 8, border: `1px solid ${P.line}` }}>
      <summary
        className="athletic-mono cursor-pointer"
        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}
      >
        SAMENVATTING + PROGRAMMING TEMPLATE — {ARCHETYPE_LABEL[archetype].toUpperCase()}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <MetaLabel>Compensation Strategy</MetaLabel>
          <DarkTextarea
            rows={2}
            value={compensation}
            onChange={(e) => setCompensation(e.target.value)}
            placeholder="Geobserveerd compensatie-patroon"
          />
        </div>
        <div>
          <MetaLabel>Primary Tissue Limitation</MetaLabel>
          <DarkSelect value={tissue} onChange={(e) => setTissue(e.target.value)}>
            <option value="">— niet ingevuld —</option>
            {(['JOINT', 'SLIDING_SURFACE', 'MUSCLE_DYNAMICS', 'MOTOR_CONTROL'] as const).map((t) => (
              <option key={t} value={t}>
                {TISSUE_LABEL[t]}
              </option>
            ))}
          </DarkSelect>
        </div>
        <div>
          <MetaLabel>Mobility · Joint</MetaLabel>
          <DarkInput value={mJoint} onChange={(e) => setMJoint(e.target.value)} placeholder="bv. Banded hip distraction" />
        </div>
        <div>
          <MetaLabel>Mobility · Sliding Surface</MetaLabel>
          <DarkInput value={mSliding} onChange={(e) => setMSliding(e.target.value)} placeholder="bv. Quad smash, lacrosse ball" />
        </div>
        <div>
          <MetaLabel>Mobility · Loaded Static End Range Hold</MetaLabel>
          <DarkInput value={mEndRange} onChange={(e) => setMEndRange(e.target.value)} placeholder="bv. Couch stretch 2 min" />
        </div>
        <div>
          <MetaLabel>Motor Control · Skill Transfer Exercise</MetaLabel>
          <DarkInput value={mcSkill} onChange={(e) => setMcSkill(e.target.value)} placeholder="bv. Goblet squat tempo" />
        </div>
        <div>
          <MetaLabel>Motor Control · Movement Modification</MetaLabel>
          <DarkInput value={mcMod} onChange={(e) => setMcMod(e.target.value)} placeholder="bv. Heel-lift bij squat" />
        </div>
        <div className="text-right">
          <DarkButton size="sm" variant="primary" disabled={busy} onClick={handleSave}>
            Opslaan
          </DarkButton>
        </div>
      </div>
    </details>
  )
}
