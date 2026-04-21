'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkButton,
} from '@/components/dark-ui'

const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

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
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Kicker>WEEKSCHEMA · WEEK {currentWeek}</Kicker>
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
            WEEKSCHEMA
          </h1>
        </div>

        {/* Day selector */}
        <Tile>
          <div className="flex gap-1">
            {DAY_SHORT.map((label, i) => {
              const dayNum = i + 1
              const hasExercises = activeDays.includes(dayNum)
              const isSelected = dayNum === selectedDay
              const isToday = dayNum === todayDayNum
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedDay(dayNum)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg transition-colors"
                  style={{
                    background: isSelected ? P.lime : P.surfaceLow,
                    color: isSelected ? P.bg : P.ink,
                  }}
                >
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: isSelected ? P.bg : isToday ? P.gold : P.inkMuted,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:
                        hasExercises
                          ? isSelected ? P.bg : P.lime
                          : isToday && !isSelected
                            ? P.gold
                            : 'transparent',
                    }}
                  />
                </button>
              )
            })}
          </div>
        </Tile>

        {/* Day title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2
              style={{
                color: P.ink,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
              }}
            >
              {DAY_NAMES[selectedDay - 1]}
            </h2>
            {selectedDay === todayDayNum && (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: 'rgba(190,242,100,0.12)',
                  border: `1px solid ${P.lime}`,
                  color: P.lime,
                  fontFamily: mono,
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                VANDAAG
              </span>
            )}
          </div>
          {!isRestDay && selectedDay === todayDayNum && (
            <DarkButton href="/athlete/session" variant="primary" size="sm">
              START SESSIE →
            </DarkButton>
          )}
        </div>

        {isLoading ? (
          <Tile style={{ padding: 24, textAlign: 'center' }}>
            <MetaLabel>LADEN…</MetaLabel>
          </Tile>
        ) : isRestDay ? (
          <>
            <Tile style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌙</div>
              <Kicker>RUSTDAG</Kicker>
              <p
                style={{
                  marginTop: 10,
                  color: P.inkMuted,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Herstel is net zo belangrijk als training.
              </p>
            </Tile>
            <DarkButton href="/athlete/workouts/new" variant="secondary" className="w-full">
              + WORKOUT TOEVOEGEN
            </DarkButton>
          </>
        ) : (
          <div className="space-y-2">
            {exercises.map((e, i) => (
              <div
                key={e.uid}
                className="flex items-center gap-3 rounded-xl"
                style={{
                  background: P.surface,
                  padding: '12px 14px',
                  borderLeft: `3px solid ${P.lime}`,
                  border: `1px solid ${P.line}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: P.surfaceHi,
                    border: `1px solid ${P.line}`,
                    color: P.lime,
                    fontFamily: mono,
                    fontSize: 14,
                    fontWeight: 900,
                  }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate"
                    style={{
                      color: P.ink,
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {e.name}
                  </p>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      letterSpacing: '0.14em',
                      fontWeight: 700,
                      color: P.inkMuted,
                      marginTop: 3,
                      textTransform: 'uppercase',
                    }}
                  >
                    {e.sets} × {e.reps} {e.repUnit} · {e.restTime}S RUST
                  </div>
                </div>
              </div>
            ))}
            <DarkButton href="/athlete/workouts/new" variant="secondary" className="w-full">
              + ANDERE WORKOUT TOEVOEGEN
            </DarkButton>
          </div>
        )}
      </div>
    </div>
  )
}
