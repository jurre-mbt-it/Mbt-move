'use client'

import { trpc } from '@/lib/trpc/client'
import { MetaLabel, P, Tile } from '@/components/dark-ui'

type TimelineItem = {
  id: string
  signalType: string
  urgency: string
  title: string
  suggestion: string
  status: string
  createdAt: string | Date
  actions: Array<{
    id: string
    action: string
    note: string | null
    createdAt: string | Date
    therapistName: string
  }>
}

const URGENCY_COLOR: Record<string, string> = {
  CRITICAL: P.danger,
  HIGH: P.orange,
  MEDIUM: P.gold,
  LOW: P.ice,
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  FOLLOWED_UP: 'Opgevolgd',
  DISMISSED: 'Verborgen',
  SNOOZED: 'Uitgesteld',
  EXPIRED: 'Verlopen',
}

const ACTION_LABEL: Record<string, string> = {
  VIEWED: 'Bekeken',
  FOLLOWED_UP: 'Opgevolgd',
  DISMISSED: 'Verborgen',
  SNOOZED: 'Gesnoozed',
  REOPENED: 'Heropend',
}

export function InsightTimeline({ patientId }: { patientId: string }) {
  const { data: timeline = [], isLoading } = trpc.insights.getPatientTimeline.useQuery({ patientId })

  if (isLoading) {
    return (
      <p className="athletic-mono" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.12em' }}>
        LADEN…
      </p>
    )
  }

  if (timeline.length === 0) {
    return (
      <Tile>
        <p style={{ color: P.inkMuted, fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
          Nog geen signalen voor deze patiënt.
        </p>
      </Tile>
    )
  }

  return (
    <div className="space-y-3">
      <MetaLabel>Signalen-tijdlijn · {timeline.length}</MetaLabel>
      {(timeline as unknown as TimelineItem[]).map((i) => (
        <Tile key={i.id} accentBar={URGENCY_COLOR[i.urgency] ?? P.inkDim}>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="athletic-mono"
                style={{
                  color: URGENCY_COLOR[i.urgency] ?? P.inkDim,
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                }}
              >
                {i.urgency}
              </span>
              <span
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.08em' }}
              >
                {new Date(i.createdAt).toLocaleDateString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span
                className="athletic-mono"
                style={{
                  color: P.inkMuted,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  marginLeft: 'auto',
                }}
              >
                {STATUS_LABEL[i.status] ?? i.status}
              </span>
            </div>
            <p style={{ color: P.ink, fontSize: 14, fontWeight: 700 }}>{i.title}</p>
            <p style={{ color: P.inkMuted, fontSize: 12, lineHeight: 1.45 }}>{i.suggestion}</p>
            {i.actions.length > 0 && (
              <div
                className="space-y-1"
                style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${P.line}` }}
              >
                {i.actions.map((a) => (
                  <div
                    key={a.id}
                    className="athletic-mono flex items-center justify-between"
                    style={{ color: P.inkMuted, fontSize: 11 }}
                  >
                    <span>
                      <span style={{ color: P.ink }}>{ACTION_LABEL[a.action] ?? a.action}</span>
                      {' · '}
                      {a.therapistName}
                    </span>
                    <span style={{ color: P.inkDim }}>
                      {new Date(a.createdAt).toLocaleDateString('nl-NL', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tile>
      ))}
    </div>
  )
}
