/**
 * Server-side role-guard voor App Router layouts.
 *
 * Bron van waarheid is de Prisma User-tabel (kolom `role`), NIET
 * `auth.users.user_metadata.role` van Supabase. Die laatste kon undefined
 * zijn na invite-redeem, waardoor in de proxy-fallback `/therapist/dashboard`
 * werd gekozen voor een non-therapist. Daar zat het lek waardoor een ATHLETE
 * (Jamie Rijff, 2026-04-26) opeens in de therapeut-shell terechtkwam.
 *
 * Gebruik in een role-segment layout:
 *
 *   export default async function TherapistLayout({ children }) {
 *     await requireRole(['THERAPIST', 'ADMIN'])
 *     return <Shell>{children}</Shell>
 *   }
 *
 * Bij niet-ingelogd: redirect naar /login.
 * Bij verkeerde rol: redirect naar het eigen dashboard.
 */
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { DPA_VERSION } from '@/lib/dpa-constants'
import { isPersonalModeEnabled } from './personal-mode'

export type RequiredRole = 'THERAPIST' | 'ADMIN' | 'PATIENT' | 'ATHLETE'

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: RequiredRole
  practiceId: string | null
  supabaseUserId: string
  dpaAcceptedVersion: string | null
}

const ROLE_HOME: Record<RequiredRole, string> = {
  ADMIN: '/admin/dashboard',
  THERAPIST: '/therapist/dashboard',
  PATIENT: '/patient/dashboard',
  ATHLETE: '/athlete/dashboard',
}

/** Rollen die de DPA (Verwerkingsovereenkomst) moeten accepteren vóór ze
 *  patient-data raken. Therapeut/admin tekenen DPA buiten de app om. */
const DPA_REQUIRED_ROLES: ReadonlySet<RequiredRole> = new Set(['PATIENT', 'ATHLETE'])

/**
 * Resolve current logged-in user via Supabase cookie → Prisma row.
 * Cached per-request via React `cache()` zodat meerdere layout-calls in
 * dezelfde RSC-render maar één DB-query veroorzaken.
 *
 * Returns `null` als er geen geldige sessie is.
 */
export const getServerUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return null

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        practiceId: true,
        supabaseUserId: true,
        dpaAcceptedVersion: true,
      },
    })
    if (!dbUser || !dbUser.supabaseUserId) return null
    return dbUser as SessionUser
  } catch {
    return null
  }
})

/**
 * Eis dat de huidige user een van de toegestane rollen heeft. Anders redirect.
 *  - Niet ingelogd                  → /login
 *  - Wel ingelogd, verkeerde rol    → eigen dashboard (geen access-denied-page)
 *  - PATIENT/ATHLETE zonder DPA     → /onboarding/dpa
 *
 * `skipDpa: true` is een escape-hatch voor pagina's die nog vóór DPA-accept
 * bereikbaar moeten zijn (settings, logout). De /onboarding/dpa-page zelf
 * leeft buiten de role-segment groups en hoeft deze guard niet aan te
 * roepen.
 */
export async function requireRole(
  allowed: RequiredRole | RequiredRole[],
  options: { skipDpa?: boolean } = {},
): Promise<SessionUser> {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const ok = Array.isArray(allowed) ? allowed.includes(user.role) : user.role === allowed
  if (!ok) redirect(ROLE_HOME[user.role])

  if (!options.skipDpa && DPA_REQUIRED_ROLES.has(user.role) && user.dpaAcceptedVersion !== DPA_VERSION) {
    redirect('/onboarding/dpa')
  }

  return user
}

export type AthleteAccess = SessionUser & {
  /** True wanneer een THERAPIST/ADMIN de atleet-shell gebruikt voor zijn
   *  eigen training (persoonlijke modus), i.p.v. een echte ATHLETE. */
  isTherapistPersonalMode: boolean
}

/**
 * Guard voor de atleet-shell. Naast echte ATHLETE-users laat deze ook
 * THERAPIST/ADMIN binnen wanneer de persoonlijke-trainingsmodus aan staat
 * (cookie). Zo kan een therapeut zijn eigen schema's loggen en bekijken
 * zonder tweede account — alle queries draaien op `ctx.user.id`.
 *
 *  - Niet ingelogd                         → /login
 *  - ATHLETE zonder DPA                     → /onboarding/dpa
 *  - THERAPIST/ADMIN zonder modus-cookie    → /therapist/dashboard
 *  - PATIENT of overige                     → eigen dashboard
 */
export async function requireAthleteAccess(): Promise<AthleteAccess> {
  const user = await getServerUser()
  if (!user) redirect('/login')

  if (user.role === 'ATHLETE') {
    if (user.dpaAcceptedVersion !== DPA_VERSION) redirect('/onboarding/dpa')
    return { ...user, isTherapistPersonalMode: false }
  }

  if (user.role === 'THERAPIST' || user.role === 'ADMIN') {
    if (await isPersonalModeEnabled()) {
      return { ...user, isTherapistPersonalMode: true }
    }
    redirect('/therapist/dashboard')
  }

  redirect(ROLE_HOME[user.role])
}
