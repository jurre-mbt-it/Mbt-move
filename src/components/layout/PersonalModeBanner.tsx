'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Stethoscope, ArrowLeft, Loader2 } from 'lucide-react'
import { setPersonalMode } from '@/lib/personal-mode-client'
import { P } from '@/components/dark-ui'

/**
 * Smalle balk bovenin de atleet-shell, alléén zichtbaar voor een therapeut die
 * in persoonlijke modus zit. Maakt duidelijk dat hij nu als zichzelf traint en
 * biedt een directe weg terug naar de therapeut-shell. Echte ATHLETE-users
 * krijgen deze balk nooit te zien (de layout rendert hem alleen als
 * isTherapistPersonalMode true is).
 */
export function PersonalModeBanner() {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function exit() {
    setLeaving(true)
    await setPersonalMode(false)
    router.push('/therapist/dashboard')
    router.refresh()
  }

  return (
    <div
      className="mbt-fade-in flex items-center justify-between gap-3 px-4 py-2 border-b"
      style={{ background: P.surfaceLow, borderColor: P.lineStrong }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Stethoscope className="w-4 h-4 shrink-0" style={{ color: P.brand }} />
        <span
          className="athletic-mono truncate"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.14em', fontWeight: 700 }}
        >
          PERSOONLIJKE MODUS · JE TRAINT ALS JEZELF
        </span>
      </div>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="athletic-tap flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0 transition-colors disabled:opacity-60"
        style={{ background: P.control, color: P.ink, fontSize: 12, fontWeight: 700 }}
      >
        {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeft className="w-3.5 h-3.5" />}
        Therapeut
      </button>
    </div>
  )
}
