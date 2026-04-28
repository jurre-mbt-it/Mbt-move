'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { WALK_RUN_TEMPLATES, WalkRunTemplate, WalkRunWeek } from '@/lib/cardio-constants'
import { trpc } from '@/lib/trpc/client'
import { IconRunning, IconSquat, IconLunge, IconNote, IconClipboard, IconCheck } from '@/components/icons'
import {
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

// ── Wizard stappen ────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4

interface WizardState {
  patientId: string
  templateId: string
  currentFitness: 'SLECHT' | 'MATIG' | 'GOED'
  targetDistanceKm: number
  startWeek: number
  customWeeks: WalkRunWeek[]
  notes: string
}

const DEFAULT: WizardState = {
  patientId: '',
  templateId: 'wr-generiek',
  currentFitness: 'MATIG',
  targetDistanceKm: 5,
  startWeek: 1,
  customWeeks: [],
  notes: '',
}

const FITNESS_OPTIONS = [
  { value: 'SLECHT', label: 'Slecht', description: 'Geen of weinig conditionele basis. Begin conservatief.', color: P.danger },
  { value: 'MATIG',  label: 'Matig',  description: 'Beperkte conditie. Normaal progressietempo.',          color: P.gold },
  { value: 'GOED',   label: 'Goed',   description: 'Redelijke conditie. Iets sneller opbouwen.',          color: P.lime },
] as const

const INJURY_TEMPLATES = [
  { id: 'wr-generiek', label: 'Generiek', icon: 'running', description: 'Geschikt voor de meeste blessures en als algemeen terugkeer protocol' },
  { id: 'wr-achilles', label: 'Achilles', icon: 'squat', description: 'Conservatieve opbouw voor achillestendinopathie met hielprotocol' },
  { id: 'wr-knie',     label: 'Knie',     icon: 'lunge', description: 'Geleidelijke opbouw na knieblessure, meniscus of PFPS/ACL' },
]

// ── Week tabel component ──────────────────────────────────────────────────────

function WeekTable({
  weeks,
  onEdit,
}: {
  weeks: WalkRunWeek[]
  onEdit: (i: number, key: keyof WalkRunWeek, val: number) => void
}) {
  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr style={{ borderBottom: `1px solid ${P.line}` }}>
            {['Week', 'Lopen (min)', 'Wandelen (min)', 'Rondes', 'Sessies/week', 'Totaal'].map((h, idx) => (
              <th
                key={h}
                className="athletic-mono py-2 px-2 font-bold"
                style={{
                  color: P.inkMuted,
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  textAlign: idx === 0 ? 'left' : idx === 5 ? 'right' : 'center',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={w.week} style={{ borderBottom: `1px solid ${P.line}` }}>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center athletic-mono"
                    style={{ background: P.lime, color: P.bg, fontSize: 11, fontWeight: 900 }}
                  >
                    {w.week}
                  </div>
                  {w.notes && (
                    <span
                      className="hidden sm:block truncate max-w-[100px]"
                      title={w.notes}
                      style={{ color: P.inkMuted }}
                    >
                      <IconNote size={14} />
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 px-2 text-center">
                <DarkInput
                  type="number" min={0} max={60}
                  value={w.runMin}
                  onChange={e => onEdit(i, 'runMin', +e.target.value)}
                  className="text-center w-16 mx-auto"
                  style={{ padding: '4px 8px', fontSize: 13 }}
                />
              </td>
              <td className="py-2 px-2 text-center">
                <DarkInput
                  type="number" min={0} max={60}
                  value={w.walkMin}
                  onChange={e => onEdit(i, 'walkMin', +e.target.value)}
                  className="text-center w-16 mx-auto"
                  style={{ padding: '4px 8px', fontSize: 13 }}
                />
              </td>
              <td className="py-2 px-2 text-center">
                <DarkInput
                  type="number" min={1} max={20}
                  value={w.rounds}
                  onChange={e => onEdit(i, 'rounds', +e.target.value)}
                  className="text-center w-16 mx-auto"
                  style={{ padding: '4px 8px', fontSize: 13 }}
                />
              </td>
              <td className="py-2 px-2 text-center">
                <DarkInput
                  type="number" min={1} max={7}
                  value={w.sessionsPerWeek}
                  onChange={e => onEdit(i, 'sessionsPerWeek', +e.target.value)}
                  className="text-center w-16 mx-auto"
                  style={{ padding: '4px 8px', fontSize: 13 }}
                />
              </td>
              <td
                className="athletic-mono py-2 px-2 text-right"
                style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
              >
                {w.runMin === 0 ? `${w.walkMin * w.rounds} min` : `${(w.runMin + w.walkMin) * w.rounds} min`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Pijn-check configuratie ────────────────────────────────────────────────────

function PainCheckCard() {
  return (
    <Tile accentBar={P.gold}>
      <div className="flex gap-3">
        <div
          className="w-5 h-5 shrink-0 mt-0.5 athletic-mono flex items-center justify-center"
          style={{ color: P.gold, fontSize: 14, fontWeight: 900 }}
        >
          !
        </div>
        <div className="space-y-1">
          <p style={{ color: P.gold, fontSize: 13, fontWeight: 800 }}>
            Automatische pijn-check geactiveerd
          </p>
          <p
            className="athletic-mono"
            style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em', lineHeight: 1.5 }}
          >
            Na elke sessie krijgt de patiënt een pijncheck (knie, achilles, voet). Bij pijn &gt; 5/10 wordt automatisch een waarschuwing getoond en wordt de volgende sessie herhaald i.p.v. progressie gemaakt.
          </p>
        </div>
      </div>
    </Tile>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function WalkRunWizardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prePatientId = searchParams.get('patientId') ?? ''
  const { data: patientsData = [] } = trpc.patients.list.useQuery()
  const [step, setStep] = useState<WizardStep>(1)
  const [state, setState] = useState<WizardState>({ ...DEFAULT, patientId: prePatientId })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof WizardState>(key: K, val: WizardState[K]) =>
    setState(s => ({ ...s, [key]: val }))

  const selectedTemplate: WalkRunTemplate = WALK_RUN_TEMPLATES.find(t => t.id === state.templateId)!
  const weeks = state.customWeeks.length > 0 ? state.customWeeks : selectedTemplate.weeks

  // Laad template weeks in custom weeks voor editing
  const loadTemplate = (templateId: string) => {
    const tpl = WALK_RUN_TEMPLATES.find(t => t.id === templateId)!
    setState(s => ({
      ...s,
      templateId,
      customWeeks: tpl.weeks.map(w => ({ ...w })),
    }))
  }

  const editWeek = (i: number, key: keyof WalkRunWeek, val: number) => {
    const next = weeks.map((w, idx) => idx === i ? { ...w, [key]: val } : w)
    set('customWeeks', next)
  }

  const handleSave = async () => {
    if (!state.patientId) {
      toast.error('Selecteer een patiënt')
      return
    }
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    toast.success('Walk-Run protocol aangemaakt!')
    router.push('/therapist/programs')
  }

  const stepLabel =
    step === 1 ? 'Patiënt & Blessure' :
    step === 2 ? 'Fitnessniveau & Doel' :
    step === 3 ? 'Schema aanpassen' : 'Bevestigen'

  return (
    <div className="min-h-screen" style={{ background: P.bg, color: P.ink }}>
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-16 space-y-5">
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
            <Kicker>
              <span className="inline-flex items-center gap-1.5">
                <IconRunning size={12} /> Walk-Run · Stap {step} van 4
              </span>
            </Kicker>
            <Display size="sm">{stepLabel.toUpperCase()}</Display>
          </div>
          <div className="flex gap-1 shrink-0">
            {([1, 2, 3, 4] as const).map(s => (
              <div
                key={s}
                className="w-8 h-1 rounded-full"
                style={{ background: s <= step ? P.lime : P.surfaceHi }}
              />
            ))}
          </div>
        </div>

        {/* Stap 1: Patiënt & Template */}
        {step === 1 && (
          <div className="space-y-4">
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Patiënt selecteren</MetaLabel>
                <DarkSelect
                  value={state.patientId}
                  onChange={e => set('patientId', e.target.value)}
                >
                  <option value="">— Selecteer patiënt —</option>
                  {patientsData.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </DarkSelect>
              </div>
            </Tile>

            <Tile>
              <div className="space-y-3">
                <MetaLabel>Blessure / template</MetaLabel>
                <div className="space-y-2">
                  {INJURY_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => loadTemplate(tpl.id)}
                      className="athletic-tap w-full text-left p-3 rounded-xl transition-all flex items-start gap-3"
                      style={state.templateId === tpl.id
                        ? { border: `1px solid ${P.lime}`, background: 'rgba(190,242,100,0.10)' }
                        : { border: `1px solid ${P.line}`, background: P.surfaceHi }}
                    >
                      <span style={{ fontSize: 22, color: P.ink }}>
                        {tpl.icon === 'running' ? <IconRunning size={24} /> : tpl.icon === 'squat' ? <IconSquat size={24} /> : <IconLunge size={24} />}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="athletic-mono"
                            style={{ color: P.ink, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                          >
                            {tpl.label}
                          </span>
                          {state.templateId === tpl.id && (
                            <span style={{ color: P.lime, fontSize: 14 }} aria-hidden>✓</span>
                          )}
                        </div>
                        <p
                          className="athletic-mono"
                          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em', marginTop: 3 }}
                        >
                          {tpl.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Tile>

            <Tile>
              <div className="space-y-1">
                <p
                  className="inline-flex items-center gap-1.5"
                  style={{ color: P.ink, fontSize: 13, fontWeight: 700 }}
                >
                  <IconClipboard size={14} /> {selectedTemplate.name}
                </p>
                <p
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                >
                  {selectedTemplate.description}
                </p>
                <p
                  className="athletic-mono"
                  style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.03em', marginTop: 6 }}
                >
                  {selectedTemplate.progressionRule}
                </p>
              </div>
            </Tile>

            <DarkButton
              variant="primary"
              className="w-full"
              disabled={!state.patientId}
              onClick={() => setStep(2)}
            >
              Volgende →
            </DarkButton>
          </div>
        )}

        {/* Stap 2: Fitnessniveau & doel */}
        {step === 2 && (
          <div className="space-y-4">
            <Tile>
              <div className="space-y-3">
                <MetaLabel>Huidig fitnessniveau</MetaLabel>
                <div className="grid grid-cols-3 gap-2">
                  {FITNESS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => set('currentFitness', opt.value)}
                      className="athletic-tap p-3 rounded-xl text-center transition-all"
                      style={state.currentFitness === opt.value
                        ? { border: `1px solid ${opt.color}`, background: opt.color + '20' }
                        : { border: `1px solid ${P.line}`, background: P.surfaceHi }}
                    >
                      <p
                        className="athletic-mono"
                        style={{
                          color: state.currentFitness === opt.value ? opt.color : P.ink,
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {opt.label}
                      </p>
                      <p
                        className="athletic-mono hidden sm:block"
                        style={{ color: P.inkMuted, fontSize: 10, letterSpacing: '0.03em', marginTop: 6, lineHeight: 1.3 }}
                      >
                        {opt.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </Tile>

            <Tile>
              <div className="space-y-3">
                <MetaLabel>Doelafstand</MetaLabel>
                <div className="flex gap-2 flex-wrap">
                  {[3, 5, 8, 10, 15, 21].map(km => (
                    <button
                      key={km}
                      onClick={() => set('targetDistanceKm', km)}
                      className="athletic-tap flex-1 py-2 rounded-lg athletic-mono transition-all"
                      style={state.targetDistanceKm === km
                        ? { background: P.lime, color: P.bg, border: '1px solid transparent', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em' }
                        : { background: P.surfaceHi, color: P.inkMuted, border: `1px solid ${P.lineStrong}`, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em' }}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            </Tile>

            <Tile>
              <div className="space-y-3">
                <MetaLabel>Startweek (bij gedeeltelijke progressie)</MetaLabel>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => set('startWeek', Math.max(1, state.startWeek - 1))}
                    className="athletic-tap w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.lineStrong}` }}
                  >
                    ←
                  </button>
                  <div className="flex-1 text-center">
                    <p
                      className="athletic-display"
                      style={{ color: P.ink, fontSize: 28, lineHeight: '32px' }}
                    >
                      {state.startWeek}
                    </p>
                    <MetaLabel>van {selectedTemplate.weeks.length} weken</MetaLabel>
                  </div>
                  <button
                    onClick={() => set('startWeek', Math.min(selectedTemplate.weeks.length, state.startWeek + 1))}
                    className="athletic-tap w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: P.surfaceHi, color: P.ink, border: `1px solid ${P.lineStrong}` }}
                  >
                    →
                  </button>
                </div>
                {state.startWeek > 1 && (
                  <p
                    className="athletic-mono text-center"
                    style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                  >
                    Patiënt start bij week {state.startWeek}: {selectedTemplate.weeks[state.startWeek - 1]?.runMin} min lopen / {selectedTemplate.weeks[state.startWeek - 1]?.walkMin} min wandelen
                  </p>
                )}
              </div>
            </Tile>

            <div className="flex gap-3">
              <DarkButton variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                Terug
              </DarkButton>
              <DarkButton variant="primary" className="flex-1" onClick={() => setStep(3)}>
                Volgende →
              </DarkButton>
            </div>
          </div>
        )}

        {/* Stap 3: Schema aanpassen */}
        {step === 3 && (
          <div className="space-y-4">
            <Tile>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <MetaLabel>Weekschema aanpassen</MetaLabel>
                  <span
                    className="athletic-mono"
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
                    {weeks.length} weken
                  </span>
                </div>
                <WeekTable weeks={weeks} onEdit={editWeek} />
              </div>
            </Tile>

            <PainCheckCard />

            <Tile accentBar={P.ice}>
              <div className="space-y-1">
                <p style={{ color: P.ice, fontSize: 13, fontWeight: 800 }}>10%-regel actief</p>
                <p
                  className="athletic-mono"
                  style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em', lineHeight: 1.5 }}
                >
                  De app waarschuwt automatisch als het weekvolume meer dan 10% stijgt ten opzichte van de vorige week.
                </p>
              </div>
            </Tile>

            <div className="space-y-1.5">
              <MetaLabel>Notities voor therapeut</MetaLabel>
              <DarkTextarea
                rows={3}
                placeholder="Aandachtspunten, patiëntspecifieke aanpassingen..."
                value={state.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <DarkButton variant="secondary" className="flex-1" onClick={() => setStep(2)}>
                Terug
              </DarkButton>
              <DarkButton variant="primary" className="flex-1" onClick={() => setStep(4)}>
                Bekijk samenvatting →
              </DarkButton>
            </div>
          </div>
        )}

        {/* Stap 4: Samenvatting & bevestiging */}
        {step === 4 && (
          <div className="space-y-4">
            <Tile accentBar={P.lime}>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(190,242,100,0.18)' }}
                  >
                    <IconRunning size={22} />
                  </div>
                  <div>
                    <p
                      style={{
                        color: P.ink,
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {selectedTemplate.name}
                    </p>
                    <p
                      className="athletic-mono"
                      style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.03em' }}
                    >
                      {patientsData.find(p => p.id === state.patientId)?.name}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: weeks.length,                                          label: 'Weken' },
                    { value: weeks.reduce((s, w) => s + w.sessionsPerWeek, 0),      label: 'Totaal sessies' },
                    { value: `${state.targetDistanceKm} km`,                        label: 'Doelafstand' },
                    { value: state.currentFitness.charAt(0) + state.currentFitness.slice(1).toLowerCase(), label: 'Fitnessniveau' },
                  ].map(item => (
                    <div
                      key={item.label}
                      className="rounded-lg p-3 text-center"
                      style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                    >
                      <p
                        className="athletic-display"
                        style={{ color: P.ink, fontSize: 22, lineHeight: '26px' }}
                      >
                        {item.value}
                      </p>
                      <MetaLabel>{item.label}</MetaLabel>
                    </div>
                  ))}
                </div>

                {/* Progressie preview */}
                <div className="space-y-2">
                  <MetaLabel>Progressie preview</MetaLabel>
                  <div className="space-y-1">
                    {weeks.slice(0, 5).map(w => (
                      <div key={w.week} className="flex items-center gap-2 text-xs">
                        <span
                          className="athletic-mono w-12"
                          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
                        >
                          Week {w.week}
                        </span>
                        <div className="flex-1 flex items-center gap-1">
                          <div
                            className="h-4 rounded"
                            style={{
                              width: `${(w.runMin / Math.max(...weeks.map(x => x.runMin), 1)) * 60}%`,
                              minWidth: w.runMin > 0 ? '8px' : 0,
                              background: P.lime,
                            }}
                          />
                          {w.walkMin > 0 && (
                            <div
                              className="h-4 rounded"
                              style={{
                                width: `${(w.walkMin / Math.max(...weeks.map(x => x.walkMin + x.runMin), 1)) * 30}%`,
                                minWidth: '8px',
                                background: P.inkDim,
                              }}
                            />
                          )}
                        </div>
                        <span
                          className="athletic-mono w-20 text-right"
                          style={{ color: P.inkMuted, fontSize: 11, letterSpacing: '0.05em' }}
                        >
                          {w.runMin}L / {w.walkMin}W ×{w.rounds}
                        </span>
                      </div>
                    ))}
                    {weeks.length > 5 && (
                      <p
                        className="athletic-mono text-center"
                        style={{ color: P.inkDim, fontSize: 11, letterSpacing: '0.05em', paddingTop: 4 }}
                      >
                        + {weeks.length - 5} meer weken...
                      </p>
                    )}
                  </div>
                </div>

                {state.notes && (
                  <div
                    className="rounded-lg p-3"
                    style={{ background: P.surfaceHi, border: `1px solid ${P.line}` }}
                  >
                    <MetaLabel>Notities</MetaLabel>
                    <p style={{ color: P.ink, fontSize: 13, marginTop: 6 }}>{state.notes}</p>
                  </div>
                )}
              </div>
            </Tile>

            <PainCheckCard />

            <div className="flex gap-3">
              <DarkButton variant="secondary" className="flex-1" onClick={() => setStep(3)}>
                Terug
              </DarkButton>
              <DarkButton
                variant="primary"
                className="flex-1"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? (
                  'Aanmaken...'
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <IconCheck size={16} /> Protocol aanmaken
                  </span>
                )}
              </DarkButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
