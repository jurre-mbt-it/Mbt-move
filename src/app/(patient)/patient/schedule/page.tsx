'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { Dumbbell, Moon, Play, ChevronRight } from 'lucide-react'
import { IconLeaf, IconClipboard } from '@/components/icons'
import { P, Kicker, MetaLabel, Tile, DarkButton } from '@/components/dark-ui'

const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

type ProgramExercise = {
  uid: string
  exerciseId: string
  name: string
  sets: number
  reps: number
  repUnit: string
  restTime: number
  supersetGroup: string | null
}

export default function PatientSchedulePage() {
  const { data: program, isLoading } = trpc.patient.getActiveProgram.useQuery()

  const today = new Date().getDay()
  const todayDayNum = today === 0 ? 7 : today // Mon=1…Sun=7

  const [selectedDay, setSelectedDay] = useState(todayDayNum)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg, color: P.ink }}>
        <span className="athletic-mono text-[11px]" style={{ color: P.inkMuted, letterSpacing: '0.16em' }}>LADEN…</span>
      </div>
    )
  }

  if (!program) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: P.bg, color: P.ink }}>
        <div><IconClipboard size={48} /></div>
        <p style={{ color: P.ink, fontSize: 18, fontWeight: 800 }}>Geen actief programma</p>
        <p style={{ color: P.inkMuted, fontSize: 13 }}>Je therapeut heeft nog geen programma voor je aangemaakt.</p>
      </div>
    )
  }

  // Build map: dayOfWeek → exercises (using day field from program exercises)
  // The program uses day 1-7 as day-in-program-week, not day-of-calendar-week.
  // We show the week schedule based on day numbers in the current week.
  const currentWeekExercises = Object.values(program.byWeekDay[program.currentWeek] ?? {}).flat() as ProgramExercise[]

  // Get which program-days exist in current week
  const programDaysInWeek = Object.keys(program.byWeekDay[program.currentWeek] ?? {}).map(Number).sort()

  // Map program-day-index → calendar day. Day 1 = Monday, Day 2 = Tuesday, etc.
  // For simplicity we show exercises by their program day (1–7)
  const exercisesForSelectedDay = (program.byWeekDay[program.currentWeek]?.[selectedDay] as ProgramExercise[] | undefined) ?? []
  const hasExercises = exercisesForSelectedDay.length > 0
  const isToday = selectedDay === todayDayNum

  // Which calendar days have exercises (map programDay → calendarDay as same)
  const activeDays = new Set(programDaysInWeek)

  // Group exercises by superset
  const groups: { key: string; exercises: ProgramExercise[] }[] = []
  const seen = new Set<string>()
  exercisesForSelectedDay.forEach(e => {
    if (e.supersetGroup && !seen.has(e.supersetGroup)) {
      seen.add(e.supersetGroup)
      groups.push({ key: e.supersetGroup, exercises: exercisesForSelectedDay.filter(x => x.supersetGroup === e.supersetGroup) })
    } else if (!e.supersetGroup) {
      groups.push({ key: e.uid, exercises: [e] })
    }
  })

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Kicker>WEEKSCHEMA · WEEK {program.currentWeek}</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              fontSize: 'clamp(44px, 12vw, 80px)',
              paddingTop: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            SCHEMA
          </h1>
          <MetaLabel style={{ marginTop: 4, textTransform: 'none', fontWeight: 500 }}>
            {program.name}
          </MetaLabel>
        </div>

        {/* 7-day strip */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const dayNum = i + 1
            const hasSession = activeDays.has(dayNum)
            const isSelected = selectedDay === dayNum
            const isTd = dayNum === todayDayNum
            const count = (program.byWeekDay[program.currentWeek]?.[dayNum] as ProgramExercise[] | undefined)?.length ?? 0
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(dayNum)}
                className="athletic-tap flex flex-col items-center gap-1.5 min-w-[44px] rounded-2xl p-2.5 transition-all"
                style={{
                  background: isSelected ? P.surfaceHi : P.surface,
                  border: isSelected
                    ? `2px solid ${P.lime}`
                    : isTd
                      ? `2px solid ${P.gold}`
                      : `2px solid ${P.line}`,
                }}
              >
                <span
                  className="athletic-mono"
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.14em',
                    color: isSelected ? P.ink : isTd ? P.gold : P.inkMuted,
                  }}
                >
                  {DAY_SHORT[i]}
                </span>
                <div className="w-6 h-6 flex items-center justify-center">
                  {hasSession
                    ? <Dumbbell className="w-3.5 h-3.5" style={{ color: isSelected ? P.lime : hasSession ? P.ink : P.inkDim }} />
                    : <Moon className="w-3.5 h-3.5" style={{ color: P.inkDim }} />
                  }
                </div>
                {hasSession && (
                  <span
                    className="athletic-mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: isSelected ? P.lime : P.inkMuted,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Day detail */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Kicker>{isToday ? 'VANDAAG' : 'DAG'}</Kicker>
              <h2
                className="athletic-display"
                style={{
                  color: P.ink,
                  fontSize: 28,
                  lineHeight: '32px',
                  letterSpacing: '-0.03em',
                  fontWeight: 900,
                  paddingTop: 2,
                  textTransform: 'uppercase',
                }}
              >
                {DAY_NAMES[selectedDay - 1]}
              </h2>
            </div>
            {hasExercises && isToday && (
              <DarkButton href="/patient/session" size="sm" variant="primary">
                <Play className="w-3 h-3 fill-current mr-1.5" /> START
              </DarkButton>
            )}
          </div>

          {hasExercises ? (
            <div className="space-y-2">
              {groups.map(({ key, exercises }) => (
                <div key={key}>
                  {exercises.length > 1 ? (
                    <div
                      className="rounded-2xl overflow-hidden"
                      style={{ border: `2px solid ${P.ice}`, background: P.surface }}
                    >
                      <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: 'rgba(147,197,253,0.12)' }}>
                        <span
                          className="athletic-mono"
                          style={{ color: P.ice, fontSize: 10, fontWeight: 900, letterSpacing: '0.16em' }}
                        >
                          SUPERSET {exercises[0].supersetGroup}
                        </span>
                      </div>
                      <div style={{ borderTop: `1px solid ${P.line}` }}>
                        {exercises.map((e, idx) => (
                          <div key={e.uid} style={{ borderTop: idx > 0 ? `1px solid ${P.line}` : 'none' }}>
                            <ExerciseRow exercise={e} isToday={isToday} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Tile style={{ padding: 0 }}>
                      <ExerciseRow exercise={exercises[0]} isToday={isToday} />
                    </Tile>
                  )}
                </div>
              ))}

              {isToday && (
                <Link
                  href="/patient/session"
                  className="athletic-tap flex items-center justify-center gap-2 py-4 rounded-2xl mt-2"
                  style={{ background: P.lime, color: P.bg }}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span
                    className="athletic-mono"
                    style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.1em' }}
                  >
                    START SESSIE — {exercisesForSelectedDay.length} OEFENINGEN
                  </span>
                </Link>
              )}
            </div>
          ) : (
            <Tile accentBar={P.lime}>
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <div><IconLeaf size={40} /></div>
                <div>
                  <Kicker style={{ color: P.lime }}>RUSTDAG</Kicker>
                  <p style={{ color: P.ink, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
                    Vandaag is een rustdag. Goed herstel is onderdeel van je programma.
                  </p>
                </div>
                <p style={{ color: P.inkMuted, fontSize: 12 }}>
                  Lichaam en geest herstellen terwijl je rust — dat is training.
                </p>
              </div>
            </Tile>
          )}
        </div>
      </div>
    </div>
  )
}

function ExerciseRow({ exercise, isToday }: { exercise: ProgramExercise; isToday: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: P.surfaceHi }}
      >
        <Dumbbell className="w-4 h-4" style={{ color: P.inkMuted }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{exercise.name}</p>
        <p
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em', marginTop: 2 }}
        >
          {exercise.sets} × {exercise.reps} {exercise.repUnit}
          {exercise.restTime > 0 ? ` · ${exercise.restTime}s rust` : ''}
        </p>
      </div>
      {isToday && <ChevronRight className="w-4 h-4 shrink-0" style={{ color: P.inkMuted }} />}
    </div>
  )
}
