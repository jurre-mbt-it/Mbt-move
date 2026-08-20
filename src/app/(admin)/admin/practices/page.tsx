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
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkDialogDescription,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'
import { Crown, Check } from 'lucide-react'

export default function AdminPracticesPage() {
  const [newName, setNewName] = useState('')

  /* Shallow casts hieronder: de tRPC-typeboom is te diep voor TypeScript
     (TS2589), zelfde reden als op vijf andere plekken in deze app. Raakt alleen
     dit interne beheerscherm; de server-kant blijft volledig getypeerd. */
  const utils = trpc.useUtils()
  const { data: practices = [], isLoading } = trpc.admin.listPractices.useQuery()
  const invalidate = () => {
    utils.admin.listPractices.invalidate()
    utils.admin.listUsers.invalidate()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = (trpc.admin.createPractice.useMutation as any)({
    onSuccess: () => {
      invalidate()
      setNewName('')
      toast.success('Praktijk aangemaakt')
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rename = (trpc.admin.renamePractice.useMutation as any)({
    onSuccess: () => {
      invalidate()
      toast.success('Praktijk hernoemd')
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remove = (trpc.admin.deletePractice.useMutation as any)({
    onSuccess: () => {
      invalidate()
      toast.success('Praktijk verwijderd')
    },
    onError: (e: { message: string }) => toast.error(e.message),
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
              onChangedOwner={() => invalidate()}
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

type PracticeOwner = {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
} | null

function PracticeRow({
  practice,
  onRename,
  onDelete,
  onChangedOwner,
  busy,
}: {
  practice: { id: string; name: string; _count?: { users: number }; owner?: PracticeOwner }
  onRename: (name: string) => void
  onDelete: () => void
  onChangedOwner: () => void
  busy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(practice.name)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const userCount = practice._count?.users ?? 0
  const owner = practice.owner ?? null
  const ownerLabel = owner
    ? owner.firstName?.trim() || owner.name?.trim() || owner.email
    : 'Geen eigenaar'

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
              <div className="flex items-center gap-3 mt-1">
                <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.1em' }}>
                  {userCount} GEBRUIKER{userCount === 1 ? '' : 'S'}
                </p>
                <button
                  type="button"
                  onClick={() => setOwnerOpen(true)}
                  className="flex items-center gap-1 athletic-mono"
                  style={{
                    color: owner ? P.lime : P.gold,
                    fontSize: 11,
                    letterSpacing: '0.1em',
                  }}
                  title={owner ? 'Wijzig eigenaar' : 'Wijs eigenaar toe'}
                >
                  <Crown className="w-3 h-3" />
                  {ownerLabel}
                </button>
              </div>
            </div>
            <DarkButton size="sm" variant="secondary" onClick={() => setEditing(true)}>Wijzig</DarkButton>
            <DarkButton size="sm" variant="danger" onClick={onDelete} disabled={busy}>Verwijder</DarkButton>
          </>
        )}
      </div>

      <OwnerPickerDialog
        open={ownerOpen}
        onClose={() => setOwnerOpen(false)}
        practiceId={practice.id}
        practiceName={practice.name}
        currentOwnerId={owner?.id ?? null}
        onSaved={() => { setOwnerOpen(false); onChangedOwner() }}
      />
    </Tile>
  )
}

function OwnerPickerDialog({
  open, onClose, practiceId, practiceName, currentOwnerId, onSaved,
}: {
  open: boolean
  onClose: () => void
  practiceId: string
  practiceName: string
  currentOwnerId: string | null
  onSaved: () => void
}) {
  const { data: members = [], isLoading } = trpc.admin.listPracticeMembers.useQuery(
    { practiceId },
    { enabled: open },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setOwner = (trpc.admin.setPracticeOwner.useMutation as any)({
    onSuccess: () => { toast.success('Eigenaar bijgewerkt'); onSaved() },
    onError: (err: { message: string }) => toast.error(err.message ?? 'Bijwerken mislukt'),
  })

  return (
    <DarkDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DarkDialogContent>
        <DarkDialogHeader>
          <DarkDialogTitle>Eigenaar van {practiceName}</DarkDialogTitle>
          <DarkDialogDescription>
            De eigenaar mag praktijkgegevens bewerken (adres, logo, email-footer).
            Andere therapeuten in de praktijk zien het profiel alleen-lezen.
          </DarkDialogDescription>
        </DarkDialogHeader>

        <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1 mt-2">
          {isLoading && (
            <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</p>
          )}
          {!isLoading && members.length === 0 && (
            <p className="text-sm" style={{ color: P.inkMuted }}>
              Nog geen therapeuten gekoppeld aan deze praktijk.
            </p>
          )}
          {members.map((m) => {
            const isCurrent = m.id === currentOwnerId
            const label = m.firstName?.trim() || m.name?.trim() || m.email
            return (
              <button
                key={m.id}
                type="button"
                disabled={setOwner.isPending}
                onClick={() => setOwner.mutate({ practiceId, userId: m.id })}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                style={{
                  background: isCurrent ? 'rgba(232,122,85,0.10)' : P.surface,
                  border: `1px solid ${isCurrent ? 'rgba(232,122,85,0.35)' : P.lineStrong}`,
                }}
              >
                <Crown
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isCurrent ? P.lime : P.inkMuted }}
                />
                <div className="flex-1 min-w-0">
                  <p style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}>{label}</p>
                  <p className="text-[11px]" style={{ color: P.inkMuted }}>{m.email}</p>
                </div>
                {isCurrent && <Check className="w-4 h-4" style={{ color: P.lime }} />}
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 mt-3">
          <DarkButton
            variant="ghost"
            onClick={onClose}
            disabled={setOwner.isPending}
            className="flex-1"
          >
            Sluiten
          </DarkButton>
          {currentOwnerId && (
            <DarkButton
              variant="danger"
              size="sm"
              disabled={setOwner.isPending}
              onClick={() => setOwner.mutate({ practiceId, userId: null })}
            >
              Eigenaar loskoppelen
            </DarkButton>
          )}
        </div>
      </DarkDialogContent>
    </DarkDialog>
  )
}
