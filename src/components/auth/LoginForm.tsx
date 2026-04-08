'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, ArrowRight, Sparkles } from 'lucide-react'

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
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <img src="/Logo.jpg" alt="MBT" className="h-12 w-auto mb-4 rounded-lg" />
        <p className="text-zinc-500 text-sm tracking-wide">MOVEMENT BASED THERAPY</p>
      </div>

      {magicLinkSent ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#4ECDC420' }}>
            <Mail className="w-7 h-7" style={{ color: '#4ECDC4' }} />
          </div>
          <h2 className="text-white text-lg font-semibold mb-2">Check je e-mail</h2>
          <p className="text-zinc-400 text-sm">
            We hebben een magic link gestuurd naar<br />
            <span className="text-white font-medium">{email}</span>
          </p>
          <button
            onClick={() => { setMagicLinkSent(false); setMode('password') }}
            className="mt-6 text-sm text-zinc-500 hover:text-white transition-colors"
          >
            Terug naar inloggen
          </button>
        </div>
      ) : (
        <>
          {/* Form */}
          <form onSubmit={mode === 'password' ? handleEmailPassword : handleMagicLink} className="space-y-4">
            {/* Email field */}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full h-14 pl-12 pr-4 rounded-xl text-white placeholder-zinc-500 outline-none transition-all focus:ring-2 focus:ring-[#4ECDC4]/50"
                style={{ background: '#1A3A3A', border: '1px solid #2A4A4A' }}
              />
            </div>

            {/* Password field */}
            {mode === 'password' && (
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-14 pl-12 pr-4 rounded-xl text-white placeholder-zinc-500 outline-none transition-all focus:ring-2 focus:ring-[#4ECDC4]/50"
                  style={{ background: '#1A3A3A', border: '1px solid #2A4A4A' }}
                />
              </div>
            )}

            {/* Forgot password */}
            {mode === 'password' && (
              <div className="text-right">
                <button
                  type="button"
                  className="text-xs font-semibold tracking-wider uppercase transition-colors hover:text-white"
                  style={{ color: '#4ECDC4' }}
                  onClick={() => setMode('magic')}
                >
                  Wachtwoord vergeten
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#2A1215', color: '#f87171', border: '1px solid #3A1A1D' }}>
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: mode === 'password'
                  ? 'linear-gradient(135deg, #4ECDC4, #2BA853)'
                  : '#1A3A3A',
                border: mode === 'magic' ? '1px solid #2A4A4A' : 'none',
              }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'password' ? (
                <>
                  SIGN IN
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  STUUR MAGIC LINK
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs font-medium tracking-wider">OF</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Toggle mode */}
          <button
            type="button"
            onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
            className="w-full h-14 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all hover:bg-zinc-800 active:scale-[0.98]"
            style={{ background: '#141414', border: '1px solid #2A4A4A' }}
          >
            {mode === 'password' ? (
              <>
                <Sparkles className="w-5 h-5" style={{ color: '#4ECDC4' }} />
                SIGN IN WITH A MAGIC LINK
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" style={{ color: '#4ECDC4' }} />
                SIGN IN WITH PASSWORD
              </>
            )}
          </button>

          {/* Footer links */}
          <div className="mt-8 text-center space-y-3">
            <p className="text-sm text-zinc-500">
              Nog geen account?{' '}
              <a href="/register" className="font-semibold uppercase text-xs tracking-wider hover:text-white transition-colors" style={{ color: '#4ECDC4' }}>
                Maak een account
              </a>
            </p>
          </div>

          {/* Version */}
          <p className="text-center text-zinc-700 text-xs mt-10">MBT Move v1.0.0</p>
        </>
      )}
    </div>
  )
}
