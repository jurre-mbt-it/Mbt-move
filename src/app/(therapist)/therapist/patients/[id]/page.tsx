'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import {
  DarkButton,
  DarkInput,
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
import { AssignFromTemplateDialog } from '@/components/patients/AssignFromTemplateDialog'
import { PerformerToggle, type PerformerFilter } from '@/components/patients/PerformerToggle'
import { InsightActivationToggle } from '@/components/insights/InsightActivationToggle'
import { InsightTimeline } from '@/components/insights/InsightTimeline'
import { RehabActivationToggle } from '@/components/rehab/RehabActivationToggle'
import { RehabTracker } from '@/components/rehab/RehabTracker'
import { PatientClinicalTests } from '@/components/clinical-tests/PatientClinicalTests'
import { CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, type CardioActivityKey, type CardioProtocolKey } from '@/lib/cardio-constants'
import { formatPaceFromSecPerKm } from '@/lib/cardio-zones'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',    bg: 'rgba(232,122,85,0.14)', text: P.lime },
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
  const [historyLimit, setHistoryLimit] = useState(5)
  const [historyPerformer, setHistoryPerformer] = useState<PerformerFilter>('all')
  const { data: recentSessionsRaw = [] } = trpc.patients.recentSessions.useQuery({
    patientId: id,
    limit: historyLimit,
    performedBy: historyPerformer,
  })
  const { data: cardioSessionsRaw = [] } = trpc.patients.recentCardioSessions.useQuery({
    patientId: id,
    limit: 10,
  })
  // Shallow cast — zelfde TS2589 inference-depth reden als recentSessions.
  type CardioSession = {
    id: string
    completedAt: Date | string
    activity: string
    protocol: string
    durationSec: number
    distanceM: number | null
    avgPaceSecPerKm: number | null
    avgHeartRate: number | null
    maxHeartRate: number | null
    zone: number | null
    targetZone: number | null
    rpe: number | null
    painLevel: number | null
    notes: string | null
    programName: string | null
  }
  const cardioSessions = cardioSessionsRaw as CardioSession[]
  // Shallow cast — tRPC inference depth is te diep voor TS2589 nadat extra velden
  // (weightsPerSet/extraParams/...) zijn toegevoegd in recentSessions.
  type RecentSession = {
    id: string
    completedAt: Date | string | null
    durationMinutes: number | null
    programName: string | null
    therapistId: string | null
    therapistName: string | null
    painLevel: number | null
    exertionLevel: number | null
    notes: string | null
    exercises: Array<{
      id: string
      name: string
      sets: number | null
      reps: number | null
      painLevel: number | null
      weight: number | null
    }>
  }
  // therapistId-semantiek: null = legacy/onbekend, === patientId = patient
  // logde zelf, anders = behandelend therapeut. Houdt collega's geïnformeerd
  // wie welke sessie heeft uitgevoerd.
  const formatPerformer = (s: RecentSession): string => {
    if (s.therapistId === null) return '—'
    if (s.therapistId === id) return 'Patiënt zelf'
    return s.therapistName ?? 'Onbekend'
  }
  const recentSessions = recentSessionsRaw as RecentSession[]
  const utils = trpc.useUtils()
  const [inviteFallback, setInviteFallback] = useState<{
    url: string
    email: string
    expiresAt: string | Date
    error: string | null
  } | null>(null)
  const resendInvite = trpc.invite.resend.useMutation({
    onSuccess: (res) => {
      if (res.mailDelivered) {
        const expires = new Date(res.expiresAt).toLocaleString('nl-NL', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
        toast.success(`Uitnodiging verstuurd naar ${res.email}. Verloopt ${expires}.`)
        setInviteFallback(null)
      } else {
        setInviteFallback({
          url: res.instructionUrl,
          email: res.email,
          expiresAt: res.expiresAt,
          error: res.mailError,
        })
        toast.error('Mail kon niet bezorgd worden — kopieer de link hieronder.')
      }
    },
    onError: (e) => toast.error(e.message),
  })
  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      utils.patients.get.invalidate({ id })
      utils.patients.list.invalidate()
      setEditing(false)
      toast.success('Profiel bijgewerkt')
    },
    onError: (e) => toast.error(e.message),
  })

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editDob, setEditDob] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [assignTemplateOpen, setAssignTemplateOpen] = useState(false)

  useEffect(() => {
    if (!editing && patient) {
      setEditName(patient.name ?? '')
      setEditPhone(patient.phone ?? '')
      setEditDob(patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().slice(0, 10) : '')
      setEditNotes(patient.notes ?? '')
    }
  }, [patient, editing])
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
            <>
              <DarkButton
                variant="secondary"
                onClick={() => setAssignTemplateOpen(true)}
              >
                📋 Vanaf template
              </DarkButton>
              <DarkButton
                variant="secondary"
                href={`/therapist/programs/new?patientId=${patient.id}`}
              >
                + Programma
              </DarkButton>
            </>
          )}
        </div>
        <AssignFromTemplateDialog
          open={assignTemplateOpen}
          onOpenChange={setAssignTemplateOpen}
          patient={{ id: patient.id, name: patient.name }}
        />

        {inviteFallback && (
          <Tile accentBar={P.gold}>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <MetaLabel style={{ color: P.gold }}>MAIL NIET BEZORGD</MetaLabel>
                  <p style={{ color: P.ink, fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
                    De invite-code voor <strong>{inviteFallback.email}</strong> is wel aangemaakt.
                    Stuur de link hieronder handmatig (WhatsApp, sms, eigen mail).
                  </p>
                  {inviteFallback.error && (
                    <p
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 11, marginTop: 6, letterSpacing: '0.04em' }}
                    >
                      Reden: {inviteFallback.error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setInviteFallback(null)}
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 11, padding: '4px 8px', letterSpacing: '0.1em' }}
                  aria-label="Sluiten"
                >
                  ✕
                </button>
              </div>
              <div
                className="rounded-md p-2 flex items-center gap-2"
                style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
              >
                <code
                  className="athletic-mono flex-1 truncate"
                  style={{ fontSize: 11, color: P.ink, letterSpacing: '0.02em' }}
                >
                  {inviteFallback.url}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteFallback.url)
                    toast.success('Link gekopieerd')
                  }}
                  className="athletic-tap athletic-mono"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: P.brand,
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
                Verloopt {new Date(inviteFallback.expiresAt).toLocaleString('nl-NL')}
              </p>
            </div>
          </Tile>
        )}

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
            className="w-full grid grid-cols-7 rounded-xl"
            style={{ background: P.surface, border: `1px solid ${P.line}` }}
          >
            <TabsTrigger value="profiel" className="text-xs px-1">Profiel</TabsTrigger>
            <TabsTrigger value="programmas" className="text-xs px-1">Progr.</TabsTrigger>
            <TabsTrigger value="geschiedenis" className="text-xs px-1">Historie</TabsTrigger>
            <TabsTrigger value="revalidatie" className="text-xs px-1">Revalidatie</TabsTrigger>
            <TabsTrigger value="tests" className="text-xs px-1">Tests</TabsTrigger>
            <TabsTrigger value="signalen" className="text-xs px-1">Signalen</TabsTrigger>
            <TabsTrigger value="voortgang" className="text-xs px-1">Voortgang</TabsTrigger>
          </TabsList>

          {/* ── TAB: Profiel ─────────────────────────────────────── */}
          <TabsContent value="profiel" className="space-y-4">
            <Tile>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <MetaLabel>Contactgegevens</MetaLabel>
                  {!editing ? (
                    <DarkButton variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      Bewerken
                    </DarkButton>
                  ) : (
                    <div className="flex gap-2">
                      <DarkButton
                        variant="secondary"
                        size="sm"
                        disabled={updatePatient.isPending}
                        onClick={() => setEditing(false)}
                      >
                        Annuleer
                      </DarkButton>
                      <DarkButton
                        variant="primary"
                        size="sm"
                        disabled={updatePatient.isPending || !editName.trim()}
                        loading={updatePatient.isPending}
                        onClick={() => updatePatient.mutate({
                          id: patient.id,
                          name: editName.trim(),
                          phone: editPhone.trim() || null,
                          dateOfBirth: editDob || null,
                          notes: editNotes.trim() || null,
                        })}
                      >
                        Opslaan
                      </DarkButton>
                    </div>
                  )}
                </div>

                {!editing ? (
                  <div className="space-y-2">
                    <ProfileRow label="Naam" value={patient.name} />
                    <ProfileRow label="E-mail" value={patient.email} />
                    <ProfileRow label="Telefoon" value={patient.phone ?? '—'} />
                    <ProfileRow
                      label="Geboortejaar"
                      value={patient.dateOfBirth ? String(new Date(patient.dateOfBirth).getUTCFullYear()) : '—'}
                    />
                    <ProfileRow
                      label="Aangemaakt"
                      value={new Date(patient.createdAt).toLocaleDateString('nl-NL')}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <MetaLabel>Naam</MetaLabel>
                      <DarkInput value={editName} onChange={(e) => setEditName(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <MetaLabel>E-mail</MetaLabel>
                      <p
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 12, padding: '8px 0' }}
                      >
                        {patient.email} <span style={{ fontSize: 10 }}>(niet wijzigbaar)</span>
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <MetaLabel>Telefoon</MetaLabel>
                      <DarkInput
                        type="tel"
                        placeholder="+31 6 ..."
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <MetaLabel>Geboortedatum</MetaLabel>
                      <DarkInput
                        type="date"
                        value={editDob}
                        onChange={(e) => setEditDob(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                      />
                      <p style={{ color: P.inkMuted, fontSize: 11 }}>
                        Vereist voor de invite-flow (patiënt logt in met geboortejaar).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Tile>

            <Tile>
              <div className="space-y-2">
                <MetaLabel>Notities</MetaLabel>
                {!editing ? (
                  <p
                    style={{
                      color: patient.notes ? P.ink : P.inkDim,
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      fontStyle: patient.notes ? 'normal' : 'italic',
                    }}
                  >
                    {patient.notes ?? 'Nog geen notities — klik Bewerken om toe te voegen.'}
                  </p>
                ) : (
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg p-3 athletic-mono"
                    style={{
                      background: P.surfaceLow,
                      border: `1px solid ${P.line}`,
                      color: P.ink,
                      fontSize: 13,
                      lineHeight: 1.5,
                      resize: 'vertical',
                    }}
                    placeholder="Private notities (alleen jij ziet deze)"
                  />
                )}
              </div>
            </Tile>
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
            {cardioSessions.length > 0 && (
              <div className="space-y-2">
                <MetaLabel>CARDIO · LAATSTE {cardioSessions.length}</MetaLabel>
                {cardioSessions.map((c) => {
                  const act = CARDIO_ACTIVITIES[c.activity as CardioActivityKey]
                  const proto = CARDIO_PROTOCOLS[c.protocol as CardioProtocolKey]
                  const pace = formatPaceFromSecPerKm(c.activity as CardioActivityKey, c.avgPaceSecPerKm)
                  return (
                    <Tile key={c.id} accentBar={c.painLevel != null && c.painLevel >= 6 ? P.danger : P.ice}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="athletic-mono" style={{ color: P.ink, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {act?.icon} {act?.label ?? c.activity}
                          </p>
                          <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}>
                            {new Date(c.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}{proto?.label ?? c.protocol}
                            {c.programName ? ` · ${c.programName}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <span className="athletic-mono" style={{ color: P.ice, fontSize: 11, letterSpacing: '0.08em' }}>
                            {Math.round(c.durationSec / 60)} MIN
                          </span>
                          {c.distanceM != null && (
                            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
                              {(c.distanceM / 1000).toFixed(2)} KM
                            </span>
                          )}
                          {pace && (
                            <span className="athletic-mono" style={{ color: P.lime, fontSize: 11 }}>{pace}</span>
                          )}
                          {c.avgHeartRate != null && (
                            <span className="athletic-mono" style={{ color: P.danger, fontSize: 11 }}>{c.avgHeartRate} bpm</span>
                          )}
                          {c.zone != null && (
                            <span className="athletic-mono" style={{ color: P.gold, fontSize: 10, letterSpacing: '0.06em' }}>Z{c.zone}</span>
                          )}
                          {c.rpe != null && (
                            <span className="athletic-mono" style={{ color: P.gold, fontSize: 10, letterSpacing: '0.06em' }}>RPE {c.rpe}</span>
                          )}
                          {c.painLevel != null && (
                            <span className="athletic-mono" style={{ background: c.painLevel >= 6 ? 'rgba(248,113,113,0.15)' : 'rgba(232,122,85,0.14)', color: c.painLevel >= 6 ? P.danger : P.lime, fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>
                              NRS {c.painLevel}
                            </span>
                          )}
                        </div>
                      </div>
                      {c.notes && (
                        <p className="pt-2 mt-2 border-t" style={{ color: P.inkMuted, fontSize: 12, whiteSpace: 'pre-wrap', borderColor: P.line }}>{c.notes}</p>
                      )}
                    </Tile>
                  )
                })}
                <div style={{ height: 1, background: P.line, margin: '8px 0' }} />
              </div>
            )}
            <PerformerToggle
              value={historyPerformer}
              onChange={(v) => {
                setHistoryPerformer(v)
                setHistoryLimit(5)
              }}
            />
            <div className="flex items-center justify-between">
              <MetaLabel>
                Laatste {recentSessions.length} sessie{recentSessions.length !== 1 ? 's' : ''}
                {historyPerformer === 'patient' && ' · door patiënt'}
                {historyPerformer === 'therapist' && ' · door therapeut'}
              </MetaLabel>
            </div>
            {recentSessions.length === 0 ? (
              <Tile>
                <div className="py-8 text-center">
                  <p style={{ color: P.inkMuted, fontSize: 13 }}>
                    {historyPerformer === 'patient'
                      ? 'Patiënt heeft nog niks zelf gelogd'
                      : historyPerformer === 'therapist'
                        ? 'Nog geen sessies door therapeut gelogd'
                        : 'Nog geen gelogde sessies'}
                  </p>
                </div>
              </Tile>
            ) : (
              <>
              {recentSessions.map((session) => (
                <Tile key={session.id} accentBar={session.painLevel != null && session.painLevel >= 6 ? P.danger : P.lime}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="athletic-mono"
                            style={{ color: P.ink, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                          >
                            {session.completedAt
                              ? new Date(session.completedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </p>
                          <Link
                            href={`/therapist/patients/${id}/sessions/${session.id}/edit`}
                            className="athletic-mono"
                            style={{
                              color: P.brand,
                              fontSize: 10,
                              letterSpacing: '0.12em',
                              padding: '2px 6px',
                              border: `1px solid ${P.brand}`,
                              borderRadius: 4,
                            }}
                          >
                            BEWERK
                          </Link>
                        </div>
                        <p
                          className="athletic-mono"
                          style={{ color: P.inkMuted, fontSize: 11, marginTop: 2, letterSpacing: '0.04em' }}
                        >
                          {session.programName ? `${session.programName} · ` : ''}
                          DOOR {formatPerformer(session).toUpperCase()}
                        </p>
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
                              background: session.painLevel >= 6 ? 'rgba(248,113,113,0.15)' : 'rgba(232,122,85,0.14)',
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
              ))}
              {recentSessions.length === historyLimit && historyLimit < 50 && (
                <div className="flex justify-center pt-2">
                  <DarkButton
                    variant="secondary"
                    onClick={() => setHistoryLimit((n) => Math.min(n + 10, 50))}
                  >
                    Meer laden
                  </DarkButton>
                </div>
              )}
              </>
            )}
          </TabsContent>

          {/* ── TAB: Revalidatie (stoplicht-tracker) ──────────────── */}
          <TabsContent value="revalidatie" className="space-y-4">
            <RehabActivationToggle patientId={patient.id} patientName={patient.name} />
            <RehabTracker patientId={patient.id} />
          </TabsContent>

          {/* ── TAB: Tests (losse klinische tests) ────────────────── */}
          <TabsContent value="tests" className="space-y-4">
            <PatientClinicalTests patientId={patient.id} />
          </TabsContent>

          {/* ── TAB: Signalen (CIE) ───────────────────────────────── */}
          <TabsContent value="signalen" className="space-y-4">
            <InsightActivationToggle patientId={patient.id} patientName={patient.name} />
            <InsightTimeline patientId={patient.id} />
            <PainReports patientId={patient.id} />
          </TabsContent>

          {/* ── TAB: Voortgang ───────────────────────────────────── */}
          <TabsContent value="voortgang">
            <Tile
              href={`/therapist/patients/${patient.id}/progress`}
              accentBar={P.brand}
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

const PAIN_CONTEXT_LABELS: Record<string, string> = {
  rest: 'In rust',
  movement: 'Bij bewegen',
  exercise: 'Tijdens oefening',
  after: 'Na inspanning',
  always: 'Continu',
}

/**
 * Patiënt-gerapporteerde pijn-meldingen (los van een sessie). Voorheen werden
 * deze wél opgeslagen maar nergens getoond; dit maakt ze zichtbaar voor de
 * behandelaar tussen de signalen.
 */
function PainReports({ patientId }: { patientId: string }) {
  const { data: entries = [], isLoading } = trpc.patients.getPainEntries.useQuery({
    patientId,
  })

  return (
    <Tile>
      <div className="flex items-center justify-between">
        <MetaLabel>Pijn-meldingen</MetaLabel>
        {entries.length > 0 && (
          <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
            laatste {entries.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 12, marginTop: 10 }}>
          Laden…
        </p>
      ) : entries.length === 0 ? (
        <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
          Nog geen losse pijn-meldingen. Meldingen die de patiënt via{' '}
          &laquo;Pijn rapporteren&raquo; instuurt verschijnen hier.
        </p>
      ) : (
        <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
          {entries.map((e) => {
            const high = e.nrs >= 6
            return (
              <div
                key={e.id}
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: P.surfaceLow,
                  borderLeft: `3px solid ${high ? P.danger : P.gold}`,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                    {e.location}
                  </span>
                  <span
                    className="athletic-mono rounded-md px-2 py-0.5"
                    style={{
                      background: high ? 'rgba(248,113,113,0.15)' : 'rgba(244,194,97,0.14)',
                      color: high ? P.danger : P.gold,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    NRS {e.nrs}
                  </span>
                </div>
                <div
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 11, marginTop: 4, letterSpacing: '0.03em' }}
                >
                  {PAIN_CONTEXT_LABELS[e.context] ?? e.context}
                  {' · '}
                  {new Date(e.reportedAt).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                {e.notes && (
                  <p style={{ color: P.ink, fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
                    {e.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Tile>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="athletic-mono flex items-center gap-2" style={{ color: P.inkMuted, fontSize: 12 }}>
      <span style={{ minWidth: 110 }}>{label}</span>
      <span style={{ color: P.ink }}>{value}</span>
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
