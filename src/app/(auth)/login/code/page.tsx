'use client'

import { useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { DarkButton, DarkInput, Kicker, MetaLabel, P } from '@/components/dark-ui'

export default function AccessCodePage() {
  return (
    <Suspense>
      <AccessCodeInner />
    </Suspense>
  )
}

function AccessCodeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillEmail = searchParams.get('email') ?? ''

  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [email, setEmail] = useState(prefillEmail)
  const [birthYear, setBirthYear] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const currentYear = new Date().getFullYear()

  const requestMutation = trpc.invite.request.useMutation()
  const finalizeMutation = trpc.invite.finalize.useMutation()

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    const year = parseInt(birthYear, 10)
    if (!email.trim() || !Number.isInteger(year) || year < 1900 || year > currentYear) {
      setError('Vul een geldig e-mailadres en geboortejaar in (bijv. 1985).')
      return
    }

    setLoading(true)
    try {
      await requestMutation.mutateAsync({
        email: email.trim().toLowerCase(),
        birthYear: year,
      })
      setInfo(
        'We hebben je een 6-cijfer code gemaild. Controleer je inbox — kan tot een minuut duren.',
      )
      setStep('verify')
      setTimeout(() => codeInputRef.current?.focus(), 100)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Er ging iets mis. Probeer het opnieuw.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const normalizedCode = code.replace(/\D/g, '')
    if (normalizedCode.length !== 6) {
      setError('De code bestaat uit 6 cijfers.')
      return
    }

    setLoading(true)
    try {
      // Stap 1: Supabase OTP verifiëren — geeft sessie in cookies
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: normalizedCode,
        type: 'email',
      })
      if (otpError) {
        // Probeer ook als 'magiclink' want Supabase gebruikt verschillende types
        const { error: otpError2 } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: normalizedCode,
          type: 'signup',
        })
        if (otpError2) {
          throw new Error(
            'De code klopt niet. Controleer je mail of vraag een nieuwe aan.',
          )
        }
      }

      // Stap 2: tRPC finaliseer — markeert InviteCode als used + maakt PatientTherapist relatie
      // (finalize maakt ook de Prisma user-row aan; aparte sync-user call is overbodig).
      await finalizeMutation.mutateAsync()

      router.replace('/patient/dashboard')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Inloggen mislukt. Probeer het opnieuw.',
      )
      setLoading(false)
    }
  }

  const heroTitle = step === 'request' ? 'JOUW TOEGANG' : 'VUL JE CODE IN'
  const heroKicker =
    step === 'request' ? 'PATIËNT · ONBOARDING' : 'STAP 2 · CODE UIT JE MAIL'

  return (
    <div
      className="athletic-dark min-h-screen flex items-center justify-center p-4"
      style={{ background: P.bg, color: P.ink }}
    >
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div
          className="rounded-3xl p-6 sm:p-8 flex flex-col gap-6"
          style={{ background: P.surface, border: `1px solid ${P.line}` }}
        >
          {/* Hero */}
          <div className="flex flex-col gap-2">
            <Kicker>{heroKicker}</Kicker>
            <h1
              className="athletic-display"
              style={{
                fontSize: 32,
                lineHeight: '36px',
                letterSpacing: '-0.035em',
                color: P.ink,
                fontWeight: 900,
                paddingTop: 2,
                textTransform: 'uppercase',
              }}
            >
              {heroTitle}
            </h1>
            <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
              {step === 'request'
                ? 'Jouw therapeut heeft je uitgenodigd. Vul je e-mail en geboortejaar in — we sturen je een 6-cijfer code.'
                : `We hebben een code gestuurd naar ${email}. Vul 'm hieronder in.`}
            </p>
          </div>

          {step === 'request' ? (
            <form onSubmit={handleRequest} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <MetaLabel>E-MAIL</MetaLabel>
                <DarkInput
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jij@voorbeeld.nl"
                  autoFocus={!prefillEmail}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <MetaLabel>GEBOORTEJAAR</MetaLabel>
                <DarkInput
                  type="tel"
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1985"
                  autoFocus={!!prefillEmail}
                  maxLength={4}
                  required
                />
              </label>

              {error && (
                <p
                  className="athletic-mono text-center rounded-lg px-3 py-2"
                  style={{
                    color: P.danger,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    background: 'rgba(248,113,113,0.08)',
                    border: `1px solid ${P.danger}33`,
                  }}
                >
                  {error}
                </p>
              )}

              <DarkButton type="submit" disabled={loading} loading={loading}>
                {loading ? 'Code versturen…' : 'Stuur mij een code'}
              </DarkButton>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <MetaLabel>6-CIJFER CODE</MetaLabel>
                <DarkInput
                  ref={codeInputRef}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    setError('')
                  }}
                  placeholder="123456"
                  style={{
                    textAlign: 'center',
                    fontSize: 28,
                    letterSpacing: '0.4em',
                    fontWeight: 900,
                    height: 64,
                    fontFamily: 'ui-monospace, Menlo, monospace',
                  }}
                  maxLength={6}
                  required
                />
              </label>

              {info && (
                <p
                  className="athletic-mono text-center rounded-lg px-3 py-2"
                  style={{
                    color: P.lime,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    background: 'rgba(190,242,100,0.08)',
                    border: `1px solid ${P.lime}33`,
                  }}
                >
                  {info}
                </p>
              )}

              {error && (
                <p
                  className="athletic-mono text-center rounded-lg px-3 py-2"
                  style={{
                    color: P.danger,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    background: 'rgba(248,113,113,0.08)',
                    border: `1px solid ${P.danger}33`,
                  }}
                >
                  {error}
                </p>
              )}

              <DarkButton
                type="submit"
                disabled={code.length !== 6 || loading}
                loading={loading}
              >
                {loading ? 'Inloggen…' : 'Inloggen'}
              </DarkButton>

              <button
                type="button"
                onClick={() => {
                  setStep('request')
                  setCode('')
                  setError('')
                  setInfo('')
                }}
                className="athletic-mono"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: P.inkMuted,
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                ← TERUG
              </button>
            </form>
          )}
        </div>

        <div className="text-center">
          <Link
            href="/login"
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
          >
            BEN JE THERAPEUT? LOG HIER IN
          </Link>
        </div>
      </div>
    </div>
  )
}
