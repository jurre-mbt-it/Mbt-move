'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PATIENTS } from '@/lib/mock-data'
import { DarkButton, DarkInput, Kicker, P } from '@/components/dark-ui'

export default function AccessCodeLoginPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError('')

    // Normalize: uppercase, strip spaces
    const normalized = code.trim().toUpperCase().replace(/\s/g, '')

    // Look up in mock data
    await new Promise(r => setTimeout(r, 400)) // simulate network
    const patient = PATIENTS.find(p => p.accessCode.replace('-', '') === normalized.replace('-', ''))

    if (!patient) {
      setError('Toegangscode niet herkend. Controleer de code en probeer opnieuw.')
      setLoading(false)
      inputRef.current?.select()
      return
    }

    // In production: exchange code for session via Supabase / API
    // For now: redirect to patient dashboard
    router.push('/patient/dashboard')
  }

  return (
    <div
      className="athletic-dark min-h-screen flex items-center justify-center p-4"
      style={{ background: P.bg, color: P.ink }}
    >
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/Logo.jpg" alt="MBT Gym" className="h-10 w-auto" />
        </div>

        <div
          className="rounded-2xl p-8 flex flex-col gap-6"
          style={{ background: P.surface, border: `1px solid ${P.line}` }}
        >
          {/* Heading */}
          <div className="flex flex-col items-center gap-2 text-center">
            <Kicker>Patiënt toegang</Kicker>
            <h1
              className="athletic-display"
              style={{ fontSize: 24, lineHeight: '28px', letterSpacing: '-0.02em', color: P.ink }}
            >
              TOEGANGSCODE
            </h1>
            <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
              Voer de code in die je van je therapeut hebt ontvangen.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DarkInput
              ref={inputRef}
              placeholder="MBT-JV24"
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              className="athletic-mono"
              style={{
                textAlign: 'center',
                fontSize: 22,
                letterSpacing: '0.3em',
                fontWeight: 800,
                height: 56,
                color: P.ink,
              }}
              autoComplete="off"
              autoFocus
              maxLength={12}
            />

            {error && (
              <p
                className="athletic-mono text-center"
                style={{ color: P.danger, fontSize: 12, letterSpacing: '0.04em' }}
              >
                {error}
              </p>
            )}

            <DarkButton
              type="submit"
              disabled={!code.trim() || loading}
              loading={loading}
            >
              {loading ? 'Controleren…' : 'Inloggen'}
            </DarkButton>
          </form>

          <div className="text-center" style={{ color: P.inkMuted, fontSize: 13 }}>
            Heb je een account?{' '}
            <Link href="/login" style={{ color: P.lime, fontWeight: 700 }}>
              Inloggen met e-mail
            </Link>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/login"
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
          >
            ← TERUG NAAR INLOGGEN
          </Link>
        </div>
      </div>
    </div>
  )
}
