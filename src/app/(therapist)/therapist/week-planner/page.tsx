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
type Schedule = { id: string; weekNumber: number; days: ScheduleDay[] }
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
  // Dominante categorie afgeleid uit exercises (STRENGTH/CARDIO/...).
  dominantCategory?: string | null
}
type ExtraSession = {
  id: string
  scheduledAt: string | Date
  completedAt: string | Date | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
  duration: number | null
  weekdayIndex: number
  hasExercises: boolean
}

// Per-categorie kleurset voor chips. Tint = transparante achtergrond,
// border = volle kleur. Fallback op P.lime (Strength) als categorie onbekend.
type ChipStyle = { bg: string; border: string; text: string }
const CATEGORY_STYLES: Record<string, ChipStyle> = {
  STRENGTH:    { bg: 'rgba(190,242,100,0.12)', border: P.lime,   text: P.lime   },
  MOBILITY:    { bg: 'rgba(125,211,252,0.12)', border: P.ice,    text: P.ice    },
  PLYOMETRICS: { bg: 'rgba(244,194,97,0.12)',  border: P.gold,   text: P.gold   },
  PLYO:        { bg: 'rgba(244,194,97,0.12)',  border: P.gold,   text: P.gold   },
  CARDIO:      { bg: 'rgba(248,113,113,0.12)', border: P.danger, text: P.danger },
  STABILITY:   { bg: 'rgba(167,139,250,0.12)', border: P.purple, text: P.purple },
  MIXED:       { bg: 'rgba(190,242,100,0.12)', border: P.lime,   text: P.lime   },
}
const EXTRA_SESSION_STYLE: ChipStyle = {
  bg: 'rgba(244,194,97,0.10)',
  border: P.gold,
  text: P.gold,
}
function chipStyle(category?: string | null): ChipStyle {
  if (!category) return CATEGORY_STYLES.STRENGTH
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.STRENGTH
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
  const selectedWeek = Math.max(1, Number(searchParams.get('week') ?? '1') || 1)

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
  const allSchedules: Schedule[] = useMemo(
    () => ((schedulesQuery.data as Schedule[] | undefined) ?? []),
    [schedulesQuery.data],
  )
  const availableWeeks: number[] = useMemo(
    () => [...new Set(allSchedules.map(s => s.weekNumber ?? 1))].sort((a, b) => a - b),
    [allSchedules],
  )
  const schedule: Schedule | null =
    allSchedules.find(s => (s.weekNumber ?? 1) === selectedWeek) ?? null

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

  // Quick-workouts (SessionLog zonder programId) afgelopen 30 dagen
  const extraSessionsQuery = trpc.weekSchedules.recentExtraSessions.useQuery(
    { patientId: selectedPatientId, days: 30 },
    { enabled: !!selectedPatientId, staleTime: 30_000 },
  )
  const extraSessions: ExtraSession[] = useMemo(
    () => (extraSessionsQuery.data as ExtraSession[] | undefined) ?? [],
    [extraSessionsQuery.data],
  )
  const extraByWeekday: Record<number, ExtraSession[]> = {}
  for (const s of extraSessions) {
    if (!extraByWeekday[s.weekdayIndex]) extraByWeekday[s.weekdayIndex] = []
    extraByWeekday[s.weekdayIndex].push(s)
  }

  const setDayProgramMutation = trpc.weekSchedules.setDayProgram.useMutation({
    onSuccess: async () => {
      await utils.weekSchedules.list.invalidate()
    },
    onError: () => toast.error('Bijwerken mislukt'),
  })

  const copyWeekMutation = trpc.weekSchedules.copyWeek.useMutation({
    onSuccess: async ({ copied }) => {
      await utils.weekSchedules.list.invalidate()
      toast.success(`Week gekopieerd naar ${copied} ${copied === 1 ? 'week' : 'weken'}`)
    },
    onError: () => toast.error('Kopiëren mislukt'),
  })

  const deleteWeekMutation = trpc.weekSchedules.deleteWeek.useMutation({
    onSuccess: async () => {
      await utils.weekSchedules.list.invalidate()
      toast.success('Week verwijderd')
    },
    onError: () => toast.error('Verwijderen mislukt'),
  })

  const updateUrl = (patientId: string, week: number) => {
    const params = new URLSearchParams()
    if (patientId) params.set('patientId', patientId)
    if (week > 1) params.set('week', String(week))
    router.replace(`/therapist/week-planner${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const setSelectedPatient = (patientId: string) => updateUrl(patientId, 1)
  const setSelectedWeek = (week: number) => updateUrl(selectedPatientId, Math.max(1, week))

  const clearDay = (dayOfWeek: number) => {
    if (!selectedPatientId) return
    setDayProgramMutation.mutate({
      patientId: selectedPatientId,
      dayOfWeek,
      programId: null,
      weekNumber: selectedWeek,
    })
  }

  const assignProgram = (dayOfWeek: number, programId: string) => {
    if (!selectedPatientId) return
    setDayProgramMutation.mutate({
      patientId: selectedPatientId,
      dayOfWeek,
      programId,
      weekNumber: selectedWeek,
    })
  }

  const handleAddWeek = () => {
    const next = (availableWeeks[availableWeeks.length - 1] ?? 0) + 1
    setSelectedWeek(next || 1)
  }

  const handleDeleteWeek = () => {
    if (!selectedPatientId || !schedule) return
    if (!confirm(`Week ${selectedWeek} verwijderen?`)) return
    deleteWeekMutation.mutate({ patientId: selectedPatientId, weekNumber: selectedWeek })
    // Na verwijderen terug naar week 1
    setSelectedWeek(1)
  }

  const programByDay: Record<number, DayProgram> = {}
  if (schedule) for (const d of schedule.days) programByDay[d.dayOfWeek] = d.program ?? null

  const activePrograms = patientPrograms.filter(p => p.status === 'ACTIVE' || p.status === 'DRAFT')

  // Map: weekday-index (0=Ma..6=Zo) → programs die op die dag draaien
  // (afgeleid uit ProgramExercise.day, 1-indexed → 0-indexed).
  const programsByWeekday: Record<number, ProgramListItem[]> = {}
  for (const p of activePrograms) {
    for (const day of p.daysScheduled ?? []) {
      const dow = day - 1
      if (!programsByWeekday[dow]) programsByWeekday[dow] = []
      programsByWeekday[dow].push(p)
    }
  }

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

        {/* Week navigator */}
        {selectedPatientId && (
          <WeekNavigator
            availableWeeks={availableWeeks}
            selectedWeek={selectedWeek}
            onSelect={setSelectedWeek}
            onAddWeek={handleAddWeek}
            onCopyWeek={(targets) => copyWeekMutation.mutate({
              patientId: selectedPatientId,
              fromWeekNumber: selectedWeek,
              toWeekNumbers: targets,
            })}
            onDeleteWeek={schedule ? handleDeleteWeek : undefined}
            isCopying={copyWeekMutation.isPending}
          />
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
                programDayMatches={programsByWeekday[i] ?? []}
                extraSessions={extraByWeekday[i] ?? []}
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

function WeekNavigator({
  availableWeeks,
  selectedWeek,
  onSelect,
  onAddWeek,
  onCopyWeek,
  onDeleteWeek,
  isCopying,
}: {
  availableWeeks: number[]
  selectedWeek: number
  onSelect: (week: number) => void
  onAddWeek: () => void
  onCopyWeek: (targets: number[]) => void
  onDeleteWeek?: () => void
  isCopying: boolean
}) {
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set())

  // Tabs: alle bestaande weken + huidige als 'ie nog niet bestaat
  const visibleWeeks = useMemo(() => {
    const set = new Set(availableWeeks)
    set.add(selectedWeek)
    return [...set].sort((a, b) => a - b)
  }, [availableWeeks, selectedWeek])

  const openCopy = () => {
    // Default: stel volgende week voor als target
    const nextWeek = (Math.max(0, ...availableWeeks)) + 1
    setCopyTargets(new Set([nextWeek]))
    setCopyOpen(true)
  }

  const toggleTarget = (n: number) => {
    setCopyTargets(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const submitCopy = () => {
    const targets = [...copyTargets].filter(n => n !== selectedWeek)
    if (targets.length === 0) return
    onCopyWeek(targets)
    setCopyOpen(false)
  }

  // Voor copy-dialog: aanbiedbare doel-weken (niet de bron-week)
  const candidateTargets = useMemo(() => {
    const max = Math.max(0, ...availableWeeks, selectedWeek)
    const list: number[] = []
    for (let i = 1; i <= max + 4; i++) if (i !== selectedWeek) list.push(i)
    return list
  }, [availableWeeks, selectedWeek])

  return (
    <Tile>
      <div className="flex items-center gap-2 flex-wrap">
        <MetaLabel>Week</MetaLabel>
        <div className="flex items-center gap-1.5 flex-wrap">
          {visibleWeeks.map(n => {
            const isActive = n === selectedWeek
            return (
              <button
                key={n}
                type="button"
                onClick={() => onSelect(n)}
                className="athletic-tap athletic-mono px-3 py-1.5 rounded-md"
                style={{
                  background: isActive ? P.lime : P.surfaceHi,
                  color: isActive ? P.bg : P.ink,
                  border: `1px solid ${isActive ? P.lime : P.lineStrong}`,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Week {n}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onAddWeek}
            className="athletic-tap athletic-mono px-3 py-1.5 rounded-md flex items-center gap-1"
            style={{
              background: P.surfaceLow,
              color: P.inkMuted,
              border: `1px dashed ${P.line}`,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
            title="Volgende week toevoegen"
          >
            <Plus className="w-3 h-3" />
            Week
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DarkButton
            variant="secondary"
            size="sm"
            onClick={openCopy}
            disabled={!availableWeeks.includes(selectedWeek) || isCopying}
          >
            Kopieer week
          </DarkButton>
          {onDeleteWeek && (
            <button
              type="button"
              onClick={onDeleteWeek}
              className="athletic-tap w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: P.surfaceHi, color: P.danger }}
              title={`Week ${selectedWeek} verwijderen`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Copy week dialog */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>
              Kopieer week {selectedWeek} naar…
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em' }}>
              Bestaande weken worden overschreven.
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {candidateTargets.map(n => {
                const checked = copyTargets.has(n)
                const exists = availableWeeks.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleTarget(n)}
                    className="athletic-tap athletic-mono py-2 rounded-md"
                    style={{
                      background: checked ? P.lime : P.surfaceHi,
                      color: checked ? P.bg : P.ink,
                      border: `1px solid ${checked ? P.lime : P.lineStrong}`,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                    }}
                    title={exists ? 'Bestaat al — wordt overschreven' : 'Nieuw'}
                  >
                    Week {n}{exists ? ' ⚠' : ''}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <DarkButton variant="secondary" size="sm" onClick={() => setCopyOpen(false)}>
                Annuleren
              </DarkButton>
              <DarkButton
                variant="primary"
                size="sm"
                onClick={submitCopy}
                disabled={isCopying || copyTargets.size === 0}
              >
                Kopieer{copyTargets.size > 0 ? ` (${copyTargets.size})` : ''}
              </DarkButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Tile>
  )
}

function MoveDayDialog({
  open,
  onOpenChange,
  programId,
  programName,
  fromDay,
  occupiedDays,
  week,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  programId: string
  programName?: string
  fromDay: number | null
  occupiedDays: number[]
  week?: number
}) {
  const utils = trpc.useUtils()
  const changeDay = trpc.programs.changeDay.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.programs.list.invalidate(),
        utils.programs.get.invalidate({ id: programId }),
        utils.weekSchedules.list.invalidate(),
      ])
      toast.success('Dag verplaatst')
      onOpenChange(false)
    },
    onError: () => toast.error('Verplaatsen mislukt'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: P.ink }}>
            {fromDay !== null
              ? `${programName ? `${programName} · ` : ''}Verplaats ${DAY_LABELS[fromDay - 1]} naar…`
              : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-7 gap-1.5 pt-2">
          {DAY_LABELS.map((label, i) => {
            const targetDay = i + 1
            const isCurrent = fromDay === targetDay
            const isOccupied = occupiedDays.includes(targetDay) && !isCurrent
            const disabled = isCurrent || isOccupied || changeDay.isPending
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (fromDay === null) return
                  changeDay.mutate({ programId, fromDay, toDay: targetDay, week })
                }}
                className="athletic-tap athletic-mono py-2 rounded-md"
                style={{
                  background: P.surfaceHi,
                  color: disabled ? P.inkDim : P.ink,
                  border: `1px solid ${P.lineStrong}`,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: isCurrent ? 0.4 : isOccupied ? 0.5 : 1,
                }}
                title={isOccupied ? 'Al bezet binnen het programma' : ''}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="athletic-mono pt-1" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.04em' }}>
          Verandert alle oefeningen op die dag binnen het programma{week !== undefined ? ` (week ${week})` : ''}.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function ActiveProgramRow({ program }: { program: ProgramListItem }) {
  const [moveFromDay, setMoveFromDay] = useState<number | null>(null)
  const days = program.daysScheduled ?? []
  const planned = days.length > 0
  const style = chipStyle(program.dominantCategory)

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg flex-wrap"
      style={{ background: P.surfaceHi, border: `1px solid ${P.lineStrong}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="truncate"
            style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.04em' }}
          >
            {program.name}
          </span>
          {program.dominantCategory && (
            <span
              className="athletic-mono"
              style={{
                background: style.bg,
                color: style.text,
                border: `1px solid ${style.border}`,
                fontSize: 9,
                letterSpacing: '0.1em',
                padding: '1px 6px',
                borderRadius: 999,
                fontWeight: 800,
                textTransform: 'uppercase',
              }}
            >
              {program.dominantCategory}
            </span>
          )}
        </div>
        <div
          className="athletic-mono flex items-center gap-2 flex-wrap"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.05em', marginTop: 4 }}
        >
          <span>
            {program.weeks} wk · {program.daysPerWeek}×/wk · {program._count?.exercises ?? 0} oef.
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {planned ? (
            days.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setMoveFromDay(d)}
                className="athletic-tap athletic-mono px-2 py-1 rounded-md flex items-center gap-1"
                style={{
                  background: style.bg,
                  color: style.text,
                  border: `1px solid ${style.border}`,
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

      <MoveDayDialog
        open={moveFromDay !== null}
        onOpenChange={open => { if (!open) setMoveFromDay(null) }}
        programId={program.id}
        programName={program.name}
        fromDay={moveFromDay}
        occupiedDays={days}
      />
    </div>
  )
}

function DayCell({
  dayOfWeek,
  program,
  programDayMatches,
  extraSessions,
  patientId,
  onClear,
  onAssign,
}: {
  dayOfWeek: number
  program: DayProgram
  programDayMatches: ProgramListItem[]
  extraSessions: ExtraSession[]
  patientId: string
  onClear: () => void
  onAssign: (programId: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<ProgramListItem | null>(null)

  // WeekSchedule program telt mee mits 't niet al via Program.day getoond wordt
  const programDayIds = new Set(programDayMatches.map(p => p.id))
  const showWeekScheduleOverlay = program && !programDayIds.has(program.id)

  const hasContent =
    programDayMatches.length > 0 || !!showWeekScheduleOverlay || extraSessions.length > 0

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

        {hasContent ? (
          <div className="flex flex-col gap-1.5 flex-1">
            {/* Programma's afgeleid uit Program.day — klikbaar om te verplaatsen */}
            {programDayMatches.map(p => {
              const style = chipStyle(p.dominantCategory)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setMoveTarget(p)}
                  className="athletic-tap rounded-md px-2 py-1.5 text-left"
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    color: style.text,
                  }}
                  title={`${p.name}${p.dominantCategory ? ` · ${p.dominantCategory}` : ''} — klik om te verplaatsen`}
                >
                  <span
                    className="athletic-mono"
                    style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.3 }}
                  >
                    {p.name}
                  </span>
                </button>
              )
            })}

            {/* WeekSchedule overlay — een handmatig toegewezen programma (× om weg te halen) */}
            {showWeekScheduleOverlay && program && (
              <div className="flex items-center gap-1.5">
                <div
                  className="flex-1 rounded-md px-2 py-1.5"
                  style={{
                    background: P.surfaceHi,
                    border: `1px dashed ${P.line}`,
                    color: P.ink,
                  }}
                  title="Handmatig toegewezen via +"
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
                  className="athletic-tap shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ background: P.surfaceHi, color: P.danger, fontSize: 12 }}
                  title="Verwijder van deze dag"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick-workouts — door de atleet zelf gelogd, geen programma */}
            {extraSessions.map(s => {
              const date = new Date(s.scheduledAt)
              const dateLabel = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
              const isCompleted = s.status === 'COMPLETED' || !!s.completedAt
              return (
                <div
                  key={s.id}
                  className="rounded-md px-2 py-1.5"
                  style={{
                    background: EXTRA_SESSION_STYLE.bg,
                    border: `1px solid ${EXTRA_SESSION_STYLE.border}`,
                    color: EXTRA_SESSION_STYLE.text,
                  }}
                  title={`Eigen workout · ${dateLabel}${isCompleted ? ' (afgerond)' : ''}`}
                >
                  <span
                    className="athletic-mono"
                    style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.3, display: 'block' }}
                  >
                    Eigen workout
                  </span>
                  <span
                    className="athletic-mono"
                    style={{ fontSize: 9, opacity: 0.75, letterSpacing: '0.05em' }}
                  >
                    {dateLabel}{s.duration ? ` · ${Math.round(s.duration / 60)}m` : ''}
                  </span>
                </div>
              )
            })}

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="athletic-tap self-end w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: P.surfaceHi, color: P.inkMuted }}
              title="Voeg extra programma toe"
            >
              <Plus className="w-3.5 h-3.5" />
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

      {/* Move-day dialog voor klikken op Program.day chip */}
      <MoveDayDialog
        open={!!moveTarget}
        onOpenChange={open => { if (!open) setMoveTarget(null) }}
        programId={moveTarget?.id ?? ''}
        programName={moveTarget?.name}
        fromDay={moveTarget ? dayOfWeek + 1 : null}
        occupiedDays={moveTarget?.daysScheduled ?? []}
      />

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
