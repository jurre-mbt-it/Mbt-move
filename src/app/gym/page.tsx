import Image from 'next/image'
import Link from 'next/link'
// v2 — interactive hover pass


const P = {
  bg: '#0A0E0F',
  surface: '#141A1B',
  surfaceHi: '#1C2425',
  surfaceLow: '#0F1415',
  line: 'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',
  ink: '#F5F7F6',
  inkMuted: '#7B8889',
  inkDim: '#4A5454',
  lime: '#BEF264',
  limeDark: '#65A30D',
  gold: '#F4C261',
  ice: '#93C5FD',
  danger: '#F87171',
  purple: '#C084FC',
}

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

const requestAccess =
  'mailto:jurre@movementbasedtherapy.nl?subject=MBT-Gym%20TestFlight%20toegang&body=Hoi%20Jurre%2C%20ik%20zou%20graag%20toegang%20tot%20de%20MBT-Gym%20beta.'

export default function GymLandingPage() {
  return (
    <main
      style={{
        background: P.bg,
        color: P.ink,
        minHeight: '100vh',
        fontFamily: 'Satoshi, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <style>{`
        @keyframes mbt-pulse-kf {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.25); }
        }
        .mbt-pulse { animation: mbt-pulse-kf 1.8s ease-in-out infinite; }
        html, body { background: ${P.bg}; }
        @media (min-width: 640px) {
          .mbt-nav-link { display: inline-flex !important; }
        }
        a { color: inherit; }

        /* Hero words — individual hover color pop */
        .mbt-hero-word {
          display: inline-block;
          transition: color 240ms ease, transform 240ms cubic-bezier(.2,.8,.2,1), letter-spacing 240ms ease;
          cursor: default;
          will-change: transform;
        }
        .mbt-hero-word:hover {
          transform: translateX(8px);
        }
        .mbt-hero-word[data-accent="lime"]:hover { color: ${P.lime}; }
        .mbt-hero-word[data-accent="ice"]:hover { color: ${P.ice}; }
        .mbt-hero-word[data-accent="gold"]:hover { color: ${P.gold}; }
        .mbt-hero-word[data-accent="purple"]:hover { color: ${P.purple}; }

        /* Nav link underline sweep */
        .mbt-nav-link { position: relative; transition: color 180ms ease; }
        .mbt-nav-link::after {
          content: '';
          position: absolute;
          left: 0; right: 100%;
          bottom: -4px;
          height: 1px;
          background: ${P.lime};
          transition: right 260ms cubic-bezier(.2,.8,.2,1);
        }
        .mbt-nav-link:hover { color: ${P.ink}; }
        .mbt-nav-link:hover::after { right: 0; }

        /* Primary CTA — brighten + lift + arrow shift */
        .mbt-cta {
          transition: transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, filter 220ms ease;
          box-shadow: 0 0 0 0 rgba(190,242,100,0);
        }
        .mbt-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px -8px rgba(190,242,100,0.55);
          filter: brightness(1.06);
        }
        .mbt-cta .mbt-arrow { transition: transform 220ms cubic-bezier(.2,.8,.2,1); display: inline-block; }
        .mbt-cta:hover .mbt-arrow { transform: translateX(6px); }

        /* Ghost CTA */
        .mbt-ghost {
          transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
        }
        .mbt-ghost:hover {
          background: ${P.surface};
          border-color: ${P.lime};
          transform: translateY(-2px);
        }

        /* Stat tile (hero KPIs) — lift + bar grow */
        .mbt-stat-tile {
          transition: transform 260ms cubic-bezier(.2,.8,.2,1), border-color 260ms ease, background 260ms ease;
        }
        .mbt-stat-tile:hover {
          transform: translateY(-4px);
          border-color: ${P.lineStrong};
          background: ${P.surfaceHi};
        }
        .mbt-stat-tile .mbt-stat-bar {
          transition: transform 320ms cubic-bezier(.2,.8,.2,1);
          transform-origin: top;
        }
        .mbt-stat-tile:hover .mbt-stat-bar { transform: scaleY(1.1); }

        /* Feature tile — lift + accent widen + subtle glow */
        .mbt-tile {
          transition: transform 320ms cubic-bezier(.2,.8,.2,1), border-color 320ms ease, background 320ms ease, box-shadow 320ms ease;
        }
        .mbt-tile:hover {
          transform: translateY(-6px);
          border-color: ${P.lineStrong};
          background: ${P.surfaceHi};
          box-shadow: 0 20px 40px -24px rgba(0,0,0,0.6);
        }
        .mbt-tile .mbt-tile-bar {
          transition: width 280ms cubic-bezier(.2,.8,.2,1), box-shadow 280ms ease;
        }
        .mbt-tile:hover .mbt-tile-bar {
          width: 6px;
          box-shadow: 0 0 16px currentColor;
        }
        .mbt-tile .mbt-tile-title {
          transition: color 240ms ease, transform 240ms ease;
        }
        .mbt-tile:hover .mbt-tile-title {
          transform: translateX(2px);
        }

        /* For-who cards — top bar grow */
        .mbt-forwho {
          transition: transform 320ms cubic-bezier(.2,.8,.2,1), border-color 320ms ease, background 320ms ease;
        }
        .mbt-forwho:hover {
          transform: translateY(-6px);
          border-color: ${P.lineStrong};
          background: ${P.surfaceHi};
        }
        .mbt-forwho .mbt-forwho-bar { transition: height 260ms ease; }
        .mbt-forwho:hover .mbt-forwho-bar { height: 8px; }

        /* Phone mockup hover — subtle float + glow */
        .mbt-phone {
          transition: transform 500ms cubic-bezier(.2,.8,.2,1), box-shadow 500ms ease;
        }
        .mbt-phone:hover {
          transform: translateY(-12px) rotate(-1deg) !important;
          box-shadow: 0 40px 80px -20px rgba(190,242,100,0.28), 0 20px 40px -20px rgba(0,0,0,0.7) !important;
        }
        .mbt-phone-elevated:hover {
          transform: translateY(-36px) rotate(1deg) !important;
        }

        /* Mini-tiles inside phone — hover highlight */
        .mbt-mini-tile {
          transition: background 200ms ease, transform 200ms ease;
        }
        .mbt-mini-tile:hover {
          background: ${P.surfaceHi};
          transform: translateX(3px);
        }

        /* ACWR meter needle tick on hover */
        .mbt-acwr { transition: transform 400ms cubic-bezier(.2,.8,.2,1); }
        .mbt-acwr:hover { transform: scale(1.02); }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .mbt-pulse { animation: none; }
          .mbt-hero-word, .mbt-cta, .mbt-ghost, .mbt-stat-tile, .mbt-tile,
          .mbt-forwho, .mbt-phone, .mbt-mini-tile, .mbt-acwr,
          .mbt-stat-bar, .mbt-tile-bar, .mbt-tile-title, .mbt-forwho-bar, .mbt-arrow {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
      <TopBar />
      <Hero />
      <FeatureGrid />
      <PhoneMockups />
      <WorkloadSection />
      <ForWhoSection />
      <CTASection />
      <Footer />
    </main>
  )
}

/* ───────────────────────── Shared primitives ───────────────────────── */

function Kicker({ children, color = P.lime }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: 2,
        textTransform: 'uppercase',
        fontWeight: 700,
        color,
      }}
    >
      {children}
    </span>
  )
}

function MetaLabel({
  children,
  color = P.inkMuted,
  size = 11,
}: {
  children: React.ReactNode
  color?: string
  size?: number
}) {
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: size,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        fontWeight: 700,
        color,
      }}
    >
      {children}
    </span>
  )
}

function PulsingDot({ color = P.lime }: { color?: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        boxShadow: `0 0 12px ${color}`,
        display: 'inline-block',
      }}
      className="mbt-pulse"
    />
  )
}

function PrimaryCTA({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="mbt-cta"
      style={{
        background: P.lime,
        color: '#0A0E0F',
        padding: '16px 24px',
        borderRadius: 12,
        fontFamily: mono,
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontWeight: 900,
        fontSize: 13,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
      }}
    >
      {children}
      <span className="mbt-arrow" style={{ fontSize: 18 }}>→</span>
    </a>
  )
}

function GhostCTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="mbt-ghost"
      style={{
        background: 'transparent',
        color: P.ink,
        padding: '16px 24px',
        borderRadius: 12,
        fontFamily: mono,
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontWeight: 900,
        fontSize: 13,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
        border: `1px solid ${P.lineStrong}`,
      }}
    >
      {children}
    </a>
  )
}

/* ───────────────────────── Top bar ───────────────────────── */

function TopBar() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(10,14,15,0.8)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${P.line}`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              overflow: 'hidden',
              border: `1px solid ${P.lineStrong}`,
            }}
          >
            <Image
              src="/mbt-gym-icon.png"
              alt="MBT-Gym"
              width={32}
              height={32}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <MetaLabel size={12} color={P.ink}>
            MBT·GYM
          </MetaLabel>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a
            href="#features"
            style={{
              display: 'none',
              color: P.inkMuted,
              textDecoration: 'none',
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
            className="mbt-nav-link"
          >
            FEATURES
          </a>
          <a
            href="#workload"
            style={{
              display: 'none',
              color: P.inkMuted,
              textDecoration: 'none',
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
            className="mbt-nav-link"
          >
            WORKLOAD
          </a>
          <a
            href={requestAccess}
            style={{
              color: P.lime,
              textDecoration: 'none',
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 900,
            }}
          >
            TESTFLIGHT →
          </a>
        </nav>
      </div>
    </header>
  )
}

/* ───────────────────────── Hero ───────────────────────── */

function Hero() {
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <RadialGlow />
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '96px 24px 80px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 28,
          }}
        >
          <PulsingDot />
          <Kicker>LIVE · BETA · TESTFLIGHT</Kicker>
        </div>

        <h1
          style={{
            fontSize: 'clamp(48px, 9vw, 128px)',
            lineHeight: 1.02,
            fontWeight: 900,
            letterSpacing: -4,
            margin: 0,
            paddingTop: 6,
          }}
        >
          <span className="mbt-hero-word" data-accent="lime">TRAIN.</span><br />
          <span className="mbt-hero-word" data-accent="ice">RECOVER.</span><br />
          <span className="mbt-hero-word" data-accent="gold">ANALYSE.</span><br />
          <span
            className="mbt-hero-word"
            data-accent="purple"
            style={{ color: P.lime }}
          >
            REPEAT.
          </span>
        </h1>

        <p
          style={{
            fontSize: 20,
            lineHeight: 1.5,
            color: P.inkMuted,
            marginTop: 32,
            maxWidth: 620,
            fontWeight: 400,
          }}
        >
          MBT·Gym koppelt jouw programma, workload en herstel in één athletic-first app.
          Gebouwd door een sportfysiotherapeut — voor sporters die onder begeleiding
          doorgaan waar de behandelkamer stopt.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 40 }}>
          <PrimaryCTA href={requestAccess}>VRAAG TESTFLIGHT</PrimaryCTA>
          <GhostCTA href="#features">MEER ZIEN</GhostCTA>
        </div>

        <div
          style={{
            marginTop: 72,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <StatTile value="24/7" unit="COACH IN JE ZAK" color={P.lime} />
          <StatTile value="sRPE" unit="WORKLOAD-TRACKING" color={P.gold} />
          <StatTile value="0.8–1.3" unit="ACWR SWEET-SPOT" color={P.ice} />
          <StatTile value="iOS" unit="NATIVE / TESTFLIGHT" color={P.purple} />
        </div>
      </div>
    </section>
  )
}

function RadialGlow() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(600px 400px at 80% 0%, rgba(190,242,100,0.12), transparent 70%), radial-gradient(800px 500px at 0% 30%, rgba(147,197,253,0.06), transparent 70%)',
        pointerEvents: 'none',
      }}
    />
  )
}

function StatTile({
  value,
  unit,
  color,
}: {
  value: string
  unit: string
  color: string
}) {
  return (
    <div
      className="mbt-stat-tile"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 16,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        className="mbt-stat-bar"
        style={{
          position: 'absolute',
          left: 0,
          top: 20,
          bottom: 20,
          width: 3,
          background: color,
          borderRadius: 2,
        }}
      />
      <div style={{ paddingLeft: 12 }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: -1,
            color: P.ink,
            paddingTop: 2,
            lineHeight: 1.12,
          }}
        >
          {value}
        </div>
        <div style={{ marginTop: 6 }}>
          <MetaLabel>{unit}</MetaLabel>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Feature grid ───────────────────────── */

const FEATURES: Array<{
  kicker: string
  title: string
  body: string
  color: string
}> = [
  {
    kicker: '01 · PROGRAMMA',
    title: 'JOUW WEEK, VOLLEDIG GEPLAND',
    body:
      'Je coach zet workouts, mobility-blokken en cardio in een weekplanner. Jij ziet per dag precies wat je moet doen — en wat je gisteren deed.',
    color: P.lime,
  },
  {
    kicker: '02 · WORKOUT',
    title: 'LOGGEN ALS EEN ATLEET',
    body:
      'Sets, reps, gewicht en RPE in één tap. Laatst-gebruikte gewichten worden voorgevuld. Custom parameters voor bewegings-specifieke data.',
    color: P.ice,
  },
  {
    kicker: '03 · RECOVERY',
    title: 'WEET WANNEER JE MOET RUSTEN',
    body:
      'sRPE-workload, 7-daagse acute vs. 28-daagse chronische belasting, ACWR sweet-spot 0.8–1.3. Rood = overload, lime = uitgerust.',
    color: P.gold,
  },
  {
    kicker: '04 · PIJN',
    title: 'PIJN EN WELLNESS IN KAART',
    body:
      'Dagelijkse wellness-checks. Tendinopathie-protocol met 24-uurs follow-up. Jouw therapeut ziet direct of een oefening helpt of verergert.',
    color: P.danger,
  },
  {
    kicker: '05 · TRAINEN',
    title: 'LIVE SESSIE MET DE THERAPEUT',
    body:
      'In de behandelkamer logt je therapeut live mee. Buiten de kamer zie je jouw data terug — alles ademt dezelfde Supabase-backend.',
    color: P.purple,
  },
  {
    kicker: '06 · ANALYSE',
    title: 'GRAFIEKEN DIE NIET LIEGEN',
    body:
      'PR-tracking per oefening, hartslagzones Z1–Z5, pijn-trends over de tijd. Geen gamification-fluff, wel harde data om te analyseren.',
    color: P.gold,
  },
]

function FeatureGrid() {
  return (
    <section
      id="features"
      style={{
        borderTop: `1px solid ${P.line}`,
        background: P.surfaceLow,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 24px' }}>
        <Kicker>FEATURES</Kicker>
        <h2
          style={{
            fontSize: 'clamp(40px, 6vw, 72px)',
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: -2,
            marginTop: 16,
            maxWidth: 820,
            paddingTop: 4,
          }}
        >
          ALLES WAT EEN SPORTER NODIG HEEFT.
          <br />
          <span style={{ color: P.inkDim }}>NIETS MEER.</span>
        </h2>

        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {FEATURES.map((f) => (
            <FeatureTile key={f.kicker} {...f} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureTile({
  kicker,
  title,
  body,
  color,
}: {
  kicker: string
  title: string
  body: string
  color: string
}) {
  return (
    <article
      className="mbt-tile"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 20,
        padding: 28,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 240,
      }}
    >
      <div
        className="mbt-tile-bar"
        style={{
          position: 'absolute',
          left: 0,
          top: 28,
          bottom: 28,
          width: 4,
          background: color,
          color,
          borderRadius: 3,
        }}
      />
      <div style={{ paddingLeft: 16 }}>
        <MetaLabel color={color}>{kicker}</MetaLabel>
        <h3
          className="mbt-tile-title"
          style={{
            marginTop: 12,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: -0.5,
            color: P.ink,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            marginTop: 14,
            fontSize: 15,
            lineHeight: 1.55,
            color: P.inkMuted,
            fontWeight: 400,
          }}
        >
          {body}
        </p>
      </div>
    </article>
  )
}

/* ───────────────────────── Phone mockups ───────────────────────── */

function PhoneMockups() {
  return (
    <section style={{ borderTop: `1px solid ${P.line}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 24px' }}>
        <Kicker color={P.ice}>PREVIEW</Kicker>
        <h2
          style={{
            fontSize: 'clamp(40px, 6vw, 72px)',
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: -2,
            marginTop: 16,
            maxWidth: 820,
            paddingTop: 4,
          }}
        >
          ZO VOELT <span style={{ color: P.lime }}>TRAINEN</span> AAN.
        </h2>

        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 32,
            alignItems: 'end',
          }}
        >
          <PhoneFrame>
            <MockTodayScreen />
          </PhoneFrame>
          <PhoneFrame elevated>
            <MockWorkoutScreen />
          </PhoneFrame>
          <PhoneFrame>
            <MockRecoveryScreen />
          </PhoneFrame>
        </div>
      </div>
    </section>
  )
}

function PhoneFrame({
  children,
  elevated,
}: {
  children: React.ReactNode
  elevated?: boolean
}) {
  return (
    <div
      className={`mbt-phone${elevated ? ' mbt-phone-elevated' : ''}`}
      style={{
        width: '100%',
        maxWidth: 320,
        margin: '0 auto',
        aspectRatio: '9 / 19',
        background: '#000',
        borderRadius: 44,
        border: `1px solid ${P.lineStrong}`,
        padding: 10,
        boxShadow: elevated
          ? '0 40px 80px -20px rgba(190,242,100,0.18), 0 20px 40px -20px rgba(0,0,0,0.6)'
          : '0 30px 60px -20px rgba(0,0,0,0.7)',
        transform: elevated ? 'translateY(-24px)' : 'none',
        position: 'relative',
      }}
    >
      {/* notch */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 100,
          height: 28,
          background: '#000',
          borderRadius: 999,
          zIndex: 2,
        }}
      />
      <div
        style={{
          width: '100%',
          height: '100%',
          background: P.bg,
          borderRadius: 36,
          overflow: 'hidden',
          padding: '56px 18px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function MockTodayScreen() {
  return (
    <>
      <MetaLabel color={P.inkMuted}>MAANDAG · WEEK 17</MetaLabel>
      <div
        style={{
          fontSize: 40,
          fontWeight: 900,
          letterSpacing: -1.5,
          color: P.ink,
          lineHeight: 1.12,
          paddingTop: 3,
        }}
      >
        VANDAAG
      </div>

      {/* week bars */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {[P.lime, P.lime, P.gold, P.inkDim, P.inkDim, P.inkDim, P.inkDim].map((c, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              background: c,
              borderRadius: 3,
              opacity: c === P.gold ? 0.9 : 1,
            }}
          />
        ))}
      </div>

      <MiniTile
        kicker="STRENGTH · 45 MIN"
        title="LOWER · PUSH"
        accent={P.lime}
        meta="6 OEFENINGEN"
      />
      <MiniTile
        kicker="MOBILITY · 15 MIN"
        title="HIP FLOW"
        accent={P.ice}
        meta="3 BLOKKEN"
      />
      <MiniTile
        kicker="WELLNESS"
        title="HOE VOEL JE JE?"
        accent={P.gold}
        meta="1 MIN"
      />
    </>
  )
}

function MockWorkoutScreen() {
  return (
    <>
      <MetaLabel color={P.lime}>SET 3 VAN 4</MetaLabel>
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          letterSpacing: -1,
          color: P.ink,
          lineHeight: 1.12,
          paddingTop: 2,
        }}
      >
        BACK SQUAT
      </div>
      <div
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 16,
          padding: 16,
          marginTop: 6,
        }}
      >
        <MetaLabel>GEWICHT</MetaLabel>
        <div
          style={{
            fontFamily: mono,
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: -2,
            color: P.ink,
            paddingTop: 4,
            lineHeight: 1.1,
          }}
        >
          92.5
          <span
            style={{
              fontSize: 18,
              color: P.inkMuted,
              marginLeft: 6,
              letterSpacing: 0,
            }}
          >
            KG
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <StatChip label="REPS" value="8" />
        <StatChip label="RPE" value="7.5" color={P.gold} />
      </div>
      <div
        style={{
          background: P.lime,
          color: '#0A0E0F',
          borderRadius: 14,
          padding: '14px 16px',
          textAlign: 'center',
          fontFamily: mono,
          fontWeight: 900,
          letterSpacing: 2,
          fontSize: 12,
          marginTop: 'auto',
        }}
      >
        SET LOGGEN →
      </div>
    </>
  )
}

function MockRecoveryScreen() {
  return (
    <>
      <MetaLabel color={P.inkMuted}>SYSTEM STATUS</MetaLabel>
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          letterSpacing: -1,
          color: P.ink,
          lineHeight: 1.12,
          paddingTop: 2,
        }}
      >
        RECOVERY
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 72,
          fontWeight: 900,
          letterSpacing: -3,
          color: P.lime,
          lineHeight: 1.12,
          paddingTop: 6,
        }}
      >
        74
        <span style={{ fontSize: 22, color: P.inkMuted, marginLeft: 4 }}>%</span>
      </div>
      <RecoveryBar value={0.74} />
      <div style={{ marginTop: 8 }}>
        <MetaLabel color={P.lime}>UITGERUST · TRAIN HARD</MetaLabel>
      </div>
      <div
        style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <StatChip label="ACUTE" value="642" color={P.gold} />
        <StatChip label="CHRONIC" value="578" color={P.ice} />
      </div>
    </>
  )
}

function MiniTile({
  kicker,
  title,
  accent,
  meta,
}: {
  kicker: string
  title: string
  accent: string
  meta: string
}) {
  return (
    <div
      className="mbt-mini-tile"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: 12,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          background: accent,
          borderRadius: 2,
        }}
      />
      <div style={{ paddingLeft: 10 }}>
        <MetaLabel color={accent} size={9}>
          {kicker}
        </MetaLabel>
        <div
          style={{
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: -0.3,
            marginTop: 4,
            color: P.ink,
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 4 }}>
          <MetaLabel size={9}>{meta}</MetaLabel>
        </div>
      </div>
    </div>
  )
}

function StatChip({
  label,
  value,
  color = P.ink,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div
      style={{
        flex: 1,
        background: P.surfaceHi,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: 10,
      }}
    >
      <MetaLabel size={9}>{label}</MetaLabel>
      <div
        style={{
          fontFamily: mono,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: -0.5,
          color,
          lineHeight: 1.15,
          paddingTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function RecoveryBar({ value }: { value: number }) {
  const segs = 10
  const filled = Math.round(value * segs)
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
      {Array.from({ length: segs }).map((_, i) => {
        const on = i < filled
        const t = i / (segs - 1)
        const color = on
          ? t < 0.33
            ? P.danger
            : t < 0.66
              ? P.gold
              : P.lime
          : P.surfaceHi
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 10,
              background: color,
              borderRadius: 2,
            }}
          />
        )
      })}
    </div>
  )
}

/* ───────────────────────── Workload section ───────────────────────── */

function WorkloadSection() {
  return (
    <section
      id="workload"
      style={{ borderTop: `1px solid ${P.line}`, background: P.surfaceLow }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '96px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 48,
          alignItems: 'center',
        }}
      >
        <div>
          <Kicker color={P.gold}>WORKLOAD-MODEL</Kicker>
          <h2
            style={{
              fontSize: 'clamp(36px, 5vw, 60px)',
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: -1.5,
              marginTop: 16,
              paddingTop: 4,
            }}
          >
            DE <span style={{ color: P.lime }}>ACWR</span> IN JE BROEKZAK.
          </h2>
          <p
            style={{
              marginTop: 20,
              fontSize: 16,
              lineHeight: 1.6,
              color: P.inkMuted,
            }}
          >
            Elke set krijgt een sRPE-score (RPE × duur). We rekenen jouw acute
            7-daagse load af tegen je chronische 28-daagse baseline. Het resultaat:
            een <strong style={{ color: P.ink }}>ACWR-ratio</strong> — de
            gouden standaard uit sportwetenschap om overtraining te voorkomen.
          </p>
          <p
            style={{
              marginTop: 16,
              fontSize: 16,
              lineHeight: 1.6,
              color: P.inkMuted,
            }}
          >
            Sweet-spot 0.8–1.3 = groen licht. Daarboven? Rust. Daaronder? Push.
          </p>
        </div>

        <div
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 24,
            padding: 32,
          }}
        >
          <MetaLabel color={P.inkMuted}>ACWR · LAATSTE 7 DAGEN</MetaLabel>
          <div
            style={{
              fontFamily: mono,
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: -4,
              color: P.lime,
              lineHeight: 1.12,
              paddingTop: 8,
            }}
          >
            1.11
          </div>
          <div style={{ marginBottom: 20 }}>
            <MetaLabel color={P.lime}>SWEET-SPOT · GA DOOR</MetaLabel>
          </div>

          <ACWRMeter />

          <div
            style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 12,
            }}
          >
            <MiniStat label="ACUTE" value="642" color={P.gold} />
            <MiniStat label="CHRONIC" value="578" color={P.ice} />
            <MiniStat label="BALANCE" value="100%" color={P.lime} />
          </div>
        </div>
      </div>
    </section>
  )
}

function ACWRMeter() {
  return (
    <div className="mbt-acwr" style={{ position: 'relative', height: 48, marginTop: 8 }}>
      <div
        style={{
          position: 'absolute',
          inset: '18px 0',
          borderRadius: 999,
          background:
            'linear-gradient(90deg, #F87171 0%, #F4C261 25%, #BEF264 40%, #BEF264 65%, #F4C261 80%, #F87171 100%)',
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '55%',
          top: 0,
          bottom: 0,
          width: 3,
          background: P.ink,
          borderRadius: 2,
          boxShadow: '0 0 12px rgba(245,247,246,0.6)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          fontFamily: mono,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 1,
          color: P.inkMuted,
        }}
      >
        0.5
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          fontFamily: mono,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 1,
          color: P.inkMuted,
        }}
      >
        1.8
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div
      style={{
        background: P.surfaceHi,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <MetaLabel size={10}>{label}</MetaLabel>
      <div
        style={{
          fontFamily: mono,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: -0.5,
          color,
          paddingTop: 2,
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
    </div>
  )
}

/* ───────────────────────── Voor wie ───────────────────────── */

function ForWhoSection() {
  const items = [
    {
      kicker: 'SPORTERS',
      title: 'IN HERSTEL',
      body:
        'Na een blessure structureel terugbouwen met een therapeut die meekijkt — niet raden wat veilig is.',
      color: P.lime,
    },
    {
      kicker: 'ATLETEN',
      title: 'ONDER BEGELEIDING',
      body:
        'Prestatie-gerichte periodisering zonder losse spreadsheets. Jouw coach plant, jij voert uit.',
      color: P.ice,
    },
    {
      kicker: 'THERAPEUTEN',
      title: 'MET EEN PRAKTIJK',
      body:
        'Log live mee tijdens behandeling. Zie workload, pijn en adherence van al je sporters in één dashboard.',
      color: P.gold,
    },
  ]
  return (
    <section style={{ borderTop: `1px solid ${P.line}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 24px' }}>
        <Kicker color={P.purple}>VOOR WIE</Kicker>
        <h2
          style={{
            fontSize: 'clamp(40px, 6vw, 72px)',
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: -2,
            marginTop: 16,
            paddingTop: 4,
          }}
        >
          GEBOUWD VOOR DRIE MENSEN.
        </h2>
        <div
          style={{
            marginTop: 48,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((it) => (
            <div
              key={it.title}
              className="mbt-forwho"
              style={{
                background: P.surface,
                border: `1px solid ${P.line}`,
                borderRadius: 20,
                padding: 32,
                minHeight: 200,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                className="mbt-forwho-bar"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: it.color,
                }}
              />
              <MetaLabel color={it.color}>{it.kicker}</MetaLabel>
              <h3
                style={{
                  marginTop: 10,
                  fontSize: 28,
                  fontWeight: 900,
                  letterSpacing: -0.8,
                  color: P.ink,
                  lineHeight: 1.15,
                  paddingTop: 2,
                }}
              >
                {it.title}
              </h3>
              <p
                style={{
                  marginTop: 14,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: P.inkMuted,
                }}
              >
                {it.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── CTA ───────────────────────── */

function CTASection() {
  return (
    <section style={{ borderTop: `1px solid ${P.line}`, background: P.surfaceLow }}>
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '120px 24px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(500px 300px at 50% 50%, rgba(190,242,100,0.18), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 24,
            }}
          >
            <PulsingDot />
            <Kicker>TESTFLIGHT · BETA IS OPEN</Kicker>
          </div>
          <h2
            style={{
              fontSize: 'clamp(44px, 7vw, 96px)',
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: -3,
              paddingTop: 6,
            }}
          >
            KLAAR OM TE{' '}
            <span style={{ color: P.lime }}>PUSHEN</span>?
          </h2>
          <p
            style={{
              marginTop: 24,
              fontSize: 18,
              lineHeight: 1.5,
              color: P.inkMuted,
              maxWidth: 560,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Vraag toegang tot de iOS-beta. Eén mailtje — je krijgt de
            TestFlight-uitnodiging binnen een dag.
          </p>
          <div
            style={{
              marginTop: 40,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <PrimaryCTA href={requestAccess}>VRAAG TESTFLIGHT</PrimaryCTA>
            <GhostCTA href="https://movementbasedtherapy.nl">PRAKTIJK-SITE</GhostCTA>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────── Footer ───────────────────────── */

function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${P.line}`, background: P.bg }}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '32px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              overflow: 'hidden',
              border: `1px solid ${P.lineStrong}`,
            }}
          >
            <Image
              src="/mbt-gym-icon.png"
              alt="MBT-Gym"
              width={24}
              height={24}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <MetaLabel color={P.inkMuted}>
            © MOVEMENT BASED THERAPY · {new Date().getFullYear()}
          </MetaLabel>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link
            href="/login"
            style={{
              color: P.inkMuted,
              textDecoration: 'none',
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            LOGIN
          </Link>
          <a
            href="mailto:jurre@movementbasedtherapy.nl"
            style={{
              color: P.inkMuted,
              textDecoration: 'none',
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            CONTACT
          </a>
        </div>
      </div>
    </footer>
  )
}
