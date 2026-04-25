'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClipboardList, Rocket, Search } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { useRouter } from 'next/navigation'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: { id: string; name: string }
}

export function AssignFromTemplateDialog({ open, onOpenChange, patient }: Props) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: templates = [], isLoading } = (trpc.programs.list.useQuery as any)(
    { isTemplate: true },
    { enabled: open, staleTime: 30_000 },
  ) as { data: Array<{ id: string; name: string; weeks: number; daysPerWeek: number; _count: { exercises: number } }>, isLoading: boolean }

  const duplicate = trpc.programs.duplicate.useMutation()
  const save = trpc.programs.save.useMutation()

  const filtered = useMemo(() => {
    if (!query.trim()) return templates
    const q = query.toLowerCase()
    return templates.filter(t => t.name.toLowerCase().includes(q))
  }, [templates, query])

  const selected = templates.find(t => t.id === selectedId)

  function reset() {
    setSelectedId(null)
    setStartDate(new Date().toISOString().split('T')[0])
    setQuery('')
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  async function handleAssignAndDeploy() {
    if (!selected || !startDate) return
    setBusy(true)
    try {
      // Stap 1: dupliceer template als nieuw programma voor deze patient
      const created = await duplicate.mutateAsync({
        id: selected.id,
        name: selected.name,
        patientId: patient.id,
        isTemplate: false,
      })
      // Stap 2: zet 'm direct ACTIVE met de gekozen startdatum
      await save.mutateAsync({
        id: created.id,
        status: 'ACTIVE',
        startDate: new Date(startDate).toISOString(),
      })
      await utils.patients.get.invalidate({ id: patient.id })
      toast.success(`Programma toegewezen aan ${patient.name} en gedeployed.`, { duration: 3500 })
      close()
      router.push(`/therapist/programs/${created.id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toewijzen mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent style={{ borderRadius: '16px', maxWidth: '520px' }}>
        <DialogHeader>
          <DialogTitle>Programma vanaf template</DialogTitle>
          <DialogDescription>
            Kies een template uit je bibliotheek voor {patient.name}. Wordt direct gedeployed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Zoek template..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {isLoading && (
              <p className="text-xs text-muted-foreground py-3 text-center">Laden…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                {templates.length === 0
                  ? 'Nog geen templates in je bibliotheek. Maak er één via een nieuw programma → "Opslaan als template".'
                  : 'Geen templates gevonden.'}
              </p>
            )}
            {filtered.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="w-full text-left"
              >
                <div
                  className="flex items-center gap-3 p-3 rounded-xl border transition-colors"
                  style={
                    selectedId === t.id
                      ? { borderColor: '#BEF264', background: 'rgba(190,242,100,0.10)' }
                      : { borderColor: 'rgba(255,255,255,0.12)' }
                  }
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1C2425' }}>
                    <ClipboardList className="w-4 h-4 text-[#7B8889]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.weeks} wk · {t.daysPerWeek}/wk · {t._count.exercises} oefeningen
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Startdatum</Label>
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              max={new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString().split('T')[0]}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={close} disabled={busy}>
              Annuleren
            </Button>
            <Button
              className="flex-1 gap-2"
              style={{ background: '#BEF264', color: '#0A0E0F' }}
              disabled={!selected || !startDate || busy}
              onClick={handleAssignAndDeploy}
            >
              <Rocket className="w-4 h-4" />
              {busy ? 'Bezig…' : 'Toewijzen + deploy'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
