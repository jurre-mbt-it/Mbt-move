/**
 * Mobility Assessment overzicht.
 * Therapeut kan nieuwe assessment starten + historie zien.
 */
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkDialogTrigger,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function AssessmentsPage() {
  const router = useRouter()
  const { data: access, isLoading: accessLoading } = trpc.assessments.hasAccess.useQuery()
  const { data: patients = [] } = trpc.patients.list.useQuery(undefined, {
    enabled: access?.hasAccess === true,
  })

  const [selectedPatientId, setSelectedPatientId] = useState('')
  const { data: patientAssessments = [] } = trpc.assessments.listForPatient.useQuery(
    { patientId: selectedPatientId },
    { enabled: !!selectedPatientId },
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [newPatientId, setNewPatientId] = useState('')
  const [newPerformedAt, setNewPerformedAt] = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')

  const create = trpc.assessments.create.useMutation({
    onSuccess: (res) => {
      toast.success('Assessment aangemaakt')
      router.push(`/therapist/assessments/${res.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const patientOptions = useMemo(
    () => patients.map((p) => ({ id: p.id, label: p.name, accessStatus: p.accessStatus })),
    [patients],
  )

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
          LADEN…
        </span>
      </div>
    )
  }

  if (!access?.hasAccess) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-20 text-center space-y-4">
          <Kicker>Toegang vereist</Kicker>
          <Display size="md">ASSESSMENT</Display>
          <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.55 }}>
            Deze functie is niet geactiveerd voor jouw account. Neem contact op met een admin om Mobility Assessment in te schakelen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-24 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <Kicker>Ready State methodology</Kicker>
            <Display size="md">MOBILITY ASSESSMENT</Display>
            <MetaLabel style={{ textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
              9 archetypes · 42 tests · stoplicht-scoring + programming template
            </MetaLabel>
          </div>
          <DarkDialog open={createOpen} onOpenChange={setCreateOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton variant="primary" onClick={() => setCreateOpen(true)}>
                + Nieuwe assessment
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Nieuwe assessment starten</DarkDialogTitle>
              </DarkDialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <MetaLabel>Patiënt</MetaLabel>
                  <DarkSelect
                    value={newPatientId}
                    onChange={(e) => setNewPatientId(e.target.value)}
                  >
                    <option value="">— kies patiënt —</option>
                    {patientOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </DarkSelect>
                </div>
                <div>
                  <MetaLabel>Datum</MetaLabel>
                  <DarkInput
                    type="date"
                    value={newPerformedAt}
                    onChange={(e) => setNewPerformedAt(e.target.value)}
                  />
                </div>
                <div>
                  <MetaLabel>Notitie (optioneel)</MetaLabel>
                  <DarkTextarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Reden van assessment, klinische context"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <DarkButton variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                  Annuleren
                </DarkButton>
                <DarkButton
                  variant="primary"
                  size="sm"
                  disabled={!newPatientId || create.isPending}
                  onClick={() =>
                    create.mutate({
                      patientId: newPatientId,
                      performedAt: newPerformedAt,
                      notes: newNotes || undefined,
                    })
                  }
                >
                  Start
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
        </div>

        {/* Patient-selector voor historie */}
        <Tile>
          <MetaLabel>Historie per patiënt</MetaLabel>
          <DarkSelect
            className="mt-2"
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
          >
            <option value="">— kies patiënt —</option>
            {patientOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </DarkSelect>
        </Tile>

        {selectedPatientId && (
          <div className="flex flex-col gap-2">
            {patientAssessments.length === 0 && (
              <Tile>
                <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                  Nog geen assessments voor deze patiënt.
                </p>
              </Tile>
            )}
            {patientAssessments.map((a) => {
              const ratio = a.totalScored > 0 ? Math.round((a.pass / a.totalScored) * 100) : 0
              const accent = ratio >= 75 ? P.lime : ratio >= 40 ? P.gold : P.danger
              return (
                <Tile key={a.id} accentBar={accent} href={`/therapist/assessments/${a.id}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
                        {new Date(a.performedAt).toLocaleDateString('nl-NL', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        }).toUpperCase()}
                      </p>
                      <p style={{ color: P.ink, fontSize: 14, fontWeight: 700, marginTop: 3 }}>
                        {a.totalScored} tests gescoord — {a.pass} pass · {a.partial} partial · {a.fail} fail
                      </p>
                      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 2, letterSpacing: '0.06em' }}>
                        door {a.therapistName}
                      </p>
                      {a.notes && (
                        <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4 }}>{a.notes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="athletic-display" style={{ color: accent, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
                        {ratio}%
                      </p>
                      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em', marginTop: -2 }}>
                        PASS
                      </p>
                    </div>
                  </div>
                </Tile>
              )
            })}
          </div>
        )}

        {/* Tip-tile */}
        {!selectedPatientId && (
          <Tile>
            <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
              Selecteer een patiënt hierboven om historische assessments te bekijken, of klik <strong style={{ color: P.ink }}>+ Nieuwe assessment</strong> om een nieuwe test-sessie te starten. Elke assessment kun je opbouwen uit 42 tests verdeeld over 9 archetypes (lumbar spine, squat/hinge, pistol, lunge, thoracic spine, overhead, front rack, press, hang) plus 4 breathing tests.
            </p>
          </Tile>
        )}
      </div>
    </div>
  )
}
