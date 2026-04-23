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
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { toast } from 'sonner'

export function InsightActivationToggle({
  patientId,
  patientName,
}: {
  patientId: string
  patientName: string
}) {
  const { data: status, refetch } = trpc.insights.getStatus.useQuery({ patientId })
  const activate = trpc.insights.activateForPatient.useMutation({
    onSuccess: () => {
      toast.success('Clinical Insight Engine geactiveerd')
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })
  const deactivate = trpc.insights.deactivateForPatient.useMutation({
    onSuccess: () => {
      toast.success('Uitgezet')
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!status) return null

  const enabled = status.enabled
  const hasObjection = status.patientObjection

  if (hasObjection) {
    return (
      <Tile accentBar={P.inkDim}>
        <div className="space-y-2">
          <MetaLabel style={{ color: P.inkMuted }}>Bezwaar geregistreerd</MetaLabel>
          <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
            Deze patiënt heeft aangegeven bezwaar te maken tegen de Clinical Insight Engine. De engine wordt niet uitgevoerd voor deze patiënt.
          </p>
          {status.patientObjectionNote && (
            <p style={{ color: P.inkMuted, fontSize: 12, fontStyle: 'italic' }}>
              &ldquo;{status.patientObjectionNote}&rdquo;
            </p>
          )}
        </div>
      </Tile>
    )
  }

  return (
    <Tile accentBar={enabled ? P.lime : P.inkDim}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <MetaLabel>Clinical Insight Engine</MetaLabel>
          <p style={{ color: P.ink, fontSize: 13, fontWeight: 700, marginTop: 4 }}>
            {enabled ? 'Geactiveerd' : 'Niet geactiveerd'}
          </p>
          <p
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
          >
            {enabled
              ? 'Signalen verschijnen in je dashboard zodra er patronen zijn.'
              : 'Geen suggesties actief voor deze patiënt.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enabled ? (
            <DarkButton
              variant="secondary"
              size="sm"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate({ patientId })}
            >
              Uitzetten
            </DarkButton>
          ) : (
            <DarkDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DarkDialogTrigger asChild>
                <DarkButton variant="primary" size="sm">
                  Aanzetten
                </DarkButton>
              </DarkDialogTrigger>
              <DarkDialogContent>
                <DarkDialogHeader>
                  <DarkDialogTitle>Clinical Insight Engine aanzetten?</DarkDialogTitle>
                </DarkDialogHeader>
                <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.55 }}>
                  Klinische Signalen analyseert de door{' '}
                  <span style={{ color: P.ink, fontWeight: 700 }}>{patientName}</span> ingevoerde pijnscores, feedback en trainingsadherence, en geeft jou suggesties over mogelijke klinische aandachtspunten. Deze suggesties zijn alleen voor jou zichtbaar en vervangen je klinische oordeel nooit. Je kunt dit op elk moment uitzetten.
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <DarkButton variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                    Annuleren
                  </DarkButton>
                  <DarkButton
                    variant="primary"
                    size="sm"
                    disabled={activate.isPending}
                    onClick={() => {
                      activate.mutate({ patientId }, {
                        onSuccess: () => setConfirmOpen(false),
                      })
                    }}
                  >
                    Aanzetten
                  </DarkButton>
                </div>
              </DarkDialogContent>
            </DarkDialog>
          )}
        </div>
      </div>
    </Tile>
  )
}
