'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { DarkButton, P, Tile } from '@/components/dark-ui'
import { toast } from 'sonner'

const URGENCY_CONFIG: Record<string, { bg: string; color: string; label: string; accent: string }> = {
  CRITICAL: { bg: 'rgba(248,113,113,0.18)', color: P.danger, label: 'Kritiek', accent: P.danger },
  HIGH: { bg: 'rgba(244,150,68,0.15)', color: P.orange, label: 'Hoog', accent: P.orange },
  MEDIUM: { bg: 'rgba(244,194,97,0.14)', color: P.gold, label: 'Middel', accent: P.gold },
  LOW: { bg: 'rgba(147,197,253,0.15)', color: P.ice, label: 'Laag', accent: P.ice },
}

const SIGNAL_LABEL: Record<string, string> = {
  pain_flare: 'Pijn-opflakkering',
  pain_red_flag: 'Kritiek pijnsignaal',
  ready_for_progression: 'Klaar voor progressie',
  plateau: 'Plateau',
  adherence_drop: 'Adherence-dip',
  exercise_specific_pain: 'Oefening-pijn',
}

export interface InsightCardData {
  id: string
  patientId: string
  patientName: string
  signalType: string
  urgency: string
  title: string
  suggestion: string
  exerciseName: string | null
  createdAt: Date | string
}

export function InsightCard({ insight, onChange }: { insight: InsightCardData; onChange?: () => void }) {
  const config = URGENCY_CONFIG[insight.urgency] ?? URGENCY_CONFIG.MEDIUM
  const [busy, setBusy] = useState(false)

  const actMutation = trpc.insights.act.useMutation({
    onSuccess: () => {
      onChange?.()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  async function doAction(action: 'FOLLOWED_UP' | 'DISMISSED' | 'SNOOZED', snoozeDays?: number) {
    setBusy(true)
    try {
      await actMutation.mutateAsync({ insightId: insight.id, action, snoozeDays })
      if (action === 'FOLLOWED_UP') toast.success('Opgevolgd — genoteerd.')
      if (action === 'DISMISSED') toast.success('Verborgen.')
      if (action === 'SNOOZED') toast.success('Verstopt voor 7 dagen.')
    } finally {
      setBusy(false)
    }
  }

  const dateStr = new Date(insight.createdAt).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <Tile accentBar={config.accent}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="athletic-mono"
              style={{
                background: config.bg,
                color: config.color,
                fontSize: 10,
                padding: '3px 9px',
                borderRadius: 999,
                fontWeight: 900,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {config.label}
            </span>
            <span className="athletic-mono" style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {SIGNAL_LABEL[insight.signalType] ?? insight.signalType}
            </span>
            <span className="athletic-mono" style={{ color: P.inkDim, fontSize: 10, letterSpacing: '0.08em' }}>
              {dateStr}
            </span>
          </div>
        </div>
        <div>
          <p style={{ color: P.ink, fontSize: 15, fontWeight: 800, lineHeight: 1.35 }}>
            {insight.title}
          </p>
          <p className="mt-1" style={{ color: P.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
            {insight.suggestion}
          </p>
          {insight.exerciseName && (
            <p className="athletic-mono mt-2" style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.06em' }}>
              Oefening: <span style={{ color: P.ink }}>{insight.exerciseName}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1" style={{ borderTop: `1px solid ${P.line}`, paddingTop: 10 }}>
          <DarkButton
            variant="secondary"
            size="sm"
            href={`/therapist/patients/${insight.patientId}`}
          >
            Patiënt openen
          </DarkButton>
          <DarkButton
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => doAction('FOLLOWED_UP')}
          >
            ✓ Opvolgen
          </DarkButton>
          <DarkButton
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => doAction('SNOOZED', 7)}
          >
            Snooze 7d
          </DarkButton>
          <DarkButton
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => doAction('DISMISSED')}
          >
            Verberg
          </DarkButton>
        </div>
      </div>
    </Tile>
  )
}
