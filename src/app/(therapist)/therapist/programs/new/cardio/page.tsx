'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft, ChevronRight, Plus, Trash2, Timer, Zap, Info,
} from 'lucide-react'
import {
  CARDIO_ACTIVITIES, CARDIO_PROTOCOLS, HR_ZONES,
  CARDIO_TEMPLATES, CardioActivityKey, CardioProtocolKey, HRZone, CardioInterval,
} from '@/lib/cardio-constants'
import { PATIENTS } from '@/lib/mock-data'

const MBT_GREEN = '#3ECF6A'
const MBT_TEAL = '#4ECDC4'

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

// ── Interval editor ───────────────────────────────────────────────────────────

function IntervalEditor({
  intervals,
  onChange,
}: {
  intervals: CardioInterval[]
  onChange: (v: CardioInterval[]) => void
}) {
  const addInterval = () =>
    onChange([...intervals, { workDuration: 120, restDuration: 60, repetitions: 4, label: 'Blok' }])

  const update = (i: number, key: keyof CardioInterval, val: string | number) => {
    const next = intervals.map((iv, idx) => idx === i ? { ...iv, [key]: val } : iv)
    onChange(next)
  }

  const remove = (i: number) => onChange(intervals.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      {intervals.map((iv, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Interval {i + 1}</span>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Werk (sec)</Label>
              <Input
                type="number" min={10} value={iv.workDuration}
                onChange={e => update(i, 'workDuration', +e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Rust (sec)</Label>
              <Input
                type="number" min={0} value={iv.restDuration}
                onChange={e => update(i, 'restDuration', +e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Herhalingen</Label>
              <Input
                type="number" min={1} value={iv.repetitions}
                onChange={e => update(i, 'repetitions', +e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={iv.label ?? ''} placeholder="Bijv. Sprint"
                onChange={e => update(i, 'label', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Totaal: {Math.round(iv.repetitions * (iv.workDuration + iv.restDuration) / 60)} min
          </p>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addInterval} className="gap-1 w-full">
        <Plus className="w-3 h-3" /> Interval toevoegen
      </Button>
    </div>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

function CardioProgramBuilderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prePatientId = searchParams.get('patientId') ?? ''

  const [form, setForm] = useState<CardioFormState>({ ...DEFAULT_STATE, patientId: prePatientId })
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    toast.success('Cardio programma opgeslagen!')
    router.push('/therapist/programs')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/therapist/programs">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Nieuw Cardio Programma</h1>
          <p className="text-sm text-muted-foreground">Stap {step} van 3</p>
        </div>
        <div className="ml-auto flex gap-1">
          {([1, 2, 3] as const).map(s => (
            <div key={s} className="w-8 h-1 rounded-full" style={{ background: s <= step ? MBT_GREEN : '#e2e8f0' }} />
          ))}
        </div>
      </div>

      {/* Stap 1: Basis */}
      {step === 1 && (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h2 className="font-semibold">Basisinformatie</h2>

              <div>
                <Label>Patiënt</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.patientId}
                  onChange={e => set('patientId', e.target.value)}
                >
                  <option value="">— Selecteer patiënt (optioneel) —</option>
                  {PATIENTS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Naam programma *</Label>
                <Input
                  className="mt-1"
                  placeholder="Bijv. Zone 2 Cardio — Opbouw"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                />
              </div>

              <div>
                <Label>Omschrijving</Label>
                <textarea
                  className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm resize-none"
                  rows={2}
                  placeholder="Doel, aanpak, aandachtspunten..."
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Aantal weken</Label>
                  <Input
                    type="number" min={1} max={52} className="mt-1"
                    value={form.weeks}
                    onChange={e => set('weeks', +e.target.value)}
                  />
                </div>
                <div>
                  <Label>Sessies per week</Label>
                  <Input
                    type="number" min={1} max={7} className="mt-1"
                    value={form.sessionsPerWeek}
                    onChange={e => set('sessionsPerWeek', +e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Snelle templates */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold text-sm">Snelstart — kies een template</h2>
              <div className="space-y-2">
                {CARDIO_TEMPLATES.slice(0, 5).map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="w-full text-left p-2 rounded-lg border hover:bg-muted/50 transition-colors flex items-center gap-3"
                  >
                    <span className="text-xl">{CARDIO_ACTIVITIES[tpl.activity].icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {CARDIO_PROTOCOLS[tpl.protocol].label}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button className="w-full gap-2" style={{ background: MBT_GREEN }} onClick={() => setStep(2)}>
            Volgende <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Stap 2: Activiteit & Protocol */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Activiteit */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold">Activiteit</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(CARDIO_ACTIVITIES) as [CardioActivityKey, typeof CARDIO_ACTIVITIES[CardioActivityKey]][]).map(([key, act]) => (
                  <button
                    key={key}
                    onClick={() => set('activity', key)}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all"
                    style={form.activity === key ? { borderColor: MBT_GREEN, background: '#f0fdf4' } : {}}
                  >
                    <span className="text-2xl">{act.icon}</span>
                    <span className="text-xs font-medium leading-tight">{act.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Protocol */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold">Protocol</h2>
              <div className="space-y-2">
                {(Object.entries(CARDIO_PROTOCOLS) as [CardioProtocolKey, typeof CARDIO_PROTOCOLS[CardioProtocolKey]][]).map(([key, proto]) => (
                  <button
                    key={key}
                    onClick={() => set('protocol', key)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                    style={form.protocol === key ? { borderColor: proto.color, background: proto.color + '18' } : {}}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: proto.color }} />
                    <div>
                      <p className="text-sm font-medium">{proto.label}</p>
                      <p className="text-xs text-muted-foreground">{proto.description}</p>
                    </div>
                    {form.protocol === key && <div className="ml-auto w-2 h-2 rounded-full" style={{ background: MBT_GREEN }} />}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Terug</Button>
            <Button className="flex-1 gap-2" style={{ background: MBT_GREEN }} onClick={() => setStep(3)}>
              Volgende <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Stap 3: Doelen & Intervallen */}
      {step === 3 && (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{activityInfo.icon}</span>
                <div>
                  <h2 className="font-semibold">{activityInfo.label}</h2>
                  <p className="text-xs text-muted-foreground">{protocolInfo.label}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Doelduur (min)</Label>
                  <Input
                    type="number" min={1} max={300} className="mt-1"
                    value={form.targetDurationMin}
                    onChange={e => set('targetDurationMin', +e.target.value)}
                  />
                </div>
                <div>
                  <Label>Doelafsand (km)</Label>
                  <Input
                    type="number" min={0} step={0.1} className="mt-1"
                    placeholder="Optioneel"
                    value={form.targetDistanceKm}
                    onChange={e => set('targetDistanceKm', e.target.value)}
                  />
                </div>
              </div>

              {/* HR Zone */}
              <div>
                <Label>Hartslagzone (doelzone)</Label>
                <div className="flex gap-2 mt-2">
                  {([null, 1, 2, 3, 4, 5] as (HRZone | null)[]).map(z => (
                    <button
                      key={z ?? 'none'}
                      onClick={() => set('targetZone', z)}
                      className="flex-1 py-2 rounded-lg border text-xs font-semibold transition-all"
                      style={form.targetZone === z
                        ? { background: z ? HR_ZONES[z].color : '#94a3b8', color: '#fff', borderColor: 'transparent' }
                        : {}}
                    >
                      {z === null ? 'Geen' : `Z${z}`}
                    </button>
                  ))}
                </div>
                {form.targetZone && (
                  <div className="mt-2 p-2 rounded-lg text-xs flex gap-2" style={{ background: HR_ZONES[form.targetZone].bg }}>
                    <Info className="w-3 h-3 mt-0.5 shrink-0" style={{ color: HR_ZONES[form.targetZone].color }} />
                    <div>
                      <span className="font-medium">{HR_ZONES[form.targetZone].label}</span> — {HR_ZONES[form.targetZone].description}
                      <br />{HR_ZONES[form.targetZone].rpeFeel}
                    </div>
                  </div>
                )}
              </div>

              {/* RPE target */}
              <div>
                <Label>Doel RPE (1-10, optioneel)</Label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="range" min={1} max={10} step={1}
                    value={form.targetRpe ?? 5}
                    onChange={e => set('targetRpe', +e.target.value)}
                    className="flex-1 accent-[#3ECF6A]"
                  />
                  <span className="w-6 text-sm font-bold text-center">{form.targetRpe ?? '—'}</span>
                  {form.targetRpe && (
                    <button onClick={() => set('targetRpe', null)} className="text-xs text-muted-foreground">Wis</button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Intervallen als protocol dat ondersteunt */}
          {protocolInfo.hasIntervals && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4" style={{ color: protocolInfo.color }} />
                  <h2 className="font-semibold">Intervallen</h2>
                </div>
                <IntervalEditor intervals={form.intervals} onChange={iv => set('intervals', iv)} />
              </CardContent>
            </Card>
          )}

          {/* Samenvatting */}
          <Card className="border-2" style={{ borderColor: MBT_GREEN + '60' }}>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: MBT_GREEN }} />
                Samenvatting
              </h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><span className="font-medium text-foreground">{activityInfo.icon} {activityInfo.label}</span> — {protocolInfo.label}</p>
                <p>{form.weeks} weken · {form.sessionsPerWeek}×/week · {form.targetDurationMin} min per sessie</p>
                {form.targetDistanceKm && <p>Doelafstand: {form.targetDistanceKm} km</p>}
                {form.targetZone && <p>Zone {form.targetZone}: {HR_ZONES[form.targetZone].label}</p>}
                {form.intervals.length > 0 && <p>{form.intervals.length} intervalblok(ken) geconfigureerd</p>}
                {form.patientId && (
                  <p>Patiënt: {PATIENTS.find(p => p.id === form.patientId)?.name}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Terug</Button>
            <Button
              className="flex-1" style={{ background: MBT_GREEN }}
              disabled={saving || !form.name.trim()}
              onClick={handleSave}
            >
              {saving ? 'Opslaan...' : 'Programma opslaan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CardioProgramBuilderPage() {
  return (
    <Suspense>
      <CardioProgramBuilderContent />
    </Suspense>
  )
}
