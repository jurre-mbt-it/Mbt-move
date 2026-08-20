'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  DarkScreen,
  Display,
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
] as const

export default function TherapistCohortPage() {
  const [windowDays, setWindowDays] = useState<number>(30)
  const { data, isLoading } = trpc.cohort.therapistOverview.useQuery({ windowDays })

  return (
    <DarkScreen>
      <div className="max-w-5xl w-full mx-auto px-4 pt-6 pb-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Kicker>Cohort overzicht</Kicker>
          <Display size="md">JOUW PATIËNTEN</Display>
          <MetaLabel style={{ marginTop: 2, textTransform: 'none', fontWeight: 500 }}>
            Aggregaten over alle patiënten in jouw zorg. Patiënten die zich hebben
            uitgesloten tellen niet mee.
          </MetaLabel>
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-2">
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
              {w.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Cohort"
            value={isLoading ? '…' : data?.cohortSize ?? 0}
            unit="patiënten"
            tint={P.brand}
          />
          <MetricTile
            label="Sessies"
            value={isLoading ? '…' : data?.totalSessions ?? 0}
            tint={P.ice}
          />
          <MetricTile
            label="Deze week"
            value={isLoading ? '…' : data?.sessionsThisWeek ?? 0}
            tint={P.gold}
          />
          <MetricTile
            label="Adherentie"
            value={isLoading ? '…' : data?.adherencePct != null ? data.adherencePct : '—'}
            unit={data?.adherencePct != null ? '%' : undefined}
            tint={
              data?.adherencePct == null
                ? P.inkMuted
                : data.adherencePct >= 70
                  ? P.lime
                  : data.adherencePct >= 40
                    ? P.gold
                    : P.danger
            }
          />
        </div>

        {/* Pain + readiness */}
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
                style={{
                  color: P.brand,
                  fontSize: 32,
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                }}
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
              <MetaLabel>Gem. readiness</MetaLabel>
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
            <p style={{ color: P.inkMuted, fontSize: 11, marginTop: 6 }}>
              Gemiddeld over alle wellness-checks van je cohort in deze periode.
            </p>
          </Tile>
        )}

        {/* Top exercises */}
        {data?.topExercises && data.topExercises.length > 0 && (
          <Tile>
            <div className="flex items-center justify-between mb-3">
              <MetaLabel>Meest gebruikte oefeningen</MetaLabel>
              <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11 }}>
                top 5
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {data.topExercises.map((ex, i) => {
                const max = data.topExercises[0]?.count ?? 1
                const widthPct = (ex.count / max) * 100
                return (
                  <div key={ex.exerciseId} className="flex items-center gap-3">
                    <span
                      className="athletic-mono w-5 text-right shrink-0"
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
                          style={{ width: `${widthPct}%`, background: P.brand }}
                        />
                      </div>
                    </div>
                    <span
                      className="athletic-mono shrink-0"
                      style={{ color: P.brand, fontSize: 12, fontWeight: 900 }}
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
        {!isLoading && data?.cohortSize === 0 && (
          <Tile>
            <div className="py-12 text-center">
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>
                Geen patiënten in cohort
              </p>
              <p
                style={{ color: P.inkMuted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}
              >
                Zodra patiënten zijn gekoppeld en sessies hebben gelogd verschijnen
                hier de aggregaten.
              </p>
            </div>
          </Tile>
        )}
      </div>
    </DarkScreen>
  )
}
