'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'cookie-consent'

/**
 * Cookiemelding van getbase.coach.
 *
 * Tot 18-09-2026 vroeg deze melding om toestemming met twee knoppen (alleen
 * noodzakelijk / accepteren) en verwees hij naar de privacyverklaring van de
 * praktijksite. Dat klopte niet met de werkelijkheid: getbase.coach zet alleen
 * de sessiecookie van het inloggen, er draaien geen analytics of tracking. Een
 * keuze aanbieden voor cookies die niet bestaan is misleidend, dus nu is het
 * een mededeling met één knop, en de link gaat naar /privacy (de verklaring
 * van BASE zelf). Komt er ooit wél een meetscript bij, dan hoort hier weer een
 * echte keuze te staan, en moet PrivacyStatement.tsx mee.
 *
 * De voorkeur staat in localStorage (geen cookie), dus de melding verdwijnt
 * per browser en komt terug in een andere.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}
function getSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Privémodus of geblokkeerde opslag: dan maar geen melding.
    return 'blocked'
  }
}
// Op de server (en tijdens hydratie) is er geen melding; de client rendert
// hem daarna alsnog als er niets in localStorage staat.
function getServerSnapshot(): string | null {
  return 'server'
}

export function CookieBanner() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [dismissed, setDismissed] = useState(false)

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'necessary')
    } catch {
      // Zie getSnapshot.
    }
    setDismissed(true)
  }

  const visible = stored === null && !dismissed
  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Cookiemelding"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-3.5"
      style={{
        background: 'var(--p-surface)',
        borderColor: 'var(--p-line-strong)',
        color: 'var(--p-ink)',
        maxHeight: 120,
        animation: 'mbt-sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both, mbt-fade-in 320ms ease-out both',
      }}
    >
      <p className="text-sm leading-snug" style={{ color: 'var(--p-ink-muted)' }}>
        BASE gebruikt alleen een functionele cookie om je ingelogd te houden. Geen tracking,
        geen statistieken.{' '}
        <Link
          href="/privacy"
          className="underline underline-offset-2"
          style={{ color: 'var(--p-ink)' }}
        >
          Privacyverklaring
        </Link>
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="athletic-tap mbt-btn-hover flex-1 rounded-lg border px-4 py-2 text-sm font-medium sm:flex-none"
          style={{
            borderColor: 'var(--p-line-strong)',
            color: 'var(--p-ink)',
            background: 'transparent',
          }}
        >
          Begrepen
        </button>
      </div>
    </div>
  )
}
