import Link from 'next/link'
import { ExerciseForm } from '@/components/exercises/ExerciseForm'
import { Kicker, MetaLabel, P } from '@/components/dark-ui'

export const metadata = { title: 'Nieuwe oefening – MBT Gym' }

export default function NewExercisePage() {
  return (
    <div className="max-w-2xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/therapist/exercises"
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
