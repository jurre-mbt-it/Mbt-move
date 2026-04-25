'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { Dumbbell, Moon, Play, ChevronRight, CheckCircle2 } from 'lucide-react'
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
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 30 })

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

  // Programma-dagen voor deze week (oorspronkelijke planning)
  const programDaysInWeek = Object.keys(program.byWeekDay[program.currentWeek] ?? {}).map(Number).sort()

  // ── Schedule-shifting: catch-up sessies "verschuiven" het programma naar de
  // dag waarop ze daadwerkelijk afgerond zijn. We doen dit greedy:
  //   1. Sessies van deze week op volgorde van voltooi-tijdstip
  //   2. Iedere sessie consumeert een planned-day (exacte match eerst, anders
  //      de vroegste nog-onvervulde planned-day)
  //   3. Resterende planned-days = 'planned' (toekomst) of 'missed' (verleden)
  //   4. Lege dagen = 'rest'
  // Resultaat: de weergave verschuift de programma-blokken naar de werkelijke
  // trainings-dagen. Patient ziet ✓ op de dag dat 'ie daadwerkelijk getraind
  // heeft, en de oorspronkelijk geplande dag wordt 'missed' / leeg.
  type DayStatus = 'done' | 'planned' | 'missed' | 'rest'
  interface DayInfo {
    exercises: ProgramExercise[]
    status: DayStatus
    originalDay?: number  // bij catch-up: de planned-day waar dit oorspronkelijk voor was
  }
  const sessionsThisWeek = (sessionHistory ?? [])
    .filter(s => {
      const d = new Date(s.completedAt)
      const ws = new Date()
      ws.setDate(ws.getDate() - (ws.getDay() === 0 ? 6 : ws.getDay() - 1))
      ws.setHours(0, 0, 0, 0)
      return d >= ws
    })
    .map(s => {
      const d = new Date(s.completedAt)
      const dn = d.getDay() === 0 ? 7 : d.getDay()
      return { completedAt: s.completedAt, dayOfWeek: dn }
    })
    .sort((a, b) => +new Date(a.completedAt) - +new Date(b.completedAt))

  const usedPlannedDays = new Set<number>()
  const dayInfo: Record<number, DayInfo> = {}

  for (const session of sessionsThisWeek) {
    const targetDay = session.dayOfWeek
    let plannedDay: number | undefined
    if (programDaysInWeek.includes(targetDay) && !usedPlannedDays.has(targetDay)) {
      plannedDay = targetDay
    } else {
      plannedDay = programDaysInWeek.find(d => !usedPlannedDays.has(d))
    }
    if (plannedDay !== undefined) {
      usedPlannedDays.add(plannedDay)
      const exs = (program.byWeekDay[program.currentWeek]?.[plannedDay] as ProgramExercise[] | undefined) ?? []
      dayInfo[targetDay] = {
        exercises: exs,
        status: 'done',
        originalDay: plannedDay !== targetDay ? plannedDay : undefined,
      }
    } else {
      dayInfo[targetDay] = { exercises: [], status: 'done' }
    }
  }
  for (const plannedDay of programDaysInWeek) {
    if (usedPlannedDays.has(plannedDay)) continue
    if (dayInfo[plannedDay]) continue
    const exs = (program.byWeekDay[program.currentWeek]?.[plannedDay] as ProgramExercise[] | undefined) ?? []
    dayInfo[plannedDay] = {
      exercises: exs,
      status: plannedDay < todayDayNum ? 'missed' : 'planned',
    }
  }
  for (let d = 1; d <= 7; d++) {
    if (!dayInfo[d]) dayInfo[d] = { exercises: [], status: 'rest' }
  }

  const exercisesForSelectedDay = dayInfo[selectedDay].exercises
  const selectedDayInfo = dayInfo[selectedDay]
  const hasExercises = exercisesForSelectedDay.length > 0
  const isToday = selectedDay === todayDayNum

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
            const info = dayInfo[dayNum]
            const isDone = info.status === 'done'
            const isMissed = info.status === 'missed'
            const isPlanned = info.status === 'planned'
            const hasSession = info.exercises.length > 0
            const isSelected = selectedDay === dayNum
            const isTd = dayNum === todayDayNum
            const count = info.exercises.length
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(dayNum)}
                className="athletic-tap flex flex-col items-center gap-1.5 min-w-[44px] rounded-2xl p-2.5 transition-all"
                style={{
                  background: isSelected ? P.surfaceHi : P.surface,
                  border: isSelected
                    ? `2px solid ${P.lime}`
                    : isDone
                      ? `2px solid ${P.lime}`
                      : isMissed
                        ? `2px solid ${P.danger}`
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
                    color: isSelected ? P.ink : isDone ? P.lime : isMissed ? P.danger : isTd ? P.gold : P.inkMuted,
                  }}
                >
                  {DAY_SHORT[i]}
                </span>
                <div className="w-6 h-6 flex items-center justify-center">
                  {isDone
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: P.lime }} />
                    : isPlanned || isMissed || hasSession
                      ? <Dumbbell className="w-3.5 h-3.5" style={{ color: isSelected ? P.lime : isMissed ? P.danger : P.ink }} />
                      : <Moon className="w-3.5 h-3.5" style={{ color: P.inkDim }} />
                  }
                </div>
                {hasSession && (
                  <span
                    className="athletic-mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: isSelected ? P.lime : isDone ? P.lime : isMissed ? P.danger : P.inkMuted,
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
              <Kicker>
                {isToday ? 'VANDAAG' : 'DAG'}
                {selectedDayInfo.status === 'done' && ' · ✓ AFGEROND'}
                {selectedDayInfo.status === 'missed' && ' · GEMIST'}
              </Kicker>
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
              {selectedDayInfo.originalDay !== undefined && (
                <p
                  className="athletic-mono"
                  style={{ color: P.gold, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', marginTop: 4 }}
                >
                  ✓ INGEHAALD VAN {(DAY_SHORT[selectedDayInfo.originalDay - 1] ?? '?').toUpperCase()}
                </p>
              )}
            </div>
            {hasExercises && selectedDayInfo.status !== 'done' && isToday && (
              <DarkButton href="/patient/session" size="sm" variant="primary">
                <Play className="w-3 h-3 fill-current mr-1.5" /> START
              </DarkButton>
            )}
            {hasExercises && selectedDayInfo.status !== 'done' && !isToday && (
              <DarkButton
                href={`/patient/session?week=${program.currentWeek}&day=${selectedDay}`}
                size="sm"
                variant="secondary"
              >
                <Play className="w-3 h-3 fill-current mr-1.5" /> INHALEN
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

              <Link
                href={isToday ? '/patient/session' : `/patient/session?week=${program.currentWeek}&day=${selectedDay}`}
                className="athletic-tap flex items-center justify-center gap-2 py-4 rounded-2xl mt-2"
                style={{ background: isToday ? P.lime : P.gold, color: P.bg }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span
                  className="athletic-mono"
                  style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.1em' }}
                >
                  {isToday ? 'START SESSIE' : 'INHALEN'} — {exercisesForSelectedDay.length} OEFENINGEN
                </span>
              </Link>
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
