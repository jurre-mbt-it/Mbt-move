'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  P,
  Kicker,
  MetaLabel,
  Tile,
  DarkInput,
} from '@/components/dark-ui'
import {
  getSavedWorkouts,
  deleteWorkout,
  type Workout,
  WORKOUT_TYPES,
} from '@/lib/workout-constants'
import { Search, Trash2, Clock } from 'lucide-react'
import { WORKOUT_ICON_MAP } from '@/components/icons'

export default function MyWorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    setWorkouts(getSavedWorkouts())
  }, [])

  const completed = workouts.filter((w) => w.completedAt)
  const templates = workouts.filter((w) => !w.completedAt && !w.startedAt)

  const filtered = (list: Workout[]) =>
    search
      ? list.filter((w) =>
          w.name.toLowerCase().includes(search.toLowerCase()),
        )
      : list

  function handleDelete(id: string) {
    deleteWorkout(id)
    setWorkouts(getSavedWorkouts())
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 space-y-4">
        {/* Hero */}
        <div>
          <Kicker>MIJN WORKOUTS · {workouts.length}</Kicker>
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
            WORKOUTS
          </h1>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            className="w-4 h-4"
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: P.inkMuted,
              pointerEvents: 'none',
            }}
          />
          <DarkInput
            placeholder="Zoek workouts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>

        {/* Quick Start */}
        <Tile href="/athlete/workouts/new" accentBar={P.lime} style={{ padding: 20 }}>
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(190,242,100,0.12)',
                border: `1px solid ${P.lineStrong}`,
              }}
            >
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: P.lime,
                  lineHeight: 1,
                }}
              >
                ⚡
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <Kicker>TRAIN NOW</Kicker>
              <div
                className="athletic-display"
                style={{
                  color: P.ink,
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                  lineHeight: '26px',
                  paddingTop: 2,
                  marginTop: 4,
                }}
              >
                QUICK START
              </div>
              <div style={{ marginTop: 4 }}>
                <MetaLabel>START EEN NIEUWE WORKOUT</MetaLabel>
              </div>
            </div>
            <span style={{ color: P.lime, fontSize: 22, fontWeight: 900 }}>
              →
            </span>
          </div>
        </Tile>

        {/* Completed */}
        {filtered(completed).length > 0 && (
          <Section title="AFGEROND" color={P.lime}>
            {filtered(completed).map((w) => (
              <WorkoutRow key={w.id} workout={w} onDelete={handleDelete} />
            ))}
          </Section>
        )}

        {/* Templates */}
        {filtered(templates).length > 0 && (
          <Section title="TEMPLATES" color={P.ice}>
            {filtered(templates).map((w) => (
              <WorkoutRow key={w.id} workout={w} onDelete={handleDelete} />
            ))}
          </Section>
        )}

        {/* Empty */}
        {workouts.length === 0 && (
          <Tile style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💪</div>
            <Kicker>NOG GEEN WORKOUTS</Kicker>
            <p
              style={{
                marginTop: 10,
                color: P.inkMuted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Tik op Quick Start om je eerste workout te maken.
            </p>
          </Tile>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  color,
  children,
}: {
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="pt-2">
      <Kicker style={{ color, marginBottom: 8 }}>{title}</Kicker>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function WorkoutRow({
  workout,
  onDelete,
}: {
  workout: Workout
  onDelete: (id: string) => void
}) {
  const type = WORKOUT_TYPES.find((t) => t.value === workout.type)
  const color = type?.color ?? P.lime
  const Icon = type ? WORKOUT_ICON_MAP[type.value] : null

  return (
    <div
      className="flex items-stretch gap-0 rounded-xl overflow-hidden"
      style={{
        background: P.surface,
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${P.line}`,
      }}
    >
      <Link
        href={`/athlete/workouts/new?id=${workout.id}`}
        className="athletic-tap flex items-center gap-3 flex-1 min-w-0"
        style={{
          padding: '12px 14px',
          textDecoration: 'none',
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: P.surfaceHi,
            border: `1px solid ${P.line}`,
          }}
        >
          {Icon ? <Icon size={20} /> : <span>💪</span>}
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
            {workout.name || 'Workout'}
          </p>
          <div
            className="flex items-center gap-2"
            style={{
              fontFamily:
                'ui-monospace, Menlo, "SF Mono", "Cascadia Code", monospace',
              fontSize: 10,
              letterSpacing: '0.14em',
              fontWeight: 700,
              color: P.inkMuted,
              marginTop: 3,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color }}>{type?.label ?? workout.type}</span>
            <span style={{ color: P.inkDim }}>·</span>
            <span>{workout.exercises.length} OEF</span>
            {workout.duration && (
              <>
                <span style={{ color: P.inkDim }}>·</span>
                <Clock className="w-3 h-3 inline" style={{ color: P.inkMuted }} />
                <span>{workout.duration} MIN</span>
              </>
            )}
          </div>
        </div>
      </Link>
      <button
        onClick={() => {
          if (confirm(`Verwijder "${workout.name || 'Workout'}"?`)) onDelete(workout.id)
        }}
        className="athletic-tap px-3 transition-colors"
        style={{ color: P.inkDim }}
        type="button"
        aria-label="Verwijder"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
