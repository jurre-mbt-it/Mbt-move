import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that require authentication
const protectedPrefixes = ['/therapist', '/patient', '/admin']
// Routes that should redirect to dashboard if already authenticated
const authRoutes = ['/login', '/register']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Refresh the session cookie (no-ops if Supabase not configured)
  const response = await updateSession(request)

  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  if (isProtected || isAuthRoute) {
    try {
      const { createServerClient } = await import('@supabase/auth-helpers-nextjs')
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name) {
              return request.cookies.get(name)?.value
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            set(_name, _value, _options) {},
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            remove(_name, _options) {},
          },
        }
      )

      const { data: { user } } = await supabase.auth.getUser()

      if (isProtected && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
      }

      if (isAuthRoute && user) {
        return NextResponse.redirect(new URL('/therapist/dashboard', request.url))
      }
    } catch {
      // Supabase not configured — allow all routes in development
      if (isProtected && process.env.NODE_ENV === 'production') {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
