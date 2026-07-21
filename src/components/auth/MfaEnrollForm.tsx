'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'
import { createClient } from '@/lib/supabase/client'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'

interface FactorData {
  id: string
  totp: {
    qr_code: string
    secret: string
    uri: string
  }
}

export function MfaEnrollForm() {
  const searchParams = useSearchParams()
  const required = searchParams.get('required') === '1'
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
        // Ruim onverifieerde leftover-factoren op vóór een nieuwe enroll. Zonder
        // dit stapelt elke (afgebroken) enroll een extra TOTP-factor op, wat het
        // inloggen later onbetrouwbaar maakt. Verifieerde factoren laten we met
        // rust — die verwijderen is een bewuste beveiligingsactie van de user.
        try {
          const { data: existing } = await supabase.auth.mfa.listFactors()
          const stale = (existing?.all ?? []).filter(
            (f: { factor_type: string; status: string }) =>
              f.factor_type === 'totp' && f.status === 'unverified',
          )
          for (const f of stale) {
            await supabase.auth.mfa.unenroll({ factorId: f.id })
          }
        } catch {
          /* best-effort opruimen; enroll gaat sowieso door */
        }

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          issuer: 'BASE',
          friendlyName: 'BASE Authenticator',
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

      // Wanneer dit een verplichte enroll vanuit login is, gate verder
      // afhandelen (DPA / dashboard). Anders: terug naar security-settings.
      // Harde navigatie: in de iOS-webview-wrapper herrendert een soft
      // router.push+refresh de role-layouts niet altijd, waardoor het scherm
      // "bevriest". Een volledige document-load lost dit op.
      if (required) {
        const next = await resolvePostLoginRedirect(supabase)
        window.location.assign(next)
      } else {
        window.location.assign('/therapist/settings/security')
      }
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
        <Kicker>{required ? 'Verplichte stap · Beveiliging' : 'Account · Beveiliging'}</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 28, lineHeight: '34px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          MFA INSCHAKELEN
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          {required
            ? 'Voor toegang tot patiëntgegevens is tweetraps-verificatie verplicht. Je hebt er een authenticator-app op je telefoon voor nodig.'
            : 'Je hebt hier een authenticator-app op je telefoon voor nodig.'}
        </MetaLabel>
      </div>

      <Tile>
        <MetaLabel style={{ marginBottom: 8 }}>ZO STEL JE HET IN</MetaLabel>
        <ol
          style={{
            color: P.inkMuted,
            fontSize: 13,
            lineHeight: 1.65,
            paddingLeft: 18,
            margin: 0,
            listStyle: 'decimal',
          }}
        >
          <li>
            Installeer een authenticator-app op je telefoon, bijvoorbeeld Google Authenticator,
            Authy of 1Password.
          </li>
          <li style={{ marginTop: 6 }}>
            Open die app en kies daarbinnen &lsquo;scan QR-code&rsquo;. Scan de code{' '}
            <strong style={{ color: P.ink }}>niet</strong> met de camera-app van je telefoon: die
            stuurt je door naar je instellingen en dan krijg je geen code te zien.
          </li>
          <li style={{ marginTop: 6 }}>
            Typ de 6 cijfers die de app laat zien hieronder over.
          </li>
        </ol>
      </Tile>

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

            {/* Stelt de gebruiker dit in óp de telefoon zelf, dan is scannen
                onmogelijk. De otpauth-URI opent de authenticator-app direct.
                Bewust een gewone <a>: next/link probeert client-side te
                navigeren en kan niet met een niet-http schema overweg. */}
            <a
              href={factorData.totp.uri}
              className="athletic-tap mbt-btn-hover inline-flex items-center justify-center rounded-xl font-extrabold"
              style={{
                backgroundColor: P.surface,
                color: P.ink,
                border: `1px solid ${P.lineStrong}`,
                padding: '14px 20px',
                fontSize: 15,
                letterSpacing: '0.04em',
                minHeight: 48,
                textDecoration: 'none',
              }}
            >
              Open direct in je authenticator-app
            </a>
            <MetaLabel style={{ marginTop: -8, textTransform: 'none', fontWeight: 500, lineHeight: 1.5 }}>
              Gebruik deze knop als je dit op je telefoon zelf instelt. Dan hoef je niets te
              scannen.
            </MetaLabel>

            <div>
              <MetaLabel style={{ marginBottom: 6 }}>LUKT SCANNEN NIET? VOER DEZE SLEUTEL HANDMATIG IN</MetaLabel>
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

        {!required && (
          <DarkButton variant="ghost" href="/therapist/settings/security">
            Annuleren
          </DarkButton>
        )}
      </form>
    </div>
  )
}
