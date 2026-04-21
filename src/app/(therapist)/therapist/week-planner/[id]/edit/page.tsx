'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { WeekPlannerEditor } from '@/components/week-planner/WeekPlannerEditor'

interface Props {
  params: Promise<{ id: string }>
}

export default function EditWeekPlannerPage({ params }: Props) {
  const { id } = use(params)
  const { data: schedule, isLoading } = trpc.weekSchedules.get.useQuery({ id })

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="h-8 w-48 bg-[#1C2425] rounded animate-pulse" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-14 bg-[#1C2425] rounded-xl animate-pulse" />
        ))}
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
