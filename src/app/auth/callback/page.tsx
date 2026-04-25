'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

function getRoleRedirect(role?: string) {
  if (role === 'PATIENT') return '/patient/dashboard'
  if (role === 'ATHLETE') return '/athlete/dashboard'
  return '/therapist/dashboard'
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient()

      // Try PKCE code exchange first
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setError(error.message)
          return
        }
      }

      // Try token_hash (magic link / invite)
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'magiclink' | 'invite' | 'signup' | 'recovery' | 'email',
        })
        if (error) {
          setError(error.message)
          return
        }
      }

      // If no code or token_hash, the Supabase client auto-detects
      // hash fragment tokens (#access_token=...) from the URL
      if (!code && !tokenHash) {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      // Check if we have a session now
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Try to get role from DB (more reliable than user_metadata)
        let role = user.user_metadata?.role
        try {
          const res = await fetch('/api/auth/me')
          if (res.ok) {
            const data = await res.json()
            if (data.role) role = data.role
          }
        } catch { /* fallback to metadata role */ }
        const next = searchParams.get('next')
        // Alleen relatieve paden accepteren (single leading slash, niet
        // protocol-relatief //evil.tld) om open-redirect via phishing-link
        // te voorkomen.
        const safeNext = next && /^\/[^/\\]/.test(next) ? next : null
        router.replace(safeNext ?? getRoleRedirect(role))
      } else {
        setError('Inloggen mislukt. Geen code of token ontvangen. Controleer de magic link URL.')
      }
    }

    handleCallback()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-400">{error}</p>
        <a href="/login" className="text-sm underline" style={{ color: '#BEF264' }}>
          Terug naar inloggen
        </a>
      </div>
    )
  }

  return (
    <div className="text-center space-y-3">
      <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#BEF264' }} />
      <p className="text-[#7B8889] text-sm">Even geduld, je wordt ingelogd...</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F1F1F' }}>
      <Suspense
        fallback={
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#BEF264' }} />
            <p className="text-[#7B8889] text-sm">Even geduld...</p>
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
