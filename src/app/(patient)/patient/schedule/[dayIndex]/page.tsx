'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { ExerciseVideoModal, type ExerciseForModal } from '@/components/exercises/ExerciseVideoModal'
import { ChevronLeft, Moon, Dumbbell, Play, CheckCircle2 } from 'lucide-react'
import { IconSleep } from '@/components/icons'
import { P, Kicker, MetaLabel, Tile, CATEGORY_COLORS } from '@/components/dark-ui'

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

const CAT_COLOR: Record<string, string> = {
  STRENGTH: CATEGORY_COLORS.STRENGTH,
  MOBILITY: CATEGORY_COLORS.MOBILITY,
  PLYOMETRICS: CATEGORY_COLORS.PLYO,
  CARDIO: CATEGORY_COLORS.CARDIO,
  STABILITY: CATEGORY_COLORS.STABILITY,
}

interface Props {
  params: Promise<{ dayIndex: string }>
}

export default function ScheduleDayPage({ params }: Props) {
  const { dayIndex } = use(params)
  const dayNum = parseInt(dayIndex, 10)
  const { data: schedule, isLoading } = trpc.weekSchedules.mySchedule.useQuery(undefined, { staleTime: 60_000 })
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 30 })

  const [modalExercise, setModalExercise] = useState<ExerciseForModal | null>(null)

  // Bepaal of de patient deze week dit programma heeft afgerond — op deze
  // dag (gewone match) óf op een andere dag (catch-up).
  const weekStart = (() => {
    const d = new Date()
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
    d.setHours(0, 0, 0, 0)
    return d
  })()

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
          <div className="h-7 w-32 rounded animate-pulse" style={{ background: P.surfaceHi }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
          ))}
        </div>
      </div>
    )
  }

  const day = schedule?.days.find(d => d.dayOfWeek === dayNum)
  const dayLabel = DAY_LABELS[dayNum] ?? 'Dag'

  // Geplande programma voor déze dag → match in session-history van deze week.
  const scheduledProgramId = day?.program?.id ?? null
  const sessionForThisProgramThisWeek = scheduledProgramId
    ? sessionHistory?.find(s => {
        if (s.programId !== scheduledProgramId) return false
        const completedAt = new Date(s.completedAt)
        return completedAt >= weekStart
      })
    : null
  const completedDayOfWeek = sessionForThisProgramThisWeek
    ? (() => {
        const d = new Date(sessionForThisProgramThisWeek.completedAt)
        return d.getDay() === 0 ? 6 : d.getDay() - 1
      })()
    : null
  const completedOnThisDay = completedDayOfWeek === dayNum
  const completedAsCatchUp = completedDayOfWeek !== null && completedDayOfWeek !== dayNum

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href="/patient/schedule"
            className="athletic-tap p-1.5 rounded-lg"
            style={{ color: P.inkMuted }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <Kicker>DAG</Kicker>
            <h1
              className="athletic-display"
              style={{
                color: P.ink,
                fontSize: 32,
                lineHeight: '36px',
                letterSpacing: '-0.03em',
                fontWeight: 900,
                paddingTop: 2,
                textTransform: 'uppercase',
              }}
            >
              {dayLabel}
            </h1>
          </div>
        </div>

        {!day?.program ? (
          <Tile accentBar={P.lime}>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Moon className="w-10 h-10 mb-3" style={{ color: P.lime, opacity: 0.5 }} />
              <p
                className="athletic-mono inline-flex items-center gap-2"
                style={{ color: P.lime, fontSize: 14, fontWeight: 900, letterSpacing: '0.14em' }}
              >
                RUSTDAG <IconSleep size={18} />
              </p>
              <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 8, maxWidth: '20rem', lineHeight: 1.5 }}>
                Vandaag hoef je niet te trainen. Gun je lichaam de tijd om te herstellen — dat is net zo belangrijk als trainen!
              </p>
            </div>
          </Tile>
        ) : (
          <>
            <Tile accentBar={completedOnThisDay || completedAsCatchUp ? P.lime : P.lime}>
              <div className="flex items-center gap-2">
                {completedOnThisDay || completedAsCatchUp
                  ? <CheckCircle2 className="w-4 h-4" style={{ color: P.lime }} />
                  : <Dumbbell className="w-4 h-4" style={{ color: P.lime }} />}
                <h2
                  className="athletic-mono"
                  style={{ color: P.lime, fontSize: 13, fontWeight: 900, letterSpacing: '0.12em' }}
                >
                  {day.program.name.toUpperCase()}
                </h2>
              </div>
              <MetaLabel style={{ marginTop: 4 }}>
                {day.program.exercises?.length ?? 0} OEFENINGEN
              </MetaLabel>
              {completedOnThisDay && (
                <p
                  className="athletic-mono mt-2 inline-flex items-center gap-1"
                  style={{ color: P.lime, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em' }}
                >
                  ✓ AFGEROND
                </p>
              )}
              {completedAsCatchUp && completedDayOfWeek !== null && (
                <p
                  className="athletic-mono mt-2 inline-flex items-center gap-1"
                  style={{ color: P.gold, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em' }}
                >
                  ✓ INGEHAALD OP {(DAY_LABELS[completedDayOfWeek] ?? '?').toUpperCase()}
                </p>
              )}
            </Tile>

            <div className="space-y-2">
              {(day.program.exercises ?? []).map((pe, idx) => {
                const color = CAT_COLOR[pe.exercise.category] ?? P.lime
                return (
                  <button
                    key={pe.id}
                    className="athletic-tap w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                    style={{ background: P.surface, border: `1px solid ${P.line}` }}
                    onClick={() => setModalExercise({
                      id: pe.exercise.id,
                      name: pe.exercise.name,
                      category: pe.exercise.category,
                      videoUrl: pe.exercise.videoUrl,
                      sets: pe.sets,
                      reps: pe.reps,
                      repUnit: pe.repUnit,
                    })}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 athletic-mono"
                      style={{ background: color, color: P.bg, fontSize: 12, fontWeight: 900 }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                        {pe.exercise.name}
                      </p>
                      <p
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em', marginTop: 2 }}
                      >
                        {pe.sets} sets × {pe.reps} {pe.repUnit} · {pe.restTime}s rust
                      </p>
                    </div>
                    {pe.exercise.videoUrl && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${color}22` }}
                      >
                        <Play className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Video modal */}
        <ExerciseVideoModal
          open={!!modalExercise}
          onClose={() => setModalExercise(null)}
          exercise={modalExercise}
        />
      </div>
    </div>
  )
}
