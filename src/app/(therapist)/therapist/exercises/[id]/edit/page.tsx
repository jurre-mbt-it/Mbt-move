'use client'

import { use } from 'react'
import { ExerciseForm } from '@/components/exercises/ExerciseForm'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditExercisePage({ params }: Props) {
  const { id } = use(params)
  const { data: exercise, isLoading } = trpc.exercises.get.useQuery({ id })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-zinc-100 rounded animate-pulse" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!exercise) return notFound()

  const initialData = {
    name: exercise.name,
    description: exercise.description ?? '',
    category: exercise.category as string,
    bodyRegion: exercise.bodyRegion as string[],
    difficulty: exercise.difficulty as string,
    mediaType: (exercise.mediaType ?? null) as 'UPLOAD' | 'YOUTUBE' | 'VIMEO' | null,
    videoUrl: exercise.videoUrl ?? '',
    instructions: exercise.instructions,
    tips: exercise.tips,
    tags: exercise.tags,
    isPublic: exercise.isPublic,
    muscleLoads: exercise.muscleLoads as Record<string, number>,
    easierVariantId: exercise.easierVariantId ?? null,
    harderVariantId: exercise.harderVariantId ?? null,
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
