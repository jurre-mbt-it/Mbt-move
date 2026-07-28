'use client'

import { useMemo } from 'react'
import { DarkScreen, DarkHeader, P } from '@/components/dark-ui'
import { WearablePanel } from '@/components/wearables/WearablePanel'
import { mockOverview } from '@/lib/wearable-mock'

/**
 * Dev-preview van de wearable-dashboards met mock-HealthKit-data. Niet voor
 * productie (de route 404't daar). Laat de echte componenten zien zoals ze in
 * de patiënt/atleet-shell en het therapeut-dossier verschijnen.
 */
export function WearablesPreview() {
  const data = useMemo(() => mockOverview(30), [])
  return (
    <DarkScreen>
      <DarkHeader title="Wearables · preview" sub="mock healthkit data" />
      <div className="flex-1 overflow-y-auto px-4 pb-10">
        <div className="mx-auto w-full" style={{ maxWidth: 420 }}>
          <WearablePanel data={data} />
        </div>
        <div className="mx-auto w-full mt-6" style={{ maxWidth: 420 }}>
          <p style={{ color: P.inkDim, fontSize: 11, textAlign: 'center' }}>
            Therapeut-view (read-only), geen connect-CTA bij niet-gekoppeld
          </p>
        </div>
      </div>
    </DarkScreen>
  )
}
