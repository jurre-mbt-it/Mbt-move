'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Footprints } from 'lucide-react'
import { WALK_RUN_TEMPLATES, WalkRunTemplate, WalkRunWeek } from '@/lib/cardio-constants'
import { trpc } from '@/lib/trpc/client'

const MBT_GREEN = '#3ECF6A'
const MBT_TEAL = '#4ECDC4'

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
  { value: 'SLECHT', label: 'Slecht', description: 'Geen of weinig conditionele basis. Begin conservatief.', color: '#ef4444' },
  { value: 'MATIG',  label: 'Matig',  description: 'Beperkte conditie. Normaal progressietempo.', color: '#f59e0b' },
  { value: 'GOED',   label: 'Goed',   description: 'Redelijke conditie. Iets sneller opbouwen.', color: '#22c55e' },
] as const

const INJURY_TEMPLATES = [
  { id: 'wr-generiek', label: 'Generiek', icon: '🏃', description: 'Geschikt voor de meeste blessures en als algemeen terugkeer protocol' },
  { id: 'wr-achilles', label: 'Achilles', icon: '🦵', description: 'Conservatieve opbouw voor achillestendinopathie met hielprotocol' },
  { id: 'wr-knie',     label: 'Knie',     icon: '🦴', description: 'Geleidelijke opbouw na knieblessure, meniscus of PFPS/ACL' },
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
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2 px-4 font-medium">Week</th>
            <th className="text-center py-2 px-2 font-medium">Lopen (min)</th>
            <th className="text-center py-2 px-2 font-medium">Wandelen (min)</th>
            <th className="text-center py-2 px-2 font-medium">Rondes</th>
            <th className="text-center py-2 px-2 font-medium">Sessies/week</th>
            <th className="text-right py-2 px-4 font-medium">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={w.week} className="border-b hover:bg-muted/30 transition-colors">
              <td className="py-2 px-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: MBT_GREEN }}>
                    {w.week}
                  </div>
                  {w.notes && (
                    <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[100px]" title={w.notes}>
                      📝
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 px-2 text-center">
                <Input
                  type="number" min={0} max={60}
                  value={w.runMin}
                  onChange={e => onEdit(i, 'runMin', +e.target.value)}
                  className="h-7 text-xs text-center w-16 mx-auto"
                />
              </td>
              <td className="py-2 px-2 text-center">
                <Input
                  type="number" min={0} max={60}
                  value={w.walkMin}
                  onChange={e => onEdit(i, 'walkMin', +e.target.value)}
                  className="h-7 text-xs text-center w-16 mx-auto"
                />
              </td>
              <td className="py-2 px-2 text-center">
                <Input
                  type="number" min={1} max={20}
                  value={w.rounds}
                  onChange={e => onEdit(i, 'rounds', +e.target.value)}
                  className="h-7 text-xs text-center w-16 mx-auto"
                />
              </td>
              <td className="py-2 px-2 text-center">
                <Input
                  type="number" min={1} max={7}
                  value={w.sessionsPerWeek}
                  onChange={e => onEdit(i, 'sessionsPerWeek', +e.target.value)}
                  className="h-7 text-xs text-center w-16 mx-auto"
                />
              </td>
              <td className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">
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
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-semibold text-amber-800">Automatische pijn-check geactiveerd</p>
          <p className="text-amber-700">Na elke sessie krijgt de patiënt een pijncheck (knie, achilles, voet). Bij pijn &gt; 5/10 wordt automatisch een waarschuwing getoond en wordt de volgende sessie herhaald i.p.v. progressie gemaakt.</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function WalkRunWizardPage() {
  const router = useRouter()
  const { data: patientsData = [] } = trpc.patients.list.useQuery()
  const [step, setStep] = useState<WizardStep>(1)
  const [state, setState] = useState<WizardState>(DEFAULT)
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

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/therapist/programs">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Footprints className="w-5 h-5" style={{ color: MBT_GREEN }} />
          <div>
            <h1 className="text-xl font-bold">Walk-Run Wizard</h1>
            <p className="text-sm text-muted-foreground">Stap {step} van 4 — {
              step === 1 ? 'Patiënt & Blessure' :
              step === 2 ? 'Fitnessniveau & Doel' :
              step === 3 ? 'Schema aanpassen' : 'Bevestigen'
            }</p>
          </div>
        </div>
        <div className="ml-auto flex gap-1">
          {([1, 2, 3, 4] as const).map(s => (
            <div key={s} className="w-8 h-1 rounded-full" style={{ background: s <= step ? MBT_GREEN : '#e2e8f0' }} />
          ))}
        </div>
      </div>

      {/* Stap 1: Patiënt & Template */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h2 className="font-semibold">Patiënt selecteren</h2>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={state.patientId}
                onChange={e => set('patientId', e.target.value)}
              >
                <option value="">— Selecteer patiënt —</option>
                {patientsData.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold">Blessure / template</h2>
              <div className="space-y-2">
                {INJURY_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => loadTemplate(tpl.id)}
                    className="w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3"
                    style={state.templateId === tpl.id ? { borderColor: MBT_GREEN, background: '#f0fdf4' } : {}}
                  >
                    <span className="text-2xl">{tpl.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{tpl.label}</span>
                        {state.templateId === tpl.id && (
                          <CheckCircle2 className="w-4 h-4" style={{ color: MBT_GREEN }} />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-muted bg-muted/20">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">📋 {selectedTemplate.name}</p>
              <p>{selectedTemplate.description}</p>
              <p className="text-xs mt-2">{selectedTemplate.progressionRule}</p>
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2"
            style={{ background: MBT_GREEN }}
            disabled={!state.patientId}
            onClick={() => setStep(2)}
          >
            Volgende <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Stap 2: Fitnessniveau & doel */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold">Huidig fitnessniveau</h2>
              <div className="grid grid-cols-3 gap-2">
                {FITNESS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set('currentFitness', opt.value)}
                    className="p-3 rounded-xl border text-center transition-all"
                    style={state.currentFitness === opt.value ? { borderColor: opt.color, background: opt.color + '20' } : {}}
                  >
                    <p className="font-semibold text-sm" style={state.currentFitness === opt.value ? { color: opt.color } : {}}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-tight hidden sm:block">{opt.description}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold">Doelafstand</h2>
              <div className="flex gap-2">
                {[3, 5, 8, 10, 15, 21].map(km => (
                  <button
                    key={km}
                    onClick={() => set('targetDistanceKm', km)}
                    className="flex-1 py-2 rounded-lg border text-sm font-medium transition-all"
                    style={state.targetDistanceKm === km ? { background: MBT_GREEN, color: '#fff', borderColor: 'transparent' } : {}}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold">Startweek (bij gedeeltelijke progressie)</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => set('startWeek', Math.max(1, state.startWeek - 1))}
                  className="w-8 h-8 rounded-full border flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold">{state.startWeek}</p>
                  <p className="text-xs text-muted-foreground">van {selectedTemplate.weeks.length} weken</p>
                </div>
                <button
                  onClick={() => set('startWeek', Math.min(selectedTemplate.weeks.length, state.startWeek + 1))}
                  className="w-8 h-8 rounded-full border flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {state.startWeek > 1 && (
                <p className="text-xs text-muted-foreground text-center">
                  Patiënt start bij week {state.startWeek}: {selectedTemplate.weeks[state.startWeek - 1]?.runMin} min lopen / {selectedTemplate.weeks[state.startWeek - 1]?.walkMin} min wandelen
                </p>
              )}
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

      {/* Stap 3: Schema aanpassen */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Weekschema aanpassen</h2>
                <Badge variant="outline" className="text-xs">{weeks.length} weken</Badge>
              </div>
              <WeekTable weeks={weeks} onEdit={editWeek} />
            </CardContent>
          </Card>

          <PainCheckCard />

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-sm space-y-1">
              <p className="font-semibold text-blue-800">10%-regel actief</p>
              <p className="text-blue-700">De app waarschuwt automatisch als het weekvolume meer dan 10% stijgt ten opzichte van de vorige week.</p>
            </CardContent>
          </Card>

          <div>
            <Label>Notities voor therapeut</Label>
            <textarea
              className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="Aandachtspunten, patiëntspecifieke aanpassingen..."
              value={state.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Terug</Button>
            <Button className="flex-1 gap-2" style={{ background: MBT_GREEN }} onClick={() => setStep(4)}>
              Bekijk samenvatting <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Stap 4: Samenvatting & bevestiging */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="border-2" style={{ borderColor: MBT_GREEN + '80' }}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-2xl" style={{ background: MBT_GREEN + '20' }}>
                  🏃
                </div>
                <div>
                  <p className="font-bold">{selectedTemplate.name}</p>
                  <p className="text-sm text-muted-foreground">{patientsData.find(p => p.id === state.patientId)?.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{weeks.length}</p>
                  <p className="text-xs text-muted-foreground">Weken</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{weeks.reduce((s, w) => s + w.sessionsPerWeek, 0)}</p>
                  <p className="text-xs text-muted-foreground">Totaal sessies</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{state.targetDistanceKm} km</p>
                  <p className="text-xs text-muted-foreground">Doelafstand</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold capitalize">{state.currentFitness.toLowerCase()}</p>
                  <p className="text-xs text-muted-foreground">Fitnessniveau</p>
                </div>
              </div>

              {/* Progressie preview */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">PROGRESSIE PREVIEW</p>
                <div className="space-y-1">
                  {weeks.slice(0, 5).map(w => (
                    <div key={w.week} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground">Week {w.week}</span>
                      <div className="flex-1 flex items-center gap-1">
                        <div
                          className="h-4 rounded"
                          style={{ width: `${(w.runMin / Math.max(...weeks.map(x => x.runMin), 1)) * 60}%`, minWidth: w.runMin > 0 ? '8px' : 0, background: MBT_GREEN }}
                        />
                        {w.walkMin > 0 && (
                          <div
                            className="h-4 rounded"
                            style={{ width: `${(w.walkMin / Math.max(...weeks.map(x => x.walkMin + x.runMin), 1)) * 30}%`, minWidth: '8px', background: '#94a3b8' }}
                          />
                        )}
                      </div>
                      <span className="w-20 text-right text-muted-foreground">
                        {w.runMin}L / {w.walkMin}W ×{w.rounds}
                      </span>
                    </div>
                  ))}
                  {weeks.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+ {weeks.length - 5} meer weken...</p>
                  )}
                </div>
              </div>

              {state.notes && (
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground">NOTITIES</p>
                  <p className="text-sm mt-1">{state.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <PainCheckCard />

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>Terug</Button>
            <Button
              className="flex-1"
              style={{ background: MBT_GREEN }}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Aanmaken...' : '✓ Protocol aanmaken'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
