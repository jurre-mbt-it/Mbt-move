'use client'

/**
 * Lijst van gesyncte Apple-Watch-activiteiten (workouts). Dit zijn dezelfde
 * CardioLog-rijen die de belasting-curve voeden, hier als geschiedenis.
 */
import { Tile, Kicker, MetaLabel, P } from '@/components/dark-ui'

type ActivityDto = {
  id: string
  activity: string
  durationSec: number
  distanceM: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  calories: number | null
  rpe: number | null
  avgPaceSecPerKm: number | null
  completedAt: string
}

const ACTIVITY_LABEL: Record<string, string> = {
  RUNNING: 'Hardlopen', CYCLING: 'Fietsen', ROWING: 'Roeien', SWIMMING: 'Zwemmen',
  CROSSTRAINER: 'Crosstrainer', WALKING: 'Wandelen', SKIERG: 'SkiErg',
  ASSAULT_BIKE: 'Assault Bike', WATTBIKE: 'Wattbike', STAIRCLIMBER: 'Stairclimber', OTHER: 'Activiteit',
}

export function WearableActivities({ activities }: { activities: ActivityDto[] }) {
  if (!activities.length) {
    return (
      <Tile>
        <Kicker>ACTIVITEITEN</Kicker>
        <div className="py-6 text-center">
          <MetaLabel style={{ color: P.inkMuted }}>NOG GEEN WORKOUTS GESYNCT</MetaLabel>
        </div>
      </Tile>
    )
  }

  return (
    <Tile>
      <Kicker style={{ marginBottom: 12 }}>ACTIVITEITEN VAN JE WATCH</Kicker>
      <div className="space-y-2">
        {activities.map(a => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl"
            style={{ backgroundColor: P.surfaceLow, border: `1px solid ${P.line}`, padding: '10px 12px' }}
          >
            <span aria-hidden style={{ width: 3, height: 32, borderRadius: 1.5, backgroundColor: P.danger }} />
            <div className="flex-1 min-w-0">
              <span className="block truncate" style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.01em' }}>
                {ACTIVITY_LABEL[a.activity] ?? a.activity}
              </span>
              <MetaLabel style={{ color: P.inkMuted, fontSize: 10, marginTop: 2 }}>
                {formatDate(a.completedAt)}
                {a.distanceM ? ` · ${(a.distanceM / 1000).toFixed(1)} km` : ''}
                {a.avgPaceSecPerKm ? ` · ${formatPace(a.avgPaceSecPerKm)}` : ''}
              </MetaLabel>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="athletic-mono" style={{ color: P.ink, fontSize: 13, fontWeight: 800 }}>
                {formatDuration(a.durationSec)}
              </span>
              {a.avgHeartRate && (
                <MetaLabel style={{ color: P.danger, fontSize: 10, marginTop: 2 }}>
                  ♥ {a.avgHeartRate}
                </MetaLabel>
              )}
            </div>
          </div>
        ))}
      </div>
    </Tile>
  )
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}u ${String(m).padStart(2, '0')}m` : `${m} min`
}
function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
