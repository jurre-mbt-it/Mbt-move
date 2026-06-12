'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import {
  ActionTile,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  SkeletonTile,
  Tile,
} from '@/components/dark-ui'
import { IconCardio, IconSleep, IconStrength, IconWarning } from '@/components/icons'

const URGENCY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  CRITICAL: { color: P.danger, bg: 'rgba(248,113,113,0.18)', label: 'Kritiek' },
  HIGH: { color: P.orange, bg: 'rgba(244,150,68,0.15)', label: 'Hoog' },
  MEDIUM: { color: P.gold, bg: 'rgba(244,194,97,0.14)', label: 'Middel' },
  LOW: { color: P.ice, bg: 'rgba(147,197,253,0.15)', label: 'Laag' },
}

/**
 * Deep-link per signaaltype: belasting/voortgang-signalen landen op de
 * voortgangspagina (load-curve), pijn op de signalen-tab, therapietrouw op
 * de historie-tab.
 */
function signalHref(i: { signalType: string; patientId: string }): string {
  switch (i.signalType) {
    case 'deload_needed':
    case 'overload_risk':
    case 'plateau':
    case 'ready_for_progression':
      return `/therapist/patients/${i.patientId}/progress`
    case 'adherence_drop':
      return `/therapist/patients/${i.patientId}?tab=geschiedenis`
    default:
      return `/therapist/patients/${i.patientId}?tab=signalen`
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

function activityHref(a: { type: ActivityType; patientId: string }): string {
  switch (a.type) {
    case 'wellness':
      return `/therapist/patients/${a.patientId}/progress`
    case 'pain':
      return `/therapist/patients/${a.patientId}?tab=signalen`
    default:
      return `/therapist/patients/${a.patientId}?tab=geschiedenis`
  }
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
  const utils = trpc.useUtils()

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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

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
          href="/therapist/settings/security"
          className="group block rounded-2xl transition-colors"
          style={{
            background: 'rgba(248,113,113,0.08)',
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

      {/* Stats — cijfers die per week bewegen i.p.v. statische totalen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile
          label="Signalen"
          value={signalsLoading ? '…' : insights.length}
          tint={insights.length === 0 ? P.lime : hasUrgent ? P.danger : P.gold}
          sub={insights.length === 0 ? 'Alles rustig' : 'Vragen om actie'}
          href="/therapist/signals"
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
          href="/therapist/patients"
        />
        <MetricTile
          label="Stil"
          value={dashLoading ? '…' : silent.length}
          tint={silent.length > 0 ? P.gold : P.lime}
          sub="> 7 dagen geen activiteit"
        />
      </div>

      {/* Vraagt aandacht — top-signalen uit de Clinical Insight Engine.
          Sectie verschijnt alleen als er echt iets speelt; bij rust volstaat
          de SIGNALEN-stat hierboven. */}
      {(topSignals.length > 0 || silent.length > 0) && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Kicker>Vraagt aandacht</Kicker>
          <Link
            href="/therapist/signals"
            className="athletic-mono"
            style={{ color: P.brand, fontSize: 11, letterSpacing: '0.12em' }}
          >
            ALLES →
          </Link>
        </div>
        {topSignals.map((i) => {
            const cfg = URGENCY_CONFIG[i.urgency] ?? URGENCY_CONFIG.MEDIUM
            return (
              <Tile key={i.id} href={signalHref(i)} accentBar={cfg.color}>
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
                  href={`/therapist/patients/${p.patientId}`}
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
                          ? `/therapist/patients/${s.patientId}?tab=geschiedenis`
                          : `/therapist/patients/${s.patientId}`
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
                    <Link
                      key={`${a.type}-${a.id}`}
                      href={activityHref(a as { type: ActivityType; patientId: string })}
                      className="athletic-tap flex items-center gap-3 py-2.5"
                      style={{
                        borderTop: idx > 0 ? `1px solid ${P.line}` : 'none',
                      }}
                      onPointerEnter={() => utils.patients.get.prefetch({ id: a.patientId })}
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
                    </Link>
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
            href="/therapist/programs/new"
            label="Nieuw programma"
            sub="Strength / cardio / walk-run"
            bar={P.brand}
          />
          <ActionTile
            href="/therapist/exercises/new"
            label="Nieuwe oefening"
            sub="Toevoegen aan bibliotheek"
            bar={P.ice}
          />
          <ActionTile
            href="/therapist/week-planner"
            label="Weekschema"
            sub="Plan programmas in"
            bar={P.gold}
          />
          <ActionTile
            href="/therapist/patients"
            label="Patiënt uitnodigen"
            sub="Nieuwe patiënt aanmaken"
            bar={P.purple}
          />
          </div>
        </div>
      </div>
    </div>
  )
}
