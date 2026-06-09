import { cookies } from 'next/headers'

/**
 * "Persoonlijke trainingsmodus" voor therapeuten.
 *
 * Een THERAPIST/ADMIN blijft één User-rij met `role = THERAPIST`, maar kan
 * tijdelijk de atleet-shell gebruiken om *zijn eigen* training te loggen en
 * te plannen. De modus is puur een UI-cookie — hij geeft géén extra
 * data-toegang: de patient-self procedures draaien al onder `protectedProcedure`
 * en schrijven altijd naar `ctx.user.id`. De cookie bepaalt alleen of de
 * atleet-layout een therapeut binnenlaat (zie `requireAthleteAccess`).
 */
export const PERSONAL_MODE_COOKIE = 'mbt-personal-mode'

/** Server-side: staat de persoonlijke modus aan voor de huidige request? */
export async function isPersonalModeEnabled(): Promise<boolean> {
  const store = await cookies()
  return store.get(PERSONAL_MODE_COOKIE)?.value === '1'
}
