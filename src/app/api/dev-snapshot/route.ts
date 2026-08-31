import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'

/**
 * TIJDELIJK, ALLEEN LOKAAL. Slaat een gemaskeerde momentopname van een
 * app-scherm op als statisch bestand in public/, zodat er een schermopname van
 * gemaakt kan worden voor de website.
 *
 * Waarom dit nodig is: de ontwikkelserver ververst het tabblad van buitenaf.
 * Een in het geheugen gemaskeerde pagina is dan zo weer weg en toont opeens
 * weer echte patiëntnamen. Een bestand blijft staan.
 *
 * Er gaat hier bewust alleen HTML in die de browser al gemaskeerd heeft. Geen
 * sessiegegevens, geen tokens. VERWIJDEREN, met het bestand, na de opnames.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }
  const host = request.headers.get('host') ?? ''
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { naam, html } = (await request.json()) as { naam?: string; html?: string }
  if (!naam || !html) return NextResponse.json({ ok: false, reden: 'naam en html vereist' }, { status: 400 })
  if (!/^[a-z0-9-]{1,40}$/.test(naam)) {
    return NextResponse.json({ ok: false, reden: 'ongeldige naam' }, { status: 400 })
  }

  const doel = path.join(process.cwd(), 'public', `_opname-${naam}.html`)
  await writeFile(doel, html, 'utf8')
  return NextResponse.json({ ok: true, pad: `/_opname-${naam}.html`, bytes: html.length })
}
