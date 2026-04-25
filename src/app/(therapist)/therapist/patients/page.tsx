'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogDescription as DialogDescription,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',       bg: 'rgba(190,242,100,0.14)', text: P.lime },
  DRAFT:     { label: 'Concept',      bg: 'rgba(244,194,97,0.14)',  text: P.gold },
  COMPLETED: { label: 'Afgerond',     bg: 'rgba(255,255,255,0.06)', text: P.inkMuted },
  ARCHIVED:  { label: 'Gearchiveerd', bg: 'rgba(255,255,255,0.06)', text: P.inkMuted },
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
  const [inviteDob, setInviteDob] = useState('') // YYYY-MM-DD
  const [inviteRole, setInviteRole] = useState<'PATIENT' | 'ATHLETE'>('PATIENT')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    url: string
    expiresAt: Date
    patientUserId: string | null
  } | null>(null)

  const { data: patients = [], isLoading } = trpc.patients.list.useQuery()
  const createInvite = trpc.invite.create.useMutation()

  function resetInviteForm() {
    setInviteName('')
    setInviteEmail('')
    setInviteDob('')
    setInviteRole('PATIENT')
    setInviteResult(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteDob) {
      toast.error('Geboortedatum is verplicht voor een toegangscode-invite.')
      return
    }
    setInviteLoading(true)
    try {
      const res = await createInvite.mutateAsync({
        email: inviteEmail,
        name: inviteName,
        dateOfBirth: inviteDob,
        role: inviteRole,
      })
      setInviteResult({
        url: res.instructionUrl,
        expiresAt: new Date(res.expiresAt),
        patientUserId: res.patientUserId,
      })
      toast.success('Invite aangemaakt — deel de code-URL met je patiënt.')
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
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-8 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <Kicker>Overzicht</Kicker>
            <Display size="md">PATIËNTEN</Display>
            <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
              Beheer en monitor je patiënten
            </MetaLabel>
          </div>
          <DarkButton variant="primary" onClick={() => setInviteOpen(true)}>
            + Uitnodigen
          </DarkButton>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <QuickStat
            value={patients.length}
            label="Totaal"
            tint={P.ice}
            active={quickFilter === 'all'}
            onClick={() => setQuickFilter('all')}
          />
          <QuickStat
            value={activeCount}
            label="Actief"
            tint={P.lime}
            active={quickFilter === 'active'}
            onClick={() => setQuickFilter(quickFilter === 'active' ? 'all' : 'active')}
          />
          <QuickStat
            value={lowComplianceCount}
            label="Lage compliance"
            tint={P.danger}
            active={quickFilter === 'low-compliance'}
            onClick={() => setQuickFilter(quickFilter === 'low-compliance' ? 'all' : 'low-compliance')}
          />
        </div>

        {/* Search */}
        <DarkInput
          placeholder="Zoek patiënt..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}>
              LADEN…
            </span>
          </div>
        )}

        {/* Patient list */}
        {!isLoading && (
          <div className="space-y-3">
            {filtered.map(patient => {
              const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null
              const accent =
                patient.programStatus === 'ACTIVE' ? P.lime
                : patient.programStatus === 'DRAFT' ? P.gold
                : P.inkDim

              return (
                <Tile
                  key={patient.id}
                  accentBar={accent}
                  onClick={() => router.push(`/therapist/patients/${patient.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 athletic-mono"
                      style={{ background: P.surfaceHi, color: P.lime, fontSize: 13, fontWeight: 900 }}
                    >
                      {patient.avatarInitials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          style={{
                            color: P.ink,
                            fontSize: 14,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {patient.name}
                        </h3>
                        {status && (
                          <span
                            className="athletic-mono"
                            style={{
                              background: status.bg,
                              color: status.text,
                              fontSize: 10,
                              letterSpacing: '0.1em',
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            {status.label}
                          </span>
                        )}
                        {patient.accessStatus === 'PENDING' && (
                          <span
                            className="athletic-mono"
                            title="Patiënt heeft de uitnodiging nog niet geaccepteerd"
                            style={{
                              background: 'rgba(244, 194, 97, 0.15)',
                              color: P.gold,
                              fontSize: 10,
                              letterSpacing: '0.1em',
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            Uitnodiging open
                          </span>
                        )}
                      </div>

                      <p
                        className="athletic-mono truncate"
                        style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.03em' }}
                      >
                        {patient.email}
                      </p>

                      {patient.programName ? (
                        <p
                          className="athletic-mono truncate"
                          style={{ color: P.inkMuted, fontSize: 11, marginTop: 3, letterSpacing: '0.03em' }}
                        >
                          {patient.programName}
                        </p>
                      ) : (
                        <p
                          className="athletic-mono truncate"
                          style={{ color: P.inkDim, fontSize: 11, marginTop: 3, letterSpacing: '0.03em', fontStyle: 'italic' }}
                        >
                          Geen programma toegewezen
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {patient.programId ? (
                        <DarkButton
                          variant="secondary"
                          size="sm"
                          onClick={() => router.push(`/therapist/programs/${patient.programId}/edit`)}
                        >
                          Programma
                        </DarkButton>
                      ) : (
                        <DarkButton
                          variant="primary"
                          size="sm"
                          onClick={() => router.push(`/therapist/programs/new?patientId=${patient.id}`)}
                        >
                          + Programma
                        </DarkButton>
                      )}
                    </div>
                  </div>
                </Tile>
              )
            })}

            {filtered.length === 0 && (
              <Tile>
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <p style={{ color: P.inkMuted, fontSize: 13 }}>Geen patiënten gevonden</p>
                  <DarkButton variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
                    + Patiënt uitnodigen
                  </DarkButton>
                </div>
              </Tile>
            )}
          </div>
        )}

        {/* Invite modal */}
        <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) resetInviteForm() }}>
          <DialogContent
            style={{
              borderRadius: '16px',
              background: P.surface,
              color: P.ink,
              border: `1px solid ${P.lineStrong}`,
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: P.ink }}>Patiënt uitnodigen</DialogTitle>
              <DialogDescription style={{ color: P.inkMuted }}>
                Patiënt logt in met e-mail + geboortejaar + 6-cijfer code.
              </DialogDescription>
            </DialogHeader>

            {inviteResult ? (
              <div className="space-y-4 mt-2">
                <div
                  className="rounded-lg p-4 space-y-3"
                  style={{ border: `1px solid ${P.lime}`, background: 'rgba(190,242,100,0.08)' }}
                >
                  <div>
                    <MetaLabel style={{ color: P.lime }}>INVITE AANGEMAAKT</MetaLabel>
                    <p style={{ color: P.ink, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                      Deel deze URL met <strong>{inviteEmail}</strong>. Bij openen ziet de patiënt het code-scherm.
                      Supabase stuurt de 6-cijfer code vanzelf zodra de patiënt z&apos;n geboortejaar invult.
                    </p>
                  </div>
                  <div
                    className="rounded-md p-2 flex items-center gap-2"
                    style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
                  >
                    <code
                      className="athletic-mono flex-1 truncate"
                      style={{ fontSize: 11, color: P.ink, letterSpacing: '0.02em' }}
                    >
                      {inviteResult.url}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteResult.url)
                        toast.success('Gekopieerd')
                      }}
                      className="athletic-tap athletic-mono"
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: P.lime,
                        color: P.bg,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.12em',
                      }}
                    >
                      COPY
                    </button>
                  </div>
                  <p style={{ color: P.inkMuted, fontSize: 11 }}>
                    Verloopt op {new Date(inviteResult.expiresAt).toLocaleString('nl-NL')}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {inviteResult.patientUserId && (
                    <DarkButton
                      variant="primary"
                      className="w-full"
                      onClick={() => {
                        const pid = inviteResult.patientUserId!
                        setInviteOpen(false)
                        resetInviteForm()
                        router.push(`/therapist/programs/new?patientId=${pid}`)
                      }}
                    >
                      → Maak nu een programma voor deze patiënt
                    </DarkButton>
                  )}
                  <DarkButton
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setInviteOpen(false)
                      resetInviteForm()
                    }}
                  >
                    Sluiten
                  </DarkButton>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <MetaLabel>Volledige naam</MetaLabel>
                  <DarkInput
                    id="invite-name"
                    placeholder="Jan de Vries"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <MetaLabel>E-mailadres</MetaLabel>
                  <DarkInput
                    id="invite-email"
                    type="email"
                    placeholder="jan@example.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <MetaLabel>Geboortedatum</MetaLabel>
                  <DarkInput
                    id="invite-dob"
                    type="date"
                    value={inviteDob}
                    onChange={e => setInviteDob(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    required
                  />
                  <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                    Bij inloggen controleren we het geboortejaar — alleen de echte patiënt weet dit.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <MetaLabel>Rol</MetaLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'PATIENT', label: 'Patiënt', color: P.lime },
                      { value: 'ATHLETE', label: 'Atleet', color: P.gold },
                    ] as const).map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setInviteRole(r.value)}
                        className="athletic-tap px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                        style={inviteRole === r.value
                          ? { border: `2px solid ${r.color}`, background: r.color + '15', color: r.color }
                          : { border: `2px solid ${P.lineStrong}`, color: P.inkMuted, background: 'transparent' }
                        }
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <DarkButton
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={inviteLoading}
                >
                  {inviteLoading ? 'Bezig...' : 'Code-invite aanmaken'}
                </DarkButton>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function QuickStat({ value, label, tint, active, onClick }: {
  value: number
  label: string
  tint: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="athletic-tap rounded-2xl text-left w-full"
      style={{
        background: P.surface,
        padding: 14,
        border: active ? `1px solid ${tint}` : `1px solid ${P.line}`,
      }}
    >
      <MetaLabel>{label.toUpperCase()}</MetaLabel>
      <p
        className="athletic-display"
        style={{ color: tint, fontSize: 28, lineHeight: '32px', letterSpacing: '-0.03em', marginTop: 4 }}
      >
        {value}
      </p>
    </button>
  )
}
