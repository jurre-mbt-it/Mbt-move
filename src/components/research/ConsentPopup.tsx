'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShieldCheck, CheckCircle2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

export function ConsentPopup() {
  const [open, setOpen] = useState(false)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.research.getConsentStatus.useQuery(undefined, {
    retry: false,
  })

  const setConsent = trpc.research.setConsent.useMutation({
    onSuccess: () => {
      // Cache leeghalen zodat needsNewConsent op de volgende mount klopt.
      utils.research.getConsentStatus.invalidate()
      setOpen(false)
    },
  })

  // Bidirectioneel: openen + sluiten op basis van server-status. Met alleen
  // setOpen(true) blijft de popup ook open staan nadat een refetch een
  // geüpdate status terugbrengt.
  useEffect(() => {
    if (isLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(!!data?.needsNewConsent)
  }, [isLoading, data])

  function handleDecline() {
    setConsent.mutate({ consentGiven: false })
  }

  function handleAccept() {
    setConsent.mutate({ consentGiven: true })
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm mx-auto p-0 max-h-[90dvh] overflow-y-auto overflow-x-hidden"
        style={{ borderRadius: '20px' }}
        // Prevent closing by clicking outside — patient must make an active choice
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4" style={{ background: 'var(--p-surface)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'var(--p-surface-hi)', border: '1px solid var(--p-brand)' }}
          >
            <ShieldCheck className="w-5 h-5" style={{ color: 'var(--p-brand)' }} />
          </div>
          <DialogTitle className="text-lg font-bold leading-tight tracking-normal" style={{ color: 'var(--p-ink)' }}>Data toestemming</DialogTitle>
          <DialogDescription className="text-sm mt-1" style={{ color: 'var(--p-ink-muted)' }}>
            Movement Based Therapy verzamelt geanonimiseerde trainingsdata om onze behandelingen te verbeteren.
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3" style={{ background: 'var(--p-bg)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--p-ink)' }}>Wat betekent dit?</p>
          <ul className="space-y-2">
            {[
              'Alleen trainingsgegevens (oefeningen, gewicht, scores)',
              'Alleen demografisch (leeftijd, geslacht, lengte, gewicht)',
              'NOOIT je naam, e-mail, of andere contactgegevens',
              'Data is niet herleidbaar naar jou als persoon',
              'Je kunt toestemming altijd intrekken in je instellingen',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--p-ink-muted)' }}>
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: 'var(--p-brand)' }}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs pt-1" style={{ color: 'var(--p-ink-dim)' }}>
            Je kunt dit later altijd wijzigen via Instellingen.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3" style={{ background: 'var(--p-bg)' }}>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
            disabled={setConsent.isPending}
          >
            Nee, liever niet
          </Button>
          <Button
            className="flex-1 font-semibold"
            style={{ background: 'var(--p-brand)', color: 'var(--p-bg)' }}
            onClick={handleAccept}
            disabled={setConsent.isPending}
          >
            Ja, ik geef toestemming
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
