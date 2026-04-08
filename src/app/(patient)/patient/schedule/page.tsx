'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getWeekSchedule, DAY_NAMES, TODAY_DAY } from '@/lib/patient-constants'
import { Dumbbell, Moon, Play, ChevronRight } from 'lucide-react'

const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export default function PatientSchedulePage() {
  const weekSchedule = getWeekSchedule()
  const [selectedDay, setSelectedDay] = useState(TODAY_DAY)

  const selectedExercises = weekSchedule[selectedDay] ?? []
  const hasExercises = selectedExercises.length > 0
  const isToday = selectedDay === TODAY_DAY

  // Group exercises by superset
  const groups: { key: string; exercises: typeof selectedExercises }[] = []
  const seen = new Set<string>()
  selectedExercises.forEach(e => {
    if (e.supersetGroup && !seen.has(e.supersetGroup)) {
      seen.add(e.supersetGroup)
      groups.push({ key: e.supersetGroup, exercises: selectedExercises.filter(x => x.supersetGroup === e.supersetGroup) })
    } else if (!e.supersetGroup) {
      groups.push({ key: e.uid, exercises: [e] })
    }
  })

  return (
    <div className="min-h-screen pb-6" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-4" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Weekschema</h1>
        <p className="text-zinc-400 text-xs mt-0.5">Week 1 · Knie Revalidatie</p>
      </div>

      {/* 7-day strip */}
      <div className="px-4 pt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const dayNum = i + 1
            const hasSession = !!weekSchedule[dayNum]?.length
            const isSelected = selectedDay === dayNum
            const isTd = dayNum === TODAY_DAY
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(dayNum)}
                className="flex flex-col items-center gap-1.5 min-w-[44px] rounded-2xl p-2.5 transition-all"
                style={{
                  background: isSelected
                    ? '#1A3A3A'
                    : isTd
                      ? '#f0fdfa'
                      : hasSession
                        ? '#fff'
                        : '#f4f4f5',
                  border: isSelected
                    ? '2px solid #4ECDC4'
                    : isTd
                      ? '2px solid #4ECDC4'
                      : '2px solid transparent',
                  color: isSelected ? '#fff' : hasSession ? '#1A3A3A' : '#a1a1aa',
                }}
              >
                <span className="text-[11px] font-bold">{DAY_SHORT[i]}</span>
                <div className="w-6 h-6 flex items-center justify-center">
                  {hasSession
                    ? <Dumbbell className="w-3.5 h-3.5" style={{ color: isSelected ? '#4ECDC4' : '#52525b' }} />
                    : <Moon className="w-3.5 h-3.5" />
                  }
                </div>
                {hasSession && (
                  <span className="text-[10px] font-medium" style={{ color: isSelected ? '#4ECDC4' : '#71717a' }}>
                    {weekSchedule[dayNum]?.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base">{DAY_NAMES[selectedDay - 1]}{isToday ? ' · Vandaag' : ''}</h2>
          {hasExercises && isToday && (
            <Link href="/patient/session">
              <Button size="sm" className="gap-1.5 text-xs font-semibold h-8" style={{ background: '#4ECDC4' }}>
                <Play className="w-3 h-3 fill-current" /> Start sessie
              </Button>
            </Link>
          )}
        </div>

        {hasExercises ? (
          <div className="space-y-2">
            {groups.map(({ key, exercises }) => (
              <div key={key}>
                {exercises.length > 1 ? (
                  // Superset block
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: '2px solid #93c5fd', background: '#eff6ff' }}
                  >
                    <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: '#dbeafe' }}>
                      <span className="text-[10px] font-bold tracking-wider" style={{ color: '#1d4ed8' }}>
                        SUPERSET {exercises[0].supersetGroup}
                      </span>
                    </div>
                    <div className="divide-y divide-blue-100">
                      {exercises.map(e => (
                        <ExerciseRow key={e.uid} exercise={e} isToday={isToday} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <Card style={{ borderRadius: '14px' }}>
                    <CardContent className="p-0">
                      <ExerciseRow exercise={exercises[0]} isToday={isToday} />
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}

            {isToday && (
              <Link href="/patient/session">
                <div
                  className="flex items-center justify-center gap-2 py-4 rounded-2xl mt-2"
                  style={{ background: '#4ECDC4' }}
                >
                  <Play className="w-4 h-4 fill-white text-white" />
                  <span className="text-white font-bold text-sm">Start sessie — {selectedExercises.length} oefeningen</span>
                </div>
              </Link>
            )}
          </div>
        ) : (
          // Rest day
          <div
            className="rounded-2xl px-5 py-8 flex flex-col items-center text-center gap-3"
            style={{ background: '#f0fdfa', border: '2px solid #bbf7d0' }}
          >
            <div className="text-4xl">🌿</div>
            <div>
              <p className="font-bold text-base" style={{ color: '#0D6B6E' }}>Rustdag</p>
              <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#166534' }}>
                Vandaag is een rustdag. Goed herstel is onderdeel van je programma.
              </p>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Lichaam en geest herstellen terwijl je rust — dat is training.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ExerciseRow({ exercise, isToday }: { exercise: ReturnType<typeof getWeekSchedule>[number][number]; isToday: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: '#f4f4f5' }}
      >
        <Dumbbell className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{exercise.name}</p>
        <p className="text-xs text-muted-foreground">
          {exercise.sets} × {exercise.reps} {exercise.repUnit}
          {exercise.rest > 0 ? ` · ${exercise.rest}s rust` : ''}
        </p>
      </div>
      {isToday && <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />}
    </div>
  )
}
