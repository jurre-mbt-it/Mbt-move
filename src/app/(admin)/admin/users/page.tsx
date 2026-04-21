/**
 * Admin user-management: rol + praktijk per gebruiker zetten.
 * Alleen bereikbaar voor role = ADMIN (gated via (admin)/layout).
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
  DarkSelect,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

const ROLES = ['PATIENT', 'ATHLETE', 'THERAPIST', 'ADMIN'] as const

export default function AdminUsersPage() {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  const utils = trpc.useUtils()
  const { data: users = [], isLoading } = trpc.admin.listUsers.useQuery({
    query: query || undefined,
    role: (roleFilter || undefined) as (typeof ROLES)[number] | undefined,
  })
  const { data: practices = [] } = trpc.admin.listPractices.useQuery()

  const setRole = trpc.admin.setUserRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate()
      toast.success('Rol bijgewerkt')
    },
    onError: (e) => toast.error(e.message),
  })
  const setPractice = trpc.admin.setUserPractice.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate()
      toast.success('Praktijk bijgewerkt')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <DarkScreen>
      <DarkHeader title="Admin · Users" backHref="/admin/dashboard" />

      <div className="max-w-4xl w-full mx-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Kicker>Gebruikers</Kicker>
          <h1 className="athletic-display"
            style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}>
            ROLLEN &amp; PRAKTIJKEN
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4 }}>
            Beheer user-rollen en koppel gebruikers aan praktijken.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <DarkInput
            placeholder="Zoek op naam of e-mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <DarkSelect value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="sm:w-48">
            <option value="">Alle rollen</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </DarkSelect>
        </div>

        {isLoading && (
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>LADEN…</span>
        )}

        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <Tile key={u.id}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }} className="truncate">
                    {u.name ?? '—'}
                  </p>
                  <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.04em', textTransform: 'none', fontWeight: 500 }}>
                    {u.email}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:w-auto">
                  <div className="flex flex-col gap-1">
                    <MetaLabel>Rol</MetaLabel>
                    <DarkSelect
                      value={u.role}
                      onChange={(e) => setRole.mutate({ userId: u.id, role: e.target.value as (typeof ROLES)[number] })}
                      disabled={setRole.isPending}
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </DarkSelect>
                  </div>
                  <div className="flex flex-col gap-1">
                    <MetaLabel>Praktijk</MetaLabel>
                    <DarkSelect
                      value={u.practiceId ?? ''}
                      onChange={(e) => setPractice.mutate({ userId: u.id, practiceId: e.target.value || null })}
                      disabled={setPractice.isPending}
                      style={{ padding: '6px 10px', fontSize: 13 }}
                    >
                      <option value="">— geen —</option>
                      {practices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </DarkSelect>
                  </div>
                </div>
              </div>
            </Tile>
          ))}
          {!isLoading && users.length === 0 && (
            <Tile>
              <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                Geen gebruikers gevonden.
              </p>
            </Tile>
          )}
        </div>
      </div>
    </DarkScreen>
  )
}
