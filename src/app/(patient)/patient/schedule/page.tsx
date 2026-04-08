'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { CalendarDays, Dumbbell, Moon } from 'lucide-react'

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

// 0=Mon in our system; JS getDay() is 0=Sun
function getTodayIndex() {
  const jsDay = new Date().getDay() // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1 // convert to 0=Mon
}

export default function PatientSchedulePage() {
  const { data: schedule, isLoading } = trpc.weekSchedules.mySchedule.useQuery(undefined, { staleTime: 60_000 })
  const today = getTodayIndex()

  if (isLoading) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="h-7 w-40 bg-zinc-100 rounded animate-pulse" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-14 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-zinc-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="px-4 pt-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <CalendarDays className="w-12 h-12 text-zinc-200 mb-4" />
        <h2 className="font-bold text-lg">Nog geen weekschema</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Je therapeut heeft nog geen weekschema voor je aangemaakt. Neem contact op als je vragen hebt.
        </p>
      </div>
    )
  }

  const todayData = schedule.days.find(d => d.dayOfWeek === today)

  return (
    <div className="px-4 pt-6 pb-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold">{schedule.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Jouw weekschema</p>
      </div>

      {/* 7-day strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = schedule.days.find(d => d.dayOfWeek === i)
          const hasProgram = !!day?.program
          const isToday = i === today
          return (
            <Link
              key={i}
              href={`/patient/schedule/${i}`}
              className="flex flex-col items-center gap-1 min-w-[44px] rounded-xl p-2 transition-all"
              style={{
                background: isToday ? '#3ECF6A' : hasProgram ? '#f0fdf4' : '#f4f4f5',
                color: isToday ? '#fff' : hasProgram ? '#15803d' : '#a1a1aa',
              }}
            >
              <span className="text-[11px] font-semibold">{DAY_SHORT[i]}</span>
              <div className="w-5 h-5 flex items-center justify-center">
                {hasProgram
                  ? <Dumbbell className="w-3.5 h-3.5" />
                  : <Moon className="w-3.5 h-3.5" />
                }
              </div>
            </Link>
          )
        })}
      </div>

      {/* Today's program */}
      <div>
        <h2 className="font-semibold text-sm mb-2">
          Vandaag — {DAY_LABELS[today]}
        </h2>
        {todayData?.program ? (
          <ProgramDayCard program={todayData.program} />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 rounded-xl text-center"
            style={{ background: '#f0fdf4' }}>
            <Moon className="w-8 h-8 mb-2" style={{ color: '#86efac' }} />
            <p className="font-semibold text-sm" style={{ color: '#15803d' }}>Rustdag 😴</p>
            <p className="text-xs text-muted-foreground mt-1">Neem even de tijd om te herstellen. Goed gedaan!</p>
          </div>
        )}
      </div>

      {/* Rest of week */}
      <div>
        <h2 className="font-semibold text-sm mb-2">Deze week</h2>
        <div className="space-y-2">
          {schedule.days
            .filter(d => d.dayOfWeek !== today)
            .map(d => (
              <Link
                key={d.id}
                href={`/patient/schedule/${d.dayOfWeek}`}
                className="flex items-center gap-3 p-3 rounded-xl border bg-white hover:shadow-sm transition-shadow"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs"
                  style={{
                    background: d.program ? '#f0fdf4' : '#f4f4f5',
                    color: d.program ? '#15803d' : '#a1a1aa',
                  }}
                >
                  {DAY_SHORT[d.dayOfWeek]}
                </div>
                <div className="flex-1 min-w-0">
                  {d.program ? (
                    <>
                      <p className="font-semibold text-sm truncate">{d.program.name}</p>
                      <p className="text-xs text-muted-foreground">{d.program.exercises?.length ?? 0} oefeningen</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Rustdag</p>
                  )}
                </div>
                {d.program && (
                  <Dumbbell className="w-4 h-4 text-zinc-300 shrink-0" />
                )}
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}

type ProgramWithExercises = {
  id: string
  name: string
  exercises?: {
    id: string
    sets: number
    reps: number
    repUnit: string
    restTime: number
    exercise: { id: string; name: string; category: string }
  }[]
}

function ProgramDayCard({ program }: { program: ProgramWithExercises }) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b" style={{ background: '#f0fdf4' }}>
        <h3 className="font-bold text-sm" style={{ color: '#15803d' }}>{program.name}</h3>
        <p className="text-xs text-muted-foreground">{program.exercises?.length ?? 0} oefeningen</p>
      </div>
      <div className="divide-y">
        {(program.exercises ?? []).slice(0, 5).map(pe => (
          <div key={pe.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#3ECF6A' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pe.exercise.name}</p>
              <p className="text-xs text-muted-foreground">{pe.sets}×{pe.reps} {pe.repUnit} · {pe.restTime}s rust</p>
            </div>
          </div>
        ))}
        {(program.exercises?.length ?? 0) > 5 && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            +{(program.exercises?.length ?? 0) - 5} meer oefeningen
          </div>
        )}
      </div>
    </div>
  )
}
