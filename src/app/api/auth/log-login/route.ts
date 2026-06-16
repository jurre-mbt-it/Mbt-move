import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auditLog } from '@/server/audit'

/**
 * Legt een geslaagde login vast in de audit-log (`LOGIN_SUCCESS`, met IP +
 * user-agent uit de request).
 *
 * Waarom een apart endpoint: inloggen gebeurt client-side rechtstreeks tegen
 * Supabase (OTP-code of magic link), dus de server ziet de login zelf niet.
 * Dit endpoint wordt best-effort aangeroepen op de twee echte login-momenten
 * (na OTP-verify in LoginForm en na de magic-link-callback). MFA-stappen loggen
 * apart `MFA_VERIFIED`/`MFA_FAILED`, dus die horen hier niet thuis.
 *
 * Dedup: per gebruiker maximaal één LOGIN_SUCCESS binnen DEDUP_WINDOW_MS, zodat
 * dubbele triggers (code- én magic-link-pad, dubbelklik, re-render) niet tot
 * dubbele rijen leiden.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEDUP_WINDOW_MS = 2 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          set(_name: string, _value: string) {},
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          remove(_name: string) {},
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return new NextResponse(null, { status: 204 })

    // Prisma-gebruiker = actor van de audit-rij. Zelfde precedentie als
    // /api/auth/me: eerst supabaseUserId, daarna email-fallback voor legacy
    // rijen die nog niet aan een (andere) Supabase-account gebonden zijn.
    const select = { id: true, email: true, supabaseUserId: true } as const
    let dbUser = await prisma.user.findUnique({ where: { supabaseUserId: user.id }, select })
    if (!dbUser && user.email) {
      const byEmail = await prisma.user.findUnique({ where: { email: user.email }, select })
      if (byEmail && (!byEmail.supabaseUserId || byEmail.supabaseUserId === user.id)) {
        dbUser = byEmail
      }
    }
    if (!dbUser) return new NextResponse(null, { status: 204 })

    // Dedup binnen het venster.
    const since = new Date(Date.now() - DEDUP_WINDOW_MS)
    const recent = await prisma.auditLog.findFirst({
      where: { userId: dbUser.id, event: 'LOGIN_SUCCESS', createdAt: { gte: since } },
      select: { id: true },
    })
    if (recent) return new NextResponse(null, { status: 204 })

    await auditLog({
      event: 'LOGIN_SUCCESS',
      userId: dbUser.id,
      actorEmail: dbUser.email,
      req,
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    // Audit mag de login nooit breken.
    return new NextResponse(null, { status: 204 })
  }
}
