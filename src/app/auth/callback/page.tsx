'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient()

      // PKCE code-exchange (server-flow magic link).
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setError(error.message)
          return
        }
      }

      // token_hash flow (e-mail confirm / magic link / invite).
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

      // Implicit-flow hash-fragment heeft soms een paar 100ms nodig om
      // door de Supabase client gedetecteerd te worden.
      if (!code && !tokenHash) {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Inloggen mislukt. Geen code of token ontvangen. Controleer de magic link URL.')
        return
      }

      const next = await resolvePostLoginRedirect(supabase, { next: searchParams.get('next') })
      router.replace(next)
    }

    handleCallback()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="text-center space-y-4">
        <p className="text-red-400">{error}</p>
        <a href="/login" className="text-sm underline" style={{ color: '#e87a55' }}>
          Terug naar inloggen
        </a>
      </div>
    )
  }

  return (
    <div className="text-center space-y-3">
      <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#e87a55' }} />
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
            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: '#e87a55' }} />
            <p className="text-[#7B8889] text-sm">Even geduld...</p>
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
