'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { trpc } from '@/lib/trpc/client'
import { Plus, CalendarDays, Users, Copy, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export default function WeekPlannerPage() {
  const router = useRouter()
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
      <div className="space-y-6 max-w-4xl">
        <div className="h-8 w-48 bg-zinc-100 rounded animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-zinc-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekschema&apos;s</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Plan per weekdag welk programma een patiënt doet</p>
        </div>
        <Link href="/therapist/week-planner/new">
          <Button style={{ background: '#4ECDC4' }} className="gap-2">
            <Plus className="w-4 h-4" />
            Nieuw schema
          </Button>
        </Link>
      </div>

      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Templates ({templates.length})
          </h2>
          <div className="space-y-3">
            {templates.map(ws => (
              <WeekScheduleCard key={ws.id} schedule={ws} onDelete={() => handleDelete(ws.id, ws.name)} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Users className="w-4 h-4" /> Patiëntschema&apos;s ({schedules.length})
        </h2>
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
            <p className="text-sm text-muted-foreground">Nog geen weekschema&apos;s</p>
            <Link href="/therapist/week-planner/new">
              <Button variant="outline" size="sm" className="mt-3">
                <Plus className="w-4 h-4 mr-1" /> Schema aanmaken
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map(ws => (
              <WeekScheduleCard key={ws.id} schedule={ws} onDelete={() => handleDelete(ws.id, ws.name)} />
            ))}
          </div>
        )}
      </section>
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
  return (
    <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{schedule.name}</h3>
              {schedule.patient?.name && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> {schedule.patient.name}
                </span>
              )}
            </div>
            {schedule.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{schedule.description}</p>
            )}
            {/* 7-day mini grid */}
            <div className="flex gap-1 mt-2">
              {Array.from({ length: 7 }).map((_, i) => {
                const day = schedule.days.find(d => d.dayOfWeek === i)
                const hasProgram = !!day?.program
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-0.5"
                    title={day?.program?.name ?? 'Rustdag'}
                  >
                    <span className="text-[10px] text-muted-foreground">{['Ma','Di','Wo','Do','Vr','Za','Zo'][i]}</span>
                    <div
                      className="w-5 h-5 rounded-sm text-[9px] flex items-center justify-center font-bold"
                      style={{
                        background: hasProgram ? '#ccfbf1' : '#f4f4f5',
                        color: hasProgram ? '#0D6B6E' : '#a1a1aa',
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
            <Link href={`/therapist/week-planner/${schedule.id}/edit`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
