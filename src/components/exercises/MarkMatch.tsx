'use client'

// Naam bewust niet `Highlight`: dat is ook een DOM-global (de CSS Custom
// Highlight API). Vergeet je dan één import, dan verwijst de JSX stilletjes
// naar die constructor en klapt het scherm om bij het renderen.

import { searchSegments } from '@/lib/exercise-search'

/**
 * Markeert het stuk van een naam dat overeenkomt met wat er getypt is, zodat
 * je in een lijst meteen ziet wáárom een oefening naar boven komt. "squat"
 * licht op in "Back Squat", ook midden in de naam. De segmentering komt uit
 * lib/exercise-search en is woord-tolerant: "push up" markeert ook "Push-Up".
 *
 * De zoekopdracht op de server is ruimer dan wat hier gemarkeerd kan worden:
 * hij vindt ook typefouten en synoniemen via tags. In die gevallen staat de
 * letterlijke tekst niet in de naam en markeren we niets — een verkeerd
 * gemarkeerd stuk is verwarrender dan geen markering.
 */
export function MarkMatch({ text, query }: { text: string; query: string }) {
  const delen = searchSegments(text, query ?? '')
  if (delen.length === 1) return <>{text}</>
  return (
    <>
      {delen.map((d, i) =>
        d.hit ? (
          <mark
            key={i}
            style={{
              background: 'color-mix(in srgb, var(--p-gold) 30%, transparent)',
              color: 'inherit',
              borderRadius: 2,
              padding: '0 1px',
            }}
          >
            {d.text}
          </mark>
        ) : (
          <span key={i}>{d.text}</span>
        ),
      )}
    </>
  )
}
