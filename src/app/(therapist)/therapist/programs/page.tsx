'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const { data = [], isLoading } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000 })
  const duplicateMutation = trpc.programs.duplicate.useMutation()
  const deleteMutation = trpc.programs.delete.useMutation()

  const [duplicateTarget, setDuplicateTarget] = useState<Program | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicateAsTemplate, setDuplicateAsTemplate] = useState(false)

  const templates = data.filter(p => p.isTemplate)
  const programs  = data.filter(p => !p.isTemplate)

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

        {/* Templates */}
        {templates.length > 0 && (
          <section className="space-y-3">
            <Kicker>Bibliotheek · Templates ({templates.length})</Kicker>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map(p => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  isTemplate
                  onDuplicate={() => { setDuplicateTarget(p); setDuplicateName(`${p.name} (kopie)`); setDuplicateAsTemplate(false) }}
                  onDelete={() => handleDelete(p.id, p.name)}
                />
              ))}
            </div>
          </section>
        )}

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

  return (
    <Tile accentBar={status.accent}>
      <div className="flex items-start justify-between gap-3">
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
    </Tile>
  )
}
