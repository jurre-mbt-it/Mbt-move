'use client'

import { useState } from 'react'
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
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { toast } from 'sonner'

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toInputDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

export function RehabActivationToggle({
  patientId,
  patientName,
}: {
  patientId: string
  patientName: string
}) {
  const utils = trpc.useUtils()
  const { data: tracker, refetch } = trpc.rehab.getPatientTracker.useQuery({ patientId })
  const { data: protocols = [] } = trpc.rehab.listProtocols.useQuery()

  const activate = trpc.rehab.activateForPatient.useMutation({
    onSuccess: () => {
      toast.success('Revalidatie-tracker geactiveerd')
      refetch()
      utils.rehab.getPatientTracker.invalidate({ patientId })
    },
    onError: (e) => toast.error(e.message),
  })
  const deactivate = trpc.rehab.deactivateForPatient.useMutation({
    onSuccess: () => {
      toast.success('Uitgezet')
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })
  const updateDetails = trpc.rehab.updateTrackerDetails.useMutation({
    onSuccess: () => {
      toast.success('Opgeslagen')
      refetch()
      setEditOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })

  const [setupOpen, setSetupOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [selectedProtocolId, setSelectedProtocolId] = useState(protocols[0]?.id ?? '')
  const [surgeryDate, setSurgeryDate] = useState('')
  const [injuryDate, setInjuryDate] = useState('')

  const isActive = !!tracker

  if (!isActive) {
    return (
      <Tile accentBar={P.inkDim}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <MetaLabel>Revalidatie-tracker</MetaLabel>
            <p style={{ color: P.ink, fontSize: 13, fontWeight: 700, marginTop: 4 }}>
              Niet geactiveerd
            </p>
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
            >
              Kies een protocol (bv. Melbourne VKB) om de fase-criteria te volgen.
            </p>
          </div>
          <DarkDialog open={setupOpen} onOpenChange={setSetupOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectedProtocolId(protocols[0]?.id ?? '')
                  setSurgeryDate('')
                  setInjuryDate('')
                  setSetupOpen(true)
                }}
                disabled={protocols.length === 0}
              >
                Aanzetten
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Revalidatie-tracker aanzetten</DarkDialogTitle>
              </DarkDialogHeader>
              <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                Kies een protocol voor <strong style={{ color: P.ink }}>{patientName}</strong>. Je kunt de operatiedatum invullen zodat het systeem kan indiceren in welke fase de patiënt zich ongeveer zou moeten bevinden (criteria blijven leidend).
              </p>
              <div className="flex flex-col gap-3">
                <div>
                  <MetaLabel>Protocol</MetaLabel>
                  <DarkSelect
                    value={selectedProtocolId}
                    onChange={(e) => setSelectedProtocolId(e.target.value)}
                  >
                    {protocols.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </DarkSelect>
                </div>
                <div>
                  <MetaLabel>Operatiedatum (optioneel)</MetaLabel>
                  <DarkInput
                    type="date"
                    value={surgeryDate}
                    onChange={(e) => setSurgeryDate(e.target.value)}
                  />
                </div>
                <div>
                  <MetaLabel>Blessure-datum (optioneel)</MetaLabel>
                  <DarkInput
                    type="date"
                    value={injuryDate}
                    onChange={(e) => setInjuryDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <DarkButton variant="ghost" size="sm" onClick={() => setSetupOpen(false)}>
                  Annuleren
                </DarkButton>
                <DarkButton
                  variant="primary"
                  size="sm"
                  disabled={activate.isPending || !selectedProtocolId}
                  onClick={() => {
                    activate.mutate(
                      {
                        patientId,
                        protocolId: selectedProtocolId,
                        surgeryDate: surgeryDate || null,
                        injuryDate: injuryDate || null,
                      },
                      { onSuccess: () => setSetupOpen(false) },
                    )
                  }}
                >
                  Aanzetten
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
        </div>
      </Tile>
    )
  }

  // Active state — show summary with edit
  return (
    <Tile accentBar={P.lime}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <MetaLabel>Revalidatie-tracker actief</MetaLabel>
          <p style={{ color: P.ink, fontSize: 13, fontWeight: 700, marginTop: 4 }}>
            {tracker.protocol.name}
          </p>
          <p
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
          >
            Operatie: {formatDate(tracker.surgeryDate)}
            {tracker.weeksSinceSurgery != null && (
              <>
                {' · '}
                {tracker.weeksSinceSurgery < 0
                  ? `${Math.abs(tracker.weeksSinceSurgery)} weken tot operatie`
                  : `${tracker.weeksSinceSurgery} weken post-op`}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DarkDialog open={editOpen} onOpenChange={setEditOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSurgeryDate(toInputDate(tracker.surgeryDate))
                  setInjuryDate(toInputDate(tracker.injuryDate))
                  setEditOpen(true)
                }}
              >
                Bewerk
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Revalidatie-data bewerken</DarkDialogTitle>
              </DarkDialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <MetaLabel>Operatiedatum</MetaLabel>
                  <DarkInput
                    type="date"
                    value={surgeryDate}
                    onChange={(e) => setSurgeryDate(e.target.value)}
                  />
                </div>
                <div>
                  <MetaLabel>Blessure-datum</MetaLabel>
                  <DarkInput
                    type="date"
                    value={injuryDate}
                    onChange={(e) => setInjuryDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <DarkButton variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
                  Annuleren
                </DarkButton>
                <DarkButton
                  variant="primary"
                  size="sm"
                  disabled={updateDetails.isPending}
                  onClick={() => {
                    updateDetails.mutate({
                      patientId,
                      surgeryDate: surgeryDate || null,
                      injuryDate: injuryDate || null,
                    })
                  }}
                >
                  Opslaan
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
          <DarkDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton
                variant="secondary"
                size="sm"
                onClick={() => setDeactivateOpen(true)}
              >
                Uitzetten
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Revalidatie-tracker uitzetten?</DarkDialogTitle>
              </DarkDialogHeader>
              <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.55 }}>
                Weet je het zeker? Het protocol en alle fases verdwijnen uit het dashboard van <strong style={{ color: P.ink }}>{patientName}</strong>.
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
                Ingevulde meetwaarden en statussen blijven bewaard en komen terug als je de tracker later opnieuw aanzet.
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <DarkButton variant="ghost" size="sm" onClick={() => setDeactivateOpen(false)}>
                  Annuleren
                </DarkButton>
                <DarkButton
                  variant="danger"
                  size="sm"
                  disabled={deactivate.isPending}
                  onClick={() => {
                    deactivate.mutate(
                      { patientId },
                      { onSuccess: () => setDeactivateOpen(false) },
                    )
                  }}
                >
                  Ja, uitzetten
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
        </div>
      </div>
    </Tile>
  )
}
