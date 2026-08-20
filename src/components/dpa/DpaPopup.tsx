'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, CheckCircle2, LogOut } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function DpaPopup() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.dpa.getStatus.useQuery(undefined, {
    retry: false,
  })

  const accept = trpc.dpa.accept.useMutation({
    onSuccess: () => {
      // Cache leeghalen — anders ziet de volgende mount nog steeds
      // needsAcceptance=true en pop het opnieuw open.
      utils.dpa.getStatus.invalidate()
      setOpen(false)
    },
  })

  // Open/sluit op basis van server-status. Belangrijk dat dit BIDIRECTIONEEL
  // is: alleen `setOpen(true)` zou de popup open laten staan ook nadat de
  // refetch een geupdatete status (needsAcceptance=false) terugbrengt.
  useEffect(() => {
    if (isLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(!!data?.needsAcceptance)
  }, [isLoading, data])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm mx-auto p-0 max-h-[90dvh] overflow-y-auto overflow-x-hidden"
        style={{ borderRadius: '20px' }}
        // Patiënt moet actief kiezen — geen sluiten via klik buiten of Escape
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4" style={{ background: 'var(--p-surface)' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'var(--p-surface-hi)', border: '1px solid var(--p-brand)' }}
          >
            <FileText className="w-5 h-5" style={{ color: 'var(--p-brand)' }} />
          </div>
          <DialogTitle
            className="text-lg font-bold leading-tight tracking-normal"
            style={{ color: 'var(--p-ink)' }}
          >
            Verwerkingsovereenkomst
          </DialogTitle>
          <DialogDescription className="text-sm mt-1" style={{ color: 'var(--p-ink-muted)' }}>
            Movement Based Therapy verwerkt uw persoonsgegevens als verwerkingsverantwoordelijke.
            Lees de overeenkomst en geef akkoord om door te gaan.
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3" style={{ background: 'var(--p-bg)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--p-ink)' }}>Samenvatting</p>
          <ul className="space-y-2">
            {[
              'Uw gegevens worden verwerkt voor fysiotherapeutische behandeling',
              'Bewaartermijn: 20 jaar (WGBO-verplichting)',
              'Gegevens worden opgeslagen bij Supabase (EU Frankfurt)',
              'U heeft recht op inzage, correctie en dataportabiliteit',
              'U kunt een klacht indienen bij de Autoriteit Persoonsgegevens',
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

          <Link
            href="/patient/legal/dpa"
            className="text-xs flex items-center gap-1 mt-2"
            style={{ color: 'var(--p-brand)' }}
            target="_blank"
          >
            <FileText className="w-3.5 h-3.5" />
            Volledig document lezen
          </Link>

          <p className="text-xs" style={{ color: 'var(--p-ink-dim)' }}>
            Versie v1.0 · U kunt dit later bekijken via Instellingen → Privacy
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 space-y-2" style={{ background: 'var(--p-bg)' }}>
          <Button
            className="w-full font-semibold"
            style={{ background: 'var(--p-brand)', color: 'var(--p-bg)', height: 48 }}
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
          >
            {accept.isPending ? 'Opslaan…' : 'Ik ga akkoord'}
          </Button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 text-sm py-2"
            style={{ color: 'var(--p-ink-muted)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Uitloggen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
