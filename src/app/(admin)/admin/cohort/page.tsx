'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  Kicker,
  MetaLabel,
  MetricTile,
  P,
  Tile,
} from '@/components/dark-ui'

const WINDOWS = [
  { label: '7 dagen', days: 7 },
  { label: '30 dagen', days: 30 },
  { label: '90 dagen', days: 90 },
  { label: '365 dagen', days: 365 },
] as const

export default function AdminCohortPage() {
  const [windowDays, setWindowDays] = useState<number>(30)
  const { data: practices = [] } = trpc.admin.listPractices.useQuery()
  const [practiceId, setPracticeId] = useState<string | null>(null)

  const { data, isLoading } = trpc.cohort.adminOverview.useQuery({
    windowDays,
    practiceId: practiceId ?? undefined,
  })

  return (
    <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Kicker>Beheer · cohort</Kicker>
        <h1
          className="athletic-display"
          style={{ fontSize: 32, lineHeight: '38px', letterSpacing: '-0.025em', paddingTop: 2 }}
        >
          PLATFORM AGGREGATEN
        </h1>
        <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
          Anonieme aggregaten. Alleen gebruikers die in hun privacy-instellingen expliciet hebben aangevinkt mee te doen, tellen mee (AVG art. 9, opt-in vereist).
        </MetaLabel>
      </div>

      {/* Window + practice filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            onClick={() => setWindowDays(w.days)}
            className="athletic-tap athletic-mono px-3 py-1.5 rounded-lg transition-all"
            style={
              windowDays === w.days
                ? { background: P.brand, color: P.bg, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }
                : { background: P.surfaceHi, color: P.inkMuted, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', border: `1px solid ${P.line}` }
            }
          >
            {w.label}
          </button>
        ))}
        <div className="ml-auto">
          <select
            value={practiceId ?? ''}
            onChange={(e) => setPracticeId(e.target.value || null)}
            className="athletic-mono"
            style={{
              background: P.surfaceHi,
              color: P.ink,
              border: `1px solid ${P.line}`,
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            <option value="">Alle praktijken</option>
            {(practices as { id: string; name: string }[]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile
          label="Users"
          value={isLoading ? '…' : data?.totalUsers ?? 0}
          unit={data?.totalUsers != null ? `${data.patientCount}p · ${data.athleteCount}a` : undefined}
          tint={P.lime}
        />
        <MetricTile
          label={`Actief (${windowDays}d)`}
          value={isLoading ? '…' : data?.activeUserCount ?? 0}
          tint={P.ice}
        />
        <MetricTile
          label="Sessies"
          value={isLoading ? '…' : data?.totalSessions ?? 0}
          tint={P.gold}
        />
        <MetricTile
          label="Cardio"
          value={isLoading ? '…' : data?.totalCardioSessions ?? 0}
          tint={P.teal}
        />
      </div>

      {/* Pain + RPE */}
      <div className="grid grid-cols-2 gap-3">
        <Tile>
          <MetaLabel>Gem. pijn / sessie</MetaLabel>
          <div className="flex items-baseline gap-2 mt-2">
            <span
              className="athletic-mono"
              style={{
                color:
                  data?.avgPainLevel == null
                    ? P.inkMuted
                    : data.avgPainLevel >= 5
                      ? P.danger
                      : data.avgPainLevel >= 3
                        ? P.gold
                        : P.lime,
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: '-0.02em',
              }}
            >
              {data?.avgPainLevel != null ? data.avgPainLevel : '—'}
            </span>
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 12 }}>
              / 10
            </span>
          </div>
        </Tile>
        <Tile>
          <MetaLabel>Gem. RPE / sessie</MetaLabel>
          <div className="flex items-baseline gap-2 mt-2">
            <span
              className="athletic-mono"
              style={{ color: P.lime, fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em' }}
            >
              {data?.avgExertionLevel != null ? data.avgExertionLevel : '—'}
            </span>
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 12 }}>
              / 10
            </span>
          </div>
        </Tile>
      </div>

      {/* Readiness */}
      {data?.avgWellnessScore != null && (
        <Tile>
          <div className="flex items-center justify-between mb-2">
            <MetaLabel>Gem. readiness (wellness)</MetaLabel>
            <span
              className="athletic-mono"
              style={{
                color:
                  data.avgWellnessScore >= 70
                    ? P.lime
                    : data.avgWellnessScore >= 40
                      ? P.gold
                      : P.danger,
                fontSize: 14,
                fontWeight: 900,
              }}
            >
              {data.avgWellnessScore}%
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: P.surfaceHi }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${data.avgWellnessScore}%`,
                backgroundColor:
                  data.avgWellnessScore >= 70
                    ? P.lime
                    : data.avgWellnessScore >= 40
                      ? P.gold
                      : P.danger,
              }}
            />
          </div>
        </Tile>
      )}

      {/* Top exercises */}
      {data?.topExercises && data.topExercises.length > 0 && (
        <Tile>
          <div className="flex items-center justify-between mb-3">
            <MetaLabel>Meest gebruikte oefeningen</MetaLabel>
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
              top {data.topExercises.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {data.topExercises.map((ex, i) => {
              const max = data.topExercises[0]?.count ?? 1
              const widthPct = (ex.count / max) * 100
              return (
                <div key={ex.exerciseId} className="flex items-center gap-3">
                  <span
                    className="athletic-mono w-6 text-right shrink-0"
                    style={{ color: P.inkMuted, fontSize: 11, fontWeight: 800 }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{ color: P.ink, fontSize: 13, fontWeight: 600 }}
                    >
                      {ex.name}
                    </p>
                    <div
                      className="w-full h-1.5 rounded-full overflow-hidden mt-1"
                      style={{ background: P.surfaceHi }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${widthPct}%`, background: P.lime }}
                      />
                    </div>
                  </div>
                  <span
                    className="athletic-mono shrink-0"
                    style={{ color: P.lime, fontSize: 12, fontWeight: 900 }}
                  >
                    {ex.count}×
                  </span>
                </div>
              )
            })}
          </div>
        </Tile>
      )}

      {/* Empty state */}
      {!isLoading && data?.totalUsers === 0 && (
        <Tile>
          <div className="py-12 text-center">
            <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
              Geen gebruikers in cohort
            </p>
            <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              Mogelijke oorzaak: nog geen patiënten/atleten op het platform, of
              niemand in deze praktijk heeft zich expliciet aangemeld voor cohort-analytics.
            </p>
          </div>
        </Tile>
      )}

      {/* Privacy noot */}
      <Tile>
        <MetaLabel>Privacy</MetaLabel>
        <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
          Deze cijfers zijn aggregaten, geen individuele records. Alleen
          gebruikers die in hun privacy-instellingen expliciet hebben aangevinkt
          mee te doen, tellen mee (AVG art. 9, opt-in vereist voor bijzondere
          persoonsgegevens). Voor onderzoeksdata-export naar derden zie de aparte
          research-pagina (vereist apart consent per gebruiker).
        </p>
      </Tile>
    </div>
  )
}
