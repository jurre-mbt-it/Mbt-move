'use client'

import Link from 'next/link'
import { P, Kicker } from '@/components/dark-ui'
import { ExerciseForm } from '@/components/exercises/ExerciseForm'

export default function AthleteNewExercisePage() {
  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        <Link
          href="/athlete/exercises"
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
          ← TERUG NAAR OEFENINGEN
        </Link>

        {/* Hero */}
        <div>
          <Kicker>BIBLIOTHEEK · TOEVOEGEN</Kicker>
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
            NIEUWE OEFENING
          </h1>
          <p
            style={{
              marginTop: 8,
              color: P.inkMuted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Voeg een eigen oefening toe aan de bibliotheek.
          </p>
        </div>

        <ExerciseForm mode="create" />
      </div>
    </div>
  )
}
