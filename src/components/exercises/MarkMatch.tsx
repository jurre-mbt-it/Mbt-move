'use client'

// Naam bewust niet `Highlight`: dat is ook een DOM-global (de CSS Custom
// Highlight API). Vergeet je dan één import, dan verwijst de JSX stilletjes
// naar die constructor en klapt het scherm om bij het renderen.

/**
 * Markeert het stuk van een naam dat overeenkomt met wat er getypt is, zodat
 * je in een lijst meteen ziet wáárom een oefening naar boven komt. "squat"
 * licht op in "Back Squat", ook midden in de naam.
 *
 * De zoekopdracht op de server is ruimer dan wat hier gemarkeerd kan worden:
 * hij vindt ook typefouten en synoniemen via tags. In die gevallen staat de
 * letterlijke tekst niet in de naam en markeren we niets — een verkeerd
 * gemarkeerd stuk is verwarrender dan geen markering.
 */

/** Zoekt alle voorkomens los van hoofdletters en accenten. */
function segmenten(tekst: string, term: string): Array<{ t: string; raak: boolean }> {
  const naald = term.trim()
  if (naald.length < 2) return [{ t: tekst, raak: false }]

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const hooi = norm(tekst)
  const zoek = norm(naald)
  // Normaliseren kan de lengte veranderen (é → e is 1 teken, maar ﬁ → fi is 2).
  // Bij lengteverschil markeren we niet, dan kloppen de posities niet meer.
  if (hooi.length !== tekst.length) return [{ t: tekst, raak: false }]

  const out: Array<{ t: string; raak: boolean }> = []
  let i = 0
  for (;;) {
    const p = hooi.indexOf(zoek, i)
    if (p === -1) break
    if (p > i) out.push({ t: tekst.slice(i, p), raak: false })
    out.push({ t: tekst.slice(p, p + zoek.length), raak: true })
    i = p + zoek.length
  }
  if (out.length === 0) return [{ t: tekst, raak: false }]
  if (i < tekst.length) out.push({ t: tekst.slice(i), raak: false })
  return out
}

export function MarkMatch({ text, query }: { text: string; query: string }) {
  const delen = segmenten(text, query ?? '')
  if (delen.length === 1) return <>{text}</>
  return (
    <>
      {delen.map((d, i) =>
        d.raak ? (
          <mark
            key={i}
            style={{
              background: 'color-mix(in srgb, var(--p-gold) 30%, transparent)',
              color: 'inherit',
              borderRadius: 2,
              padding: '0 1px',
            }}
          >
            {d.t}
          </mark>
        ) : (
          <span key={i}>{d.t}</span>
        ),
      )}
    </>
  )
}
