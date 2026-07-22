'use client'

import { trpc } from '@/lib/trpc/client'
import { CATEGORY_COLORS } from '@/lib/palette'

/**
 * De kleuren per trainingssoort zoals de praktijk (of de losse coach) ze heeft
 * ingesteld, met de standaardkleuren als er niets is ingesteld.
 *
 * Geeft bewust échte hexcodes terug en geen `var(--…)`: op tientallen plekken
 * in de app wordt hier een doorzichtigheid achter geplakt (`${color}22`), en
 * dat levert bij een var() ongeldige CSS op die stil transparant rendert.
 *
 * React Query bundelt de aanvraag op sleutel, dus het geeft niet dat meerdere
 * componenten deze hook los aanroepen — er gaat één verzoek uit.
 */
export function useCategoryColors(): Record<string, string> {
  const { data } = trpc.practice.categoryColors.useQuery(undefined, {
    staleTime: 5 * 60_000,
  })
  return data?.colors ?? CATEGORY_COLORS
}
