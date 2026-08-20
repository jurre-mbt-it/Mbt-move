/**
 * Full-screen laadscherm in "progressive overload"-stijl: een staafgrafiek die
 * trapsgewijs omhoog klimt. Pure CSS-animatie (geen hooks) zodat het component
 * óók als server-rendered `loading.tsx` werkt en direct zichtbaar is — vóór
 * hydratie. Vervangt de kale spinner die je heel kort ziet bij het openen van
 * de (webview-)app.
 */

const BG = 'var(--p-bg)'
const SURFACE_LOW = 'var(--p-bg)'
const INK_MUTED = 'var(--p-ink-muted)'
const BRAND = 'var(--p-brand)'
const LIME = 'var(--p-lime)'

// Oplopende doelhoogtes (%) — leest als progressieve overbelasting: elke set
// iets zwaarder dan de vorige.
const BARS = [28, 40, 52, 63, 78, 92]

export function AppLoader() {
  return (
    <div
      role="status"
      aria-label="Laden"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        fontFamily: "'Archivo', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes mbt-bar-grow {
          0%   { transform: scaleY(0.04); opacity: 0.35; }
          55%  { transform: scaleY(1);    opacity: 1; }
          80%  { transform: scaleY(1);    opacity: 1; }
          100% { transform: scaleY(0.04); opacity: 0.35; }
        }
        @keyframes mbt-trend-rise {
          0%   { transform: translateY(10px); opacity: 0; }
          55%  { transform: translateY(0);    opacity: 1; }
          100% { transform: translateY(0);    opacity: 1; }
        }
        @keyframes mbt-cap-blink {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        .mbt-loader-bar {
          transform-origin: bottom center;
          animation: mbt-bar-grow 1.9s cubic-bezier(.4,0,.2,1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .mbt-loader-bar { animation-duration: 0.001s; transform: scaleY(1) !important; opacity: 1 !important; }
        }
      `}</style>

      {/* Grafiek */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 9,
          height: 96,
          width: 188,
          padding: '0 4px',
        }}
      >
        {/* basislijn */}
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 1,
            background: 'rgba(212,232,230,0.10)',
          }}
        />
        {BARS.map((h, i) => {
          const isPeak = i === BARS.length - 1
          return (
            <span
              key={i}
              style={{
                position: 'relative',
                flex: 1,
                height: `${h}%`,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                borderRadius: 3,
                background: isPeak
                  ? `linear-gradient(180deg, ${BRAND}, ${BRAND})`
                  : `linear-gradient(180deg, ${LIME}, ${LIME})`,
                opacity: isPeak ? 1 : 0.85,
              }}
              className="mbt-loader-bar"
              // gestaffelde start → het klimt van links naar rechts op
              data-i={i}
            >
              {/* "PR"-dop op de hoogste staaf */}
              {isPeak && (
                <span
                  style={{
                    position: 'absolute',
                    top: -7,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: BRAND,
                    boxShadow: `0 0 10px ${BRAND}`,
                    animation: 'mbt-cap-blink 1.9s ease-in-out infinite',
                  }}
                />
              )}
              <style>{`.mbt-loader-bar[data-i="${i}"]{animation-delay:${i * 0.13}s}`}</style>
            </span>
          )
        })}

        {/* opwaartse trendpijl */}
        <span
          style={{
            position: 'absolute',
            right: -2,
            top: -4,
            color: BRAND,
            fontSize: 16,
            fontWeight: 900,
            lineHeight: 1,
            animation: 'mbt-trend-rise 1.9s cubic-bezier(.4,0,.2,1) infinite',
          }}
          aria-hidden
        >
          ↗
        </span>
      </div>

      {/* Wordmark */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            color: 'var(--p-ink)',
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: '0.18em',
            marginRight: '-0.18em',
          }}
        >
          BASE
        </span>
        <span
          style={{
            color: INK_MUTED,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.28em',
            fontFamily: "'Martian', ui-monospace, Menlo, monospace",
            background: SURFACE_LOW,
            padding: '3px 10px',
            borderRadius: 999,
          }}
        >
          LADEN…
        </span>
      </div>
    </div>
  )
}
