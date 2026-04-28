'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { IconRunning, IconCardio } from '@/components/icons'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkSelect,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

type Patient = { id: string; name: string }
type DayProgram = { id: string; name: string } | null
type ScheduleDay = { id: string; dayOfWeek: number; program?: DayProgram }
type Schedule = { id: string; days: ScheduleDay[] }
type ProgramListItem = {
  id: string
  name: string
  isTemplate: boolean
  weeks: number
  daysPerWeek: number
  patient?: { id: string; name: string | null } | null
  _count?: { exercises: number }
}

export default function WeekPlannerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const selectedPatientId = searchParams.get('patientId') ?? ''

  // Cast naar shallow types; tRPC inference is te diep voor TS (TS2589).
  const patientsQuery = trpc.patients.list.useQuery()
  const patients: Patient[] = useMemo(
    () => ((patientsQuery.data as { id: string; name: string }[] | undefined) ?? []).map(p => ({ id: p.id, name: p.name })),
    [patientsQuery.data],
  )

  const schedulesQuery = trpc.weekSchedules.list.useQuery(
    { patientId: selectedPatientId, isTemplate: false },
    { enabled: !!selectedPatientId, staleTime: 30_000 },
  )
  const schedule: Schedule | null = ((schedulesQuery.data as Schedule[] | undefined) ?? [])[0] ?? null

  const setDayProgramMutation = trpc.weekSchedules.setDayProgram.useMutation({
    onSuccess: async () => {
      await utils.weekSchedules.list.invalidate()
    },
    onError: () => toast.error('Bijwerken mislukt'),
  })

  const setSelectedPatient = (patientId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (patientId) params.set('patientId', patientId)
    else params.delete('patientId')
    router.replace(`/therapist/week-planner${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const clearDay = (dayOfWeek: number) => {
    if (!selectedPatientId) return
    setDayProgramMutation.mutate({ patientId: selectedPatientId, dayOfWeek, programId: null })
  }

  const assignProgram = (dayOfWeek: number, programId: string) => {
    if (!selectedPatientId) return
    setDayProgramMutation.mutate({ patientId: selectedPatientId, dayOfWeek, programId })
  }

  const programByDay: Record<number, DayProgram> = {}
  if (schedule) for (const d of schedule.days) programByDay[d.dayOfWeek] = d.program ?? null

  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex flex-col gap-1">
          <Kicker>Planner</Kicker>
          <Display size="md">WEEKSCHEMA</Display>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Kies een patiënt en plan per weekdag
          </MetaLabel>
        </div>

        {/* Patient picker */}
        <Tile>
          <div className="flex items-center gap-3 flex-wrap">
            <MetaLabel>Patiënt</MetaLabel>
            <DarkSelect
              value={selectedPatientId}
              onChange={e => setSelectedPatient(e.target.value)}
              disabled={patientsQuery.isLoading}
              style={{ minWidth: 260 }}
            >
              <option value="">— Kies een patiënt —</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </DarkSelect>
            {selectedPatient && (
              <span
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
              >
                · {selectedPatient.name}
              </span>
            )}
          </div>
        </Tile>

        {/* Week grid */}
        {!selectedPatientId ? (
          <Tile>
            <div className="py-12 text-center">
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                Kies bovenaan een patiënt om hun weekschema te plannen.
              </p>
            </div>
          </Tile>
        ) : schedulesQuery.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <DayCell
                key={i}
                dayOfWeek={i}
                program={programByDay[i] ?? null}
                patientId={selectedPatientId}
                onClear={() => clearDay(i)}
                onAssign={programId => assignProgram(i, programId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DayCell({
  dayOfWeek,
  program,
  patientId,
  onClear,
  onAssign,
}: {
  dayOfWeek: number
  program: DayProgram
  patientId: string
  onClear: () => void
  onAssign: (programId: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <Tile>
      <div className="flex flex-col gap-2 min-h-[120px]">
        <div
          className="athletic-mono"
          style={{
            color: P.inkMuted,
            fontSize: 10,
            letterSpacing: '0.12em',
            fontWeight: 800,
            textTransform: 'uppercase',
          }}
        >
          {DAY_LABELS[dayOfWeek]}
        </div>

        {program ? (
          <div className="flex flex-col gap-1.5 flex-1">
            <div
              className="rounded-md px-2 py-1.5"
              style={{
                background: 'rgba(190,242,100,0.12)',
                border: `1px solid ${P.lime}`,
                color: P.lime,
              }}
            >
              <span
                className="athletic-mono"
                style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.3 }}
              >
                {program.name}
              </span>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="athletic-tap self-end w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: P.surfaceHi, color: P.danger, fontSize: 12 }}
              title="Verwijder van deze dag"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="athletic-tap flex-1 rounded-md flex items-center justify-center"
            style={{
              background: P.surfaceLow,
              border: `1px dashed ${P.line}`,
              color: P.inkMuted,
              minHeight: 60,
            }}
            title="Voeg programma toe"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Add menu (kies type) */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>
              {DAY_LABELS[dayOfWeek]} — programma toevoegen
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <MenuRow
              label="Uit opgeslagen schema's"
              hint="Kies een bestaand template of programma"
              onClick={() => {
                setMenuOpen(false)
                setPickerOpen(true)
              }}
            />
            <MenuRow
              label="Nieuw kracht"
              hint="Bouw een nieuw krachtprogramma"
              onClick={() => {
                setMenuOpen(false)
                window.location.href = `/therapist/programs/new?patientId=${encodeURIComponent(patientId)}`
              }}
            />
            <MenuRow
              label="Walk-Run"
              icon="run"
              hint="Wandel/loop-protocol op maat"
              onClick={() => {
                setMenuOpen(false)
                window.location.href = `/therapist/programs/new/walk-run?patientId=${encodeURIComponent(patientId)}`
              }}
            />
            <MenuRow
              label="Cardio"
              icon="cardio"
              hint="Fietsen, roeien, etc."
              onClick={() => {
                setMenuOpen(false)
                window.location.href = `/therapist/programs/new/cardio?patientId=${encodeURIComponent(patientId)}`
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Saved-programs picker */}
      <SavedProgramsDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        patientId={patientId}
        onPick={programId => {
          setPickerOpen(false)
          onAssign(programId)
        }}
      />
    </Tile>
  )
}

function MenuRow({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string
  hint: string
  icon?: 'run' | 'cardio'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-tap flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
      style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ background: P.surface, color: P.lime }}
      >
        {icon === 'run' ? <IconRunning size={16} /> : icon === 'cardio' ? <IconCardio size={16} /> : <Plus className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}>{label}</div>
        <div className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.04em', marginTop: 1 }}>
          {hint}
        </div>
      </div>
    </button>
  )
}

function SavedProgramsDialog({
  open,
  onOpenChange,
  patientId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  onPick: (programId: string) => void
}) {
  const [search, setSearch] = useState('')
  const programsQuery = trpc.programs.list.useQuery(undefined, { staleTime: 30_000, enabled: open })
  const all = (programsQuery.data as ProgramListItem[] | undefined) ?? []

  // Toon templates + programma's van deze patient (eigen programma's hebben voorrang voor de patient)
  const candidates = all.filter(p => p.isTemplate || p.patient?.id === patientId)
  const filtered = search
    ? candidates.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : candidates

  const templates = filtered.filter(p => p.isTemplate)
  const own = filtered.filter(p => !p.isTemplate)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: P.ink }}>Kies een schema</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <DarkInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam..."
          />
          {programsQuery.isLoading ? (
            <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 11 }}>Laden...</p>
          ) : filtered.length === 0 ? (
            <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 11 }}>
              Geen schema&apos;s gevonden.
            </p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <Kicker>Templates</Kicker>
                  {templates.map(p => (
                    <ProgramRow key={p.id} program={p} onPick={() => onPick(p.id)} />
                  ))}
                </div>
              )}
              {own.length > 0 && (
                <div className="space-y-1.5">
                  <Kicker>Programma&apos;s van deze patiënt</Kicker>
                  {own.map(p => (
                    <ProgramRow key={p.id} program={p} onPick={() => onPick(p.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <DarkButton variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Annuleren
            </DarkButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProgramRow({ program, onPick }: { program: ProgramListItem; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="athletic-tap w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left"
      style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}
        >
          {program.name}
        </div>
        <div
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.05em', marginTop: 1 }}
        >
          {program.weeks} wk · {program.daysPerWeek}×/wk · {program._count?.exercises ?? 0} oef.
        </div>
      </div>
      <Plus className="w-4 h-4 shrink-0" style={{ color: P.lime }} />
    </button>
  )
}
