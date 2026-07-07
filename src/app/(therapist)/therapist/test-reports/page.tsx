/**
 * Testrapport — overzicht.
 * Behandelaar start een nieuw rapport + ziet de historie per patiënt.
 */
'use client'

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
  DarkMenuSelect,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function TestReportsPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: patients = [] } = trpc.patients.list.useQuery()

  const [selectedPatientId, setSelectedPatientId] = useState('')
  const { data: reports = [] } = trpc.testReports.listForPatient.useQuery(
    { patientId: selectedPatientId },
    { enabled: !!selectedPatientId },
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [newPatientId, setNewPatientId] = useState('')
  const [newPerformedAt, setNewPerformedAt] = useState(new Date().toISOString().slice(0, 10))
  const [newMeasurement, setNewMeasurement] = useState('')

  const create = trpc.testReports.create.useMutation({
    onSuccess: (res) => {
      toast.success('Testrapport aangemaakt')
      router.push(`/therapist/test-reports/${res.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const patientOptions = useMemo(
    () => patients.map((p) => ({ id: p.id, label: p.name })),
    [patients],
  )

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-24 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <Kicker>Return to sport · voortgangsmeting</Kicker>
            <Display size="md">TESTRAPPORT</Display>
            <MetaLabel style={{ textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
              Objectieve meting van kracht, power en mobiliteit → PDF
            </MetaLabel>
          </div>
          <div className="flex items-center gap-2">
          <DarkButton variant="ghost" onClick={() => router.push('/therapist/test-reports/manage')}>
            Tests & batterijen
          </DarkButton>
          <DarkDialog open={createOpen} onOpenChange={setCreateOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton variant="primary" onClick={() => setCreateOpen(true)}>
                + Nieuw rapport
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Nieuw testrapport</DarkDialogTitle>
              </DarkDialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <MetaLabel>Patiënt</MetaLabel>
                  <DarkMenuSelect
                    value={newPatientId}
                    onValueChange={setNewPatientId}
                    placeholder="— kies patiënt —"
                    options={patientOptions.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <MetaLabel>Testdatum</MetaLabel>
                    <DarkInput
                      type="date"
                      value={newPerformedAt}
                      onChange={(e) => setNewPerformedAt(e.target.value)}
                    />
                  </div>
                  <div style={{ width: 130 }}>
                    <MetaLabel>Meting nr.</MetaLabel>
                    <DarkInput
                      type="number"
                      placeholder="3"
                      value={newMeasurement}
                      onChange={(e) => setNewMeasurement(e.target.value)}
                    />
                  </div>
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
                      measurementNumber: newMeasurement ? Number(newMeasurement) : null,
                    })
                  }
                >
                  Start
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
          </div>
        </div>

        <Tile>
          <MetaLabel>Historie per patiënt</MetaLabel>
          <DarkMenuSelect
            className="mt-2"
            value={selectedPatientId}
            onValueChange={setSelectedPatientId}
            placeholder="— kies patiënt —"
            options={patientOptions.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Tile>

        {selectedPatientId && (
          <div className="flex flex-col gap-2">
            {reports.length === 0 && (
              <Tile>
                <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                  Nog geen testrapporten voor deze patiënt.
                </p>
              </Tile>
            )}
            {reports.map((r) => (
              <Tile
                key={r.id}
                accentBar={r.status === 'FINAL' ? P.lime : P.brand}
                href={`/therapist/test-reports/${r.id}`}
                prefetch={() => utils.testReports.get.prefetch({ id: r.id })}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}
                    >
                      {new Date(r.performedAt)
                        .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                        .toUpperCase()}
                      {r.measurementNumber != null ? ` · METING ${String(r.measurementNumber).padStart(2, '0')}` : ''}
                    </p>
                    <p style={{ color: P.ink, fontSize: 14, fontWeight: 700, marginTop: 3 }}>
                      {r.injuryGoal ?? 'Testrapport'}
                    </p>
                    <p
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 10, marginTop: 2, letterSpacing: '0.06em' }}
                    >
                      {r.entryCount} tests · door {r.therapistName}
                    </p>
                  </div>
                  <span
                    className="athletic-mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.12em',
                      color: r.status === 'FINAL' ? P.lime : P.brand,
                      fontWeight: 800,
                    }}
                  >
                    {r.status === 'FINAL' ? 'DEFINITIEF' : 'CONCEPT'}
                  </span>
                </div>
              </Tile>
            ))}
          </div>
        )}

        {!selectedPatientId && (
          <Tile>
            <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
              Selecteer een patiënt om historische rapporten te zien, of klik{' '}
              <strong style={{ color: P.ink }}>+ Nieuw rapport</strong> om er een samen te stellen
              uit de testcatalogus. Per rapport voeg je tests toe (los of via een batterij), vul je
              de links/rechts-waarden in en laat je een AI-concept voor de interpretatie + advies
              schrijven dat je zelf redigeert.
            </p>
          </Tile>
        )}
      </div>
    </div>
  )
}
