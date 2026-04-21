'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { ExerciseVideoModal, type ExerciseForModal } from '@/components/exercises/ExerciseVideoModal'
import { ChevronLeft, Moon, Dumbbell, Play } from 'lucide-react'
import { IconSleep } from '@/components/icons'

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH: '#BEF264', MOBILITY: '#60a5fa', PLYOMETRICS: '#f59e0b',
  CARDIO: '#f87171', STABILITY: '#a78bfa',
}

interface Props {
  params: Promise<{ dayIndex: string }>
}

export default function ScheduleDayPage({ params }: Props) {
  const { dayIndex } = use(params)
  const dayNum = parseInt(dayIndex, 10)
  const { data: schedule, isLoading } = trpc.weekSchedules.mySchedule.useQuery(undefined, { staleTime: 60_000 })

  const [modalExercise, setModalExercise] = useState<ExerciseForModal | null>(null)

  if (isLoading) {
    return (
      <div className="px-4 pt-4 space-y-4">
        <div className="h-7 w-32 bg-[#1C2425] rounded animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-[#1C2425] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const day = schedule?.days.find(d => d.dayOfWeek === dayNum)
  const dayLabel = DAY_LABELS[dayNum] ?? 'Dag'

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/patient/schedule" className="p-1.5 rounded-lg hover:bg-[#1C2425]">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold">{dayLabel}</h1>
      </div>

      {!day?.program ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl text-center"
          style={{ background: 'rgba(190,242,100,0.10)' }}>
          <Moon className="w-10 h-10 mb-3" style={{ color: 'rgba(190,242,100,0.4)' }} />
          <p className="font-bold text-base inline-flex items-center gap-2" style={{ color: '#BEF264' }}>Rustdag <IconSleep size={18} /></p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Vandaag hoef je niet te trainen. Gun je lichaam de tijd om te herstellen — dat is net zo belangrijk als trainen!
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl p-3 border" style={{ background: 'rgba(190,242,100,0.10)', borderColor: '#bbf7d0' }}>
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4" style={{ color: '#BEF264' }} />
              <h2 className="font-bold text-sm" style={{ color: '#BEF264' }}>{day.program.name}</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{day.program.exercises?.length ?? 0} oefeningen</p>
          </div>

          <div className="space-y-2">
            {(day.program.exercises ?? []).map((pe, idx) => {
              const color = CATEGORY_COLORS[pe.exercise.category] ?? '#BEF264'
              return (
                <button
                  key={pe.id}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border bg-[#141A1B] text-left active:scale-[0.98] transition-all"
                  onClick={() => setModalExercise({
                    id: pe.exercise.id,
                    name: pe.exercise.name,
                    category: pe.exercise.category,
                    videoUrl: pe.exercise.videoUrl,
                    sets: pe.sets,
                    reps: pe.reps,
                    repUnit: pe.repUnit,
                  })}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
                    style={{ background: color }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{pe.exercise.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pe.sets} sets × {pe.reps} {pe.repUnit} · {pe.restTime}s rust
                    </p>
                  </div>
                  {pe.exercise.videoUrl && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${color}20` }}
                    >
                      <Play className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Video modal */}
      <ExerciseVideoModal
        open={!!modalExercise}
        onClose={() => setModalExercise(null)}
        exercise={modalExercise}
      />
    </div>
  )
}
