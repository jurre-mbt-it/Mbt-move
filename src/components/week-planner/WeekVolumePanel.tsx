'use client'

/**
 * Wat staat er deze week eigenlijk gepland? Belasting, tijd en omvang per
 * soort training, als vaste kolom naast de weekkalender.
 *
 * De balk meet tegen de zwáárste week van hetzelfde plan, niet tegen een
 * absoluut doel. Een meerweeks plan heeft zelden een weekdoel per week
 * ingevuld, en wat een therapeut hier wil zien is de vórm: loopt de opbouw
 * op, dipt de deload, zakt de taper. Dat is een vergelijking binnen het plan.
 *
 * Kilometers verschijnen alleen bij een activiteit die érgens in km is
 * voorgeschreven, en dragen dan een ~ als een deel uit tijd is afgeleid. Zie
 * `plannedVolume` in lib/planned-load voor waarom die twee door elkaar lopen.
 */

import { Moon } from 'lucide-react'

import { P } from '@/lib/palette'
import { phaseMeta } from '@/lib/periodization'
import type { PlannedVolume } from '@/lib/planned-load'

/** "7u29" of "45 min" — uren pas zodra ze er zijn. */
export function formatDuur(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}u${String(min % 60).padStart(2, '0')}`
}

/** "33,2 km", met de komma die hier hoort. Ronde getallen zonder decimaal. */
export function formatAfstand(meter: number): string {
  return `${(meter / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`
}

export function WeekVolumePanel({
  volume,
  maxLoad,
  phaseType,
  isDeload,
  targetLoad,
}: {
  volume: PlannedVolume
  /** Zwaarste week van het plan; ijkt de balk. */
  maxLoad: number
  phaseType?: string | null
  isDeload?: boolean
  targetLoad?: number | null
}) {
  const phase = phaseMeta(phaseType)
  const pct = maxLoad > 0 ? Math.min(100, (volume.load / maxLoad) * 100) : 0
  const kleur = isDeload ? P.ice : (phase?.color ?? P.lime)

  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
    >
      <div className="flex items-center gap-1.5">
        <p
          className="athletic-mono"
          style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.14em' }}
        >
          WEEKTOTAAL
        </p>
        {isDeload && (
          <span title="Deload-week">
            <Moon className="h-3 w-3" style={{ color: P.ice }} />
          </span>
        )}
      </div>

      {/* Belasting: het enige getal dat over álle soorten training heen
          vergelijkbaar is, dus staat het bovenaan. */}
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className="athletic-mono"
          style={{ color: P.ink, fontSize: 22, fontWeight: 800, lineHeight: 1 }}
          title={
            `Geplande belasting: duur × RPE, in AU.` +
            (volume.estimated ? ' Deels geschat, want niet elke sessie heeft een ingevulde duur of RPE.' : '')
          }
        >
          {volume.estimated ? '~' : ''}
          {volume.load}
        </span>
        <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 10 }}>
          AU
        </span>
      </div>

      <div
        className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: P.surfaceHi }}
        title={`Deze week is ${Math.round(pct)}% van de zwaarste week in dit plan (${maxLoad} AU).`}
      >
        <div
          className="h-full rounded-full origin-left transition-transform duration-500"
          style={{ width: '100%', background: kleur, transform: `scaleX(${(pct / 100).toFixed(3)})` }}
        />
      </div>

      {targetLoad != null && targetLoad > 0 && (
        <p className="athletic-mono mt-1" style={{ color: P.inkDim, fontSize: 9 }}>
          DOEL {targetLoad}
        </p>
      )}

      {phase && !isDeload && (
        <p
          className="athletic-mono mt-1.5"
          style={{ color: phase.color, fontSize: 9, letterSpacing: '0.08em' }}
          title={phase.description}
        >
          {phase.label}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2" style={{ color: P.inkMuted }}>
        <span style={{ fontSize: 11 }}>
          {volume.itemCount} {volume.itemCount === 1 ? 'sessie' : 'sessies'}
        </span>
        <span style={{ color: P.inkDim, fontSize: 11 }}>·</span>
        <span style={{ fontSize: 11 }}>{formatDuur(volume.durationSec)}</span>
      </div>

      {volume.byActivity.length > 0 && (
        <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: P.line }}>
          {volume.byActivity.map((a) => (
            <div key={a.key} className="flex items-baseline justify-between gap-2">
              <span className="truncate" style={{ color: P.inkDim, fontSize: 10 }} title={a.label}>
                {a.label}
              </span>
              <span
                className="athletic-mono shrink-0"
                // textTransform in de inline stijl, niet via Tailwinds
                // `normal-case`: .athletic-mono staat ongelaagd in globals.css
                // en wint daarmee altijd van een utility uit @layer. Zonder dit
                // wordt "3u53" een onleesbare "3U53".
                style={{ color: P.ink, fontSize: 10, textTransform: 'none' }}
                title={
                  a.distanceM != null
                    ? `${a.count}× · ${formatDuur(a.durationSec)}` +
                      (a.distanceEstimated
                        ? '. De km van sessies die in tijd zijn voorgeschreven zijn omgerekend op een rustig duurtempo, vandaar de ~.'
                        : '')
                    : `${a.count}× ${a.label.toLowerCase()}`
                }
              >
                {a.distanceM != null
                  ? `${a.distanceEstimated ? '~' : ''}${formatAfstand(a.distanceM)}`
                  : formatDuur(a.durationSec)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
