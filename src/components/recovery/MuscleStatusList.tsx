'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  getMuscleFatigueColor,
  formatHoursRemaining,
  type MuscleFatigueState,
} from '@/lib/muscle-fatigue'

/**
 * Status per spiergroep — per-regio herstel-lijst (geen anatomie-figuur).
 *
 * Gevoed door patient.muscleFatigue (recoveryPercent 0–100, server-side
 * berekend). Toont alleen regio's met een stimulus in de laatste 7 dagen én
 * recoveryPercent < 95 (herstelde regio's vallen weg). Meest vermoeid bovenaan.
 *
 * Styling volgt de iOS-huisstijl (mbt-gym-mobile/constants/theme.ts): petrol
 * surface, mono-waarden, dunne MiniBar-balken. De status-kleuren zijn een eigen
 * functionele schaal (docs/plan-muscle-fatigue-v2.md §6, door Jurre akkoord).
 */

// iOS-merktokens (petrol/oranje). Bewust hardgecodeerd zodat de lijst als de
// iOS-app leest, los van de web dark-ui P (die is bijna-zwart).
const IOS = {
  surface: '#15363A',
  surfaceHi: '#1C4448',
  line: 'rgba(212,232,230,0.08)',
  ink: '#F5F2ED',
  inkMuted: '#9EB5B3',
} as const

const MONO = 'var(--font-mono-athletic)'

/** Data-container: haalt de per-regio fatigue op en rendert de view. */
export function MuscleStatusList({ collapsible = false }: { collapsible?: boolean }) {
  const { data, isLoading } = trpc.patient.muscleFatigue.useQuery()
  return (
    <MuscleStatusListView states={data ?? []} isLoading={isLoading} collapsible={collapsible} />
  )
}

/**
 * Presentatie-component. Neemt ruwe fatigue-states, filtert herstelde regio's
 * (≥95%) weg, sorteert meest-vermoeid-eerst en rendert de lijst. Losgekoppeld
 * van de query zodat de simulator (src/app/simulator/muscle-fatigue) hetzelfde
 * component met de echte engine kan voeden.
 */
export function MuscleStatusListView({
  states,
  isLoading = false,
  collapsible = false,
}: {
  states: MuscleFatigueState[]
  isLoading?: boolean
  /** Toont de lijst als in-/uitklapbaar blok; standaard dicht. */
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(false)

  const rows = states
    .filter((s) => s.recoveryPercent < 95)
    .sort((a, b) => a.recoveryPercent - b.recoveryPercent)

  const headingStyle = {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: IOS.inkMuted,
  } as const

  const showBody = !collapsible || open

  return (
    <div
      style={{
        backgroundColor: IOS.surface,
        borderRadius: 10,
        padding: '16px 18px',
      }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            ...headingStyle,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: showBody ? 14 : 0,
          }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>Status per spiergroep</span>
          {!open && !isLoading && rows.length > 0 && (
            <span style={{ color: getMuscleFatigueColor(rows[0].recoveryPercent) }}>
              {rows.length} belast
            </span>
          )}
          <span
            aria-hidden
            style={{
              fontSize: 9,
              transition: 'transform .15s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          >
            ▼
          </span>
        </button>
      ) : (
        <h2 style={{ ...headingStyle, marginBottom: 14 }}>Status per spiergroep</h2>
      )}

      {!showBody ? null : isLoading ? (
        <div style={{ color: IOS.inkMuted, fontSize: 13, padding: '6px 0 2px' }}>
          Laden…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ color: IOS.inkMuted, fontSize: 13, padding: '6px 0 2px' }}>
          Alles hersteld, klaar om te trainen.
        </div>
      ) : (
        rows.map((s, i) => {
          const color = getMuscleFatigueColor(s.recoveryPercent)
          return (
            <div key={s.muscle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  lineHeight: '18px',
                  paddingTop: 8,
                  borderTop: i === 0 ? 'none' : `1px solid ${IOS.line}`,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    flex: 'none',
                    backgroundColor: color,
                  }}
                />
                <span style={{ flex: 1, color: IOS.ink }}>{s.muscle}</span>
                {s.hoursRemaining > 0 && (
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: IOS.inkMuted,
                      letterSpacing: 0.3,
                    }}
                  >
                    {formatHoursRemaining(s.hoursRemaining)}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: 0.5,
                    color,
                  }}
                >
                  {s.recoveryPercent}%
                </span>
              </div>
              <div
                style={{
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: IOS.surfaceHi,
                  margin: '6px 0 8px 20px',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    borderRadius: 3,
                    width: `${s.recoveryPercent}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
