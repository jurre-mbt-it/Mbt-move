'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { WeekPlannerEditor } from '@/components/week-planner/WeekPlannerEditor'
import { P } from '@/components/dark-ui'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditWeekPlannerPage({ params }: Props) {
  const { id } = use(params)
  const { data: schedule, isLoading } = trpc.weekSchedules.get.useQuery({ id })

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 space-y-4">
          <div
            className="h-8 w-48 rounded animate-pulse"
            style={{ background: P.surfaceHi }}
          />
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl animate-pulse"
              style={{ background: P.surfaceHi }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (!schedule) return notFound()

  return (
    <WeekPlannerEditor
      initialData={{
        id: schedule.id,
        name: schedule.name,
        description: schedule.description ?? undefined,
        patientId: schedule.patientId,
        isTemplate: schedule.isTemplate,
        days: schedule.days.map(d => ({ dayOfWeek: d.dayOfWeek, programId: d.programId })),
      }}
    />
  )
}
