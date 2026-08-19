'use client'

import { useEffect } from 'react'

/**
 * Supabase stuurt magic links en OTP-redirects terug naar de root met de tokens
 * in het hash-fragment. Dat fragment bereikt de server nooit, dus de
 * server-component kan er niets mee. Deze component staat op de publieke
 * homepage en zet zo'n binnenkomende link meteen door naar /auth/callback.
 *
 * Weghalen betekent: niemand kan meer inloggen via een mailtje.
 */
export function AuthHashCatcher() {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    if (!hash.includes('access_token') && !hash.includes('error')) return
    window.location.replace(`/auth/callback${hash}`)
  }, [])

  return null
}
