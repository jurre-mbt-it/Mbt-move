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
import { CARDIO_ACTIVITIES, type CardioActivityKey } from '@/lib/cardio-constants'
import { readWorkout, type StructuredCardio } from '@/lib/cardio-workout'
import { cardioEstimate } from '@/lib/planned-load'
import { CardioWorkoutBuilder } from '@/components/week-planner/CardioWorkoutBuilder'
import {
  QuickExerciseBuilder,
  type Category,
  type ItemExercise,
} from '@/components/week-planner/QuickExerciseBuilder'
import { DeletePlanDialog } from '@/components/week-planner/PlanTemplateDialogs'
import {
  DarkButton,
  DarkDialog as Dialog,
  DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader,
  DarkDialogTitle as DialogTitle,
  DarkInput,
  DarkSelect,
  DarkTextarea,
  Display,
  Kicker,
  MetaLabel,
  P,
  SkeletonList,
  Tile,
} from '@/components/dark-ui'

/** Het item zoals `listWithItems` het teruggeeft — genoeg voor de editor. */
type PlanItem = {
  id: string
  quickName: string | null
  quickCategory: string | null
  quickActivity: string | null
  quickDurationSec: number | null
  plannedDurationSec: number | null
  plannedRpe: number | null
  notes: string | null
  program: { name: string } | null
}

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
const DAY_SHORT = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

const CATEGORIES = [
  { value: 'STRENGTH', label: 'Kracht' },
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'MOBILITY', label: 'Mobiliteit' },
  { value: 'PLYOMETRICS', label: 'Plyometrie' },
  { value: 'STABILITY', label: 'Stabiliteit' },
] as const

/**
 * Bij cardio bepaalt de soort activiteit wat het is: fietsen, roeien, zwemmen.
 * Dezelfde lijst als in de weekplanner, zodat een plan-item en een gepland
 * item in de kalender hetzelfde heten. "Overig" is de plek voor mixed cardio
 * of iets wat er niet tussen staat; de naam die je zelf typt blijft leidend.
 */
const CARDIO_ACTIVITY_OPTIONS = (
  Object.entries(CARDIO_ACTIVITIES) as [CardioActivityKey, { label: string }][]
).map(([value, meta]) => ({ value, label: meta.label }))

type AddTarget = { dayId: string; weekNumber: number; dayOfWeek: number }

export default function PlanEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: planId } = use(params)
  const portal = usePortal()
  const router = useRouter()
  const utils = trpc.useUtils()
  const [addFor, setAddFor] = useState<AddTarget | null>(null)
  const [editFor, setEditFor] = useState<PlanItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
        <div className="flex flex-wrap gap-2">
          <DarkButton variant="primary" onClick={() => router.push(`${portal.base}/plans`)}>
            Naar atleet sturen
          </DarkButton>
          {plan?.canEdit && (
            <DarkButton
              variant="ghost"
              style={{ color: P.inkMuted }}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Verwijderen
            </DarkButton>
          )}
        </div>
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
                        {/* Klikken opent de inhoud. Zonder dit kon je in een plan
                            wel een workout neerzetten, maar er verder niets mee. */}
                        <button
                          type="button"
                          onClick={() => setEditFor(item)}
                          className="athletic-tap min-w-0 flex-1 truncate text-left"
                          style={{ color: P.ink, fontSize: 11 }}
                          title={`${item.program?.name ?? item.quickName ?? 'Workout'}, klik om te bewerken`}
                        >
                          {item.program?.name ?? item.quickName ?? 'Workout'}
                        </button>
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

      {editFor && (
        <PlanItemDialog item={editFor} planId={planId} onClose={() => setEditFor(null)} />
      )}

      {addFor && (
        <AddItemDialog
          target={addFor}
          planId={planId}
          onClose={() => setAddFor(null)}
        />
      )}

      {deleteOpen && plan && (
        <DeletePlanDialog
          plan={{ id: plan.id, name: plan.name, weeks: plan.weeks }}
          onClose={() => setDeleteOpen(false)}
          // Het plan bestaat niet meer; hier blijven staan levert een lege
          // editor op.
          onDeleted={() => router.push(`${portal.base}/plans`)}
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
  const [activity, setActivity] = useState<CardioActivityKey>('RUNNING')
  // Zie de opmerking bij het weken-veld: tijdens het typen niet klemmen,
  // anders kun je het veld niet leegmaken om een ander getal in te tikken.
  const [minutesText, setMinutesText] = useState('45')
  const minutes = Math.min(600, Math.max(1, Number(minutesText) || 1))
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
        // Alleen zinvol bij cardio; de server negeert 'm bij de rest.
        ...(category === 'CARDIO' ? { quickActivity: activity } : {}),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
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
                    onChange={(e) => {
                      const next = e.target.value as typeof category
                      setCategory(next)
                      // Naam nog leeg? Vul 'm vast met de activiteit, zodat je
                      // niet zelf "Fietsen" hoeft te typen om iets te zien staan.
                      if (next === 'CARDIO' && !name.trim()) {
                        setName(CARDIO_ACTIVITIES[activity].label)
                      }
                    }}
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
                    value={minutesText}
                    onChange={(e) => setMinutesText(e.target.value)}
                    onBlur={() => setMinutesText(String(minutes))}
                  />
                </div>
              </div>

              {category === 'CARDIO' && (
                <div>
                  <MetaLabel>Activiteit</MetaLabel>
                  <DarkSelect
                    value={activity}
                    onChange={(e) => {
                      const next = e.target.value as CardioActivityKey
                      const wasDefaultName = name.trim() === CARDIO_ACTIVITIES[activity].label
                      setActivity(next)
                      if (!name.trim() || wasDefaultName) setName(CARDIO_ACTIVITIES[next].label)
                    }}
                  >
                    {CARDIO_ACTIVITY_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </DarkSelect>
                  <p className="mt-1.5 text-xs" style={{ color: P.inkDim, lineHeight: 1.5 }}>
                    Staat het er niet tussen? Kies Overig en zet zelf de naam erbij,
                    bijvoorbeeld mixed cardio of een circuit.
                  </p>
                </div>
              )}
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

/**
 * Eén item van een sjabloon-week bewerken. Een sjabloon-item is precies
 * hetzelfde soort ding als een item in de week van een patiënt, dus het krijgt
 * dezelfde bediening: naam, geplande belasting, notitie, en daaronder de
 * inhoud — oefeningen, of de blokken van een cardio-workout.
 *
 * De server kon dit allang: `updateItem`, `setItemExercises` en `setItemCardio`
 * werken op elk item, en `listItemContents` accepteert een planTemplateId.
 * Alleen de bediening ontbrak, waardoor je in een plan wel een workout kon
 * neerzetten maar er verder niets mee kon.
 */
function PlanItemDialog({
  item, planId, onClose,
}: {
  item: {
    id: string
    quickName: string | null
    quickCategory: string | null
    quickActivity: string | null
    quickDurationSec: number | null
    plannedDurationSec: number | null
    plannedRpe: number | null
    notes: string | null
    program: { name: string } | null
  }
  planId: string
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const isProgram = !!item.program
  const category = (item.quickCategory ?? 'STRENGTH') as Category
  const isCardio = category === 'CARDIO'

  const [naam, setNaam] = useState(item.quickName ?? '')
  // `plannedDurationSec` is het getal waar de belasting mee rekent; valt terug
  // op wat er bij het toevoegen is ingetikt.
  const [minuten, setMinuten] = useState(() => {
    const sec = item.plannedDurationSec ?? item.quickDurationSec
    return sec ? String(Math.round(sec / 60)) : ''
  })
  const [rpe, setRpe] = useState(item.plannedRpe != null ? String(item.plannedRpe) : '')
  const [notitie, setNotitie] = useState(item.notes ?? '')
  const [cardioOpen, setCardioOpen] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contents = [], isFetched: contentsLoaded } = (trpc.weekSchedules.listItemContents.useQuery as any)(
    { patientId: '', planTemplateId: planId },
    { staleTime: 10_000 },
  ) as { data: Array<{ itemId: string; exercises: ItemExercise[]; cardioParams: unknown }>; isFetched: boolean }
  // De server geeft `itemId` terug, geen `id` — matchen op `id` liet `inhoud`
  // altijd undefined, waardoor de builder leeg opende en opslaan bestaande
  // oefeningen/cardio wiste (setItemExercises is replace-all).
  const inhoud = contents.find((c) => c.itemId === item.id)
  const workout = readWorkout(inhoud?.cardioParams)
  /**
   * Staat er inhoud, dan leidt de server de geplande duur daaruit af en
   * overschrijft hij wat je hier intypt (`setItemExercises` en `setItemCardio`
   * doen dat allebei). Een invulveld tonen dat stil wordt weggeschreven is
   * misleidend, dus dan tonen we het afgeleide getal in plaats daarvan.
   */
  const heeftInhoud = (inhoud?.exercises?.length ?? 0) > 0 || !!workout
  /**
   * Cardio op afstand levert geen duur uit de blokken. Zonder dit stond hier
   * een streepje terwijl de weekbalk wél een getal toonde — twee schermen die
   * elkaar tegenspreken. Zie cardioEstimate in lib/planned-load.
   */
  const geschatteMinuten = minuten
    ? ''
    : (() => {
        const est = cardioEstimate(inhoud?.cardioParams)
        return est ? String(Math.round(est.durationSec / 60)) : ''
      })()

  const ververs = () => {
    utils.weekSchedules.listWithItems.invalidate({ planTemplateId: planId })
    utils.weekSchedules.listItemContents.invalidate()
  }

  const update = trpc.weekSchedules.updateItem.useMutation({
    onSuccess: () => { ververs(); toast.success('Opgeslagen') },
    onError: (e) => toast.error(e.message),
  })
  const setExercises = trpc.weekSchedules.setItemExercises.useMutation({
    onSuccess: () => { ververs(); toast.success('Oefeningen opgeslagen') },
    onError: (e) => toast.error(e.message),
  })
  const setCardio = trpc.weekSchedules.setItemCardio.useMutation({
    onSuccess: () => { ververs(); setCardioOpen(false); toast.success('Cardio opgeslagen') },
    onError: (e) => toast.error(e.message),
  })

  if (cardioOpen) {
    return (
      <CardioWorkoutBuilder
        // Zelfde reden als bij de QuickExerciseBuilder: remount zodra de
        // inhoud geladen is, anders opent de bouwer met lege blokken.
        key={`${item.id}:${contentsLoaded ? 'c' : 'l'}`}
        initial={workout}
        activity={(item.quickActivity as CardioActivityKey) ?? 'RUNNING'}
        itemName={naam || 'Cardio'}
        saving={setCardio.isPending}
        onClose={() => setCardioOpen(false)}
        onSave={async (w: StructuredCardio) => {
          await setCardio.mutateAsync({
            itemId: item.id,
            cardioParams: w as unknown as Record<string, unknown>,
          })
        }}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent aria-describedby={undefined} className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.program?.name ?? (naam || 'Workout')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isProgram ? (
            <p style={{ color: P.inkMuted, fontSize: 13 }}>
              Dit item verwijst naar een programma. De inhoud bewerk je in dat programma;
              hier zet je alleen de geplande belasting en een notitie.
            </p>
          ) : (
            <div className="space-y-1.5">
              <MetaLabel>Naam</MetaLabel>
              <DarkInput value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam van de workout" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <MetaLabel>Duur (min)</MetaLabel>
              {heeftInhoud ? (
                <p style={{ color: P.ink, fontSize: 14, paddingTop: 8 }}>
                  {minuten || geschatteMinuten || '—'}{' '}
                  <span style={{ color: P.inkDim, fontSize: 11 }}>
                    {minuten ? 'uit de inhoud' : geschatteMinuten ? 'geschat uit de afstand' : 'uit de inhoud'}
                  </span>
                </p>
              ) : (
                <DarkInput
                  type="number" min={1} max={600} value={minuten}
                  onChange={(e) => setMinuten(e.target.value)} placeholder="45"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <MetaLabel>RPE (1-10)</MetaLabel>
              <DarkInput
                type="number" min={1} max={10} value={rpe}
                onChange={(e) => setRpe(e.target.value)} placeholder="7"
              />
            </div>
          </div>
          <p style={{ color: P.inkDim, fontSize: 11 }}>
            {heeftInhoud
              ? 'Duur × RPE is de geplande belasting in AU. De duur volgt uit de oefeningen of de cardio-blokken; verwijder je die, dan kun je hem weer zelf zetten.'
              : 'Duur × RPE is de geplande belasting in AU. Zet je er inhoud in, dan neemt die de duur over.'}
          </p>

          <div className="space-y-1.5">
            <MetaLabel>Notitie</MetaLabel>
            <DarkTextarea
              value={notitie} rows={3}
              onChange={(e) => setNotitie(e.target.value)}
              placeholder="Aandachtspunten voor deze training"
            />
          </div>

          <DarkButton
            variant="primary" size="sm" disabled={update.isPending}
            onClick={() => update.mutate({
              id: item.id,
              ...(isProgram || !naam.trim() ? {} : { quickName: naam.trim() }),
              ...(heeftInhoud
                ? {}
                : { plannedDurationSec: minuten ? Math.round(Number(minuten) * 60) : null }),
              plannedRpe: rpe ? Number(rpe) : null,
              notes: notitie.trim() || null,
            })}
          >
            {update.isPending ? 'Opslaan…' : 'Opslaan'}
          </DarkButton>

          {!isProgram && (
            <div className="pt-3 border-t" style={{ borderColor: P.line }}>
              {isCardio ? (
                <div className="space-y-2">
                  <MetaLabel>Cardio-blokken</MetaLabel>
                  <p style={{ color: P.inkMuted, fontSize: 12 }}>
                    {workout
                      ? `${workout.blocks.length} blok${workout.blocks.length === 1 ? '' : 'ken'} ingesteld.`
                      : 'Nog geen blokken. Bouw een warming-up, intervallen en een cooling-down.'}
                  </p>
                  <DarkButton variant="secondary" size="sm" onClick={() => setCardioOpen(true)}>
                    {workout ? 'Blokken bewerken' : 'Blokken bouwen'}
                  </DarkButton>
                </div>
              ) : (
                <QuickExerciseBuilder
                  // Neem de laad-status in de key: de builder kopieert `initial`
                  // eenmalig in useState en remount niet als listItemContents
                  // later binnenkomt. Zonder dit opent hij leeg bij een trage query.
                  key={`${item.id}:${contentsLoaded ? 'c' : 'l'}`}
                  initial={inhoud?.exercises ?? []}
                  defaultCategory={category}
                  saving={setExercises.isPending}
                  onSave={async (exercises) => {
                    await setExercises.mutateAsync({ itemId: item.id, exercises })
                  }}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
