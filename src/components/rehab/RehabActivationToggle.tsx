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
  DarkTextarea,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import {
  TRAJECT_OUTCOMES,
  TRAJECT_OUTCOME_LABEL,
  type TrajectOutcome,
} from '@/lib/rehab-traject'
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
  // Alleen om te weten of er historie is. Zodra die er is, is "aanzetten" niet
  // meer waar wat er gebeurt: je begint dan een volgend traject, met een eigen
  // set lege vinkjes naast de trajecten die er al staan.
  const { data: trajects = [] } = trpc.rehab.listTrajects.useQuery({ patientId })
  const heeftHistorie = trajects.some((t) => t.deactivatedAt != null)

  /** Alles wat na een traject-wissel opnieuw opgehaald moet worden. */
  function ververs() {
    refetch()
    utils.rehab.getPatientTracker.invalidate({ patientId })
    utils.rehab.listTrajects.invalidate({ patientId })
  }

  const activate = trpc.rehab.activateForPatient.useMutation({
    onSuccess: () => {
      toast.success(heeftHistorie ? 'Nieuw traject gestart' : 'Revalidatie-tracker geactiveerd')
      ververs()
    },
    onError: (e) => toast.error(e.message),
  })
  const closeTraject = trpc.rehab.closeTraject.useMutation({
    onSuccess: () => {
      toast.success('Traject afgesloten')
      ververs()
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
  const [closeOpen, setCloseOpen] = useState(false)
  const [selectedProtocolId, setSelectedProtocolId] = useState(protocols[0]?.id ?? '')
  const [surgeryDate, setSurgeryDate] = useState('')
  const [injuryDate, setInjuryDate] = useState('')
  const [outcome, setOutcome] = useState<TrajectOutcome>('COMPLETED')
  const [outcomeNote, setOutcomeNote] = useState('')

  const isActive = !!tracker

  if (!isActive) {
    return (
      <Tile accentBar={P.inkDim}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <MetaLabel>Revalidatie-tracker</MetaLabel>
            <p style={{ color: P.ink, fontSize: 13, fontWeight: 700, marginTop: 4 }}>
              {heeftHistorie ? 'Geen lopend traject' : 'Niet geactiveerd'}
            </p>
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
            >
              {heeftHistorie
                ? 'De afgesloten trajecten staan hieronder en blijven leesbaar.'
                : 'Kies een protocol (bv. Melbourne VKB) om de fase-criteria te volgen.'}
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
                {heeftHistorie ? 'Nieuw traject starten' : 'Aanzetten'}
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>
                  {heeftHistorie ? 'Nieuw revalidatietraject starten' : 'Revalidatie-tracker aanzetten'}
                </DarkDialogTitle>
              </DarkDialogHeader>
              <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
                Kies een protocol voor <strong style={{ color: P.ink }}>{patientName}</strong>. Je kunt de operatiedatum invullen zodat het systeem kan indiceren in welke fase de patiënt zich ongeveer zou moeten bevinden (criteria blijven leidend).
              </p>
              {heeftHistorie && (
                <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
                  Dit wordt een nieuw traject en begint met lege criteria. De eerdere trajecten
                  blijven met hun meetwaarden en uitkomst in het dossier staan.
                </p>
              )}
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
                  {heeftHistorie ? 'Traject starten' : 'Aanzetten'}
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
          <DarkDialog open={closeOpen} onOpenChange={setCloseOpen}>
            <DarkDialogTrigger asChild>
              <DarkButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOutcome('COMPLETED')
                  setOutcomeNote('')
                  setCloseOpen(true)
                }}
              >
                Traject afsluiten
              </DarkButton>
            </DarkDialogTrigger>
            <DarkDialogContent>
              <DarkDialogHeader>
                <DarkDialogTitle>Revalidatietraject afsluiten</DarkDialogTitle>
              </DarkDialogHeader>
              <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.55 }}>
                Hiermee sluit je het lopende traject van <strong style={{ color: P.ink }}>{patientName}</strong> af. Het protocol en alle fases verdwijnen uit het dashboard van de patiënt.
              </p>
              {/* Klopt sinds het episode-model: afsluiten sluit de episode af,
                  een nieuw protocol begint een nieuw en leeg traject. De oude
                  copy beloofde dat de vinkjes terugkwamen. Het historie-scherm
                  eronder bestaat nu wel, dus de belofte "blijft terug te lezen"
                  is te controleren. */}
              <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
                De ingevulde meetwaarden en statussen blijven aan dit traject hangen en zijn terug te
                lezen onder Eerdere trajecten. Start je later een nieuw traject, dan begint dat leeg.
              </p>
              <div className="flex flex-col gap-3 mt-4">
                <div>
                  <MetaLabel>Uitkomst</MetaLabel>
                  <DarkSelect
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value as TrajectOutcome)}
                  >
                    {TRAJECT_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {TRAJECT_OUTCOME_LABEL[o]}
                      </option>
                    ))}
                  </DarkSelect>
                </div>
                <div>
                  <MetaLabel>Toelichting (optioneel)</MetaLabel>
                  <DarkTextarea
                    value={outcomeNote}
                    maxLength={2000}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                    rows={3}
                    placeholder="Waar staat de knie nu, en wat is er afgesproken?"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <DarkButton variant="ghost" size="sm" onClick={() => setCloseOpen(false)}>
                  Annuleren
                </DarkButton>
                <DarkButton
                  variant="danger"
                  size="sm"
                  disabled={closeTraject.isPending}
                  onClick={() => {
                    closeTraject.mutate(
                      {
                        patientId,
                        outcome,
                        outcomeNote: outcomeNote.trim() || undefined,
                        // Het traject dat op dít scherm staat. Wisselt een
                        // collega ondertussen van protocol, dan weigert de
                        // server in plaats van de uitkomst op de nieuwe episode
                        // te zetten.
                        expectedTrackerId: tracker.trackerId,
                      },
                      { onSuccess: () => setCloseOpen(false) },
                    )
                  }}
                >
                  Traject afsluiten
                </DarkButton>
              </div>
            </DarkDialogContent>
          </DarkDialog>
        </div>
      </div>
    </Tile>
  )
}
