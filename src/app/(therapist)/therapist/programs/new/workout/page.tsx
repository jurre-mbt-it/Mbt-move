'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, HR_ZONES,
  CARDIO_TEMPLATES, CardioActivityKey, CardioProtocolKey, HRZone, CardioInterval,
} from '@/lib/cardio-constants'
import { trpc } from '@/lib/trpc/client'
import { CARDIO_ICON_MAP } from '@/components/icons'
import {
  CATEGORY_COLORS,
  DarkButton,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  P,
  Tile,
} from '@/components/dark-ui'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardioFormState {
  name: string
  description: string
  patientId: string
  activity: CardioActivityKey
  protocol: CardioProtocolKey
  weeks: number
  sessionsPerWeek: number
  targetDurationMin: number
  targetDistanceKm: string
  targetZone: HRZone | null
  targetRpe: number | null
  intervals: CardioInterval[]
}

const DEFAULT_STATE: CardioFormState = {
  name: '',
  description: '',
  patientId: '',
  activity: 'RUNNING',
  protocol: 'ZONE_TRAINING',
  weeks: 6,
  sessionsPerWeek: 3,
  targetDurationMin: 30,
  targetDistanceKm: '',
  targetZone: 2,
  targetRpe: null,
  intervals: [],
}

function zoneColor(zone: HRZone): string {
  return CATEGORY_COLORS[`Z${zone}` as 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5']
}

// ── Visual interval editor ────────────────────────────────────────────────────
// TrainingPeaks-style: horizontale tijdlijn waar elk blok een interval is,
// breedte proportioneel aan duur. Klik om te bewerken, ✕ om te verwijderen.

const fmtDuration = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

function WorkoutTimeline({ intervals }: { intervals: CardioInterval[] }) {
  // Bereken totale tijd over alle blokken (×repetitions).
  const total = intervals.reduce(
    (sum, iv) =>
      sum + iv.repetitions * (iv.workDuration + iv.restDuration),
    0,
  )
  if (total === 0) {
    return (
      <div
        className="athletic-mono w-full rounded-lg flex items-center justify-center"
        style={{
          background: P.surfaceHi,
          height: 56,
          color: P.inkDim,
          fontSize: 11,
          letterSpacing: '0.12em',
        }}
      >
        TIJDLIJN VERSCHIJNT ZODRA JE EEN BLOK TOEVOEGT
      </div>
    )
  }

  // Bouw flat-segments: voor elk blok rep × (work + rest).
  type Seg = { kind: 'work' | 'rest'; sec: number; label: string; group: number }
  const segments: Seg[] = []
  intervals.forEach((iv, idx) => {
    const reps = Math.max(1, iv.repetitions)
    for (let r = 0; r < reps; r++) {
      segments.push({
        kind: 'work',
        sec: iv.workDuration,
        label: iv.label ?? `Blok ${idx + 1}`,
        group: idx,
      })
      if (iv.restDuration > 0) {
        segments.push({ kind: 'rest', sec: iv.restDuration, label: 'Rust', group: idx })
      }
    }
  })

  return (
    <div className="space-y-1.5">
      <div
        className="w-full overflow-hidden rounded-lg flex"
        style={{ height: 56, background: P.surfaceLow, border: `1px solid ${P.line}` }}
      >
        {segments.map((seg, i) => {
          const widthPct = (seg.sec / total) * 100
          const bg =
            seg.kind === 'work'
              ? `linear-gradient(180deg, ${P.lime} 0%, ${P.lime}cc 100%)`
              : P.surfaceHi
          return (
            <div
              key={i}
              className="flex items-center justify-center overflow-hidden"
              style={{
                width: `${widthPct}%`,
                background: bg,
                borderRight:
                  i < segments.length - 1 ? `1px solid ${P.bg}` : 'none',
                color: seg.kind === 'work' ? P.bg : P.inkMuted,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '0.04em',
              }}
              title={`${seg.label} · ${fmtDuration(seg.sec)}`}
            >
              {widthPct > 5 && (
                <span className="athletic-mono truncate px-1">
                  {seg.kind === 'work' ? fmtDuration(seg.sec) : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <span
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}
        >
          0:00
        </span>
        <span
          className="athletic-mono"
          style={{ color: P.lime, fontSize: 11, letterSpacing: '0.08em', fontWeight: 900 }}
        >
          TOTAAL · {fmtDuration(total)}
        </span>
        <span
          className="athletic-mono"
          style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.12em' }}
        >
          {fmtDuration(total)}
        </span>
      </div>
    </div>
  )
}

function IntervalBlock({
  iv,
  index,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  iv: CardioInterval
  index: number
  expanded: boolean
  onToggle: () => void
  onUpdate: (key: keyof CardioInterval, val: string | number) => void
  onRemove: () => void
}) {
  const blockTotal = iv.repetitions * (iv.workDuration + iv.restDuration)
  const workPct =
    iv.workDuration + iv.restDuration > 0
      ? (iv.workDuration / (iv.workDuration + iv.restDuration)) * 100
      : 100

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: P.surface,
        border: `1px solid ${expanded ? P.lime : P.line}`,
      }}
    >
      {/* Header — altijd zichtbaar */}
      <button
        type="button"
        onClick={onToggle}
        className="athletic-tap w-full flex items-center gap-3 p-3 text-left"
      >
        <span
          className="athletic-mono inline-flex items-center justify-center rounded-lg shrink-0"
          style={{
            background: P.lime,
            color: P.bg,
            width: 32,
            height: 32,
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p
            className="truncate"
            style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}
          >
            {iv.label || `Blok ${index + 1}`}
          </p>
          <p
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.06em' }}
          >
            {iv.repetitions}× ({fmtDuration(iv.workDuration)} werk +{' '}
            {fmtDuration(iv.restDuration)} rust) · {fmtDuration(blockTotal)} totaal
          </p>
        </div>
        <span
          className="athletic-mono shrink-0"
          style={{
            color: P.inkMuted,
            fontSize: 10,
            letterSpacing: '0.12em',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.15s',
          }}
        >
          ▾
        </span>
      </button>

      {/* Mini-tijdlijn van één rep */}
      <div
        className="mx-3 mb-3 flex overflow-hidden rounded"
        style={{ height: 6, background: P.surfaceLow }}
      >
        <div style={{ width: `${workPct}%`, background: P.lime }} />
        <div style={{ width: `${100 - workPct}%`, background: P.surfaceHi }} />
      </div>

      {/* Edit panel — uitklappen */}
      {expanded && (
        <div
          className="px-3 pb-3 space-y-3"
          style={{ borderTop: `1px solid ${P.line}` }}
        >
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="space-y-1">
              <MetaLabel>Werk (sec)</MetaLabel>
              <DarkInput
                type="number"
                min={10}
                value={iv.workDuration}
                onChange={(e) => onUpdate('workDuration', +e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <MetaLabel>Rust (sec)</MetaLabel>
              <DarkInput
                type="number"
                min={0}
                value={iv.restDuration}
                onChange={(e) => onUpdate('restDuration', +e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <MetaLabel>Herhalingen</MetaLabel>
              <DarkInput
                type="number"
                min={1}
                max={50}
                value={iv.repetitions}
                onChange={(e) => onUpdate('repetitions', +e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <MetaLabel>Label</MetaLabel>
              <DarkInput
                value={iv.label ?? ''}
                placeholder="Bijv. Sprint"
                onChange={(e) => onUpdate('label', e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={onRemove}
            className="athletic-tap w-full text-center py-2 rounded-lg athletic-mono"
            style={{
              color: P.danger,
              background: 'rgba(248,113,113,0.06)',
              border: `1px solid ${P.danger}33`,
              fontSize: 11,
              letterSpacing: '0.12em',
              fontWeight: 800,
            }}
          >
            ✕  BLOK VERWIJDEREN
          </button>
        </div>
      )}
    </div>
  )
}

function IntervalEditor({
  intervals,
  onChange,
}: {
  intervals: CardioInterval[]
  onChange: (v: CardioInterval[]) => void
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const addInterval = () => {
    onChange([
      ...intervals,
      { workDuration: 120, restDuration: 60, repetitions: 4, label: 'Blok' },
    ])
    setExpandedIdx(intervals.length) // open het nieuwe blok direct
  }

  const update = (i: number, key: keyof CardioInterval, val: string | number) => {
    const next = intervals.map((iv, idx) =>
      idx === i ? { ...iv, [key]: val } : iv,
    )
    onChange(next)
  }

  const remove = (i: number) => {
    onChange(intervals.filter((_, idx) => idx !== i))
    if (expandedIdx === i) setExpandedIdx(null)
  }

  return (
    <div className="space-y-4">
      <WorkoutTimeline intervals={intervals} />

      <div className="space-y-2">
        {intervals.map((iv, i) => (
          <IntervalBlock
            key={i}
            iv={iv}
            index={i}
            expanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            onUpdate={(k, v) => update(i, k, v)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>

      <DarkButton variant="secondary" size="sm" onClick={addInterval} className="w-full">
        + Blok toevoegen
      </DarkButton>
    </div>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

function WorkoutBuilderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prePatientId = searchParams.get('patientId') ?? ''

  const { data: patientsData = [] } = trpc.patients.list.useQuery()
  const [form, setForm] = useState<CardioFormState>({ ...DEFAULT_STATE, patientId: prePatientId })
  const [step, setStep] = useState<1 | 2>(1)
  const utils = trpc.useUtils()
  const createProgram = trpc.programs.create.useMutation()
  const saving = createProgram.isPending

  const set = <K extends keyof CardioFormState>(key: K, val: CardioFormState[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  const protocolInfo = CARDIO_PROTOCOLS[form.protocol]
  const activityInfo = CARDIO_ACTIVITIES[form.activity]

  const applyTemplate = (tpl: typeof CARDIO_TEMPLATES[0]) => {
    setForm(f => ({
      ...f,
      name: f.name || tpl.name,
      description: f.description || tpl.description,
      activity: tpl.activity,
      protocol: tpl.protocol,
      targetDurationMin: tpl.targetDurationMin,
      targetDistanceKm: tpl.targetDistanceKm?.toString() ?? '',
      targetZone: tpl.targetZone ?? null,
      targetRpe: tpl.targetRpe ?? null,
      intervals: tpl.intervals ?? [],
    }))
    toast.success(`Template "${tpl.name}" geladen`)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Geef het programma een naam')
      return
    }
    try {
      const created = await createProgram.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        patientId: form.patientId || null,
        weeks: form.weeks,
        daysPerWeek: form.sessionsPerWeek,
        type: 'CARDIO',
        cardioParams: {
          activity: form.activity,
          protocol: form.protocol,
          targetDurationMin: form.targetDurationMin,
          targetDistanceKm: form.targetDistanceKm
            ? Number(form.targetDistanceKm)
            : null,
          targetZone: form.targetZone,
          targetRpe: form.targetRpe,
          intervals: form.intervals,
        },
      })
      await utils.programs.list.invalidate()
      toast.success('Workout opgeslagen!')
      router.push(`/therapist/programs/${created.id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-16 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/therapist/programs"
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
          >
            ← TERUG
          </Link>
          <div className="flex-1 flex flex-col gap-1">
            <Kicker>Workout Builder · Stap {step} van 2</Kicker>
            <Display size="sm">NIEUWE WORKOUT</Display>
          </div>
          <div className="flex gap-1">
            {([1, 2] as const).map(s => (
              <div
                key={s}
                className="w-8 h-1 rounded-full"
                style={{ background: s <= step ? P.lime : P.surfaceHi }}
              />
            ))}
          </div>
        </div>

        {/* Stap 1: Basis */}
        {step === 1 && (
          <div className="space-y-4">
            <Tile>
              <div className="space-y-4">
                <MetaLabel>Basisinformatie</MetaLabel>

                <div className="space-y-1.5">
                  <MetaLabel>Patiënt</MetaLabel>
                  <DarkSelect
                    value={form.patientId}
                    onChange={e => set('patientId', e.target.value)}
                  >
                    <option value="">— Selecteer patiënt (optioneel) —</option>
                    {patientsData.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </DarkSelect>
                </div>

                <div className="space-y-1.5">
                  <MetaLabel>Naam programma *</MetaLabel>
                  <DarkInput
                    placeholder="Bijv. Zone 2 Cardio — Opbouw"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <MetaLabel>Omschrijving</MetaLabel>
                  <DarkTextarea
                    rows={2}
                    placeholder="Doel, aanpak, aandachtspunten..."
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <MetaLabel>Aantal weken</MetaLabel>
                    <DarkInput
                      type="number" min={1} max={52}
                      value={form.weeks}
                      onChange={e => set('weeks', +e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <MetaLabel>Sessies per week</MetaLabel>
                    <DarkInput
                      type="number" min={1} max={7}
                      value={form.sessionsPerWeek}
                      onChange={e => set('sessionsPerWeek', +e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </Tile>

            {/* Snelle templates */}
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Snelstart — kies een template</MetaLabel>
                <div className="space-y-2">
                  {CARDIO_TEMPLATES.slice(0, 5).map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className="athletic-tap w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors"
                      style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                    >
                      <span style={{ fontSize: 20 }}>
                        {(() => { const Icon = CARDIO_ICON_MAP[tpl.activity]; return Icon ? <Icon size={22} /> : CARDIO_ACTIVITIES[tpl.activity].icon })()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate"
                          style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}
                        >
                          {tpl.name}
                        </p>
                        <p
                          className="athletic-mono truncate"
                          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                        >
                          {tpl.description}
                        </p>
                      </div>
                      <span
                        className="athletic-mono shrink-0"
                        style={{
                          color: P.inkMuted,
                          fontSize: 10,
                          letterSpacing: '0.1em',
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: `1px solid ${P.lineStrong}`,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                        }}
                      >
                        {CARDIO_PROTOCOLS[tpl.protocol].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Tile>

            {/* Activiteit */}
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Activiteit</MetaLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.entries(CARDIO_ACTIVITIES) as [CardioActivityKey, typeof CARDIO_ACTIVITIES[CardioActivityKey]][]).map(([key, act]) => (
                    <button
                      key={key}
                      onClick={() => set('activity', key)}
                      className="athletic-tap flex flex-col items-center gap-1 p-3 rounded-xl text-center transition-all"
                      style={form.activity === key
                        ? { border: `1px solid ${P.lime}`, background: 'rgba(190,242,100,0.10)' }
                        : { border: `1px solid ${P.line}`, background: P.surfaceHi }}
                    >
                      <span style={{ fontSize: 22 }}>
                        {(() => { const Icon = CARDIO_ICON_MAP[key]; return Icon ? <Icon size={28} /> : act.icon })()}
                      </span>
                      <span
                        className="athletic-mono"
                        style={{ color: P.ink, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                      >
                        {act.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Tile>

            {/* Protocol */}
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Protocol</MetaLabel>
                <div className="space-y-2">
                  {(Object.entries(CARDIO_PROTOCOLS) as [CardioProtocolKey, typeof CARDIO_PROTOCOLS[CardioProtocolKey]][]).map(([key, proto]) => (
                    <button
                      key={key}
                      onClick={() => set('protocol', key)}
                      className="athletic-tap w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                      style={form.protocol === key
                        ? { border: `1px solid ${proto.color}`, background: proto.color + '18' }
                        : { border: `1px solid ${P.line}`, background: P.surfaceHi }}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: proto.color }} />
                      <div className="flex-1">
                        <p style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}>{proto.label}</p>
                        <p
                          className="athletic-mono"
                          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                        >
                          {proto.description}
                        </p>
                      </div>
                      {form.protocol === key && (
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: P.lime }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </Tile>

            <DarkButton variant="primary" className="w-full" onClick={() => setStep(2)}>
              Volgende → Doelen & Intervallen
            </DarkButton>
          </div>
        )}

        {/* Stap 2: Doelen & Intervallen */}
        {step === 2 && (
          <div className="space-y-4">
            <Tile>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 20 }}>{activityInfo.icon}</span>
                  <div>
                    <p
                      className="athletic-mono"
                      style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    >
                      {activityInfo.label}
                    </p>
                    <p
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                    >
                      {protocolInfo.label}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <MetaLabel>Doelduur (min)</MetaLabel>
                    <DarkInput
                      type="number" min={1} max={300}
                      value={form.targetDurationMin}
                      onChange={e => set('targetDurationMin', +e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <MetaLabel>Doelafstand (km)</MetaLabel>
                    <DarkInput
                      type="number" min={0} step={0.1}
                      placeholder="Optioneel"
                      value={form.targetDistanceKm}
                      onChange={e => set('targetDistanceKm', e.target.value)}
                    />
                  </div>
                </div>

                {/* HR Zone */}
                <div className="space-y-2">
                  <MetaLabel>Hartslagzone (doelzone)</MetaLabel>
                  <div className="flex gap-2">
                    {([null, 1, 2, 3, 4, 5] as (HRZone | null)[]).map(z => {
                      const zc = z ? zoneColor(z) : P.inkMuted
                      const active = form.targetZone === z
                      return (
                        <button
                          key={z ?? 'none'}
                          onClick={() => set('targetZone', z)}
                          className="athletic-tap flex-1 py-2 rounded-lg athletic-mono transition-all"
                          style={active
                            ? { background: zc, color: P.bg, border: '1px solid transparent', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em' }
                            : { background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.lineStrong}`, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em' }}
                        >
                          {z === null ? 'GEEN' : `Z${z}`}
                        </button>
                      )
                    })}
                  </div>
                  {form.targetZone && (
                    <div
                      className="rounded-lg p-3 flex gap-2"
                      style={{ background: P.surfaceHi, border: `1px solid ${zoneColor(form.targetZone)}` }}
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ background: zoneColor(form.targetZone) }}
                      />
                      <div
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                      >
                        <span style={{ color: P.ink, fontWeight: 800 }}>
                          {HR_ZONES[form.targetZone].label}
                        </span>
                        {' — '}{HR_ZONES[form.targetZone].description}
                        <br />
                        {HR_ZONES[form.targetZone].rpeFeel}
                      </div>
                    </div>
                  )}
                </div>

                {/* RPE target */}
                <div className="space-y-2">
                  <MetaLabel>Doel RPE (1-10, optioneel)</MetaLabel>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={1} max={10} step={1}
                      value={form.targetRpe ?? 5}
                      onChange={e => set('targetRpe', +e.target.value)}
                      className="flex-1 accent-[#BEF264]"
                    />
                    <span
                      className="athletic-display w-6 text-center"
                      style={{ color: P.ink, fontSize: 18 }}
                    >
                      {form.targetRpe ?? '—'}
                    </span>
                    {form.targetRpe && (
                      <button
                        onClick={() => set('targetRpe', null)}
                        className="athletic-mono"
                        style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.08em' }}
                      >
                        WIS
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Tile>

            {/* Intervallen als protocol dat ondersteunt */}
            {protocolInfo.hasIntervals && (
              <Tile accentBar={protocolInfo.color}>
                <div className="space-y-3">
                  <MetaLabel>Intervallen</MetaLabel>
                  <IntervalEditor intervals={form.intervals} onChange={iv => set('intervals', iv)} />
                </div>
              </Tile>
            )}

            {/* Samenvatting */}
            <Tile accentBar={P.lime}>
              <div className="space-y-2">
                <MetaLabel>Samenvatting</MetaLabel>
                <div
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 12, letterSpacing: '0.03em' }}
                >
                  <p>
                    <span style={{ color: P.ink, fontWeight: 700 }}>
                      {activityInfo.icon} {activityInfo.label}
                    </span>
                    {' — '}{protocolInfo.label}
                  </p>
                  <p>{form.weeks} weken · {form.sessionsPerWeek}×/week · {form.targetDurationMin} min per sessie</p>
                  {form.targetDistanceKm && <p>Doelafstand: {form.targetDistanceKm} km</p>}
                  {form.targetZone && <p>Zone {form.targetZone}: {HR_ZONES[form.targetZone].label}</p>}
                  {form.intervals.length > 0 && <p>{form.intervals.length} intervalblok(ken) geconfigureerd</p>}
                  {form.patientId && (
                    <p>Patiënt: {patientsData.find(p => p.id === form.patientId)?.name}</p>
                  )}
                </div>
              </div>
            </Tile>

            <div className="flex gap-3">
              <DarkButton variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                Terug
              </DarkButton>
              <DarkButton
                variant="primary"
                className="flex-1"
                disabled={saving || !form.name.trim()}
                onClick={handleSave}
              >
                {saving ? 'Opslaan...' : 'Programma opslaan'}
              </DarkButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WorkoutBuilderPage() {
  return (
    <Suspense>
      <WorkoutBuilderContent />
    </Suspense>
  )
}
