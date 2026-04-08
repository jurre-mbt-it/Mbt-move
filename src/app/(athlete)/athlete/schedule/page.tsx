'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getWeekSchedule, DAY_NAMES, TODAY_DAY } from '@/lib/patient-constants'
import { Dumbbell, Moon, Play, ChevronRight } from 'lucide-react'

const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export default function AthleteSchedulePage() {
  const weekSchedule = getWeekSchedule()
  const [selectedDay, setSelectedDay] = useState(TODAY_DAY)

  const exercises = weekSchedule[selectedDay] ?? []
  const activeDays = Object.keys(weekSchedule).map(Number)
  const isRestDay = exercises.length === 0

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      <div className="px-4 pt-12 pb-6" style={{ background: '#1A3A3A' }}>
        <h1 className="text-white text-xl font-bold">Weekschema</h1>
        <p className="text-zinc-400 text-sm mt-1">Week 1</p>
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
                const isToday = dayNum === TODAY_DAY
                return (
                  <button
                    key={label}
                    onClick={() => setSelectedDay(dayNum)}
                    className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors"
                    style={
                      isSelected
                        ? { background: '#4ECDC4', color: 'white' }
                        : isToday
                          ? { background: '#f0fdfa', color: '#1A3A3A' }
                          : {}
                    }
                  >
                    <span className="text-xs font-medium">{label}</span>
                    {hasExercises && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: isSelected ? 'white' : '#4ECDC4' }}
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
          <h2 className="text-base font-bold">{DAY_NAMES[selectedDay - 1]}</h2>
          {!isRestDay && (
            <Link href="/athlete/session">
              <Button size="sm" className="gap-1.5 text-xs font-semibold" style={{ background: '#4ECDC4' }}>
                <Play className="w-3 h-3 fill-current" /> Start sessie
              </Button>
            </Link>
          )}
        </div>

        {isRestDay ? (
          <Card style={{ borderRadius: '14px' }}>
            <CardContent className="py-8 flex flex-col items-center gap-2">
              <Moon className="w-8 h-8 text-zinc-300" />
              <p className="text-sm font-medium text-muted-foreground">Rustdag</p>
              <p className="text-xs text-muted-foreground">Herstel is net zo belangrijk als training</p>
            </CardContent>
          </Card>
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
                      {e.sets} × {e.reps} {e.repUnit} · {e.rest}s rust
                    </p>
                  </div>
                  <Dumbbell className="w-4 h-4 text-zinc-300 shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
