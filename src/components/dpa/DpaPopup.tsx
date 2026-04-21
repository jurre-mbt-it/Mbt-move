'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, CheckCircle2, LogOut } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function DpaPopup() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { data, isLoading } = trpc.dpa.getStatus.useQuery(undefined, {
    retry: false,
  })

  const accept = trpc.dpa.accept.useMutation({
    onSuccess: () => setOpen(false),
  })

  useEffect(() => {
    if (!isLoading && data?.needsAcceptance) {
      setOpen(true)
    }
  }, [isLoading, data])

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
        // Patiënt moet actief kiezen — geen sluiten via klik buiten of Escape
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4" style={{ background: '#141A1B' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
            style={{ background: '#1C2425', border: '1px solid #BEF264' }}
          >
            <FileText className="w-5 h-5" style={{ color: '#BEF264' }} />
          </div>
          <h2 className="text-lg font-bold leading-tight" style={{ color: '#F5F7F6' }}>
            Verwerkingsovereenkomst
          </h2>
          <p className="text-sm mt-1" style={{ color: '#7B8889' }}>
            Movement Based Therapy verwerkt uw persoonsgegevens als verwerkingsverantwoordelijke.
            Lees de overeenkomst en geef akkoord om door te gaan.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3" style={{ background: '#0A0E0F' }}>
          <p className="text-sm font-semibold" style={{ color: '#F5F7F6' }}>Samenvatting</p>
          <ul className="space-y-2">
            {[
              'Uw gegevens worden verwerkt voor fysiotherapeutische behandeling',
              'Bewaartermijn: 15 jaar (WGBO-verplichting)',
              'Gegevens worden opgeslagen bij Supabase (EU Frankfurt)',
              'U heeft recht op inzage, correctie en dataportabiliteit',
              'U kunt een klacht indienen bij de Autoriteit Persoonsgegevens',
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

          <Link
            href="/patient/legal/dpa"
            className="text-xs flex items-center gap-1 mt-2"
            style={{ color: '#BEF264' }}
            target="_blank"
          >
            <FileText className="w-3.5 h-3.5" />
            Volledig document lezen
          </Link>

          <p className="text-xs" style={{ color: '#4A5454' }}>
            Versie v1.0 · U kunt dit later bekijken via Instellingen → Privacy
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 space-y-2" style={{ background: '#0A0E0F' }}>
          <Button
            className="w-full font-semibold"
            style={{ background: '#BEF264', color: '#0A0E0F', height: 48 }}
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
          >
            {accept.isPending ? 'Opslaan…' : 'Ik ga akkoord'}
          </Button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 text-sm py-2"
            style={{ color: '#7B8889' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Uitloggen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
