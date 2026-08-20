'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { resolvePostLoginRedirect, reportLoginSuccess } from '@/lib/auth/post-login-redirect'

function CallbackHandler() {
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

      reportLoginSuccess()
      const next = await resolvePostLoginRedirect(supabase, { next: searchParams.get('next') })
      // Harde navigatie i.p.v. router.replace: forceert een volledige
      // document-load zodat de iOS-webview de nieuwe sessie oppikt en niet
      // op een leeg/bevroren scherm blijft hangen.
      window.location.replace(next)
    }

    handleCallback()
  }, [searchParams])

  if (error) {
    return (
      <div className="text-center space-y-4">
        <p className="text-[var(--p-danger)]">{error}</p>
        <a href="/login" className="text-sm underline" style={{ color: 'var(--p-brand)' }}>
          Terug naar inloggen
        </a>
      </div>
    )
  }

  return (
    <div className="text-center space-y-3">
      <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: 'var(--p-brand)' }} />
      <p className="text-[var(--p-ink-muted)] text-sm">Even geduld, je wordt ingelogd...</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--p-bg)' }}>
      <Suspense
        fallback={
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: 'var(--p-brand)' }} />
            <p className="text-[var(--p-ink-muted)] text-sm">Even geduld...</p>
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
