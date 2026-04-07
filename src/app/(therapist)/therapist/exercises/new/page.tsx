import { ExerciseForm } from '@/components/exercises/ExerciseForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata = { title: 'Nieuwe oefening – MBT Gym' }

export default function NewExercisePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/therapist/exercises"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Terug naar bibliotheek
        </Link>
        <h1 className="text-2xl font-bold">Nieuwe oefening</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Voeg een oefening toe aan je bibliotheek
        </p>
      </div>
      <ExerciseForm mode="create" />
    </div>
  )
}
