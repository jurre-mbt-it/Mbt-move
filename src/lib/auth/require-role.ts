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

export type RequiredRole = 'THERAPIST' | 'ADMIN' | 'PATIENT' | 'ATHLETE'

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: RequiredRole
  practiceId: string | null
  supabaseUserId: string
}

const ROLE_HOME: Record<RequiredRole, string> = {
  ADMIN: '/admin/dashboard',
  THERAPIST: '/therapist/dashboard',
  PATIENT: '/patient/dashboard',
  ATHLETE: '/athlete/dashboard',
}

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
 */
export async function requireRole(
  allowed: RequiredRole | RequiredRole[],
): Promise<SessionUser> {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const ok = Array.isArray(allowed) ? allowed.includes(user.role) : user.role === allowed
  if (!ok) redirect(ROLE_HOME[user.role])

  return user
}
