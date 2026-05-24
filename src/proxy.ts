import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const protectedPrefixes = ['/therapist', '/patient', '/athlete', '/admin']
const authRoutes = ['/login', '/register']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = await updateSession(request)

  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  if (!isProtected && !isAuthRoute) return response

  try {
    const { createServerClient } = await import('@supabase/auth-helpers-nextjs')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          set(_n, _v, _o) {},
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          remove(_n, _o) {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (isProtected && !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isAuthRoute && user) {
      // BUGFIX 2026-05-24: we lazen `user.user_metadata?.role` als bron voor
      // de role-dashboard-redirect. Die is undefined voor users die hun
      // invite recent hadden gered, met als gevolg: stille fallback naar
      // /therapist/dashboard voor patiënt/atleet. (Voorval: Jamie Rijff.)
      // Bron van waarheid is de Prisma `User.role`-kolom. Dynamische import
      // houdt Prisma uit de cold-start van requests die deze tak niet raken.
      const { prisma } = await import('@/lib/prisma')
      const dbUser = await prisma.user.findUnique({
        where: { supabaseUserId: user.id },
        select: { role: true },
      })
      if (!dbUser) {
        return NextResponse.redirect(new URL('/login?error=session-stale', request.url))
      }
      const dest =
        dbUser.role === 'PATIENT' ? '/patient/dashboard'
          : dbUser.role === 'ATHLETE' ? '/athlete/dashboard'
            : dbUser.role === 'ADMIN' ? '/admin/dashboard'
              : '/therapist/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }
  } catch {
    // Supabase not reachable — allow access in development only
    if (isProtected && process.env.NODE_ENV === 'production') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|auth/callback).*)'],
}
