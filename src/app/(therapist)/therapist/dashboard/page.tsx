'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { usePortal, type Portal } from '@/lib/portal'
import {
  ActionTile,
  DarkButton,
  DarkDialogTitle,
  DarkDrawer,
  DarkDrawerContent,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  SkeletonText,
  SkeletonTile,
  Tile,
} from '@/components/dark-ui'
import { IconCardio, IconSleep, IconStrength, IconWarning } from '@/components/icons'
import { QuickStartCard } from '@/components/system/QuickStartCard'
import { StartTreatmentCard } from '@/components/system/StartTreatmentCard'
import { CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, type CardioActivityKey, type CardioProtocolKey } from '@/lib/cardio-constants'
import { formatPaceFromSecPerKm } from '@/lib/cardio-zones'
import { formatWeightsPerSet } from '@/lib/session-sets'

const URGENCY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  CRITICAL: { color: P.danger, bg: 'rgba(240,121,108,0.18)', label: 'Kritiek' },
  HIGH: { color: P.orange, bg: 'rgba(240,154,74,0.15)', label: 'Hoog' },
  MEDIUM: { color: P.gold, bg: 'rgba(245,185,66,0.14)', label: 'Middel' },
  LOW: { color: P.ice, bg: 'rgba(159,206,201,0.15)', label: 'Laag' },
}

/**
 * Deep-link per signaaltype: belasting/voortgang-signalen landen op de
 * voortgangspagina (load-curve), pijn op de signalen-tab, therapietrouw op
 * de historie-tab.
 */
function signalHref(portal: Portal, i: { signalType: string; patientId: string }): string {
  switch (i.signalType) {
    case 'deload_needed':
    case 'overload_risk':
    case 'plateau':
    case 'ready_for_progression':
      return `${portal.patients}/${i.patientId}/progress`
    case 'adherence_drop':
      return `${portal.patients}/${i.patientId}?tab=geschiedenis`
    default:
      return `${portal.patients}/${i.patientId}?tab=signalen`
  }
}

type ActivityType = 'strength' | 'cardio' | 'wellness' | 'pain'

const ACTIVITY_CONFIG: Record<
  ActivityType,
  { Icon: (p: { size?: number; className?: string }) => React.ReactNode; label: string; tint: string }
> = {
  strength: { Icon: IconStrength, label: 'Krachtsessie', tint: P.lime },
  cardio: { Icon: IconCardio, label: 'Cardio', tint: P.danger },
  wellness: { Icon: IconSleep, label: 'Wellness-check', tint: P.ice },
  pain: { Icon: IconWarning, label: 'Pijnmelding', tint: P.orange },
}

function activityHref(portal: Portal, a: { type: ActivityType; patientId: string }): string {
  switch (a.type) {
    case 'wellness':
      return `${portal.patients}/${a.patientId}/progress`
    case 'pain':
      return `${portal.patients}/${a.patientId}?tab=signalen`
    default:
      return `${portal.patients}/${a.patientId}?tab=geschiedenis`
  }
}

type ActivityDetailBase = {
  patientId: string
  patientName: string
  completedAt: Date | string | null
  notes: string | null
}
type ActivityDetail = ActivityDetailBase &
  (
    | {
        type: 'strength'
        programName: string | null
        therapistId: string | null
        therapistName: string | null
        durationMinutes: number | null
        painLevel: number | null
        exertionLevel: number | null
        exercises: Array<{
          id: string
          name: string
          sets: number | null
          reps: number | null
          weight: number | null
          weightsPerSet: unknown
          painLevel: number | null
          notes: string | null
        }>
      }
    | {
        type: 'cardio'
        programName: string | null
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
      }
    | {
        type: 'wellness'
        date: Date | string
        sleep: number
        soreness: number
        fatigue: number
        mood: number
        stress: number
      }
    | {
        type: 'pain'
        nrs: number
        location: string
        context: string
      }
  )

const WELLNESS_ROWS = [
  { key: 'sleep', label: 'Slaap' },
  { key: 'soreness', label: 'Spierpijn' },
  { key: 'fatigue', label: 'Vermoeidheid' },
  { key: 'mood', label: 'Stemming' },
  { key: 'stress', label: 'Stress' },
] as const

const PAIN_CONTEXT_LABELS: Record<string, string> = {
  rest: 'In rust',
  movement: 'Bij beweging',
  exercise: 'Tijdens oefening',
  after: 'Na inspanning',
  always: 'Continu',
}

function fmtDateTime(d: Date | string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  return `${date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
}

function weightLabel(ex: { weight: number | null; weightsPerSet: unknown }): string | null {
  // Alleen tonen als er écht gewichten gelogd zijn — bodyweight-oefeningen
  // hebben vaak een array vol nulls en dan is "—-—-— kg" alleen ruis.
  return formatWeightsPerSet(ex.weightsPerSet, ex.weight)
}

function StatBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl" style={{ background: P.surfaceHi, padding: 12 }}>
      <MetaLabel>{label}</MetaLabel>
      <p style={{ color: P.ink, fontSize: 16, fontWeight: 800, marginTop: 4 }}>{value}</p>
    </div>
  )
}

/** 1–5 score als segmentjes; 5 = goed (lime), laag = aandacht (danger). */
function ScoreDots({ value }: { value: number }) {
  const color = value >= 4 ? P.lime : value === 3 ? P.gold : P.danger
  return (
    <div className="flex gap-1" aria-label={`${value} van 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 16,
            height: 6,
            borderRadius: 2,
            background: i < value ? color : P.surfaceHi,
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  )
}

function timeAgo(d: Date | string, now: number): string {
  const t = new Date(d).getTime()
  const min = Math.round((now - t) / 60000)
  if (min < 1) return 'zojuist'
  if (min < 60) return `${min} min`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} u`
  const days = Math.floor((now - t) / 86400000)
  if (days === 1) return 'gisteren'
  if (days < 7) return `${days} dgn`
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export default function TherapistDashboard() {
  const portal = usePortal()
  // "Nu" + dag/weekgrenzen één keer vastleggen bij mount (lazy initializer)
  // zodat de render puur blijft en de query-keys stabiel zijn.
  const [{ now, dayStart, weekStart }] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return { now: Date.now(), dayStart: d.toISOString(), weekStart: monday.toISOString() }
  })

  const { data: patients = [], isLoading: patientsLoading } = trpc.patients.list.useQuery()
  const { data: signalsData, isLoading: signalsLoading } = trpc.insights.getDashboard.useQuery()
  const { data: dash, isLoading: dashLoading } = trpc.patients.therapistDashboard.useQuery({
    dayStart,
    weekStart,
  })
  const { data: me } = trpc.auth.getMe.useQuery()
  const { data: reviewDuePrograms = [] } = trpc.programs.reviewDue.useQuery()
  const utils = trpc.useUtils()

  // Feed-item aangeklikt → detail in de zijbalk i.p.v. navigeren.
  const [selectedActivity, setSelectedActivity] = useState<{
    type: ActivityType
    id: string
    patientId: string
    patientName: string
  } | null>(null)
  const { data: detailRaw, isLoading: detailLoading } = trpc.patients.activityDetail.useQuery(
    { type: selectedActivity?.type ?? 'strength', id: selectedActivity?.id ?? '' },
    { enabled: !!selectedActivity },
  )
  // Shallow cast — tRPC inference depth te diep (TS2589), zelfde reden als
  // recentSessions op de patiëntpagina.
  const detail = detailRaw as ActivityDetail | undefined

  const insights = (signalsData?.insights ?? []) as Array<{
    id: string
    patientId: string
    patientName: string
    signalType: string
    urgency: string
    title: string
  }>
  const topSignals = insights.slice(0, 4)
  const silent = dash?.silentPatients ?? []
  const todayPlanned = dash?.todayPlanned ?? []
  const activity = dash?.recentActivity ?? []

  // Praktijk-brede therapietrouw (14d): gemiddelde over patiënten met
  // geplande sessies in het window.
  const withCompliance = patients.filter((p) => p.compliancePercent !== null)
  const compliancePct =
    withCompliance.length > 0
      ? Math.round(
          (withCompliance.reduce((sum, p) => sum + (p.compliancePercent ?? 0), 0) /
            withCompliance.length) * 100,
        )
      : null

  const weekDelta = dash ? dash.weekSessions - dash.prevWeekSessions : 0
  const weekDeltaLabel = !dash
    ? ''
    : weekDelta > 0
      ? `+${weekDelta} t.o.v. vorige week`
      : weekDelta < 0
        ? `${weekDelta} t.o.v. vorige week`
        : 'Gelijk aan vorige week'

  const hasUrgent = insights.some((i) => i.urgency === 'CRITICAL' || i.urgency === 'HIGH')

  const nowDate = new Date(now)
  const hour = nowDate.getHours()
  const firstName = me?.firstName?.trim() || me?.name?.trim().split(/\s+/)[0] || ''
  const greeting =
    (hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond') +
    (firstName ? `, ${firstName}` : '')

  return (
    <div className="max-w-5xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Kicker>{greeting}</Kicker>
        <Display size="md">DASHBOARD</Display>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Wat er speelt sinds je laatste login
        </MetaLabel>
      </div>

      {/* MFA-enforcement banner — rood zolang MFA nog niet aan staat voor
          therapist/admin. Patiënten-dossiers zijn gevoelige medische data. */}
      {me?.mfaEnforcementPending && (
        <Link
          href={`${portal.base}/settings/security`}
          className="group block rounded-2xl transition-colors"
          style={{
            background: 'rgba(240,121,108,0.08)',
            border: `1px solid ${P.danger}`,
            padding: 16,
          }}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex items-center justify-center shrink-0 rounded-lg"
              style={{
                width: 32,
                height: 32,
                background: P.danger,
                color: P.bg,
                fontSize: 18,
                fontWeight: 900,
              }}
            >
              !
            </span>
            <div className="flex-1 min-w-0">
              <Kicker style={{ color: P.danger }}>MFA VERPLICHT</Kicker>
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                Zet Two-Factor Authentication nu aan
              </p>
              <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                Je behandelt medische data. Zonder MFA staat het patiënt-dossier open bij één
                gelekt wachtwoord. Neemt 2 minuten.
              </p>
            </div>
            <span
              className="athletic-mono"
              style={{
                color: P.danger,
                fontSize: 11,
                letterSpacing: '0.2em',
                fontWeight: 900,
                alignSelf: 'center',
              }}
            >
              REGEL →
            </span>
          </div>
        </Link>
      )}

      {/* Quick start — verdwijnt vanzelf zodra de vijf stappen staan. */}
      <QuickStartCard />

      {/* Stats — cijfers die per week bewegen i.p.v. statische totalen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile
          label="Signalen"
          value={signalsLoading ? '…' : insights.length}
          tint={insights.length === 0 ? P.lime : hasUrgent ? P.danger : P.gold}
          sub={insights.length === 0 ? 'Alles rustig' : 'Vragen om actie'}
          href={`${portal.base}/signals`}
        />
        <MetricTile
          label="Deze week"
          value={dashLoading ? '…' : dash?.weekSessions ?? 0}
          tint={P.brand}
          sub={dashLoading ? 'Sessies gelogd' : weekDeltaLabel}
        />
        <MetricTile
          label="Therapietrouw"
          value={patientsLoading ? '…' : compliancePct === null ? '—' : `${compliancePct}%`}
          tint={
            compliancePct === null
              ? P.inkMuted
              : compliancePct >= 80
                ? P.lime
                : compliancePct >= 60
                  ? P.gold
                  : P.danger
          }
          sub="Gepland vs. gelogd · 14d"
          href={`${portal.patients}`}
        />
        <MetricTile
          label="Stil"
          value={dashLoading ? '…' : silent.length}
          tint={silent.length > 0 ? P.gold : P.lime}
          sub="> 7 dagen geen activiteit"
        />
      </div>

      {/* Start behandeling — zelfde plek in de volgorde als op iOS: direct
          onder de cijfers. Suspense omdat de kaart `useSearchParams` leest. */}
      <Suspense fallback={null}>
        <StartTreatmentCard />
      </Suspense>

      {/* Vraagt aandacht — top-signalen uit de Clinical Insight Engine.
          Sectie verschijnt alleen als er echt iets speelt; bij rust volstaat
          de SIGNALEN-stat hierboven. */}
      {(topSignals.length > 0 || silent.length > 0) && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Kicker>Vraagt aandacht</Kicker>
          <Link
            href={`${portal.base}/signals`}
            className="athletic-mono"
            style={{ color: P.brand, fontSize: 11, letterSpacing: '0.12em' }}
          >
            Alles →
          </Link>
        </div>
        {topSignals.map((i) => {
            const cfg = URGENCY_CONFIG[i.urgency] ?? URGENCY_CONFIG.MEDIUM
            return (
              <Tile key={i.id} href={signalHref(portal, i)} accentBar={cfg.color}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="athletic-mono"
                        style={{
                          background: cfg.bg,
                          color: cfg.color,
                          fontSize: 10,
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontWeight: 900,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {cfg.label}
                      </span>
                      <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                        {i.patientName}
                      </span>
                    </div>
                    <p
                      className="truncate"
                      style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}
                    >
                      {i.title}
                    </p>
                  </div>
                  <span style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>
                    →
                  </span>
                </div>
              </Tile>
            )
          })}
        {!dashLoading && silent.length > 0 && (
          <Tile>
            <MetaLabel style={{ marginBottom: 10 }}>Stil · al 7+ dagen niets gelogd</MetaLabel>
            <div className="flex flex-wrap gap-2">
              {silent.map((p) => (
                <Link
                  key={p.patientId}
                  href={`${portal.patients}/${p.patientId}`}
                  className="athletic-mono athletic-tap inline-flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{
                    background: P.surfaceHi,
                    color: P.inkMuted,
                    fontSize: 11,
                    letterSpacing: '0.05em',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: P.gold,
                      display: 'inline-block',
                    }}
                  />
                  {p.name}
                  <span style={{ color: P.inkDim }}>
                    {p.lastActivityAt ? timeAgo(p.lastActivityAt, now) : 'nooit'}
                  </span>
                </Link>
              ))}
            </div>
          </Tile>
        )}
      </div>
      )}

      {/* Schema's om te controleren — programma's die langer dan hun drempel
          (ingesteld of standaard 8 weken) ongewijzigd zijn. Klik → patiënt-
          dossier, tab Programma's, waar je kunt wijzigen of "✓ Gecontroleerd". */}
      {reviewDuePrograms.length > 0 && (
        <div className="flex flex-col gap-2">
          <Kicker>Schema&apos;s om te controleren</Kicker>
          {reviewDuePrograms.map((r) => (
            <Tile
              key={r.programId}
              href={`${portal.patients}/${r.patientId}?tab=programmas`}
              accentBar={P.gold}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="athletic-mono"
                      style={{
                        background: 'rgba(245,185,66,0.14)',
                        color: P.gold,
                        fontSize: 10,
                        padding: '3px 9px',
                        borderRadius: 999,
                        fontWeight: 900,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Controle
                    </span>
                    <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                      {r.patientName}
                    </span>
                  </div>
                  <p className="truncate" style={{ color: P.inkMuted, fontSize: 13, marginTop: 6 }}>
                    {r.programName} · {r.weeksUnchanged} wk ongewijzigd (drempel {r.thresholdWeeks})
                  </p>
                </div>
                <span style={{ color: P.inkMuted, fontSize: 18 }} aria-hidden>
                  →
                </span>
              </div>
            </Tile>
          ))}
        </div>
      )}

      {/* Vandaag gepland + recente activiteit. Snelle acties vullen de
          linkerkolom onder "vandaag" zodat de lange feed rechts geen leeg
          gat naast zich krijgt; op mobiel blijft de volgorde vandaag →
          activiteit → acties (DOM-volgorde, activiteit spant 2 rijen op sm). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div className="flex flex-col gap-2">
          <Kicker>Vandaag gepland</Kicker>
          {dashLoading && <SkeletonTile lines={3} />}
          {!dashLoading && (
            <Tile>
              {todayPlanned.length === 0 && (
                <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                  Geen sessies gepland voor vandaag
                </p>
              )}
              <div className="flex flex-col">
                {todayPlanned.map((s, idx) => {
                  const done = s.completedAt !== null
                  const statusColor = done ? (s.completedAll ? P.lime : P.gold) : P.inkMuted
                  const statusLabel = done ? (s.completedAll ? 'GEDAAN' : 'DEELS') : 'GEPLAND'
                  return (
                    <Link
                      key={s.id}
                      href={
                        done
                          ? `${portal.patients}/${s.patientId}?tab=geschiedenis`
                          : `${portal.patients}/${s.patientId}`
                      }
                      className="athletic-tap flex items-center gap-3 py-2.5"
                      style={{
                        borderTop: idx > 0 ? `1px solid ${P.line}` : 'none',
                      }}
                      onPointerEnter={() => utils.patients.get.prefetch({ id: s.patientId })}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate"
                          style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}
                        >
                          {s.patientName}
                        </p>
                        <p
                          className="athletic-mono truncate"
                          style={{
                            color: P.inkMuted,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            fontWeight: 500,
                            marginTop: 2,
                          }}
                        >
                          {s.programName ?? 'Losse sessie'}
                        </p>
                      </div>
                      <span
                        className="athletic-mono shrink-0"
                        style={{
                          color: statusColor,
                          fontSize: 10,
                          letterSpacing: '0.12em',
                          fontWeight: 900,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </Tile>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:row-span-2">
          <Kicker>Recente activiteit</Kicker>
          {dashLoading && <SkeletonTile lines={3} />}
          {!dashLoading && (
            <Tile>
              {activity.length === 0 && (
                <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                  Nog geen activiteit gelogd
                </p>
              )}
              <div className="flex flex-col">
                {activity.map((a, idx) => {
                  const cfg = ACTIVITY_CONFIG[a.type as ActivityType] ?? ACTIVITY_CONFIG.strength
                  return (
                    <button
                      key={`${a.type}-${a.id}`}
                      type="button"
                      onClick={() =>
                        setSelectedActivity({
                          type: a.type as ActivityType,
                          id: a.id,
                          patientId: a.patientId,
                          patientName: a.patientName,
                        })
                      }
                      className="athletic-tap flex items-center gap-3 py-2.5 w-full text-left"
                      style={{
                        borderTop: idx > 0 ? `1px solid ${P.line}` : 'none',
                      }}
                      onPointerEnter={() =>
                        utils.patients.activityDetail.prefetch({
                          type: a.type as ActivityType,
                          id: a.id,
                        })
                      }
                    >
                      <span
                        aria-hidden
                        className="flex items-center justify-center shrink-0 rounded-full"
                        style={{ width: 34, height: 34, background: P.surfaceHi }}
                      >
                        <cfg.Icon size={18} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate"
                          style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}
                        >
                          {a.patientName}
                          <span style={{ color: cfg.tint, fontWeight: 500, fontSize: 12 }}>
                            {' '}· {cfg.label.toLowerCase()}
                          </span>
                        </p>
                        <p
                          className="athletic-mono truncate"
                          style={{
                            color: P.inkMuted,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            fontWeight: 500,
                            marginTop: 2,
                          }}
                        >
                          {a.detail}
                        </p>
                      </div>
                      <span
                        className="athletic-mono shrink-0"
                        style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em' }}
                      >
                        {timeAgo(a.at, now)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Tile>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Kicker>Snelle acties</Kicker>
          <div className="flex flex-col gap-1">
          <ActionTile
            href={`${portal.base}/programs/new`}
            label="Nieuw programma"
            sub="Strength / cardio / walk-run"
            bar={P.brand}
          />
          <ActionTile
            href={`${portal.base}/exercises/new`}
            label="Nieuwe oefening"
            sub="Toevoegen aan bibliotheek"
            bar={P.ice}
          />
          <ActionTile
            href={`${portal.base}/week-planner`}
            label="Weekschema"
            sub="Plan programmas in"
            bar={P.gold}
          />
          <ActionTile
            href={`${portal.patients}`}
            label="Patiënt uitnodigen"
            sub="Nieuwe patiënt aanmaken"
            bar={P.teal}
          />
          </div>
        </div>
      </div>

      {/* Detail-zijbalk voor een feed-item — bekijken zonder de pagina te
          verlaten; doorklikken naar het dossier kan onderin. */}
      <DarkDrawer
        open={!!selectedActivity}
        onOpenChange={(open) => {
          if (!open) setSelectedActivity(null)
        }}
      >
        <DarkDrawerContent>
          {selectedActivity && (
            <div className="flex flex-col gap-5">
              <div className="pr-8">
                <Kicker style={{ color: ACTIVITY_CONFIG[selectedActivity.type].tint }}>
                  {ACTIVITY_CONFIG[selectedActivity.type].label}
                </Kicker>
                <DarkDialogTitle style={{ marginTop: 4 }}>
                  {selectedActivity.patientName}
                </DarkDialogTitle>
                <MetaLabel style={{ marginTop: 6, textTransform: 'none', fontWeight: 500 }}>
                  {detail ? fmtDateTime(detail.completedAt) : ' '}
                </MetaLabel>
              </div>

              {detailLoading && <SkeletonText lines={6} />}

              {detail?.type === 'strength' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <StatBlock
                      label="Duur"
                      value={detail.durationMinutes != null ? `${detail.durationMinutes}m` : '—'}
                    />
                    <StatBlock
                      label="RPE"
                      value={detail.exertionLevel != null ? `${detail.exertionLevel}/10` : '—'}
                    />
                    <StatBlock
                      label="Pijn"
                      value={detail.painLevel != null ? `${detail.painLevel}/10` : '—'}
                    />
                  </div>
                  <div>
                    <MetaLabel style={{ marginBottom: 6 }}>
                      {detail.programName ?? 'Losse krachtsessie'}
                      {detail.therapistId && detail.therapistId !== detail.patientId
                        ? ` · gelogd door ${detail.therapistName ?? 'therapeut'}`
                        : ''}
                    </MetaLabel>
                    <div className="flex flex-col">
                      {detail.exercises.length === 0 && (
                        <p style={{ color: P.inkMuted, fontSize: 13 }}>Geen oefeningen gelogd</p>
                      )}
                      {detail.exercises.map((ex, idx) => (
                        <div
                          key={ex.id}
                          className="py-2.5"
                          style={{ borderTop: idx > 0 ? `1px solid ${P.line}` : 'none' }}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                              {ex.name}
                            </p>
                            <span
                              className="athletic-mono shrink-0"
                              style={{ color: P.inkMuted, fontSize: 12, letterSpacing: '0.04em' }}
                            >
                              {ex.sets ?? '—'}×{ex.reps ?? '—'}
                              {weightLabel(ex) ? ` · ${weightLabel(ex)}` : ''}
                            </span>
                          </div>
                          {ex.painLevel != null && ex.painLevel > 0 && (
                            <p
                              className="athletic-mono"
                              style={{ color: P.gold, fontSize: 11, marginTop: 2 }}
                            >
                              Pijn {ex.painLevel}/10
                            </p>
                          )}
                          {ex.notes && (
                            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                              {ex.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {detail?.type === 'cardio' && (
                <>
                  <MetaLabel>
                    {CARDIO_ACTIVITIES[detail.activity as CardioActivityKey]?.label ?? detail.activity}
                    {' · '}
                    {CARDIO_PROTOCOLS[detail.protocol as CardioProtocolKey]?.label ?? detail.protocol}
                    {detail.programName ? ` · ${detail.programName}` : ''}
                  </MetaLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <StatBlock label="Duur" value={`${Math.round(detail.durationSec / 60)} min`} />
                    <StatBlock
                      label="Afstand"
                      value={detail.distanceM != null ? `${(detail.distanceM / 1000).toFixed(2)} km` : '—'}
                    />
                    <StatBlock
                      label="Tempo"
                      value={
                        formatPaceFromSecPerKm(
                          detail.activity as CardioActivityKey,
                          detail.avgPaceSecPerKm,
                        ) ?? '—'
                      }
                    />
                    <StatBlock
                      label="Hartslag"
                      value={
                        detail.avgHeartRate != null
                          ? `${detail.avgHeartRate}${detail.maxHeartRate != null ? ` / ${detail.maxHeartRate}` : ''}`
                          : '—'
                      }
                    />
                    <StatBlock
                      label="Zone"
                      value={
                        detail.zone != null
                          ? `Z${detail.zone}${detail.targetZone != null ? ` (doel Z${detail.targetZone})` : ''}`
                          : detail.targetZone != null
                            ? `doel Z${detail.targetZone}`
                            : '—'
                      }
                    />
                    <StatBlock
                      label="RPE"
                      value={detail.rpe != null ? `${detail.rpe}/10` : '—'}
                    />
                  </div>
                  {detail.painLevel != null && detail.painLevel > 0 && (
                    <p className="athletic-mono" style={{ color: P.gold, fontSize: 12 }}>
                      Pijn tijdens sessie: {detail.painLevel}/10
                    </p>
                  )}
                </>
              )}

              {detail?.type === 'wellness' && (
                <div className="flex flex-col gap-3">
                  {WELLNESS_ROWS.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                        {row.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <ScoreDots value={detail[row.key]} />
                        <span
                          className="athletic-mono"
                          style={{ color: P.inkMuted, fontSize: 11, width: 26, textAlign: 'right' }}
                        >
                          {detail[row.key]}/5
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {detail?.type === 'pain' && (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="athletic-display"
                      style={{
                        color: detail.nrs >= 7 ? P.danger : detail.nrs >= 4 ? P.gold : P.lime,
                        fontSize: 48,
                        lineHeight: '52px',
                      }}
                    >
                      {detail.nrs}
                    </span>
                    <MetaLabel>/ 10 NRS</MetaLabel>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatBlock label="Locatie" value={detail.location} />
                    <StatBlock
                      label="Wanneer"
                      value={PAIN_CONTEXT_LABELS[detail.context] ?? detail.context}
                    />
                  </div>
                </>
              )}

              {detail?.notes && (
                <div>
                  <MetaLabel style={{ marginBottom: 4 }}>Notities</MetaLabel>
                  <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
                    {detail.notes}
                  </p>
                </div>
              )}

              <div className="pt-2" style={{ borderTop: `1px solid ${P.line}` }}>
                <DarkButton
                  variant="secondary"
                  size="sm"
                  href={activityHref(portal, selectedActivity)}
                  prefetch={() => utils.patients.get.prefetch({ id: selectedActivity.patientId })}
                >
                  Open patiëntdossier →
                </DarkButton>
              </div>
            </div>
          )}
        </DarkDrawerContent>
      </DarkDrawer>
    </div>
  )
}
