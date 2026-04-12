'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { trpc } from '@/lib/trpc/client'
import { Plus, Layers, Users, Calendar, Copy, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { IconRunning, IconCardio } from '@/components/icons'

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: '#ccfbf1', text: '#0D6B6E', label: 'Actief' },
  DRAFT:     { bg: '#fef9c3', text: '#a16207', label: 'Concept' },
  COMPLETED: { bg: '#f1f5f9', text: '#475569', label: 'Afgerond' },
  ARCHIVED:  { bg: '#f1f5f9', text: '#9ca3af', label: 'Gearchiveerd' },
}

const TEMPLATE_CATEGORIES = ['Knie', 'Schouder', 'Rug', 'Heup', 'Enkel', 'Full Body', 'Revalidatie', 'Preventie']

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
      <div className="space-y-6 max-w-4xl">
        <div className="h-8 w-48 bg-zinc-100 rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Programma&apos;s</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Maak en beheer revalidatieprogramma&apos;s</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/therapist/programs/new/walk-run">
            <Button variant="outline" className="gap-2 border-[#0ea5e9] text-[#0ea5e9] hover:bg-[#0ea5e9]/10">
              <IconRunning size={16} /> Walk-Run Wizard
            </Button>
          </Link>
          <Link href="/therapist/programs/new/cardio">
            <Button variant="outline" className="gap-2 border-[#4ECDC4] text-[#4ECDC4] hover:bg-[#4ECDC4]/10">
              <IconCardio size={16} /> Nieuw Cardio
            </Button>
          </Link>
          <Link href="/therapist/programs/new">
            <Button style={{ background: '#4ECDC4' }} className="gap-2">
              <Plus className="w-4 h-4" />
              Nieuw Kracht
            </Button>
          </Link>
        </div>
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Layers className="w-4 h-4" /> Bibliotheek / Templates ({templates.length})
          </h2>
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
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Users className="w-4 h-4" /> Patiëntprogramma&apos;s ({programs.length})
        </h2>
        {programs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
            <p className="text-sm text-muted-foreground">Nog geen programma&apos;s</p>
            <Link href="/therapist/programs/new">
              <Button variant="outline" size="sm" className="mt-3">
                <Plus className="w-4 h-4 mr-1" /> Programma aanmaken
              </Button>
            </Link>
          </div>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Programma dupliceren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Maak een kopie van <strong>{duplicateTarget?.name}</strong> met alle oefeningen.
            </p>
            <div>
              <Label className="text-xs">Naam kopie</Label>
              <Input
                value={duplicateName}
                onChange={e => setDuplicateName(e.target.value)}
                className="mt-1.5"
                placeholder={`${duplicateTarget?.name} (kopie)`}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="asTemplate"
                checked={duplicateAsTemplate}
                onChange={e => setDuplicateAsTemplate(e.target.checked)}
                className="accent-[#4ECDC4]"
              />
              <label htmlFor="asTemplate" className="text-sm">Opslaan als template</label>
            </div>
            <div className="flex gap-2">
              <Button
                style={{ background: '#4ECDC4' }}
                onClick={handleDuplicate}
                disabled={duplicateMutation.isPending}
                className="flex-1"
              >
                {duplicateMutation.isPending ? 'Kopiëren...' : 'Dupliceren'}
              </Button>
              <Button variant="outline" onClick={() => setDuplicateTarget(null)}>Annuleren</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
    <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{program.name}</h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: status.bg, color: status.text }}
              >
                {status.label}
              </span>
              {isTemplate && <Badge variant="secondary" className="text-xs">Template</Badge>}
            </div>
            {program.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{program.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {program.patient?.name && (
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{program.patient.name}</span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />{program.weeks} wk · {program.daysPerWeek}×/wk
              </span>
              <span>{program._count?.exercises ?? 0} oefeningen</span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Dupliceren" onClick={onDuplicate}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Link href={`/therapist/programs/${program.id}/edit`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
              title="Verwijderen" onClick={onDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
