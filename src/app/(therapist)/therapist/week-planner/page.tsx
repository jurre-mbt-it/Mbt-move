'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import {
  DarkButton,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export default function WeekPlannerPage() {
  const utils = trpc.useUtils()
  const { data = [], isLoading } = trpc.weekSchedules.list.useQuery(undefined, { staleTime: 30_000 })
  const deleteMutation = trpc.weekSchedules.delete.useMutation()

  const templates = data.filter(ws => ws.isTemplate)
  const schedules = data.filter(ws => !ws.isTemplate)

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" verwijderen?`)) return
    try {
      await deleteMutation.mutateAsync({ id })
      await utils.weekSchedules.list.invalidate()
      toast.success('Weekschema verwijderd')
    } catch {
      toast.error('Verwijderen mislukt')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
          <div className="h-8 w-48 rounded animate-pulse" style={{ background: P.surfaceHi }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <Kicker>Planner</Kicker>
            <Display size="md">WEEKSCHEMA&apos;S</Display>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Plan per weekdag welk programma een patiënt doet
            </MetaLabel>
          </div>
          <DarkButton variant="primary" href="/therapist/week-planner/new">
            + Nieuw schema
          </DarkButton>
        </div>

        {templates.length > 0 && (
          <section className="space-y-3">
            <Kicker>Templates ({templates.length})</Kicker>
            <div className="space-y-3">
              {templates.map(ws => (
                <WeekScheduleCard key={ws.id} schedule={ws} onDelete={() => handleDelete(ws.id, ws.name)} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <Kicker>Patiëntschema&apos;s ({schedules.length})</Kicker>
          {schedules.length === 0 ? (
            <Tile>
              <div className="py-12 flex flex-col items-center gap-3 text-center">
                <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen weekschema&apos;s</p>
                <DarkButton variant="secondary" size="sm" href="/therapist/week-planner/new">
                  + Schema aanmaken
                </DarkButton>
              </div>
            </Tile>
          ) : (
            <div className="space-y-3">
              {schedules.map(ws => (
                <WeekScheduleCard key={ws.id} schedule={ws} onDelete={() => handleDelete(ws.id, ws.name)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

type ScheduleItem = {
  id: string
  name: string
  description: string | null
  isTemplate: boolean
  patient?: { id: string; name: string | null; email: string } | null
  days: { id: string; dayOfWeek: number; program?: { id: string; name: string } | null }[]
}

function WeekScheduleCard({ schedule, onDelete }: { schedule: ScheduleItem; onDelete: () => void }) {
  const accent = schedule.isTemplate ? P.gold : P.lime
  return (
    <Tile accentBar={accent}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              style={{
                color: P.ink,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {schedule.name}
            </h3>
            {schedule.patient?.name && (
              <span
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
              >
                · {schedule.patient.name}
              </span>
            )}
          </div>
          {schedule.description && (
            <p
              className="athletic-mono truncate"
              style={{ color: P.inkMuted, fontSize: 11, marginTop: 3, letterSpacing: '0.03em' }}
            >
              {schedule.description}
            </p>
          )}
          {/* 7-day grid */}
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: 7 }).map((_, i) => {
              const day = schedule.days.find(d => d.dayOfWeek === i)
              const hasProgram = !!day?.program
              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1"
                  title={day?.program?.name ?? 'Rustdag'}
                >
                  <span
                    className="athletic-mono"
                    style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}
                  >
                    {DAY_LABELS[i].toUpperCase()}
                  </span>
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center athletic-mono"
                    style={{
                      background: hasProgram ? P.lime : P.surface,
                      color: hasProgram ? P.bg : P.inkDim,
                      border: `1px solid ${hasProgram ? P.lime : P.line}`,
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {hasProgram ? '●' : '–'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <DarkButton
            variant="secondary"
            size="sm"
            href={`/therapist/week-planner/${schedule.id}/edit`}
          >
            Wijzig
          </DarkButton>
          <button
            type="button"
            onClick={onDelete}
            title="Verwijderen"
            className="athletic-tap w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: P.surfaceHi, color: P.danger, fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      </div>
    </Tile>
  )
}
