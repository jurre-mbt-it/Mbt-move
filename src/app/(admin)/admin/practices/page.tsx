/**
 * Admin practice-management: praktijken aanmaken, hernoemen, verwijderen.
 * Alleen bereikbaar voor role = ADMIN.
 */
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkHeader,
  DarkInput,
  DarkScreen,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function AdminPracticesPage() {
  const [newName, setNewName] = useState('')

  const utils = trpc.useUtils()
  const { data: practices = [], isLoading } = trpc.admin.listPractices.useQuery()
  const invalidate = () => {
    utils.admin.listPractices.invalidate()
    utils.admin.listUsers.invalidate()
  }

  const create = trpc.admin.createPractice.useMutation({
    onSuccess: () => {
      invalidate()
      setNewName('')
      toast.success('Praktijk aangemaakt')
    },
    onError: (e) => toast.error(e.message),
  })
  const rename = trpc.admin.renamePractice.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Praktijk hernoemd')
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.admin.deletePractice.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Praktijk verwijderd')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <DarkScreen>
      <DarkHeader title="Admin · Praktijken" backHref="/admin/dashboard" />

      <div className="max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Praktijken</Kicker>
          <h1 className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}>
            MULTI-TENANT BEHEER
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
            Per praktijk gescheiden patiënten + oefeningen. Users koppel je op /admin/users.
          </p>
        </div>

        {/* New practice */}
        <Tile>
          <MetaLabel>Nieuwe praktijk</MetaLabel>
          <form
            className="flex flex-col sm:flex-row gap-2 mt-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (newName.trim().length >= 2) create.mutate({ name: newName.trim() })
            }}
          >
            <DarkInput
              placeholder="Bv. Movement Based Therapy"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
            <DarkButton type="submit" disabled={create.isPending || newName.trim().length < 2} loading={create.isPending}>
              Aanmaken
            </DarkButton>
          </form>
        </Tile>

        {isLoading && (
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
        )}

        <div className="flex flex-col gap-2">
          {practices.map((p) => (
            <PracticeRow
              key={p.id}
              practice={p}
              onRename={(name) => rename.mutate({ id: p.id, name })}
              onDelete={() => {
                if (confirm(`Praktijk "${p.name}" verwijderen? Gebruikers behouden hun account; practiceId wordt null.`)) {
                  remove.mutate({ id: p.id })
                }
              }}
              busy={rename.isPending || remove.isPending}
            />
          ))}
          {!isLoading && practices.length === 0 && (
            <Tile>
              <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                Nog geen praktijken. Maak er hierboven eentje aan.
              </p>
            </Tile>
          )}
        </div>
      </div>
    </DarkScreen>
  )
}

function PracticeRow({
  practice,
  onRename,
  onDelete,
  busy,
}: {
  practice: { id: string; name: string; _count?: { users: number } }
  onRename: (name: string) => void
  onDelete: () => void
  busy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(practice.name)
  const userCount = practice._count?.users ?? 0

  return (
    <Tile>
      <div className="flex items-center gap-3">
        {editing ? (
          <>
            <DarkInput value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
            <DarkButton
              size="sm"
              onClick={() => { onRename(name.trim()); setEditing(false) }}
              disabled={busy || name.trim().length < 2}
            >
              Opslaan
            </DarkButton>
            <DarkButton size="sm" variant="ghost" onClick={() => { setEditing(false); setName(practice.name) }}>
              ×
            </DarkButton>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{practice.name}</p>
              <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}>
                {userCount} GEBRUIKER{userCount === 1 ? '' : 'S'}
              </p>
            </div>
            <DarkButton size="sm" variant="secondary" onClick={() => setEditing(true)}>Wijzig</DarkButton>
            <DarkButton size="sm" variant="danger" onClick={onDelete} disabled={busy}>Verwijder</DarkButton>
          </>
        )}
      </div>
    </Tile>
  )
}
