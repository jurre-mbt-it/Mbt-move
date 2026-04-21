'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import { IconStop, IconWarning, IconCheck } from '@/components/icons'
import { toast } from 'sonner'

const MBT_GREEN = '#BEF264'
const MBT_DARK = '#1C2425'

// ─── Silbernagel pain color (tendinopathie: ≤5 groen, 5-7 geel, >7 rood) ──────
function silbernagelColor(pain: number): string {
  if (pain <= 5) return MBT_GREEN
  if (pain <= 7) return '#f97316'
  return '#ef4444'
}

function silbernagelLabel(pain: number): string {
  if (pain <= 5) return 'OK'
  if (pain <= 7) return 'Let op'
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
        const color = isTendinopathy ? silbernagelColor(i) : (i < 3 ? MBT_GREEN : i <= 5 ? '#f97316' : '#ef4444')
        return (
          <button
            key={i}
            onClick={() => onChange(selected ? null : i)}
            className="flex-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{
              height: 40,
              background: selected ? color : '#1C2425',
              color: selected ? 'white' : '#7B8889',
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
      <Card style={{ borderRadius: '14px', background: 'rgba(190,242,100,0.10)', border: '1.5px solid #BEF26433' }}>
        <CardContent className="px-4 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5" style={{ color: MBT_GREEN }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#BEF264' }}>{item.exerciseName}</p>
            <p className="text-xs text-muted-foreground">
              24u pijn: {pain24h ?? '—'}/10 · Stijfheid: {stiffness ?? '—'}/10
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card style={{ borderRadius: '14px' }}>
      <CardContent className="px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-sm">{item.exerciseName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sessie {new Date(item.sessionDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} · {item.hoursAgo}u geleden
            </p>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: `${silbernagelColor(item.painDuringSession)}22`, color: silbernagelColor(item.painDuringSession) }}
          >
            Tijdens: {item.painDuringSession}/10
          </div>
        </div>

        {/* 24h pain */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Pijn 24u na oefening</p>
            {pain24h !== null && (
              <span className="text-xs font-bold" style={{ color: silbernagelColor(pain24h) }}>
                {pain24h}/10 — {silbernagelLabel(pain24h)}
              </span>
            )}
          </div>
          <NrsPicker value={pain24h} onChange={setPain24h} />
          {pain24h !== null && pain24h > 5 && (
            <div
              className="mt-2 rounded-xl px-3 py-2 text-xs font-medium"
              style={{
                background: pain24h > 7 ? 'rgba(248,113,113,0.10)' : '#fffbeb',
                color: pain24h > 7 ? '#F87171' : '#c2410c',
              }}
            >
              {pain24h > 7
                ? <span className="inline-flex items-center gap-1"><IconStop size={14} /> Pijn te hoog — bespreek met je therapeut voor de volgende sessie.</span>
                : <span className="inline-flex items-center gap-1"><IconWarning size={14} /> Verhoogde pijn na sessie. Monitor het verloop.</span>}
            </div>
          )}
        </div>

        {/* Morning stiffness */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Ochtend stijfheid</p>
            {stiffness !== null && (
              <span className="text-xs font-bold text-muted-foreground">
                {stiffness}/10
              </span>
            )}
          </div>
          <NrsPicker value={stiffness} onChange={setStiffness} isTendinopathy={false} />
        </div>

        <Button
          onClick={handleSave}
          className="w-full font-semibold"
          style={{ height: 44, background: MBT_GREEN }}
          disabled={pain24h === null && stiffness === null}
        >
          Opslaan
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FollowUpPage() {
  const [items, setItems] = useState<FollowUpItem[]>(MOCK_PENDING)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  const handleSave = (id: string, painAfter24h: number | null, morningStiffness: number | null) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, painAfter24h, morningStiffness } : item
    ))
    setSavedIds(prev => new Set(prev).add(id))
  }

  const allDone = items.length > 0 && items.every(item => savedIds.has(item.id))

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0A0E0F' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-5" style={{ background: MBT_DARK }}>
        <Link href="/patient/progress" className="inline-flex items-center gap-1.5 text-[#7B8889] text-sm mb-3 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Terug
        </Link>
        <h1 className="text-white text-xl font-bold">24u Follow-up</h1>
        <p className="text-[#7B8889] text-xs mt-0.5">Hoe voelen je pezen vandaag?</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Info banner */}
        <div
          className="flex items-start gap-3 rounded-2xl px-4 py-3 text-xs"
          style={{ background: 'rgba(190,242,100,0.10)', border: '1.5px solid #BEF26433' }}
        >
          <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: MBT_GREEN }} />
          <div style={{ color: '#BEF264' }}>
            <p className="font-semibold mb-0.5">Silbernagel protocol</p>
            <p>
              Voor tendinopathie volgen we pijn <strong>tijdens</strong> de oefening, <strong>24u erna</strong> en{' '}
              <strong>ochtend stijfheid</strong>. Dit helpt bepalen of de belasting juist is.
            </p>
          </div>
        </div>

        {/* Pending items */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div><IconCheck size={40} /></div>
            <p className="font-semibold">Geen follow-ups</p>
            <p className="text-sm text-muted-foreground">Je hebt geen openstaande 24u checks.</p>
          </div>
        ) : allDone ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <CheckCircle2 className="w-12 h-12" style={{ color: MBT_GREEN }} />
            <p className="font-semibold">Alles ingevuld!</p>
            <p className="text-sm text-muted-foreground">Je therapeut kan nu je voortgang monitoren.</p>
            <Link href="/patient/progress">
              <Button variant="outline" className="mt-2">Naar voortgang</Button>
            </Link>
          </div>
        ) : (
          items.map(item => (
            <FollowUpCard key={item.id} item={item} onSave={handleSave} />
          ))
        )}

        {/* Legend */}
        <Card style={{ borderRadius: '14px', background: '#fafafa' }}>
          <CardContent className="px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Silbernagel grenzen (pijn tijdens/na)</p>
            <div className="space-y-1">
              {[
                { label: '0–5', desc: 'Groen — belasting OK', color: MBT_GREEN },
                { label: '5–7', desc: 'Geel — let op, monitor', color: '#f97316' },
                { label: '> 7', desc: 'Rood — stop, bespreek met therapeut', color: '#ef4444' },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="font-semibold w-8">{r.label}</span>
                  <span className="text-muted-foreground">{r.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
