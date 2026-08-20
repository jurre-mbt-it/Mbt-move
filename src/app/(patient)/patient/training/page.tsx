'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import {
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

// Ruwe schatting per oefening: per set ~45s werk + restTime.
function estimateMinutes(
  exercises: Array<{ sets: number; restTime: number }>,
): number {
  const seconds = exercises.reduce(
    (sum, e) => sum + e.sets * (45 + (e.restTime || 60)),
    0,
  )
  return Math.max(1, Math.round(seconds / 60))
}

export default function PatientTrainingOverview() {
  const { data: sessionData, isLoading } = trpc.patient.getTodayExercises.useQuery()
  const { data: activeProgram } = trpc.patient.getActiveProgram.useQuery()
  const { data: activePrograms } = trpc.patient.getActivePrograms.useQuery()
  const { data: sessionHistory } = trpc.patient.getSessionHistory.useQuery({ limit: 20 })
  const { data: todayWellness } = trpc.wellness.today.useQuery()

  const multiProgram = (activePrograms?.length ?? 0) > 1

  const program = sessionData?.program ?? null
  const exercises = sessionData?.exercises ?? []
  const completedToday =
    sessionHistory?.some(
      (s) => new Date(s.completedAt).toDateString() === new Date().toDateString(),
    ) ?? false

  // Wellness/readiness: alleen tonen als vandaag ingevuld.
  const wellnessTotal = todayWellness
    ? todayWellness.sleep + todayWellness.soreness + todayWellness.fatigue + todayWellness.mood + todayWellness.stress
    : null
  const wellnessPct =
    wellnessTotal !== null ? Math.round(((wellnessTotal - 5) / 20) * 100) : null

  // Week-voortgang: bij flexibele week de weeklyTarget tonen, anders daysPerWeek.
  // weekCompleted = sessies deze week (Ma t/m Zo).
  const weekStart = (() => {
    const d = new Date()
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
    d.setHours(0, 0, 0, 0)
    return d
  })()
  // Zelfde regel als de server: per programma tellen, niet alles bij elkaar.
  const weekCompleted =
    sessionHistory?.filter(
      (s) =>
        new Date(s.completedAt) >= weekStart &&
        (!activeProgram?.id || s.programId === activeProgram.id),
    ).length ?? 0
  const weekTarget =
    program?.weeklyTarget ?? activeProgram?.daysPerWeek ?? null

  const estimatedMinutes = exercises.length > 0 ? estimateMinutes(exercises) : null

  // ── Tile-status: KLAAR / SESSIE OPEN / RUSTDAG / GEEN SCHEMA ──────────────
  type TileState = 'loading' | 'klaar' | 'open' | 'rust' | 'leeg'
  const tileState: TileState = isLoading
    ? 'loading'
    : completedToday
      ? 'klaar'
      : exercises.length > 0
        ? 'open'
        : program
          ? 'rust'
          : 'leeg'

  return (
    <DarkScreen>
      <div className="px-4 pt-6 pb-6 flex flex-col gap-4">
        {/* Header */}
        <h1
          className="athletic-display"
          style={{
            fontSize: 32,
            lineHeight: '36px',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            color: P.ink,
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          Vandaag
        </h1>

        {/* Hoofd-tegel */}
        <SessionTile
          state={tileState}
          multiProgram={multiProgram}
          programCount={activePrograms?.length ?? 0}
          programName={program?.name ?? null}
          currentWeek={program?.currentWeek ?? null}
          totalWeeks={program?.weeks ?? null}
          exerciseCount={exercises.length}
          estimatedMinutes={estimatedMinutes}
        />

        {/* Stats: alleen tonen wat zinvol is */}
        {(wellnessPct !== null || weekTarget) && (
          <div className="grid grid-cols-2 gap-3">
            {wellnessPct !== null && (
              <StatCard
                label="Readiness"
                value={String(wellnessPct)}
                tint={
                  wellnessPct >= 70 ? P.lime : wellnessPct >= 40 ? P.gold : P.danger
                }
              />
            )}
            {weekTarget ? (
              <StatCard
                label="Deze week"
                value={`${weekCompleted}/${weekTarget}`}
                tint={weekCompleted >= weekTarget ? P.lime : P.ink}
              />
            ) : null}
          </div>
        )}
      </div>
    </DarkScreen>
  )
}

// ─── Componenten ─────────────────────────────────────────────────────────────

function SessionTile({
  state,
  multiProgram,
  programCount,
  programName,
  currentWeek,
  totalWeeks,
  exerciseCount,
  estimatedMinutes,
}: {
  state: 'loading' | 'klaar' | 'open' | 'rust' | 'leeg'
  multiProgram: boolean
  programCount: number
  programName: string | null
  currentWeek: number | null
  totalWeeks: number | null
  exerciseCount: number
  estimatedMinutes: number | null
}) {
  if (state === 'loading') {
    return (
      <Tile>
        <MetaLabel>Laden…</MetaLabel>
      </Tile>
    )
  }

  // Meerdere actieve programma's → laat de patient kiezen welk programma ze
  // doet; de keuze volgt op de sessiepagina.
  if (multiProgram) {
    return (
      <Tile accentBar={P.brand} style={{ padding: 20 }}>
        <Kicker style={{ color: P.brand }}>Meerdere programma&apos;s</Kicker>
        <h2
          className="athletic-display"
          style={{
            color: P.ink,
            fontSize: 24,
            lineHeight: '28px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          {programCount} programma&apos;s actief
        </h2>
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}>
          Kies bij het starten welk programma je vandaag doet.
        </p>
        <Link
          href="/patient/session"
          className="athletic-tap athletic-mono w-full mt-5 inline-flex items-center justify-center rounded-xl"
          style={{
            background: P.brand,
            color: P.bg,
            padding: '16px 20px',
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Kies &amp; start →
        </Link>
      </Tile>
    )
  }

  if (state === 'klaar') {
    return (
      <Tile accentBar={P.lime}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: P.lime }}
          />
          <Kicker style={{ color: P.lime }}>Sessie afgerond</Kicker>
        </div>
        <h2
          className="athletic-display"
          style={{
            color: P.ink,
            fontSize: 24,
            lineHeight: '28px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          Lekker bezig
        </h2>
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}>
          Je training van vandaag staat erop. Tot morgen.
        </p>
      </Tile>
    )
  }

  if (state === 'rust') {
    return (
      <Tile accentBar={P.gold}>
        <Kicker style={{ color: P.gold }}>Rustdag</Kicker>
        <h2
          className="athletic-display"
          style={{
            color: P.ink,
            fontSize: 24,
            lineHeight: '28px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          Geen sessie vandaag
        </h2>
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}>
          Gebruik de dag om te herstellen. Morgen weer aan de bak.
        </p>
      </Tile>
    )
  }

  if (state === 'leeg') {
    return (
      <Tile>
        <Kicker>Geen actief programma</Kicker>
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 8 }}>
          Zodra je therapeut een programma activeert, verschijnt hier je training
          van vandaag.
        </p>
      </Tile>
    )
  }

  // state === 'open'
  return (
    <Tile accentBar={P.brand} style={{ padding: 20 }}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: P.brand }}
        />
        <Kicker style={{ color: P.brand }}>Sessie open</Kicker>
      </div>

      <h2
        className="athletic-display"
        style={{
          color: P.ink,
          fontSize: 24,
          lineHeight: '28px',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          marginTop: 8,
          textTransform: 'uppercase',
        }}
      >
        {programName ?? 'Training'}
        {currentWeek && totalWeeks ? (
          <span style={{ color: P.inkMuted, fontWeight: 700 }}>
            {' · WEEK '}{currentWeek}/{totalWeeks}
          </span>
        ) : null}
      </h2>

      <p
        style={{
          color: P.inkMuted,
          fontSize: 13,
          marginTop: 6,
        }}
      >
        {exerciseCount} oefening{exerciseCount === 1 ? '' : 'en'}
        {estimatedMinutes ? ` · circa ${estimatedMinutes} min` : ''}
      </p>

      <Link
        href="/patient/session"
        className="athletic-tap athletic-mono w-full mt-5 inline-flex items-center justify-center rounded-xl"
        style={{
          background: P.brand,
          color: P.bg,
          padding: '16px 20px',
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          textDecoration: 'none',
        }}
      >
        Start sessie →
      </Link>
    </Tile>
  )
}

function StatCard({
  label,
  value,
  tint,
}: {
  label: string
  value: string
  tint: string
}) {
  return (
    <div
      className="rounded-2xl flex flex-col gap-2"
      style={{ background: P.surface, padding: 16 }}
    >
      <MetaLabel>{label.toUpperCase()}</MetaLabel>
      <span
        className="athletic-display"
        style={{
          color: tint,
          fontSize: 36,
          lineHeight: '40px',
          letterSpacing: '-0.03em',
          fontWeight: 900,
        }}
      >
        {value}
      </span>
    </div>
  )
}
