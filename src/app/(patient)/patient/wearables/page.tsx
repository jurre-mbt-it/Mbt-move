'use client'

/**
 * Patiënt: Apple-Watch-overzicht — readiness, slaap, vitals en activiteiten
 * uit de HealthKit-sync. Zelfde paneel als de atleet-shell en het
 * therapeut-dossier (read-only).
 */
import { trpc } from '@/lib/trpc/client'
import { Display, Kicker, MetaLabel, P, SkeletonTile } from '@/components/dark-ui'
import { WearablePanel } from '@/components/wearables/WearablePanel'

export default function PatientWearablesPage() {
  const { data, isLoading } = trpc.wearables.overview.useQuery()

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 flex flex-col gap-4 mbt-stagger">
        <div className="flex flex-col gap-1">
          <Kicker>Apple Watch</Kicker>
          <Display size="md">HERSTEL & SLAAP</Display>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <SkeletonTile accent={P.brand} lines={4} />
            <SkeletonTile lines={3} />
            <SkeletonTile lines={3} />
          </div>
        ) : data ? (
          <WearablePanel data={data} />
        ) : (
          <MetaLabel style={{ color: P.inkMuted }}>NIET BESCHIKBAAR</MetaLabel>
        )}
      </div>
    </div>
  )
}
