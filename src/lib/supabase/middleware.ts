import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

const isSupabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http') &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-supabase')

export interface SessionResult {
  response: NextResponse
  user: User | null
  // false = Supabase niet geconfigureerd of onbereikbaar; `user: null` zegt dan
  // niets over ingelogd-zijn. De proxy beslist daarop (prod: uitloggen, dev: door).
  authAvailable: boolean
}

export async function updateSession(
  request: NextRequest,
  requestHeaders?: Headers
): Promise<SessionResult> {
  // `requestHeaders` (met o.a. de CSP-nonce) wordt doorgegeven aan de SSR-render
  // zodat Next de nonce uit de `Content-Security-Policy`-request-header kan
  // extraheren en op zijn eigen scripts kan zetten.
  const response = NextResponse.next({
    request: { headers: requestHeaders ?? request.headers },
  })

  // Skip if Supabase isn't configured yet (local dev without credentials)
  if (!isSupabaseConfigured) {
    return { response, user: null, authAvailable: false }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set(name, value)
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set(name, '')
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh the session token. Dit is de ENIGE auth-roundtrip in de proxy —
  // de user gaat mee terug zodat de route-checks geen tweede getUser() doen.
  try {
    const { data } = await supabase.auth.getUser()
    return { response, user: data.user ?? null, authAvailable: true }
  } catch {
    return { response, user: null, authAvailable: false }
  }
}
