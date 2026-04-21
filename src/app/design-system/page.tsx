/**
 * Athletic-dark design-system preview.
 * Interne route voor visuele verificatie van alle shared components.
 * Niet gelinkt vanuit de nav — gewoon `/design-system` openen.
 */
import {
  ActionTile,
  CATEGORY_COLORS,
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
  P,
  PulsingDot,
  RecoveryBar,
  Tile,
  WeekProgress,
} from '@/components/dark-ui'

export const metadata = { title: 'Design System' }

export default function DesignSystemPage() {
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
                  {String(hex)}
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
          <MetaLabel>Meta label — uppercase mono metadata</MetaLabel>
          <Kicker>Kicker — uppercase eyebrow</Kicker>
        </section>

        {/* Metrics */}
        <section className="flex flex-col gap-3">
          <Kicker>Metric tiles</Kicker>
          <div className="grid grid-cols-2 gap-3">
            <MetricTile label="Load 7d" value="4.8" unit="AU" sub="Acute belasting" tint={P.lime} />
            <MetricTile label="ACWR" value="1.12" sub="Sweet-spot" tint={P.ice} />
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
