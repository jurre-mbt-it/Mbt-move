'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ExerciseForm } from '@/components/exercises/ExerciseForm'

export default function AthleteNewExercisePage() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-2xl mx-auto">
      <div>
        <Link
          href="/athlete/exercises"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Terug naar oefeningen
        </Link>
        <h1 className="text-2xl font-bold">Nieuwe oefening</h1>
        <p className="text-muted-foreground text-sm mt-1">Voeg een eigen oefening toe aan de bibliotheek</p>
      </div>
      <ExerciseForm mode="create" />
    </div>
  )
}
