'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { trpc } from '@/lib/trpc/client'
import { Plus, Search, Users, CheckCircle2, AlertCircle, Clock, Mail, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: 'rgba(190,242,100,0.14)', text: '#BEF264' },
  DRAFT:     { label: 'Concept',   bg: 'rgba(244,194,97,0.14)', text: '#F4C261' },
  COMPLETED: { label: 'Afgerond',  bg: 'rgba(255,255,255,0.06)', text: '#7B8889' },
  ARCHIVED:  { label: 'Gearchiveerd', bg: 'rgba(255,255,255,0.06)', text: '#7B8889' },
}

type QuickFilter = 'all' | 'active' | 'low-compliance'

export default function PatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientsPageInner />
    </Suspense>
  )
}

function PatientsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = (searchParams.get('filter') as QuickFilter | null) ?? 'all'
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(initialFilter)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'PATIENT' | 'THERAPIST' | 'ATHLETE'>('PATIENT')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteExists, setInviteExists] = useState(false)

  const { data: patients = [], isLoading } = trpc.patients.list.useQuery()

  async function handleInvite(e: React.FormEvent, resend = false) {
    e.preventDefault()
    setInviteLoading(true)
    setInviteExists(false)
    try {
      const res = await fetch('/api/auth/invite-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole, resend }),
      })
      const data = await res.json()
      if (res.status === 409 && !resend) {
        setInviteExists(true)
        return
      }
      if (!res.ok) throw new Error(data.error)
      toast.success(resend
        ? `Nieuwe uitnodiging verstuurd naar ${inviteEmail}`
        : `Uitnodiging verstuurd naar ${inviteEmail}`)
      setInviteOpen(false)
      setInviteName('')
      setInviteEmail('')
      setInviteRole('PATIENT')
      setInviteExists(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Er ging iets mis')
    } finally {
      setInviteLoading(false)
    }
  }

  const activeCount = patients.filter(p => p.programStatus === 'ACTIVE').length
  const lowComplianceCount = 0 // TODO: add compliance tracking

  const filtered = patients
    .filter(p => {
      if (quickFilter === 'active') return p.programStatus === 'ACTIVE'
      if (quickFilter === 'low-compliance') return false // TODO
      return true
    })
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patiënten</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Beheer en monitor je patiënten</p>
        </div>
        <Button
          style={{ background: '#BEF264' }}
          className="gap-2"
          onClick={() => setInviteOpen(true)}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Uitnodigen</span>
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <QuickStat
          icon={<Users className="w-4 h-4" style={{ color: '#6366f1' }} />}
          value={patients.length}
          label="Totaal"
          active={quickFilter === 'all'}
          onClick={() => setQuickFilter('all')}
        />
        <QuickStat
          icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#BEF264' }} />}
          value={activeCount}
          label="Actief"
          active={quickFilter === 'active'}
          onClick={() => setQuickFilter(quickFilter === 'active' ? 'all' : 'active')}
        />
        <QuickStat
          icon={<AlertCircle className="w-4 h-4" style={{ color: '#f97316' }} />}
          value={lowComplianceCount}
          label="Lage compliance"
          active={quickFilter === 'low-compliance'}
          onClick={() => setQuickFilter(quickFilter === 'low-compliance' ? 'all' : 'low-compliance')}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Zoek patiënt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          style={{ borderRadius: '10px' }}
        />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Patient list */}
      {!isLoading && (
        <div className="space-y-3">
          {filtered.map(patient => {
            const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null

            return (
              <Card
                key={patient.id}
                style={{ borderRadius: '12px' }}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/therapist/patients/${patient.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
                      style={{ background: '#1C2425' }}
                    >
                      {patient.avatarInitials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{patient.name}</h3>
                        {status && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: status.bg, color: status.text }}
                          >
                            {status.label}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{patient.email}</p>

                      {patient.programName ? (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{patient.programName}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1 italic">Geen programma toegewezen</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {patient.programId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-3"
                          onClick={() => router.push(`/therapist/programs/${patient.programId}/edit`)}
                        >
                          Programma
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="text-xs h-7 px-3"
                          style={{ background: '#BEF264' }}
                          onClick={() => router.push(`/therapist/programs/new?patientId=${patient.id}`)}
                        >
                          + Programma
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
              <p className="text-sm text-muted-foreground">Geen patiënten gevonden</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2"
                onClick={() => setInviteOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Patiënt uitnodigen
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Invite modal */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setInviteExists(false) }}>
        <DialogContent style={{ borderRadius: '16px' }}>
          <DialogHeader>
            <DialogTitle>Gebruiker uitnodigen</DialogTitle>
            <DialogDescription>
              De gebruiker ontvangt een e-mail met een link om een account aan te maken.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Volledige naam</Label>
              <Input
                id="invite-name"
                placeholder="Jan de Vries"
                value={inviteName}
                onChange={e => { setInviteName(e.target.value); setInviteExists(false) }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mailadres</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="jan@example.com"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteExists(false) }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'PATIENT', label: 'Patiënt', color: '#BEF264' },
                  { value: 'ATHLETE', label: 'Atleet', color: '#f59e0b' },
                  { value: 'THERAPIST', label: 'Therapeut', color: '#6366f1' },
                ] as const).map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setInviteRole(r.value)}
                    className="px-3 py-2 rounded-lg text-sm font-medium border-2 transition-colors"
                    style={inviteRole === r.value
                      ? { borderColor: r.color, background: r.color + '15', color: r.color }
                      : { borderColor: 'rgba(255,255,255,0.12)', color: '#7B8889' }
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {inviteExists && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                <p className="text-sm text-orange-800">
                  <AlertCircle className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Deze patiënt is al uitgenodigd.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  disabled={inviteLoading}
                  onClick={(e) => handleInvite(e, true)}
                >
                  <Mail className="w-4 h-4" />
                  {inviteLoading ? 'Versturen...' : 'Uitnodiging opnieuw versturen'}
                </Button>
              </div>
            )}

            {!inviteExists && (
              <Button
                type="submit"
                className="w-full gap-2"
                style={{ background: '#BEF264' }}
                disabled={inviteLoading}
              >
                <Mail className="w-4 h-4" />
                {inviteLoading ? 'Versturen...' : 'Uitnodiging versturen'}
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuickStat({ icon, value, label, active, onClick }: {
  icon: React.ReactNode; value: number; label: string; active?: boolean; onClick?: () => void
}) {
  return (
    <Card
      style={{ borderRadius: '12px', borderColor: active ? '#BEF264' : undefined }}
      className={`cursor-pointer transition-all hover:shadow-md ${active ? 'ring-2 ring-[#BEF264] bg-[#BEF26408]' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="mb-1">{icon}</div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
