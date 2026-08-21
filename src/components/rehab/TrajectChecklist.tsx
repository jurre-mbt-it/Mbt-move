'use client'

/**
 * Traject-checklist op de patiëntpagina: wat staat er nog open voordat het
 * revalidatietraject echt loopt. Alleen zichtbaar zolang er een lopend traject
 * is én er iets openstaat; is alles af, dan verdwijnt de kaart vanzelf.
 */
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { trpc } from '@/lib/trpc/client'
import { DarkButton, MetaLabel, P, Tile } from '@/components/dark-ui'
import { usePortal } from '@/lib/portal'

function Regel({
  af,
  children,
  actie,
}: {
  af: boolean
  children: ReactNode
  actie?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p style={{ color: af ? P.inkMuted : P.ink, fontSize: 13 }}>
        <span style={{ color: af ? P.lime : P.inkDim, marginRight: 8 }}>{af ? '✓' : '○'}</span>
        {children}
      </p>
      {!af && actie}
    </div>
  )
}

export function TrajectChecklist({
  patientId,
  dpaAcceptedAt,
  onResendInvite,
  resendPending,
}: {
  patientId: string
  dpaAcceptedAt: Date | string | null
  onResendInvite: () => void
  resendPending: boolean
}) {
  const router = useRouter()
  const portal = usePortal()
  const { data: tracker } = trpc.rehab.getPatientTracker.useQuery({ patientId })
  const { data: rapporten = [] } = trpc.testReports.listForPatient.useQuery({ patientId })
  const createReport = trpc.testReports.create.useMutation({
    onSuccess: (r) => router.push(`${portal.base}/test-reports/${r.id}`),
    onError: (e) => toast.error(e.message),
  })

  if (!tracker) return null

  const uitnodigingOk = dpaAcceptedAt != null
  // Alleen rapporten van dit traject tellen mee; een meting uit een eerder
  // traject zegt niets over de nulmeting van het lopende.
  const sindsStart = rapporten.filter(
    (r) => new Date(r.performedAt) >= new Date(tracker.activatedAt),
  )
  const nulmetingOk = sindsStart.some((r) => r.filledEntryCount > 0)
  if (uitnodigingOk && nulmetingOk) return null

  // Het klaargezette maar nog lege rapport, oudste eerst: de knop moet naar de
  // nulmeting wijzen, niet naar een latere hermeting.
  const leegRapport = [...sindsStart].reverse().find((r) => r.filledEntryCount === 0)

  return (
    <Tile accentBar={P.brand}>
      <MetaLabel>Traject-start</MetaLabel>
      <div className="flex flex-col gap-2 mt-3">
        {/* Volgorde volgt de werkelijkheid: eerst uitnodigen, dan het traject,
            dan meten. */}
        <Regel
          af={uitnodigingOk}
          actie={
            <DarkButton variant="ghost" size="sm" disabled={resendPending} onClick={onResendInvite}>
              Uitnodiging opnieuw versturen
            </DarkButton>
          }
        >
          {uitnodigingOk ? 'Uitnodiging geaccepteerd' : 'Uitnodiging nog niet geaccepteerd'}
        </Regel>
        <Regel af>Traject actief · {tracker.protocol.name}</Regel>
        <Regel
          af={nulmetingOk}
          actie={
            <DarkButton
              variant="ghost"
              size="sm"
              disabled={createReport.isPending}
              onClick={() => {
                if (leegRapport) router.push(`${portal.base}/test-reports/${leegRapport.id}`)
                else createReport.mutate({ patientId, fromTrackerId: tracker.trackerId })
              }}
            >
              Nulmeting invullen
            </DarkButton>
          }
        >
          {nulmetingOk ? 'Nulmeting ingevuld' : 'Nulmeting nog niet ingevuld'}
        </Regel>
      </div>
    </Tile>
  )
}
