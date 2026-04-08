'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MOCK_PATIENT } from '@/lib/patient-constants'
import { buildMockProgram, DAY_LABELS, MOCK_PROGRAMS } from '@/lib/program-constants'
import { ChevronLeft, Play, CheckCircle2, Lock } from 'lucide-react'

const WEEK_COUNT = 4

export default function PatientProgramPage() {
  const [activeWeek, setActiveWeek] = useState(1)

  const program = MOCK_PROGRAMS.find(p => p.id === MOCK_PATIENT.programId)!
  const allExercises = buildMockProgram()

  // Get days that have exercises this week
  const daysWithExercises = [...new Set(
    allExercises.filter(e => e.week === activeWeek).map(e => e.day)
  )].sort()

  const completedDays = activeWeek === 1 ? [1, 2] : [] // mock: week 1 has 2 done days
  const isCurrentWeek = activeWeek === 1
  const isFutureWeek = activeWeek > 1

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: '#1A3A3A' }}>
        <Link href="/patient/dashboard" className="inline-flex items-center gap-1 text-zinc-400 text-sm mb-3">
          <ChevronLeft className="w-4 h-4" /> Terug
        </Link>
        <h1 className="text-white text-xl font-bold">{program.name}</h1>
        <p className="text-zinc-400 text-xs mt-1">{program.weeks} weken · {program.daysPerWeek}×/week</p>

        {/* Week tabs */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
          {Array.from({ length: WEEK_COUNT }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              onClick={() => setActiveWeek(w)}
              className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={
                activeWeek === w
                  ? { background: '#4ECDC4', color: 'white' }
                  : { background: 'rgba(255,255,255,0.1)', color: '#a1a1aa' }
              }
            >
              Week {w}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {isFutureWeek && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: '#fef9c3', color: '#a16207' }}>
            <Lock className="w-4 h-4 shrink-0" />
            Week {activeWeek} is beschikbaar na het voltooien van week {activeWeek - 1}.
          </div>
        )}

        {daysWithExercises.length === 0 && !isFutureWeek && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground text-sm">Geen oefeningen gepland voor deze week</p>
          </div>
        )}

        {daysWithExercises.map(dayNum => {
          const dayExercises = allExercises.filter(e => e.week === activeWeek && e.day === dayNum)
          const isDone = completedDays.includes(dayNum)
          const isToday = isCurrentWeek && dayNum === 1
          const dayLabel = DAY_LABELS[dayNum - 1]

          return (
            <Card key={dayNum} style={{ borderRadius: '14px', opacity: isFutureWeek ? 0.5 : 1 }}>
              <CardContent className="px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={
                        isDone ? { background: '#4ECDC4', color: 'white' }
                          : isToday ? { background: '#1A3A3A', color: 'white' }
                            : { background: '#f4f4f5', color: '#52525b' }
                      }
                    >
                      {isDone ? '✓' : dayLabel.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{dayLabel}</p>
                      <p className="text-xs text-muted-foreground">{dayExercises.length} oefeningen</p>
                    </div>
                  </div>

                  {isDone ? (
                    <Badge className="text-xs gap-1" style={{ background: '#f0fdfa', color: '#0D6B6E', border: 'none' }}>
                      <CheckCircle2 className="w-3 h-3" /> Afgerond
                    </Badge>
                  ) : isToday ? (
                    <Link href="/patient/session">
                      <Button size="sm" className="gap-1.5 text-xs h-7" style={{ background: '#4ECDC4' }}>
                        <Play className="w-3 h-3 fill-current" /> Start
                      </Button>
                    </Link>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {dayExercises.map(e => (
                    <div key={e.uid} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isDone ? '#4ECDC4' : '#d4d4d8' }} />
                      <span className="text-sm flex-1 truncate">{e.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{e.sets}×{e.reps}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
