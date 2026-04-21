/**
 * Daily wellness check — 5 items × 1-5 schaal.
 * Zelfde UX als mbt-gym/app/wellness.tsx (Jeffries 2023 / Ahmun 2019 items).
 */
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  DarkButton,
  DarkHeader,
  DarkScreen,
  DarkTextarea,
  Kicker,
  MetaLabel,
  P,
} from '@/components/dark-ui'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'

type Item = {
  key: 'sleep' | 'soreness' | 'fatigue' | 'mood' | 'stress'
  label: string
  lowLabel: string
  highLabel: string
  emoji: string
}

const ITEMS: Item[] = [
  { key: 'sleep', label: 'SLAAP', lowLabel: 'slecht', highLabel: 'uitgerust', emoji: '🌙' },
  { key: 'soreness', label: 'SPIERPIJN', lowLabel: 'veel pijn', highLabel: 'geen pijn', emoji: '💪' },
  { key: 'fatigue', label: 'VERMOEIDHEID', lowLabel: 'uitgeput', highLabel: 'fris', emoji: '⚡' },
  { key: 'mood', label: 'STEMMING', lowLabel: 'slecht', highLabel: 'top', emoji: '☀️' },
  { key: 'stress', label: 'STRESS', lowLabel: 'gespannen', highLabel: 'rustig', emoji: '🧘' },
]

export default function WellnessPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: existing, isLoading } = trpc.wellness.today.useQuery()

  const [sleep, setSleep] = React.useState(3)
  const [soreness, setSoreness] = React.useState(3)
  const [fatigue, setFatigue] = React.useState(3)
  const [mood, setMood] = React.useState(3)
  const [stress, setStress] = React.useState(3)
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (existing) {
      setSleep(existing.sleep)
      setSoreness(existing.soreness)
      setFatigue(existing.fatigue)
      setMood(existing.mood)
      setStress(existing.stress)
      setNotes(existing.notes ?? '')
    }
  }, [existing])

  const submitMutation = trpc.wellness.submit.useMutation({
    onSuccess: () => {
      utils.wellness.today.invalidate()
      utils.wellness.history.invalidate()
      toast.success(existing ? 'Wellness-check bijgewerkt' : 'Opgeslagen — tot morgen!')
      router.push('/patient/dashboard')
    },
    onError: (e) => toast.error(`Opslaan mislukt: ${e.message}`),
  })

  const values = { sleep, soreness, fatigue, mood, stress }
  const total = Object.values(values).reduce((a, b) => a + b, 0)
  const rawPct = Math.round(((total - 5) / 20) * 100)
  const statusColor = total >= 18 ? P.lime : total >= 13 ? P.gold : P.danger
  const statusLabel = total >= 18 ? 'READY' : total >= 13 ? 'MATIG' : 'LAGE READINESS'

  const setters = { sleep: setSleep, soreness: setSoreness, fatigue: setFatigue, mood: setMood, stress: setStress } as const

  if (isLoading) {
    return (
      <DarkScreen>
        <DarkHeader backHref="/patient/dashboard" />
        <div className="flex-1 flex items-center justify-center">
          <span className="athletic-mono text-[11px]" style={{ color: P.inkMuted }}>
            LADEN…
          </span>
        </div>
      </DarkScreen>
    )
  }

  return (
    <DarkScreen>
      <DarkHeader
        backHref="/patient/dashboard"
        right={
          existing ? (
            <span
              className="athletic-mono inline-flex items-center gap-1 px-2 py-1 rounded text-[9px]"
              style={{ color: P.lime, border: `1px solid ${P.lime}`, backgroundColor: P.surface }}
            >
              ✓ VANDAAG INGEVULD
            </span>
          ) : null
        }
      />

      <div className="max-w-lg w-full mx-auto px-4 py-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Kicker>Dagelijkse check</Kicker>
          <h1
            className="athletic-display"
            style={{ fontSize: 40, lineHeight: '44px', letterSpacing: '-0.035em', paddingTop: 4 }}
          >
            HOE VOEL
            <br />
            JE JE?
          </h1>
          <p style={{ color: P.inkMuted, fontSize: 13, lineHeight: '19px', marginTop: 4 }}>
            5 vragen. Vul elke ochtend in — helpt je training-load afstemmen op je lichaam.
          </p>
        </div>

        {/* Live score preview */}
        <div
          className="rounded-xl flex items-center gap-3 p-3"
          style={{ backgroundColor: P.surface, borderLeft: `3px solid ${statusColor}` }}
        >
          <div className="flex-1">
            <MetaLabel>Readiness · vandaag</MetaLabel>
            <div
              className="athletic-mono mt-0.5"
              style={{
                color: statusColor,
                fontSize: 32,
                lineHeight: '38px',
                letterSpacing: '-0.03em',
                paddingTop: 2,
                fontWeight: 900,
              }}
            >
              {total}/25
            </div>
            <div
              className="athletic-mono"
              style={{ color: statusColor, fontSize: 11, letterSpacing: '0.14em', fontWeight: 900, marginTop: 2 }}
            >
              {statusLabel}
            </div>
          </div>
          <div
            className="athletic-mono"
            style={{
              color: P.ink,
              fontSize: 28,
              lineHeight: '32px',
              letterSpacing: '-0.025em',
              paddingTop: 2,
              fontWeight: 900,
            }}
          >
            {rawPct}%
          </div>
        </div>

        {/* 5 items */}
        <div className="flex flex-col gap-3">
          {ITEMS.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              value={values[item.key]}
              onChange={setters[item.key]}
            />
          ))}
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <MetaLabel>Notitie · optioneel</MetaLabel>
          <DarkTextarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Bv. stijve kuit, slecht geslapen, stressvolle dag..."
            rows={3}
          />
        </div>

        <DarkButton
          size="lg"
          onClick={() =>
            submitMutation.mutate({
              sleep,
              soreness,
              fatigue,
              mood,
              stress,
              notes: notes.trim() || undefined,
            })
          }
          loading={submitMutation.isPending}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending ? 'OPSLAAN…' : existing ? 'BIJWERKEN' : 'OPSLAAN'}
        </DarkButton>
      </div>
    </DarkScreen>
  )
}

function ItemRow({
  item,
  value,
  onChange,
}: {
  item: Item
  value: number
  onChange: (v: number) => void
}) {
  const color = value >= 4 ? P.lime : value >= 3 ? P.gold : P.danger

  return (
    <div className="rounded-xl flex flex-col gap-3 p-3" style={{ backgroundColor: P.surface }}>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[18px]"
          style={{ backgroundColor: P.surfaceHi, border: `1px solid ${color}` }}
          aria-hidden
        >
          {item.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="athletic-mono"
            style={{ color: P.ink, fontSize: 13, fontWeight: 900, letterSpacing: '0.1em' }}
          >
            {item.label}
          </div>
          <div
            className="athletic-mono"
            style={{
              color: P.inkDim,
              fontSize: 11,
              letterSpacing: '0.04em',
              marginTop: 2,
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            {item.lowLabel} · {item.highLabel}
          </div>
        </div>
        <div
          className="athletic-mono"
          style={{
            color,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.025em',
            minWidth: 32,
            textAlign: 'center',
          }}
        >
          {value}
        </div>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n === value
          const below = n <= value
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                'athletic-tap flex-1 h-11 rounded-lg flex items-center justify-center athletic-mono',
              )}
              style={{
                backgroundColor: below ? color : P.surface,
                border: active
                  ? `2px solid ${P.ink}`
                  : below
                    ? `1px solid ${color}`
                    : `1px solid ${P.lineStrong}`,
                color: below ? P.bg : P.inkMuted,
                fontSize: 14,
                fontWeight: 900,
              }}
              aria-label={`${item.label} ${n}/5`}
              aria-pressed={active}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}
