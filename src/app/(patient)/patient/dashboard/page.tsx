'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { formatSetsReps } from '@/lib/prescription'
import { wearablesEnabledForRole } from '@/lib/wearables-access'
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
import { WeeklyTrendChart } from '@/components/charts/WeeklyTrendChart'
import { ConsentPopup } from '@/components/research/ConsentPopup'
import { DpaPopup } from '@/components/dpa/DpaPopup'

const DAY_LABELS = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

export default function PatientDashboard() {
  const { data: sessionData } = trpc.patient.getTodayExercises.useQuery()
  const { data: activeProgram } = trpc.patient.getActiveProgram.useQuery()
  const { data: activePrograms } = trpc.patient.getActivePrograms.useQuery()
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 20 })

  const multiProgram = (activePrograms?.length ?? 0) > 1
  const { data: todayWellness } = trpc.wellness.today.useQuery()
  const { data: rehabTracker } = trpc.rehab.getMyTracker.useQuery()
  const { data: me } = trpc.auth.getMe.useQuery()


  const todayExercises = sessionData?.exercises ?? []
  const program = sessionData?.program ?? null
  // Weekdag (1=ma..7=zo) waarnaar de patiënt de sessie van vandaag verschoof.
  const movedToDay = program?.movedToDay ?? null
  const lastSession = sessionHistory?.[0] ?? null

  const completedToday =
    sessionHistory?.some(
      (s) => new Date(s.completedAt).toDateString() === new Date().toDateString(),
    ) ?? false

  const currentWeek = program?.currentWeek ?? 1
  // Alleen sessies van DIT programma tellen (een los cardio-item hoorde de
  // teller niet op te schuiven), en bij een flexibel programma is weeklyTarget
  // de noemer — daysPerWeek blijft daar op de builder-default staan.
  const weekCompleted =
    sessionHistory?.filter((s) => {
      if (activeProgram?.id && s.programId !== activeProgram.id) return false
      const d = new Date(s.completedAt)
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
      weekStart.setHours(0, 0, 0, 0)
      return d >= weekStart
    }).length ?? 0
  const weekTotal = program?.weeklyTarget ?? activeProgram?.daysPerWeek ?? 0

  const jsDay = new Date().getDay() // 0=Sun
  const todayIndex = jsDay === 0 ? 6 : jsDay - 1 // Mon=0..Sun=6

  // Bepaal of er deze week op een bepaalde dag een sessie is afgerond.
  // Catch-up sessies vallen automatisch op completedAt (= de werkelijke
  // trainings-dag), niet op de oorspronkelijk geplande dag.
  const weekStart = (() => {
    const d = new Date()
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
    d.setHours(0, 0, 0, 0)
    return d
  })()
  const weekDays: Array<'done' | 'today' | 'rest' | 'missed'> = DAY_LABELS.map((_, i) => {
    const done = sessionHistory?.some((s) => {
      const d = new Date(s.completedAt)
      if (d < weekStart) return false
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
      return dow === i
    })
    // Vandaag-afgerond toont 'done' (groen vinkje), niet meer 'today' (gold).
    if (done) return 'done'
    if (i === todayIndex) return 'today'
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
        {multiProgram ? (
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {activePrograms!.length} actieve programma&apos;s
          </MetaLabel>
        ) : program ? (
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {program.name}
          </MetaLabel>
        ) : null}
      </div>

      <div className="px-4 pb-24 flex flex-col gap-4">
        {/* Today card */}
        <Tile accentBar={completedToday && !multiProgram ? P.lime : P.gold}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <MetaLabel>Vandaag</MetaLabel>
              <Display
                size="md"
                color={completedToday && !multiProgram ? P.lime : P.ink}
                style={{ marginTop: 4 }}
              >
                {multiProgram
                  ? `${activePrograms!.length} PROGRAMMA'S`
                  : completedToday
                    ? 'KLAAR'
                    : movedToDay
                      ? 'VERPLAATST'
                      : `${todayExercises.length} OEFENINGEN`}
              </Display>
              {!multiProgram && !completedToday && movedToDay && (
                <span className="block mt-2" style={{ color: P.inkMuted, fontSize: 13 }}>
                  Je sessie van vandaag staat op{' '}
                  {['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'][movedToDay - 1]}.
                </span>
              )}
              {multiProgram ? (
                <span
                  className="block mt-2"
                  style={{ color: P.inkMuted, fontSize: 13 }}
                >
                  Kies bij het starten welk programma je doet.
                </span>
              ) : (
                !completedToday && todayExercises.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-3">
                    {todayExercises.slice(0, 3).map((e) => (
                      <div key={e.uid} className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: P.brand }}
                        />
                        <span style={{ color: P.ink, fontSize: 13 }} className="truncate">
                          {e.name}
                        </span>
                        <span
                          className="athletic-mono"
                          style={{ color: P.inkMuted, fontSize: 11 }}
                        >
                          {formatSetsReps(e.sets, e.setsMax, e.reps, e.repsMax)}
                        </span>
                      </div>
                    ))}
                    {todayExercises.length > 3 && (
                      <span style={{ color: P.inkMuted, fontSize: 12 }}>
                        +{todayExercises.length - 3} meer
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
            {(multiProgram || (!completedToday && todayExercises.length > 0)) && (
              <Link
                href="/patient/session"
                className="athletic-tap athletic-mono rounded-xl px-4 py-3 flex items-center gap-1"
                style={{
                  backgroundColor: P.brand,
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

        {/* Apple Watch — readiness, slaap & herstel.
            Voorlopig alleen voor de admin (zie wearables-access.ts). */}
        {wearablesEnabledForRole(me?.role) && (
          <ActionTile
            href="/patient/wearables"
            label="Apple Watch"
            sub="Readiness, slaap & herstel uit je watch"
            bar={P.brand}
          />
        )}

        {/* Active program detail — bij meerdere programma's elk los tonen zodat
            de patient ze gescheiden ziet en direct naar het juiste kan. */}
        {multiProgram ? (
          activePrograms!.map((p) => (
            <ActionTile
              key={p.id}
              href={`/patient/program/${p.id}`}
              label={p.name}
              sub={`Week ${p.currentWeek}/${p.weeks} · ${p.daysPerWeek}×/week`}
              bar={P.purple}
            />
          ))
        ) : activeProgram?.id ? (
          <ActionTile
            href={`/patient/program/${activeProgram.id}`}
            label="Mijn programma"
            sub={`${activeProgram.name ?? ''} · alle weken bekijken`}
            bar={P.purple}
          />
        ) : null}

        {/* Rehab-protocol — alleen tonen als therapeut een tracker heeft geactiveerd */}
        {rehabTracker && (
          <ActionTile
            href="/patient/rehab"
            label="Mijn revalidatie"
            sub={`${rehabTracker.protocol.name} · ${rehabTracker.progress.pct}% behaald`}
            bar={P.brand}
          />
        )}

        {/* Pijn rapporteren — cardio is alleen voor sporters/atleten en
            staat daarom niet in de patiënt-app. */}
        <ActionTile
          href="/patient/pain"
          label="Pijn rapporteren"
          sub="Meld klachten aan je therapeut"
          bar={P.danger}
        />

        {/* Recovery + workload panels tijdelijk uit — berekening klopt nog
            niet helemaal. Vervangen door weekly RPE + pijn-grafiek. */}
        <WeeklyTrendChart sessions={sessionHistory ?? []} />

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
