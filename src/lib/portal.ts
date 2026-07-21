'use client'

import { usePathname } from 'next/navigation'

/**
 * Portaal-bewuste links.
 *
 * De therapeut- en coach-shell delen hun pagina's: dezelfde component draait
 * onder /therapist/... en onder /coach/... . Alleen de links verschillen, en
 * die mogen niet hardcoded blijven — een coach die op een /therapist-link
 * klikt wordt door de role-guard teruggestuurd naar zijn eigen dashboard.
 *
 * Gebruik in een gedeelde client-pagina:
 *   const portal = usePortal()
 *   router.push(`${portal.patients}/${id}`)
 *
 * Zie docs/plan-coach-role-20260721.md.
 */
export type Portal = {
  /** '/therapist' of '/coach'. */
  base: string
  /** Overzicht van de eigen mensen: patiënten resp. atleten. */
  patients: string
  /** Hoe die mensen heten in copy: 'patiënt' / 'atleet'. */
  personLabel: string
  personLabelPlural: string
  isCoach: boolean
}

const THERAPIST_PORTAL: Portal = {
  base: '/therapist',
  patients: '/therapist/patients',
  personLabel: 'patiënt',
  personLabelPlural: 'patiënten',
  isCoach: false,
}

const COACH_PORTAL: Portal = {
  base: '/coach',
  patients: '/coach/athletes',
  personLabel: 'atleet',
  personLabelPlural: 'atleten',
  isCoach: true,
}

export function usePortal(): Portal {
  const pathname = usePathname()
  return pathname?.startsWith('/coach') ? COACH_PORTAL : THERAPIST_PORTAL
}
