'use client'

import { use } from 'react'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'
import { trpc } from '@/lib/trpc/client'
import { notFound } from 'next/navigation'
import type { BuilderExercise } from '@/components/programs/types'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditProgramPage({ params }: Props) {
  const { id } = use(params)
  const { data: program, isLoading } = trpc.programs.get.useQuery({ id })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 h-full">
        <div className="flex gap-3 items-center">
          <div className="h-8 flex-1 bg-zinc-100 rounded animate-pulse" />
          <div className="h-8 w-24 bg-zinc-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 bg-zinc-100 rounded-xl animate-pulse" />
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
  )
}
