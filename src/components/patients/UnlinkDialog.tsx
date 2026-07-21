'use client'

/**
 * Je eigen koppeling met een atleet verbreken.
 *
 * Raakt alleen jouw relatie: de atleet houdt zijn account, zijn logboek en
 * zijn koppeling met een eventuele therapeut. Wat wél weggaat zijn de
 * programma's die jij voor deze atleet hebt gemaakt, dus dat staat er met
 * zoveel woorden bij.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  P,
} from '@/components/dark-ui'

export function UnlinkDialog({
  patientId,
  patientName,
  onClose,
  onDone,
}: {
  patientId: string
  patientName: string
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const utils = trpc.useUtils()

  const unlink = trpc.patients.delete.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate()
      toast.success(`Koppeling met ${patientName} verbroken`)
      onDone()
    },
    onError: (e) => {
      setBusy(false)
      toast.error(e.message)
    },
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Koppeling verbreken</DialogTitle>
          <DialogDescription>
            Je verliest de toegang tot het dossier van {patientName}, en de programma&rsquo;s die
            jij voor deze atleet hebt gemaakt worden verwijderd. De atleet houdt zijn account, zijn
            logboek en zijn eigen gegevens.
          </DialogDescription>
        </DialogHeader>

        <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.6 }}>
          Wil je later weer samenwerken, dan nodig je de atleet opnieuw uit.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <DarkButton variant="secondary" onClick={onClose} disabled={busy}>
            Annuleren
          </DarkButton>
          <DarkButton
            variant="primary"
            disabled={busy}
            loading={busy}
            onClick={() => {
              setBusy(true)
              unlink.mutate({ id: patientId })
            }}
          >
            Verbreken
          </DarkButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
