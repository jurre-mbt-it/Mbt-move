/**
 * Quick start: de eerste vijf handelingen voor een nieuwe therapeut.
 *
 * Inhoud staat in `lib/quick-start.ts`, de vinkjes komen uit
 * `onboarding.progress` (server telt wat er echt is gedaan). Bereikbaar via de
 * zijbalk, via Instellingen en via de welkomstmodal.
 *
 * Afgeronde stappen blijven staan, alleen gedimd: een therapeut die stap 3
 * later nog eens wil nalezen moet hem kunnen vinden.
 */
'use client'

import { Check } from 'lucide-react'
import {
  DarkButton,
  DarkHeader,
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  SkeletonList,
  Tile,
} from '@/components/dark-ui'
import { usePortal } from '@/lib/portal'
import { quickStartIntro, quickStartSteps } from '@/lib/quick-start'
import { trpc } from '@/lib/trpc/client'

export default function QuickStartPage() {
  const portal = usePortal()
  const { data: progress, isLoading } = trpc.onboarding.progress.useQuery()

  const done = progress ? quickStartSteps.filter((s) => progress[s.id]).length : 0
  const total = quickStartSteps.length
  const allDone = done === total

  return (
    <DarkScreen>
      <DarkHeader title="Quick start" backHref={`${portal.base}/dashboard`} />
      <div className="max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-5">
        <div>
          <Kicker>Aan de slag</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2, color: P.ink }}
          >
            ZO KOM JE OP GANG
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4, lineHeight: '20px' }}>
            {quickStartIntro.lead}
          </p>
        </div>

        {progress && (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <MetaLabel style={{ color: allDone ? P.lime : P.inkMuted }}>
                {done} VAN {total} GEDAAN
              </MetaLabel>
              {allDone && (
                <MetaLabel style={{ color: P.lime }}>ALLES STAAT</MetaLabel>
              )}
            </div>
            <div
              className="mt-2 rounded-full overflow-hidden"
              style={{ height: 4, backgroundColor: P.line }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${(done / total) * 100}%`,
                  backgroundColor: allDone ? P.lime : P.brand,
                }}
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <SkeletonList count={5} accent={P.brand} />
        ) : (
          <div className="flex flex-col gap-3 mbt-stagger">
            {quickStartSteps.map((step, i) => {
              const stepDone = progress?.[step.id] ?? false
              return (
                <Tile
                  key={step.id}
                  accentBar={stepDone ? P.lime : P.brand}
                  style={stepDone ? { opacity: 0.72 } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="shrink-0 flex items-center justify-center rounded-full transition-colors duration-300"
                      style={{
                        width: 26,
                        height: 26,
                        marginTop: 1,
                        backgroundColor: stepDone ? P.lime : P.surfaceHi,
                        color: stepDone ? P.bg : P.inkMuted,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {stepDone ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      {/* Geen doorhaling op een afgeronde stap: het groene
                          vinkje plus de gedimde tegel zeggen het al, en een
                          streep door een vette kop leest rommelig. */}
                      <h2 style={{ color: P.ink, fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>
                        {step.title}
                      </h2>
                      <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4, lineHeight: '20px' }}>
                        {step.why}
                      </p>

                      <ul className="mt-3 space-y-1.5">
                        {step.body.map((line, j) => (
                          <li
                            key={j}
                            className="flex items-start gap-2"
                            style={{ color: P.inkMuted, fontSize: 13, lineHeight: '20px' }}
                          >
                            <span style={{ color: stepDone ? P.lime : P.brand, marginTop: 1 }}>•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-4">
                        <DarkButton
                          href={`${portal.base}${step.path}`}
                          size="sm"
                          variant={stepDone ? 'secondary' : 'primary'}
                        >
                          {stepDone ? 'NOG EENS BEKIJKEN' : step.cta.toUpperCase()}
                        </DarkButton>
                      </div>
                    </div>
                  </div>
                </Tile>
              )
            })}
          </div>
        )}

        <p style={{ color: P.inkDim, fontSize: 12, lineHeight: '18px' }}>
          Loop je ergens vast of mis je iets? Laat het weten, dan passen we het aan.
        </p>
      </div>
    </DarkScreen>
  )
}
