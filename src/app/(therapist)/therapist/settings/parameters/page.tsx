'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { CustomParameter, ParamType } from '@/components/programs/types'
import { useCustomParams } from '@/hooks/useCustomParams'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, GripVertical, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const TYPE_LABELS: Record<ParamType, string> = {
  number: 'Getal',
  text:   'Tekst',
  select: 'Keuze',
  slider: 'Slider',
}

function SortableParamCard({
  p,
  onEdit,
  onDelete,
  onToggleGlobal,
}: {
  p: CustomParameter
  onEdit: (p: CustomParameter) => void
  onDelete: (id: string) => void
  onToggleGlobal: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style}>
      <Card style={{ borderRadius: '10px' }} className={cn(isDragging && 'opacity-50 shadow-xl')}>
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              {...attributes}
              {...listeners}
              className="text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{p.label}</span>
                <Badge variant="secondary" className="text-xs">{TYPE_LABELS[p.type]}</Badge>
                {p.unit && <span className="text-xs text-muted-foreground">{p.unit}</span>}
                {p.isGlobal && (
                  <span className="text-xs px-1.5 py-0 rounded-full font-medium text-white" style={{ background: '#3ECF6A' }}>
                    Globaal
                  </span>
                )}
              </div>
              {p.type === 'select' && p.options && (
                <p className="text-xs text-muted-foreground mt-0.5">{p.options.join(' · ')}</p>
              )}
              {(p.min !== undefined || p.max !== undefined) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.min !== undefined && `Min: ${p.min}`}
                  {p.min !== undefined && p.max !== undefined && ' · '}
                  {p.max !== undefined && `Max: ${p.max}`}
                </p>
              )}
              {p.defaultValue !== undefined && p.defaultValue !== '' && (
                <p className="text-xs text-muted-foreground mt-0.5">Standaard: {p.defaultValue}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Switch checked={p.isGlobal} onCheckedChange={() => onToggleGlobal(p.id)} className="scale-75" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(p)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
                onClick={() => onDelete(p.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ParametersPage() {
  const { params, setParams } = useCustomParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomParameter | null>(null)
  const [form, setForm] = useState<Partial<CustomParameter>>({
    label: '', type: 'number', unit: '', isGlobal: false,
  })
  const [optionDraft, setOptionDraft] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const openCreate = () => {
    setEditing(null)
    setForm({ label: '', type: 'number', unit: '', isGlobal: false, options: [], defaultValue: '' })
    setDialogOpen(true)
  }

  const openEdit = (p: CustomParameter) => {
    setEditing(p)
    setForm({ ...p })
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!form.label?.trim()) { toast.error('Label is verplicht'); return }
    if (editing) {
      setParams(ps => ps.map(p => p.id === editing.id ? { ...p, ...form } as CustomParameter : p))
      toast.success('Parameter bijgewerkt')
    } else {
      const newParam: CustomParameter = {
        id: `cp-${Date.now()}`,
        label: form.label!,
        type: form.type ?? 'number',
        unit: form.unit,
        options: form.options,
        min: form.min,
        max: form.max,
        defaultValue: form.defaultValue,
        isGlobal: form.isGlobal ?? false,
        order: params.length,
      }
      setParams(ps => [...ps, newParam])
      toast.success('Parameter aangemaakt')
    }
    setDialogOpen(false)
  }

  const handleDelete = (id: string) => {
    setParams(ps => ps.filter(p => p.id !== id))
    toast.success('Parameter verwijderd')
  }

  const toggleGlobal = (id: string) =>
    setParams(ps => ps.map(p => p.id === id ? { ...p, isGlobal: !p.isGlobal } : p))

  const addOption = () => {
    const t = optionDraft.trim()
    if (!t) return
    setForm(f => ({ ...f, options: [...(f.options ?? []), t] }))
    setOptionDraft('')
  }

  const removeOption = (i: number) =>
    setForm(f => ({ ...f, options: (f.options ?? []).filter((_, idx) => idx !== i) }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setParams(ps => {
      const oldIdx = ps.findIndex(p => p.id === active.id)
      const newIdx = ps.findIndex(p => p.id === over.id)
      return arrayMove(ps, oldIdx, newIdx).map((p, i) => ({ ...p, order: i }))
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/therapist/programs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="w-4 h-4" /> Terug naar programma&apos;s
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Custom parameters</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Definieer eigen parameters · Sleep om volgorde te wijzigen
            </p>
          </div>
          <Button onClick={openCreate} style={{ background: '#3ECF6A' }} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nieuwe parameter</span>
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={params.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {params.map(p => (
              <SortableParamCard
                key={p.id}
                p={p}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggleGlobal={toggleGlobal}
              />
            ))}
            {params.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
                <p className="text-sm text-muted-foreground">Geen custom parameters</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1" /> Aanmaken
                </Button>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Parameter bewerken' : 'Nieuwe parameter'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Label</Label>
              <Input
                value={form.label ?? ''}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="bv. Kabelgewicht"
                className="mt-1.5"
                autoFocus
              />
            </div>

            <div>
              <Label>Type</Label>
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {(['number', 'text', 'select', 'slider'] as ParamType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={cn(
                      'py-1.5 rounded text-xs font-medium border transition-colors',
                      form.type === t ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-muted-foreground hover:border-zinc-400'
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {(form.type === 'number' || form.type === 'slider') && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Eenheid</Label>
                  <Input
                    value={form.unit ?? ''}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="kg"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Min</Label>
                  <Input
                    type="number"
                    value={form.min ?? ''}
                    onChange={e => setForm(f => ({ ...f, min: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max</Label>
                  <Input
                    type="number"
                    value={form.max ?? ''}
                    onChange={e => setForm(f => ({ ...f, max: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              </div>
            )}

            {form.type === 'select' && (
              <div>
                <Label className="text-xs">Opties</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={optionDraft}
                    onChange={e => setOptionDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                    placeholder="Voeg optie toe..."
                    className="h-8 text-xs"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={addOption}>+</Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(form.options ?? []).map((o, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-zinc-100 rounded px-2 py-0.5">
                      {o}
                      <button onClick={() => removeOption(i)} className="text-zinc-400 hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(form.type === 'number' || form.type === 'slider') && (
              <div>
                <Label className="text-xs">Standaardwaarde</Label>
                <Input
                  type="number"
                  value={form.defaultValue ?? ''}
                  onChange={e => setForm(f => ({ ...f, defaultValue: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="mt-1 h-8 text-xs"
                  placeholder="0"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={form.isGlobal ?? false}
                onCheckedChange={v => setForm(f => ({ ...f, isGlobal: v }))}
              />
              <Label className="text-sm">Globaal (zichtbaar in alle programma&apos;s)</Label>
            </div>

            <div className="flex gap-2 pt-1">
              <Button style={{ background: '#3ECF6A' }} onClick={handleSave} className="flex-1">
                {editing ? 'Opslaan' : 'Aanmaken'}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
