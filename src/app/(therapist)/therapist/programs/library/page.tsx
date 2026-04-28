'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
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

const CATEGORIES = ['Alle', 'Knie', 'Schouder', 'Rug', 'Heup', 'Enkel', 'Full Body', 'Revalidatie', 'Preventie']

type Program = {
  id: string
  name: string
  description: string | null
  status: string
  weeks: number
  daysPerWeek: number
  _count?: { exercises: number }
  patient?: { id: string; name: string | null; email: string } | null
}

export default function ProgramLibraryPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: rawTemplates, isLoading } = trpc.programs.list.useQuery({ isTemplate: true }, { staleTime: 30_000 })
  const duplicateMutation = trpc.programs.duplicate.useMutation()
  const data: Program[] = (rawTemplates ?? []) as Program[]

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Alle')
  const [copyTarget, setCopyTarget] = useState<Program | null>(null)
  const [copyPatientId, setCopyPatientId] = useState('')
  const [copyName, setCopyName] = useState('')

  // Collect patients from existing non-template programs
  const { data: allProgramsRaw } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000 })
  const allPrograms: Program[] = (allProgramsRaw ?? []) as Program[]
  const patients = Array.from(
    new Map(
      allPrograms.filter(p => p.patient).map(p => [p.patient!.id, p.patient!])
    ).values()
  )

  const filtered = data.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'Alle' || p.name.includes(`[${category}]`) || p.description?.includes(category)
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
      router.push(`/therapist/programs/${created.id}/edit`)
    } catch {
      toast.error('Kopiëren mislukt')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
          <div className="h-8 w-48 rounded animate-pulse" style={{ background: P.surfaceHi }} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: P.surfaceHi }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex flex-col gap-1">
          <Kicker>Bibliotheek</Kicker>
          <Display size="md">SCHEMA&apos;S</Display>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            {data.length} schema&apos;s beschikbaar
          </MetaLabel>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <DarkInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam..."
          />
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="athletic-tap athletic-mono px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                style={
                  category === cat
                    ? { background: P.lime, color: P.bg, border: `1px solid ${P.lime}`, letterSpacing: '0.08em', textTransform: 'uppercase' }
                    : { background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.lineStrong}`, letterSpacing: '0.08em', textTransform: 'uppercase' }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <Tile>
            <div className="py-12 flex flex-col items-center gap-2 text-center">
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                {data.length === 0 ? "Nog geen schema's in de bibliotheek" : 'Geen resultaten voor deze zoekopdracht'}
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

        {/* Copy to patient dialog */}
        <Dialog open={!!copyTarget} onOpenChange={open => { if (!open) setCopyTarget(null) }}>
          <DialogContent
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
                  <option value="">— Geen patiënt —</option>
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
      </div>
    </div>
  )
}

function LibraryCard({ program, onCopy }: { program: Program; onCopy: () => void }) {
  // Extract category from name prefix like "[Knie] ..."
  const categoryMatch = program.name.match(/^\[([^\]]+)\]/)
  const category = categoryMatch?.[1]
  const displayName = categoryMatch ? program.name.slice(categoryMatch[0].length).trim() : program.name
  const [expanded, setExpanded] = useState(false)

  return (
    <Tile accentBar={P.lime}>
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
                  background: 'rgba(190,242,100,0.14)',
                  color: P.lime,
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
            href={`/therapist/programs/${program.id}/edit`}
          >
            ✎
          </DarkButton>
        </div>
      </div>
      {expanded && (
        <div
          className="mt-3 pt-3 border-t"
          style={{ borderColor: P.lineStrong }}
        >
          <SchemaExercisePreview programId={program.id} />
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

function SchemaExercisePreview({ programId }: { programId: string }) {
  const { data: rawData, isLoading } = trpc.programs.get.useQuery(
    { id: programId },
    { staleTime: 60_000 },
  )
  // Cast naar lokaal shallow type; tRPC inference is te diep voor TS (TS2589).
  const data = rawData as { exercises: PreviewExercise[] } | undefined

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
