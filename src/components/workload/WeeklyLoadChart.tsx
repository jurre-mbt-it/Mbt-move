'use client'

import { P, Tile, Kicker } from '@/components/dark-ui'

export interface WeeklyLoadBar {
  label: string
  value: number
  sessionCount?: number
}

interface Props {
  bars: WeeklyLoadBar[]
  /** Kop boven de chart (default: "WEKELIJKSE BELASTING · sRPE"). */
  kicker?: string
  /** Tekst onder de chart, links uitgelijnd (mono uppercase). */
  footnote?: string
  /** Index van de "actieve" week (default: laatste bar). Krijgt vollere kleur. */
  activeIndex?: number
  /** Hoogte van het bar-gebied in pixels (default 80). */
  height?: number
  /** Max breedte per bar in pixels (default 22). */
  barWidth?: number
}

/**
 * Glass-stijl wekelijkse-belasting bar chart in brand-oranje.
 *
 * - Bars met top→bottom gradient (brand → brandDeep) en afgeronde top.
 * - Inactieve weken vervagen iets, huidige week is feller.
 * - Geen waarde-labels boven elke bar (cleaner) — totaal zichtbaar in footnote.
 *
 * Bedoeld als drop-in vervanging voor de bar-chart sectie in WorkloadPanel
 * en voor 1:1 vertaling naar de mbt-gym Expo-app.
 */
export function WeeklyLoadChart({
  bars,
  kicker = 'WEKELIJKSE BELASTING · sRPE',
  footnote,
  activeIndex,
  height = 80,
  barWidth = 22,
}: Props) {
  if (bars.length === 0) return null

  const max = Math.max(...bars.map((b) => b.value), 1)
  const active = activeIndex ?? bars.length - 1

  return (
    <Tile>
      <Kicker style={{ marginBottom: 10, color: P.brand }}>{kicker}</Kicker>

      <div className="flex items-end gap-1.5" style={{ height }}>
        {bars.map((bar, i) => {
          const pct = Math.max(4, (bar.value / max) * 100)
          const isActive = i === active

          return (
            <div
              key={`${bar.label}-${i}`}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ height: '100%' }}
              title={`${bar.label}: ${bar.value}${
                bar.sessionCount != null ? ` · ${bar.sessionCount}×` : ''
              }`}
            >
              <div
                className="w-full transition-all duration-500"
                style={{
                  maxWidth: barWidth,
                  height: `${pct}%`,
                  borderRadius: '6px 6px 2px 2px',
                  background: isActive
                    ? `linear-gradient(180deg, ${P.brand} 0%, ${P.brandDeep} 100%)`
                    : `linear-gradient(180deg, rgba(232,122,85,0.5) 0%, rgba(201,97,63,0.15) 100%)`,
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-end justify-between mt-2 px-0.5">
        <span
          className="athletic-mono"
          style={{
            color: P.inkMuted,
            fontSize: 9,
            letterSpacing: '0.14em',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          {footnote ?? `${bars.length} weken`}
        </span>
        <div className="flex gap-1.5">
          {bars.map((bar, i) => (
            <span
              key={`label-${i}`}
              className="athletic-mono"
              style={{
                color: i === active ? P.ink : P.inkDim,
                fontSize: 8,
                letterSpacing: '0.06em',
                fontWeight: 700,
                width: barWidth,
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            >
              {bar.label}
            </span>
          ))}
        </div>
      </div>
    </Tile>
  )
}
