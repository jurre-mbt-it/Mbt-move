'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkTabs as Tabs,
  DarkTabsContent as TabsContent,
  DarkTabsList as TabsList,
  DarkTabsTrigger as TabsTrigger,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  Tile,
} from '@/components/dark-ui'
import { InsightActivationToggle } from '@/components/insights/InsightActivationToggle'
import { InsightTimeline } from '@/components/insights/InsightTimeline'
import { RehabActivationToggle } from '@/components/rehab/RehabActivationToggle'
import { RehabTracker } from '@/components/rehab/RehabTracker'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: 'rgba(190,242,100,0.14)', text: P.lime },
  DRAFT:     { label: 'Concept',   bg: 'rgba(244,194,97,0.14)',  text: P.gold },
  COMPLETED: { label: 'Afgerond',  bg: 'rgba(255,255,255,0.06)', text: P.inkMuted },
}

const STATUS_ACCENT: Record<string, string> = {
  ACTIVE: P.lime,
  DRAFT: P.gold,
  COMPLETED: P.inkDim,
}

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: patient, isLoading } = trpc.patients.get.useQuery({ id })
  const { data: programsRaw = [] } = trpc.programs.list.useQuery({ patientId: id })
  const { data: recentSessions = [] } = trpc.patients.recentSessions.useQuery({ patientId: id, limit: 5 })
  const resendInvite = trpc.invite.resend.useMutation({
    onSuccess: (res) => {
      const expires = new Date(res.expiresAt).toLocaleString('nl-NL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
      toast.success(
        res.mailDelivered
          ? `Uitnodiging opnieuw verstuurd naar ${res.email}. Verloopt ${expires}.`
          : `Nieuwe invite-code aangemaakt — mail kon niet bezorgd worden. Deel de link handmatig.`,
      )
    },
    onError: (e) => toast.error(e.message),
  })
  const programs = programsRaw as Array<{
    id: string; name: string; status: string; weeks: number;
    daysPerWeek: number; startDate: Date | null; endDate: Date | null; isTemplate: boolean
  }>

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 space-y-4 animate-pulse">
          <div className="h-5 w-32 rounded" style={{ background: P.surfaceHi }} />
          <div className="h-20 rounded-xl" style={{ background: P.surfaceHi }} />
          <div className="h-24 rounded-xl" style={{ background: P.surfaceHi }} />
        </div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
        <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 text-center space-y-4">
          <p style={{ color: P.inkMuted }}>Patiënt niet gevonden of geen toegang.</p>
          <DarkButton variant="secondary" href="/therapist/patients">
            Terug naar patiënten
          </DarkButton>
        </div>
      </div>
    )
  }

  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null
  const activePrograms = programs.filter(p => p.status === 'ACTIVE' && !p.isTemplate)

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 space-y-5">
        {/* Back */}
        <Link
          href="/therapist/patients"
          className="athletic-mono inline-flex items-center gap-1.5"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← TERUG
        </Link>

        {/* Patient hero */}
        <div className="flex flex-col gap-2">
          <Kicker>Patiënt</Kicker>
          <Display size="md">{patient.name.toUpperCase()}</Display>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 12, letterSpacing: '0.03em' }}
            >
              {patient.email}
            </span>
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <DarkButton
            variant="primary"
            href={`/therapist/treatment/${patient.id}`}
          >
            ▶ Start behandeling
          </DarkButton>
          <DarkButton
            variant="secondary"
            disabled={resendInvite.isPending}
            loading={resendInvite.isPending}
            onClick={() => resendInvite.mutate({ patientId: patient.id })}
          >
            ✉ Stuur invite-link
          </DarkButton>
          {patient.programId ? (
            <DarkButton
              variant="secondary"
              href={`/therapist/programs/${patient.programId}/edit`}
            >
              Programma
            </DarkButton>
          ) : (
            <DarkButton
              variant="secondary"
              href={`/therapist/programs/new?patientId=${patient.id}`}
            >
              + Programma
            </DarkButton>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricTile
            label="Actieve prog."
            value={activePrograms.length}
            tint={P.lime}
          />
          <MetricTile
            label="Totaal prog."
            value={programs.length}
            tint={P.ice}
          />
          <MetricTile
            label="Programma duur"
            value={patient.weeksTotal ? `${patient.weeksTotal}w` : '—'}
            tint={P.purple}
          />
          <MetricTile
            label="Startdatum"
            value={patient.startDate ? new Date(patient.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'}
            tint={P.gold}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profiel" className="space-y-4">
          <TabsList
            className="w-full grid grid-cols-6 rounded-xl"
            style={{ background: P.surface, border: `1px solid ${P.line}` }}
          >
            <TabsTrigger value="profiel" className="text-xs px-1">Profiel</TabsTrigger>
            <TabsTrigger value="programmas" className="text-xs px-1">Progr.</TabsTrigger>
            <TabsTrigger value="geschiedenis" className="text-xs px-1">Historie</TabsTrigger>
            <TabsTrigger value="revalidatie" className="text-xs px-1">Revalidatie</TabsTrigger>
            <TabsTrigger value="signalen" className="text-xs px-1">Signalen</TabsTrigger>
            <TabsTrigger value="voortgang" className="text-xs px-1">Voortgang</TabsTrigger>
          </TabsList>

          {/* ── TAB: Profiel ─────────────────────────────────────── */}
          <TabsContent value="profiel" className="space-y-4">
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Contactgegevens</MetaLabel>
                <div className="space-y-2">
                  <div
                    className="athletic-mono flex items-center gap-2"
                    style={{ color: P.inkMuted, fontSize: 12 }}
                  >
                    <span>E-mail</span>
                    <span style={{ color: P.ink }}>{patient.email}</span>
                  </div>
                  {patient.phone && (
                    <div
                      className="athletic-mono flex items-center gap-2"
                      style={{ color: P.inkMuted, fontSize: 12 }}
                    >
                      <span>Telefoon</span>
                      <span style={{ color: P.ink }}>{patient.phone}</span>
                    </div>
                  )}
                  {patient.dateOfBirth && (
                    <div
                      className="athletic-mono flex items-center gap-2"
                      style={{ color: P.inkMuted, fontSize: 12 }}
                    >
                      <span>Geboortedatum</span>
                      <span style={{ color: P.ink }}>
                        {new Date(patient.dateOfBirth).toLocaleDateString('nl-NL')}
                      </span>
                    </div>
                  )}
                  <div
                    className="athletic-mono flex items-center gap-2"
                    style={{ color: P.inkMuted, fontSize: 12 }}
                  >
                    <span>Aangemaakt</span>
                    <span style={{ color: P.ink }}>
                      {new Date(patient.createdAt).toLocaleDateString('nl-NL')}
                    </span>
                  </div>
                </div>
              </div>
            </Tile>
            {patient.notes && (
              <Tile>
                <div className="space-y-2">
                  <MetaLabel>Notities</MetaLabel>
                  <p style={{ color: P.ink, fontSize: 13, whiteSpace: 'pre-wrap' }}>{patient.notes}</p>
                </div>
              </Tile>
            )}
          </TabsContent>

          {/* ── TAB: Programma's ──────────────────────────────────── */}
          <TabsContent value="programmas" className="space-y-3">
            <div className="flex items-center justify-between">
              <MetaLabel>
                {programs.length} programma{programs.length !== 1 ? "'s" : ''}
              </MetaLabel>
              <DarkButton
                variant="secondary"
                size="sm"
                href={`/therapist/programs/new?patientId=${patient.id}`}
              >
                + Nieuw
              </DarkButton>
            </div>
            {programs.length === 0 && (
              <Tile>
                <div className="py-8 text-center space-y-3">
                  <p style={{ color: P.inkMuted, fontSize: 13 }}>Geen programma&apos;s gevonden</p>
                  <DarkButton
                    variant="primary"
                    size="sm"
                    onClick={() => router.push(`/therapist/programs/new?patientId=${patient.id}`)}
                  >
                    + Programma aanmaken
                  </DarkButton>
                </div>
              </Tile>
            )}
            {programs.map(prog => {
              const progStatus = STATUS_CONFIG[prog.status] ?? STATUS_CONFIG.DRAFT
              const accent = STATUS_ACCENT[prog.status] ?? P.inkDim
              return (
                <Tile key={prog.id} accentBar={accent}>
                  <div className="flex items-center gap-3">
                    <Link href={`/therapist/programs/${prog.id}/edit`} className="flex-1 min-w-0 cursor-pointer">
                      <p
                        style={{
                          color: P.ink,
                          fontSize: 14,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                        className="truncate"
                      >
                        {prog.name}
                      </p>
                      <p
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 11, marginTop: 3, letterSpacing: '0.03em' }}
                      >
                        {prog.weeks} weken · {prog.daysPerWeek}×/week
                        {prog.startDate && ` · Start ${new Date(prog.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </Link>
                    <span
                      className="athletic-mono shrink-0"
                      style={{
                        background: progStatus.bg,
                        color: progStatus.text,
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      {progStatus.label}
                    </span>
                    <ProgramActions programId={prog.id} status={prog.status} patientId={patient.id} />
                  </div>
                </Tile>
              )
            })}
          </TabsContent>

          {/* ── TAB: Geschiedenis ─────────────────────────────────── */}
          <TabsContent value="geschiedenis" className="space-y-3">
            <div className="flex items-center justify-between">
              <MetaLabel>
                Laatste {recentSessions.length} sessie{recentSessions.length !== 1 ? 's' : ''}
              </MetaLabel>
            </div>
            {recentSessions.length === 0 ? (
              <Tile>
                <div className="py-8 text-center">
                  <p style={{ color: P.inkMuted, fontSize: 13 }}>
                    Nog geen gelogde sessies
                  </p>
                </div>
              </Tile>
            ) : (
              recentSessions.map((session) => (
                <Tile key={session.id} accentBar={session.painLevel != null && session.painLevel >= 6 ? P.danger : P.lime}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p
                          className="athletic-mono"
                          style={{ color: P.ink, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                        >
                          {session.completedAt
                            ? new Date(session.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </p>
                        {session.programName && (
                          <p
                            className="athletic-mono"
                            style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
                          >
                            {session.programName}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {session.durationMinutes != null && (
                          <span
                            className="athletic-mono"
                            style={{ color: P.ice, fontSize: 11, letterSpacing: '0.08em' }}
                          >
                            {session.durationMinutes} MIN
                          </span>
                        )}
                        {session.painLevel != null && (
                          <span
                            className="athletic-mono"
                            style={{
                              background: session.painLevel >= 6 ? 'rgba(248,113,113,0.15)' : 'rgba(190,242,100,0.14)',
                              color: session.painLevel >= 6 ? P.danger : P.lime,
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontWeight: 800,
                              letterSpacing: '0.08em',
                            }}
                          >
                            NRS {session.painLevel}
                          </span>
                        )}
                        {session.exertionLevel != null && (
                          <span
                            className="athletic-mono"
                            style={{ color: P.gold, fontSize: 10, letterSpacing: '0.08em' }}
                          >
                            RPE {session.exertionLevel}
                          </span>
                        )}
                      </div>
                    </div>
                    {session.exercises.length > 0 && (
                      <div className="space-y-1 pt-1 border-t" style={{ borderColor: P.line }}>
                        {session.exercises.map((ex) => (
                          <div
                            key={ex.id}
                            className="flex items-center justify-between gap-2 text-xs"
                            style={{ color: P.inkMuted }}
                          >
                            <span style={{ color: P.ink }}>{ex.name}</span>
                            <span className="athletic-mono" style={{ fontSize: 10, letterSpacing: '0.06em' }}>
                              {ex.sets != null && ex.reps != null
                                ? `${ex.sets}×${ex.reps}`
                                : ex.sets != null
                                  ? `${ex.sets} sets`
                                  : '—'}
                              {ex.weight != null && ` · ${ex.weight}kg`}
                              {ex.painLevel != null && ` · NRS ${ex.painLevel}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {session.notes && (
                      <p className="pt-1 border-t" style={{ color: P.inkMuted, fontSize: 12, whiteSpace: 'pre-wrap', borderColor: P.line }}>
                        {session.notes}
                      </p>
                    )}
                  </div>
                </Tile>
              ))
            )}
          </TabsContent>

          {/* ── TAB: Revalidatie (stoplicht-tracker) ──────────────── */}
          <TabsContent value="revalidatie" className="space-y-4">
            <RehabActivationToggle patientId={patient.id} patientName={patient.name} />
            <RehabTracker patientId={patient.id} />
          </TabsContent>

          {/* ── TAB: Signalen (CIE) ───────────────────────────────── */}
          <TabsContent value="signalen" className="space-y-4">
            <InsightActivationToggle patientId={patient.id} patientName={patient.name} />
            <InsightTimeline patientId={patient.id} />
          </TabsContent>

          {/* ── TAB: Voortgang ───────────────────────────────────── */}
          <TabsContent value="voortgang">
            <Tile
              href={`/therapist/patients/${patient.id}/progress`}
              accentBar={P.lime}
            >
              <div className="flex items-center gap-3">
                <div>
                  <p
                    style={{
                      color: P.ink,
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Voortgangsrapport bekijken
                  </p>
                  <p
                    className="athletic-mono"
                    style={{ color: P.inkMuted, fontSize: 11, marginTop: 3, letterSpacing: '0.03em' }}
                  >
                    Sessies, pijn, workload en 1RM trends
                  </p>
                </div>
                <span className="ml-auto" style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>→</span>
              </div>
            </Tile>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function ProgramActions({
  programId,
  status,
  patientId,
}: {
  programId: string
  status: string
  patientId: string
}) {
  const utils = trpc.useUtils()
  const save = trpc.programs.save.useMutation({
    onSuccess: () => {
      utils.programs.list.invalidate()
      utils.patients.get.invalidate({ id: patientId })
    },
  })

  const isActive = status === 'ACTIVE'

  return (
    <div className="flex items-center gap-2 shrink-0">
      {!isActive && (
        <DarkButton
          variant="primary"
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              id: programId,
              status: 'ACTIVE',
              patientId,
              startDate: new Date().toISOString(),
            })
          }
        >
          ▶ Start
        </DarkButton>
      )}
      <DarkButton
        variant="secondary"
        size="sm"
        href={`/therapist/programs/${programId}/edit`}
      >
        Wijzig
      </DarkButton>
    </div>
  )
}
