/**
 * Hashtag-logica — puur (geen deps) zodat web en iOS dezelfde regels delen.
 *
 * Drie verdedigingslinies tegen typevarianten (#achillespees / #achilespees /
 * #achilles die uit elkaar groeien):
 *  1. invoer-UI suggereert bestaande tags zodra iemand # typt (voorkomen);
 *  2. normalisatie (lowercase, accenten weg) vangt hoofdletter/accent-varianten;
 *  3. bij het opslaan koppelt de server een nieuwe variant aan een bestaande
 *     tag als die er sterk op lijkt (`findMatchingTag`) — conservatieve
 *     drempel, want onterecht samenvoegen is erger dan een losse tag.
 */

export const TAG_MAX_LEN = 40
export const TAG_MIN_LEN = 2

/** Gap in dagen waarboven een nieuwe episode begint (± 3 maanden). */
export const TAG_EPISODE_GAP_DAYS = 92

/** Normaliseer naar de opslag-sleutel: lowercase, accenten weg, [a-z0-9-]. */
export function normalizeTag(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks na NFD: é → e
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, TAG_MAX_LEN)
}

/** Vind #hashtags in vrije tekst. `display` = zoals getypt (zonder #). */
export function parseHashtags(text: string | null | undefined): { name: string; display: string }[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: { name: string; display: string }[] = []
  // Letters (incl. accenten), cijfers, - en _ ; stopt op spatie/leesteken.
  for (const m of text.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    const display = m[1]
    const name = normalizeTag(display)
    if (name.length < TAG_MIN_LEN || seen.has(name)) continue
    seen.add(name)
    out.push({ name, display })
  }
  return out
}

/** Dice-coëfficiënt op bigrammen (0-1). Robuust voor kleine typefouten. */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const grams = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      map.set(g, (map.get(g) ?? 0) + 1)
    }
    return map
  }
  const ga = grams(a)
  const gb = grams(b)
  let overlap = 0
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0)
  return (2 * overlap) / (a.length - 1 + b.length - 1)
}

/**
 * Horen twee genormaliseerde tags bij elkaar?
 *  - exact;
 *  - de één is een prefix van de ander (#achilles ⊂ #achillespees) en de
 *    korte is lang genoeg (≥5) om geen toeval te zijn;
 *  - bigram-similarity ≥ 0.75 (vangt #achilespees, dubbele letters, etc.).
 */
export function tagsMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length >= 5 && long.startsWith(short)) return true
  return bigramSimilarity(a, b) >= 0.75
}

/** Beste bestaande match voor een (genormaliseerde) nieuwe tag, of null. */
export function findMatchingTag<T extends { name: string }>(name: string, existing: T[]): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const t of existing) {
    if (t.name === name) return t
    if (!tagsMatch(name, t.name)) continue
    const score = bigramSimilarity(name, t.name)
    if (score > bestScore) {
      best = t
      bestScore = score
    }
  }
  return best
}

/**
 * Groepeer usages (oud → nieuw gesorteerd op loggedAt) in episodes: een gap
 * van > TAG_EPISODE_GAP_DAYS start een nieuwe episode. Retourneert episodes
 * nieuwste eerst; binnen een episode nieuwste log eerst.
 */
export function groupIntoEpisodes<T extends { loggedAt: string | Date }>(usages: T[]): T[][] {
  if (usages.length === 0) return []
  const ms = (u: T) => new Date(u.loggedAt).getTime()
  const asc = [...usages].sort((a, b) => ms(a) - ms(b))
  const gapMs = TAG_EPISODE_GAP_DAYS * 24 * 60 * 60 * 1000
  const episodes: T[][] = [[asc[0]]]
  for (let i = 1; i < asc.length; i++) {
    if (ms(asc[i]) - ms(asc[i - 1]) > gapMs) episodes.push([asc[i]])
    else episodes[episodes.length - 1].push(asc[i])
  }
  return episodes.reverse().map(ep => ep.reverse())
}
