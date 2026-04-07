'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MOCK_PATIENTS } from '@/lib/therapist-constants'
import { Plus, Search, Users, CheckCircle2, AlertCircle, Clock, Mail } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: '#dcfce7', text: '#15803d' },
  DRAFT:     { label: 'Concept',   bg: '#fef9c3', text: '#a16207' },
  COMPLETED: { label: 'Afgerond',  bg: '#f1f5f9', text: '#475569' },
}

export default function PatientsPage() {
  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    try {
      const res = await fetch('/api/auth/invite-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Uitnodiging verstuurd naar ${inviteEmail}`)
      setInviteOpen(false)
      setInviteName('')
      setInviteEmail('')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Er ging iets mis')
    } finally {
      setInviteLoading(false)
    }
  }

  const filtered = MOCK_PATIENTS.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = MOCK_PATIENTS.filter(p => p.programStatus === 'ACTIVE').length
  const lowComplianceCount = MOCK_PATIENTS.filter(p => p.compliance > 0 && p.compliance < 70).length

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patiënten</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Beheer en monitor je patiënten</p>
        </div>
        <Button
          style={{ background: '#3ECF6A' }}
          className="gap-2"
          onClick={() => setInviteOpen(true)}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Uitnodigen</span>
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <QuickStat icon={<Users className="w-4 h-4" style={{ color: '#6366f1' }} />} value={MOCK_PATIENTS.length} label="Totaal" />
        <QuickStat icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#3ECF6A' }} />} value={activeCount} label="Actief" />
        <QuickStat icon={<AlertCircle className="w-4 h-4" style={{ color: '#f97316' }} />} value={lowComplianceCount} label="Lage compliance" />
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

      {/* Patient list */}
      <div className="space-y-3">
        {filtered.map(patient => {
          const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null
          const lastDate = patient.lastSessionDate
            ? new Date(patient.lastSessionDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
            : null
          const daysSinceSession = patient.lastSessionDate
            ? Math.floor((Date.now() - new Date(patient.lastSessionDate).getTime()) / (1000 * 60 * 60 * 24))
            : null

          return (
            <Link key={patient.id} href={`/therapist/patients/${patient.id}`} className="block">
            <Card style={{ borderRadius: '12px' }} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0"
                    style={{ background: '#1A1A1A' }}
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
                      {patient.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>

                    {patient.programName ? (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{patient.programName}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">Geen programma toegewezen</p>
                    )}

                    {/* Progress + stats */}
                    {patient.programStatus === 'ACTIVE' && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Week {patient.weeksCurrent}/{patient.weeksTotal}</span>
                          <span>{patient.compliance}% compliance</span>
                        </div>
                        <Progress
                          value={(patient.weeksCurrent / patient.weeksTotal) * 100}
                          className="h-1.5"
                        />
                      </div>
                    )}

                    {patient.programStatus === 'COMPLETED' && (
                      <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: '#3ECF6A' }}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Programma volledig afgerond · {patient.compliance}% compliance
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {lastDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Laatste sessie: {lastDate}
                          {daysSinceSession !== null && daysSinceSession > 7 && (
                            <span style={{ color: '#f97316' }}> ({daysSinceSession}d geleden)</span>
                          )}
                        </span>
                      )}
                      {patient.lastPainLevel !== null && (
                        <span>Pijn: {patient.lastPainLevel}/10</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.preventDefault()}>
                    {patient.programId ? (
                      <Link href={`/therapist/programs/${patient.programId}/edit`}>
                        <Button variant="outline" size="sm" className="text-xs h-7 px-3">
                          Programma
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/therapist/programs/new">
                        <Button size="sm" className="text-xs h-7 px-3" style={{ background: '#3ECF6A' }}>
                          + Programma
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            </Link>
          )
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl text-center">
            <p className="text-sm text-muted-foreground">Geen patiënten gevonden</p>
          </div>
        )}
      </div>

      {/* Invite modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent style={{ borderRadius: '16px' }}>
          <DialogHeader>
            <DialogTitle>Patiënt uitnodigen</DialogTitle>
            <DialogDescription>
              De patiënt ontvangt een e-mail met een link om een account aan te maken.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Volledige naam</Label>
              <Input
                id="invite-name"
                placeholder="Jan de Vries"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
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
                onChange={e => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full gap-2"
              style={{ background: '#3ECF6A' }}
              disabled={inviteLoading}
            >
              <Mail className="w-4 h-4" />
              {inviteLoading ? 'Versturen...' : 'Uitnodiging versturen'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuickStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card style={{ borderRadius: '12px' }}>
      <CardContent className="p-3">
        <div className="mb-1">{icon}</div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
