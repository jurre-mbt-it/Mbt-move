'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { createClient } from '@/lib/supabase/client'

interface FactorData {
  id: string
  totp: {
    qr_code: string
    secret: string
    uri: string
  }
}

export function MfaEnrollForm() {
  const router = useRouter()
  const [factorData, setFactorData] = useState<FactorData | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const syncMfa = trpc.auth.setMfaStatus.useMutation()

  const supabase = createClient()

  useEffect(() => {
    async function enrollMfa() {
      try {
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'MBT Gym Authenticator',
        })

        if (error) {
          setError(error.message)
          return
        }

        setFactorData(data as unknown as FactorData)
      } catch {
        setError('MFA enrollment kon niet worden gestart.')
      } finally {
        setEnrolling(false)
      }
    }

    enrollMfa()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorData) return

    setLoading(true)
    setError(null)

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factorData.id,
      })

      if (challengeError) {
        setError(challengeError.message)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factorData.id,
        challengeId: challengeData.id,
        code: verifyCode,
      })

      if (verifyError) {
        setError('Ongeldige code. Controleer de code in je authenticator-app en probeer opnieuw.')
        return
      }

      // Sync MFA-status naar de database zodat mfaEnabled = true
      await syncMfa.mutateAsync()

      router.push('/therapist/settings/security')
      router.refresh()
    } catch {
      setError('Verificatie mislukt. Probeer opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  if (enrolling) {
    return (
      <div className="max-w-md w-full flex items-center justify-center py-16">
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
          MFA INSTELLEN…
        </span>
      </div>
    )
  }

  return (
    <div className="max-w-md w-full flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Kicker>Account · Beveiliging</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 28, lineHeight: '34px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          MFA INSCHAKELEN
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Scan de QR-code met je authenticator-app (bijv. Google Authenticator, Authy of 1Password)
        </MetaLabel>
      </div>

      {factorData && (
        <Tile>
          <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <Image
                src={factorData.totp.qr_code}
                alt="MFA QR Code"
                width={200}
                height={200}
                className="rounded-lg"
                style={{ border: `1px solid ${P.line}`, background: '#fff', padding: 4 }}
              />
            </div>

            <div>
              <MetaLabel style={{ marginBottom: 6 }}>HANDMATIGE INVOER</MetaLabel>
              <code
                className="block text-center break-all rounded-lg px-3 py-2"
                style={{
                  background: P.surfaceLow,
                  color: P.ink,
                  fontSize: 11,
                  fontFamily: '"SF Mono", Menlo, monospace',
                  letterSpacing: '0.06em',
                  border: `1px solid ${P.line}`,
                  lineHeight: 1.6,
                }}
              >
                {factorData.totp.secret}
              </code>
            </div>
          </div>
        </Tile>
      )}

      <form onSubmit={handleVerify} className="flex flex-col gap-3">
        <Tile accentBar={error ? P.danger : undefined}>
          <MetaLabel style={{ marginBottom: 8 }}>VERIFICATIE CODE</MetaLabel>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
            required
            disabled={loading}
            autoFocus
            className="w-full text-center rounded-lg athletic-mono"
            style={{
              background: P.surfaceLow,
              color: P.ink,
              fontSize: 28,
              letterSpacing: '0.24em',
              padding: '10px 12px',
              border: `1px solid ${error ? P.danger : P.line}`,
              outline: 'none',
              fontWeight: 900,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: P.danger, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{error}</p>
          )}
        </Tile>

        <DarkButton
          type="submit"
          variant="primary"
          disabled={loading || verifyCode.length !== 6}
          loading={loading}
        >
          MFA activeren
        </DarkButton>

        <DarkButton variant="ghost" href="/therapist/settings/security">
          Annuleren
        </DarkButton>
      </form>
    </div>
  )
}
