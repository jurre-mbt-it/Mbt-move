'use client'

/**
 * De knop uit de groepsmail: uit de groep stappen zonder in te loggen. Het
 * ondertekende token in de URL is de toegang. Eerst laten zien om welke
 * groep het gaat, dan één bevestiging. Publiek pad (zie proxy.ts).
 */
import { useState } from 'react'
import { useParams } from 'next/navigation'

import { trpc } from '@/lib/trpc/client'
import { CARD, DarkButton, Kicker, P } from '@/components/dark-ui'

export default function GroepVerlatenPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === 'string' ? params.token : ''
  const { data, isLoading } = trpc.athleteGroups.leavePreview.useQuery({ token }, { enabled: !!token, retry: false })
  const leave = trpc.athleteGroups.leaveByToken.useMutation()
  const [klaar, setKlaar] = useState<{ groupName: string | null } | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  async function bevestig() {
    setFout(null)
    try {
      const r = await leave.mutateAsync({ token })
      setKlaar({ groupName: r.groupName })
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Er ging iets mis. Probeer het opnieuw.')
    }
  }

  const status = klaar ? 'klaar' : (data?.status ?? (isLoading ? 'loading' : 'invalid'))
  const info = data && data.status === 'ok' ? data : null

  return (
    <div className="athletic-dark min-h-screen flex items-center justify-center p-4" style={{ background: P.bg, color: P.ink }}>
      <div className="w-full max-w-sm">
        <div className="rounded-3xl p-6 sm:p-8 flex flex-col gap-5" style={{ ...CARD }}>
          <div className="flex flex-col gap-2">
            <Kicker>GROEP · BASE</Kicker>
            <h1 className="athletic-display" style={{ color: P.ink, fontSize: 28, lineHeight: '32px', letterSpacing: '-0.02em' }}>
              {status === 'klaar' ? 'JE BENT ERUIT' : status === 'ok' ? 'UIT DE GROEP STAPPEN' : status === 'gone' ? 'JE ZIT NIET MEER IN DEZE GROEP' : status === 'loading' ? '' : 'LINK NIET GELDIG'}
            </h1>
          </div>

          {status === 'loading' && (
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>LADEN…</p>
          )}

          {status === 'ok' && info && (
            <>
              <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
                Je staat in de groep <strong style={{ color: P.ink }}>{info.groupName}</strong> van {info.ownerName}.
                {info.planName ? ` Groepstrainingen staan in je kalender als "Onderdeel van ${info.planName}".` : ''}
              </p>
              <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
                Stap je eruit, dan blijven de trainingen die al in je kalender staan gewoon staan. Nieuwe groepstrainingen komen niet meer bij jou. {info.ownerName} krijgt hier een berichtje van.
              </p>
              <DarkButton variant="danger" onClick={bevestig} loading={leave.isPending} className="w-full">
                JA, HAAL ME UIT DE GROEP
              </DarkButton>
              <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
                Wil je erin blijven? Dan kun je deze pagina gewoon sluiten. Later eruit stappen kan altijd via je profiel in de app.
              </p>
            </>
          )}

          {status === 'klaar' && (
            <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
              Je staat niet meer in {klaar?.groupName ?? 'de groep'}. Je eigen schema en de trainingen die al in je kalender stonden blijven staan.
            </p>
          )}

          {status === 'gone' && (
            <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
              Dit lidmaatschap bestaat niet meer. Je bent er al uit gestapt, of de groep is opgeheven.
            </p>
          )}

          {status === 'invalid' && (
            <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.5 }}>
              Deze link is niet geldig. Kopieer de hele link uit je mail, of stap uit de groep via je profiel in de app.
            </p>
          )}

          {fout && <p role="alert" style={{ color: P.danger, fontSize: 13 }}>{fout}</p>}
        </div>
      </div>
    </div>
  )
}
