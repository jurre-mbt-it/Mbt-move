'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Bump dit nummer om alle gebruikers opnieuw akkoord te laten geven
// (bv. wanneer de tekst hieronder wijzigt of na een breaking change).
export const ACCEPTANCE_KEY = 'mbt-beta-accepted-v1'

/**
 * Andere popups moeten wachten tot deze weg is: dit is een blocking dialog die
 * je niet kunt wegklikken. `QuickStartModal` leest de key bij mount en luistert
 * daarna op dit event, want binnen dezelfde paginalading verandert localStorage
 * zonder dat React dat merkt.
 */
export const BETA_ACCEPTED_EVENT = 'mbt:beta-accepted'

export function BetaDisclaimer() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    let shouldOpen = false
    try {
      if (!localStorage.getItem(ACCEPTANCE_KEY)) shouldOpen = true
    } catch {
      // localStorage blocked → toon de popup zekerheidshalve
      shouldOpen = true
    }
    if (shouldOpen) {
      // Cascading render is hier de bedoeling — popup-state hangt af van
      // localStorage (extern) die we alleen client-side kunnen lezen.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true)
    }
  }, [])

  function handleAccept() {
    try {
      localStorage.setItem(ACCEPTANCE_KEY, new Date().toISOString())
    } catch {}
    setOpen(false)
    window.dispatchEvent(new Event(BETA_ACCEPTED_EVENT))
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm mx-auto p-0 overflow-hidden"
        style={{ borderRadius: '20px' }}
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <div className="px-5 pt-6 pb-4" style={{ background: 'var(--p-surface)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'var(--p-surface-hi)', border: '1px solid var(--p-gold)' }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--p-gold)' }} />
          </div>
          <DialogTitle
            className="text-lg font-bold leading-tight tracking-normal"
            style={{ color: 'var(--p-ink)' }}
          >
            Beta-versie
          </DialogTitle>
          <DialogDescription className="text-sm mt-1" style={{ color: 'var(--p-ink-muted)' }}>
            BASE is op dit moment in beta. Lees de voorwaarden hieronder
            en geef akkoord om door te gaan.
          </DialogDescription>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm" style={{ background: 'var(--p-bg)', color: 'var(--p-ink)' }}>
          <p>
            Door gebruik te maken van BASE ga je ermee akkoord dat:
          </p>
          <ul className="list-disc pl-5 space-y-1.5" style={{ color: 'var(--p-ink-muted)' }}>
            <li>De software actief in ontwikkeling is, er kunnen bugs of fouten optreden.</li>
            <li>Data verloren kan gaan tijdens deploys, migraties of incidenten.</li>
            <li>De applicatie <strong style={{ color: 'var(--p-ink)' }}>niet de leidende bron</strong> is voor klinische beslissingen, verifieer kritieke informatie altijd in jouw eigen systeem.</li>
            <li>Je incidenten en bugs zo snel mogelijk meldt zodat we ze kunnen fixen.</li>
          </ul>
        </div>

        <div className="px-5 py-4 flex flex-col gap-2" style={{ background: 'var(--p-surface)' }}>
          <Button
            onClick={handleAccept}
            className="w-full font-semibold"
            style={{ background: 'var(--p-brand)', color: 'var(--p-bg)' }}
          >
            Ik begrijp het en ga akkoord
          </Button>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full text-xs gap-1.5"
            style={{ color: 'var(--p-ink-muted)' }}
          >
            <LogOut className="w-3 h-3" /> Uitloggen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
