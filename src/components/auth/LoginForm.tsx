'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, ArrowRight, Sparkles, KeyRound } from 'lucide-react'
import { P, DarkButton, DarkInput, Kicker, MetaLabel } from '@/components/dark-ui'

function getRoleRedirect(role?: string) {
  if (role === 'PATIENT') return '/patient/dashboard'
  if (role === 'ATHLETE') return '/athlete/dashboard'
  return '/therapist/dashboard'
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const otpInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? 'Ongeldig e-mailadres of wachtwoord'
          : error.message)
        return
      }

      if (data.user) {
        const role = data.user.user_metadata?.role
        router.push(getRoleRedirect(role))
        router.refresh()
      }
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setMagicLinkSent(true)
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

      let role = data.user.user_metadata?.role as string | undefined
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const me = await res.json()
          if (me.role) role = me.role
        }
      } catch { /* fallback to metadata role */ }

      router.push(getRoleRedirect(role))
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

      {magicLinkSent ? (
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
              We hebben een magic link en code gestuurd naar
              <br />
              <span style={{ color: P.ink, fontWeight: 700 }}>{email}</span>
            </p>
            <p style={{ color: P.inkDim, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Klik op de link in de mail, of vul de 6-cijfer code hieronder in als de
              link niet werkt.
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
              setMagicLinkSent(false)
              setOtpCode('')
              setError(null)
              setMode('password')
            }}
            className="athletic-mono transition-colors self-center"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}
            type="button"
          >
            TERUG NAAR INLOGGEN
          </button>
        </div>
      ) : (
        <>
          {/* Form */}
          <form onSubmit={mode === 'password' ? handleEmailPassword : handleMagicLink} className="flex flex-col gap-3">
            {/* Email field */}
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
                style={{ paddingLeft: 48, height: 56 }}
              />
            </div>

            {/* Password field */}
            {mode === 'password' && (
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: P.inkDim }}
                />
                <DarkInput
                  type="password"
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{ paddingLeft: 48, height: 56 }}
                />
              </div>
            )}

            {/* Forgot password */}
            {mode === 'password' && (
              <div className="text-right">
                <button
                  type="button"
                  className="athletic-mono transition-colors"
                  style={{ color: P.brand, fontSize: 10, letterSpacing: '0.14em' }}
                  onClick={() => setMode('magic')}
                >
                  WACHTWOORD VERGETEN
                </button>
              </div>
            )}

            {/* Error */}
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

            {/* Submit button */}
            <DarkButton
              type="submit"
              disabled={loading}
              loading={loading}
              size="lg"
              variant={mode === 'password' ? 'primary' : 'secondary'}
            >
              {mode === 'password' ? (
                <span className="flex items-center gap-2">
                  SIGN IN
                  <ArrowRight className="w-5 h-5" />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  STUUR MAGIC LINK
                </span>
              )}
            </DarkButton>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px" style={{ background: P.lineStrong }} />
            <span
              className="athletic-mono"
              style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.2em' }}
            >
              OF
            </span>
            <div className="flex-1 h-px" style={{ background: P.lineStrong }} />
          </div>

          {/* Toggle mode */}
          <DarkButton
            type="button"
            size="lg"
            variant="ghost"
            onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
          >
            {mode === 'password' ? (
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" style={{ color: P.brand }} />
                MAGIC LINK
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Lock className="w-5 h-5" style={{ color: P.brand }} />
                WACHTWOORD
              </span>
            )}
          </DarkButton>

          {/* Footer links */}
          <div className="mt-8 text-center">
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
