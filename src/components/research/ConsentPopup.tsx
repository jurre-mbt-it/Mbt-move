'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ShieldCheck, CheckCircle2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

export function ConsentPopup() {
  const [open, setOpen] = useState(false)

  const { data, isLoading } = trpc.research.getConsentStatus.useQuery(undefined, {
    retry: false,
  })

  const setConsent = trpc.research.setConsent.useMutation({
    onSuccess: () => setOpen(false),
  })

  // Show popup when: no record yet, or consent version changed
  useEffect(() => {
    if (!isLoading && data?.needsNewConsent) {
      setOpen(true)
    }
  }, [isLoading, data])

  function handleDecline() {
    setConsent.mutate({ consentGiven: false })
    setOpen(false)
  }

  function handleAccept() {
    setConsent.mutate({ consentGiven: true })
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm mx-auto p-0 overflow-hidden"
        style={{ borderRadius: '20px' }}
        // Prevent closing by clicking outside — patient must make an active choice
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4" style={{ background: '#1A3A3A' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: '#4ECDC420' }}
          >
            <ShieldCheck className="w-5 h-5" style={{ color: '#4ECDC4' }} />
          </div>
          <h2 className="text-white text-lg font-bold leading-tight">Data toestemming</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Movement Based Therapy verzamelt geanonimiseerde trainingsdata om onze behandelingen te verbeteren.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-semibold text-zinc-800">Wat betekent dit?</p>
          <ul className="space-y-2">
            {[
              'Alleen trainingsgegevens (oefeningen, gewicht, scores)',
              'Alleen demografisch (leeftijd, geslacht, lengte, gewicht)',
              'NOOIT je naam, e-mail, of andere contactgegevens',
              'Data is niet herleidbaar naar jou als persoon',
              'Je kunt toestemming altijd intrekken in je instellingen',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-600">
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: '#4ECDC4' }}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-zinc-400 pt-1">
            Je kunt dit later altijd wijzigen via Instellingen.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
            disabled={setConsent.isPending}
          >
            Nee, liever niet
          </Button>
          <Button
            className="flex-1 text-white font-semibold"
            style={{ background: '#4ECDC4' }}
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
