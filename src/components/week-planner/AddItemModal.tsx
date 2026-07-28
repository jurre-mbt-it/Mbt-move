'use client'

/**
 * "+ Workout" — wat zet je op een dag?
 *
 * Twee stappen: eerst een tegel kiezen, dan (waar nodig) een klein formulier.
 * De tegels zijn gesorteerd op hoe vaak een therapeut ze gebruikt, niet op hoe
 * het datamodel eruitziet:
 *
 *   rij 1  Kracht · Hardlopen · Fietsen · Mobiliteit      ← dekt het gros
 *   rij 2  Aerobic · Stabiliteit · Plyometrie · Rustdag
 *   overig Bibliotheek · Notitie · Test/meting · Doel/datum
 *
 * Hardlopen en fietsen zijn eigen tegels omdat ze het meest gebruikt worden;
 * de rest valt onder Aerobic en kiest daar de activiteit. In de data blijft dat
 * `quickCategory: CARDIO` + `quickActivity` — geen nieuwe enum.
 */

import { useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'
import {
  ChevronLeft, ClipboardCheck, Flag, Layers, Moon, Search, StickyNote,
} from 'lucide-react'
import {
  IconStrength, IconMobility, IconPlyometrics, IconCardio, IconCore,
  CARDIO_ICON_MAP,
} from '@/components/icons'
import { CARDIO_ACTIVITIES, type CardioActivityKey } from '@/lib/cardio-constants'
import { CATEGORY_COLORS } from '@/lib/palette'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkTextarea,
  MetaLabel,
  P,
} from '@/components/dark-ui'

type Category = 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY'

export type AddItemPayload =
  | { kind: 'program'; programId: string; notes?: string | null }
  | {
      kind: 'quick'
      quickCategory: Category
      quickName: string
      quickDurationSec: number
      quickActivity?: CardioActivityKey
      notes?: string | null
    }
  | { kind: 'rest'; notes?: string | null }
  | { kind: 'note'; quickName: string; notes?: string | null }
  | { kind: 'test'; testBatteryId: string; notes?: string | null }
  | { kind: 'event'; quickName: string; notes?: string | null }

type ProgramListItem = { id: string; name: string; isTemplate?: boolean }


/** Cardio-activiteiten onder "Aerobic": alles behalve de twee eigen tegels. */
const AEROBIC_ACTIVITIES: CardioActivityKey[] = [
  'ROWING', 'SWIMMING', 'CROSSTRAINER', 'WALKING',
  'SKIERG', 'ASSAULT_BIKE', 'WATTBIKE', 'STAIRCLIMBER', 'OTHER',
]

type TileKey =
  | 'strength' | 'run' | 'bike' | 'mobility'
  | 'aerobic' | 'stability' | 'plyo' | 'rest'
  | 'library' | 'note' | 'test' | 'event'

type Tile = {
  label: string
  color: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  /** Voor workout-tegels: de vaste categorie + standaardduur in minuten. */
  category?: Category
  activity?: CardioActivityKey
  minutes?: number
}

const TILES: Record<TileKey, Tile> = {
  strength:  { label: 'Kracht',      color: CATEGORY_COLORS.STRENGTH,   Icon: IconStrength,             category: 'STRENGTH',    minutes: 45 },
  run:       { label: 'Hardlopen',   color: '#E87A55',                  Icon: CARDIO_ICON_MAP.RUNNING,  category: 'CARDIO',      minutes: 30, activity: 'RUNNING' },
  bike:      { label: 'Fietsen',     color: '#9FCEC9',                  Icon: CARDIO_ICON_MAP.CYCLING,  category: 'CARDIO',      minutes: 45, activity: 'CYCLING' },
  mobility:  { label: 'Mobiliteit',  color: CATEGORY_COLORS.MOBILITY,   Icon: IconMobility,             category: 'MOBILITY',    minutes: 20 },
  aerobic:   { label: 'Aerobic',     color: CATEGORY_COLORS.CARDIO,     Icon: IconCardio,               category: 'CARDIO',      minutes: 30 },
  stability: { label: 'Stabiliteit', color: CATEGORY_COLORS.STABILITY,  Icon: IconCore,                 category: 'STABILITY',   minutes: 25 },
  plyo:      { label: 'Plyometrie',  color: CATEGORY_COLORS.PLYOMETRICS, Icon: IconPlyometrics,         category: 'PLYOMETRICS', minutes: 20 },
  rest:      { label: 'Rustdag',     color: P.inkDim,                   Icon: Moon },
  library:   { label: 'Bibliotheek', color: P.ink,                      Icon: Layers },
  note:      { label: 'Notitie',     color: '#F5B942',                  Icon: StickyNote },
  test:      { label: 'Test/meting', color: P.ink,                      Icon: ClipboardCheck },
  event:     { label: 'Doel/datum',  color: '#5FD08A',                  Icon: Flag },
}

const ROW_1: TileKey[] = ['strength', 'run', 'bike', 'mobility']
const ROW_2: TileKey[] = ['aerobic', 'stability', 'plyo', 'rest']
const ROW_OTHER: TileKey[] = ['library', 'note', 'test', 'event']

type Step = 'pick' | 'aerobic' | 'workout' | 'library' | 'note' | 'test' | 'event'

export function AddItemModal({
  open, onClose, dayId, dayLabel, programs, onSubmit, initialTab = 'library',
}: {
  open: boolean
  onClose: () => void
  dayId: string | null
  dayLabel: string
  programs: ProgramListItem[]
  initialTab?: 'library' | 'quick'
  onSubmit: (payload: AddItemPayload) => Promise<void>
}) {
  const [step, setStep] = useState<Step>('pick')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  // Workout-formulier
  const [tile, setTile] = useState<TileKey>('strength')
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [activity, setActivity] = useState<CardioActivityKey | undefined>()
  const [notes, setNotes] = useState('')
  const [text, setText] = useState('')
  const [batteryId, setBatteryId] = useState<string | null>(null)

  const batteries = trpc.testReports.batteries.useQuery(undefined, { enabled: open && step === 'test' })

  useEffect(() => {
    if (!open) return
    // Vanuit het dag-menu: "Vanuit sjabloon" opent direct de bibliotheek,
    // "Workout" begint bij de tegels.
    setStep(initialTab === 'library' ? 'library' : 'pick')
    setBusy(false); setQuery(''); setNotes(''); setText(''); setBatteryId(null)
  }, [open, initialTab])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return programs.slice(0, 30)
    return programs.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30)
  }, [programs, query])

  function close() { onClose() }

  async function send(payload: AddItemPayload) {
    if (!dayId || busy) return
    setBusy(true)
    try { await onSubmit(payload); close() }
    finally { setBusy(false) }
  }

  function openWorkoutForm(key: TileKey, act?: CardioActivityKey) {
    const t = TILES[key]
    setTile(key)
    setActivity(act ?? t.activity)
    setName(act ? CARDIO_ACTIVITIES[act].label : t.label)
    setMinutes(String(t.minutes ?? 30))
    setStep('workout')
  }

  function pick(key: TileKey) {
    switch (key) {
      case 'rest':    return void send({ kind: 'rest', notes: null })
      case 'aerobic': return setStep('aerobic')
      case 'library': return setStep('library')
      case 'note':    setText(''); return setStep('note')
      case 'test':    return setStep('test')
      case 'event':   setText(''); return setStep('event')
      default:        return openWorkoutForm(key)
    }
  }

  const activeTile = TILES[tile]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              {step !== 'pick' && (
                <button
                  type="button"
                  onClick={() => setStep('pick')}
                  aria-label="Terug"
                  className="w-6 h-6 rounded-md grid place-items-center shrink-0 transition-colors"
                  style={{ border: `1px solid ${P.line}`, color: P.inkMuted }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}
              {dayLabel}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* ── Stap 1: tegels ── */}
        {step === 'pick' && (
          <div className="mt-1">
            <MetaLabel>Workout toevoegen</MetaLabel>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {ROW_1.map(k => <TileButton key={k} k={k} onPick={pick} disabled={busy} />)}
              {ROW_2.map(k => <TileButton key={k} k={k} onPick={pick} disabled={busy} />)}
            </div>
            <div className="mt-4">
              <MetaLabel>Overig toevoegen</MetaLabel>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {ROW_OTHER.map(k => <TileButton key={k} k={k} onPick={pick} disabled={busy} />)}
              </div>
            </div>
          </div>
        )}

        {/* ── Aerobic: welke activiteit? ── */}
        {step === 'aerobic' && (
          <div className="mt-1">
            <MetaLabel>Aerobic, kies activiteit</MetaLabel>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {AEROBIC_ACTIVITIES.map(a => {
                const Icon = CARDIO_ICON_MAP[a] ?? IconCardio
                return (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    onClick={() => openWorkoutForm('aerobic', a)}
                    className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-left text-xs font-semibold transition-colors athletic-tap"
                    style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.ink }}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="truncate">{CARDIO_ACTIVITIES[a].label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: P.inkDim }}>
              Hardlopen en fietsen staan als eigen tegel op het vorige scherm.
            </p>
          </div>
        )}

        {/* ── Workout-formulier ── */}
        {step === 'workout' && (
          <div className="space-y-3 mt-1">
            <div
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
              style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
            >
              <activeTile.Icon size={15} />
              <span className="text-xs font-semibold" style={{ color: P.ink }}>
                {activity ? CARDIO_ACTIVITIES[activity].label : activeTile.label}
              </span>
            </div>
            <div>
              <MetaLabel>Naam</MetaLabel>
              <DarkInput
                autoFocus
                className="mt-1.5"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Bijv. Kracht onderbeen"
                disabled={busy}
              />
            </div>
            <div>
              <MetaLabel>Duur (minuten)</MetaLabel>
              <DarkInput
                className="mt-1.5"
                type="number"
                min={1}
                max={720}
                value={minutes}
                onChange={e => setMinutes(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <MetaLabel>Notitie (optioneel)</MetaLabel>
              <DarkTextarea
                className="mt-1.5"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Aandachtspunt of instructie"
                disabled={busy}
              />
            </div>
            <FormActions
              busy={busy}
              onCancel={close}
              onSubmit={() => {
                if (!name.trim()) { toast.error('Naam is verplicht'); return }
                const m = Math.max(1, Math.min(720, Number(minutes) || 30))
                send({
                  kind: 'quick',
                  quickCategory: activeTile.category ?? 'STRENGTH',
                  quickName: name.trim(),
                  quickDurationSec: m * 60,
                  ...(activeTile.category === 'CARDIO' && activity ? { quickActivity: activity } : {}),
                  notes: notes.trim() || null,
                })
              }}
            />
          </div>
        )}

        {/* ── Bibliotheek ── */}
        {step === 'library' && (
          <div className="space-y-2 mt-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: P.inkDim }} />
              <DarkInput
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Zoek programma…"
                className="pl-8"
                disabled={busy}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {filtered.length === 0 ? (
                <p className="text-xs py-3 text-center" style={{ color: P.inkDim }}>Geen programma&apos;s gevonden.</p>
              ) : filtered.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => send({ kind: 'program', programId: p.id, notes: null })}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 rounded-lg mbt-card-hover athletic-tap flex items-center gap-2 bg-[#15363A] border border-[rgba(212,232,230,0.12)]"
                >
                  <span className="flex-1 truncate text-sm">{p.name}</span>
                  {p.isTemplate && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded uppercase" style={{ background: P.surfaceHi, color: P.inkMuted }}>
                      Sjabloon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Notitie ── */}
        {step === 'note' && (
          <div className="space-y-3 mt-1">
            <div>
              <MetaLabel>Notitie</MetaLabel>
              <DarkInput
                autoFocus
                className="mt-1.5"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Bijv. pijn 2/10 na fietsen"
                disabled={busy}
              />
              <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: P.inkDim }}>
                Staat op jouw kalender. De patiënt-app toont notities niet.
              </p>
            </div>
            <FormActions
              busy={busy}
              onCancel={close}
              onSubmit={() => {
                if (!text.trim()) { toast.error('Notitie is leeg'); return }
                send({ kind: 'note', quickName: text.trim(), notes: null })
              }}
            />
          </div>
        )}

        {/* ── Test/meting ── */}
        {step === 'test' && (
          <div className="space-y-3 mt-1">
            <MetaLabel>Testbatterij</MetaLabel>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {batteries.isLoading && (
                <p className="text-xs py-3 text-center" style={{ color: P.inkDim }}>Laden…</p>
              )}
              {batteries.data?.length === 0 && (
                <p className="text-xs py-3 text-center leading-relaxed" style={{ color: P.inkDim }}>
                  Nog geen batterijen. Maak ze aan onder Testrapporten → beheer.
                </p>
              )}
              {batteries.data?.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBatteryId(b.id)}
                  disabled={busy}
                  className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: batteryId === b.id ? `color-mix(in srgb, ${P.lime} 6%, transparent)` : P.surfaceLow,
                    border: `1px solid ${batteryId === b.id ? P.lime : P.line}`,
                  }}
                >
                  <span className="text-sm" style={{ color: P.ink }}>{b.name}</span>
                  {b.durationWeeks && (
                    <span className="text-[10px] ml-2 font-mono" style={{ color: P.inkMuted }}>
                      {b.durationWeeks} wk protocol
                    </span>
                  )}
                </button>
              ))}
            </div>
            <FormActions
              busy={busy}
              disabled={!batteryId}
              onCancel={close}
              onSubmit={() => batteryId && send({ kind: 'test', testBatteryId: batteryId, notes: null })}
            />
          </div>
        )}

        {/* ── Doel/datum ── */}
        {step === 'event' && (
          <div className="space-y-3 mt-1">
            <div>
              <MetaLabel>Doel op deze datum</MetaLabel>
              <DarkInput
                autoFocus
                className="mt-1.5"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Bijv. terug naar veldtraining"
                disabled={busy}
              />
            </div>
            <FormActions
              busy={busy}
              onCancel={close}
              onSubmit={() => {
                if (!text.trim()) { toast.error('Geef het doel een naam'); return }
                send({ kind: 'event', quickName: text.trim(), notes: null })
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TileButton({ k, onPick, disabled }: { k: TileKey; onPick: (k: TileKey) => void; disabled: boolean }) {
  const t = TILES[k]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(k)}
      className="flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-left text-xs font-semibold transition-colors athletic-tap"
      style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.ink }}
    >
      <span style={{ color: t.color }} className="shrink-0 flex">
        <t.Icon size={15} />
      </span>
      <span className="truncate">{t.label}</span>
    </button>
  )
}

function FormActions({
  busy, disabled, onCancel, onSubmit,
}: { busy: boolean; disabled?: boolean; onCancel: () => void; onSubmit: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      <DarkButton variant="ghost" onClick={onCancel} className="flex-1" disabled={busy}>
        Annuleren
      </DarkButton>
      <DarkButton variant="primary" onClick={onSubmit} className="flex-1" disabled={busy || disabled}>
        {busy ? 'Toevoegen…' : 'Toevoegen'}
      </DarkButton>
    </div>
  )
}
