'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { IconRunning, IconCardio } from '@/components/icons'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string; accent: string }> = {
  ACTIVE:    { bg: 'rgba(190,242,100,0.14)', text: P.lime,     label: 'Actief',       accent: P.lime },
  DRAFT:     { bg: 'rgba(244,194,97,0.14)',  text: P.gold,     label: 'Concept',      accent: P.gold },
  COMPLETED: { bg: 'rgba(255,255,255,0.06)', text: P.inkMuted, label: 'Afgerond',     accent: P.inkDim },
  ARCHIVED:  { bg: 'rgba(255,255,255,0.06)', text: P.inkMuted, label: 'Gearchiveerd', accent: P.inkDim },
}

type Program = {
  id: string
  name: string
  description: string | null
  status: string
  isTemplate: boolean
  weeks: number
  daysPerWeek: number
  patient?: { id: string; name: string | null; email: string } | null
  _count?: { exercises: number }
}

export default function ProgramsPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: rawData, isLoading } = trpc.programs.list.useQuery(
    { isTemplate: false },
    { staleTime: 30_000 },
  )
  const duplicateMutation = trpc.programs.duplicate.useMutation()
  const deleteMutation = trpc.programs.delete.useMutation()

  const [duplicateTarget, setDuplicateTarget] = useState<Program | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicateAsTemplate, setDuplicateAsTemplate] = useState(false)

  // Cast tRPC-inferred list to local Program[] — the inferred type is too deep
  // (bevat Prisma-relations) en laat TS struikelen in de build.
  const programs: Program[] = (rawData ?? []) as Program[]

  const handleDuplicate = async () => {
    if (!duplicateTarget) return
    try {
      const created = await duplicateMutation.mutateAsync({
        id: duplicateTarget.id,
        name: duplicateName.trim() || undefined,
        isTemplate: duplicateAsTemplate,
      })
      await utils.programs.list.invalidate()
      toast.success('Programma gedupliceerd')
      setDuplicateTarget(null)
      router.push(`/therapist/programs/${created.id}/edit`)
    } catch {
      toast.error('Dupliceren mislukt')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" verwijderen?`)) return
    try {
      await deleteMutation.mutateAsync({ id })
      await utils.programs.list.invalidate()
      toast.success('Programma verwijderd')
    } catch {
      toast.error('Verwijderen mislukt')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
          <div className="h-8 w-48 rounded animate-pulse" style={{ background: P.surfaceHi }} />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <Kicker>Behandeling</Kicker>
            <Display size="md">PROGRAMMA&apos;S</Display>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Maak en beheer revalidatieprogramma&apos;s
            </MetaLabel>
          </div>
          <div className="flex gap-2 flex-wrap">
            <DarkButton
              variant="secondary"
              size="sm"
              href="/therapist/programs/new/walk-run"
            >
              <span className="inline-flex items-center gap-1.5">
                <IconRunning size={14} /> Walk-Run
              </span>
            </DarkButton>
            <DarkButton
              variant="secondary"
              size="sm"
              href="/therapist/programs/new/cardio"
            >
              <span className="inline-flex items-center gap-1.5">
                <IconCardio size={14} /> Nieuw Cardio
              </span>
            </DarkButton>
            <DarkButton variant="primary" size="sm" href="/therapist/programs/new">
              + Nieuw Kracht
            </DarkButton>
          </div>
        </div>

        {/* Programs */}
        <section className="space-y-3">
          <Kicker>Patiëntprogramma&apos;s ({programs.length})</Kicker>
          {programs.length === 0 ? (
            <Tile>
              <div className="py-12 flex flex-col items-center gap-3 text-center">
                <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen programma&apos;s</p>
                <DarkButton variant="secondary" size="sm" href="/therapist/programs/new">
                  + Programma aanmaken
                </DarkButton>
              </div>
            </Tile>
          ) : (
            <div className="space-y-3">
              {programs.map(p => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  onDuplicate={() => { setDuplicateTarget(p); setDuplicateName(`${p.name} (kopie)`); setDuplicateAsTemplate(false) }}
                  onDelete={() => handleDelete(p.id, p.name)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Duplicate dialog */}
        <Dialog open={!!duplicateTarget} onOpenChange={open => { if (!open) setDuplicateTarget(null) }}>
          <DialogContent
            className="max-w-sm"
            style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: P.ink }}>Programma dupliceren</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                Maak een kopie van <strong style={{ color: P.ink }}>{duplicateTarget?.name}</strong> met alle oefeningen.
              </p>
              <div className="space-y-1.5">
                <MetaLabel>Naam kopie</MetaLabel>
                <DarkInput
                  value={duplicateName}
                  onChange={e => setDuplicateName(e.target.value)}
                  placeholder={`${duplicateTarget?.name} (kopie)`}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="asTemplate"
                  checked={duplicateAsTemplate}
                  onChange={e => setDuplicateAsTemplate(e.target.checked)}
                  className="accent-[#BEF264]"
                />
                <label htmlFor="asTemplate" style={{ color: P.ink, fontSize: 13 }}>
                  Opslaan als template
                </label>
              </div>
              <div className="flex gap-2">
                <DarkButton
                  variant="primary"
                  onClick={handleDuplicate}
                  disabled={duplicateMutation.isPending}
                  className="flex-1"
                >
                  {duplicateMutation.isPending ? 'Kopiëren...' : 'Dupliceren'}
                </DarkButton>
                <DarkButton variant="secondary" onClick={() => setDuplicateTarget(null)}>
                  Annuleren
                </DarkButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function ProgramCard({
  program, isTemplate = false, onDuplicate, onDelete,
}: {
  program: Program
  isTemplate?: boolean
  onDuplicate: () => void
  onDelete: () => void
}) {
  const status = STATUS_COLORS[program.status] ?? STATUS_COLORS.DRAFT
  const [expanded, setExpanded] = useState(false)

  return (
    <Tile accentBar={status.accent}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="athletic-tap flex-1 min-w-0 text-left flex items-start gap-2"
          style={{ background: 'transparent' }}
        >
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
                {program.name}
              </h3>
              <span
                className="athletic-mono"
                style={{
                  background: status.bg,
                  color: status.text,
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                {status.label}
              </span>
              {isTemplate && (
                <span
                  className="athletic-mono"
                  style={{
                    background: P.surfaceHi,
                    color: P.inkMuted,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  Template
                </span>
              )}
            </div>
            {program.description && (
              <p
                className="athletic-mono truncate"
                style={{ color: P.inkMuted, fontSize: 11, marginTop: 3, letterSpacing: '0.03em' }}
              >
                {program.description}
              </p>
            )}
            <div
              className="athletic-mono flex items-center gap-3 mt-2 flex-wrap"
              style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
            >
              {program.patient?.name && <span>· {program.patient.name}</span>}
              <span>{program.weeks} wk · {program.daysPerWeek}×/wk</span>
              <span>{program._count?.exercises ?? 0} oefeningen</span>
            </div>
          </div>
          <span className="shrink-0 mt-0.5" style={{ color: P.inkMuted }}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={onDuplicate}
            title="Dupliceren"
            className="athletic-tap w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: P.surfaceHi, color: P.inkMuted, fontSize: 14 }}
          >
            ⧉
          </button>
          <DarkButton
            variant="secondary"
            size="sm"
            href={`/therapist/programs/${program.id}/edit`}
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
      {expanded && (
        <div
          className="mt-3 pt-3 border-t"
          style={{ borderColor: P.lineStrong }}
        >
          <ProgramExercisePreview programId={program.id} />
        </div>
      )}
    </Tile>
  )
}

type PreviewExercise = {
  id: string
  week: number
  day: number
  sets: number
  reps: number
  repUnit: string | null
  exercise: { name: string }
}

function ProgramExercisePreview({ programId }: { programId: string }) {
  const utils = trpc.useUtils()
  const { data: rawData, isLoading } = trpc.programs.get.useQuery(
    { id: programId },
    { staleTime: 60_000 },
  )
  // Cast naar lokaal shallow type; tRPC inference is te diep voor TS (TS2589).
  const data = rawData as { exercises: PreviewExercise[] } | undefined

  const [moveDialog, setMoveDialog] = useState<{ week: number; fromDay: number } | null>(null)
  const changeDay = trpc.programs.changeDay.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.programs.list.invalidate(),
        utils.programs.get.invalidate({ id: programId }),
      ])
      toast.success('Dag verplaatst')
      setMoveDialog(null)
    },
    onError: () => toast.error('Verplaatsen mislukt'),
  })

  if (isLoading) {
    return (
      <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.05em' }}>
        Laden...
      </p>
    )
  }
  if (!data || data.exercises.length === 0) {
    return (
      <p className="athletic-mono" style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.05em' }}>
        Geen oefeningen
      </p>
    )
  }

  const grouped = new Map<string, PreviewExercise[]>()
  for (const ex of data.exercises) {
    const key = `${ex.week}-${ex.day}`
    const list = grouped.get(key) ?? []
    list.push(ex)
    grouped.set(key, list)
  }

  // Bezette dagen per week — voor de move-dialog ("disabled" als al ingepland)
  const occupiedByWeek = new Map<number, Set<number>>()
  for (const ex of data.exercises) {
    const set = occupiedByWeek.get(ex.week) ?? new Set<number>()
    set.add(ex.day)
    occupiedByWeek.set(ex.week, set)
  }

  return (
    <>
      <div className="space-y-2.5">
        {[...grouped.entries()].map(([key, list]) => {
          const [weekStr, dayStr] = key.split('-')
          const week = Number(weekStr)
          const day = Number(dayStr)
          const dayLabel = DAY_LABELS[day - 1] ?? `Dag ${day}`
          return (
            <div key={key}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div
                  className="athletic-mono"
                  style={{
                    color: P.inkDim,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  Week {week} · {dayLabel}
                </div>
                <button
                  type="button"
                  onClick={() => setMoveDialog({ week, fromDay: day })}
                  className="athletic-tap athletic-mono px-2 py-0.5 rounded-md"
                  style={{
                    background: P.surfaceHi,
                    color: P.inkMuted,
                    border: `1px solid ${P.lineStrong}`,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                  title="Verplaats deze dag"
                >
                  Verplaats ↔
                </button>
              </div>
              <ul className="space-y-1">
                {list.map(ex => (
                  <li
                    key={ex.id}
                    className="flex items-center justify-between gap-3"
                    style={{ color: P.ink, fontSize: 12 }}
                  >
                    <span className="truncate">{ex.exercise.name}</span>
                    <span
                      className="athletic-mono shrink-0"
                      style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
                    >
                      {ex.sets}×{ex.reps}{ex.repUnit && ex.repUnit !== 'reps' ? ` ${ex.repUnit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Move-day dialog */}
      <Dialog open={!!moveDialog} onOpenChange={open => { if (!open) setMoveDialog(null) }}>
        <DialogContent
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>
              {moveDialog
                ? `Week ${moveDialog.week} · ${DAY_LABELS[moveDialog.fromDay - 1]} verplaatsen naar…`
                : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-7 gap-1.5 pt-2">
            {DAY_LABELS.map((label, i) => {
              const targetDay = i + 1
              const isCurrent = moveDialog?.fromDay === targetDay
              const occupied = moveDialog
                ? (occupiedByWeek.get(moveDialog.week)?.has(targetDay) ?? false)
                : false
              const disabled = isCurrent || (occupied && !isCurrent) || changeDay.isPending
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (!moveDialog) return
                    changeDay.mutate({
                      programId,
                      fromDay: moveDialog.fromDay,
                      toDay: targetDay,
                      week: moveDialog.week,
                    })
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
                    opacity: disabled ? 0.45 : 1,
                  }}
                  title={occupied && !isCurrent ? 'Al bezet in deze week' : ''}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p className="athletic-mono pt-1" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.04em' }}>
            Verandert alle oefeningen op deze dag binnen week {moveDialog?.week}.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
