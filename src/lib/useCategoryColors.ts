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
/**
 * De set die tot 20 augustus 2026 de standaard was. Praktijken die nooit
 * bewust een kleur hebben gekozen, hebben deze waarden alsnog opgeslagen
 * gekregen. Zonder deze controle blijven zij op de oude tinten hangen en heeft
 * een wijziging in CATEGORY_COLORS voor hen geen enkel effect — precies het
 * probleem waardoor de nieuwe agendakleuren niet doorkwamen.
 */
const OUDE_STANDAARD: Record<string, string> = {
  STRENGTH:    '#9fcec9',
  MOBILITY:    '#7fb0d8',
  PLYOMETRICS: '#d9c08a',
  CARDIO:      '#45a8a2',
  STABILITY:   '#b9a6d4',
}

/** Is dit precies de oude standaardset, dus niets bewust gekozen? */
function isOudeStandaard(colors: Record<string, string>): boolean {
  const sleutels = Object.keys(OUDE_STANDAARD)
  return sleutels.every(k => colors[k]?.trim().toLowerCase() === OUDE_STANDAARD[k])
    && Object.keys(colors).length <= sleutels.length
}

export function useCategoryColors(): Record<string, string> {
  const { data } = trpc.practice.categoryColors.useQuery(undefined, {
    staleTime: 5 * 60_000,
  })
  const opgeslagen = data?.colors
  if (!opgeslagen || isOudeStandaard(opgeslagen)) return CATEGORY_COLORS
  return opgeslagen
}
