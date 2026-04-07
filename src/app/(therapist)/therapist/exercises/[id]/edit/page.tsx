import { ExerciseForm } from '@/components/exercises/ExerciseForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { MOCK_EXERCISES } from '@/lib/exercise-constants'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Oefening bewerken – MBT Move' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditExercisePage({ params }: Props) {
  const { id } = await params
  const exercise = MOCK_EXERCISES.find(e => e.id === id)
  if (!exercise) notFound()

  const initialData = {
    name: exercise.name,
    description: exercise.description ?? '',
    category: exercise.category,
    bodyRegion: exercise.bodyRegion as string[],
    difficulty: exercise.difficulty,
    mediaType: (exercise.mediaType ?? null) as 'UPLOAD' | 'YOUTUBE' | 'VIMEO' | null,
    videoUrl: exercise.videoUrl ?? '',
    instructions: exercise.instructions,
    tips: [],
    tags: exercise.tags,
    isPublic: exercise.isPublic,
    muscleLoads: exercise.muscleLoads as Record<string, number>,
    easierVariantId: null,
    harderVariantId: null,
  }

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
        <h1 className="text-2xl font-bold">{exercise.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">Oefening bewerken</p>
      </div>
      <ExerciseForm mode="edit" exerciseId={id} initialData={initialData} />
    </div>
  )
}
