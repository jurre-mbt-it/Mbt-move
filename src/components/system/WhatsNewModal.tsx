/**
 * "Wat is nieuw" popup. Toont één keer per release een modal met de meest
 * recente release-note. localStorage-key onthoudt welke release-id de
 * therapeut het laatst heeft gezien.
 *
 * Eerste bezoek (geen key): geen popup; we schrijven direct de huidige id
 * weg zodat bestaande gebruikers geen popup krijgen voor wat ze al gebruiken.
 * Pas bij een volgende release ziet de gebruiker de modal.
 */
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  DarkButton,
  Kicker,
  P,
} from '@/components/dark-ui'
import { LAST_SEEN_RELEASE_KEY, latestRelease } from '@/lib/release-notes'

export function WhatsNewModal() {
  const [show, setShow] = useState(false)
  const [note, setNote] = useState(latestRelease())

  useEffect(() => {
    const current = latestRelease()
    if (!current) return
    try {
      const seen = window.localStorage.getItem(LAST_SEEN_RELEASE_KEY)
      if (seen === null) {
        // Eerste bezoek: stilletjes baseline zetten, geen popup
        window.localStorage.setItem(LAST_SEEN_RELEASE_KEY, current.id)
        return
      }
      if (seen !== current.id) {
        setNote(current)
        setShow(true)
      }
    } catch {
      // localStorage uitgeschakeld; popup overslaan
    }
  }, [])

  const dismiss = () => {
    if (note) {
      try {
        window.localStorage.setItem(LAST_SEEN_RELEASE_KEY, note.id)
      } catch {}
    }
    setShow(false)
  }

  if (!show || !note) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Wat is nieuw"
    >
      <div
        className="rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
        style={{ background: P.surface, border: `1px solid ${P.lineStrong}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <Kicker>Wat is nieuw</Kicker>
        <h2
          className="athletic-display mt-1"
          style={{ color: P.ink, fontSize: 24, lineHeight: '28px', letterSpacing: '-0.02em' }}
        >
          {note.title}
        </h2>
        <p className="athletic-mono mt-1" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.06em' }}>
          {new Date(note.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {note.highlight && (
          <p style={{ color: P.ink, fontSize: 14, marginTop: 12, lineHeight: '20px' }}>
            {note.highlight}
          </p>
        )}
        <ul className="mt-4 space-y-2">
          {note.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2" style={{ color: P.inkMuted, fontSize: 13, lineHeight: '20px' }}>
              <span style={{ color: P.brand, marginTop: 1 }}>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between gap-3">
          <Link
            href="/therapist/release-notes"
            onClick={dismiss}
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}
          >
            ALLE RELEASE NOTES →
          </Link>
          <DarkButton onClick={dismiss}>BEGREPEN</DarkButton>
        </div>
      </div>
    </div>
  )
}
