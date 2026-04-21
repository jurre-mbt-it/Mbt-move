'use client'

import { trpc } from '@/lib/trpc/client'
import {
  ActionTile,
  DarkHeader,
  DarkScreen,
  Kicker,
  P,
} from '@/components/dark-ui'

export default function PatientSettingsPage() {
  // Pending therapist-verzoeken laten we direct zien als accent op de access-tile
  const { data: accessRelations = [] } = trpc.patient.getTherapistAccess.useQuery()
  const pendingCount = (accessRelations as Array<{ status: string }>).filter(
    (r) => r.status === 'PENDING',
  ).length

  return (
    <DarkScreen>
      <DarkHeader title="Instellingen" backHref="/patient/dashboard" />

      <div className="max-w-lg w-full mx-auto px-4 py-4 flex flex-col gap-3">
        <Kicker>Privacy &amp; profiel</Kicker>

        <ActionTile
          href="/patient/settings/access"
          label={pendingCount > 0 ? `Toegang · ${pendingCount} nieuw` : 'Toegang therapeuten'}
          sub="Kies wie jouw schema en voortgang mag zien"
          bar={pendingCount > 0 ? P.gold : P.lime}
        />

        <ActionTile
          href="/patient/settings/privacy"
          label="Privacy & onderzoeksdata"
          sub="Toestemming voor geanonimiseerde dataverzameling"
          bar={P.ice}
        />

        <ActionTile
          href="/patient/legal/dpa"
          label="Verwerkingsovereenkomst"
          sub="Hoe wij uw persoonsgegevens verwerken (AVG/DPA)"
          bar={P.inkDim}
        />

        <ActionTile
          href="/patient/profile"
          label="Mijn profiel"
          sub="Bekijk je profielgegevens"
          bar={P.inkDim}
        />
      </div>
    </DarkScreen>
  )
}
