'use client'

import { useEffect, useState } from 'react'

type CookieConsent = 'accepted' | 'necessary'

const STORAGE_KEY = 'cookie-consent'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  function choose(consent: CookieConsent) {
    localStorage.setItem(STORAGE_KEY, consent)
    setVisible(false)
  }

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
        Wij gebruiken cookies om je ervaring te verbeteren.{' '}
        <a
          href="https://www.movementbasedtherapy.nl/privacy-policy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: 'var(--p-ink)' }}
        >
          Privacybeleid
        </a>
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => choose('necessary')}
          className="athletic-tap mbt-btn-hover flex-1 rounded-lg border px-4 py-2 text-sm font-medium sm:flex-none"
          style={{
            borderColor: 'var(--p-line-strong)',
            color: 'var(--p-ink)',
            background: 'transparent',
          }}
        >
          Alleen noodzakelijk
        </button>
        <button
          type="button"
          onClick={() => choose('accepted')}
          className="athletic-tap mbt-btn-hover flex-1 rounded-lg px-4 py-2 text-sm font-semibold sm:flex-none"
          style={{
            background: '#3ECF6A',
            color: 'var(--p-bg)',
          }}
        >
          Accepteren
        </button>
      </div>
    </div>
  )
}
