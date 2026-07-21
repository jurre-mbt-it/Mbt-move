'use client'

/**
 * Plan-editor: een schema bouwen zonder dat er een atleet aan hangt.
 *
 * Een trainingsplan bestaat uit sjabloon-weken (WeekSchedule met
 * isTemplate = true en een planTemplateId). Die hebben bewust géén datums, dus
 * de maandkalender van de weekplanner past er niet op: hier staan de weken
 * genummerd, week 1 tot en met N. Toewijzen aan atleten gebeurt daarna vanaf
 * het plannenoverzicht, en dat is een kopie.
 *
 * Zie docs/plan-coach-role-20260721.md.
 */

import { use, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { usePortal } from '@/lib/portal'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkSelect,
  Display,
  Kicker,
  MetaLabel,
  P,
  SkeletonList,
  Tile,
} from '@/components/dark-ui'

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
const DAY_SHORT = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

const CATEGORIES = [
  { value: 'STRENGTH', label: 'Kracht' },
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'MOBILITY', label: 'Mobiliteit' },
  { value: 'PLYOMETRICS', label: 'Plyometrie' },
  { value: 'STABILITY', label: 'Stabiliteit' },
] as const

type AddTarget = { dayId: string; weekNumber: number; dayOfWeek: number }

export default function PlanEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = use(params)
  const portal = usePortal()
  const router = useRouter()
  const utils = trpc.useUtils()
  const [addFor, setAddFor] = useState<AddTarget | null>(null)

  const { data: plans } = trpc.planTemplates.list.useQuery()
  const plan = useMemo(() => (plans ?? []).find((p) => p.id === planId) ?? null, [plans, planId])

  const { data: weeks = [], isLoading } = trpc.weekSchedules.listWithItems.useQuery(
    { planTemplateId: planId },
    { staleTime: 10_000 },
  )

  const removeItem = trpc.weekSchedules.removeItem.useMutation({
    onSuccess: () => {
      utils.weekSchedules.listWithItems.invalidate({ planTemplateId: planId })
      utils.planTemplates.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const sorted = useMemo(
    () => [...weeks].sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(`${portal.base}/plans`)}
            className="athletic-tap mb-1 inline-flex items-center gap-1 text-xs"
            style={{ color: P.inkMuted }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Trainingsplannen
          </button>
          <Kicker>Plan bewerken</Kicker>
          <Display>{plan?.name ?? 'Plan'}</Display>
          <MetaLabel>
            {sorted.length} {sorted.length === 1 ? 'week' : 'weken'} · nog niet aan een atleet
            gekoppeld
          </MetaLabel>
        </div>
        <DarkButton variant="primary" onClick={() => router.push(`${portal.base}/plans`)}>
          Naar atleet sturen
        </DarkButton>
      </div>

      {isLoading ? (
        <SkeletonList count={3} />
      ) : sorted.length === 0 ? (
        <Tile>
          <p style={{ color: P.inkMuted, fontSize: 14 }}>
            Dit plan heeft nog geen weken. Maak een nieuw plan aan vanaf het plannenoverzicht.
          </p>
        </Tile>
      ) : (
        sorted.map((week) => (
          <Tile key={week.id}>
            <Kicker>Week {week.weekNumber}</Kicker>
            <div className="mt-3 grid gap-2 md:grid-cols-7">
              {[...week.days]
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                .map((day) => (
                  <div
                    key={day.id}
                    className="rounded-lg p-2"
                    style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, minHeight: 96 }}
                  >
                    <p
                      className="athletic-mono mb-1.5"
                      style={{ color: P.inkDim, fontSize: 9, letterSpacing: '0.14em' }}
                    >
                      {DAY_SHORT[day.dayOfWeek]}
                    </p>

                    {day.items.map((item) => (
                      <div
                        key={item.id}
                        className="mb-1 flex items-start gap-1 rounded px-1.5 py-1"
                        style={{ background: P.surfaceHi }}
                      >
                        <span
                          className="min-w-0 flex-1 truncate"
                          style={{ color: P.ink, fontSize: 11 }}
                          title={item.program?.name ?? item.quickName ?? 'Workout'}
                        >
                          {item.program?.name ?? item.quickName ?? 'Workout'}
                        </span>
                        <button
                          type="button"
                          aria-label="Verwijderen"
                          onClick={() => removeItem.mutate({ id: item.id })}
                          className="athletic-tap shrink-0"
                          style={{ color: P.inkDim }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setAddFor({
                          dayId: day.id,
                          weekNumber: week.weekNumber,
                          dayOfWeek: day.dayOfWeek,
                        })
                      }
                      className="athletic-tap mt-1 inline-flex items-center gap-1"
                      style={{ color: P.brand, fontSize: 11 }}
                    >
                      <Plus className="h-3 w-3" /> Toevoegen
                    </button>
                  </div>
                ))}
            </div>
          </Tile>
        ))
      )}

      {addFor && (
        <AddItemDialog
          target={addFor}
          planId={planId}
          onClose={() => setAddFor(null)}
        />
      )}
    </div>
  )
}

/** Programma of losse workout op één dag van het sjabloon. */
function AddItemDialog({
  target,
  planId,
  onClose,
}: {
  target: AddTarget
  planId: string
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [mode, setMode] = useState<'quick' | 'program'>('quick')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('STRENGTH')
  const [minutes, setMinutes] = useState(45)
  const [programId, setProgramId] = useState('')

  // Cast naar de minimale vorm: het volle programma-type is een diep geneste
  // union waar TS op .map afhaakt (TS2589), zie AGENTS.md.
  const { data: programsRaw = [] } = trpc.programs.list.useQuery({ isTemplate: true })
  const programs = programsRaw as unknown as { id: string; name: string }[]

  const add = trpc.weekSchedules.addItem.useMutation({
    onSuccess: () => {
      utils.weekSchedules.listWithItems.invalidate({ planTemplateId: planId })
      utils.planTemplates.list.invalidate()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  function submit() {
    if (mode === 'program') {
      if (!programId) return
      add.mutate({ kind: 'program', dayId: target.dayId, programId })
    } else {
      if (!name.trim()) return
      add.mutate({
        kind: 'quick',
        dayId: target.dayId,
        quickCategory: category,
        quickName: name.trim(),
        quickDurationSec: Math.max(1, Math.round(minutes)) * 60,
      })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Week {target.weekNumber}, {DAY_NAMES[target.dayOfWeek].toLowerCase()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {(
              [
                ['quick', 'Losse workout'],
                ['program', 'Programma'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="athletic-tap rounded-lg px-3 py-1.5 text-xs"
                style={{
                  background: mode === m ? P.surfaceHi : 'transparent',
                  border: `1px solid ${mode === m ? P.brand : P.lineStrong}`,
                  color: mode === m ? P.ink : P.inkMuted,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'quick' ? (
            <>
              <div>
                <MetaLabel>Naam</MetaLabel>
                <DarkInput
                  autoFocus
                  placeholder="Bijvoorbeeld: Duurloop rustig"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MetaLabel>Soort</MetaLabel>
                  <DarkSelect
                    value={category}
                    onChange={(e) => setCategory(e.target.value as typeof category)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </DarkSelect>
                </div>
                <div>
                  <MetaLabel>Duur (minuten)</MetaLabel>
                  <DarkInput
                    type="number"
                    min={1}
                    max={600}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <MetaLabel>Programma</MetaLabel>
              <DarkSelect value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">Kies een programma</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </DarkSelect>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <DarkButton variant="secondary" onClick={onClose}>
              Annuleren
            </DarkButton>
            <DarkButton
              variant="primary"
              onClick={submit}
              disabled={add.isPending || (mode === 'program' ? !programId : !name.trim())}
              loading={add.isPending}
            >
              Toevoegen
            </DarkButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
