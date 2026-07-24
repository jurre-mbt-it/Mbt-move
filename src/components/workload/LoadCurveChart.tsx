'use client'

/**
 * Lazy entrypoint voor de belasting-curve: recharts is een fors stuk bundle en
 * hoort niet in de initiële pagina-load. De echte implementatie staat in
 * LoadCurveChartInner.tsx en wordt hier client-side dynamic geladen; de
 * fallback spiegelt de bestaande "BELASTING LADEN…"-staat van de pagina's.
 */

import dynamic from 'next/dynamic'
import { MetaLabel, Tile } from '@/components/dark-ui'

export type { LoadCurveData } from './LoadCurveChartInner'

export const LoadCurveChart = dynamic(
  () => import('./LoadCurveChartInner').then(m => m.LoadCurveChart),
  {
    ssr: false,
    loading: () => (
      <Tile>
        <div className="py-8 text-center">
          <MetaLabel>BELASTING LADEN…</MetaLabel>
        </div>
      </Tile>
    ),
  },
)
