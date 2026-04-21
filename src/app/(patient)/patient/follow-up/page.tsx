'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  DarkButton,
  DarkHeader,
  DarkScreen,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

// ─── Silbernagel pain color (tendinopathie: ≤5 groen, 5-7 geel, >7 rood) ──────
function silbernagelColor(pain: number): string {
  if (pain <= 5) return P.lime
  if (pain <= 7) return P.gold
  return P.danger
}

function silbernagelLabel(pain: number): string {
  if (pain <= 5) return 'OK'
  if (pain <= 7) return 'LET OP'
  return 'STOP'
}

// ─── Mock pending follow-up checks ────────────────────────────────────────────
type FollowUpItem = {
  id: string
  exerciseName: string
  sessionDate: string
  hoursAgo: number
  painDuringSession: number
  painAfter24h: number | null
  morningStiffness: number | null
}

const MOCK_PENDING: FollowUpItem[] = [
  {
    id: 'fu-1',
    exerciseName: 'Bulgarian Split Squat',
    sessionDate: '2026-04-09',
    hoursAgo: 18,
    painDuringSession: 3,
    painAfter24h: null,
    morningStiffness: null,
  },
  {
    id: 'fu-2',
    exerciseName: 'Single Leg Deadlift',
    sessionDate: '2026-04-09',
    hoursAgo: 18,
    painDuringSession: 4,
    painAfter24h: null,
    morningStiffness: null,
  },
]

// ─── NRS Picker ───────────────────────────────────────────────────────────────
function NrsPicker({
  value,
  onChange,
  isTendinopathy = true,
}: {
  value: number | null
  onChange: (v: number | null) => void
  isTendinopathy?: boolean
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 11 }, (_, i) => {
        const selected = value === i
        const color = isTendinopathy
          ? silbernagelColor(i)
          : i < 3
            ? P.lime
            : i <= 5
              ? P.gold
              : P.danger
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(selected ? null : i)}
            className="athletic-tap athletic-mono flex-1 rounded-lg text-xs transition-all"
            style={{
              height: 40,
              backgroundColor: selected ? color : P.surfaceHi,
              color: selected ? P.bg : P.inkMuted,
              fontWeight: 900,
              border: selected ? 'none' : `1px solid ${P.lineStrong}`,
            }}
          >
            {i}
          </button>
        )
      })}
    </div>
  )
}

// ─── Follow-up Card ───────────────────────────────────────────────────────────
function FollowUpCard({
  item,
  onSave,
}: {
  item: FollowUpItem
  onSave: (id: string, painAfter24h: number | null, morningStiffness: number | null) => void
}) {
  const [pain24h, setPain24h] = useState<number | null>(item.painAfter24h)
  const [stiffness, setStiffness] = useState<number | null>(item.morningStiffness)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave(item.id, pain24h, stiffness)
    setSaved(true)
    toast.success(`${item.exerciseName} follow-up opgeslagen`)
  }

  if (saved) {
    return (
      <Tile accentBar={P.lime}>
        <div className="flex items-center gap-3">
          <span
            className="athletic-mono"
            style={{ color: P.lime, fontSize: 20, fontWeight: 900 }}
            aria-hidden
          >
            ✓
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="athletic-mono"
              style={{
                color: P.lime,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {item.exerciseName}
            </p>
            <p
              className="athletic-mono"
              style={{ color: P.inkMuted, fontSize: 11, marginTop: 2 }}
            >
              24u pijn: {pain24h ?? '—'}/10 · Stijfheid: {stiffness ?? '—'}/10
            </p>
          </div>
        </div>
      </Tile>
    )
  }

  const duringColor = silbernagelColor(item.painDuringSession)

  return (
    <Tile>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}
              className="truncate"
            >
              {item.exerciseName}
            </p>
            <p
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 11,
                marginTop: 2,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              Sessie{' '}
              {new Date(item.sessionDate).toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'long',
              })}{' '}
              · {item.hoursAgo}u geleden
            </p>
          </div>
          <span
            className="athletic-mono px-2 py-1 rounded-full shrink-0"
            style={{
              backgroundColor: P.surfaceHi,
              color: duringColor,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.1em',
              border: `1px solid ${duringColor}`,
            }}
          >
            TIJDENS {item.painDuringSession}/10
          </span>
        </div>

        {/* 24h pain */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <MetaLabel>Pijn 24u na oefening</MetaLabel>
            {pain24h !== null && (
              <span
                className="athletic-mono"
                style={{ color: silbernagelColor(pain24h), fontSize: 11, fontWeight: 900 }}
              >
                {pain24h}/10 — {silbernagelLabel(pain24h)}
              </span>
            )}
          </div>
          <NrsPicker value={pain24h} onChange={setPain24h} />
          {pain24h !== null && pain24h > 5 && (
            <div
              className="mt-2 rounded-xl px-3 py-2"
              style={{
                backgroundColor: P.surfaceHi,
                borderLeft: `3px solid ${pain24h > 7 ? P.danger : P.gold}`,
              }}
            >
              <p
                className="athletic-mono"
                style={{
                  color: pain24h > 7 ? P.danger : P.gold,
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: '16px',
                }}
              >
                {pain24h > 7
                  ? 'STOP · Pijn te hoog — bespreek met je therapeut voor de volgende sessie.'
                  : 'LET OP · Verhoogde pijn na sessie. Monitor het verloop.'}
              </p>
            </div>
          )}
        </div>

        {/* Morning stiffness */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <MetaLabel>Ochtend stijfheid</MetaLabel>
            {stiffness !== null && (
              <span
                className="athletic-mono"
                style={{ color: P.inkMuted, fontSize: 11, fontWeight: 900 }}
              >
                {stiffness}/10
              </span>
            )}
          </div>
          <NrsPicker value={stiffness} onChange={setStiffness} isTendinopathy={false} />
        </div>

        <DarkButton
          onClick={handleSave}
          disabled={pain24h === null && stiffness === null}
        >
          OPSLAAN
        </DarkButton>
      </div>
    </Tile>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FollowUpPage() {
  const [items, setItems] = useState<FollowUpItem[]>(MOCK_PENDING)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  const handleSave = (
    id: string,
    painAfter24h: number | null,
    morningStiffness: number | null,
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, painAfter24h, morningStiffness } : item,
      ),
    )
    setSavedIds((prev) => new Set(prev).add(id))
  }

  const allDone = items.length > 0 && items.every((item) => savedIds.has(item.id))

  return (
    <DarkScreen>
      <DarkHeader title="Follow-up" backHref="/patient/progress" />

      <div className="max-w-lg w-full mx-auto px-4 pt-4 pb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Kicker>24u check</Kicker>
          <Display size="md">
            HOE VOELEN
            <br />
            JE PEZEN?
          </Display>
        </div>

        {/* Info banner */}
        <Tile accentBar={P.lime}>
          <div className="flex flex-col gap-1">
            <MetaLabel style={{ color: P.lime }}>Silbernagel protocol</MetaLabel>
            <p style={{ color: P.ink, fontSize: 12, lineHeight: '17px' }}>
              Voor tendinopathie volgen we pijn <strong>tijdens</strong> de oefening,{' '}
              <strong>24u erna</strong> en <strong>ochtend stijfheid</strong>. Dit helpt bepalen of
              de belasting juist is.
            </p>
          </div>
        </Tile>

        {/* Pending items */}
        {items.length === 0 ? (
          <Tile>
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <span className="athletic-mono" style={{ color: P.lime, fontSize: 32, fontWeight: 900 }}>
                ✓
              </span>
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>GEEN FOLLOW-UPS</p>
              <p style={{ color: P.inkMuted, fontSize: 12 }}>
                Je hebt geen openstaande 24u checks.
              </p>
            </div>
          </Tile>
        ) : allDone ? (
          <Tile accentBar={P.lime}>
            <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
              <span
                className="athletic-mono"
                style={{ color: P.lime, fontSize: 40, fontWeight: 900 }}
              >
                ✓
              </span>
              <p style={{ color: P.ink, fontSize: 14, fontWeight: 800 }}>ALLES INGEVULD</p>
              <p style={{ color: P.inkMuted, fontSize: 12 }}>
                Je therapeut kan nu je voortgang monitoren.
              </p>
              <DarkButton variant="secondary" href="/patient/progress">
                NAAR VOORTGANG
              </DarkButton>
            </div>
          </Tile>
        ) : (
          items.map((item) => (
            <FollowUpCard key={item.id} item={item} onSave={handleSave} />
          ))
        )}

        {/* Legend */}
        <Tile>
          <div className="flex flex-col gap-2">
            <MetaLabel>Silbernagel grenzen</MetaLabel>
            <div className="flex flex-col gap-1.5">
              {[
                { label: '0–5', desc: 'Belasting OK', color: P.lime },
                { label: '5–7', desc: 'Let op, monitor', color: P.gold },
                { label: '> 7', desc: 'Stop, bespreek met therapeut', color: P.danger },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span
                    className="athletic-mono"
                    style={{
                      color: r.color,
                      fontSize: 11,
                      fontWeight: 900,
                      width: 48,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {r.label}
                  </span>
                  <span style={{ color: P.inkMuted, fontSize: 12 }}>{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </Tile>
      </div>
    </DarkScreen>
  )
}
