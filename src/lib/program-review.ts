/**
 * Programma controle-signaal.
 *
 * Een actief programma dat lang ongewijzigd blijft, levert een signaal voor de
 * therapeut op ("controleer of het schema nog passend is"). De drempel is per
 * programma instelbaar (`reviewAfterWeeks`); is die leeg, dan geldt de
 * standaard van 8 weken. Een ingestelde waarde overrulet de standaard — ook
 * boven de 8 weken.
 *
 * De klok telt vanaf de laatste wijziging (`updatedAt`): elke aanpassing aan
 * het programma reset de teller, plus de expliciete "markeer als gecontroleerd"-
 * actie (die bumpt `updatedAt`).
 */

export const DEFAULT_REVIEW_WEEKS = 8

/** Effectieve drempel in weken: ingestelde waarde of de standaard. */
export function reviewThresholdWeeks(
  reviewAfterWeeks: number | null | undefined,
): number {
  return reviewAfterWeeks && reviewAfterWeeks > 0
    ? reviewAfterWeeks
    : DEFAULT_REVIEW_WEEKS
}

/** Aantal volledige weken sinds `date` (kan fractioneel zijn). */
export function weeksSince(date: Date | string, now: Date = new Date()): number {
  const t = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
  return (now.getTime() - t) / (7 * 86_400_000)
}

/** Is dit programma toe aan een controle? */
export function isReviewDue(
  updatedAt: Date | string,
  reviewAfterWeeks: number | null | undefined,
  now: Date = new Date(),
): boolean {
  return weeksSince(updatedAt, now) >= reviewThresholdWeeks(reviewAfterWeeks)
}
