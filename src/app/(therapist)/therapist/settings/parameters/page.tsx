'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Switch } from '@/components/ui/switch'
import type { CustomParameter, ParamType } from '@/components/programs/types'
import { useCustomParams } from '@/hooks/useCustomParams'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

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
      <Tile
        className={cn(isDragging && 'opacity-50')}
        style={{ padding: '12px 14px' }}
      >
        <div className="flex items-center gap-3">
          <button
            {...attributes}
            {...listeners}
            className="athletic-mono shrink-0 touch-none"
            style={{ color: P.inkDim, cursor: 'grab', fontSize: 14 }}
          >
            ⋮⋮
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{p.label}</span>
              <span
                className="athletic-mono px-2 py-0.5 rounded-full"
                style={{
                  background: P.surfaceHi,
                  color: P.inkMuted,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                {TYPE_LABELS[p.type]}
              </span>
              {p.unit && <span style={{ color: P.inkMuted, fontSize: 11 }}>{p.unit}</span>}
              {p.isGlobal && (
                <span
                  className="athletic-mono px-1.5 py-0.5 rounded-full"
                  style={{
                    background: P.lime,
                    color: P.bg,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    fontWeight: 800,
                  }}
                >
                  GLOBAAL
                </span>
              )}
            </div>
            {p.type === 'select' && p.options && (
              <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                {p.options.join(' · ')}
              </p>
            )}
            {(p.min !== undefined || p.max !== undefined) && (
              <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                {p.min !== undefined && `Min: ${p.min}`}
                {p.min !== undefined && p.max !== undefined && ' · '}
                {p.max !== undefined && `Max: ${p.max}`}
              </p>
            )}
            {p.defaultValue !== undefined && p.defaultValue !== '' && (
              <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                Standaard: {p.defaultValue}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Switch checked={p.isGlobal} onCheckedChange={() => onToggleGlobal(p.id)} className="scale-75" />
            <button
              onClick={() => onEdit(p)}
              className="athletic-mono px-2 py-1 rounded"
              style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}
            >
              WIJZIG
            </button>
            <button
              onClick={() => onDelete(p.id)}
              className="athletic-mono px-2 py-1 rounded"
              style={{ color: P.danger, fontSize: 12 }}
            >
              ×
            </button>
          </div>
        </div>
      </Tile>
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
    <div className="max-w-2xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/therapist/programs"
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← PROGRAMMA&apos;S
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Kicker>Configuratie</Kicker>
            <h1
              className="athletic-display"
              style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
            >
              CUSTOM PARAMETERS
            </h1>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Definieer eigen parameters · Sleep om volgorde te wijzigen
            </MetaLabel>
          </div>
          <DarkButton onClick={openCreate} size="sm" className="shrink-0">
            + <span className="hidden sm:inline ml-1">Nieuwe</span>
          </DarkButton>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={params.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
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
              <div
                className="flex flex-col items-center justify-center py-16 rounded-xl text-center"
                style={{ border: `2px dashed ${P.line}` }}
              >
                <p style={{ color: P.inkMuted, fontSize: 13 }}>Geen custom parameters</p>
                <DarkButton variant="secondary" size="sm" className="mt-3" onClick={openCreate}>
                  + Aanmaken
                </DarkButton>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>
              {editing ? 'Parameter bewerken' : 'Nieuwe parameter'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <MetaLabel>Label</MetaLabel>
              <DarkInput
                value={form.label ?? ''}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="bv. Kabelgewicht"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <MetaLabel>Type</MetaLabel>
              <div className="grid grid-cols-4 gap-1.5">
                {(['number', 'text', 'select', 'slider'] as ParamType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className="py-1.5 rounded athletic-mono transition-colors"
                    style={{
                      background: form.type === t ? P.lime : P.surfaceHi,
                      color: form.type === t ? P.bg : P.inkMuted,
                      border: `1px solid ${form.type === t ? P.lime : P.lineStrong}`,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {(form.type === 'number' || form.type === 'slider') && (
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <MetaLabel>Eenheid</MetaLabel>
                  <DarkInput
                    value={form.unit ?? ''}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="kg"
                    style={{ padding: '8px 10px', fontSize: 13 }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <MetaLabel>Min</MetaLabel>
                  <DarkInput
                    type="number"
                    value={form.min ?? ''}
                    onChange={e => setForm(f => ({ ...f, min: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    style={{ padding: '8px 10px', fontSize: 13 }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <MetaLabel>Max</MetaLabel>
                  <DarkInput
                    type="number"
                    value={form.max ?? ''}
                    onChange={e => setForm(f => ({ ...f, max: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    style={{ padding: '8px 10px', fontSize: 13 }}
                  />
                </div>
              </div>
            )}

            {form.type === 'select' && (
              <div className="flex flex-col gap-1.5">
                <MetaLabel>Opties</MetaLabel>
                <div className="flex gap-2">
                  <DarkInput
                    value={optionDraft}
                    onChange={e => setOptionDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                    placeholder="Voeg optie toe..."
                    style={{ padding: '8px 10px', fontSize: 13 }}
                  />
                  <DarkButton type="button" variant="secondary" size="sm" onClick={addOption}>
                    +
                  </DarkButton>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(form.options ?? []).map((o, i) => (
                    <span
                      key={i}
                      className="athletic-mono flex items-center gap-1 rounded px-2 py-0.5"
                      style={{
                        background: P.surfaceHi,
                        color: P.ink,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {o}
                      <button onClick={() => removeOption(i)} style={{ color: P.danger }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(form.type === 'number' || form.type === 'slider') && (
              <div className="flex flex-col gap-1.5">
                <MetaLabel>Standaardwaarde</MetaLabel>
                <DarkInput
                  type="number"
                  value={form.defaultValue ?? ''}
                  onChange={e => setForm(f => ({ ...f, defaultValue: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  placeholder="0"
                  style={{ padding: '8px 10px', fontSize: 13 }}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={form.isGlobal ?? false}
                onCheckedChange={v => setForm(f => ({ ...f, isGlobal: v }))}
              />
              <span style={{ color: P.ink, fontSize: 13 }}>
                Globaal (zichtbaar in alle programma&apos;s)
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <DarkButton onClick={handleSave} className="flex-1">
                {editing ? 'Opslaan' : 'Aanmaken'}
              </DarkButton>
              <DarkButton variant="secondary" onClick={() => setDialogOpen(false)}>
                Annuleren
              </DarkButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
