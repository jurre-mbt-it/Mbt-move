'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { formatSetsReps } from '@/lib/prescription'
import { DAY_LABELS } from '@/lib/program-constants'
import { ExerciseVideoModal, type ExerciseForModal } from '@/components/exercises/ExerciseVideoModal'
import { ChevronLeft, Play, CheckCircle2, Lock } from 'lucide-react'
import { IconClipboard } from '@/components/icons'
import { P, Kicker, MetaLabel, Tile, DarkButton } from '@/components/dark-ui'

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
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const routeId = typeof params?.id === 'string' ? params.id : undefined
  // Respecteer de URL: laad exact het programma uit de route i.p.v. willekeurig
  // het eerste actieve programma.
  const { data: program, isLoading } = trpc.patient.getActiveProgram.useQuery(
    routeId ? { programId: routeId } : undefined,
    { staleTime: 60_000 },
  )
  // Alle actieve programma's — voedt de switcher bovenaan bij meerdere.
  const { data: activePrograms } = trpc.patient.getActivePrograms.useQuery(undefined, {
    staleTime: 60_000,
  })
  const [activeWeek, setActiveWeek] = useState(1)
  const [modalExercise, setModalExercise] = useState<ExerciseForModal | null>(null)

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
        <DarkButton href="/patient/dashboard" variant="secondary">Terug naar dashboard</DarkButton>
      </div>
    )
  }

  // Narrow program into a local const so TS keeps the narrow inside nested closures.
  const programExercises = program.exercises
  type ProgramExercise = typeof programExercises[number]

  const weekData = program.byWeekDay as Record<number, Record<number, ProgramExercise[]>>
  // Educatie-blokken ("Leer") per week/dag — optioneel (oudere queries zonder).
  type ProgramRes = NonNullable<typeof program.resources>[number]
  const resourceData = (program.resourcesByWeekDay ?? {}) as Record<number, Record<number, ProgramRes[]>>
  // Dagen met oefeningen OF educatie (een dag met alléén educatie telt ook mee).
  const daysWithExercises = Array.from(new Set([
    ...Object.keys(weekData[activeWeek] ?? {}),
    ...Object.keys(resourceData[activeWeek] ?? {}),
  ].map(Number))).sort((a, b) => a - b)

  const isCurrentWeek = activeWeek === program.currentWeek
  const isFutureWeek = activeWeek > program.currentWeek

  function openExerciseModal(e: ProgramExercise) {
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
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Link
            href="/patient/dashboard"
            className="athletic-tap inline-flex items-center gap-1 mb-2"
            style={{ color: P.inkMuted }}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="athletic-mono" style={{ fontSize: 11, letterSpacing: '0.16em' }}>TERUG</span>
          </Link>
          <Kicker>PROGRAMMA · WEEK {activeWeek}</Kicker>
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
            {program.name}
          </h1>
          <MetaLabel style={{ marginTop: 6 }}>
            {program.weeks} WEKEN · {program.daysPerWeek}×/WEEK
          </MetaLabel>
        </div>

        {/* Programma-switcher — alleen bij meerdere actieve programma's */}
        {activePrograms && activePrograms.length > 1 && (
          <div>
            <Kicker style={{ marginBottom: 6 }}>PROGRAMMA</Kicker>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {activePrograms.map(pr => {
                const active = pr.id === program.id
                return (
                  <button
                    key={pr.id}
                    onClick={() => router.replace(`/patient/program/${pr.id}`)}
                    className="athletic-tap shrink-0 px-4 py-1.5 rounded-full transition-colors max-w-[220px] truncate"
                    style={{
                      background: active ? P.brand : P.surface,
                      color: active ? P.bg : P.ink,
                      border: `1px solid ${active ? P.brand : P.line}`,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {pr.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Week tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: program.weeks }, (_, i) => i + 1).map(w => {
            const active = activeWeek === w
            return (
              <button
                key={w}
                onClick={() => setActiveWeek(w)}
                className="athletic-tap shrink-0 px-4 py-1.5 rounded-full athletic-mono transition-colors"
                style={{
                  background: active ? P.brand : P.surface,
                  color: active ? P.bg : P.inkMuted,
                  border: `1px solid ${active ? P.brand : P.line}`,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                }}
              >
                WEEK {w}
              </button>
            )
          })}
        </div>

        <div className="space-y-3">
          {isFutureWeek && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl"
              style={{ background: 'rgba(244,194,97,0.10)', color: P.gold, border: `1px solid ${P.gold}33` }}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span style={{ fontSize: 13 }}>
                Week {activeWeek} is beschikbaar na het voltooien van week {activeWeek - 1}.
              </span>
            </div>
          )}

          {daysWithExercises.length === 0 && !isFutureWeek && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p style={{ color: P.inkMuted, fontSize: 13 }}>Geen oefeningen gepland voor deze week</p>
            </div>
          )}

          {daysWithExercises.map(dayNum => {
            const dayExercises = weekData[activeWeek]?.[dayNum] ?? []
            const isToday = isCurrentWeek && dayNum === program.currentDay
            const isPast = isCurrentWeek && dayNum < program.currentDay
            const dayLabel = DAY_LABELS[dayNum - 1] ?? `Dag ${dayNum}`

            return (
              <Tile
                key={dayNum}
                accentBar={isPast ? P.lime : isToday ? P.gold : undefined}
                style={{ opacity: isFutureWeek ? 0.5 : 1 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center athletic-mono"
                      style={{
                        background: isPast ? P.lime : P.surfaceHi,
                        color: isPast ? P.bg : isToday ? P.ink : P.inkMuted,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {isPast ? '✓' : dayLabel.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>{dayLabel}</p>
                      <MetaLabel>{dayExercises.length} OEFENINGEN</MetaLabel>
                    </div>
                  </div>

                  {isPast ? (
                    <span
                      className="athletic-mono inline-flex items-center gap-1 px-2 py-1 rounded"
                      style={{
                        color: P.lime,
                        background: 'rgba(232,122,85,0.10)',
                        border: `1px solid ${P.lime}33`,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.12em',
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3" /> AFGEROND
                    </span>
                  ) : isToday ? (
                    <DarkButton href="/patient/session" size="sm" variant="primary">
                      <Play className="w-3 h-3 fill-current mr-1" /> START
                    </DarkButton>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  {dayExercises.map(e => (
                    <button
                      key={e.uid}
                      className="athletic-tap w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 transition-all"
                      onClick={() => openExerciseModal(e)}
                      disabled={isFutureWeek}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: isPast ? P.lime : P.inkDim }}
                      />
                      <span className="flex-1 truncate" style={{ color: P.ink, fontSize: 13 }}>
                        {e.name}
                      </span>
                      <span
                        className="athletic-mono shrink-0"
                        style={{ color: P.inkMuted, fontSize: 11 }}
                      >
                        {formatSetsReps(e.sets, e.setsMax, e.reps, e.repsMax)}
                      </span>
                      {e.videoUrl && (
                        <Play className="w-3 h-3 shrink-0" style={{ color: P.lime }} />
                      )}
                    </button>
                  ))}
                </div>

                {/* Educatie ("Leer") voor deze dag */}
                {(resourceData[activeWeek]?.[dayNum]?.length ?? 0) > 0 && (
                  <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${P.line}` }}>
                    <MetaLabel>Uitleg &amp; achtergrond</MetaLabel>
                    {(resourceData[activeWeek]?.[dayNum] ?? []).map(r => {
                      const href = r.fileUrl ?? r.videoUrl
                      const color = r.format === 'PDF' ? P.ice : P.brand
                      return (
                        <a
                          key={r.uid}
                          href={href ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'w-full flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all',
                            (isFutureWeek || !href) ? 'pointer-events-none opacity-60' : 'athletic-tap',
                          )}
                        >
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="flex-1 truncate" style={{ color: P.ink, fontSize: 13 }}>
                            {r.title}
                          </span>
                          <span
                            className="athletic-mono shrink-0"
                            style={{ color, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em' }}
                          >
                            {r.format}
                          </span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </Tile>
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
    </div>
  )
}
