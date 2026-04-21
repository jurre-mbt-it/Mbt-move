'use client'

import { use } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExerciseForm } from '@/components/exercises/ExerciseForm'
import { trpc } from '@/lib/trpc/client'
import { Kicker, MetaLabel, P } from '@/components/dark-ui'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditExercisePage({ params }: Props) {
  const { id } = use(params)
  const { data: exercise, isLoading } = trpc.exercises.get.useQuery({ id })

  if (isLoading) {
    return (
      <div className="max-w-2xl w-full flex flex-col gap-4">
        <div className="h-8 w-48 rounded animate-pulse" style={{ background: P.surfaceHi }} />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
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
    loadType: (exercise as Record<string, unknown>).loadType as string ?? 'BODYWEIGHT',
    isUnilateral: (exercise as Record<string, unknown>).isUnilateral as boolean ?? false,
    movementPattern: (exercise as Record<string, unknown>).movementPattern as string ?? null,
  }

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
          <Kicker>Oefening bewerken</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            {exercise.name.toUpperCase()}
          </h1>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Wijzig de details van deze oefening
          </MetaLabel>
        </div>
      </div>
      <ExerciseForm mode="edit" exerciseId={id} initialData={initialData} />
    </div>
  )
}
