/**
 * Release notes pagina. Toont alle entries uit `lib/release-notes.ts`,
 * nieuwste eerst. Bereikbaar via de sidebar én via "Alle release notes" in
 * de "wat is nieuw" popup.
 */
'use client'

import {
  DarkHeader,
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { releaseNotes } from '@/lib/release-notes'

export default function ReleaseNotesPage() {
  return (
    <DarkScreen>
      <DarkHeader title="Release notes" backHref="/therapist/dashboard" />
      <div className="max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-5">
        <div>
          <Kicker>Changelog</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2, color: P.ink }}
          >
            WAT IS NIEUW
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
            Hier zie je wat er per release is veranderd in MBT-Gym.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {releaseNotes.map((note) => (
            <Tile key={note.id} accentBar={P.lime}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 style={{ color: P.ink, fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {note.title}
                </h2>
                <MetaLabel>
                  {new Date(note.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </MetaLabel>
              </div>
              {note.highlight && (
                <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 6, lineHeight: '20px' }}>
                  {note.highlight}
                </p>
              )}
              <ul className="mt-3 space-y-1.5">
                {note.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2"
                    style={{ color: P.inkMuted, fontSize: 13, lineHeight: '20px' }}
                  >
                    <span style={{ color: P.lime, marginTop: 1 }}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Tile>
          ))}
        </div>
      </div>
    </DarkScreen>
  )
}
