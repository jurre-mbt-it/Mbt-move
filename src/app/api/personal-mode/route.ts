import { NextResponse } from 'next/server'
import { PERSONAL_MODE_COOKIE } from '@/lib/auth/personal-mode'

/**
 * Zet of wist de persoonlijke-trainingsmodus-cookie. De client roept dit aan
 * en navigeert daarna zelf naar de juiste shell (/athlete/* of /therapist/*).
 *
 * De cookie zelf geeft geen data-toegang — `requireAthleteAccess` checkt naast
 * de cookie nog steeds de echte rol (alleen THERAPIST/ADMIN mogen ermee de
 * atleet-shell in). Daarom volstaat een simpele set/unset zonder extra guard.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ on: false }))
  const on = body?.on === true

  const res = NextResponse.json({ ok: true, on })
  if (on) {
    res.cookies.set(PERSONAL_MODE_COOKIE, '1', {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 dagen
    })
  } else {
    res.cookies.set(PERSONAL_MODE_COOKIE, '', { path: '/', maxAge: 0 })
  }
  return res
}
