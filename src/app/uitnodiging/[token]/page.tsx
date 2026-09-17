'use client'

/**
 * Landingspagina van de uitnodigingslink uit de mail.
 *
 * Op een telefoon is het doel de app: we proberen `mbtgym://uitnodiging`
 * meteen en laten een knop staan voor als de browser dat tegenhoudt. Wie de
 * app niet heeft, krijgt de App Store. Op een computer, of als de app er
 * niet is, logt "Doorgaan in de browser" hier in met dezelfde link:
 * `invite.claim` geeft een token_hash, `verifyOtp` maakt de sessie,
 * `invite.finalize` koppelt de therapeut. Publiek pad (zie proxy.ts).
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { reportLoginSuccess, resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect'
import { CARD, DarkButton, Kicker, MetaLabel, P } from '@/components/dark-ui'

const APP_STORE_URL = 'https://apps.apple.com/app/id6762561018'

function isMobiel(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export default function UitnodigingPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === 'string' ? params.token : ''
  const appUrl = useMemo(() => `mbtgym://uitnodiging?token=${encodeURIComponent(token)}`, [token])

  const { data, isLoading } = trpc.invite.peek.useQuery({ token }, { enabled: !!token, retry: false })
  const claim = trpc.invite.claim.useMutation()
  const finalize = trpc.invite.finalize.useMutation()
  const [mobiel, setMobiel] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    setMobiel(isMobiel())
  }, [])

  // Op een telefoon meteen de app proberen. Heeft de gebruiker de app niet,
  // dan gebeurt er niets en staan de knoppen er nog.
  useEffect(() => {
    if (!mobiel || data?.status !== 'ok') return
    const id = setTimeout(() => {
      window.location.href = appUrl
    }, 400)
    return () => clearTimeout(id)
  }, [mobiel, data?.status, appUrl])

  async function inBrowser() {
    setBezig(true)
    setFout(null)
    try {
      const res = await claim.mutateAsync({ token })
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({ token_hash: res.tokenHash, type: res.type })
      if (error) throw new Error('Inloggen is niet gelukt. Open de link opnieuw vanuit je mail.')
      for (let i = 0; i < 3; i++) {
        try {
          await finalize.mutateAsync()
          break
        } catch {
          if (i < 2) await new Promise((r) => setTimeout(r, 800 * (i + 1)))
        }
      }
      reportLoginSuccess()
      const dest = await resolvePostLoginRedirect(supabase)
      window.location.replace(dest)
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Er ging iets mis. Probeer het opnieuw.')
      setBezig(false)
    }
  }

  const status = data?.status ?? (isLoading ? 'loading' : 'invalid')
  const info = data && data.status !== 'invalid' ? data : null
  const kop =
    status === 'ok' ? `Hallo ${info?.firstName ?? ''}`.trim() : status === 'used' ? 'Al ingelogd' : status === 'expired' ? 'Link verlopen' : status === 'loading' ? '' : 'Link niet geldig'
  const van = info?.therapistName
    ? `${info.therapistName}${info.practiceName ? ` van ${info.practiceName}` : ''}`
    : info?.practiceName ?? 'Je therapeut'

  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: P.bg, color: P.ink }}>
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="rounded-3xl p-6 sm:p-8 flex flex-col gap-5" style={{ ...CARD }}>
          <div className="flex flex-col gap-2">
            <Kicker>UITNODIGING · BASE</Kicker>
            {kop && (
              <h1 className="athletic-display" style={{ color: P.ink, fontSize: 30, lineHeight: '34px', letterSpacing: '-0.02em' }}>
                {kop.toUpperCase()}
              </h1>
            )}
          </div>

          {status === 'loading' && (
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>LADEN…</p>
          )}

          {status === 'ok' && (
            <>
              <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
                {van} heeft een account voor je klaargezet in BASE. Daar staat je trainingsschema en daar log je hoe het gaat.
              </p>

              {mobiel ? (
                <div className="flex flex-col gap-3">
                  <DarkButton href={appUrl} className="w-full">
                    OPEN IN DE BASE-APP
                  </DarkButton>
                  <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
                    Opent de app niet? Dan staat hij nog niet op je telefoon.
                  </p>
                  <DarkButton href={APP_STORE_URL} variant="secondary" className="w-full">
                    DOWNLOAD IN DE APP STORE
                  </DarkButton>
                  <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
                    Na het installeren open je deze link nog een keer vanuit je mail. Android volgt binnenkort; tot die tijd kun je in de browser verder.
                  </p>
                </div>
              ) : (
                <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
                  Open deze mail op je telefoon om de BASE-app te gebruiken. Je kunt ook hier in de browser verder.
                </p>
              )}

              <div className="flex flex-col gap-2" style={{ borderTop: `1px solid ${P.line}`, paddingTop: 16 }}>
                <MetaLabel>IN DE BROWSER</MetaLabel>
                <DarkButton onClick={inBrowser} loading={bezig} variant={mobiel ? 'ghost' : 'primary'} className="w-full">
                  DOORGAAN IN DE BROWSER
                </DarkButton>
              </div>
            </>
          )}

          {status === 'used' && (
            <div className="flex flex-col gap-3">
              <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
                Deze uitnodiging is al gebruikt. Je hebt een account. Log in met je e-mailadres, in de app of hier.
              </p>
              <DarkButton href="/login" className="w-full">NAAR INLOGGEN</DarkButton>
            </div>
          )}

          {status === 'expired' && (
            <div className="flex flex-col gap-3">
              <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
                Deze uitnodiging is verlopen. Vraag {van === 'Je therapeut' ? 'je therapeut' : van} om een nieuwe. Heb je al eerder ingelogd? Dan werkt inloggen met je e-mailadres gewoon.
              </p>
              <DarkButton href="/login" variant="secondary" className="w-full">NAAR INLOGGEN</DarkButton>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col gap-3">
              <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
                Deze link is niet geldig. Kopieer de hele link uit je mail, of vraag je therapeut om een nieuwe uitnodiging.
              </p>
              <DarkButton href="/login" variant="secondary" className="w-full">NAAR INLOGGEN</DarkButton>
            </div>
          )}

          {fout && (
            <p role="alert" style={{ color: P.danger, fontSize: 13, lineHeight: 1.5 }}>{fout}</p>
          )}
        </div>
      </div>
    </div>
  )
}
