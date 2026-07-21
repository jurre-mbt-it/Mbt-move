/**
 * Therapist-access consent: patient ziet welke coaches/therapeuten toegang
 * hebben of aanvragen, en kan accepteren / afwijzen / intrekken.
 *
 * De lijst zelf staat in <AccessRelations>, omdat de atleet-omgeving 'm ook
 * toont. Hier alleen de schermchrome.
 */
'use client'

import { DarkHeader, DarkScreen, Kicker, P } from '@/components/dark-ui'
import { AccessRelations } from '@/components/access/AccessRelations'

export default function AccessPage() {
  return (
    <DarkScreen>
      <DarkHeader title="Toegang" backHref="/patient/settings" />

      <div className="max-w-lg w-full mx-auto px-4 py-4 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Kicker>Jouw privacy</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            WIE MAG JOUW
            <br />
            GEGEVENS ZIEN?
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: '19px', marginTop: 4 }}>
            Je coach of therapeut vraagt eerst toestemming. Jij beslist wie je schema, pijn
            en voortgang mag zien.
          </p>
        </div>

        <AccessRelations />
      </div>
    </DarkScreen>
  )
}
