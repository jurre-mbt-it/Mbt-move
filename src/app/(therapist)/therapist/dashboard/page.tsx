'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import {
  ActionTile,
  DarkButton,
  Display,
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  Tile,
} from '@/components/dark-ui'

export default function TherapistDashboard() {
  const { data: patients = [], isLoading: patientsLoading } = trpc.patients.list.useQuery()
  const { data: programsRaw = [], isLoading: programsLoading } = trpc.programs.list.useQuery()
  const { data: me } = trpc.auth.getMe.useQuery()
  const programs = programsRaw as Array<{ status: string; isTemplate: boolean }>

  const activePatients = patients.filter((p) => p.programStatus === 'ACTIVE')
  const activePrograms = programs.filter((p) => p.status === 'ACTIVE' && !p.isTemplate)

  function weeksCurrent(startDate: Date | string | null | undefined): number {
    if (!startDate) return 1
    const diff = Date.now() - new Date(startDate).getTime()
    return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)))
  }

  const isLoading = patientsLoading || programsLoading

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div className="max-w-5xl w-full flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Kicker>{greeting}</Kicker>
        <Display size="md">DASHBOARD</Display>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Overzicht van vandaag
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricTile
          label="Actief"
          value={isLoading ? '…' : activePatients.length}
          tint={P.lime}
          sub="Patiënten met programma"
          href="/therapist/patients?filter=active"
        />
        <MetricTile
          label="Programma's"
          value={isLoading ? '…' : activePrograms.length}
          tint={P.ice}
          sub="Lopend"
          href="/therapist/programs"
        />
        <MetricTile
          label="Totaal"
          value={isLoading ? '…' : patients.length}
          tint={P.gold}
          sub="Patiënten in zorg"
          href="/therapist/patients"
        />
      </div>

      {/* Active patients */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Kicker>Actieve patiënten</Kicker>
          <Link
            href="/therapist/patients"
            className="athletic-mono"
            style={{ color: P.lime, fontSize: 11, letterSpacing: '0.12em' }}
          >
            ALLES →
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {isLoading && (
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, padding: 8 }}>
              LADEN…
            </span>
          )}
          {!isLoading && activePatients.length === 0 && (
            <Tile>
              <p style={{ color: P.inkMuted, fontSize: 13, textAlign: 'center', padding: 12 }}>
                Geen actieve patiënten
              </p>
            </Tile>
          )}
          {activePatients.slice(0, 4).map((p) => {
            const current = weeksCurrent(p.startDate)
            const total = p.weeksTotal || 1
            const pct = Math.min(100, (Math.min(current, total) / total) * 100)
            return (
              <Tile key={p.id} href={`/therapist/patients/${p.id}`}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 athletic-mono"
                    style={{ background: P.surfaceHi, color: P.lime, fontSize: 13, fontWeight: 900 }}
                  >
                    {p.avatarInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }} className="truncate">
                      {p.name}
                    </p>
                    <p
                      className="athletic-mono"
                      style={{
                        color: P.inkMuted,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        textTransform: 'none',
                        fontWeight: 500,
                      }}
                    >
                      {p.programName ?? 'Geen programma'}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div
                        className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ backgroundColor: P.surfaceHi }}
                      >
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, backgroundColor: P.lime }}
                        />
                      </div>
                      <span
                        className="athletic-mono shrink-0"
                        style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em' }}
                      >
                        W{Math.min(current, total)}/{total}
                      </span>
                    </div>
                  </div>
                </div>
              </Tile>
            )
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-2">
        <Kicker>Snelle acties</Kicker>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionTile
            href="/therapist/programs/new"
            label="Nieuw programma"
            sub="Strength / cardio / walk-run"
            bar={P.lime}
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
  )
}
