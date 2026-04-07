'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { COLLECTION_COLORS, MOCK_EXERCISES } from '@/lib/exercise-constants'
import { cn } from '@/lib/utils'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  FolderOpen,
  GripVertical,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

interface Collection {
  id: string
  name: string
  color: string
  exerciseIds: string[]
}

const INITIAL_COLLECTIONS: Collection[] = [
  { id: 'c1', name: 'Knie revalidatie', color: '#3ECF6A', exerciseIds: ['1', '2', '4'] },
  { id: 'c2', name: 'Schouder protocol', color: '#60a5fa', exerciseIds: ['6', '4'] },
  { id: 'c3', name: 'Warming-up basis', color: '#f59e0b', exerciseIds: ['3', '4', '5', '1'] },
]

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>(INITIAL_COLLECTIONS)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState(COLLECTION_COLORS[0])
  const [activeCollection, setActiveCollection] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormName('')
    setFormColor(COLLECTION_COLORS[0])
    setDialogOpen(true)
  }

  const openEdit = (col: Collection) => {
    setEditing(col)
    setFormName(col.name)
    setFormColor(col.color)
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!formName.trim()) { toast.error('Naam is verplicht'); return }
    if (editing) {
      setCollections(cs => cs.map(c => c.id === editing.id ? { ...c, name: formName, color: formColor } : c))
      toast.success('Collectie bijgewerkt')
    } else {
      const newCol: Collection = {
        id: `c${Date.now()}`,
        name: formName,
        color: formColor,
        exerciseIds: [],
      }
      setCollections(cs => [...cs, newCol])
      toast.success('Collectie aangemaakt')
    }
    setDialogOpen(false)
  }

  const handleDelete = (id: string) => {
    setCollections(cs => cs.filter(c => c.id !== id))
    if (activeCollection === id) setActiveCollection(null)
    toast.success('Collectie verwijderd')
  }

  const removeExercise = (collectionId: string, exerciseId: string) => {
    setCollections(cs => cs.map(c =>
      c.id === collectionId
        ? { ...c, exerciseIds: c.exerciseIds.filter(id => id !== exerciseId) }
        : c
    ))
  }

  const active = collections.find(c => c.id === activeCollection)
  const activeExercises = active
    ? MOCK_EXERCISES.filter(e => active.exerciseIds.includes(e.id))
    : []

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/therapist/exercises"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Terug naar bibliotheek
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Collecties beheren</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Organiseer oefeningen in persoonlijke collecties
            </p>
          </div>
          <Button onClick={openCreate} style={{ background: '#3ECF6A' }} className="gap-2">
            <Plus className="w-4 h-4" />
            Nieuwe collectie
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Collections list */}
        <div className="space-y-3 md:col-span-1">
          {collections.map(col => (
            <Card
              key={col.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                activeCollection === col.id ? 'ring-2' : ''
              )}
              style={{ borderRadius: '12px', ...(activeCollection === col.id ? { ringColor: col.color } : {}) }}
              onClick={() => setActiveCollection(activeCollection === col.id ? null : col.id)}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: col.color }}
                    />
                    <CardTitle className="text-sm font-semibold">{col.name}</CardTitle>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(col)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => handleDelete(col.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  {col.exerciseIds.length} oefening{col.exerciseIds.length !== 1 ? 'en' : ''}
                </p>
              </CardContent>
            </Card>
          ))}

          {collections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl">
              <FolderOpen className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm text-muted-foreground">Nog geen collecties</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Aanmaken
              </Button>
            </div>
          )}
        </div>

        {/* Collection detail */}
        <div className="md:col-span-2">
          {active ? (
            <Card style={{ borderRadius: '12px' }}>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full" style={{ background: active.color }} />
                  <CardTitle>{active.name}</CardTitle>
                  <Badge variant="secondary">{active.exerciseIds.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeExercises.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">Geen oefeningen in deze collectie</p>
                    <Link href="/therapist/exercises">
                      <Button variant="outline" size="sm" className="mt-3">
                        Oefeningen toevoegen
                      </Button>
                    </Link>
                  </div>
                ) : (
                  activeExercises.map(ex => (
                    <div key={ex.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-zinc-50 group">
                      <GripVertical className="w-4 h-4 text-zinc-300 cursor-grab shrink-0" />
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: active.color }}
                      >
                        {ex.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{ex.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{ex.description}</p>
                      </div>
                      <button
                        onClick={() => removeExercise(active.id, ex.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-48 border-2 border-dashed rounded-xl text-center p-8">
              <FolderOpen className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm text-muted-foreground">Selecteer een collectie om de inhoud te zien</p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Collectie bewerken' : 'Nieuwe collectie'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="col-name">Naam</Label>
              <Input
                id="col-name"
                placeholder="bv. Knie revalidatie"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label>Kleur</Label>
              <div className="flex gap-2 mt-1.5">
                {COLLECTION_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormColor(c)}
                    className={cn(
                      'w-7 h-7 rounded-full transition-transform',
                      formColor === c ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'
                    )}
                    style={{ background: c, ringColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} style={{ background: '#3ECF6A' }} className="flex-1">
                {editing ? 'Opslaan' : 'Aanmaken'}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuleren
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
