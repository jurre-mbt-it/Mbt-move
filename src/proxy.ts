import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const protectedPrefixes = ['/therapist', '/patient', '/athlete', '/admin']
const authRoutes = ['/login']

/**
 * Content-Security-Policy — AFDWINGEND, nonce-based (sinds 2026-06-13; was
 * report-only). Per request een verse nonce; `'strict-dynamic'` op script-src
 * betekent dat alleen scripts mét de nonce (en wat die laden) mogen draaien —
 * 'unsafe-inline'/'unsafe-eval' voor scripts zijn weg in productie. Next zet de
 * nonce automatisch op zijn eigen framework-/bundle-scripts door de
 * `Content-Security-Policy`-request-header te lezen.
 *
 * style-src houdt bewust `'unsafe-inline'`: Radix/sonner zetten inline
 * style-attributen die anders breken (een style-nonce zou 'unsafe-inline'
 * juist uitschakelen). Style-injectie is een veel kleiner XSS-risico dan script.
 *
 * Let op: nonces forceren dynamic rendering (geen static/CDN-caching, PPR uit).
 * Violations blijven binnenkomen op /api/csp-report (report-uri + report-to).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // Dev heeft 'unsafe-eval' nodig (React injecteert eval voor debugging).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://iframe.mediadelivery.net https://*.mux.com",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Domeinmigratie (21-08-2026): mbt-gym.nl is verhuisd naar getbase.coach.
  // 308 behoudt methode en pad, en de browser neemt een eventueel hash-fragment
  // (Supabase-tokens) zelf mee. De matcher sluit /api uit, dus webhooks van
  // lopende betalingen op het oude domein blijven gewoon aankomen.
  // www.getbase.coach gaat naar het kale domein: twee hosts betekent twee
  // cookie-domeinen, en dus twee losse sessies voor dezelfde gebruiker.
  const host = request.headers.get('host') ?? ''
  if (host.endsWith('mbt-gym.nl') || host === 'www.getbase.coach') {
    const doel = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://getbase.coach')
    return NextResponse.redirect(doel, 308)
  }

  // Verse nonce per request + CSP. De nonce gaat als request-header mee zodat
  // Next 'm tijdens SSR op zijn scripts kan zetten; en als response-header zodat
  // de browser 'm afdwingt.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  // Eén auth-roundtrip: updateSession ververst de sessie én geeft de user terug.
  // (Voorheen deed dit pad een tweede getUser() met een eigen client — dat was
  // per navigatie een extra seriële call naar de Supabase-auth-server.)
  const { response, user, authAvailable } = await updateSession(request, requestHeaders)
  response.headers.set('Content-Security-Policy', csp)

  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix))
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  if (!isProtected && !isAuthRoute) return response

  if (!authAvailable) {
    // Supabase not reachable — allow access in development only
    if (isProtected && process.env.NODE_ENV === 'production') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
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
    // DB niet bereikbaar tijdens de role-redirect op /login: val terug op de
    // gewone login-pagina i.p.v. een middleware-error.
  }

  return response
}

export const config = {
  // Draai op alle document-routes, maar NIET op api, static assets, de OAuth-
  // callback, of `next/link`-prefetches. Prefetches overslaan voorkomt dat een
  // pagina met een nonce gecachet wordt die bij echte navigatie niet meer matcht
  // (aanbevolen patroon uit de Next-CSP-docs).
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|public|auth/callback).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
