'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkInput,
  DarkTextarea,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { toast } from 'sonner'

type StatusValue = 'NOT_MET' | 'IN_PROGRESS' | 'MET'

const STATUS_COLOR: Record<StatusValue, string> = {
  NOT_MET: P.danger,
  IN_PROGRESS: P.gold,
  MET: P.lime,
}

const STATUS_BG: Record<StatusValue, string> = {
  NOT_MET: 'rgba(248,113,113,0.12)',
  IN_PROGRESS: 'rgba(244,194,97,0.14)',
  MET: 'rgba(190,242,100,0.14)',
}

const STATUS_LABEL: Record<StatusValue, string> = {
  NOT_MET: 'Niet behaald',
  IN_PROGRESS: 'Bijna',
  MET: 'Behaald',
}

type PhaseData = {
  id: string
  order: number
  shortName: string
  name: string
  description: string | null
  keyGoals: string[]
  typicalStartWeek: number | null
  typicalEndWeek: number | null
  progress: { total: number; met: number; inProgress: number; pct: number }
  criteria: CriterionData[]
}

type CriterionData = {
  id: string
  order: number
  name: string
  testDescription: string
  reference: string | null
  targetValue: string
  targetUnit: string | null
  inputType: 'NUMERIC' | 'TEXT' | 'PASS_FAIL'
  isBonus: boolean
  status: StatusValue
  measurementValue: string | null
  measurementDate: string | Date | null
  notes: string | null
  updatedAt: string | Date | null
}

function formatDate(d: Date | string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function phaseTypicalRange(start: number | null, end: number | null): string {
  if (start == null && end == null) return ''
  if (start != null && end == null) return `vanaf week ${start}`
  if (start == null) return `tot week ${end}`
  if (start < 0) return `pre-op (${Math.abs(start)} weken voor operatie)`
  return `week ${start} – ${end}`
}

export function RehabTracker({ patientId }: { patientId: string }) {
  const { data: tracker, isLoading } = trpc.rehab.getPatientTracker.useQuery({ patientId })

  if (isLoading) {
    return (
      <div className="py-6 flex items-center justify-center">
        <span
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}
        >
          LADEN…
        </span>
      </div>
    )
  }

  if (!tracker) return null

  const tr = tracker as unknown as {
    progress: { total: number; met: number; inProgress: number; pct: number }
    expectedPhaseOrder: number | null
    weeksSinceSurgery: number | null
    phases: PhaseData[]
    protocol: { name: string; sourceReference: string | null }
  }

  return (
    <div className="space-y-4">
      {/* Hero: overall progress + expected phase */}
      <Tile>
        <div className="flex items-center gap-4 flex-wrap">
          <ProgressRing pct={tr.progress.pct} />
          <div className="flex-1 min-w-[200px]">
            <MetaLabel>Totale voortgang</MetaLabel>
            <p
              className="athletic-display"
              style={{ color: P.ink, fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 4 }}
            >
              {tr.progress.met}{' '}
              <span style={{ color: P.inkMuted, fontSize: 18, fontWeight: 700 }}>
                van {tr.progress.total} behaald
              </span>
            </p>
            {tr.progress.inProgress > 0 && (
              <p
                className="athletic-mono"
                style={{ color: P.gold, fontSize: 11, letterSpacing: '0.08em', marginTop: 4 }}
              >
                {tr.progress.inProgress} bijna — {tr.progress.total - tr.progress.met - tr.progress.inProgress} open
              </p>
            )}
            {tr.expectedPhaseOrder != null && (
              <p
                className="athletic-mono"
                style={{ color: P.ice, fontSize: 11, letterSpacing: '0.08em', marginTop: 6 }}
              >
                Indicatie: patiënt zou ongeveer in{' '}
                <span style={{ color: P.ink, fontWeight: 900 }}>
                  {tr.phases.find((p) => p.order === tr.expectedPhaseOrder)?.shortName ?? '—'}
                </span>{' '}
                moeten zitten ({tr.weeksSinceSurgery! >= 0 ? `${tr.weeksSinceSurgery} weken post-op` : 'pre-operatief'})
              </p>
            )}
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em', marginTop: 4 }}
            >
              {tr.protocol.name}
            </p>
          </div>
        </div>
      </Tile>

      {/* Phases */}
      {tr.phases.map((phase) => (
        <PhaseCard
          key={phase.id}
          phase={phase}
          patientId={patientId}
          isExpected={phase.order === tr.expectedPhaseOrder}
          weeksSinceSurgery={tr.weeksSinceSurgery}
        />
      ))}
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 72
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={P.surfaceHi}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={P.lime}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill={P.ink}
        fontSize="20"
        fontWeight="900"
        fontFamily="-apple-system, sans-serif"
      >
        {pct}%
      </text>
    </svg>
  )
}

function PhaseCard({
  phase,
  patientId,
  isExpected,
  weeksSinceSurgery,
}: {
  phase: PhaseData
  patientId: string
  isExpected: boolean
  weeksSinceSurgery: number | null
}) {
  const accent =
    phase.progress.pct === 100
      ? P.lime
      : phase.progress.pct > 0
        ? P.gold
        : P.inkDim

  return (
    <Tile
      accentBar={accent}
      style={{
        // Highlight de fase waarin de patiënt zou moeten zijn
        outline: isExpected ? `1px solid ${P.ice}` : undefined,
        outlineOffset: isExpected ? '-1px' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              {phase.shortName}
            </span>
            {isExpected && (
              <span
                className="athletic-mono"
                style={{
                  background: 'rgba(147,197,253,0.16)',
                  color: P.ice,
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                }}
                title={
                  weeksSinceSurgery != null
                    ? `${weeksSinceSurgery} weken post-op — typische periode voor deze fase`
                    : undefined
                }
              >
                Nu verwacht
              </span>
            )}
          </div>
          <p style={{ color: P.ink, fontSize: 15, fontWeight: 800, marginTop: 4, lineHeight: 1.3 }}>
            {phase.name}
          </p>
          {phaseTypicalRange(phase.typicalStartWeek, phase.typicalEndWeek) && (
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em', marginTop: 3 }}
            >
              Typisch: {phaseTypicalRange(phase.typicalStartWeek, phase.typicalEndWeek)}
            </p>
          )}
        </div>
        <PhaseBadge progress={phase.progress} />
      </div>

      {/* Mini dots per criterium */}
      <div className="flex flex-wrap gap-1 mb-3">
        {phase.criteria.map((c) => (
          <span
            key={c.id}
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: STATUS_COLOR[c.status],
              opacity: c.isBonus ? 0.55 : 1,
            }}
            title={`${c.name}: ${STATUS_LABEL[c.status]}`}
          />
        ))}
      </div>

      {/* Key goals */}
      {phase.keyGoals.length > 0 && (
        <details
          className="mb-3"
          style={{ background: P.surfaceHi, borderRadius: 8, padding: '8px 12px' }}
        >
          <summary
            className="athletic-mono cursor-pointer"
            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}
          >
            BELANGRIJKSTE DOELEN
          </summary>
          <ul className="mt-2 space-y-1" style={{ color: P.ink, fontSize: 12 }}>
            {phase.keyGoals.map((g, i) => (
              <li key={i} style={{ paddingLeft: 12, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: P.lime }}>•</span>
                {g}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Criteria list */}
      <div className="flex flex-col gap-2">
        {phase.criteria.map((c) => (
          <CriterionRow key={c.id} criterion={c} patientId={patientId} />
        ))}
      </div>
    </Tile>
  )
}

function PhaseBadge({
  progress,
}: {
  progress: { total: number; met: number; inProgress: number; pct: number }
}) {
  const color =
    progress.pct === 100 ? P.lime : progress.pct > 0 ? P.gold : P.inkMuted
  return (
    <div className="text-right shrink-0">
      <p
        className="athletic-display"
        style={{ color, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}
      >
        {progress.met}/{progress.total}
      </p>
      <p
        className="athletic-mono"
        style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em', marginTop: -2 }}
      >
        BEHAALD
      </p>
    </div>
  )
}

function CriterionRow({
  criterion,
  patientId,
}: {
  criterion: CriterionData
  patientId: string
}) {
  const [open, setOpen] = useState(false)
  const utils = trpc.useUtils()
  const updateMutation = trpc.rehab.updateCriterionStatus.useMutation({
    onSuccess: () => {
      utils.rehab.getPatientTracker.invalidate({ patientId })
    },
    onError: (e) => toast.error(e.message),
  })

  const [status, setStatus] = useState<StatusValue>(criterion.status)
  const [measurementValue, setMeasurementValue] = useState(criterion.measurementValue ?? '')
  const [measurementDate, setMeasurementDate] = useState(
    criterion.measurementDate ? new Date(criterion.measurementDate).toISOString().slice(0, 10) : '',
  )
  const [notes, setNotes] = useState(criterion.notes ?? '')

  function quickSetStatus(next: StatusValue) {
    updateMutation.mutate({
      patientId,
      criterionId: criterion.id,
      status: next,
      measurementValue: criterion.measurementValue,
      measurementDate: criterion.measurementDate
        ? new Date(criterion.measurementDate).toISOString()
        : null,
      notes: criterion.notes,
    })
    // Optimistic: update local state (cache invalidation will confirm)
    if (next === 'MET' && !criterion.measurementDate) {
      // auto-vullen datum als leeg en status MET
      updateMutation.mutate({
        patientId,
        criterionId: criterion.id,
        status: next,
        measurementValue: criterion.measurementValue,
        measurementDate: new Date().toISOString(),
        notes: criterion.notes,
      })
    }
  }

  function handleSave() {
    updateMutation.mutate(
      {
        patientId,
        criterionId: criterion.id,
        status,
        measurementValue: measurementValue || null,
        measurementDate: measurementDate || null,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Opgeslagen')
          setOpen(false)
        },
      },
    )
  }

  return (
    <div
      className="rounded-lg"
      style={{
        background: STATUS_BG[criterion.status],
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${STATUS_COLOR[criterion.status]}`,
        padding: '10px 12px',
      }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{criterion.name}</p>
            {criterion.isBonus && (
              <span
                className="athletic-mono"
                style={{
                  background: 'rgba(244,194,97,0.2)',
                  color: P.gold,
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 4,
                  letterSpacing: '0.12em',
                  fontWeight: 900,
                }}
              >
                BONUS
              </span>
            )}
          </div>
          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}>
            Doel: <span style={{ color: P.ink }}>{criterion.targetValue}</span>
            {criterion.reference && (
              <>
                {' · '}
                <span style={{ fontStyle: 'italic' }}>{criterion.reference}</span>
              </>
            )}
          </p>
          {(criterion.measurementValue || criterion.measurementDate) && (
            <p
              className="athletic-mono"
              style={{ color: STATUS_COLOR[criterion.status], fontSize: 11, marginTop: 3, letterSpacing: '0.04em' }}
            >
              {criterion.measurementValue && <>Meting: {criterion.measurementValue}</>}
              {criterion.measurementValue && criterion.measurementDate && ' · '}
              {criterion.measurementDate && <>{formatDate(criterion.measurementDate)}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          <StatusChip
            active={criterion.status === 'NOT_MET'}
            color={P.danger}
            onClick={() => quickSetStatus('NOT_MET')}
            label="R"
            aria="Niet behaald"
          />
          <StatusChip
            active={criterion.status === 'IN_PROGRESS'}
            color={P.gold}
            onClick={() => quickSetStatus('IN_PROGRESS')}
            label="O"
            aria="Bijna"
          />
          <StatusChip
            active={criterion.status === 'MET'}
            color={P.lime}
            onClick={() => quickSetStatus('MET')}
            label="G"
            aria="Behaald"
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="athletic-mono athletic-tap"
            style={{
              padding: '4px 8px',
              color: P.inkMuted,
              fontSize: 10,
              letterSpacing: '0.12em',
              marginLeft: 4,
            }}
          >
            Details
          </button>
        </div>
      </div>

      <DarkDialog open={open} onOpenChange={setOpen}>
        <DarkDialogContent>
          <DarkDialogHeader>
            <DarkDialogTitle>{criterion.name}</DarkDialogTitle>
          </DarkDialogHeader>
          <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            {criterion.testDescription}
          </p>
          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.06em', marginBottom: 16 }}>
            Doel: <span style={{ color: P.ink, fontWeight: 700 }}>{criterion.targetValue}</span>
            {criterion.reference && <> · {criterion.reference}</>}
          </p>

          <div className="flex flex-col gap-3">
            <div>
              <MetaLabel>Status</MetaLabel>
              <div className="flex gap-2 mt-1">
                {(['NOT_MET', 'IN_PROGRESS', 'MET'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className="athletic-mono athletic-tap flex-1 rounded-lg"
                    style={{
                      background: status === s ? STATUS_COLOR[s] : P.surfaceHi,
                      color: status === s ? P.bg : P.ink,
                      border: `1px solid ${status === s ? STATUS_COLOR[s] : P.lineStrong}`,
                      padding: '10px 8px',
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      fontWeight: 900,
                      textTransform: 'uppercase',
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <MetaLabel>Meetwaarde</MetaLabel>
              <DarkInput
                value={measurementValue}
                onChange={(e) => setMeasurementValue(e.target.value)}
                placeholder={
                  criterion.inputType === 'PASS_FAIL'
                    ? 'bv. "Pass" of "Fail"'
                    : criterion.targetUnit
                      ? `bv. 128 ${criterion.targetUnit}`
                      : 'Testresultaat'
                }
              />
            </div>

            <div>
              <MetaLabel>Datum</MetaLabel>
              <DarkInput
                type="date"
                value={measurementDate}
                onChange={(e) => setMeasurementDate(e.target.value)}
              />
            </div>

            <div>
              <MetaLabel>Notities (optioneel)</MetaLabel>
              <DarkTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Klinische observaties bij de test"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <DarkButton variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuleren
            </DarkButton>
            <DarkButton
              variant="primary"
              size="sm"
              disabled={updateMutation.isPending}
              onClick={handleSave}
            >
              Opslaan
            </DarkButton>
          </div>
        </DarkDialogContent>
      </DarkDialog>
    </div>
  )
}

function StatusChip({
  active,
  color,
  onClick,
  label,
  aria,
}: {
  active: boolean
  color: string
  onClick: () => void
  label: string
  aria: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      title={aria}
      className="athletic-tap"
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        background: active ? color : 'transparent',
        color: active ? P.bg : P.inkMuted,
        border: `1px solid ${active ? color : P.lineStrong}`,
        fontSize: 11,
        fontWeight: 900,
        fontFamily: 'Menlo, monospace',
        letterSpacing: '0.04em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}
