import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    }
  )

  let authError = true

  // PKCE flow (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) authError = false
  }

  // Magic link / invite with token_hash
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'magiclink' | 'invite' | 'signup' | 'recovery' | 'email',
    })
    if (!error) authError = false
  }

  if (!authError) {
    const { data: { user } } = await supabase.auth.getUser()
    const role = user?.user_metadata?.role

    if (next !== '/') return NextResponse.redirect(`${origin}${next}`)
    if (role === 'PATIENT') return NextResponse.redirect(`${origin}/patient/dashboard`)
    if (role === 'ATHLETE') return NextResponse.redirect(`${origin}/athlete/dashboard`)
    return NextResponse.redirect(`${origin}/therapist/dashboard`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
