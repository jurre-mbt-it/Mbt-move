'use client'

import { trpc } from '@/lib/trpc/client'
import {
  DarkHeader,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

type StatusValue = 'NOT_MET' | 'IN_PROGRESS' | 'MET'

const STATUS_COLOR: Record<StatusValue, string> = {
  NOT_MET: P.danger,
  IN_PROGRESS: P.gold,
  MET: P.lime,
}

const STATUS_BG: Record<StatusValue, string> = {
  NOT_MET: 'rgba(248,113,113,0.12)',
  IN_PROGRESS: 'rgba(244,194,97,0.14)',
  MET: 'rgba(190,242,100,0.14)',
}

const STATUS_LABEL: Record<StatusValue, string> = {
  NOT_MET: 'Nog niet',
  IN_PROGRESS: 'Bijna',
  MET: 'Behaald',
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PatientRehabPage() {
  const { data: tracker, isLoading } = trpc.rehab.getMyTracker.useQuery()

  if (isLoading) {
    return (
      <DarkScreen>
        <DarkHeader title="Revalidatie" backHref="/patient/dashboard" />
        <div className="flex items-center justify-center py-16">
          <span
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}
          >
            LADEN…
          </span>
        </div>
      </DarkScreen>
    )
  }

  if (!tracker) {
    return (
      <DarkScreen>
        <DarkHeader title="Revalidatie" backHref="/patient/dashboard" />
        <div className="px-4 pt-6 pb-24">
          <Tile>
            <div className="flex flex-col gap-2 py-2">
              <MetaLabel>Geen actief protocol</MetaLabel>
              <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
                Je hebt op dit moment geen revalidatie-protocol toegewezen. Je therapeut
                kan dit voor je activeren wanneer dat van toepassing is.
              </p>
            </div>
          </Tile>
        </div>
      </DarkScreen>
    )
  }

  return (
    <DarkScreen>
      <DarkHeader title="Revalidatie" backHref="/patient/dashboard" />

      <div className="px-4 pt-4 pb-24 flex flex-col gap-4 max-w-lg mx-auto w-full">
        {/* Protocol header */}
        <div className="flex flex-col gap-1">
          <Kicker>Mijn protocol</Kicker>
          <Display size="md">{tracker.protocol.name.toUpperCase()}</Display>
          {tracker.protocol.description && (
            <p style={{ color: P.inkMuted, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
              {tracker.protocol.description}
            </p>
          )}
        </div>

        {/* Overall progress */}
        <Tile accentBar={P.lime}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <MetaLabel>Voortgang totaal</MetaLabel>
              <span
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 18, fontWeight: 900 }}
              >
                {tracker.progress.pct}%
              </span>
            </div>
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ background: P.surfaceHi, height: 6 }}
            >
              <div
                style={{
                  background: P.lime,
                  height: '100%',
                  width: `${tracker.progress.pct}%`,
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <StatLine color={P.lime} label="Behaald" value={tracker.progress.met} />
              <StatLine
                color={P.gold}
                label="Bijna"
                value={tracker.progress.inProgress}
              />
              <StatLine
                color={P.inkMuted}
                label="Totaal"
                value={tracker.progress.total}
              />
            </div>
            {tracker.surgeryDate && (
              <p
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.08em' }}
              >
                OPERATIEDATUM · {formatDate(tracker.surgeryDate)}
                {tracker.weeksSinceSurgery !== null && (
                  <span style={{ marginLeft: 8 }}>
                    · {tracker.weeksSinceSurgery} WEKEN GELEDEN
                  </span>
                )}
              </p>
            )}
          </div>
        </Tile>

        {/* Phases */}
        {tracker.phases.map((phase) => {
          const isCurrent = phase.order === tracker.expectedPhaseOrder
          return (
            <Tile
              key={phase.id}
              accentBar={isCurrent ? P.lime : P.inkDim}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
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
                        {phase.shortName ?? phase.name}
                      </h3>
                      {isCurrent && (
                        <span
                          className="athletic-mono"
                          style={{
                            background: P.lime + '20',
                            color: P.lime,
                            fontSize: 10,
                            letterSpacing: '0.1em',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontWeight: 800,
                          }}
                        >
                          NU
                        </span>
                      )}
                    </div>
                    {phase.shortName && phase.name && phase.shortName !== phase.name && (
                      <p style={{ color: P.inkMuted, fontSize: 12, marginTop: 2 }}>
                        {phase.name}
                      </p>
                    )}
                  </div>
                  <span
                    className="athletic-mono"
                    style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.08em' }}
                  >
                    {phase.progress.met}/{phase.progress.total}
                  </span>
                </div>

                {phase.keyGoals && (
                  <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
                    {phase.keyGoals}
                  </p>
                )}

                {/* Criteria list — read-only kleur dots */}
                <div className="flex flex-col gap-1.5">
                  {phase.criteria.length === 0 && (
                    <p style={{ color: P.inkDim, fontSize: 12, fontStyle: 'italic' }}>
                      Geen criteria voor deze fase.
                    </p>
                  )}
                  {phase.criteria.map((c) => {
                    const status = c.status as StatusValue
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2"
                        style={{
                          background: STATUS_BG[status],
                          borderLeft: `3px solid ${STATUS_COLOR[status]}`,
                        }}
                      >
                        <span
                          className="rounded-full shrink-0"
                          style={{
                            width: 10,
                            height: 10,
                            background: STATUS_COLOR[status],
                          }}
                          aria-label={STATUS_LABEL[status]}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            style={{
                              color: P.ink,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {c.name}
                            {c.isBonus && (
                              <span
                                style={{
                                  color: P.inkDim,
                                  fontSize: 10,
                                  marginLeft: 6,
                                  fontWeight: 500,
                                }}
                              >
                                (bonus)
                              </span>
                            )}
                          </p>
                          {c.targetValue && (
                            <p
                              className="athletic-mono"
                              style={{
                                color: P.inkMuted,
                                fontSize: 11,
                                letterSpacing: '0.04em',
                                marginTop: 1,
                              }}
                            >
                              Doel: {c.targetValue}
                              {c.targetUnit && ` ${c.targetUnit}`}
                            </p>
                          )}
                          {c.measurementValue !== null && c.measurementValue !== undefined && (
                            <p
                              className="athletic-mono"
                              style={{
                                color: STATUS_COLOR[status],
                                fontSize: 11,
                                letterSpacing: '0.04em',
                                marginTop: 1,
                                fontWeight: 700,
                              }}
                            >
                              Laatste meting: {c.measurementValue}
                              {c.targetUnit && ` ${c.targetUnit}`}
                              {c.measurementDate && (
                                <span style={{ color: P.inkMuted, fontWeight: 500, marginLeft: 6 }}>
                                  ({formatDate(c.measurementDate)})
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <span
                          className="athletic-mono shrink-0"
                          style={{
                            color: STATUS_COLOR[status],
                            fontSize: 10,
                            letterSpacing: '0.1em',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                          }}
                        >
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Tile>
          )
        })}

        <p
          className="athletic-mono"
          style={{
            color: P.inkDim,
            fontSize: 10,
            letterSpacing: '0.08em',
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          ALLEEN-LEZEN · ALLEEN JE THERAPEUT KAN STATUSSEN AANPASSEN
        </p>
      </div>
    </DarkScreen>
  )
}

function StatLine({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="rounded-full"
        style={{ width: 8, height: 8, background: color }}
      />
      <span
        className="athletic-mono"
        style={{
          color: P.inkMuted,
          fontSize: 11,
          letterSpacing: '0.08em',
        }}
      >
        {label.toUpperCase()} {value}
      </span>
    </div>
  )
}
