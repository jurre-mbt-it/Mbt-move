/**
 * Woord-tolerant zoeken in oefeningnamen.
 *
 * "push up", "push-up" en "pushup" horen elkaar allemaal te vinden. Dat lukt
 * niet met een kale `includes`: het koppelteken in de naam breekt de match.
 * Hier wordt zowel de zoekterm als de naam teruggebracht tot alleen kleine
 * letters en cijfers (accenten eraf, al het andere is scheidingsteken) en
 * matchen we per woord: elk woord uit de zoekterm moet ergens in de
 * platgeslagen tekst voorkomen. "scapula push up" vindt zo ook "Scapula
 * Push-Up", en "pushup" vindt "Push-Up Plus".
 *
 * `searchSegments` levert daarnaast de gevonden stukken terug als segmenten
 * van de ORIGINELE tekst, zodat de UI kan markeren wáárom een oefening naar
 * boven komt — inclusief het koppelteken als de match eroverheen loopt.
 *
 * GESPIEGELD in de mobiele repo als `lib/exercise-search.ts`; de drift-check
 * (`npm run check:mirror`) vergelijkt beide implementaties op gedrag. Bewust
 * geen imports, en geen \p{…}-regexes: het bestand moet ook onder Hermes en
 * rechtstreeks in het check-script laden.
 */

export type SearchSegment = { text: string; hit: boolean }

/** Combining marks (NFD-accenten) — \p{Diacritic} zonder unicode-property. */
const COMBINING = /[\u0300-\u036f]/g

function normChar(ch: string): string {
  return ch.toLowerCase().normalize('NFD').replace(COMBINING, '')
}

function isAlnum(g: string): boolean {
  return (g >= 'a' && g <= 'z') || (g >= '0' && g <= '9')
}

/**
 * Platgeslagen weergave van een tekst: alleen [a-z0-9], met per teken de
 * begin- en eindpositie in het origineel zodat een match terug te vertalen
 * is naar echte tekstposities.
 */
function flatten(s: string): { flat: string; from: number[]; to: number[] } {
  let flat = ''
  const from: number[] = []
  const to: number[] = []
  let i = 0
  for (const ch of s) {
    for (const g of normChar(ch)) {
      if (isAlnum(g)) {
        flat += g
        from.push(i)
        to.push(i + ch.length)
      }
    }
    i += ch.length
  }
  return { flat, from, to }
}

/** Zoekterm → losse platgeslagen woorden. Lege term → geen woorden. */
function words(query: string): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of query) {
    for (const g of normChar(ch)) {
      if (isAlnum(g)) cur += g
      else if (cur) { out.push(cur); cur = '' }
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Matcht een zoekterm tegen één of meer velden (naam, tags, …). Elk woord uit
 * de zoekterm moet in minstens één veld voorkomen; de woorden mogen over
 * velden verspreid zijn, zodat een synoniem-tag één woord mag dekken terwijl
 * de naam de rest dekt. Lege zoekterm matcht alles.
 */
export function searchMatch(query: string, fields: Array<string | null | undefined>): boolean {
  const terms = words(query)
  if (terms.length === 0) return true
  const flats = fields.filter((f): f is string => !!f).map(f => flatten(f).flat)
  return terms.every(term => flats.some(flat => flat.includes(term)))
}

/**
 * Segmenten van `text` met de matches van `query` aangemerkt (`hit: true`),
 * voor markering in een lijst. Woorden korter dan 2 tekens markeren we niet
 * ("u" oplichten in elke naam is ruis), en een tekst zonder enige match komt
 * als één ongemarkeerd segment terug — verkeerd markeren is verwarrender dan
 * niet markeren (de server vindt bv. ook typo's die letterlijk nergens staan).
 */
export function searchSegments(text: string, query: string): SearchSegment[] {
  const whole: SearchSegment[] = [{ text, hit: false }]
  const terms = words(query).filter(t => t.length >= 2)
  if (terms.length === 0 || !text) return whole

  const { flat, from, to } = flatten(text)
  const ranges: Array<[number, number]> = []
  for (const term of terms) {
    let p = flat.indexOf(term)
    while (p !== -1) {
      ranges.push([from[p], to[p + term.length - 1]])
      p = flat.indexOf(term, p + 1)
    }
  }
  if (ranges.length === 0) return whole

  // Overlappende en aansluitende stukken samenvoegen, dan opknippen.
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const out: SearchSegment[] = []
  let i = 0
  for (const [a, b] of merged) {
    if (a > i) out.push({ text: text.slice(i, a), hit: false })
    out.push({ text: text.slice(a, b), hit: true })
    i = b
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false })
  return out
}
