'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { useAutosave, loadDraft } from '@/hooks/useAutosave'
import { ChevronLeft, Plus, CalendarDays, Sparkles, Check, Loader2, AlertCircle } from 'lucide-react'
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

  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [patientId, setPatientId] = useState(initialData?.patientId ?? '')
  const [isTemplate, setIsTemplate] = useState(initialData?.isTemplate ?? false)
  const [days, setDays] = useState<DayState[]>(() =>
    Array.from({ length: 7 }, (_, i) => ({
      programId: initialData?.days?.find(d => d.dayOfWeek === i)?.programId ?? null,
    })),
  )
  // Houdt het schedule-id bij dat we momenteel bewerken. Bij een nieuw
  // schema wordt dit gevuld zodra autosave het record heeft aangemaakt.
  const [currentScheduleId, setCurrentScheduleId] = useState<string | undefined>(initialData?.id)
  const isEdit = !!currentScheduleId

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

  // CIE — toon aantal open signalen als chip zodra er een patiënt gekoppeld is
  const { data: openSignals } = trpc.insights.countOpenForPatient.useQuery(
    { patientId: patientId || '' },
    { enabled: !!patientId, staleTime: 60_000 },
  )

  // ── Autosave ──────────────────────────────────────────────────────────────
  type AutosaveValue = {
    name: string
    description: string
    patientId: string
    isTemplate: boolean
    days: DayState[]
  }
  const draftKey = useMemo(
    () => `mbt-weekschedule-draft-${initialData?.id ?? 'new'}`,
    [initialData?.id],
  )

  // One-shot draft restore.
  useEffect(() => {
    const draft = loadDraft<AutosaveValue>(draftKey)
    if (!draft) return
    setName(draft.name)
    setDescription(draft.description)
    setPatientId(draft.patientId)
    setIsTemplate(draft.isTemplate)
    setDays(draft.days)
    toast.info('Concept hersteld', { duration: 2000 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formValue: AutosaveValue = useMemo(
    () => ({ name, description, patientId, isTemplate, days }),
    [name, description, patientId, isTemplate, days],
  )

  const persist = async (val: AutosaveValue) => {
    const daysPayload = val.days.map((d, i) => ({ dayOfWeek: i, programId: d.programId }))
    if (currentScheduleId) {
      await saveMutation.mutateAsync({
        id: currentScheduleId,
        name: val.name.trim(),
        description: val.description.trim() || undefined,
        patientId: val.patientId || null,
        isTemplate: val.isTemplate,
        days: daysPayload,
      })
    } else {
      const created = await createMutation.mutateAsync({
        name: val.name.trim(),
        description: val.description.trim() || undefined,
        patientId: val.patientId || undefined,
        isTemplate: val.isTemplate,
        days: daysPayload,
      })
      setCurrentScheduleId(created.id)
      // Navigeer naar de edit-pagina (history.replaceState veroorzaakt een
      // PageTransition-remount waardoor lokale state weg is).
      router.replace(`/therapist/week-planner/${created.id}/edit`)
    }
    await utils.weekSchedules.list.invalidate()
  }

  const autosave = useAutosave({
    value: formValue,
    onSave: persist,
    draftKey,
    debounceMs: 1500,
    enabled: name.trim().length > 0,
  })

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

  /**
   * Quick-create flow: sla eerst het weekschema op (met de nieuwe programId
   * op de geselecteerde dag), dan door naar de program-editor zodat de
   * therapeut direct oefeningen kan toevoegen. Na opslaan daar brengt de
   * returnTo-param hem terug naar het weekschema.
   */
  const handleCreatedProgram = async (programId: string) => {
    if (pickerDay === null) return
    const dayIndex = pickerDay
    const nextDays = days.map((d, i) => (i === dayIndex ? { programId } : d))
    setDays(nextDays)
    setPickerOpen(false)
    setPickerDay(null)

    const patientLabel = patientOptions.find(p => p.id === patientId)?.name ?? 'patiënt'
    const finalName = name.trim() || `Weekplan · ${patientLabel}`
    const daysPayload = nextDays.map((d, i) => ({ dayOfWeek: i, programId: d.programId }))

    try {
      let scheduleId = initialData?.id
      if (scheduleId) {
        await saveMutation.mutateAsync({
          id: scheduleId,
          name: finalName,
          description: description.trim() || undefined,
          patientId: patientId || null,
          isTemplate,
          days: daysPayload,
        })
      } else {
        const created = await createMutation.mutateAsync({
          name: finalName,
          description: description.trim() || undefined,
          patientId: patientId || undefined,
          isTemplate,
          days: daysPayload,
        })
        scheduleId = created.id
        if (!name.trim()) setName(finalName)
      }
      await utils.weekSchedules.list.invalidate()
      const returnTo = `/therapist/week-planner/${scheduleId}/edit`
      router.push(`/therapist/programs/${programId}/edit?returnTo=${encodeURIComponent(returnTo)}`)
    } catch {
      toast.error('Schema opslaan mislukt — probeer het handmatig te Opslaan')
    }
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
          <div
            className="flex items-center gap-1.5 text-xs select-none"
            title={autosave.lastSavedAt ? `Laatst opgeslagen om ${autosave.lastSavedAt.toLocaleTimeString('nl-NL')}` : ''}
            style={{ color: P.inkMuted }}
          >
            {!name.trim() && (
              <span style={{ color: P.danger }}>Geef het schema een naam</span>
            )}
            {name.trim() && autosave.status === 'saving' && (
              <><Loader2 className="w-3 h-3 animate-spin" /> Opslaan…</>
            )}
            {name.trim() && autosave.status === 'pending' && (
              <><Loader2 className="w-3 h-3 animate-spin opacity-50" /> Wijzigingen…</>
            )}
            {name.trim() && autosave.status === 'saved' && (
              <><Check className="w-3 h-3" style={{ color: P.lime }} /> Opgeslagen</>
            )}
            {name.trim() && autosave.status === 'error' && (
              <button
                type="button"
                onClick={() => { void autosave.saveNow() }}
                className="flex items-center gap-1"
                style={{ color: P.danger }}
              >
                <AlertCircle className="w-3 h-3" /> Opslaan mislukt — opnieuw
              </button>
            )}
          </div>
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
        patientId={patientId || null}
        patientName={patientOptions.find(p => p.id === patientId)?.name ?? null}
        onPick={handlePickProgram}
        onCreated={handleCreatedProgram}
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
