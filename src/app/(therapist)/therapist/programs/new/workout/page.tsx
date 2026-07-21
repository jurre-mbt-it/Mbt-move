'use client'

/**
 * Nieuw cardio-programma — op het blokken-model.
 *
 * Stap 1 is de administratie (patiënt, naam, weken, activiteit); stap 2 is de
 * workout zelf, gebouwd met dezelfde CardioWorkoutBuilder als het weekschema
 * en de iPad. Er is bewust geen los "protocol + doelen + intervallen"-formulier
 * meer: dat schreef een eigen plat formaat dat alleen dit scherm kon lezen —
 * de app las het als leeg, en getActiveCardioProgram moest ernaast een tweede
 * lezer onderhouden. Eén model ({version:1, activity, blocks}), overal.
 *
 * De walk-run-wizard is weg: een return-to-running-schema is gewoon cardio
 * met afwisselende blokken. Er bestond in productie geen enkel walk-run- of
 * cardio-programma, dus er is niets te migreren.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Layers } from 'lucide-react'
import {
  CARDIO_ACTIVITIES, HR_ZONES, SELECTABLE_CARDIO_ACTIVITIES,
  CARDIO_TEMPLATES, type CardioActivityKey, type CardioActivityTemplate,
} from '@/lib/cardio-constants'
import {
  summarize, structuredLoad, totalDurationSec, targetColor, isRepeat,
  type StructuredCardio, type WorkoutBlock,
} from '@/lib/cardio-workout'
import { computeHrZones } from '@/lib/cardio-zones'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import { CARDIO_ICON_MAP } from '@/components/icons'
import { CardioWorkoutBuilder } from '@/components/week-planner/CardioWorkoutBuilder'
import {
  DarkButton, DarkInput, DarkSelect, DarkTextarea,
  Display, Kicker, MetaLabel, P, Tile,
} from '@/components/dark-ui'

// ── Snelstart: oude template-vorm → blokken ───────────────────────────────────
// Trouw aan wat de template zegt, niets verzinnen: intervallen worden een
// herhaling (werk op de doelzone, rust in Z1), anders één actief blok van de
// doelduur. Geen gefabriceerde warming-up — die bouwt de therapeut zelf.
function templateBlocks(tpl: CardioActivityTemplate): WorkoutBlock[] {
  const zone = tpl.targetZone ?? 2
  if (tpl.intervals?.length) {
    return tpl.intervals.map((iv, i) => ({
      id: `tpl-${tpl.id}-${i}`,
      kind: 'REPEAT' as const,
      times: Math.max(1, iv.repetitions),
      steps: [
        {
          id: `tpl-${tpl.id}-${i}-w`, kind: 'ACTIVE' as const,
          durationSec: iv.workDuration, target: { type: 'ZONE' as const, zone },
        },
        ...(iv.restDuration > 0
          ? [{
              id: `tpl-${tpl.id}-${i}-r`, kind: 'RECOVERY' as const,
              durationSec: iv.restDuration, target: { type: 'ZONE' as const, zone: 1 as const },
            }]
          : []),
      ],
    }))
  }
  return [{
    id: `tpl-${tpl.id}-a`,
    kind: 'ACTIVE',
    durationSec: tpl.targetDurationMin * 60,
    target: { type: 'ZONE', zone },
  }]
}

// ── Formulier ─────────────────────────────────────────────────────────────────

interface CardioFormState {
  name: string
  description: string
  patientId: string
  activity: CardioActivityKey
  weeks: number
  sessionsPerWeek: number
  blocks: WorkoutBlock[]
}

const DEFAULT_STATE: CardioFormState = {
  name: '',
  description: '',
  patientId: '',
  activity: 'RUNNING',
  weeks: 6,
  sessionsPerWeek: 3,
  blocks: [],
}

/** Gekleurde balk van de blokken — zelfde beeldtaal als planner en iPad. */
function BlocksBar({ blocks }: { blocks: WorkoutBlock[] }) {
  const bars = blocks.flatMap(b =>
    isRepeat(b)
      ? b.steps.map(st => ({ id: `${b.id}-${st.id}`, w: (st.durationSec ?? 120) * b.times, c: targetColor(st.target) }))
      : [{ id: b.id, w: b.durationSec ?? 120, c: targetColor(b.target) }],
  )
  const tot = bars.reduce((s, x) => s + x.w, 0) || 1
  return (
    <div className="flex gap-px h-12 rounded-lg overflow-hidden">
      {bars.map(bar => (
        <div key={bar.id} style={{ flex: bar.w / tot, background: bar.c, opacity: 0.85 }} />
      ))}
    </div>
  )
}

function WorkoutBuilderContent() {
  const portal = usePortal()
  const router = useRouter()
  const searchParams = useSearchParams()
  const prePatientId = searchParams.get('patientId') ?? ''

  const { data: patientsData = [] } = trpc.patients.list.useQuery()
  const [form, setForm] = useState<CardioFormState>({ ...DEFAULT_STATE, patientId: prePatientId })
  const [step, setStep] = useState<1 | 2>(1)
  const [builderOpen, setBuilderOpen] = useState(false)
  const utils = trpc.useUtils()
  const createProgram = trpc.programs.create.useMutation()
  const saving = createProgram.isPending

  const set = <K extends keyof CardioFormState>(key: K, val: CardioFormState[K]) =>
    setForm(f => ({ ...f, [key]: val }))

  // HR-profiel van de gekoppelde patiënt → doelzones als concrete bpm in de kaart.
  const { data: selectedPatient } = trpc.patients.get.useQuery(
    { id: form.patientId },
    { enabled: !!form.patientId },
  )
  const prescribedZones = selectedPatient ? computeHrZones(selectedPatient) : null

  const applyTemplate = (tpl: CardioActivityTemplate) => {
    setForm(f => ({
      ...f,
      name: f.name || tpl.name,
      description: f.description || tpl.description,
      activity: tpl.activity,
      blocks: templateBlocks(tpl),
    }))
    toast.success(`Template "${tpl.name}" geladen`)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Geef het programma een naam')
      return
    }
    if (form.blocks.length === 0) {
      toast.error('Bouw eerst de workout op uit blokken')
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
        // Zelfde vorm als een cardio-workout in het weekschema en op de iPad;
        // gelezen door parseStructured/parseWorkout en getActiveCardioProgram.
        cardioParams: { version: 1, activity: form.activity, blocks: form.blocks },
      })
      await utils.programs.list.invalidate()
      toast.success('Cardio-programma opgeslagen!')
      router.push(`${portal.base}/programs/${created.id}/edit`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
  }

  const dur = totalDurationSec(form.blocks)

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-16 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`${portal.base}/programs`}
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.16em' }}
          >
            ← TERUG
          </Link>
          <div className="flex-1 flex flex-col gap-1">
            <Kicker>Nieuw cardio · Stap {step} van 2</Kicker>
            <Display size="sm">NIEUWE CARDIO</Display>
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
                        }}
                      >
                        {Math.round(totalDurationSec(templateBlocks(tpl)) / 60)} MIN
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
                  {SELECTABLE_CARDIO_ACTIVITIES.map((key) => {
                    const act = CARDIO_ACTIVITIES[key]
                    return (
                    <button
                      key={key}
                      onClick={() => set('activity', key)}
                      className="athletic-tap flex flex-col items-center gap-1 p-3 rounded-xl text-center transition-all"
                      style={form.activity === key
                        ? { border: `1px solid ${P.lime}`, background: 'rgba(232,122,85,0.10)' }
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
                    )
                  })}
                </div>
              </div>
            </Tile>

            <DarkButton variant="primary" className="w-full" onClick={() => setStep(2)}>
              Volgende → Workout bouwen
            </DarkButton>
          </div>
        )}

        {/* Stap 2: de workout zelf, in blokken */}
        {step === 2 && (
          <div className="space-y-4">
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Workout</MetaLabel>
                {form.blocks.length === 0 ? (
                  <p className="text-[12px] leading-relaxed" style={{ color: P.inkDim }}>
                    Nog geen blokken. Bouw de workout op uit warming-up, intervallen
                    en cooldown — dezelfde bouwer als in het weekschema.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: P.ink }}>
                        {CARDIO_ACTIVITIES[form.activity]?.label ?? 'Cardio'}
                      </span>
                      <span className="athletic-mono text-[11px]" style={{ color: P.inkMuted }}>
                        {Math.round(dur / 60)} min
                      </span>
                      <span className="athletic-mono text-[11px]" style={{ color: P.lime }}>
                        {structuredLoad(form.blocks)} sRPE
                      </span>
                    </div>
                    <BlocksBar blocks={form.blocks} />
                    <p className="text-[12px] leading-relaxed" style={{ color: P.inkDim }}>
                      {summarize(form.blocks)}
                    </p>
                  </>
                )}
                <DarkButton variant="secondary" className="w-full" onClick={() => setBuilderOpen(true)}>
                  <Layers className="w-4 h-4 mr-1.5" />
                  {form.blocks.length === 0 ? 'Workout bouwen' : 'Workout bewerken'}
                </DarkButton>
              </div>
            </Tile>

            {/* Zones van de gekoppelde patiënt als context bij het bouwen. */}
            {prescribedZones && (
              <Tile>
                <div className="space-y-2">
                  <MetaLabel>HR-zones van {selectedPatient?.name ?? 'patiënt'}</MetaLabel>
                  <div className="space-y-1">
                    {prescribedZones.zones.map(z => (
                      <div key={z.zone} className="flex items-center gap-2 text-[11px]">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HR_ZONES[z.zone].color }} />
                        <span style={{ color: P.ink, fontWeight: 600 }}>{HR_ZONES[z.zone].label}</span>
                        <span className="athletic-mono ml-auto" style={{ color: P.inkMuted }}>
                          {z.minBpm}–{z.maxBpm} bpm
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Tile>
            )}

            <div className="flex gap-2">
              <DarkButton variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                ← Terug
              </DarkButton>
              <DarkButton
                variant="primary"
                className="flex-1"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Opslaan…' : 'Programma opslaan →'}
              </DarkButton>
            </div>
          </div>
        )}
      </div>

      {/* Dezelfde bouwer als het weekschema en de iPad. */}
      {builderOpen && (
        <CardioWorkoutBuilder
          initial={form.blocks.length > 0
            ? { version: 1, activity: form.activity, blocks: form.blocks } as StructuredCardio
            : null}
          activity={form.activity}
          itemName={form.name.trim() || 'Cardio-workout'}
          saving={false}
          onClose={() => setBuilderOpen(false)}
          onSave={async (w) => {
            setForm(f => ({ ...f, activity: w.activity, blocks: w.blocks }))
            setBuilderOpen(false)
          }}
        />
      )}
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
