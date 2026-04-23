/**
 * Admin rehab-protocol catalog.
 * Lijst alle protocollen + inline toggle isActive + rename + delete.
 * Klik op rij → /admin/rehab-protocols/[id] voor phases+criteria detail.
 */
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkDialog,
  DarkDialogContent,
  DarkDialogHeader,
  DarkDialogTitle,
  DarkDialogTrigger,
  DarkHeader,
  DarkInput,
  DarkScreen,
  DarkTextarea,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

export default function AdminRehabProtocolsPage() {
  const utils = trpc.useUtils()
  const { data: protocols = [], isLoading } = trpc.rehab.adminListProtocols.useQuery()

  const update = trpc.rehab.adminUpdateProtocol.useMutation({
    onSuccess: () => {
      utils.rehab.adminListProtocols.invalidate()
      utils.rehab.listProtocols.invalidate()
      toast.success('Protocol bijgewerkt')
    },
    onError: (e) => toast.error(e.message),
  })
  const create = trpc.rehab.adminCreateProtocol.useMutation({
    onSuccess: () => {
      utils.rehab.adminListProtocols.invalidate()
      toast.success('Nieuw protocol aangemaakt')
      setCreateOpen(false)
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.rehab.adminDeleteProtocol.useMutation({
    onSuccess: () => {
      utils.rehab.adminListProtocols.invalidate()
      toast.success('Protocol verwijderd')
    },
    onError: (e) => toast.error(e.message),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newSpecialty, setNewSpecialty] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newRef, setNewRef] = useState('')

  return (
    <DarkScreen>
      <DarkHeader title="Admin · Revalidatie-protocollen" backHref="/admin/dashboard" />
      <div className="max-w-4xl w-full mx-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Rehab catalog</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
          >
            PROTOCOLLEN
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
            {protocols.length} protocol{protocols.length === 1 ? '' : 'len'}. Inactieve protocollen
            verschijnen niet in de therapeut-dropdown op patient-detail.
          </p>
        </div>

        <DarkDialog open={createOpen} onOpenChange={setCreateOpen}>
          <DarkDialogTrigger asChild>
            <DarkButton variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              + Nieuw protocol
            </DarkButton>
          </DarkDialogTrigger>
          <DarkDialogContent>
            <DarkDialogHeader>
              <DarkDialogTitle>Nieuw revalidatie-protocol</DarkDialogTitle>
            </DarkDialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <MetaLabel>Key (URL-safe, uniek)</MetaLabel>
                <DarkInput
                  placeholder="bv. meniscus-reparatie"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toLowerCase())}
                />
              </div>
              <div>
                <MetaLabel>Naam</MetaLabel>
                <DarkInput
                  placeholder="Volledige naam"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <MetaLabel>Specialty (categorie-tag)</MetaLabel>
                <DarkInput
                  placeholder="knee_meniscus / shoulder_ac_joint / ..."
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                />
              </div>
              <div>
                <MetaLabel>Beschrijving</MetaLabel>
                <DarkTextarea
                  placeholder="1-2 zinnen over doelgroep en scope"
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div>
                <MetaLabel>Bron / referentie (optioneel)</MetaLabel>
                <DarkInput
                  placeholder="Bv. Movement Based Therapy Amsterdam (2026). Eigen protocol."
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <DarkButton variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
                Annuleren
              </DarkButton>
              <DarkButton
                variant="primary"
                size="sm"
                disabled={create.isPending || newKey.length < 3 || newName.length < 2 || newSpecialty.length < 1}
                onClick={() =>
                  create.mutate({
                    key: newKey,
                    name: newName,
                    specialty: newSpecialty,
                    description: newDescription || undefined,
                    sourceReference: newRef || undefined,
                  })
                }
              >
                Aanmaken
              </DarkButton>
            </div>
          </DarkDialogContent>
        </DarkDialog>

        {isLoading && (
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.14em' }}>
            LADEN…
          </span>
        )}

        <div className="flex flex-col gap-2">
          {protocols.map((p) => (
            <Tile key={p.id} accentBar={p.isActive ? P.lime : P.inkDim}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/admin/rehab-protocols/${p.id}`}
                    className="hover:opacity-80"
                  >
                    <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{p.name}</p>
                    <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em', marginTop: 3 }}>
                      {p.specialty} · {p.phaseCount} fases · {p.criteriaCount} criteria · {p.trackerCount} actieve trackers
                    </p>
                  </Link>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <DarkButton
                    size="sm"
                    variant={p.isActive ? 'secondary' : 'primary'}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: p.id, isActive: !p.isActive })}
                  >
                    {p.isActive ? 'Uit' : 'Aan'}
                  </DarkButton>
                  <DarkButton
                    size="sm"
                    variant="ghost"
                    href={`/admin/rehab-protocols/${p.id}`}
                  >
                    Bewerk
                  </DarkButton>
                  <span title={p.trackerCount > 0 ? 'Nog in gebruik door actieve trackers' : 'Verwijder protocol'}>
                    <DarkButton
                      size="sm"
                      variant="danger"
                      disabled={remove.isPending || p.trackerCount > 0}
                      onClick={() => {
                        if (confirm(`Protocol "${p.name}" verwijderen? Alle fases en criteria gaan mee.`)) {
                          remove.mutate({ id: p.id })
                        }
                      }}
                    >
                      ×
                    </DarkButton>
                  </span>
                </div>
              </div>
            </Tile>
          ))}
        </div>
      </div>
    </DarkScreen>
  )
}
