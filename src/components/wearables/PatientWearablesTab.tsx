'use client'

/**
 * Therapeut-view van de wearable-data van één patiënt. Wordt binnen een Radix
 * TabsContent gerenderd, die inactieve tabs unmount — daardoor draait de
 * `forPatient`-query pas wanneer de therapeut de Watch-tab opent, niet bij
 * elke dossier-opening.
 */
import { trpc } from '@/lib/trpc/client'
import { MetaLabel, P, SkeletonTile } from '@/components/dark-ui'
import { WearablePanel } from './WearablePanel'

export function PatientWearablesTab({ patientId }: { patientId: string }) {
  const { data, isLoading } = trpc.wearables.forPatient.useQuery({ patientId })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonTile accent={P.brand} lines={4} />
        <SkeletonTile lines={3} />
      </div>
    )
  }
  if (!data) {
    return <MetaLabel style={{ color: P.inkMuted }}>NIET BESCHIKBAAR</MetaLabel>
  }
  return <WearablePanel data={data} readOnly />
}
