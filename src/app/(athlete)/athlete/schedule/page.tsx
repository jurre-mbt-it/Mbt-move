'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc/client'
import { Dumbbell, Moon, Play, Plus } from 'lucide-react'

const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

type ProgramExercise = {
  uid: string
  name: string
  sets: number
  reps: number
  repUnit: string
  restTime: number
  supersetGroup: string | null
}

export default function AthleteSchedulePage() {
  const { data: program, isLoading } = trpc.patient.getActiveProgram.useQuery()

  const todayDayNum = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
  const [selectedDay, setSelectedDay] = useState(todayDayNum)

  const weekData = program?.byWeekDay as Record<number, Record<number, ProgramExercise[]>> | undefined
  const currentWeek = program?.currentWeek ?? 1
  const exercises = weekData?.[currentWeek]?.[selectedDay] ?? []
  const activeDays = Object.keys(weekData?.[currentWeek] ?? {}).map(Number)
  const isRestDay = exercises.length === 0

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Weekschema</h1>
        <p className="text-zinc-400 text-sm mt-1">Week {currentWeek}</p>
      </div>

      <div className="px-4 -mt-3 space-y-4 pb-6">
        {/* Day selector */}
        <Card style={{ borderRadius: '14px' }}>
          <CardContent className="py-3 px-2">
            <div className="flex gap-1">
              {DAY_SHORT.map((label, i) => {
                const dayNum = i + 1
                const hasExercises = activeDays.includes(dayNum)
                const isSelected = dayNum === selectedDay
                const isToday = dayNum === todayDayNum
                return (
                  <button
                    key={label}
                    onClick={() => setSelectedDay(dayNum)}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors"
                    style={
                      isSelected
                        ? { background: '#4ECDC4', color: 'white' }
                        : isToday
                          ? { background: '#f0fdfa', color: '#1A3A3A', fontWeight: 700 }
                          : {}
                    }
                  >
                    <span className="text-xs font-medium">{label}</span>
                    {isToday && !isSelected && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: '#4ECDC4' }}
                      />
                    )}
                    {hasExercises && !isToday && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: isSelected ? 'white' : '#4ECDC4' }}
                      />
                    )}
                    {isToday && isSelected && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-white"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day content */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">
            {DAY_NAMES[selectedDay - 1]}
            {selectedDay === todayDayNum && (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#4ECDC420', color: '#4ECDC4' }}>
                Vandaag
              </span>
            )}
          </h2>
          {!isRestDay && selectedDay === todayDayNum && (
            <Link href="/athlete/session">
              <Button size="sm" className="gap-1.5 text-xs font-semibold" style={{ background: '#4ECDC4' }}>
                <Play className="w-3 h-3 fill-current" /> Start sessie
              </Button>
            </Link>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Laden…</p>
        ) : isRestDay ? (
          <>
            <Card style={{ borderRadius: '14px' }}>
              <CardContent className="py-8 flex flex-col items-center gap-2">
                <Moon className="w-8 h-8 text-zinc-300" />
                <p className="text-sm font-medium text-muted-foreground">Rustdag</p>
                <p className="text-xs text-muted-foreground">Herstel is net zo belangrijk als training</p>
              </CardContent>
            </Card>
            <Link href="/athlete/workouts/new">
              <Button variant="outline" size="sm" className="mt-2 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Workout toevoegen
              </Button>
            </Link>
          </>
        ) : (
          <div className="space-y-2">
            {exercises.map((e, i) => (
              <Card key={e.uid} style={{ borderRadius: '14px' }}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ background: '#f0fdfa', color: '#4ECDC4' }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.sets} × {e.reps} {e.repUnit} · {e.restTime}s rust
                    </p>
                  </div>
                  <Dumbbell className="w-4 h-4 text-zinc-300 shrink-0" />
                </CardContent>
              </Card>
            ))}
            <Link href="/athlete/workouts/new">
              <Button variant="outline" size="sm" className="mt-1 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Andere workout toevoegen
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
