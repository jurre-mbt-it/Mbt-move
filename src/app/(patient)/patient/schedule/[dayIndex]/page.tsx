'use client'

import { use } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { ChevronLeft, Moon, Dumbbell } from 'lucide-react'

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH: '#3ECF6A', MOBILITY: '#60a5fa', PLYOMETRICS: '#f59e0b',
  CARDIO: '#f87171', STABILITY: '#a78bfa',
}

interface Props {
  params: Promise<{ dayIndex: string }>
}

export default function ScheduleDayPage({ params }: Props) {
  const { dayIndex } = use(params)
  const dayNum = parseInt(dayIndex, 10)
  const { data: schedule, isLoading } = trpc.weekSchedules.mySchedule.useQuery(undefined, { staleTime: 60_000 })

  if (isLoading) {
    return (
      <div className="px-4 pt-4 space-y-4">
        <div className="h-7 w-32 bg-zinc-100 rounded animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-zinc-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const day = schedule?.days.find(d => d.dayOfWeek === dayNum)
  const dayLabel = DAY_LABELS[dayNum] ?? 'Dag'

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/patient/schedule" className="p-1.5 rounded-lg hover:bg-zinc-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold">{dayLabel}</h1>
      </div>

      {!day?.program ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl text-center"
          style={{ background: '#f0fdf4' }}>
          <Moon className="w-10 h-10 mb-3" style={{ color: '#86efac' }} />
          <p className="font-bold text-base" style={{ color: '#15803d' }}>Rustdag 😴</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Vandaag hoef je niet te trainen. Gun je lichaam de tijd om te herstellen — dat is net zo belangrijk als trainen!
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl p-3 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4" style={{ color: '#15803d' }} />
              <h2 className="font-bold text-sm" style={{ color: '#15803d' }}>{day.program.name}</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{day.program.exercises?.length ?? 0} oefeningen</p>
          </div>

          <div className="space-y-2">
            {(day.program.exercises ?? []).map((pe, idx) => {
              const color = CATEGORY_COLORS[pe.exercise.category] ?? '#3ECF6A'
              return (
                <div key={pe.id} className="flex items-center gap-3 p-3 rounded-xl border bg-white">
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
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
