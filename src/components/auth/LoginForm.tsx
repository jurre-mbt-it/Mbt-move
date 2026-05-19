'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, KeyRound, Sparkles } from 'lucide-react'
import { P, DarkButton, DarkInput, Kicker, MetaLabel } from '@/components/dark-ui'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const otpInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setCodeSent(true)
      setTimeout(() => otpInputRef.current?.focus(), 100)
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const normalized = otpCode.replace(/\D/g, '')
    if (normalized.length !== 6) {
      setError('De code bestaat uit 6 cijfers.')
      return
    }

    setLoading(true)
    try {
      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: normalized,
        type: 'email',
      })

      if (otpError || !data.user) {
        setError(
          otpError?.message ?? 'De code klopt niet. Vraag een nieuwe aan of controleer je mail.',
        )
        return
      }

      const next = await resolvePostLoginRedirect(supabase)
      router.push(next)
      router.refresh()
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10 gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className="athletic-display"
            style={{ color: P.ink, fontSize: 44, letterSpacing: '-0.04em', fontWeight: 900 }}
          >
            MBT
          </span>
          <span
            className="athletic-mono"
            style={{ color: P.brand, fontSize: 24, fontWeight: 900, letterSpacing: '0.16em' }}
          >
            GYM
          </span>
        </div>
        <Kicker>Movement Based Therapy</Kicker>
      </div>

      {codeSent ? (
        <div className="flex flex-col gap-5">
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: P.surfaceHi, border: `1px solid ${P.lime}` }}
            >
              <Mail className="w-7 h-7" style={{ color: P.lime }} />
            </div>
            <h2
              className="athletic-display mb-2"
              style={{ color: P.ink, fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}
            >
              CHECK JE E-MAIL
            </h2>
            <p style={{ color: P.inkMuted, fontSize: 14 }}>
              We hebben een code en magic link gestuurd naar
              <br />
              <span style={{ color: P.ink, fontWeight: 700 }}>{email}</span>
            </p>
            <p style={{ color: P.inkDim, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Klik op de link in de mail, of vul de 6-cijfer code hieronder in.
            </p>
          </div>

          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <MetaLabel>6-CIJFER CODE</MetaLabel>
              <DarkInput
                ref={otpInputRef}
                type="tel"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setError(null)
                }}
                placeholder="123456"
                maxLength={6}
                style={{
                  textAlign: 'center',
                  fontSize: 28,
                  letterSpacing: '0.4em',
                  fontWeight: 900,
                  height: 64,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              />
            </label>

            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'rgba(248,113,113,0.08)',
                  color: P.danger,
                  border: `1px solid ${P.danger}`,
                }}
              >
                {error}
              </div>
            )}

            <DarkButton
              type="submit"
              disabled={otpCode.length !== 6 || loading}
              loading={loading}
              size="lg"
            >
              <span className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" />
                INLOGGEN MET CODE
              </span>
            </DarkButton>
          </form>

          <button
            onClick={() => {
              setCodeSent(false)
              setOtpCode('')
              setError(null)
            }}
            className="athletic-mono transition-colors self-center"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}
            type="button"
          >
            ANDER E-MAILADRES
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleRequestCode} className="flex flex-col gap-3">
            <div className="relative">
              <Mail
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: P.inkDim }}
              />
              <DarkInput
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoFocus
                style={{ paddingLeft: 48, height: 56 }}
              />
            </div>

            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'rgba(248,113,113,0.08)',
                  color: P.danger,
                  border: `1px solid ${P.danger}`,
                }}
              >
                {error}
              </div>
            )}

            <DarkButton type="submit" disabled={loading || !email} loading={loading} size="lg">
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                STUUR INLOGCODE
              </span>
            </DarkButton>
          </form>

          <p
            className="athletic-mono text-center mt-6"
            style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.14em', lineHeight: 1.6 }}
          >
            JE ONTVANGT EEN 6-CIJFER CODE PER MAIL.
            <br />
            GEEN WACHTWOORD NODIG.
          </p>

          <div className="mt-10 text-center">
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              Nog geen account?{' '}
              <a
                href="/register"
                className="athletic-mono transition-colors"
                style={{ color: P.brand, fontSize: 11, letterSpacing: '0.14em' }}
              >
                MAAK EEN ACCOUNT
              </a>
            </p>
          </div>

          <p
            className="athletic-mono text-center mt-10"
            style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.16em' }}
          >
            MBT GYM v1.0
          </p>
        </>
      )}
    </div>
  )
}
