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
        <div className="px-5 pt-6 pb-4" style={{ background: '#141A1B' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: '#1C2425', border: '1px solid #BEF264' }}
          >
            <ShieldCheck className="w-5 h-5" style={{ color: '#BEF264' }} />
          </div>
          <h2 className="text-lg font-bold leading-tight" style={{ color: '#F5F7F6' }}>Data toestemming</h2>
          <p className="text-sm mt-1" style={{ color: '#7B8889' }}>
            Movement Based Therapy verzamelt geanonimiseerde trainingsdata om onze behandelingen te verbeteren.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3" style={{ background: '#0A0E0F' }}>
          <p className="text-sm font-semibold" style={{ color: '#F5F7F6' }}>Wat betekent dit?</p>
          <ul className="space-y-2">
            {[
              'Alleen trainingsgegevens (oefeningen, gewicht, scores)',
              'Alleen demografisch (leeftijd, geslacht, lengte, gewicht)',
              'NOOIT je naam, e-mail, of andere contactgegevens',
              'Data is niet herleidbaar naar jou als persoon',
              'Je kunt toestemming altijd intrekken in je instellingen',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#7B8889' }}>
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: '#BEF264' }}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs pt-1" style={{ color: '#4A5454' }}>
            Je kunt dit later altijd wijzigen via Instellingen.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3" style={{ background: '#0A0E0F' }}>
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
            style={{ background: '#BEF264', color: '#0A0E0F' }}
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
