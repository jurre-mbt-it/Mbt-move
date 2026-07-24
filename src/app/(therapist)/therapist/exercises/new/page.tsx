'use client'

// Geen metadata-export: usePortal() (coach/therapeut-gedeelde links) maakt dit
// een client-pagina. Een server component die deze hook aanroept crasht met
// een 500 op elke request — dat was precies de productie-bug op deze route.
import Link from 'next/link'
import { usePortal } from '@/lib/portal'
import { ExerciseForm } from '@/components/exercises/ExerciseForm'
import { Kicker, MetaLabel, P } from '@/components/dark-ui'

export default function NewExercisePage() {
  const portal = usePortal()
  return (
    <div className="max-w-2xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${portal.base}/exercises`}
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← BIBLIOTHEEK
        </Link>
        <div className="flex flex-col gap-1">
          <Kicker>Bibliotheek</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            NIEUWE OEFENING
          </h1>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Voeg een oefening toe aan je bibliotheek
          </MetaLabel>
        </div>
      </div>
      <ExerciseForm mode="create" />
    </div>
  )
}
