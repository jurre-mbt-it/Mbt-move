'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { ChevronLeft, Save } from 'lucide-react'
import Link from 'next/link'

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
const DAY_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

type DayState = { programId: string | null }

type InitialData = {
  id?: string
  name?: string
  description?: string
  patientId?: string | null
  isTemplate?: boolean
  days?: { dayOfWeek: number; programId?: string | null }[]
}

interface Props {
  initialData?: InitialData
}

export function WeekPlannerEditor({ initialData }: Props) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const isEdit = !!initialData?.id

  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [patientId, setPatientId] = useState(initialData?.patientId ?? '')
  const [isTemplate, setIsTemplate] = useState(initialData?.isTemplate ?? false)
  const [days, setDays] = useState<DayState[]>(() =>
    Array.from({ length: 7 }, (_, i) => ({
      programId: initialData?.days?.find(d => d.dayOfWeek === i)?.programId ?? null,
    }))
  )

  const { data: programs = [] } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000 })
  const { data: patients = [] } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000, enabled: false })

  // Use a simpler patient list from programs data
  const patientOptions = Array.from(
    new Map(
      programs
        .filter(p => p.patient)
        .map(p => [p.patient!.id, p.patient!])
    ).values()
  )

  const createMutation = trpc.weekSchedules.create.useMutation()
  const saveMutation = trpc.weekSchedules.save.useMutation()
  const saving = createMutation.isPending || saveMutation.isPending

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Geef het schema een naam'); return }
    const daysPayload = days.map((d, i) => ({ dayOfWeek: i, programId: d.programId }))
    try {
      if (isEdit) {
        await saveMutation.mutateAsync({
          id: initialData!.id!,
          name: name.trim(),
          description: description.trim() || undefined,
          patientId: patientId || null,
          isTemplate,
          days: daysPayload,
        })
        await utils.weekSchedules.list.invalidate()
        toast.success('Schema opgeslagen')
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          patientId: patientId || undefined,
          isTemplate,
          days: daysPayload,
        })
        await utils.weekSchedules.list.invalidate()
        toast.success('Schema aangemaakt')
        router.push('/therapist/week-planner')
      }
    } catch {
      toast.error('Opslaan mislukt')
    }
  }

  const setDayProgram = (dayIndex: number, programId: string | null) => {
    setDays(prev => prev.map((d, i) => i === dayIndex ? { programId } : d))
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/therapist/week-planner">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{isEdit ? 'Schema bewerken' : 'Nieuw weekschema'}</h1>
        </div>
        <Button
          style={{ background: '#3ECF6A' }}
          className="gap-2"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
      </div>

      {/* Meta */}
      <div className="space-y-3 p-4 border rounded-xl bg-white">
        <div>
          <Label className="text-xs">Naam</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1.5" placeholder="bv. Knie revalidatie week 1–4" />
        </div>
        <div>
          <Label className="text-xs">Beschrijving (optioneel)</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1.5" placeholder="Korte omschrijving..." />
        </div>
        <div className="flex gap-4 items-start">
          <div className="flex-1">
            <Label className="text-xs">Patiënt (optioneel)</Label>
            <select
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              className="mt-1.5 w-full h-9 text-sm border rounded-md px-3 bg-white focus:outline-none focus:ring-1 focus:ring-[#3ECF6A]"
            >
              <option value="">— Geen patiënt —</option>
              {patientOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-7">
            <input
              type="checkbox"
              id="isTemplate"
              checked={isTemplate}
              onChange={e => setIsTemplate(e.target.checked)}
              className="accent-[#3ECF6A]"
            />
            <label htmlFor="isTemplate" className="text-sm">Template</label>
          </div>
        </div>
      </div>

      {/* 7-day grid */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm">Weekindeling</h2>
        <div className="space-y-2">
          {days.map((day, i) => {
            const program = programs.find(p => p.id === day.programId)
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-3 border rounded-xl bg-white"
              >
                {/* Day label */}
                <div className="w-24 shrink-0">
                  <span className="font-semibold text-sm">{DAY_LABELS[i]}</span>
                  <span className="text-xs text-muted-foreground block">{DAY_SHORT[i]}</span>
                </div>

                {/* Program select */}
                <select
                  value={day.programId ?? ''}
                  onChange={e => setDayProgram(i, e.target.value || null)}
                  className="flex-1 h-9 text-sm border rounded-md px-3 bg-white focus:outline-none focus:ring-1 focus:ring-[#3ECF6A]"
                >
                  <option value="">Rustdag 😴</option>
                  {programs
                    .filter(p => !p.isTemplate)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                {/* Color indicator */}
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: day.programId ? '#3ECF6A' : '#e4e4e7' }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="p-3 bg-zinc-50 rounded-xl text-xs text-muted-foreground">
        {days.filter(d => d.programId).length} trainingsdagen · {days.filter(d => !d.programId).length} rustdagen
      </div>
    </div>
  )
}
