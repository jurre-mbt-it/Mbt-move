'use client'

/**
 * Patient-profiel sectie "Losse tests".
 *
 * Therapeut kiest test uit ClinicalTest library, drukt "Toevoegen", de
 * assignment verschijnt in de lijst met snelkoppeling naar resultaat-invoer.
 * Werkt parallel aan protocol-/programma-toewijzing — assignments hebben
 * géén link met een Program of RehabProtocol.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import {
  BODY_REGIONS,
  BODY_REGION_LABEL,
  CONSTRUCTS,
  CONSTRUCT_COLOR,
  CONSTRUCT_LABEL,
  type ClinicalTestBodyRegion,
  type ClinicalTestConstruct,
} from '@/lib/clinical-tests-meta'

type LibraryTest = {
  id: string
  key: string
  name: string
  bodyRegion: ClinicalTestBodyRegion[]
  construct: ClinicalTestConstruct
  shortGoal: string
}

type LatestResult = {
  id: string
  performedAt: Date | string
  value: string | null
  leftValue: number | null
  rightValue: number | null
  lsi: number | null
  painScore: number | null
}

type Assignment = {
  id: string
  assignedAt: Date | string
  dueDate: Date | string | null
  notes: string | null
  clinicalTest: LibraryTest & { benchmark?: string }
  results: LatestResult[]
  assignedBy?: { id: string; name: string | null } | null
}

export function PatientClinicalTests({ patientId }: { patientId: string }) {
  const utils = trpc.useUtils()
  const { data: rawAssignments, isLoading } =
    trpc.patientTestAssignments.list.useQuery({ patientId })

  const assignments: Assignment[] = (rawAssignments ?? []) as Assignment[]

  const [addOpen, setAddOpen] = useState(false)
  const [resultDialog, setResultDialog] = useState<Assignment | null>(null)

  const deleteAssignment = trpc.patientTestAssignments.delete.useMutation({
    onSuccess: async () => {
      await utils.patientTestAssignments.list.invalidate({ patientId })
      toast.success('Toewijzing verwijderd')
    },
    onError: () => toast.error('Verwijderen mislukt'),
  })

  const handleDelete = (a: Assignment) => {
    if (!confirm(`Toewijzing "${a.clinicalTest.name}" verwijderen?`)) return
    deleteAssignment.mutate({ id: a.id })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <MetaLabel>
          {assignments.length} test-toewijzing{assignments.length === 1 ? '' : 'en'}
        </MetaLabel>
        <DarkButton variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          + Test toewijzen
        </DarkButton>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <Tile>
          <div className="py-8 text-center space-y-2">
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              Nog geen losse tests toegewezen
            </p>
            <p style={{ color: P.inkDim, fontSize: 11 }}>
              Kies een test uit de library om longitudinaal te monitoren
            </p>
          </div>
        </Tile>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              onLogResult={() => setResultDialog(a)}
              onDelete={() => handleDelete(a)}
            />
          ))}
        </div>
      )}

      <AddTestDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        patientId={patientId}
        existingTestIds={new Set(assignments.map(a => a.clinicalTest.id))}
      />

      <LogResultDialog
        assignment={resultDialog}
        onClose={() => setResultDialog(null)}
        patientId={patientId}
      />
    </div>
  )
}

function AssignmentCard({
  assignment,
  onLogResult,
  onDelete,
}: {
  assignment: Assignment
  onLogResult: () => void
  onDelete: () => void
}) {
  const t = assignment.clinicalTest
  const color = CONSTRUCT_COLOR[t.construct]
  const latest = assignment.results[0]
  return (
    <Tile accentBar={color}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="athletic-mono"
              style={{
                background: `${color}22`,
                color,
                fontSize: 10,
                letterSpacing: '0.1em',
                padding: '2px 8px',
                borderRadius: 999,
                fontWeight: 800,
                textTransform: 'uppercase',
              }}
            >
              {CONSTRUCT_LABEL[t.construct]}
            </span>
            {t.bodyRegion.map(r => (
              <span
                key={r}
                className="athletic-mono"
                style={{
                  background: P.surfaceHi,
                  color: P.inkMuted,
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  padding: '2px 6px',
                  borderRadius: 999,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {BODY_REGION_LABEL[r]}
              </span>
            ))}
          </div>
          <Link
            href={`/therapist/tests/${t.key}`}
            className="block mt-1.5"
            style={{
              color: P.ink,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              lineHeight: 1.3,
            }}
          >
            {t.name}
          </Link>
          {latest ? (
            <div
              className="athletic-mono mt-2 flex items-center gap-3 flex-wrap"
              style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em' }}
            >
              <span style={{ color: P.lime }}>
                {latest.value ??
                  (latest.leftValue != null && latest.rightValue != null
                    ? `L ${latest.leftValue} · R ${latest.rightValue}`
                    : '—')}
              </span>
              {latest.lsi != null && <span>LSI {latest.lsi}%</span>}
              {latest.painScore != null && <span>NRS {latest.painScore}</span>}
              <span style={{ color: P.inkDim }}>
                {new Date(latest.performedAt).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          ) : (
            <p
              className="athletic-mono"
              style={{ color: P.inkDim, fontSize: 11, marginTop: 8, letterSpacing: '0.04em' }}
            >
              Nog geen meting · toegewezen{' '}
              {new Date(assignment.assignedAt).toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          )}
          {assignment.notes && (
            <p
              style={{ color: P.inkMuted, fontSize: 12, marginTop: 6, fontStyle: 'italic' }}
            >
              {assignment.notes}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <DarkButton variant="primary" size="sm" onClick={onLogResult}>
            + Meting
          </DarkButton>
          <button
            type="button"
            onClick={onDelete}
            title="Verwijderen"
            className="athletic-tap w-full px-2 py-1 rounded-md text-xs"
            style={{ background: P.surfaceLow, color: P.danger }}
          >
            Verwijder
          </button>
        </div>
      </div>
    </Tile>
  )
}

function AddTestDialog({
  open,
  onOpenChange,
  patientId,
  existingTestIds,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  patientId: string
  existingTestIds: Set<string>
}) {
  const utils = trpc.useUtils()
  const [region, setRegion] = useState<ClinicalTestBodyRegion | 'ALL'>('ALL')
  const [construct, setConstruct] = useState<ClinicalTestConstruct | 'ALL'>('ALL')
  const [search, setSearch] = useState('')

  const { data: rawTests, isLoading } = trpc.clinicalTests.list.useQuery(
    {
      bodyRegion: region !== 'ALL' ? [region] : undefined,
      construct: construct !== 'ALL' ? construct : undefined,
      search: search.trim() || undefined,
    },
    { enabled: open, staleTime: 60_000 },
  )
  const tests = useMemo<LibraryTest[]>(() => (rawTests ?? []) as LibraryTest[], [rawTests])
  const filtered = useMemo(() => tests.slice(0, 25), [tests])

  const create = trpc.patientTestAssignments.create.useMutation({
    onSuccess: async () => {
      await utils.patientTestAssignments.list.invalidate({ patientId })
      toast.success('Test toegewezen')
      onOpenChange(false)
    },
    onError: e => toast.error(e.message || 'Toewijzen mislukt'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}
        className="max-w-lg"
        style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: P.ink }}>Test toewijzen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <DarkInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek test op naam…"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <DarkSelect
              value={region}
              onChange={e => setRegion(e.target.value as ClinicalTestBodyRegion | 'ALL')}
            >
              <option value="ALL">Alle body regions</option>
              {BODY_REGIONS.map(r => (
                <option key={r} value={r}>
                  {BODY_REGION_LABEL[r]}
                </option>
              ))}
            </DarkSelect>
            <DarkSelect
              value={construct}
              onChange={e => setConstruct(e.target.value as ClinicalTestConstruct | 'ALL')}
            >
              <option value="ALL">Alle constructs</option>
              {CONSTRUCTS.map(c => (
                <option key={c} value={c}>
                  {CONSTRUCT_LABEL[c]}
                </option>
              ))}
            </DarkSelect>
          </div>

          <div
            className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1"
            style={{ scrollbarColor: `${P.lineStrong} transparent` }}
          >
            {isLoading ? (
              <p
                className="athletic-mono"
                style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.05em' }}
              >
                Laden…
              </p>
            ) : filtered.length === 0 ? (
              <p
                className="athletic-mono"
                style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.05em' }}
              >
                Geen resultaten
              </p>
            ) : (
              filtered.map(t => {
                const already = existingTestIds.has(t.id)
                const color = CONSTRUCT_COLOR[t.construct]
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={already || create.isPending}
                    onClick={() =>
                      create.mutate({ patientId, clinicalTestId: t.id })
                    }
                    className="athletic-tap w-full text-left rounded-lg flex items-start gap-3 px-3 py-2.5"
                    style={{
                      background: P.surfaceHi,
                      border: `1px solid ${P.line}`,
                      opacity: already ? 0.45 : 1,
                      cursor: already ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 3,
                        height: 36,
                        borderRadius: 1.5,
                        backgroundColor: color,
                        marginTop: 2,
                      }}
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className="block truncate"
                        style={{
                          color: P.ink,
                          fontSize: 13,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {t.name}
                      </span>
                      <span
                        className="athletic-mono block"
                        style={{
                          color: P.inkMuted,
                          fontSize: 10,
                          letterSpacing: '0.06em',
                          marginTop: 2,
                          textTransform: 'uppercase',
                        }}
                      >
                        {CONSTRUCT_LABEL[t.construct]} ·{' '}
                        {t.bodyRegion.map(r => BODY_REGION_LABEL[r]).join(', ')}
                      </span>
                      <span
                        className="block"
                        style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}
                      >
                        {t.shortGoal}
                      </span>
                    </span>
                    {already ? (
                      <span
                        className="athletic-mono shrink-0"
                        style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.1em' }}
                      >
                        ✓ AL TOEGEWEZEN
                      </span>
                    ) : (
                      <span style={{ color: P.brand, fontSize: 18 }} aria-hidden>
                        +
                      </span>
                    )}
                  </button>
                )
              })
            )}
            {tests.length > filtered.length && (
              <p
                className="athletic-mono pt-2 text-center"
                style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em' }}
              >
                {tests.length - filtered.length} extra — verfijn filters om te zien
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LogResultDialog({
  assignment,
  onClose,
  patientId,
}: {
  assignment: Assignment | null
  onClose: () => void
  patientId: string
}) {
  const utils = trpc.useUtils()
  const [value, setValue] = useState('')
  const [leftValue, setLeftValue] = useState('')
  const [rightValue, setRightValue] = useState('')
  const [painScore, setPainScore] = useState('')
  const [notes, setNotes] = useState('')

  const create = trpc.patientTestResults.create.useMutation({
    onSuccess: async () => {
      await utils.patientTestAssignments.list.invalidate({ patientId })
      toast.success('Meting opgeslagen')
      setValue('')
      setLeftValue('')
      setRightValue('')
      setPainScore('')
      setNotes('')
      onClose()
    },
    onError: e => toast.error(e.message || 'Opslaan mislukt'),
  })

  const handleSubmit = () => {
    if (!assignment) return
    const left = leftValue.trim() ? Number(leftValue) : null
    const right = rightValue.trim() ? Number(rightValue) : null
    create.mutate({
      assignmentId: assignment.id,
      value: value.trim() || null,
      leftValue: Number.isFinite(left as number) ? left : null,
      rightValue: Number.isFinite(right as number) ? right : null,
      painScore: painScore.trim() ? Number(painScore) : null,
      notes: notes.trim() || null,
    })
  }

  return (
    <Dialog open={!!assignment} onOpenChange={v => !v && onClose()}>
      <DialogContent aria-describedby={undefined}
        className="max-w-md"
        style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: P.ink }}>
            {assignment ? `Meting: ${assignment.clinicalTest.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {assignment?.clinicalTest.benchmark && (
            <p
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 11,
                lineHeight: 1.5,
                background: P.surfaceLow,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${P.line}`,
              }}
            >
              <span style={{ color: P.brand, letterSpacing: '0.1em' }}>BENCHMARK · </span>
              {assignment.clinicalTest.benchmark}
            </p>
          )}

          <div className="space-y-1.5">
            <MetaLabel>Waarde (vrije tekst)</MetaLabel>
            <DarkInput
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder='bv "128°", "Pass", "graad 2+", "22 reps"'
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <MetaLabel>Links (getal)</MetaLabel>
              <DarkInput
                inputMode="decimal"
                value={leftValue}
                onChange={e => setLeftValue(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <MetaLabel>Rechts (getal)</MetaLabel>
              <DarkInput
                inputMode="decimal"
                value={rightValue}
                onChange={e => setRightValue(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <MetaLabel>Pijnscore (NRS 0–10)</MetaLabel>
            <DarkInput
              inputMode="numeric"
              value={painScore}
              onChange={e => setPainScore(e.target.value)}
              placeholder="—"
            />
          </div>

          <div className="space-y-1.5">
            <MetaLabel>Notities</MetaLabel>
            <DarkTextarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optioneel"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <DarkButton
              variant="primary"
              onClick={handleSubmit}
              disabled={create.isPending}
              loading={create.isPending}
              className="flex-1"
            >
              Opslaan
            </DarkButton>
            <DarkButton variant="secondary" onClick={onClose}>
              Annuleren
            </DarkButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
