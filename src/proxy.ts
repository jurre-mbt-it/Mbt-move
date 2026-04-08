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
      const role = user.user_metadata?.role
      const dest = role === 'PATIENT' ? '/patient/dashboard' : role === 'ATHLETE' ? '/athlete/dashboard' : '/therapist/dashboard'
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
