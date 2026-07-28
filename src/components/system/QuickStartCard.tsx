/**
 * Quick start-kaart op het therapeut-dashboard: teller plus de eerstvolgende
 * stap die nog open staat. Verdwijnt zodra alle vijf stappen staan.
 *
 * Dit is de eigenlijke rondleiding. De welkomstmodal komt één keer voorbij, dit
 * loopt mee terwijl de therapeut werkt.
 *
 * Het dashboard wordt gedeeld met de coach-shell, maar `/therapist/quick-start`
 * bestaat alleen onder het therapeut-segment. Voor een coach rendert de kaart
 * daarom niets en draait de query ook niet.
 */
'use client'

import Link from 'next/link'
import { Kicker, P } from '@/components/dark-ui'
import { usePortal } from '@/lib/portal'
import { quickStartSteps } from '@/lib/quick-start'
import { trpc } from '@/lib/trpc/client'

export function QuickStartCard() {
  const portal = usePortal()
  const { data: progress } = trpc.onboarding.progress.useQuery(undefined, {
    enabled: !portal.isCoach,
  })

  if (portal.isCoach || !progress) return null

  const next = quickStartSteps.find((s) => !progress[s.id])
  if (!next) return null

  const done = quickStartSteps.filter((s) => progress[s.id]).length
  const total = quickStartSteps.length

  return (
    <Link
      href="/therapist/quick-start"
      className="group block rounded-2xl transition-colors"
      style={{
        background: 'rgba(232,122,85,0.07)',
        border: `1px solid ${P.brand}`,
        padding: 16,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex items-center justify-center shrink-0 rounded-lg athletic-mono"
          style={{
            width: 32,
            height: 32,
            background: P.brand,
            color: P.bg,
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {done}/{total}
        </span>
        <div className="flex-1 min-w-0">
          <Kicker style={{ color: P.brand }}>QUICK START</Kicker>
          <p style={{ color: P.ink, fontSize: 14, fontWeight: 700, marginTop: 4 }}>
            {next.title}
          </p>
          <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
            {next.why}
          </p>
        </div>
        <span
          className="athletic-mono"
          style={{
            color: P.brand,
            fontSize: 11,
            letterSpacing: '0.2em',
            fontWeight: 900,
            alignSelf: 'center',
          }}
        >
          VERDER →
        </span>
      </div>
      {/* Voortgangsbalk onderaan: laat zien dat de teller echt beweegt. */}
      <div className="mt-3 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: P.line }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${(done / total) * 100}%`, backgroundColor: P.brand }}
        />
      </div>
    </Link>
  )
}
