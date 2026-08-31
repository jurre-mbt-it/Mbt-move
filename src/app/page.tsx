import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerUser, ROLE_HOME } from '@/lib/auth/require-role'
import { BaseLanding } from '@/components/base-site/BaseLanding'
import { AuthHashCatcher } from '@/components/base-site/AuthHashCatcher'

/**
 * Publieke voordeur van BASE (getbase.coach).
 *
 * Twee dingen die hier bewust zo staan:
 *
 * 1. De sessiecheck gebeurt server-side, zodat een ingelogde gebruiker meteen
 *    naar zijn eigen dashboard gaat en de marketingpagina niet eerst even
 *    ziet flitsen. `getServerUser()` raakt de database alleen als er een
 *    Supabase-sessie in de cookies zit, dus anonieme bezoekers kosten geen query.
 *
 * 2. Inloglinks van Supabase landen op deze route met de tokens in het
 *    hash-fragment. Dat fragment komt nooit bij de server, dus dat blijft
 *    client-side werk: <AuthHashCatcher /> zet ze door naar /auth/callback.
 *    Haal je die weg, dan werkt inloggen via de mail niet meer.
 */
export const metadata: Metadata = {
  title: { absolute: 'BASE voor fysiotherapiepraktijken' },
  description:
    'Programmeer, monitor en evalueer revalidatie en training in één platform. BASE brengt programma\u2019s, criteria, metingen en trainingsbelasting samen.',
}

export default async function RootPage() {
  const user = await getServerUser()
  if (user) redirect(ROLE_HOME[user.role])

  return (
    <>
      <AuthHashCatcher />
      <BaseLanding />
    </>
  )
}
