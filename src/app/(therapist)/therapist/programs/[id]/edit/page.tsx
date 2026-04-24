'use client'

import { use, Suspense } from 'react'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'
import { trpc } from '@/lib/trpc/client'
import { notFound } from 'next/navigation'
import type { BuilderExercise } from '@/components/programs/types'
import { P } from '@/components/dark-ui'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditProgramPage({ params }: Props) {
  const { id } = use(params)
  const { data: program, isLoading } = trpc.programs.get.useQuery({ id })

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-5xl mx-auto px-4 pt-10 pb-8">
          <div className="flex flex-col gap-4 h-full">
            <div className="flex gap-3 items-center">
              <div
                className="h-8 flex-1 rounded animate-pulse"
                style={{ background: P.surfaceHi }}
              />
              <div
                className="h-8 w-24 rounded animate-pulse"
                style={{ background: P.surfaceHi }}
              />
            </div>
            <div
              className="flex-1 min-h-[320px] rounded-xl animate-pulse"
              style={{ background: P.surfaceHi }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (!program) return notFound()

  const exercises: BuilderExercise[] = program.exercises.map(pe => ({
    uid: pe.id,
    exerciseId: pe.exerciseId,
    name: pe.exercise.name,
    category: pe.exercise.category,
    difficulty: pe.exercise.difficulty,
    muscleLoads: Object.fromEntries(pe.exercise.muscleLoads.map(ml => [ml.muscle, ml.load])),
    easierVariantId: pe.exercise.easierVariantId ?? null,
    harderVariantId: pe.exercise.harderVariantId ?? null,
    videoUrl: pe.exercise.videoUrl ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trackOneRepMax: (pe.exercise as any).trackOneRepMax ?? false,
    sets: pe.sets,
    reps: pe.reps,
    repUnit: (pe.repUnit as 'reps' | 'sec' | 'min') ?? 'reps',
    rest: pe.restTime,
    extraParams: [],
    supersetGroup: pe.supersetGroup ?? null,
    supersetOrder: pe.supersetOrder,
    selected: false,
    day: pe.day,
    week: pe.week,
  }))

  return (
    <Suspense>
      <ProgramBuilder
        programId={id}
        initialState={{
          name: program.name,
          description: program.description ?? '',
          weeks: program.weeks,
          daysPerWeek: program.daysPerWeek,
          isTemplate: program.isTemplate,
          patientId: program.patientId ?? null,
          exercises,
        }}
      />
    </Suspense>
  )
}
