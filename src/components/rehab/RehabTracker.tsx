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
  SkeletonText,
  Tile,
} from '@/components/dark-ui'
import { trajectOutcomeTekst, trajectPeriode } from '@/lib/rehab-traject'
import { toast } from 'sonner'

type StatusValue = 'NOT_MET' | 'IN_PROGRESS' | 'MET'

const STATUS_COLOR: Record<StatusValue, string> = {
  NOT_MET: P.danger,
  IN_PROGRESS: P.gold,
  MET: P.lime,
}

const STATUS_BG: Record<StatusValue, string> = {
  NOT_MET: 'rgba(240,121,108,0.12)',
  IN_PROGRESS: 'rgba(245,185,66,0.14)',
  MET: 'rgba(232,122,85,0.14)',
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
  isBilateral: boolean
  newtonMinGreen: number | null
  newtonMinOrange: number | null
  lsiMinGreen: number | null
  lsiMinOrange: number | null
  status: StatusValue
  measurementValue: string | null
  measurementDate: string | Date | null
  notes: string | null
  updatedAt: string | Date | null
}

// Bilaterale meting opgeslagen als JSON in measurementValue
type BilateralValue = { left?: number | null; right?: number | null }

function parseBilateral(v: string | null): BilateralValue {
  if (!v) return {}
  try {
    const parsed = JSON.parse(v)
    if (parsed && typeof parsed === 'object') {
      return {
        left: typeof parsed.left === 'number' ? parsed.left : null,
        right: typeof parsed.right === 'number' ? parsed.right : null,
      }
    }
  } catch {
    // niet bilateraal opgeslagen — laat leeg
  }
  return {}
}

function computeLSI(left: number | null | undefined, right: number | null | undefined): number | null {
  if (left == null || right == null || left <= 0 || right <= 0) return null
  return Math.round((Math.min(left, right) / Math.max(left, right)) * 100)
}

function deriveBilateralStatus(
  c: Pick<
    CriterionData,
    'newtonMinGreen' | 'newtonMinOrange' | 'lsiMinGreen' | 'lsiMinOrange'
  >,
  left: number | null | undefined,
  right: number | null | undefined,
): StatusValue | null {
  if (left == null || right == null) return null
  const lsi = computeLSI(left, right)
  if (lsi == null) return null
  const minVal = Math.min(left, right)
  const greenN = c.newtonMinGreen ?? 0
  const orangeN = c.newtonMinOrange ?? 0
  const greenLSI = c.lsiMinGreen ?? 0
  const orangeLSI = c.lsiMinOrange ?? 0
  if (minVal >= greenN && lsi >= greenLSI) return 'MET'
  if (minVal >= orangeN && lsi >= orangeLSI) return 'IN_PROGRESS'
  return 'NOT_MET'
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
  return `week ${start}-${end}`
}

/** Vorm van één traject uit `rehab.listTrajects`. */
type TrajectRow = {
  id: string
  protocolName: string
  activatedAt: string | Date
  deactivatedAt: string | Date | null
  outcome: string | null
  outcomeNote: string | null
  behaaldeCriteria: number
  totaalCriteria: number
}

/** De tracker-vorm die dit bestand rendert, zowel lopend als afgesloten. */
type TrackerShape = {
  progress: { total: number; met: number; inProgress: number; pct: number }
  expectedPhaseOrder: number | null
  weeksSinceSurgery: number | null
  phases: PhaseData[]
  protocol: { name: string; sourceReference: string | null }
}

export function RehabTracker({ patientId }: { patientId: string }) {
  const { data: tracker, isLoading } = trpc.rehab.getPatientTracker.useQuery({ patientId })
  // Historie hoort ook op het scherm als er niets meer loopt: een afgesloten
  // dossier is precies het geval waarin je terugleest wat er is gebeurd.
  const { data: trajects = [], isLoading: trajectsLoading } =
    trpc.rehab.listTrajects.useQuery({ patientId })
  const [openTrajectId, setOpenTrajectId] = useState<string | null>(null)

  if (isLoading || trajectsLoading) {
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

  const historie = (trajects as TrajectRow[]).filter((t) => t.deactivatedAt != null)
  if (!tracker && historie.length === 0) return null

  const tr = tracker as unknown as TrackerShape | null

  return (
    <div className="space-y-4">
      {tr && (
        <>
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
                    {tr.progress.inProgress} bijna, {tr.progress.total - tr.progress.met - tr.progress.inProgress} open
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
        </>
      )}

      {historie.length > 0 && (
        <TrajectHistory
          patientId={patientId}
          historie={historie}
          // Heropenen mag alleen op het meest recente afgesloten traject, en
          // alleen als er niets loopt. De server weigert de rest ook, maar een
          // knop die altijd op dezelfde melding uitkomt is geen knop.
          heropenbaarId={!tracker ? (historie[0]?.id ?? null) : null}
          // Loopt er niets, dan is de historie het enige op deze tab en hoort
          // hij niet achter een dichtgeklapt kopje te zitten.
          standaardOpen={!tracker}
          onOpen={setOpenTrajectId}
        />
      )}

      {openTrajectId && (
        <TrajectDetailDialog
          trackerId={openTrajectId}
          meta={historie.find((t) => t.id === openTrajectId) ?? null}
          onClose={() => setOpenTrajectId(null)}
        />
      )}
    </div>
  )
}

// ─── Historie: afgesloten trajecten ──────────────────────────────────────────

function TrajectHistory({
  patientId,
  historie,
  heropenbaarId,
  standaardOpen,
  onOpen,
}: {
  patientId: string
  historie: TrajectRow[]
  heropenbaarId: string | null
  standaardOpen: boolean
  onOpen: (trackerId: string) => void
}) {
  // Zelf bijhouden in plaats van alleen een `open`-attribuut meegeven: dat
  // laatste is een DOM-attribuut dat React bij elke render terugzet, en dan
  // klapt het blok dicht zodra er iets anders op de pagina verandert.
  const [uitgeklapt, setUitgeklapt] = useState(standaardOpen)
  const utils = trpc.useUtils()
  const reopen = trpc.rehab.reopenTraject.useMutation({
    onSuccess: () => {
      toast.success('Traject heropend')
      utils.rehab.getPatientTracker.invalidate({ patientId })
      utils.rehab.listTrajects.invalidate({ patientId })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Tile>
      <details open={uitgeklapt} onToggle={(e) => setUitgeklapt(e.currentTarget.open)}>
        <summary
          className="athletic-mono cursor-pointer flex items-center justify-between gap-2"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em' }}
        >
          <span>EERDERE TRAJECTEN</span>
          <span style={{ color: P.inkDim }}>{historie.length}</span>
        </summary>
        <div className="flex flex-col gap-2 mt-3">
          {historie.map((t) => (
            <div
              key={t.id}
              className="rounded-lg"
              style={{ background: P.surfaceHi, border: `1px solid ${P.line}`, padding: '10px 12px' }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="athletic-tap text-left flex-1 min-w-[180px]"
                >
                  <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{t.protocolName}</p>
                  <p
                    className="athletic-mono"
                    style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
                  >
                    {trajectPeriode(t.activatedAt, t.deactivatedAt)}
                  </p>
                  <p
                    className="athletic-mono"
                    style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
                  >
                    {trajectOutcomeTekst(t.outcome)} · {t.behaaldeCriteria} van {t.totaalCriteria} criteria behaald
                  </p>
                  {t.outcomeNote && (
                    <p style={{ color: P.inkDim, fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                      {t.outcomeNote}
                    </p>
                  )}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {heropenbaarId === t.id && (
                    <DarkButton
                      variant="ghost"
                      size="sm"
                      disabled={reopen.isPending}
                      onClick={() => reopen.mutate({ trackerId: t.id })}
                    >
                      Heropenen
                    </DarkButton>
                  )}
                  <DarkButton variant="secondary" size="sm" onClick={() => onOpen(t.id)}>
                    Bekijken
                  </DarkButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </Tile>
  )
}

/** Eén afgesloten traject, read-only. Zelfde opbouw als het lopende traject. */
function TrajectDetailDialog({
  trackerId,
  meta,
  onClose,
}: {
  trackerId: string
  meta: TrajectRow | null
  onClose: () => void
}) {
  const { data, isLoading } = trpc.rehab.getTraject.useQuery({ trackerId })
  const tr = data as unknown as (TrackerShape & { outcomeNote: string | null }) | null | undefined

  return (
    <DarkDialog open onOpenChange={(o) => !o && onClose()}>
      <DarkDialogContent className="max-h-[85vh] overflow-y-auto">
        <DarkDialogHeader>
          <DarkDialogTitle>{meta?.protocolName ?? tr?.protocol.name ?? 'Afgesloten traject'}</DarkDialogTitle>
        </DarkDialogHeader>
        {meta && (
          <p
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em', marginBottom: 12 }}
          >
            {trajectPeriode(meta.activatedAt, meta.deactivatedAt)} · {trajectOutcomeTekst(meta.outcome)}
          </p>
        )}
        {isLoading ? (
          <SkeletonText lines={5} />
        ) : !tr ? (
          <p style={{ color: P.inkMuted, fontSize: 13 }}>Dit traject is niet meer op te halen.</p>
        ) : (
          <div className="space-y-3">
            {tr.outcomeNote && (
              <div
                className="rounded-lg"
                style={{ background: P.surfaceHi, border: `1px solid ${P.line}`, padding: '10px 12px' }}
              >
                <MetaLabel>Toelichting bij de afsluiting</MetaLabel>
                <p style={{ color: P.ink, fontSize: 12.5, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {tr.outcomeNote}
                </p>
              </div>
            )}
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.06em' }}
            >
              {tr.progress.met} van {tr.progress.total} criteria behaald
            </p>
            {tr.phases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                patientId=""
                isExpected={false}
                weeksSinceSurgery={null}
                readOnly
              />
            ))}
          </div>
        )}
        <div className="flex justify-end mt-5">
          <DarkButton variant="secondary" size="sm" onClick={onClose}>
            Sluiten
          </DarkButton>
        </div>
      </DarkDialogContent>
    </DarkDialog>
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
  readOnly = false,
}: {
  phase: PhaseData
  patientId: string
  isExpected: boolean
  weeksSinceSurgery: number | null
  /** Traject uit de historie: statussen tonen, niets kunnen wijzigen. */
  readOnly?: boolean
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
                  background: 'rgba(159,206,201,0.16)',
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
                    ? `${weeksSinceSurgery} weken post-op, typische periode voor deze fase`
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
          <CriterionRow key={c.id} criterion={c} patientId={patientId} readOnly={readOnly} />
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
  readOnly = false,
}: {
  criterion: CriterionData
  patientId: string
  /** Traject uit de historie: geen R/O/G-knoppen en geen meet-dialoog. */
  readOnly?: boolean
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

  // Bilaterale state (alleen gebruikt als criterion.isBilateral)
  const initialBilateral = parseBilateral(criterion.measurementValue)
  const [leftN, setLeftN] = useState<string>(
    initialBilateral.left != null ? String(initialBilateral.left) : '',
  )
  const [rightN, setRightN] = useState<string>(
    initialBilateral.right != null ? String(initialBilateral.right) : '',
  )
  const leftNum = leftN ? Number(leftN) : null
  const rightNum = rightN ? Number(rightN) : null
  const computedLSI = criterion.isBilateral ? computeLSI(leftNum, rightNum) : null
  const computedBilateralStatus = criterion.isBilateral
    ? deriveBilateralStatus(criterion, leftNum, rightNum)
    : null
  const parsedStoredBilateral = parseBilateral(criterion.measurementValue)
  const storedLSI = criterion.isBilateral
    ? computeLSI(parsedStoredBilateral.left, parsedStoredBilateral.right)
    : null

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
    // Bilaterale criteria: serialize L/R naar JSON + auto-status
    if (criterion.isBilateral) {
      const payload: BilateralValue = {}
      if (leftNum != null) payload.left = leftNum
      if (rightNum != null) payload.right = rightNum
      const valueStr = Object.keys(payload).length > 0 ? JSON.stringify(payload) : null
      const autoStatus = computedBilateralStatus ?? status
      updateMutation.mutate(
        {
          patientId,
          criterionId: criterion.id,
          status: autoStatus,
          measurementValue: valueStr,
          measurementDate: measurementDate || new Date().toISOString().slice(0, 10),
          notes: notes || null,
        },
        {
          onSuccess: () => {
            toast.success('Opgeslagen, status auto-berekend')
            setOpen(false)
          },
        },
      )
      return
    }
    // Niet-bilateraal: oud pad
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
                  background: 'rgba(245,185,66,0.2)',
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
          {criterion.isBilateral && (
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 3, letterSpacing: '0.08em' }}>
              {criterion.newtonMinGreen != null && `GROEN ≥${criterion.newtonMinGreen}N/zijde`}
              {criterion.newtonMinOrange != null && ` · ORANJE ≥${criterion.newtonMinOrange}N`}
              {criterion.lsiMinGreen != null && ` · LSI GROEN ≥${criterion.lsiMinGreen}%`}
              {criterion.lsiMinOrange != null && ` (oranje ≥${criterion.lsiMinOrange}%)`}
            </p>
          )}
          {criterion.isBilateral && (parsedStoredBilateral.left != null || parsedStoredBilateral.right != null) && (
            <p
              className="athletic-mono"
              style={{ color: STATUS_COLOR[criterion.status], fontSize: 11, marginTop: 3, letterSpacing: '0.04em' }}
            >
              L: {parsedStoredBilateral.left ?? '—'}N · R: {parsedStoredBilateral.right ?? '—'}N
              {storedLSI != null && ` · LSI ${storedLSI}%`}
              {criterion.measurementDate && ` · ${formatDate(criterion.measurementDate)}`}
            </p>
          )}
          {!criterion.isBilateral && (criterion.measurementValue || criterion.measurementDate) && (
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
          {readOnly ? (
            // Historie: de eindstand als woord in plaats van drie knoppen die
            // niets doen. De kleur zit al in de rand van de rij.
            <span
              className="athletic-mono"
              style={{
                color: STATUS_COLOR[criterion.status],
                fontSize: 10,
                letterSpacing: '0.12em',
                fontWeight: 900,
                textTransform: 'uppercase',
              }}
            >
              {STATUS_LABEL[criterion.status]}
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
      {/* Notitie bij de meting hoort in de historie zichtbaar te zijn: zonder de
          detail-dialoog is er anders geen enkele plek waar hij nog staat. */}
      {readOnly && criterion.notes && (
        <p style={{ color: P.inkDim, fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
          {criterion.notes}
        </p>
      )}

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
            {!criterion.isBilateral && (
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
            )}

            {criterion.isBilateral ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <MetaLabel>Links (N)</MetaLabel>
                    <DarkInput
                      type="number"
                      inputMode="numeric"
                      value={leftN}
                      onChange={(e) => setLeftN(e.target.value)}
                      placeholder="bv. 165"
                    />
                  </div>
                  <div>
                    <MetaLabel>Rechts (N)</MetaLabel>
                    <DarkInput
                      type="number"
                      inputMode="numeric"
                      value={rightN}
                      onChange={(e) => setRightN(e.target.value)}
                      placeholder="bv. 172"
                    />
                  </div>
                </div>
                {(leftNum != null || rightNum != null) && (
                  <div
                    className="rounded-lg"
                    style={{
                      background: computedBilateralStatus ? STATUS_BG[computedBilateralStatus] : P.surfaceHi,
                      border: `1px solid ${computedBilateralStatus ? STATUS_COLOR[computedBilateralStatus] : P.line}`,
                      padding: '10px 12px',
                    }}
                  >
                    <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em' }}>
                      AUTO-STATUS
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span
                        style={{
                          color: computedBilateralStatus ? STATUS_COLOR[computedBilateralStatus] : P.inkMuted,
                          fontSize: 14,
                          fontWeight: 800,
                        }}
                      >
                        {computedBilateralStatus ? STATUS_LABEL[computedBilateralStatus] : 'Vul beide velden'}
                      </span>
                      <span className="athletic-mono" style={{ color: P.ink, fontSize: 11, letterSpacing: '0.06em' }}>
                        {computedLSI != null && `LSI ${computedLSI}%`}
                        {leftNum != null && rightNum != null && ` · min ${Math.min(leftNum, rightNum)}N`}
                      </span>
                    </div>
                    <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.04em' }}>
                      Regel: GROEN als beide zijden ≥{criterion.newtonMinGreen}N én LSI ≥{criterion.lsiMinGreen}%. ORANJE bij ≥{criterion.newtonMinOrange}N + LSI ≥{criterion.lsiMinOrange}%. Anders ROOD.
                    </p>
                  </div>
                )}
              </>
            ) : (
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
            )}

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
        fontFamily: 'var(--font-mono-athletic)',
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
