'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc/client'
import { DAY_LABELS } from '@/lib/program-constants'
import { ExerciseVideoModal, type ExerciseForModal } from '@/components/exercises/ExerciseVideoModal'
import { ChevronLeft, Play, CheckCircle2, Lock } from 'lucide-react'
import { IconClipboard } from '@/components/icons'

// Coaching cues by exerciseId (static — based on demo exercises)
const COACHING_CUES: Record<string, string[]> = {
  '1': ['Houd de romp recht, borst omhoog', 'Knie over de tweede teen', 'Druk door de hiel van het voorste been'],
  '2': ['Gecontroleerde val — niet laten crashen', 'Core strak tijdens de hele beweging', 'Krachtige push terug naar startpositie'],
  '3': ['Beide zitknobbels in contact met de grond', 'Roteer vanuit de heup, niet de romp'],
  '4': ['Staand been licht gebogen', 'Hinge vanuit de heup — niet buigen vanuit de rug', 'Houd het zwevende been in lijn met de romp'],
  '5': ['Soft landing — knieën veren mee', 'Land op het midden van de voet', 'Spring omhoog en iets naar voren'],
  '6': ['Elleboog gefixeerd tegen het lichaam', 'Langzame gecontroleerde beweging'],
}

const VARIANTS: Record<string, { easier?: string; harder?: string }> = {
  '1': { easier: 'Goblet Squat', harder: 'Bulgarian Split Squat + kettlebell' },
  '2': { easier: 'Lying Leg Curl machine', harder: 'Nordic met weerstandsband' },
  '4': { easier: 'Romanian Deadlift (bilateral)', harder: 'Single Leg DL + kettlebell' },
  '5': { easier: 'Step-up op box', harder: 'Box Jump + squat hold landing' },
  '6': { easier: 'Interne rotatie met band', harder: 'Externe rotatie met dumbbell' },
}

export default function PatientProgramPage() {
  const { data: program, isLoading } = trpc.patient.getActiveProgram.useQuery(undefined, { staleTime: 60_000 })
  const [activeWeek, setActiveWeek] = useState(1)
  const [modalExercise, setModalExercise] = useState<ExerciseForModal | null>(null)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFAFA' }}>
        <p className="text-muted-foreground text-sm">Laden…</p>
      </div>
    )
  }

  if (!program) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#FAFAFA' }}>
        <div><IconClipboard size={48} /></div>
        <p className="font-semibold text-lg">Geen actief programma</p>
        <p className="text-muted-foreground text-sm">Je therapeut heeft nog geen programma voor je aangemaakt.</p>
        <Link href="/patient/dashboard">
          <Button variant="outline">Terug naar dashboard</Button>
        </Link>
      </div>
    )
  }

  const weekData = program.byWeekDay as Record<number, Record<number, typeof program.exercises>>
  const daysWithExercises = Object.keys(weekData[activeWeek] ?? {}).map(Number).sort()

  const isCurrentWeek = activeWeek === program.currentWeek
  const isFutureWeek = activeWeek > program.currentWeek

  function openExerciseModal(e: typeof program.exercises[0]) {
    setModalExercise({
      id: e.exerciseId,
      name: e.name,
      category: e.category,
      difficulty: e.difficulty,
      videoUrl: e.videoUrl,
      muscleLoads: e.muscleLoads,
      sets: e.sets,
      reps: e.reps,
      repUnit: e.repUnit,
      coachingCues: COACHING_CUES[e.exerciseId] ?? [],
      easierVariant: VARIANTS[e.exerciseId]?.easier ?? null,
      harderVariant: VARIANTS[e.exerciseId]?.harder ?? null,
    })
  }

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
          {Array.from({ length: program.weeks }, (_, i) => i + 1).map(w => (
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
          const dayExercises = weekData[activeWeek]?.[dayNum] ?? []
          const isToday = isCurrentWeek && dayNum === program.currentDay
          const isPast = isCurrentWeek && dayNum < program.currentDay
          const dayLabel = DAY_LABELS[dayNum - 1] ?? `Dag ${dayNum}`

          return (
            <Card key={dayNum} style={{ borderRadius: '14px', opacity: isFutureWeek ? 0.5 : 1 }}>
              <CardContent className="px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={
                        isPast ? { background: '#4ECDC4', color: 'white' }
                          : isToday ? { background: '#1A3A3A', color: 'white' }
                            : { background: '#f4f4f5', color: '#52525b' }
                      }
                    >
                      {isPast ? '✓' : dayLabel.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{dayLabel}</p>
                      <p className="text-xs text-muted-foreground">{dayExercises.length} oefeningen</p>
                    </div>
                  </div>

                  {isPast ? (
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

                <div className="space-y-1.5">
                  {dayExercises.map(e => (
                    <button
                      key={e.uid}
                      className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-zinc-50 active:scale-[0.98] transition-all group"
                      onClick={() => openExerciseModal(e)}
                      disabled={isFutureWeek}
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isPast ? '#4ECDC4' : '#d4d4d8' }} />
                      <span className="text-sm flex-1 truncate">{e.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{e.sets}×{e.reps}</span>
                      {e.videoUrl && (
                        <Play className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#4ECDC4' }} />
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Video modal */}
      <ExerciseVideoModal
        open={!!modalExercise}
        onClose={() => setModalExercise(null)}
        exercise={modalExercise}
      />
    </div>
  )
}
