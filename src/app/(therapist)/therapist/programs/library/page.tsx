'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { trpc } from '@/lib/trpc/client'
import { Search, Layers, Copy, Pencil, Calendar, Users } from 'lucide-react'
import { toast } from 'sonner'

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
  const { data = [], isLoading } = trpc.programs.list.useQuery({ isTemplate: true }, { staleTime: 30_000 })
  const duplicateMutation = trpc.programs.duplicate.useMutation()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Alle')
  const [copyTarget, setCopyTarget] = useState<Program | null>(null)
  const [copyPatientId, setCopyPatientId] = useState('')
  const [copyName, setCopyName] = useState('')

  // Collect patients from existing non-template programs
  const { data: allPrograms = [] } = trpc.programs.list.useQuery(undefined, { staleTime: 30_000 })
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
      <div className="space-y-6 max-w-4xl">
        <div className="h-8 w-48 bg-zinc-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programma Bibliotheek</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{data.length} templates beschikbaar</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors border"
              style={
                category === cat
                  ? { background: '#4ECDC4', color: '#fff', borderColor: '#4ECDC4' }
                  : { background: '#fff', color: '#71717a', borderColor: '#e4e4e7' }
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
          <Layers className="w-8 h-8 text-zinc-300 mb-3" />
          <p className="text-sm text-muted-foreground">
            {data.length === 0 ? 'Nog geen templates in de bibliotheek' : 'Geen resultaten voor deze zoekopdracht'}
          </p>
          {data.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">Sla een programma op als template via de builder</p>
          )}
        </div>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kopieer naar patiënt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Maak een kopie van <strong>{copyTarget?.name}</strong> voor een patiënt.
            </p>
            <div>
              <Label className="text-xs">Naam</Label>
              <Input
                value={copyName}
                onChange={e => setCopyName(e.target.value)}
                className="mt-1.5"
                placeholder={copyTarget?.name ?? ''}
              />
            </div>
            <div>
              <Label className="text-xs">Patiënt (optioneel)</Label>
              <select
                value={copyPatientId}
                onChange={e => setCopyPatientId(e.target.value)}
                className="mt-1.5 w-full h-9 text-sm border rounded-md px-3 bg-white focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
              >
                <option value="">— Geen patiënt —</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                style={{ background: '#4ECDC4' }}
                onClick={handleCopyToPatient}
                disabled={duplicateMutation.isPending}
                className="flex-1"
              >
                {duplicateMutation.isPending ? 'Kopiëren...' : 'Kopiëren & bewerken'}
              </Button>
              <Button variant="outline" onClick={() => setCopyTarget(null)}>Annuleren</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LibraryCard({ program, onCopy }: { program: Program; onCopy: () => void }) {
  // Extract category from name prefix like "[Knie] ..."
  const categoryMatch = program.name.match(/^\[([^\]]+)\]/)
  const category = categoryMatch?.[1]
  const displayName = categoryMatch ? program.name.slice(categoryMatch[0].length).trim() : program.name

  return (
    <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {category && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-1.5 inline-block"
                style={{ background: '#ccfbf1', color: '#0D6B6E' }}>
                {category}
              </span>
            )}
            <h3 className="font-semibold text-sm leading-tight">{displayName}</h3>
            {program.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{program.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{program.weeks} wk · {program.daysPerWeek}×/wk</span>
              <span>{program._count?.exercises ?? 0} oefeningen</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              title="Kopieer naar patiënt"
              onClick={onCopy}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Link href={`/therapist/programs/${program.id}/edit`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
