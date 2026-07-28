/**
 * Athletic-dark design-system preview.
 * Interne route voor visuele verificatie van alle shared components.
 * Niet gelinkt vanuit de nav — gewoon `/design-system` openen.
 */
import {
  ActionTile,
  DarkButton,
  DarkHeader,
  DarkInput,
  DarkScreen,
  DarkSelect,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  PulsingDot,
  RecoveryBar,
  Tile,
  WeekProgress,
} from '@/components/dark-ui'
import { P, DATA_COLORS, CATEGORY_COLORS } from '@/lib/palette'
import { notFound } from 'next/navigation'
import { WeeklyLoadChart } from '@/components/workload/WeeklyLoadChart'

export const metadata = { title: 'Design System' }

export default function DesignSystemPage() {
  // Interne component-showcase — 404 in productie (zoals /dev/wearables).
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <DarkScreen>
      <DarkHeader title="Design System" sub="ATHLETIC-DARK" />

      <div className="max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-10">
        {/* Palette */}
        <section className="flex flex-col gap-3">
          <Kicker>Palette</Kicker>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(P).map(([name, hex]) => (
              <div key={name} className="flex flex-col gap-1">
                <div
                  className="h-14 rounded-lg"
                  style={{ backgroundColor: hex, border: `1px solid ${P.line}` }}
                />
                <span
                  className="athletic-mono text-[10px]"
                  style={{ color: P.inkMuted }}
                >
                  {name}
                </span>
                <span
                  className="athletic-mono text-[10px]"
                  style={{ color: P.inkDim, textTransform: 'none' }}
                >
                  {hex}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Dataramp — categorieën die naast elkaar leesbaar moeten zijn */}
        <section className="flex flex-col gap-3">
          <Kicker>Dataramp</Kicker>
          <div className="grid grid-cols-8 gap-2">
            {DATA_COLORS.map((hex, i) => (
              <div key={hex} className="flex flex-col gap-1">
                <div
                  className="h-10 rounded-lg"
                  style={{ backgroundColor: hex, border: `1px solid ${P.line}` }}
                />
                <span
                  className="athletic-mono text-[10px]"
                  style={{ color: P.inkDim, textTransform: 'none' }}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="flex flex-col gap-4">
          <Kicker>Typography</Kicker>
          <Display size="2xl" color={P.lime}>
            72
          </Display>
          <Display size="xl">Display XL</Display>
          <Display size="lg">Display LG</Display>
          <Display size="md">Display MD</Display>
          <MetaLabel>Meta label, uppercase mono metadata</MetaLabel>
          <Kicker>Kicker, uppercase eyebrow</Kicker>
        </section>

        {/* Metrics */}
        <section className="flex flex-col gap-3">
          <Kicker>Metric tiles</Kicker>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Load 7d" value="4.8" unit="AU" sub="Acute belasting" tint={P.lime} />
            <MetricTile label="Vorm" value="−14" sub="Productief" tint={P.ice} />
            <MetricTile label="Recovery" value="78" unit="%" tint={P.gold} />
            <MetricTile label="Pijn" value="2" unit="/10" tint={P.ink} />
          </div>
        </section>

        {/* Recovery bars */}
        <section className="flex flex-col gap-3">
          <Kicker>Recovery bars</Kicker>
          <Tile>
            <div className="flex flex-col gap-4">
              <RecoveryBar label="Herstel (acute/chronisch)" percent={82} caption="Uitgerust" />
              <RecoveryBar label="Slaap" percent={55} caption="Matig" />
              <RecoveryBar label="Training-load" percent={22} caption="Onder-belast" />
            </div>
          </Tile>
        </section>

        {/* Week progress */}
        <section className="flex flex-col gap-3">
          <Kicker>Week progress</Kicker>
          <Tile>
            <MetaLabel>Deze week</MetaLabel>
            <div className="mt-3">
              <WeekProgress
                days={['done', 'done', 'done', 'today', 'rest', 'rest', 'rest']}
              />
            </div>
          </Tile>
        </section>

        {/* Action tiles */}
        <section className="flex flex-col gap-2">
          <Kicker>Action tiles</Kicker>
          <ActionTile
            label="Start Sessie"
            sub="Vandaag: 4 oefeningen"
            href="#"
            bar={P.lime}
          />
          <ActionTile label="Wellness check" sub="Dagelijks" href="#" bar={P.ice} />
          <ActionTile label="Historiek" sub="Laatste 7 sessies" href="#" bar={P.gold} />
        </section>

        {/* Category colours */}
        <section className="flex flex-col gap-3">
          <Kicker>Category & HR-zone kleuren</Kicker>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <div
                key={cat}
                className="rounded-lg p-2 flex flex-col gap-1 items-center"
                style={{ backgroundColor: P.surface }}
              >
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="athletic-mono text-[10px]" style={{ color: P.inkMuted }}>
                  {cat}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Pulsing dot */}
        <section className="flex flex-col gap-3">
          <Kicker>Live indicators</Kicker>
          <Tile>
            <div className="flex items-center gap-3">
              <PulsingDot color={P.lime} />
              <span style={{ color: P.ink }}>Behandeling actief</span>
            </div>
          </Tile>
        </section>

        {/* Buttons */}
        <section className="flex flex-col gap-3">
          <Kicker>Buttons</Kicker>
          <div className="flex flex-wrap gap-2">
            <DarkButton variant="primary">Primary</DarkButton>
            <DarkButton variant="secondary">Secondary</DarkButton>
            <DarkButton variant="ghost">Ghost</DarkButton>
            <DarkButton variant="danger">Danger</DarkButton>
            <DarkButton variant="primary" disabled>
              Disabled
            </DarkButton>
          </div>
          <div className="flex gap-2">
            <DarkButton size="sm">Small</DarkButton>
            <DarkButton size="md">Medium</DarkButton>
            <DarkButton size="lg">Large</DarkButton>
          </div>
        </section>

        {/* Weekly load chart — orange brand variant */}
        <section className="flex flex-col gap-3">
          <Kicker>Wekelijkse belasting, voorstel</Kicker>
          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.08em' }}>
            Glass-stijl bars in brand-oranje. Huidige week feller, oudere weken vervaagd.
          </p>

          {/* Variant A — 7 weken, huidige actief */}
          <WeeklyLoadChart
            bars={[
              { label: 'W18', value: 1240, sessionCount: 3 },
              { label: 'W19', value: 1680, sessionCount: 4 },
              { label: 'W20', value: 980, sessionCount: 2 },
              { label: 'W21', value: 1420, sessionCount: 3 },
              { label: 'W22', value: 1100, sessionCount: 3 },
              { label: 'W23', value: 1560, sessionCount: 4 },
              { label: 'W24', value: 1320, sessionCount: 3 },
            ]}
            footnote="22 sessies · 8.7k sRPE"
          />

          {/* Variant B — sessies per week (zoals screenshot uit gym-app) */}
          <WeeklyLoadChart
            kicker="SESSIES · WEEK"
            bars={[
              { label: 'MA', value: 1 },
              { label: 'DI', value: 2 },
              { label: 'WO', value: 3 },
              { label: 'DO', value: 2 },
              { label: 'VR', value: 1 },
              { label: 'ZA', value: 0 },
              { label: 'ZO', value: 0 },
            ]}
            footnote="9 sessies deze week"
            activeIndex={3}
          />
        </section>

        {/* Form */}
        <section className="flex flex-col gap-3">
          <Kicker>Formulieren</Kicker>
          <Tile>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <MetaLabel>Naam</MetaLabel>
                <DarkInput placeholder="Voornaam Achternaam" />
              </div>
              <div className="flex flex-col gap-2">
                <MetaLabel>Intensiteit</MetaLabel>
                <DarkSelect defaultValue="">
                  <option value="" disabled>
                    Selecteer…
                  </option>
                  <option value="low">Laag</option>
                  <option value="med">Matig</option>
                  <option value="high">Hoog</option>
                </DarkSelect>
              </div>
              <div className="flex flex-col gap-2">
                <MetaLabel>Notities</MetaLabel>
                <DarkTextarea placeholder="Hoe voelde de sessie?" />
              </div>
            </div>
          </Tile>
        </section>
      </div>
    </DarkScreen>
  )
}
