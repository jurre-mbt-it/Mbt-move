'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { P, Kicker } from '@/components/dark-ui'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'

export default function AthleteNewProgramPage() {
  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        <Link
          href="/athlete/dashboard"
          className="inline-flex items-center gap-1"
          style={{
            fontFamily:
              'ui-monospace, Menlo, "SF Mono", "Cascadia Code", monospace',
            fontSize: 11,
            letterSpacing: '0.16em',
            fontWeight: 800,
            color: P.inkMuted,
            textTransform: 'uppercase',
          }}
        >
          ← TERUG NAAR DASHBOARD
        </Link>

        {/* Hero */}
        <div>
          <Kicker>PROGRAMMA · NIEUW</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(44px, 12vw, 80px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            PROGRAMMA
          </h1>
        </div>

        <Suspense>
          <ProgramBuilder />
        </Suspense>
      </div>
    </div>
  )
}
