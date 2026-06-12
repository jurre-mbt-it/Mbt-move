'use client'

/**
 * Composiet-paneel dat alle wearable-tegels samenbrengt: readiness, slaap,
 * vitals en activiteiten. Gedeeld door de patiënt/atleet (eigen data) en de
 * therapeut (patiëntdossier). Toont een connect-CTA als er nog geen Apple
 * Watch gekoppeld is.
 */
import { Tile, Kicker, MetaLabel, P } from '@/components/dark-ui'
import type { RouterOutputs } from '@/lib/trpc/client'
import { ReadinessCard } from './ReadinessCard'
import { SleepCard } from './SleepCard'
import { VitalsCard } from './VitalsCard'
import { WearableActivities } from './WearableActivities'

export type WearableOverviewData = RouterOutputs['wearables']['overview']

export function WearablePanel({
  data,
  /** Therapeut-view: verberg de connect-CTA en toon een neutrale lege staat. */
  readOnly = false,
}: {
  data: WearableOverviewData
  readOnly?: boolean
}) {
  const connected = data.connection.connected

  if (!connected) {
    return readOnly ? (
      <Tile>
        <Kicker>WEARABLE</Kicker>
        <div className="py-6 text-center">
          <MetaLabel style={{ color: P.inkMuted }}>GEEN WEARABLE GEKOPPELD</MetaLabel>
          <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 6 }}>
            Deze cliënt heeft nog geen Apple Watch verbonden.
          </p>
        </div>
      </Tile>
    ) : (
      <Tile accentBar={P.brand}>
        <Kicker style={{ color: P.brand }}>APPLE WATCH</Kicker>
        <div
          className="athletic-display"
          style={{ color: P.ink, fontSize: 20, fontWeight: 900, textTransform: 'uppercase', paddingTop: 4 }}
        >
          Koppel je Apple Watch
        </div>
        <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: '19px', marginTop: 8 }}>
          Synchroniseer je trainingen, slaap en herstel automatisch. Je readiness,
          slaapkwaliteit en belasting worden dan live bijgewerkt — zichtbaar voor
          jou én je therapeut.
        </p>
        <div
          className="mt-3 rounded-xl"
          style={{ backgroundColor: P.surfaceLow, border: `1px solid ${P.line}`, padding: '10px 12px' }}
        >
          <MetaLabel style={{ color: P.inkMuted }}>
            OPEN DE MBT-APP OP JE IPHONE → INSTELLINGEN → APPLE HEALTH KOPPELEN
          </MetaLabel>
        </div>
      </Tile>
    )
  }

  return (
    <div className="space-y-3">
      <ReadinessCard readiness={data.readiness} trend={data.readinessTrend} />
      <SleepCard sleep={data.sleep} />
      <VitalsCard vitals={data.vitals} />
      <WearableActivities activities={data.activities} />
      <SyncFooter connection={data.connection} />
    </div>
  )
}

function SyncFooter({
  connection,
}: {
  connection: Extract<WearableOverviewData['connection'], { connected: true }>
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <MetaLabel style={{ color: P.inkDim, fontSize: 9 }}>
        {connection.deviceModel ?? 'APPLE WATCH'}
      </MetaLabel>
      <MetaLabel style={{ color: P.inkDim, fontSize: 9 }}>
        {connection.lastSyncAt ? `GESYNCT ${formatSync(connection.lastSyncAt)}` : 'NOG NIET GESYNCT'}
      </MetaLabel>
    </div>
  )
}

function formatSync(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min} min geleden`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} uur geleden`
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}
