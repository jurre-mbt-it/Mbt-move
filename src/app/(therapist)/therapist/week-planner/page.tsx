'use client'

import { Suspense, useMemo, useState } from 'react'
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
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
  weeks: number
  daysPerWeek: number
  patient?: { id: string; name: string | null } | null
  _count?: { exercises: number }
  // Unieke `day`-waarden uit Program.exercises (1=Ma..7=Zo).
  daysScheduled?: number[]
}

export default function WeekPlannerPage() {
  return (
    <Suspense>
      <WeekPlannerContent />
    </Suspense>
  )
}

function WeekPlannerContent() {
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

  // Programma's van deze patient — onafhankelijk van of ze al in een
  // WeekSchedule zijn ingepland. Zo ziet de therapeut meteen of er iets is.
  const patientProgramsQuery = trpc.programs.list.useQuery(
    { patientId: selectedPatientId },
    { enabled: !!selectedPatientId, staleTime: 30_000 },
  )
  const patientPrograms: ProgramListItem[] = useMemo(
    () => ((patientProgramsQuery.data as ProgramListItem[] | undefined) ?? []).filter(p => !p.isTemplate),
    [patientProgramsQuery.data],
  )

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

  const activePrograms = patientPrograms.filter(p => p.status === 'ACTIVE' || p.status === 'DRAFT')

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

        {/* Lopende programma's voor deze patient — los van WeekSchedule */}
        {selectedPatientId && activePrograms.length > 0 && (
          <Tile>
            <div className="flex flex-col gap-2">
              <Kicker>Lopende programma&apos;s ({activePrograms.length})</Kicker>
              <div className="flex flex-col gap-2">
                {activePrograms.map(p => (
                  <ActiveProgramRow key={p.id} program={p} />
                ))}
              </div>
            </div>
          </Tile>
        )}

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

function ActiveProgramRow({ program }: { program: ProgramListItem }) {
  const utils = trpc.useUtils()
  const [moveDialog, setMoveDialog] = useState<{ fromDay: number } | null>(null)
  const changeDay = trpc.programs.changeDay.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.programs.list.invalidate(),
        utils.weekSchedules.list.invalidate(),
      ])
      toast.success('Dag verplaatst')
    },
    onError: () => toast.error('Verplaatsen mislukt'),
  })

  const days = program.daysScheduled ?? []
  const planned = days.length > 0

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg flex-wrap"
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
          className="athletic-mono flex items-center gap-2 flex-wrap"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.05em', marginTop: 4 }}
        >
          <span>
            {program.weeks} wk · {program.daysPerWeek}×/wk · {program._count?.exercises ?? 0} oef.
          </span>
        </div>
        {/* Day chips met verplaats-knop per chip */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {planned ? (
            days.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setMoveDialog({ fromDay: d })}
                className="athletic-tap athletic-mono px-2 py-1 rounded-md flex items-center gap-1"
                style={{
                  background: 'rgba(190,242,100,0.12)',
                  color: P.lime,
                  border: `1px solid ${P.lime}`,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
                title="Klik om te verplaatsen"
              >
                {DAY_LABELS[d - 1]}
                <span style={{ fontSize: 9, opacity: 0.7 }}>↔</span>
              </button>
            ))
          ) : (
            <span
              className="athletic-mono"
              style={{ color: P.gold, fontSize: 10, letterSpacing: '0.05em' }}
            >
              Geen dagen ingepland in dit programma
            </span>
          )}
        </div>
      </div>
      <DarkButton
        variant="secondary"
        size="sm"
        href={`/therapist/programs/${program.id}/edit`}
      >
        Open
      </DarkButton>

      {/* Move-day dialog */}
      <Dialog open={!!moveDialog} onOpenChange={open => { if (!open) setMoveDialog(null) }}>
        <DialogContent
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>
              Verplaats {moveDialog ? DAY_LABELS[moveDialog.fromDay - 1] : ''} naar…
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-7 gap-1.5 pt-2">
            {DAY_LABELS.map((label, i) => {
              const targetDay = i + 1
              const isCurrent = moveDialog?.fromDay === targetDay
              const isOccupied = days.includes(targetDay) && !isCurrent
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isCurrent || isOccupied || changeDay.isPending}
                  onClick={() => {
                    if (!moveDialog) return
                    changeDay.mutate(
                      { programId: program.id, fromDay: moveDialog.fromDay, toDay: targetDay },
                      { onSuccess: () => setMoveDialog(null) },
                    )
                  }}
                  className="athletic-tap athletic-mono py-2 rounded-md"
                  style={{
                    background: isCurrent ? P.surfaceLow : isOccupied ? P.surfaceLow : P.surfaceHi,
                    color: isCurrent ? P.inkDim : isOccupied ? P.inkDim : P.ink,
                    border: `1px solid ${isCurrent ? P.line : P.lineStrong}`,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: isCurrent || isOccupied ? 'not-allowed' : 'pointer',
                    opacity: isCurrent ? 0.4 : isOccupied ? 0.5 : 1,
                  }}
                  title={isOccupied ? 'Al bezet door deze programma-dag' : ''}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p className="athletic-mono pt-1" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.04em' }}>
            Verandert alle oefeningen op die dag binnen het programma.
          </p>
        </DialogContent>
      </Dialog>
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
