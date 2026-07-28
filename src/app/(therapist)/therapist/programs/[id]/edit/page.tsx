'use client'

import { use, useState, Suspense } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Layers } from 'lucide-react'
import { ProgramBuilder } from '@/components/programs/ProgramBuilder'
import { CardioWorkoutBuilder } from '@/components/week-planner/CardioWorkoutBuilder'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { notFound } from 'next/navigation'
import type { BuilderExercise, BuilderResource } from '@/components/programs/types'
import {
  readWorkout, summarize, structuredLoad, totalDurationSec, targetColor, isRepeat,
  type WorkoutBlock,
} from '@/lib/cardio-workout'
import { CARDIO_ACTIVITIES, type CardioActivityKey } from '@/lib/cardio-constants'
import { DarkButton, Display, Kicker, MetaLabel, P, Tile } from '@/components/dark-ui'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraParams?: any
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
  dailyTarget?: number | null
  flexibleSchedule?: boolean
  weeklyTarget?: number | null
  reviewAfterWeeks?: number | null
  type?: string
  /** Alleen bij type CARDIO: de workout als blokken (of oud plat formaat). */
  cardioParams?: unknown
}

/**
 * Cardio-programma bewerken: blokken-samenvatting + dezelfde
 * CardioWorkoutBuilder als het weekschema en de iPad. Vóór deze tak kende de
 * editpagina alleen de kracht-builder — je landde na de cardio-wizard op een
 * scherm waar de workout onzichtbaar en onbewerkbaar was.
 */
function CardioEditView({ id, program }: { id: string; program: EditProgram }) {
  const portal = usePortal()
  const utils = trpc.useUtils()
  const saveProgram = trpc.programs.save.useMutation()
  const [builderOpen, setBuilderOpen] = useState(false)

  // readWorkout leest zowel blokken als het item-dialect; het oude
  // Program-wizard-formaat (targetDurationMin/targetZone) valt op null.
  const w = readWorkout(program.cardioParams)
  const activity = (w?.activity ?? 'RUNNING') as CardioActivityKey
  const legacyBlob = !w && program.cardioParams != null

  const bars = (blocks: WorkoutBlock[]) => {
    const flat = blocks.flatMap(b =>
      isRepeat(b)
        ? b.steps.map(st => ({ id: `${b.id}-${st.id}`, w: (st.durationSec ?? 120) * b.times, c: targetColor(st.target) }))
        : [{ id: b.id, w: b.durationSec ?? 120, c: targetColor(b.target) }],
    )
    const tot = flat.reduce((s, x) => s + x.w, 0) || 1
    return (
      <div className="flex gap-px h-12 rounded-lg overflow-hidden">
        {flat.map(bar => (
          <div key={bar.id} style={{ flex: bar.w / tot, background: bar.c, opacity: 0.85 }} />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-16 space-y-5">
        <div className="flex items-center gap-3">
          <Link
            href={`${portal.base}/programs`}
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
          >
            ← TERUG
          </Link>
          <div className="flex-1 flex flex-col gap-1">
            <Kicker>
              {program.isTemplate ? 'Cardio · Template' : 'Cardio-programma'}
            </Kicker>
            <Display size="sm">{program.name.toUpperCase()}</Display>
          </div>
        </div>

        <Tile>
          <div className="space-y-3">
            <MetaLabel>Workout</MetaLabel>
            {legacyBlob ? (
              <p className="text-[12px] leading-relaxed" style={{ color: P.inkDim }}>
                Dit programma is in een ouder formaat opgeslagen. Bouw de workout
                opnieuw op in blokken, opslaan vervangt dan de oude opbouw.
              </p>
            ) : !w ? (
              <p className="text-[12px] leading-relaxed" style={{ color: P.inkDim }}>
                Nog geen blokken. Bouw de workout op uit warming-up, intervallen en cooldown.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: P.ink }}>
                    {CARDIO_ACTIVITIES[activity]?.label ?? 'Cardio'}
                  </span>
                  <span className="athletic-mono text-[11px]" style={{ color: P.inkMuted }}>
                    {Math.round(totalDurationSec(w.blocks) / 60)} min
                  </span>
                  <span className="athletic-mono text-[11px]" style={{ color: P.lime }}>
                    {structuredLoad(w.blocks)} sRPE
                  </span>
                </div>
                {bars(w.blocks)}
                <p className="text-[12px] leading-relaxed" style={{ color: P.inkDim }}>
                  {summarize(w.blocks)}
                </p>
              </>
            )}
            <DarkButton variant="secondary" className="w-full" onClick={() => setBuilderOpen(true)}>
              <Layers className="w-4 h-4 mr-1.5" />
              {w ? 'Workout bewerken' : 'Workout bouwen'}
            </DarkButton>
          </div>
        </Tile>

        <p className="text-[11px]" style={{ color: P.inkDim }}>
          {program.weeks} weken · {program.daysPerWeek} sessies per week
          {program.description ? `${program.description.split('\n')[0]}` : ''}
        </p>
      </div>

      {builderOpen && (
        <CardioWorkoutBuilder
          initial={w}
          activity={activity}
          itemName={program.name}
          saving={saveProgram.isPending}
          onClose={() => setBuilderOpen(false)}
          onSave={async (next) => {
            try {
              await saveProgram.mutateAsync({
                id,
                cardioParams: { version: 1, activity: next.activity, blocks: next.blocks },
              })
              await utils.programs.get.invalidate({ id })
              await utils.programs.list.invalidate()
              toast.success('Workout opgeslagen')
              setBuilderOpen(false)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
            }
          }}
        />
      )}
    </div>
  )
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

  // Cardio heeft geen weken/dagen met oefeningen maar één workout in blokken;
  // de kracht-builder hieronder kan daar niets mee.
  if (program.type === 'CARDIO') {
    return <CardioEditView id={id} program={program} />
  }

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
    repUnit: (pe.repUnit as BuilderExercise['repUnit']) ?? 'reps',
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraParams: (pe as any).extraParams ?? [],
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
          dailyTarget: program.dailyTarget ?? null,
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
