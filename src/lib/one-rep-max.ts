/**
 * Geschat 1RM via Epley: gewicht × (1 + reps/30).
 *
 * Server-side fallback bij het loggen van sessies — vóór deze helper werd
 * 1RM alleen client-side berekend als `program.trackOneRepMax` aanstond,
 * waardoor de 1RM-grafieken leeg bleven terwijl gewicht + reps wél gelogd
 * werden.
 */
export function estimateOneRepMax(
  weight: number | null | undefined,
  reps: number | null | undefined,
): number | null {
  if (!weight || weight <= 0 || !reps || reps <= 0) return null
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}
