'use client'

import { useState } from 'react'
import Link from 'next/link'
import { COLLECTION_COLORS } from '@/lib/exercise-constants'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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

export default function CollectionsPage() {
  const utils = trpc.useUtils()

  const { data: collections = [], isLoading: collectionsLoading } = trpc.exercises.listCollections.useQuery()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState<string>(COLLECTION_COLORS[0])
  const [activeCollection, setActiveCollection] = useState<string | null>(null)

  // Cast naar shallow type; tRPC inference is te diep voor TS (TS2589).
  type CollectionExercise = { id: string; name: string; description: string | null }
  const collectionExercisesQuery = trpc.exercises.getCollectionExercises.useQuery(
    { collectionId: activeCollection! },
    { enabled: !!activeCollection },
  )
  const collectionExercises: CollectionExercise[] = (collectionExercisesQuery.data as CollectionExercise[] | undefined) ?? []
  const exercisesLoading = collectionExercisesQuery.isLoading

  const createMutation = trpc.exercises.createCollection.useMutation({
    onSuccess: () => {
      utils.exercises.listCollections.invalidate()
      setDialogOpen(false)
      toast.success('Collectie aangemaakt')
    },
  })

  const updateMutation = trpc.exercises.updateCollection.useMutation({
    onSuccess: () => {
      utils.exercises.listCollections.invalidate()
      setDialogOpen(false)
      toast.success('Collectie bijgewerkt')
    },
  })

  const deleteMutation = trpc.exercises.deleteCollection.useMutation({
    onSuccess: () => {
      utils.exercises.listCollections.invalidate()
      if (activeCollection) setActiveCollection(null)
      toast.success('Collectie verwijderd')
    },
  })

  const removeMutation = trpc.exercises.removeFromCollection.useMutation({
    onSuccess: () => {
      utils.exercises.getCollectionExercises.invalidate({ collectionId: activeCollection! })
      utils.exercises.listCollections.invalidate()
      toast.success('Oefening verwijderd uit collectie')
    },
  })

  const openCreate = () => {
    setEditingId(null)
    setFormName('')
    setFormColor(COLLECTION_COLORS[0])
    setDialogOpen(true)
  }

  const openEdit = (col: { id: string; name: string; color: string }) => {
    setEditingId(col.id)
    setFormName(col.name)
    setFormColor(col.color)
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!formName.trim()) { toast.error('Naam is verplicht'); return }
    if (editingId) {
      updateMutation.mutate({ id: editingId, name: formName, color: formColor })
    } else {
      createMutation.mutate({ name: formName, color: formColor })
    }
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id })
  }

  const removeExercise = (exerciseId: string) => {
    if (!activeCollection) return
    removeMutation.mutate({ collectionId: activeCollection, exerciseId })
  }

  const active = collections.find(c => c.id === activeCollection)

  return (
    <div className="max-w-5xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/therapist/exercises"
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← BIBLIOTHEEK
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Kicker>Organisatie</Kicker>
            <h1
              className="athletic-display"
              style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
            >
              COLLECTIES
            </h1>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Organiseer oefeningen in persoonlijke collecties
            </MetaLabel>
          </div>
          <DarkButton onClick={openCreate} size="sm">
            + Nieuwe
          </DarkButton>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Collections list */}
        <div className="flex flex-col gap-3 md:col-span-1">
          {collectionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
            </div>
          ) : collections.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center rounded-xl"
              style={{ border: `2px dashed ${P.line}` }}
            >
              <p style={{ color: P.inkMuted, fontSize: 13 }}>Nog geen collecties</p>
              <DarkButton variant="secondary" size="sm" className="mt-3" onClick={openCreate}>
                + Aanmaken
              </DarkButton>
            </div>
          ) : (
            collections.map(col => (
              <Tile
                key={col.id}
                accentBar={activeCollection === col.id ? col.color : undefined}
                onClick={() => setActiveCollection(activeCollection === col.id ? null : col.id)}
                style={{
                  border: activeCollection === col.id ? `1px solid ${col.color}` : `1px solid transparent`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: col.color }}
                    />
                    <span
                      className="truncate"
                      style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}
                    >
                      {col.name}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => openEdit(col)}
                      className="athletic-mono px-2 py-1 rounded"
                      style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}
                    >
                      WIJZIG
                    </button>
                    <button
                      onClick={() => handleDelete(col.id)}
                      className="athletic-mono px-2 py-1 rounded"
                      style={{ color: P.danger, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <p
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em', marginTop: 6, fontWeight: 700 }}
                >
                  {col.count} OEFENING{col.count !== 1 ? 'EN' : ''}
                </p>
              </Tile>
            ))
          )}
        </div>

        {/* Collection detail */}
        <div className="md:col-span-2">
          {active ? (
            <Tile>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-4 h-4 rounded-full" style={{ background: active.color }} />
                <span style={{ color: P.ink, fontSize: 16, fontWeight: 800, letterSpacing: '0.02em' }}>
                  {active.name}
                </span>
                <span
                  className="athletic-mono px-2 py-0.5 rounded-full"
                  style={{
                    background: P.surfaceHi,
                    color: P.inkMuted,
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    fontWeight: 800,
                  }}
                >
                  {active.count}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {exercisesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
                  </div>
                ) : collectionExercises.length === 0 ? (
                  <div className="text-center py-8">
                    <p style={{ color: P.inkMuted, fontSize: 13 }}>
                      Geen oefeningen in deze collectie
                    </p>
                    <DarkButton
                      href="/therapist/exercises"
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                    >
                      Oefeningen toevoegen
                    </DarkButton>
                  </div>
                ) : (
                  collectionExercises.map(ex => (
                    <div
                      key={ex.id}
                      className="group flex items-center gap-3 p-3 rounded-lg transition-colors"
                      style={{ background: P.surfaceHi }}
                    >
                      <span
                        className="athletic-mono shrink-0"
                        style={{ color: P.inkDim, cursor: 'grab', fontSize: 12 }}
                      >
                        ⋮⋮
                      </span>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold"
                        style={{ background: active.color, color: P.bg, fontSize: 12 }}
                      >
                        {ex.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>{ex.name}</p>
                        <p
                          className="truncate"
                          style={{ color: P.inkMuted, fontSize: 12 }}
                        >
                          {ex.description}
                        </p>
                      </div>
                      <button
                        onClick={() => removeExercise(ex.id)}
                        className="athletic-mono px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: P.danger, fontSize: 12 }}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Tile>
          ) : (
            <div
              className={cn(
                'flex flex-col items-center justify-center h-full min-h-48 rounded-xl text-center p-8',
              )}
              style={{ border: `2px dashed ${P.line}` }}
            >
              <p style={{ color: P.inkMuted, fontSize: 13 }}>
                Selecteer een collectie om de inhoud te zien
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-sm"
          style={{ background: P.surface, color: P.ink, border: `1px solid ${P.lineStrong}` }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: P.ink }}>
              {editingId ? 'Collectie bewerken' : 'Nieuwe collectie'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <MetaLabel>Naam</MetaLabel>
              <DarkInput
                id="col-name"
                placeholder="bv. Knie revalidatie"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <MetaLabel>Kleur</MetaLabel>
              <div className="flex gap-2">
                {COLLECTION_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className={cn(
                      'w-7 h-7 rounded-full transition-transform',
                      formColor === c ? 'scale-110' : 'hover:scale-105'
                    )}
                    style={{
                      background: c,
                      boxShadow: formColor === c ? `0 0 0 2px ${P.bg}, 0 0 0 4px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <DarkButton
                onClick={handleSave}
                className="flex-1"
                disabled={createMutation.isPending || updateMutation.isPending}
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editingId ? 'Opslaan' : 'Aanmaken'}
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
