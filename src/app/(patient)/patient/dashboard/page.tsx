'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import {
  ActionTile,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  Tile,
  WeekProgress,
} from '@/components/dark-ui'
import { RecoveryPanel } from '@/components/recovery/RecoveryPanel'
import { WorkloadPanel } from '@/components/workload/WorkloadPanel'
import { ConsentPopup } from '@/components/research/ConsentPopup'
import { DpaPopup } from '@/components/dpa/DpaPopup'

const DAY_LABELS = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

export default function PatientDashboard() {
  const { data: sessionData } = trpc.patient.getTodayExercises.useQuery()
  const { data: activeProgram } = trpc.patient.getActiveProgram.useQuery()
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 20 })
  const { data: rawWorkloadSessions } = trpc.patient.getWorkloadSessions.useQuery()
  const { data: rawRecoverySessions } = trpc.patient.getRecoverySessions.useQuery()
  const { data: todayWellness } = trpc.wellness.today.useQuery()

  const workloadSessions = rawWorkloadSessions?.map((s) => ({ ...s, date: new Date(s.date) })) ?? []
  const recoverySessions =
    rawRecoverySessions?.map((s) => ({ ...s, completedAt: new Date(s.completedAt) })) ?? []

  const todayExercises = sessionData?.exercises ?? []
  const program = sessionData?.program ?? null
  const lastSession = sessionHistory?.[0] ?? null

  const completedToday =
    sessionHistory?.some(
      (s) => new Date(s.completedAt).toDateString() === new Date().toDateString(),
    ) ?? false

  const currentWeek = program?.currentWeek ?? 1
  const weekCompleted =
    sessionHistory?.filter((s) => {
      const d = new Date(s.completedAt)
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
      weekStart.setHours(0, 0, 0, 0)
      return d >= weekStart
    }).length ?? 0
  const weekTotal = activeProgram?.daysPerWeek ?? 0

  const jsDay = new Date().getDay() // 0=Sun
  const todayIndex = jsDay === 0 ? 6 : jsDay - 1 // Mon=0..Sun=6

  const weekDays: Array<'done' | 'today' | 'rest' | 'missed'> = DAY_LABELS.map((_, i) => {
    if (i === todayIndex) return 'today'
    const done = sessionHistory?.some((s) => {
      const d = new Date(s.completedAt)
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
      return dow === i
    })
    if (done) return 'done'
    return 'rest'
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  const wellnessTotal = todayWellness
    ? todayWellness.sleep + todayWellness.soreness + todayWellness.fatigue + todayWellness.mood + todayWellness.stress
    : null
  const wellnessPct = wellnessTotal !== null ? Math.round(((wellnessTotal - 5) / 20) * 100) : null

  return (
    <DarkScreen>
      <DpaPopup />
      <ConsentPopup />

      <div className="px-4 pt-6 pb-3 flex flex-col gap-1">
        <Kicker>{greeting}</Kicker>
        <Display size="md">HOI</Display>
        {program && (
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {program.name}
          </MetaLabel>
        )}
      </div>

      <div className="px-4 pb-24 flex flex-col gap-4">
        {/* Today card */}
        <Tile accentBar={completedToday ? P.lime : P.gold}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <MetaLabel>Vandaag</MetaLabel>
              <Display
                size="md"
                color={completedToday ? P.lime : P.ink}
                style={{ marginTop: 4 }}
              >
                {completedToday ? 'KLAAR' : `${todayExercises.length} OEFENINGEN`}
              </Display>
              {!completedToday && todayExercises.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-3">
                  {todayExercises.slice(0, 3).map((e) => (
                    <div key={e.uid} className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: P.lime }}
                      />
                      <span style={{ color: P.ink, fontSize: 13 }} className="truncate">
                        {e.name}
                      </span>
                      <span
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 11 }}
                      >
                        {e.sets}×{e.reps}
                      </span>
                    </div>
                  ))}
                  {todayExercises.length > 3 && (
                    <span style={{ color: P.inkMuted, fontSize: 12 }}>
                      +{todayExercises.length - 3} meer
                    </span>
                  )}
                </div>
              )}
            </div>
            {!completedToday && todayExercises.length > 0 && (
              <Link
                href="/patient/session"
                className="athletic-tap athletic-mono rounded-xl px-4 py-3 flex items-center gap-1"
                style={{
                  backgroundColor: P.lime,
                  color: P.bg,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                }}
              >
                ▶ START
              </Link>
            )}
          </div>
        </Tile>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricTile
            label="Sessies"
            value={sessionHistory?.length ?? 0}
            tint={P.lime}
          />
          <MetricTile
            label="Week"
            value={`${weekCompleted}/${weekTotal || '—'}`}
            tint={P.ice}
          />
          <MetricTile
            label="Readiness"
            value={wellnessPct !== null ? wellnessPct : '—'}
            unit={wellnessPct !== null ? '%' : undefined}
            tint={
              wellnessPct === null
                ? P.inkMuted
                : wellnessPct >= 70
                  ? P.lime
                  : wellnessPct >= 40
                    ? P.gold
                    : P.danger
            }
          />
        </div>

        {/* Week progress */}
        <Tile>
          <div className="flex items-center justify-between">
            <MetaLabel>Week {currentWeek}</MetaLabel>
            <span
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11 }}
            >
              {weekCompleted}/{weekTotal || '—'}
            </span>
          </div>
          <div className="mt-3">
            <WeekProgress days={weekDays} />
          </div>
          <div className="flex justify-between mt-2">
            {DAY_LABELS.map((l, i) => (
              <span
                key={l}
                className="athletic-mono"
                style={{
                  color: i === todayIndex ? P.gold : P.inkDim,
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  flex: 1,
                  textAlign: 'center',
                }}
              >
                {l}
              </span>
            ))}
          </div>
        </Tile>

        {/* Wellness quick action */}
        <ActionTile
          href="/patient/wellness"
          label={todayWellness ? 'Wellness update' : 'Wellness check'}
          sub={
            todayWellness
              ? `Vandaag ingevuld · ${wellnessPct}% readiness`
              : 'Dagelijkse 5-item check · helpt load afstemmen'
          }
          bar={todayWellness ? P.lime : P.ice}
        />

        {/* Cardio + pain quick actions */}
        <ActionTile
          href="/patient/cardio-session"
          label="Cardio sessie"
          sub="Walk-run, zone 2, intervallen"
          bar={P.lime}
        />
        <ActionTile
          href="/patient/pain"
          label="Pijn rapporteren"
          sub="Meld klachten aan je therapeut"
          bar={P.danger}
        />

        {/* Recovery & Workload panels (gekleurd door .athletic-dark context) */}
        <RecoveryPanel sessions={recoverySessions} />
        <WorkloadPanel sessions={workloadSessions} />

        {/* Last session */}
        {lastSession && (
          <Tile href="/patient/history">
            <div className="flex items-center justify-between">
              <MetaLabel>Laatste sessie</MetaLabel>
              <span style={{ color: P.inkMuted, fontSize: 12 }}>Alles →</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                {new Date(lastSession.completedAt).toLocaleDateString('nl-NL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              {lastSession.painLevel !== null && lastSession.painLevel !== undefined && (
                <span
                  className="athletic-mono"
                  style={{
                    color: lastSession.painLevel >= 5 ? P.danger : P.gold,
                    fontSize: 11,
                  }}
                >
                  PIJN {lastSession.painLevel}/10
                </span>
              )}
            </div>
            <span
              className="athletic-mono block mt-1"
              style={{
                color: P.inkMuted,
                fontSize: 11,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              {lastSession.exerciseCount} oefeningen · {lastSession.durationMinutes} min
              {lastSession.programName ? ` · ${lastSession.programName}` : ''}
            </span>
          </Tile>
        )}
      </div>
    </DarkScreen>
  )
}
