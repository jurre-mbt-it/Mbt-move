'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { RecoveryPanel } from '@/components/recovery/RecoveryPanel'
import { WorkloadPanel } from '@/components/workload/WorkloadPanel'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  ActionTile,
  MetricTile,
  DarkButton,
  WeekProgress,
} from '@/components/dark-ui'
import { DAY_LABELS } from '@/lib/program-constants'
import { IconStrength, IconCelebration } from '@/components/icons'

const DAY_NAMES = [
  'MAANDAG',
  'DINSDAG',
  'WOENSDAG',
  'DONDERDAG',
  'VRIJDAG',
  'ZATERDAG',
  'ZONDAG',
]

const mono =
  'ui-monospace, Menlo, "SF Mono", "Cascadia Code", "Source Code Pro", monospace'

export default function AthleteDashboard() {
  const [userName, setUserName] = useState('')

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserName(
          user.user_metadata?.name || user.email?.split('@')[0] || '',
        )
      }
    }
    loadUser()
  }, [])

  const { data: sessionData } = trpc.patient.getTodayExercises.useQuery()
  const { data: activeProgram } = trpc.patient.getActiveProgram.useQuery()
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({
    limit: 20,
  })
  const { data: rawWorkloadSessions } =
    trpc.patient.getWorkloadSessions.useQuery()
  const { data: rawRecoverySessions } =
    trpc.patient.getRecoverySessions.useQuery()

  const workloadSessions =
    rawWorkloadSessions?.map((s) => ({ ...s, date: new Date(s.date) })) ?? []
  const recoverySessions =
    rawRecoverySessions?.map((s) => ({
      ...s,
      completedAt: new Date(s.completedAt),
    })) ?? []

  const todayExercises = sessionData?.exercises ?? []
  const lastSession = sessionHistory?.[0] ?? null
  const streak = 5
  const completedToday =
    sessionHistory?.some(
      (s) =>
        new Date(s.completedAt).toDateString() === new Date().toDateString(),
    ) ?? false

  const today = new Date().getDay()
  const todayDayNum = today === 0 ? 7 : today // 1-7 (Mon=1)

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)
  const weekCompleted =
    sessionHistory?.filter((s) => new Date(s.completedAt) >= weekStart).length ??
    0
  const weekTotal = activeProgram?.daysPerWeek ?? 0
  const weekProgressPct =
    weekTotal > 0 ? Math.min((weekCompleted / weekTotal) * 100, 100) : 0

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'GOEDEMORGEN' : hour < 18 ? 'GOEDEMIDDAG' : 'GOEDENAVOND'

  // Build week-progress state array (Mon…Sun)
  const weekDays = DAY_LABELS.map((_, i) => {
    const dayNum = i + 1
    const isDone =
      sessionHistory?.some((s) => {
        const d = new Date(s.completedAt)
        const day = d.getDay() === 0 ? 7 : d.getDay()
        return day === dayNum && d >= weekStart
      }) ?? false
    if (isDone) return 'done' as const
    if (dayNum === todayDayNum) return 'today' as const
    return 'rest' as const
  })

  const displayName = userName ? userName.split(' ')[0] : 'ATHLETE'
  const programName = activeProgram?.name?.toUpperCase() ?? null
  const totalWeeks = activeProgram?.weeks ?? null
  const currentWeek = activeProgram?.currentWeek ?? null

  return (
    <div
      className="min-h-screen"
      style={{ background: P.bg, color: P.ink, fontFamily: 'inherit' }}
    >
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* ── Program strip: MBT pill + DAG n/y ─────────────── */}
        {(programName || currentWeek) && (
          <div className="flex items-center justify-between gap-3 mb-2">
            {programName ? (
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{
                  background: P.surface,
                  border: `1px solid ${P.lineStrong}`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: P.lime,
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 11,
                    letterSpacing: '0.16em',
                    fontWeight: 900,
                    color: P.ink,
                  }}
                >
                  {programName}
                </span>
              </span>
            ) : (
              <span />
            )}
            {currentWeek && totalWeeks && (
              <MetaLabel style={{ color: P.inkMuted }}>
                WEEK {currentWeek}/{totalWeeks}
              </MetaLabel>
            )}
          </div>
        )}

        {/* ── Hero: greeting + big uppercase name ───────────── */}
        <div>
          <Kicker>{greeting} · ATLEET</Kicker>
          <h1
            className="athletic-display"
            style={{
              color: P.ink,
              fontWeight: 900,
              letterSpacing: '-0.045em',
              lineHeight: 1.02,
              fontSize: 'clamp(56px, 16vw, 112px)',
              paddingTop: 6,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            {displayName}
          </h1>
        </div>

        {/* ── TRAIN NOW — hoofdtegel ─────────────────────── */}
        <TrainNowTile
          completedToday={completedToday}
          todayExercises={todayExercises}
          todayDayName={DAY_NAMES[todayDayNum - 1]}
        />

        {/* ── Week progress ─────────────────────────────── */}
        {weekTotal > 0 && (
          <Tile>
            <div className="flex items-center justify-between mb-3">
              <Kicker>WEEK PROGRESS</Kicker>
              <span
                className="athletic-display"
                style={{
                  color: weekProgressPct >= 100 ? P.lime : P.ink,
                  fontSize: 32,
                  lineHeight: '36px',
                  letterSpacing: '-0.03em',
                  fontWeight: 900,
                  paddingTop: 2,
                }}
              >
                {Math.round(weekProgressPct)}%
              </span>
            </div>
            <WeekProgress days={weekDays} todayIndex={todayDayNum - 1} />
            <div className="flex gap-1 mt-2">
              {DAY_LABELS.map((l, i) => {
                const isToday = i === todayDayNum - 1
                return (
                  <span
                    key={l + i}
                    className="flex-1 text-center"
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.14em',
                      color: isToday ? P.gold : P.inkDim,
                    }}
                  >
                    {l.slice(0, 1)}
                  </span>
                )
              })}
            </div>
            <div
              className="flex items-baseline justify-between mt-3 pt-3"
              style={{ borderTop: `1px solid ${P.line}` }}
            >
              <MetaLabel>
                {weekCompleted}/{weekTotal} SESSIES
              </MetaLabel>
              {currentWeek && totalWeeks && (
                <MetaLabel>
                  WEEK {currentWeek} VAN {totalWeeks}
                </MetaLabel>
              )}
            </div>
          </Tile>
        )}

        {/* ── Stats: streak / sessies / deze week ─────────── */}
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="STREAK" value={streak} unit="DG" tint={P.gold} />
          <MetricTile
            label="SESSIES"
            value={sessionHistory?.length ?? 0}
            tint={P.lime}
          />
          <MetricTile
            label="DEZE WEEK"
            value={weekCompleted}
            unit={weekTotal > 0 ? `/${weekTotal}` : undefined}
            tint={P.ice}
          />
        </div>

        {/* ── Quick actions ─────────────────────────────── */}
        <div className="pt-2">
          <Kicker style={{ marginBottom: 8 }}>ACTIES</Kicker>
          <ActionTile
            label="PROGRAMMA"
            sub="Eigen schema maken"
            href="/athlete/programs/new"
            bar={P.lime}
          />
          <ActionTile
            label="OEFENINGEN"
            sub="Toevoegen & beheren"
            href="/athlete/exercises"
            bar={P.ice}
          />
          <ActionTile
            label="GESCHIEDENIS"
            sub="Al je sessies terugzien"
            href="/athlete/history"
            bar={P.purple}
          />
        </div>

        {/* ── Recovery + Workload panels ────────────────── */}
        <div className="pt-2 space-y-3">
          <Kicker style={{ color: P.ice }}>RECOVERY</Kicker>
          <RecoveryPanel sessions={recoverySessions} />
          <Kicker style={{ color: P.gold }}>WORKLOAD</Kicker>
          <WorkloadPanel sessions={workloadSessions} />
        </div>

        {/* ── Last session recap ────────────────────────── */}
        {lastSession && (
          <Tile accentBar={P.lime}>
            <div className="flex items-center justify-between mb-2">
              <Kicker>LAATSTE SESSIE</Kicker>
              <Link
                href="/athlete/history"
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  fontWeight: 900,
                  color: P.lime,
                  textDecoration: 'none',
                }}
              >
                ALLES →
              </Link>
            </div>
            <div
              style={{
                color: P.ink,
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                paddingTop: 2,
              }}
            >
              {new Date(lastSession.completedAt)
                .toLocaleDateString('nl-NL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })
                .toUpperCase()}
            </div>
            <div style={{ marginTop: 6 }}>
              <MetaLabel>
                {lastSession.programName ? `${lastSession.programName} · ` : ''}
                {lastSession.exerciseCount} OEFENINGEN ·{' '}
                {lastSession.durationMinutes} MIN
              </MetaLabel>
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── TRAIN NOW tile ─────────────────────────

function TrainNowTile({
  completedToday,
  todayExercises,
  todayDayName,
}: {
  completedToday: boolean
  todayExercises: Array<{
    uid: string
    name: string
    sets: number
    reps: number
    repUnit: string
  }>
  todayDayName: string
}) {
  const hasPlan = todayExercises.length > 0

  if (completedToday) {
    return (
      <Tile accentBar={P.lime} style={{ padding: 20 }}>
        <div className="flex items-center justify-between">
          <Kicker style={{ color: P.lime }}>KLAAR · {todayDayName}</Kicker>
          <IconCelebration size={18} />
        </div>
        <div
          className="athletic-display"
          style={{
            color: P.ink,
            fontSize: 40,
            lineHeight: '44px',
            letterSpacing: '-0.035em',
            fontWeight: 900,
            paddingTop: 4,
            marginTop: 4,
          }}
        >
          LEKKER BEZIG
        </div>
        <div style={{ marginTop: 8 }}>
          <MetaLabel>ALLE TRAININGEN VAN VANDAAG AFGEROND</MetaLabel>
        </div>
      </Tile>
    )
  }

  if (!hasPlan) {
    // Freestyle — geen programma voor vandaag
    return (
      <Tile accentBar={P.lime} style={{ padding: 24 }}>
        <Kicker>TRAIN NOW</Kicker>
        <div
          className="athletic-display"
          style={{
            color: P.ink,
            fontSize: 40,
            lineHeight: '44px',
            letterSpacing: '-0.035em',
            fontWeight: 900,
            paddingTop: 4,
            marginTop: 8,
            marginBottom: 4,
          }}
        >
          FREESTYLE
        </div>
        <MetaLabel>PICK A WORKOUT</MetaLabel>
        <div className="mt-5">
          <DarkButton href="/athlete/session?mode=quick" size="lg">
            OPEN WORKOUTS →
          </DarkButton>
        </div>
      </Tile>
    )
  }

  // Heeft plan vandaag, nog niet gedaan
  return (
    <Tile accentBar={P.lime} style={{ padding: 24 }}>
      <div className="flex items-center justify-between">
        <Kicker>VANDAAG · {todayDayName}</Kicker>
        <span
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: '0.14em',
            fontWeight: 900,
            color: P.inkMuted,
          }}
        >
          {todayExercises.length} OEFENINGEN
        </span>
      </div>
      <div
        className="athletic-display"
        style={{
          color: P.ink,
          fontSize: 40,
          lineHeight: '44px',
          letterSpacing: '-0.035em',
          fontWeight: 900,
          paddingTop: 4,
          marginTop: 8,
        }}
      >
        TRAIN NOW
      </div>

      <div className="mt-5 space-y-2">
        {todayExercises.slice(0, 3).map((e) => (
          <div
            key={e.uid}
            className="flex items-center gap-3 rounded-xl"
            style={{
              background: P.surfaceLow,
              padding: '10px 12px',
              border: `1px solid ${P.line}`,
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: P.surfaceHi }}
            >
              <IconStrength size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="truncate"
                style={{
                  color: P.ink,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                }}
              >
                {e.name}
              </p>
              <p
                style={{
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  fontWeight: 700,
                  color: P.inkMuted,
                  marginTop: 2,
                  textTransform: 'uppercase',
                }}
              >
                {e.sets} × {e.reps} {e.repUnit}
              </p>
            </div>
          </div>
        ))}
        {todayExercises.length > 3 && (
          <div style={{ paddingLeft: 4, marginTop: 4 }}>
            <MetaLabel>+{todayExercises.length - 3} MEER</MetaLabel>
          </div>
        )}
      </div>

      <div className="mt-5">
        <DarkButton href="/athlete/session" size="lg">
          START SESSIE →
        </DarkButton>
      </div>
    </Tile>
  )
}
