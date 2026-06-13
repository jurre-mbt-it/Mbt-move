import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs'
import { type NextRequest, NextResponse } from 'next/server'

const isSupabaseConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http') &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-supabase')

export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  // `requestHeaders` (met o.a. de CSP-nonce) wordt doorgegeven aan de SSR-render
  // zodat Next de nonce uit de `Content-Security-Policy`-request-header kan
  // extraheren en op zijn eigen scripts kan zetten.
  const response = NextResponse.next({
    request: { headers: requestHeaders ?? request.headers },
  })

  // Skip if Supabase isn't configured yet (local dev without credentials)
  if (!isSupabaseConfigured) {
    return response
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

  // Refresh the session token
  await supabase.auth.getUser()

  return response
}
