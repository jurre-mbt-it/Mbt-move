'use client'

/**
 * Een fysiotherapeut laten meekijken bij een atleet van de coach.
 *
 * De coach doet het verzoek, de atleet keurt het goed via zijn eigen
 * instellingen. Zo blijft de atleet degene die bepaalt wie zijn dossier ziet.
 * Zie docs/plan-coach-role-20260721.md.
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
  DarkInput,
  MetaLabel,
} from '@/components/dark-ui'

export function CoMonitorDialog({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string
  patientName: string
  onClose: () => void
}) {
  const [email, setEmail] = useState('')

  const invite = trpc.patients.inviteCoMonitor.useMutation({
    onSuccess: (r) => {
      if (r.alreadyLinked) {
        toast.info('Deze therapeut kijkt al mee', {
          description: 'Er was al een koppeling met deze atleet.',
        })
      } else {
        toast.success('Verzoek verstuurd', {
          description: `${patientName} moet het goedkeuren in zijn instellingen.`,
        })
      }
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Therapeut laten meekijken</DialogTitle>
          <DialogDescription>
            Vul het e-mailadres in van de fysiotherapeut. Die krijgt inzage in het dossier van{' '}
            {patientName} zodra {patientName} het verzoek goedkeurt in zijn instellingen. Jij blijft
            de training doen, de therapeut doet het klinische deel.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (email.trim()) invite.mutate({ patientId, email: email.trim() })
          }}
        >
          <div>
            <MetaLabel>E-mailadres therapeut</MetaLabel>
            <DarkInput
              type="email"
              autoFocus
              placeholder="naam@praktijk.nl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="mt-2 text-xs" style={{ color: '#7B8889', lineHeight: 1.6 }}>
              De therapeut moet al een account hebben. Is dat niet zo, vraag de beheerder dan om er
              een aan te maken.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <DarkButton variant="secondary" type="button" onClick={onClose}>
              Annuleren
            </DarkButton>
            <DarkButton
              variant="primary"
              type="submit"
              disabled={!email.trim() || invite.isPending}
              loading={invite.isPending}
            >
              Verzoek sturen
            </DarkButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
