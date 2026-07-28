'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { toast } from 'sonner'
import { IconCardio } from '@/components/icons'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkSelect,
  DarkTabs as Tabs,
  DarkTabsContent as TabsContent,
  DarkTabsList as TabsList,
  DarkTabsTrigger as TabsTrigger,
  Display,
  Kicker,
  MetaLabel,
  P,
  Skeleton,
  SkeletonList,
  SkeletonText,
  Tile,
} from '@/components/dark-ui'

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const LIBRARY_CATEGORIES = ['Alle', 'Knie', 'Schouder', 'Rug', 'Heup', 'Enkel', 'Full Body', 'Revalidatie', 'Preventie']

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string; accent: string }> = {
  ACTIVE:    { bg: 'rgba(95,208,138,0.14)', text: P.lime,     label: 'Actief',       accent: P.lime },
  DRAFT:     { bg: 'rgba(245,185,66,0.14)',  text: P.gold,     label: 'Concept',      accent: P.gold },
  COMPLETED: { bg: 'rgba(212,232,230,0.06)', text: P.inkMuted, label: 'Afgerond',     accent: P.inkDim },
  ARCHIVED:  { bg: 'rgba(212,232,230,0.06)', text: P.inkMuted, label: 'Gearchiveerd', accent: P.inkDim },
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

type TabValue = 'lopende' | 'templates'

function readTab(sp: URLSearchParams | null): TabValue {
  const v = sp?.get('tab')
  return v === 'templates' ? 'templates' : 'lopende'
}

export default function ProgramsPage() {
  // useSearchParams() bailt static prerender uit — Next 16 vereist daarom een
  // Suspense-boundary in de boom. Inner-component houdt de hook lokaal zodat
  // de page-export server-side veilig render-baar blijft.
  return (
    <Suspense fallback={<ProgramsPageFallback />}>
      <ProgramsPageInner />
    </Suspense>
  )
}

function ProgramsPageFallback() {
  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <Skeleton h={32} w={192} />
        <SkeletonList count={3} />
      </div>
    </div>
  )
}

function ProgramsPageInner() {
  const portal = usePortal()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = readTab(searchParams)

  const handleTabChange = (next: string) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'templates') sp.set('tab', 'templates')
    else sp.delete('tab')
    const qs = sp.toString()
    router.replace(qs ? `${portal.base}/programs?${qs}` : `${portal.base}/programs`, { scroll: false })
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <Kicker>Behandeling</Kicker>
            <Display size="md">PROGRAMMA&apos;S</Display>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Lopende programma&apos;s en herbruikbare schema&apos;s
            </MetaLabel>
          </div>
          <div className="flex gap-2 flex-wrap">
            <DarkButton variant="secondary" size="sm" href={`${portal.base}/programs/new/workout`}>
              <span className="inline-flex items-center gap-1.5">
                <IconCardio size={14} /> Nieuw Cardio
              </span>
            </DarkButton>
            <DarkButton variant="primary" size="sm" href={`${portal.base}/programs/new`}>
              + Nieuw Kracht
            </DarkButton>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList
            className="w-full grid grid-cols-2 rounded-xl"
            style={{ background: P.surface, border: `1px solid ${P.line}` }}
          >
            <TabsTrigger value="lopende">Lopende programma&apos;s</TabsTrigger>
            <TabsTrigger value="templates">Schema-bibliotheek</TabsTrigger>
          </TabsList>

          <TabsContent value="lopende" className="space-y-3">
            <MyOwnProgramsPanel />
            <ActiveProgramsPanel />
          </TabsContent>

          <TabsContent value="templates" className="space-y-3">
            <TemplateLibraryPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ─── Eigen (aan jezelf toegewezen) programma's ───────────────────────────────
//
// Programma's met patientId = de ingelogde gebruiker zelf (persoonlijke
// trainingsmodus: therapeut/admin traint als zichzelf). Die vallen buiten de
// reguliere "Lopende"-lijst — die filtert patient-programma's eruit — én buiten
// een patient-profiel, want je bent geen eigen patiënt. Zonder deze sectie zijn
// ze daardoor nergens te verwijderen. `programs.delete` staat dit al toe
// (creator/admin). Zelf-verbergend: leeg → niets tonen (geen ruis voor
// therapeuten zonder eigen programma's).
function MyOwnProgramsPanel() {
  const portal = usePortal()
  const utils = trpc.useUtils()
  const { data: me } = trpc.auth.getMe.useQuery()
  const selfId = me?.id ?? null

  const queryInput = { isTemplate: false, patientId: selfId ?? '', includeAssigned: true }
  const { data: rawMine } = trpc.programs.list.useQuery(queryInput, {
    enabled: !!selfId,
    staleTime: 30_000,
  })
  const deleteMutation = trpc.programs.delete.useMutation()

  const mine: Program[] = (rawMine ?? []) as Program[]

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" uit je eigen trainingsomgeving verwijderen?`)) return
    try {
      await deleteMutation.mutateAsync({ id })
      await utils.programs.list.invalidate(queryInput)
      toast.success('Programma verwijderd')
    } catch {
      toast.error('Verwijderen mislukt')
    }
  }

  if (!selfId || mine.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1">
        <Kicker>Mijn eigen programma&apos;s ({mine.length})</Kicker>
        <MetaLabel style={{ textTransform: 'none', fontWeight: 500 }}>
          Aan je eigen account toegewezen (persoonlijke training). Hier kun je ze verwijderen.
        </MetaLabel>
      </div>
      {mine.map(p => {
        const status = STATUS_COLORS[p.status] ?? STATUS_COLORS.DRAFT
        return (
          <Tile key={p.id} accentBar={status.accent}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3
                  className="truncate"
                  style={{ color: P.ink, fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                >
                  {p.name}
                </h3>
                <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                  {status.label} · {p._count?.exercises ?? 0} oefeningen · {p.weeks}w × {p.daysPerWeek}d
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DarkButton variant="secondary" size="sm" href={`${portal.base}/programs/${p.id}/edit`}>
                  Bekijk
                </DarkButton>
                <DarkButton
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(p.id, p.name)}
                  disabled={deleteMutation.isPending}
                >
                  Verwijder
                </DarkButton>
              </div>
            </div>
          </Tile>
        )
      })}
    </div>
  )
}

// ─── Tab 1: lopende programma's ──────────────────────────────────────────────

function ActiveProgramsPanel() {
  const portal = usePortal()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: rawData, isLoading } = trpc.programs.list.useQuery(
    { isTemplate: false },
    { staleTime: 30_000 },
  )
  const duplicateMutation = trpc.programs.duplicate.useMutation()
  const deleteMutation = trpc.programs.delete.useMutation()
  // Lege concepten (achtergebleven door de iPad-snelle-flow) — opruim-banner.
  const { data: emptyDrafts = [] } = trpc.programs.emptyDrafts.useQuery(undefined, { staleTime: 30_000 })
  const cleanupMutation = trpc.programs.cleanupEmptyDrafts.useMutation({
    onSuccess: (r) => {
      utils.programs.list.invalidate()
      utils.programs.emptyDrafts.invalidate()
      toast.success(`${r.deleted} lege concepten opgeruimd`)
    },
    onError: () => toast.error('Opruimen mislukt'),
  })

  const [duplicateTarget, setDuplicateTarget] = useState<Program | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicateAsTemplate, setDuplicateAsTemplate] = useState(false)

  const programs: Program[] = (rawData ?? []) as Program[]

  const handleCleanup = () => {
    if (!confirm(
      `${emptyDrafts.length} lege concepten verwijderen?\n\n` +
      'Alleen concepten zonder oefeningen, cardio of koppelingen worden verwijderd.',
    )) return
    cleanupMutation.mutate()
  }

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
      router.push(`${portal.base}/programs/${created.id}/edit`)
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
    return <SkeletonList count={3} />
  }

  return (
    <>
      <Kicker>Patiëntprogramma&apos;s ({programs.length})</Kicker>
      {emptyDrafts.length >= 2 && (
        <button
          type="button"
          onClick={handleCleanup}
          disabled={cleanupMutation.isPending}
          className="w-full flex items-center gap-3 rounded-xl text-left athletic-tap"
          style={{
            background: 'rgba(245,185,66,0.08)',
            border: `1px solid ${P.gold}`,
            padding: '12px 14px',
            opacity: cleanupMutation.isPending ? 0.6 : 1,
          }}
        >
          <div className="flex-1 min-w-0">
            <span className="athletic-mono" style={{ color: P.gold, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }}>
              {emptyDrafts.length} LEGE CONCEPTEN
            </span>
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
              Achtergebleven zonder inhoud, klik om op te ruimen
            </p>
          </div>
          <span className="athletic-mono shrink-0" style={{ color: P.gold, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }}>
            {cleanupMutation.isPending ? 'BEZIG…' : 'OPRUIMEN'}
          </span>
        </button>
      )}
      {programs.length === 0 ? (
        <Tile>
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen programma&apos;s</p>
            <DarkButton variant="secondary" size="sm" href={`${portal.base}/programs/new`}>
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
              onDuplicate={() => {
                setDuplicateTarget(p)
                setDuplicateName(`${p.name} (kopie)`)
                setDuplicateAsTemplate(false)
              }}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!duplicateTarget} onOpenChange={open => { if (!open) setDuplicateTarget(null) }}>
        <DialogContent aria-describedby={undefined}
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
                className="accent-[#E87A55]"
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
    </>
  )
}

function ProgramCard({
  program, onDuplicate, onDelete,
}: {
  program: Program
  onDuplicate: () => void
  onDelete: () => void
}) {
  const portal = usePortal()
  const status = STATUS_COLORS[program.status] ?? STATUS_COLORS.DRAFT
  const [expanded, setExpanded] = useState(false)
  const utils = trpc.useUtils()

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
            href={`${portal.base}/programs/${program.id}/edit`}
            prefetch={() => utils.programs.get.prefetch({ id: program.id })}
          >
            Wijzig
          </DarkButton>
          <button
            type="button"
            onClick={onDelete}
            title="Verwijderen"
            className="athletic-tap w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: P.surfaceLow, color: P.danger, fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: P.lineStrong }}>
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
    return <SkeletonText lines={4} />
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

      <Dialog open={!!moveDialog} onOpenChange={open => { if (!open) setMoveDialog(null) }}>
        <DialogContent aria-describedby={undefined}
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

// ─── Tab 2: schema-bibliotheek ───────────────────────────────────────────────

function TemplateLibraryPanel() {
  const portal = usePortal()
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: rawTemplates, isLoading } = trpc.programs.list.useQuery(
    { isTemplate: true },
    { staleTime: 30_000 },
  )
  const duplicateMutation = trpc.programs.duplicate.useMutation()
  const data: Program[] = (rawTemplates ?? []) as Program[]

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Alle')
  const [copyTarget, setCopyTarget] = useState<Program | null>(null)
  const [copyPatientId, setCopyPatientId] = useState('')
  const [copyName, setCopyName] = useState('')

  const { data: allProgramsRaw } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000 })
  const allPrograms: Program[] = (allProgramsRaw ?? []) as Program[]
  const patients = Array.from(
    new Map(
      allPrograms.filter(p => p.patient).map(p => [p.patient!.id, p.patient!])
    ).values()
  )

  const filtered = data.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory =
      category === 'Alle' ||
      p.name.includes(`[${category}]`) ||
      p.description?.includes(category)
    return matchesSearch && matchesCategory
  })

  const handleCopyToPatient = async () => {
    if (!copyTarget) return
    try {
      const created = await duplicateMutation.mutateAsync({
        id: copyTarget.id,
        name: copyName.trim() || copyTarget.name.replace(/^\[[^\]]+\]\s*/, ''),
        patientId: copyPatientId || undefined,
        isTemplate: false,
      })
      await utils.programs.list.invalidate()
      toast.success('Programma gekopieerd naar patiënt')
      setCopyTarget(null)
      router.push(`${portal.base}/programs/${created.id}/edit`)
    } catch {
      toast.error('Kopiëren mislukt')
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <Kicker>{data.length} schema&apos;s beschikbaar</Kicker>
        <DarkInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op naam..."
        />
        <div className="flex gap-2 flex-wrap">
          {LIBRARY_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="athletic-tap athletic-mono px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
              style={
                category === cat
                  ? {
                      background: P.brand,
                      color: P.bg,
                      border: `1px solid ${P.brand}`,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }
                  : {
                      background: P.surfaceHi,
                      color: P.inkMuted,
                      border: `1px solid ${P.lineStrong}`,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Tile>
          <div className="py-12 flex flex-col items-center gap-2 text-center">
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              {data.length === 0
                ? "Nog geen schema's in de bibliotheek"
                : 'Geen resultaten voor deze zoekopdracht'}
            </p>
            {data.length === 0 && (
              <p style={{ color: P.inkDim, fontSize: 11 }}>
                Sla een programma op als schema via de builder
              </p>
            )}
          </div>
        </Tile>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(p => (
            <LibraryCard
              key={p.id}
              program={p}
              onCopy={() => {
                setCopyTarget(p)
                setCopyPatientId('')
                setCopyName(p.name.replace(/^\[[^\]]+\]\s*/, ''))
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={!!copyTarget} onOpenChange={open => { if (!open) setCopyTarget(null) }}>
        <DialogContent aria-describedby={undefined}
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>Kopieer naar patiënt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              Maak een kopie van <strong style={{ color: P.ink }}>{copyTarget?.name}</strong> voor een patiënt.
            </p>
            <div className="space-y-1.5">
              <MetaLabel>Naam</MetaLabel>
              <DarkInput
                value={copyName}
                onChange={e => setCopyName(e.target.value)}
                placeholder={copyTarget?.name ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <MetaLabel>Patiënt (optioneel)</MetaLabel>
              <DarkSelect
                value={copyPatientId}
                onChange={e => setCopyPatientId(e.target.value)}
              >
                <option value="">Geen patiënt</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                ))}
              </DarkSelect>
            </div>
            <div className="flex gap-2">
              <DarkButton
                variant="primary"
                onClick={handleCopyToPatient}
                disabled={duplicateMutation.isPending}
                className="flex-1"
              >
                {duplicateMutation.isPending ? 'Kopiëren...' : 'Kopiëren & bewerken'}
              </DarkButton>
              <DarkButton variant="secondary" onClick={() => setCopyTarget(null)}>
                Annuleren
              </DarkButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LibraryCard({ program, onCopy }: { program: Program; onCopy: () => void }) {
  const portal = usePortal()
  const categoryMatch = program.name.match(/^\[([^\]]+)\]/)
  const category = categoryMatch?.[1]
  const displayName = categoryMatch
    ? program.name.slice(categoryMatch[0].length).trim()
    : program.name
  const [expanded, setExpanded] = useState(false)
  const utils = trpc.useUtils()

  return (
    <Tile accentBar={P.brand}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="athletic-tap flex-1 min-w-0 text-left flex items-start gap-2"
          style={{ background: 'transparent' }}
        >
          <div className="flex-1 min-w-0">
            {category && (
              <span
                className="athletic-mono inline-block mb-2"
                style={{
                  background: 'rgba(232,122,85,0.14)',
                  color: P.brand,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                {category}
              </span>
            )}
            <h3
              style={{
                color: P.ink,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}
            >
              {displayName}
            </h3>
            {program.description && (
              <p
                className="athletic-mono line-clamp-2"
                style={{ color: P.inkMuted, fontSize: 11, marginTop: 4, letterSpacing: '0.03em' }}
              >
                {program.description}
              </p>
            )}
            <div
              className="athletic-mono flex items-center gap-3 mt-2 flex-wrap"
              style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
            >
              <span>{program.weeks} wk · {program.daysPerWeek}×/wk</span>
              <span>{program._count?.exercises ?? 0} oefeningen</span>
            </div>
          </div>
          <span className="shrink-0 mt-0.5" style={{ color: P.inkMuted }}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={onCopy}
            title="Kopieer naar patiënt"
            className="athletic-tap w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: P.surfaceHi, color: P.inkMuted, fontSize: 14 }}
          >
            ⧉
          </button>
          <DarkButton
            variant="secondary"
            size="sm"
            href={`${portal.base}/programs/${program.id}/edit`}
            prefetch={() => utils.programs.get.prefetch({ id: program.id })}
          >
            ✎
          </DarkButton>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: P.lineStrong }}>
          <SchemaExercisePreview programId={program.id} />
        </div>
      )}
    </Tile>
  )
}

function SchemaExercisePreview({ programId }: { programId: string }) {
  const { data: rawData, isLoading } = trpc.programs.get.useQuery(
    { id: programId },
    { staleTime: 60_000 },
  )
  const data = rawData as { exercises: PreviewExercise[] } | undefined

  if (isLoading) {
    return <SkeletonText lines={4} />
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

  return (
    <div className="space-y-2.5">
      {[...grouped.entries()].map(([key, list]) => {
        const [week, day] = key.split('-')
        return (
          <div key={key}>
            <div
              className="athletic-mono"
              style={{
                color: P.inkDim,
                fontSize: 10,
                letterSpacing: '0.1em',
                fontWeight: 800,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Week {week} · Dag {day}
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
  )
}
