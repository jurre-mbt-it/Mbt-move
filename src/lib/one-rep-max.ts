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

/**
 * De zwaarste set uit de per-set arrays: topgewicht mét de reps van díe set
 * (zelfde conventie als de workout-bouwer in de iOS-app). Systeem-breed is
 * `weight` + `repsCompleted` "de zwaarste set"; deze helper leidt dat paar af
 * wanneer een client alleen weightsPerSet/repsPerSet meestuurt — de iOS
 * programma-runner deed dat, waardoor die logs onzichtbaar bleven voor
 * getLastWeights (filterde op weight) en er geen 1RM uit rolde.
 */
export function deriveTopSet(
  weightsPerSet: unknown,
  repsPerSet: unknown,
): { weight: number | null; reps: number | null } {
  if (!Array.isArray(weightsPerSet)) return { weight: null, reps: null }
  let weight: number | null = null
  let reps: number | null = null
  weightsPerSet.forEach((w, i) => {
    if (typeof w === 'number' && w > 0 && (weight == null || w > weight)) {
      weight = w
      const r = Array.isArray(repsPerSet) ? repsPerSet[i] : null
      reps = typeof r === 'number' && r > 0 ? r : null
    }
  })
  return { weight, reps }
}
