/**
 * Kalenderweken, in de tijdzone waarin de app daadwerkelijk gebruikt wordt.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * `WeekSchedule.startDate` wordt door de planner geschreven als "maandag
 * 00:00 lokale tijd". In de database staat dat als een instant, bijvoorbeeld
 * `2026-05-03T22:00:00Z` — dat is maandag 4 mei 00:00 in Amsterdam, maar
 * ZONDAG 3 mei in UTC.
 *
 * Server-side op UTC normaliseren (`getUTCDay()`) ziet dus een zondag en
 * schuift naar de maandag ervóór: een hele week ernaast. Alle 8 startDate-
 * waarden in productie hebben deze vorm, dus dat is geen randgeval maar de
 * norm.
 *
 * De server draait op Vercel in UTC, dus `getDay()` gebruiken helpt ook niet.
 * Daarom rekenen we expliciet in `Europe/Amsterdam`. Dat is geen aanname maar
 * de realiteit: één praktijk, één land. Wordt dat ooit anders, dan hoort de
 * tijdzone per praktijk opgeslagen te worden en is dit de plek om dat te doen.
 */

const TZ = 'Europe/Amsterdam'

/** Kalenderdag (YYYY-MM-DD) van een instant, gezien in NL. */
export function dateKey(d: Date): string {
  // en-CA levert precies YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Een kale kalenderdag als UTC-middag — veilig om weekdag mee te rekenen. */
function keyToNoon(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12))
}

/** Maandag van de week waarin deze kalenderdag valt, als YYYY-MM-DD. */
export function mondayKey(key: string): string {
  const x = keyToNoon(key)
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
  return x.toISOString().slice(0, 10)
}

/** Maandag van de week waarin een instant valt, als YYYY-MM-DD (NL). */
export function mondayKeyOf(d: Date): string {
  return mondayKey(dateKey(d))
}

/** Verschuif een kalenderdag met n dagen. */
export function addDaysKey(key: string, n: number): string {
  const x = keyToNoon(key)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** Hele weken tussen twee maandagen (b - a). */
export function weeksBetween(aKey: string, bKey: string): number {
  return Math.round((keyToNoon(bKey).getTime() - keyToNoon(aKey).getTime()) / (7 * 864e5))
}

/**
 * De instant die 00:00 NL-tijd is op deze kalenderdag. Dit is de vorm waarin
 * bestaande `startDate`-waarden staan; nieuwe weken moeten hetzelfde doen,
 * anders matcht de ene helft van de data niet met de andere.
 */
export function amsMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  const guess = Date.UTC(y, (m ?? 1) - 1, d ?? 1)
  // Offset van de zone op dát moment bepalen (werkt over zomertijd heen).
  const asIfUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }))
  const asIfTz = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ }))
  return new Date(guess - (asIfTz.getTime() - asIfUtc.getTime()))
}

/** Valideert een YYYY-MM-DD string. */
export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(keyToNoon(s).getTime())
}
