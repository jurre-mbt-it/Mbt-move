/**
 * Assessment-keuzepagina (hub).
 * Bundelt de beschikbare onderzoeksmethodes: de therapeut kiest hier tussen
 * Mobility Assessment en Hardloopanalyse. Elke keuze leidt naar zijn eigen
 * overzichtspagina.
 */
'use client'

import { trpc } from '@/lib/trpc/client'
import {
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function AssessmentsHubPage() {
  const { data: access, isLoading: accessLoading } = trpc.assessments.hasAccess.useQuery()

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
          LADEN…
        </span>
      </div>
    )
  }

  if (!access?.hasAccess) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-20 text-center space-y-4">
          <Kicker>Toegang vereist</Kicker>
          <Display size="md">ASSESSMENT</Display>
          <p style={{ color: P.inkMuted, fontSize: 14, lineHeight: 1.55 }}>
            Deze functie is niet geactiveerd voor jouw account. Neem contact op met een admin om assessments in te schakelen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-24 space-y-6">
        <div className="space-y-1">
          <Kicker>Functioneel onderzoek</Kicker>
          <Display size="md">ASSESSMENT</Display>
          <MetaLabel style={{ textTransform: 'none', fontWeight: 500, marginTop: 2 }}>
            Kies een onderzoeksmethode
          </MetaLabel>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Mobility Assessment */}
          <Tile accentBar={P.lime} href="/therapist/assessments/mobility">
            <div className="flex flex-col gap-2 min-h-[140px]">
              <MetaLabel style={{ color: P.lime }}>Ready State methodology</MetaLabel>
              <p style={{ color: P.ink, fontSize: 17, fontWeight: 800 }}>Mobility Assessment →</p>
              <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
                9 archetypes · 42 tests · stoplicht-scoring met programming template
              </p>
            </div>
          </Tile>

          {/* Hardloopanalyse */}
          <Tile accentBar={P.brand} href="/therapist/assessments/hardloopanalyse">
            <div className="flex flex-col gap-2 min-h-[140px]">
              <MetaLabel style={{ color: P.brand }}>Looptechniek · 2D videoanalyse</MetaLabel>
              <p style={{ color: P.ink, fontSize: 17, fontWeight: 800 }}>Hardloopanalyse →</p>
              <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
                Achteraanzicht, zijaanzicht & loopmetrics met AI-concept en PDF
              </p>
            </div>
          </Tile>
        </div>
      </div>
    </div>
  )
}
