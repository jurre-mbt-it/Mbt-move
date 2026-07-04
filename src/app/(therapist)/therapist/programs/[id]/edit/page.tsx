'use client'

import { use, Suspense } from 'react'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'
import { trpc } from '@/lib/trpc/client'
import { notFound } from 'next/navigation'
import type { BuilderExercise, BuilderResource } from '@/components/programs/types'
import { P } from '@/components/dark-ui'

interface Props {
  params: Promise<{ id: string }>
}

// Cast naar shallow type; tRPC inference is te diep voor TS (TS2589).
type EditExercise = {
  id: string
  exerciseId: string
  sets: number
  setsMax?: number | null
  reps: number
  repsMax?: number | null
  repUnit: string | null
  restTime: number
  supersetGroup: string | null
  supersetOrder: number
  notes: string | null
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
  resources?: {
    id: string
    resourceId: string
    week: number
    day: number
    resource: {
      title: string
      format: 'VIDEO' | 'PDF'
      videoUrl: string | null
      thumbnailUrl: string | null
    }
  }[]
  // Builder-toggles — moeten meekomen van server anders worden ze bij elke
  // remount (na autosave) terug naar default false gezet.
  tendinopathyMode?: boolean
  trackOneRepMax?: boolean
  flexibleSchedule?: boolean
  weeklyTarget?: number | null
  reviewAfterWeeks?: number | null
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setsMax: (pe as any).setsMax ?? null,
    reps: pe.reps,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repsMax: (pe as any).repsMax ?? null,
    repUnit: (pe.repUnit as 'reps' | 'sec' | 'min') ?? 'reps',
    notes: pe.notes ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intensityType: ((pe as any).intensityType as BuilderExercise['intensityType']) ?? 'NONE',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intensityMin: (pe as any).intensityMin ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intensityMax: (pe as any).intensityMax ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intensityText: (pe as any).intensityText ?? null,
    rest: pe.restTime,
    extraParams: [],
    supersetGroup: pe.supersetGroup ?? null,
    supersetOrder: pe.supersetOrder,
    selected: false,
    day: pe.day,
    week: pe.week,
  }))

  const resources: BuilderResource[] = (program.resources ?? []).map(pr => ({
    uid: pr.id,
    resourceId: pr.resourceId,
    title: pr.resource.title,
    format: pr.resource.format,
    videoUrl: pr.resource.videoUrl ?? null,
    thumbnailUrl: pr.resource.thumbnailUrl ?? null,
    day: pr.day,
    week: pr.week,
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
          tendinopathyMode: program.tendinopathyMode ?? false,
          trackOneRepMax: program.trackOneRepMax ?? false,
          flexibleSchedule: program.flexibleSchedule ?? false,
          weeklyTarget: program.weeklyTarget ?? null,
          reviewAfterWeeks: program.reviewAfterWeeks ?? null,
          exercises,
          resources,
        }}
      />
    </Suspense>
  )
}
