'use client'

import { P, Tile } from '@/components/dark-ui'
import { useBoolPref } from '@/hooks/useLocalPref'

interface Props {
  prefKey: string
  defaultValue: boolean
  label: string
  sub?: string
  bar?: string
}

export function PrefToggleTile({ prefKey, defaultValue, label, sub, bar = P.lime }: Props) {
  const [enabled, setEnabled] = useBoolPref(prefKey, defaultValue)

  return (
    <Tile accentBar={bar}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{label}</p>
          {sub && (
            <p
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 11,
                letterSpacing: '0.04em',
                fontWeight: 500,
                marginTop: 2,
                textTransform: 'none',
              }}
            >
              {sub}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className="athletic-tap rounded-full transition-colors relative shrink-0"
          style={{
            width: 44,
            height: 26,
            background: enabled ? P.lime : P.surfaceHi,
            border: `1px solid ${enabled ? P.lime : P.lineStrong}`,
          }}
        >
          <span
            aria-hidden
            className="block rounded-full transition-transform"
            style={{
              width: 20,
              height: 20,
              background: enabled ? P.bg : P.inkMuted,
              transform: `translateX(${enabled ? 20 : 2}px)`,
              marginTop: 2,
            }}
          />
        </button>
      </div>
    </Tile>
  )
}
