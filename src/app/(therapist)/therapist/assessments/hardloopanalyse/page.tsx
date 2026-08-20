/**
 * Hardloopanalyse — overzicht (binnen de Assessment-sectie).
 * Behandelaar start een nieuwe analyse + ziet historie per patiënt.
 */
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

export default function HardloopanalyseListPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: access, isLoading: accessLoading } = trpc.assessments.hasAccess.useQuery()
  const { data: patients = [] } = trpc.patients.list.useQuery(undefined, {
    enabled: access?.hasAccess === true,
  })

  const [selectedPatientId, setSelectedPatientId] = useState('')
  const { data: analyses = [] } = trpc.runningAnalysis.listForPatient.useQuery(
    { patientId: selectedPatientId },
    { enabled: !!selectedPatientId && access?.hasAccess === true },
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [newPatientId, setNewPatientId] = useState('')
  const [newPerformedAt, setNewPerformedAt] = useState(new Date().toISOString().slice(0, 10))
  const [newGoal, setNewGoal] = useState('')

  const create = trpc.runningAnalysis.create.useMutation({
    onSuccess: (res) => {
      toast.success('Hardloopanalyse aangemaakt')
      router.push(`/therapist/assessments/hardloopanalyse/${res.id}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const patientOptions = useMemo(() => patients.map((p) => ({ id: p.id, label: p.name })), [patients])

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>LADEN…</span>
      </div>
    )
  }

  if (!access?.hasAccess) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-20 text-center space-y-4">
          <Kicker>Toegang vereist</Kicker>
          <Display size="md">HARDLOOPANALYSE</Display>
          <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.55 }}>
            Deze functie is niet geactiveerd voor jouw account. Neem contact op met een admin.
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
            <Link href="/therapist/assessments" className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}>
              ← ASSESSMENT
            </Link>
            <Kicker>Looptechniek · 2D videoanalyse</Kicker>
            <Display size="md">HARDLOOPANALYSE</Display>
            <MetaLabel style={{ textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
              Houding, beweging en loopmetrics → PDF
            </MetaLabel>
          </div>
          <DarkDialog open={createOpen} onOpenChange={setCreateOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton variant="primary" onClick={() => setCreateOpen(true)}>+ Nieuwe analyse</DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Nieuwe hardloopanalyse</DarkDialogTitle>
              </DarkDialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <MetaLabel>Patiënt</MetaLabel>
                  <DarkMenuSelect
                    value={newPatientId}
                    onValueChange={setNewPatientId}
                    placeholder="kies patiënt"
                    options={patientOptions.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <MetaLabel>Analysedatum</MetaLabel>
                    <DarkInput type="date" value={newPerformedAt} onChange={(e) => setNewPerformedAt(e.target.value)} />
                  </div>
                </div>
                <div>
                  <MetaLabel>Doel (optioneel)</MetaLabel>
                  <DarkInput value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Blessurevrij 10 km" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <DarkButton variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Annuleren</DarkButton>
                <DarkButton
                  variant="primary"
                  size="sm"
                  disabled={!newPatientId || create.isPending}
                  onClick={() => create.mutate({ patientId: newPatientId, performedAt: newPerformedAt, goal: newGoal || undefined })}
                >
                  Start
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
        </div>

        <Tile>
          <MetaLabel>Historie per patiënt</MetaLabel>
          <DarkMenuSelect
            className="mt-2"
            value={selectedPatientId}
            onValueChange={setSelectedPatientId}
            placeholder="kies patiënt"
            options={patientOptions.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Tile>

        {selectedPatientId && (
          <div className="flex flex-col gap-2">
            {analyses.length === 0 && (
              <Tile>
                <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                  Nog geen hardloopanalyses voor deze patiënt.
                </p>
              </Tile>
            )}
            {analyses.map((a) => {
              const accent = a.rearTotal == null ? P.inkMuted : a.rearTotal >= 85 ? P.lime : a.rearTotal >= 70 ? P.brand : P.danger
              return (
                <Tile
                  key={a.id}
                  accentBar={accent}
                  href={`/therapist/assessments/hardloopanalyse/${a.id}`}
                  prefetch={() => utils.runningAnalysis.get.prefetch({ id: a.id })}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
                        {new Date(a.performedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                      </p>
                      <p style={{ color: P.ink, fontSize: 14, fontWeight: 700, marginTop: 3 }}>{a.goal ?? 'Hardloopanalyse'}</p>
                      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, marginTop: 2, letterSpacing: '0.06em' }}>
                        door {a.therapistName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="athletic-display" style={{ color: accent, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>
                        {a.rearTotal == null ? '—' : `${a.rearTotal}%`}
                      </p>
                      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 9, letterSpacing: '0.12em', marginTop: -2 }}>ACHTER</p>
                    </div>
                  </div>
                </Tile>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
