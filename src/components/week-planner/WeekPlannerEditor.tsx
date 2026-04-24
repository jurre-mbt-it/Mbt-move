'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { ChevronLeft, Save, Plus, CalendarDays, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { DarkButton, Kicker, P } from '@/components/dark-ui'
import { EXERCISE_CATEGORIES } from '@/lib/exercise-constants'
import { DayPicker, type ProgramOption } from './DayPicker'
import { BulkPlaceDialog } from './BulkPlaceDialog'

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
const DAY_SHORT = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

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

function categoryColor(cat: string | null | undefined): string {
  switch (cat) {
    case 'STRENGTH': return P.lime
    case 'MOBILITY': return '#60a5fa'
    case 'PLYOMETRICS': return '#f59e0b'
    case 'CARDIO': return '#f87171'
    case 'STABILITY': return '#a78bfa'
    default: return P.inkDim
  }
}

function categoryLabel(cat: string | null | undefined): string {
  return EXERCISE_CATEGORIES.find(c => c.value === cat)?.label ?? ''
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
    })),
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDay, setPickerDay] = useState<number | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const { data: programsRaw } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000 })
  const programs = useMemo<ProgramOption[]>(
    () =>
      ((programsRaw as unknown as Array<{
        id: string
        name: string
        isTemplate: boolean
        dominantCategory?: string | null
      }>) ?? []).map(p => ({
        id: p.id,
        name: p.name,
        isTemplate: p.isTemplate,
        dominantCategory: p.dominantCategory ?? null,
      })),
    [programsRaw],
  )

  const patientOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string | null; email: string }>()
    for (const p of (programsRaw as unknown as Array<{ patient?: { id: string; name: string | null; email: string } | null }> ?? [])) {
      if (p.patient) map.set(p.patient.id, p.patient)
    }
    return Array.from(map.values())
  }, [programsRaw])

  const createMutation = trpc.weekSchedules.create.useMutation()
  const saveMutation = trpc.weekSchedules.save.useMutation()
  const scheduleProgramMutation = trpc.weekSchedules.scheduleProgram.useMutation()
  const saving = createMutation.isPending || saveMutation.isPending

  // CIE — toon aantal open signalen als chip zodra er een patiënt gekoppeld is
  const { data: openSignals } = trpc.insights.countOpenForPatient.useQuery(
    { patientId: patientId || '' },
    { enabled: !!patientId, staleTime: 60_000 },
  )

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Geef het schema een naam')
      return
    }
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
    setDays(prev => prev.map((d, i) => (i === dayIndex ? { programId } : d)))
  }

  const handleBulkPlace = async ({
    programId,
    weeks,
    daysOfWeek,
  }: {
    programId: string
    weeks: number
    daysOfWeek: number[]
  }) => {
    if (!patientId) {
      toast.error('Selecteer een patiënt')
      return
    }
    try {
      const result = await scheduleProgramMutation.mutateAsync({
        programId,
        patientId,
        weeks,
        daysOfWeek,
      })
      // Update lokale state zodat de kalender meteen de nieuwe dagen toont.
      setDays(prev =>
        prev.map((d, i) => {
          if (daysOfWeek.includes(i)) return { programId }
          // Als deze dag voorheen dit programma had maar nu niet in selectie → laat staan
          return d
        }),
      )
      await utils.weekSchedules.list.invalidate()
      toast.success(`Geplaatst op ${daysOfWeek.length} dagen voor ${weeks} weken`)
      // In new-mode heeft scheduleProgram een schema aangemaakt — redirect naar edit
      if (!isEdit && result?.id) {
        router.push(`/therapist/week-planner/${result.id}/edit`)
      }
    } catch {
      toast.error('Plaatsen mislukt')
    }
  }

  const openPicker = (dayIndex: number) => {
    setPickerDay(dayIndex)
    setPickerOpen(true)
  }

  const handlePickProgram = (programId: string | null) => {
    if (pickerDay === null) return
    setDayProgram(pickerDay, programId)
    setPickerDay(null)
  }

  const trainingDays = days.filter(d => d.programId).length

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/therapist/week-planner">
            <button className="athletic-tap w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: P.surfaceHi }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex-1">
            <Kicker>{isEdit ? 'BEWERKEN' : 'NIEUW'}</Kicker>
            <h1 className="text-xl font-bold" style={{ letterSpacing: '0.03em' }}>
              {isEdit ? 'Weekschema bewerken' : 'Nieuw weekschema'}
            </h1>
          </div>
          <DarkButton
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            <span className="inline-flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Opslaan…' : 'Opslaan'}
            </span>
          </DarkButton>
        </div>

        {/* Meta */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: P.surface }}>
          <div>
            <label className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
              NAAM
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full h-9 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#BEF264]"
              style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}` }}
              placeholder="bv. Knie revalidatie week 1–4"
            />
          </div>
          <div>
            <label className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
              BESCHRIJVING (OPTIONEEL)
            </label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="mt-1 w-full h-9 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#BEF264]"
              style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}` }}
              placeholder="Korte omschrijving…"
            />
          </div>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="athletic-mono text-[10px] tracking-wider" style={{ color: P.inkMuted }}>
                PATIËNT
              </label>
              <select
                value={patientId}
                onChange={e => setPatientId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#BEF264]"
                style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.line}` }}
              >
                <option value="">— Geen patiënt (template) —</option>
                {patientOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.email}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={isTemplate}
                onChange={e => setIsTemplate(e.target.checked)}
                className="w-4 h-4 accent-[#BEF264]"
              />
              <span className="text-sm" style={{ color: P.ink }}>Template</span>
            </label>
          </div>
        </div>

        {/* Calendar header + bulk button + signalen-chip */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Kicker>Weekindeling</Kicker>
            {patientId && openSignals && openSignals.count > 0 && (
              <Link
                href="/therapist/signals"
                className="athletic-tap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{
                  background: 'rgba(244,194,97,0.1)',
                  color: P.gold,
                  border: `1px solid ${P.gold}`,
                  letterSpacing: '0.04em',
                }}
                title="Open signalen voor deze patiënt bekijken"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {openSignals.count} open {openSignals.count === 1 ? 'signaal' : 'signalen'}
              </Link>
            )}
          </div>
          <DarkButton
            variant="secondary"
            size="sm"
            onClick={() => setBulkOpen(true)}
          >
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Meerdere weken plaatsen
            </span>
          </DarkButton>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {days.map((day, i) => {
            const program = programs.find(p => p.id === day.programId)
            const color = categoryColor(program?.dominantCategory)
            return (
              <button
                key={i}
                type="button"
                onClick={() => openPicker(i)}
                className="athletic-tap text-left rounded-xl p-3 transition-colors hover:brightness-110 min-h-[92px] sm:min-h-[120px]"
                style={{
                  background: program ? 'rgba(190,242,100,0.06)' : P.surface,
                  border: `1px solid ${program ? 'rgba(190,242,100,0.3)' : P.line}`,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className="athletic-mono text-[10px] tracking-widest font-bold"
                    style={{ color: P.inkMuted, letterSpacing: '0.14em' }}
                  >
                    {DAY_SHORT[i]}
                  </span>
                  <span className="sm:hidden text-xs" style={{ color: P.inkMuted }}>
                    {DAY_LABELS[i]}
                  </span>
                </div>
                {program ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                      <span
                        className="athletic-mono text-[9px] tracking-wider uppercase"
                        style={{ color: P.inkMuted }}
                      >
                        {categoryLabel(program.dominantCategory)}
                      </span>
                    </div>
                    <p
                      className="text-xs font-bold leading-tight"
                      style={{
                        color: P.ink,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {program.name}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5" style={{ color: P.inkDim }}>
                    <Plus className="w-3.5 h-3.5" />
                    <span className="athletic-mono text-[10px] tracking-wider uppercase">
                      Toevoegen
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Summary */}
        <div
          className="rounded-xl p-3 text-xs"
          style={{ background: P.surfaceHi, color: P.inkMuted }}
        >
          {trainingDays} trainingsdagen · {7 - trainingDays} rustdagen
        </div>
      </div>

      {/* Dialogs */}
      <DayPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        dayLabel={pickerDay !== null ? DAY_LABELS[pickerDay] : ''}
        programs={programs}
        onPick={handlePickProgram}
      />
      <BulkPlaceDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        programs={programs}
        patientId={patientId || null}
        onPlace={handleBulkPlace}
        placing={scheduleProgramMutation.isPending}
      />
    </div>
  )
}
