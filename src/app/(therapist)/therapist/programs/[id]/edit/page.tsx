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

// Cast naar shallow type; tRPC inference is te diep voor TS (TS2589).
type EditExercise = {
  id: string
  exerciseId: string
  sets: number
  reps: number
  repUnit: string | null
  restTime: number
  supersetGroup: string | null
  supersetOrder: number
  day: number
  week: number
  exercise: {
    name: string
    category: string
    difficulty: string
    easierVariantId: string | null
    harderVariantId: string | null
    videoUrl: string | null
    muscleLoads: { muscle: string; load: number }[]
  }
}
type EditProgram = {
  name: string
  description: string | null
  weeks: number
  daysPerWeek: number
  isTemplate: boolean
  patientId: string | null
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
  updatedAt: string | Date
  exercises: EditExercise[]
}

export default function EditProgramPage({ params }: Props) {
  const { id } = use(params)
  const programQuery = trpc.programs.get.useQuery({ id })
  const program = programQuery.data as EditProgram | undefined
  const isLoading = programQuery.isLoading

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

  // Key op updatedAt zodat de builder remount wanneer onderliggende data
  // verandert (bv. via programs.changeDay vanuit week-planner).
  const builderKey = typeof program.updatedAt === 'string'
    ? program.updatedAt
    : new Date(program.updatedAt).toISOString()

  return (
    <Suspense>
      <ProgramBuilder
        key={builderKey}
        programId={id}
        initialStatus={program.status}
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
