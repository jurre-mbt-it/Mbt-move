'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { DarkButton, DarkDialog as Dialog, DarkDialogContent as DialogContent, DarkDialogDescription as DialogDescription, DarkDialogHeader as DialogHeader, DarkDialogTitle as DialogTitle, DarkInput, DarkTabs as Tabs, DarkTabsContent as TabsContent, DarkTabsList as TabsList, DarkTabsTrigger as TabsTrigger, Display, Kicker, MetaLabel, MetricTile, P, CARD, Tile } from '@/components/dark-ui'
import { AssignFromTemplateDialog } from '@/components/patients/AssignFromTemplateDialog'
import { CoMonitorDialog } from '@/components/patients/CoMonitorDialog'
import { UnlinkDialog } from '@/components/patients/UnlinkDialog'
import { DischargeDialog } from '@/components/patients/DischargeDialog'
import { dischargeReasonTekst, formatDischargeDate } from '@/lib/care-status'
import { MonthSummary } from '@/components/patients/MonthSummary'
import { PerformerToggle, type PerformerFilter } from '@/components/patients/PerformerToggle'
import { InsightActivationToggle } from '@/components/insights/InsightActivationToggle'
import { InsightTimeline } from '@/components/insights/InsightTimeline'
import { RehabActivationToggle } from '@/components/rehab/RehabActivationToggle'
import { TrajectChecklist } from '@/components/rehab/TrajectChecklist'
import { RehabTracker } from '@/components/rehab/RehabTracker'
import { PatientClinicalTests } from '@/components/clinical-tests/PatientClinicalTests'
import { PatientWearablesTab } from '@/components/wearables/PatientWearablesTab'
import { wearablesEnabledForRole } from '@/lib/wearables-access'
import { isReviewDue, weeksSince } from '@/lib/program-review'
import { CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, type CardioActivityKey, type CardioProtocolKey } from '@/lib/cardio-constants'
import { formatPaceFromSecPerKm } from '@/lib/cardio-zones'
import { formatWeightsPerSet } from '@/lib/session-sets'
import { CARDIO_ICON_MAP, IconMail, IconCalendar, IconClipboard } from '@/components/icons'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE:    { label: 'Actief',       bg: 'rgba(232,122,85,0.14)', text: P.lime },
  DRAFT:     { label: 'Concept',      bg: 'rgba(245,185,66,0.14)',  text: P.gold },
  COMPLETED: { label: 'Afgerond',     bg: 'rgba(212,232,230,0.06)', text: P.inkMuted },
  ARCHIVED:  { label: 'Gearchiveerd', bg: 'rgba(212,232,230,0.06)', text: P.inkMuted },
}

const STATUS_ACCENT: Record<string, string> = {
  ACTIVE: P.lime,
  DRAFT: P.gold,
  COMPLETED: P.inkDim,
  ARCHIVED: P.inkDim,
}

// Afgesloten = uit het actieve overzicht, maar bewaard. Voltooid (COMPLETED)
// óf gearchiveerd (ARCHIVED) vallen hieronder.
const CLOSED_STATUSES = ['COMPLETED', 'ARCHIVED']
const isClosedStatus = (status: string) => CLOSED_STATUSES.includes(status)

const TAB_VALUES = ['profiel', 'programmas', 'geschiedenis', 'revalidatie', 'tests', 'signalen', 'voortgang', 'wearables'] as const

export default function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; traject?: string }>
}) {
  const portal = usePortal()
  const { id } = use(params)
  // Deep-link vanaf het dashboard: /patients/[id]?tab=signalen opent direct
  // de juiste tab. Ongeldige waardes vallen terug op 'profiel'.
  // `?traject=start` komt uit de invite-flow: de dialoog om een traject te
  // starten gaat dan meteen open op deze pagina.
  const { tab, traject } = use(searchParams)
  const startTraject = traject === 'start'
  const router = useRouter()
  const { data: patient, isLoading } = trpc.patients.get.useQuery({ id })
  // Wearable-tab voorlopig alleen voor de admin (zie wearables-access.ts).
  const { data: me } = trpc.auth.getMe.useQuery()
  const showWearables = wearablesEnabledForRole(me?.role)
  // Het hele revalidatie-blok is therapeut-werk. Elke procedure in rehab.ts
  // staat op therapistProcedure en weigert een coach met FORBIDDEN, dus de tab
  // toonde voor een coach alleen een leeg blok plus een stille fout.
  const showRehab = !portal.isCoach
  const zichtbareTabs = TAB_VALUES.filter(
    (t) => (t !== 'revalidatie' || showRehab) && (t !== 'wearables' || showWearables),
  )
  const initialTab = zichtbareTabs.includes(tab as (typeof TAB_VALUES)[number])
    ? tab
    : // Met `?traject=start` moet de revalidatie-tab open: een inactieve tab
      // rendert niet, dus de start-dialoog zou anders nooit verschijnen.
      startTraject && showRehab
      ? 'revalidatie'
      : 'profiel'
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
      weightsPerSet: unknown
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
  const [coMonitorOpen, setCoMonitorOpen] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [dischargeOpen, setDischargeOpen] = useState(false)
  // Bevestiging vóór "Stuur invite-link", maar alleen bij een gearchiveerde
  // patiënt. Bij iemand die in behandeling is doet de knop precies wat er staat
  // en hoort er geen drempel; bij iemand uit het archief haalt dezelfde knop de
  // markering weg, en dat staat nergens op de knop. Wie in een afgesloten
  // dossier zit is daar meestal om te lezen.
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false)
  const reactivate = trpc.patients.reactivate.useMutation({
    onSuccess: () => {
      utils.patients.get.invalidate({ id })
      utils.patients.list.invalidate()
      utils.programs.list.invalidate()
      toast.success('Weer in behandeling. Afgesloten programma’s lopen weer door.')
    },
    // De server schrijft hier zelf een bruikbare melding (NOT_FOUND als iemand
    // anders net heractiveerde, PRECONDITION_FAILED zonder praktijk). Letterlijk
    // tonen zegt meer dan een eigen tekst.
    onError: (e) => {
      toast.error(e.message)
      utils.patients.get.invalidate({ id })
    },
  })
  const resendInvite = trpc.invite.resend.useMutation({
    onSuccess: (res) => {
      // Opnieuw uitnodigen doet meer dan mailen: `invite.resend` heft via
      // `hefUitbehandeldOp` de uitbehandel-markering op. Zonder deze twee
      // invalidaties blijft de archiefbanner hierboven staan en blijft de
      // patiënt in het archief hangen terwijl hij al weer in behandeling is,
      // tot iemand de pagina ververst. Onvoorwaardelijk, want de markering kan
      // ook door een collega gezet zijn nadat deze pagina laadde.
      utils.patients.get.invalidate({ id })
      utils.patients.list.invalidate()
      if (res.mailDelivered) {
        const expires = new Date(res.expiresAt).toLocaleString('nl-NL', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
        toast.success(`Uitnodiging verstuurd naar ${res.email}. Verloopt ${expires}.`, {
          // Alleen als er ook echt iets op te heffen viel. De programma's
          // blijven dicht: dat doet alleen "Weer in behandeling".
          description: patient?.careStatus
            ? `${patient.name} staat daarmee ook weer in behandeling. De programma's die bij het afsluiten dichtgingen blijven dicht.`
            : undefined,
        })
        setInviteFallback(null)
      } else {
        setInviteFallback({
          url: res.instructionUrl,
          email: res.email,
          expiresAt: res.expiresAt,
          error: res.mailError,
        })
        toast.error('Mail kon niet bezorgd worden, kopieer de link hieronder.')
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
    daysPerWeek: number; flexibleSchedule: boolean; weeklyTarget: number | null;
    startDate: Date | null; endDate: Date | null; isTemplate: boolean;
    updatedAt: Date | string; reviewAfterWeeks: number | null
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
          <DarkButton variant="secondary" href={`${portal.patients}`}>
            Terug naar patiënten
          </DarkButton>
        </div>
      </div>
    )
  }

  const status = patient.programStatus ? STATUS_CONFIG[patient.programStatus] : null
  // Behandelstatus, niet programmastatus. Gevuld = deze praktijk of deze coach
  // heeft de behandeling afgesloten; het dossier hieronder is gewoon compleet.
  const careStatus = patient.careStatus ?? null
  const careStatusDatum = formatDischargeDate(careStatus?.dischargedAt) ?? 'onbekende datum'
  const careStatusReden = dischargeReasonTekst(careStatus?.reason)
  const activePrograms = programs.filter(p => p.status === 'ACTIVE' && !p.isTemplate)
  // Actief overzicht = alles behalve afgesloten; afgesloten schema's blijven
  // bewaard maar verhuizen naar een aparte, doorzichtige sectie.
  const openPrograms = programs.filter(p => !isClosedStatus(p.status))
  const closedPrograms = programs.filter(p => isClosedStatus(p.status))

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 space-y-5">
        {/* Back */}
        <Link
          href={`${portal.patients}`}
          className="athletic-mono inline-flex items-center gap-1.5"
          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
        >
          ← TERUG
        </Link>

        {/* Archiefbanner. Staat bovenaan omdat de rest van de pagina er precies
            hetzelfde uitziet als bij iemand die wel in behandeling is: het
            dossier blijft compleet. Zonder deze regel zou je dat verschil
            nergens zien. */}
        {careStatus && (
          <Tile accentBar={P.inkMuted}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <MetaLabel style={{ color: P.inkMuted }}>NIET MEER IN BEHANDELING</MetaLabel>
                <p style={{ color: P.ink, fontSize: 13.5, lineHeight: 1.5 }}>
                  {`Afgesloten op ${careStatusDatum} door ${careStatus.dischargedByName}`}
                  {careStatusReden ? `, ${careStatusReden}` : ''}.
                </p>
                {careStatus.note && (
                  <p style={{ color: P.inkMuted, fontSize: 12.5, lineHeight: 1.5 }}>
                    {careStatus.note}
                  </p>
                )}
                <p style={{ color: P.inkDim, fontSize: 12, lineHeight: 1.5 }}>
                  Het dossier hieronder is compleet gebleven. {patient.name} staat alleen niet meer
                  in je werklijst en krijgt geen herinneringen meer van jou.
                </p>
              </div>
              <DarkButton
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={reactivate.isPending}
                loading={reactivate.isPending}
                onClick={() => reactivate.mutate({ id: patient.id })}
              >
                Weer in behandeling
              </DarkButton>
            </div>
          </Tile>
        )}

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
          {/* Behandelen is voorbehouden aan de therapeut; een coach ziet het
              dossier wel, maar logt geen behandelsessies. */}
          {!portal.isCoach && (
            <DarkButton
              variant="primary"
              href={`${portal.base}/treatment/${patient.id}`}
            >
              ▶ Start behandeling
            </DarkButton>
          )}
          <DarkButton
            size="sm"
            variant="secondary"
            disabled={resendInvite.isPending}
            loading={resendInvite.isPending}
            onClick={() => {
              if (careStatus) setResendConfirmOpen(true)
              else resendInvite.mutate({ patientId: patient.id })
            }}
          >
            <span className="inline-flex items-center gap-1.5"><IconMail size={15} /> Stuur invite-link</span>
          </DarkButton>
          <DarkButton
            size="sm"
            variant="secondary"
            href={`${portal.base}/week-planner?patientId=${patient.id}`}
          >
            <span className="inline-flex items-center gap-1.5"><IconCalendar size={15} /> Weekschema</span>
          </DarkButton>
          {/* Berichten zijn atleet-only — patiënten hebben geen chat-omgeving */}
          {patient.role === 'ATHLETE' && (
            <DarkButton
              variant="secondary"
              href={`${portal.base}/messages/${patient.id}`}
            >
              Berichten
            </DarkButton>
          )}
          {/* Co-monitoring: een fysiotherapeut laten meekijken. De atleet
              keurt die koppeling zelf goed. */}
          {portal.isCoach && (
            <DarkButton size="sm" variant="secondary" onClick={() => setCoMonitorOpen(true)}>
              Therapeut laten meekijken
            </DarkButton>
          )}
          {/* Loslaten kan alleen je eigen koppeling raken; de atleet houdt zijn
              account en zijn data. Alleen in het coach-portaal, want in de
              praktijk loopt afsluiten via de patiëntadministratie. */}
          {portal.isCoach && (
            <DarkButton size="sm" variant="secondary" onClick={() => setUnlinkOpen(true)}>
              Koppeling verbreken
            </DarkButton>
          )}
          {/* Bewust NA "koppeling verbreken" en met een eigen woord: dit is de
              zachte variant. Verbreken haalt toegang en programma's weg,
              inactief zetten laat het dossier heel. Wie al inactief staat ziet
              hier niets; die knop staat in de banner bovenaan. */}
          {!careStatus && (
            <DarkButton size="sm" variant="secondary" onClick={() => setDischargeOpen(true)}>
              Op inactief zetten
            </DarkButton>
          )}
          {/* Programma's. Een patient kan er meerdere naast elkaar hebben
              (bv. dagelijkse iso's + 3×/week kracht). "+ Programma" en
              "Vanaf template" blijven daarom altijd beschikbaar — ook als er
              al een programma loopt — zodat je makkelijk een 2e/3e toevoegt. */}
          {patient.programId && (
            <DarkButton
              variant="secondary"
              href={`${portal.base}/programs/${patient.programId}/edit`}
            >
              Programma
            </DarkButton>
          )}
          <DarkButton
            size="sm"
            variant="secondary"
            onClick={() => setAssignTemplateOpen(true)}
          >
            <span className="inline-flex items-center gap-1.5"><IconClipboard size={15} /> Vanaf template</span>
          </DarkButton>
          <DarkButton
            size="sm"
            variant="secondary"
            href={`${portal.base}/programs/new?patientId=${patient.id}`}
          >
            + Programma toevoegen
          </DarkButton>
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

        {/* Stats row — bewust de kleine maat en zonder tint: dit is context
            bij het dossier, niet het scherm zelf. De grote gekleurde cijfers
            vochten om aandacht met de acties erboven. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricTile
            size="sm"
            label="Actieve prog."
            value={activePrograms.length}
          />
          <MetricTile
            size="sm"
            label="Totaal prog."
            value={programs.length}
          />
          <MetricTile
            size="sm"
            label="Programma duur"
            value={patient.weeksTotal ? `${patient.weeksTotal}w` : '—'}
          />
          <MetricTile
            size="sm"
            label="Startdatum"
            value={patient.startDate ? new Date(patient.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '—'}
          />
        </div>

        {/* Wat er nog moet gebeuren voordat het traject echt loopt. Staat
            BOVEN de tabs: in de revalidatie-tab zou de kaart pas zichtbaar zijn
            na een klik, en dan doet hij zijn werk niet. Verdwijnt vanzelf zodra
            alles af is of er geen traject loopt. */}
        {showRehab && (
          <TrajectChecklist
            patientId={patient.id}
            dpaAcceptedAt={patient.dpaAcceptedAt}
            onResendInvite={() => resendInvite.mutate({ patientId: patient.id })}
            resendPending={resendInvite.isPending}
          />
        )}

        {/* Tabs */}
        <Tabs defaultValue={initialTab} className="space-y-4">
          {/* Flexrij, geen grid van gelijke kolommen. Met acht kolommen was een
              achtste van de breedte smaller dan "Revalidatie", waardoor het
              woord buiten zijn eigen pil viel en tegen de buren plakte. De
              tabs delen nu de ruimte als die er is (flex-1) maar krimpen
              nooit onder hun tekst (whitespace-nowrap); past het geheel niet,
              dan schuift de rij horizontaal. */}
          <TabsList className="w-full flex gap-0.5 rounded-xl overflow-x-auto" style={CARD}>
            <TabsTrigger value="profiel" className="text-xs px-2 flex-1 whitespace-nowrap">Profiel</TabsTrigger>
            <TabsTrigger value="programmas" className="text-xs px-2 flex-1 whitespace-nowrap">Progr.</TabsTrigger>
            <TabsTrigger value="geschiedenis" className="text-xs px-2 flex-1 whitespace-nowrap">Historie</TabsTrigger>
            {showRehab && <TabsTrigger value="revalidatie" className="text-xs px-2 flex-1 whitespace-nowrap">Revalidatie</TabsTrigger>}
            <TabsTrigger value="tests" className="text-xs px-2 flex-1 whitespace-nowrap">Tests</TabsTrigger>
            <TabsTrigger value="signalen" className="text-xs px-2 flex-1 whitespace-nowrap">Signalen</TabsTrigger>
            <TabsTrigger value="voortgang" className="text-xs px-2 flex-1 whitespace-nowrap">Voortgang</TabsTrigger>
            {showWearables && <TabsTrigger value="wearables" className="text-xs px-2 flex-1 whitespace-nowrap">Watch</TabsTrigger>}
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
                    {patient.notes ?? 'Nog geen notities, klik Bewerken om toe te voegen.'}
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
                {openPrograms.length} programma{openPrograms.length !== 1 ? "'s" : ''}
              </MetaLabel>
              <DarkButton
                variant="secondary"
                size="sm"
                href={`${portal.base}/programs/new?patientId=${patient.id}`}
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
                    onClick={() => router.push(`${portal.base}/programs/new?patientId=${patient.id}`)}
                  >
                    + Programma aanmaken
                  </DarkButton>
                </div>
              </Tile>
            )}
            {openPrograms.map(prog => (
              <ProgramTile key={prog.id} prog={prog} patientId={patient.id} />
            ))}
            {closedPrograms.length > 0 && (
              <div className="pt-3 space-y-3">
                <MetaLabel>Afgesloten · {closedPrograms.length}</MetaLabel>
                <p style={{ color: P.inkDim, fontSize: 11, marginTop: -4 }}>
                  Bewaard in het patiëntdossier, heropen om weer actief te maken.
                </p>
                {closedPrograms.map(prog => (
                  <ProgramTile key={prog.id} prog={prog} patientId={patient.id} dimmed />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── TAB: Geschiedenis ─────────────────────────────────── */}
          <TabsContent value="geschiedenis" className="space-y-3">
            {/* Wat heeft deze persoon deze maand gedaan, en hoeveel daarvan
                stond gepland. De lijst eronder is het detail. */}
            <MonthSummary patientId={patient.id} />
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
                            {(() => { const Icon = CARDIO_ICON_MAP[c.activity as CardioActivityKey]; return Icon ? <Icon size={13} /> : act?.icon })()} {act?.label ?? c.activity}
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
                            <span className="athletic-mono" style={{ background: c.painLevel >= 6 ? 'rgba(240,121,108,0.15)' : 'rgba(232,122,85,0.14)', color: c.painLevel >= 6 ? P.danger : P.lime, fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>
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
                            href={`${portal.patients}/${id}/sessions/${session.id}/edit`}
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
                              background: session.painLevel >= 6 ? 'rgba(240,121,108,0.15)' : 'rgba(232,122,85,0.14)',
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
                        {session.exercises.map((ex) => {
                          // Per set, want alleen `weight` toont de zwaarste set:
                          // 40/50/60/60 kg kwam langs als kaal "60 kg".
                          const weightLabel = formatWeightsPerSet(ex.weightsPerSet, ex.weight)
                          return (
                          <div
                            key={ex.id}
                            className="flex items-start justify-between gap-2 text-xs"
                            style={{ color: P.inkMuted }}
                          >
                            <span style={{ color: P.ink }}>{ex.name}</span>
                            <span className="athletic-mono text-right" style={{ fontSize: 10, letterSpacing: '0.06em' }}>
                              {ex.sets != null && ex.reps != null
                                ? `${ex.sets}×${ex.reps}`
                                : ex.sets != null
                                  ? `${ex.sets} sets`
                                  : '—'}
                              {weightLabel != null && ` · ${weightLabel}`}
                              {ex.painLevel != null && ` · NRS ${ex.painLevel}`}
                            </span>
                          </div>
                          )
                        })}
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
          {/* Alles hieronder leest en schrijft via therapistProcedure. Voor een
              coach bleef alleen een leeg blok over plus een FORBIDDEN die
              nergens in beeld kwam, dus de tab is er voor hem niet. */}
          {showRehab && (
            <TabsContent value="revalidatie" className="space-y-4">
              <RehabActivationToggle
                patientId={patient.id}
                patientName={patient.name}
                autoOpenSetup={startTraject}
              />
              <RehabTracker patientId={patient.id} />
            </TabsContent>
          )}

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
              href={`${portal.patients}/${patient.id}/progress`}
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

          {/* ── TAB: Wearable (Apple Watch) — alleen admin ────────── */}
          {showWearables && (
            <TabsContent value="wearables" className="space-y-3">
              <PatientWearablesTab patientId={patient.id} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {coMonitorOpen && (
        <CoMonitorDialog
          patientId={patient.id}
          patientName={patient.name ?? 'deze atleet'}
          onClose={() => setCoMonitorOpen(false)}
        />
      )}

      {unlinkOpen && (
        <UnlinkDialog
          patientId={patient.id}
          patientName={patient.name ?? 'deze atleet'}
          onClose={() => setUnlinkOpen(false)}
          onDone={() => router.push(portal.patients)}
        />
      )}

      {/* Opnieuw uitnodigen vanuit het archief. De knop belooft een mail, de
          server heft er ook de uitbehandel-markering mee op, en dat verschil
          hoort de therapeut te zien vóórdat hij klikt en niet erna in een
          toast. De tekst zegt er meteen bij wat er níet gebeurt, want dat is de
          reden om in plaats hiervan "Weer in behandeling" te kiezen. */}
      <Dialog open={resendConfirmOpen} onOpenChange={(o) => !o && setResendConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opnieuw uitnodigen en weer in behandeling?</DialogTitle>
            <DialogDescription>
              {patient.name} staat nu op inactief. Een nieuwe uitnodiging haalt die markering weg,
              dus {patient.name} komt terug in je werklijst, je signalen en de dagelijkse
              herinneringen.
            </DialogDescription>
          </DialogHeader>

          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.6 }}>
            De programma&rsquo;s die bij het afsluiten dichtgingen blijven dicht. Wil je die wél
            terug, gebruik dan &ldquo;Weer in behandeling&rdquo; bovenaan het dossier.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <DarkButton
              variant="secondary"
              onClick={() => setResendConfirmOpen(false)}
              disabled={resendInvite.isPending}
            >
              Annuleren
            </DarkButton>
            <DarkButton
              variant="primary"
              disabled={resendInvite.isPending}
              loading={resendInvite.isPending}
              onClick={() => {
                setResendConfirmOpen(false)
                resendInvite.mutate({ patientId: patient.id })
              }}
            >
              Uitnodiging sturen
            </DarkButton>
          </div>
        </DialogContent>
      </Dialog>

      {dischargeOpen && (
        <DischargeDialog
          patientId={patient.id}
          patientName={patient.name ?? `deze ${portal.personLabel}`}
          personLabel={portal.personLabel}
          // Rol en niet het portaal: de server kijkt naar de rol, en het
          // coach-segment is een re-export van deze pagina.
          role={me?.role}
          onClose={() => setDischargeOpen(false)}
          onDone={() => setDischargeOpen(false)}
        />
      )}
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
                      background: high ? 'rgba(240,121,108,0.15)' : 'rgba(245,185,66,0.14)',
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

type ProgramTileData = {
  id: string; name: string; status: string; weeks: number;
  daysPerWeek: number; flexibleSchedule: boolean; weeklyTarget: number | null;
  startDate: Date | null; endDate: Date | null; isTemplate: boolean;
  updatedAt: Date | string; reviewAfterWeeks: number | null
}

// Eén programma-tile. `dimmed` = afgesloten schema: doorzichtig zodat het
// visueel wegzakt maar zichtbaar blijft in het dossier.
function ProgramTile({
  prog,
  patientId,
  dimmed = false,
}: {
  prog: ProgramTileData
  patientId: string
  dimmed?: boolean
}) {
  const portal = usePortal()
  const progStatus = STATUS_CONFIG[prog.status] ?? STATUS_CONFIG.DRAFT
  const accent = STATUS_ACCENT[prog.status] ?? P.inkDim
  // Controle-signaal: actief programma dat langer dan de drempel
  // (reviewAfterWeeks of standaard 8) ongewijzigd is.
  const reviewDue =
    prog.status === 'ACTIVE' && !prog.isTemplate &&
    isReviewDue(prog.updatedAt, prog.reviewAfterWeeks)
  const weeksUnchanged = Math.floor(weeksSince(prog.updatedAt))
  return (
    <div style={{ opacity: dimmed ? 0.55 : 1 }}>
      <Tile accentBar={reviewDue ? P.gold : accent}>
        <div className="flex items-center gap-3">
          <Link href={`${portal.base}/programs/${prog.id}/edit`} className="flex-1 min-w-0 cursor-pointer">
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
              {/* Flexibele week: de frequentie staat in weeklyTarget, niet in daysPerWeek. */}
              {prog.weeks} weken · {prog.flexibleSchedule ? (prog.weeklyTarget ?? prog.daysPerWeek) : prog.daysPerWeek}×/week
              {prog.flexibleSchedule && ' (flexibel)'}
              {prog.startDate && ` · Start ${new Date(prog.startDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`}
              {dimmed && prog.endDate && ` · Afgesloten ${new Date(prog.endDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`}
            </p>
            {reviewDue && (
              <span
                className="inline-flex items-center gap-1.5 mt-2"
                style={{
                  background: 'rgba(245,185,66,0.12)',
                  color: P.gold,
                  border: `1px solid ${P.gold}`,
                  borderRadius: 999,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                ⚠ Controleer schema · {weeksUnchanged} wk ongewijzigd
                {prog.reviewAfterWeeks ? ` (ingesteld: ${prog.reviewAfterWeeks})` : ''}
              </span>
            )}
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
          <ProgramActions programId={prog.id} status={prog.status} patientId={patientId} reviewDue={reviewDue} />
        </div>
      </Tile>
    </div>
  )
}

function ProgramActions({
  programId,
  status,
  patientId,
  reviewDue = false,
}: {
  programId: string
  status: string
  patientId: string
  reviewDue?: boolean
}) {
  const portal = usePortal()
  const utils = trpc.useUtils()
  const invalidate = () => {
    utils.programs.list.invalidate()
    utils.programs.reviewDue.invalidate()
    utils.patients.get.invalidate({ id: patientId })
  }
  const save = trpc.programs.save.useMutation({ onSuccess: invalidate })
  const markReviewed = trpc.programs.markReviewed.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Schema gemarkeerd als gecontroleerd')
    },
  })

  const isActive = status === 'ACTIVE'
  const isClosed = isClosedStatus(status)

  return (
    <div className="flex items-center gap-2 shrink-0">
      {reviewDue && (
        <DarkButton
          variant="secondary"
          size="sm"
          disabled={markReviewed.isPending}
          onClick={() => markReviewed.mutate({ id: programId })}
        >
          ✓ Gecontroleerd
        </DarkButton>
      )}
      {/* Actief → afsluiten: verdwijnt uit het actieve overzicht maar blijft
          bewaard in het dossier. */}
      {isActive && (
        <DarkButton
          variant="secondary"
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { id: programId, status: 'COMPLETED', endDate: new Date().toISOString() },
              { onSuccess: () => toast.success('Programma afgesloten') },
            )
          }
        >
          Afsluiten
        </DarkButton>
      )}
      {/* Afgesloten → heropenen: terug naar actief, einddatum gewist. */}
      {isClosed && (
        <DarkButton
          variant="primary"
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { id: programId, status: 'ACTIVE', endDate: null },
              { onSuccess: () => toast.success('Programma heropend') },
            )
          }
        >
          ↻ Heropenen
        </DarkButton>
      )}
      {/* Concept → starten (bestaand gedrag). */}
      {!isActive && !isClosed && (
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
        href={`${portal.base}/programs/${programId}/edit`}
      >
        Wijzig
      </DarkButton>
    </div>
  )
}
