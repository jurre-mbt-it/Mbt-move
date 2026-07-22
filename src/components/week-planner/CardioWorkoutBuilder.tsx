'use client'

/**
 * Cardio-workout bouwen met blokken (TrainingPeaks-stijl), voor hardlopen,
 * fietsen, roeien en de rest.
 *
 * Opzet, van boven naar beneden:
 *   - palet: klik of sleep een blok de workout in
 *   - grafiek: de workout getekend, hoogte = intensiteit, breedte = duur
 *   - lijst: de blokken, versleepbaar; klik selecteert
 *   - editor: lengte en doel van het geselecteerde blok
 *
 * Bewust NIET overgenomen uit de screenshot: de kolom met pace, calorieën,
 * hoogtemeters en werk. Dat zijn meetwaarden van een gedane training, geen
 * onderdeel van een voorschrift.
 *
 * Doelen zijn zones of RPE — zie de kop van lib/cardio-workout.ts voor waarom
 * "% van drempel" hier (nog) niet kan.
 */

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, PointerSensor, closestCenter,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Repeat, Trash2, X } from 'lucide-react'
import {
  HR_ZONES, CARDIO_ACTIVITIES, type CardioActivityKey, type HRZone,
} from '@/lib/cardio-constants'
import {
  STEP_META, IS_RAMP, isRepeat, targetColor, targetHeight, summarize,
  totalDurationSec, totalDistanceM, structuredLoad,
  type StepKind, type StructuredCardio, type WorkoutBlock, type WorkoutStep,
} from '@/lib/cardio-workout'
import {
  DarkButton, DarkDialog as Dialog, DarkDialogContent as DialogContent,
  DarkDialogHeader as DialogHeader, DarkDialogTitle as DialogTitle,
  DarkInput, MetaLabel, P,
} from '@/components/dark-ui'

const uid = () => Math.random().toString(36).slice(2, 10)

const PALETTE: { kind: StepKind | 'REPEAT2' | 'REPEAT3'; label: string }[] = [
  { kind: 'WARMUP', label: 'Warming-up' },
  { kind: 'ACTIVE', label: 'Actief' },
  { kind: 'RECOVERY', label: 'Herstel' },
  { kind: 'COOLDOWN', label: 'Cooldown' },
  { kind: 'RAMP_UP', label: 'Ramp up' },
  { kind: 'RAMP_DOWN', label: 'Ramp down' },
  { kind: 'REPEAT2', label: '2-staps herhaling' },
  { kind: 'REPEAT3', label: '3-staps herhaling' },
]

function newStep(kind: StepKind): WorkoutStep {
  const m = STEP_META[kind]
  return {
    id: uid(),
    kind,
    durationSec: m.defaultSec,
    target: IS_RAMP[kind]
      ? { type: 'ZONE', zone: m.defaultZone, toZone: kind === 'RAMP_UP' ? 4 : 1 }
      : { type: 'ZONE', zone: m.defaultZone },
  }
}

function newBlock(kind: StepKind | 'REPEAT2' | 'REPEAT3'): WorkoutBlock {
  if (kind === 'REPEAT2' || kind === 'REPEAT3') {
    const steps = kind === 'REPEAT2'
      ? [newStep('ACTIVE'), newStep('RECOVERY')]
      : [newStep('ACTIVE'), newStep('RECOVERY'), newStep('ACTIVE')]
    return { id: uid(), kind: 'REPEAT', times: 4, steps }
  }
  return newStep(kind)
}

const fmtDur = (sec: number) => {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}u ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

export function CardioWorkoutBuilder({
  initial, activity, itemName, saving, onClose, onSave,
}: {
  initial: StructuredCardio | null
  activity: CardioActivityKey
  itemName: string
  saving: boolean
  onClose: () => void
  onSave: (w: StructuredCardio) => Promise<void>
}) {
  const [blocks, setBlocks] = useState<WorkoutBlock[]>(initial?.blocks ?? [])
  const [act, setAct] = useState<CardioActivityKey>(initial?.activity ?? activity)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragLabel, setDragLabel] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const dur = useMemo(() => totalDurationSec(blocks), [blocks])
  const dist = useMemo(() => totalDistanceM(blocks), [blocks])
  const load = useMemo(() => structuredLoad(blocks), [blocks])

  // Geselecteerd blok + eventueel de herhaling waar het in zit.
  const selected = useMemo(() => {
    for (const b of blocks) {
      if (b.id === selectedId) return { block: b, parent: null as null | string }
      if (isRepeat(b)) {
        const s = b.steps.find(x => x.id === selectedId)
        if (s) return { block: s, parent: b.id }
      }
    }
    return null
  }, [blocks, selectedId])

  /** `atId` = invoegen vóór dat blok (waar je losliet); anders achteraan. */
  function add(kind: StepKind | 'REPEAT2' | 'REPEAT3', atId?: string) {
    const b = newBlock(kind)
    setBlocks(prev => {
      if (!atId) return [...prev, b]
      const i = prev.findIndex(x => x.id === atId)
      if (i < 0) return [...prev, b]
      return [...prev.slice(0, i), b, ...prev.slice(i)]
    })
    setSelectedId(isRepeat(b) ? b.steps[0].id : b.id)
  }

  function patchStep(id: string, patch: Partial<WorkoutStep>) {
    setBlocks(prev => prev.map(b => {
      if (b.id === id && !isRepeat(b)) return { ...b, ...patch }
      if (isRepeat(b)) return { ...b, steps: b.steps.map(s => (s.id === id ? { ...s, ...patch } : s)) }
      return b
    }))
  }

  function patchRepeat(id: string, times: number) {
    setBlocks(prev => prev.map(b => (b.id === id && isRepeat(b) ? { ...b, times } : b)))
  }

  function remove(id: string) {
    setBlocks(prev => prev
      .map(b => (isRepeat(b) ? { ...b, steps: b.steps.filter(s => s.id !== id) } : b))
      .filter(b => b.id !== id)
      .filter(b => !(isRepeat(b) && b.steps.length === 0)))
    if (selectedId === id) setSelectedId(null)
  }

  function handleDragStart(e: DragStartEvent) {
    const d = e.active.data.current as { label?: string } | undefined
    setDragLabel(d?.label ?? 'Blok')
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragLabel(null)
    const { active, over } = e
    const data = active.data.current as { palette?: StepKind | 'REPEAT2' | 'REPEAT3' } | undefined
    // Uit het palet gesleept → toevoegen, op de plek waar je losliet.
    if (data?.palette) {
      if (!over) return
      const atId = over.id === 'workout-list' ? undefined : String(over.id)
      add(data.palette, atId)
      return
    }
    // Binnen de lijst herordenen.
    if (!over || active.id === over.id) return
    setBlocks(prev => {
      const from = prev.findIndex(b => b.id === active.id)
      const to = prev.findIndex(b => b.id === over.id)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{itemName || 'Cardio-workout'}</DialogTitle>
        </DialogHeader>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Activiteit + totalen */}
          <div className="flex items-center gap-3 flex-wrap -mt-1 mb-3">
            <select
              value={act}
              onChange={e => setAct(e.target.value as CardioActivityKey)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.ink }}
            >
              {(Object.keys(CARDIO_ACTIVITIES) as CardioActivityKey[]).map(a => (
                <option key={a} value={a}>{CARDIO_ACTIVITIES[a].label}</option>
              ))}
            </select>
            <span className="athletic-mono text-xs" style={{ color: P.inkMuted }}>
              {fmtDur(dur)}{dist > 0 ? ` · ${(dist / 1000).toFixed(2).replace(/\.?0+$/, '')} km` : ''}
            </span>
            <span className="athletic-mono text-xs" style={{ color: P.lime }} title="Geplande belasting (duur × RPE), zelfde eenheid als de weekbalk">
              {load} sRPE
            </span>
          </div>

          <div className="grid lg:grid-cols-[1fr_300px] gap-4">
            <div className="min-w-0">
              {/* Palet */}
              <MetaLabel>Blokken — klik of sleep</MetaLabel>
              <div className="grid grid-cols-4 gap-1.5 mt-1.5 mb-3">
                {PALETTE.map(p => (
                  <PaletteButton key={p.kind} kind={p.kind} label={p.label} onAdd={add} />
                ))}
              </div>

              {/* Grafiek */}
              <WorkoutChart blocks={blocks} selectedId={selectedId} onSelect={setSelectedId} />

              {/* Lijst */}
              <div className="mt-3">
                <MetaLabel>Volgorde</MetaLabel>
                <div className="mt-1.5">
                  <DropZone>
                    {blocks.length === 0 ? (
                      <div
                        className="rounded-lg p-6 text-center text-xs"
                        style={{ background: P.surfaceLow, border: `1px dashed ${P.lineStrong}`, color: P.inkDim }}
                      >
                        Sleep hier een blok naartoe, of klik er hierboven op.
                      </div>
                    ) : (
                      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                          {blocks.map(b => (
                            <SortableBlock
                              key={b.id}
                              block={b}
                              selectedId={selectedId}
                              onSelect={setSelectedId}
                              onRemove={remove}
                              onTimes={patchRepeat}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </DropZone>
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="min-w-0">
              <MetaLabel>Blok-details</MetaLabel>
              <div
                className="rounded-lg p-3 mt-1.5"
                style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
              >
                {!selected || isRepeat(selected.block) ? (
                  <p className="text-xs py-6 text-center leading-relaxed" style={{ color: P.inkDim }}>
                    Kies een blok om lengte en doel aan te passen.
                  </p>
                ) : (
                  <StepEditor step={selected.block} onPatch={patchStep} />
                )}
              </div>
              {blocks.length > 0 && (
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: P.inkDim }}>
                  {summarize(blocks)}
                </p>
              )}
            </div>
          </div>

          {/* In een portal naar body. De dialoog centreert zichzelf met
              `translate(-50%, -50%)`, en dnd-kit positioneert het sleep-blokje
              in viewport-coördinaten: binnen die verschoven laag gerenderd
              schuift het blokje een halve dialoog mee en zweeft het los van je
              cursor. Buiten de transform klopt het wel. */}
          {typeof document !== 'undefined' && createPortal(
            <DragOverlay dropAnimation={null}>
              {dragLabel && (
                <div
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: P.surfaceHi, border: `1px solid ${P.lime}`, color: P.ink }}
                >
                  {dragLabel}
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>

        <div className="flex justify-end gap-2 pt-3">
          <DarkButton variant="secondary" onClick={onClose} className="text-xs">Annuleren</DarkButton>
          <DarkButton
            disabled={saving || blocks.length === 0}
            onClick={() => onSave({ version: 1, activity: act, blocks })}
            className="text-xs"
          >
            {saving ? 'Opslaan…' : 'Workout opslaan'}
          </DarkButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Palet ─────────────────────────────────────────────────────────────────
/**
 * Klikken voegt toe, slepen ook.
 *
 * LET OP: géén `onClick` gebruiken. dnd-kit onderdrukt het click-event dat op
 * een pointer-interactie volgt (anders zou je na elke drag ook een klik
 * krijgen), waardoor een gewone klik op deze knop stil niets deed. We leiden
 * de klik daarom zelf af: pointer omlaag en weer omhoog zonder noemenswaardige
 * beweging = klik. Boven de drempel neemt dnd-kit het over als drag.
 */
const CLICK_SLOP_PX = 5

function PaletteButton({
  kind, label, onAdd,
}: { kind: StepKind | 'REPEAT2' | 'REPEAT3'; label: string; onAdd: (k: StepKind | 'REPEAT2' | 'REPEAT3') => void }) {
  const isRep = kind === 'REPEAT2' || kind === 'REPEAT3'
  const color = isRep ? P.ink : HR_ZONES[STEP_META[kind as StepKind].defaultZone].color
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${kind}`,
    data: { palette: kind, label },
  })
  const downAt = useRef<{ x: number; y: number } | null>(null)

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      // Capture: vastleggen vóór dnd-kit z'n eigen pointerdown afhandelt.
      onPointerDownCapture={e => { downAt.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={e => {
        const from = downAt.current
        downAt.current = null
        if (!from) return
        if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < CLICK_SLOP_PX) onAdd(kind)
      }}
      className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-semibold text-left transition-colors athletic-tap cursor-grab active:cursor-grabbing"
      style={{
        background: P.surfaceLow,
        border: `1px solid ${P.line}`,
        color: P.ink,
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
    >
      {isRep
        ? <Repeat className="w-3 h-3 shrink-0" style={{ color: P.inkMuted }} />
        : <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: color }} />}
      <span className="truncate">{label}</span>
      <Plus className="w-3 h-3 ml-auto shrink-0" style={{ color: P.inkDim }} />
    </button>
  )
}

/** Waar je een palet-blok in kunt laten vallen. */
function DropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'workout-list' })
  return (
    <div
      ref={setNodeRef}
      className="rounded-lg transition-colors"
      style={{
        outline: isOver ? `1px dashed ${P.lime}` : '1px dashed transparent',
        outlineOffset: 4,
      }}
    >
      {children}
    </div>
  )
}

// ── Grafiek ───────────────────────────────────────────────────────────────
function WorkoutChart({
  blocks, selectedId, onSelect,
}: { blocks: WorkoutBlock[]; selectedId: string | null; onSelect: (id: string) => void }) {
  // Breedte naar rato van de duur; blokken op afstand krijgen een vaste breedte
  // want zonder tempo is hun duur niet bekend.
  const FALLBACK = 120
  const flat: { id: string; kind: string; sec: number; color: string; h: number; rep?: number }[] = []
  for (const b of blocks) {
    if (isRepeat(b)) {
      for (const s of b.steps) {
        flat.push({
          id: s.id, kind: s.kind, sec: (s.durationSec ?? FALLBACK) * b.times,
          color: targetColor(s.target), h: targetHeight(s.target), rep: b.times,
        })
      }
    } else {
      flat.push({ id: b.id, kind: b.kind, sec: b.durationSec ?? FALLBACK, color: targetColor(b.target), h: targetHeight(b.target) })
    }
  }
  const total = flat.reduce((s, f) => s + f.sec, 0) || 1

  return (
    <div
      className="rounded-lg p-2"
      style={{ background: P.surfaceLow, border: `1px solid ${P.line}` }}
    >
      <div className="flex items-end gap-px h-[120px]">
        {flat.length === 0 ? (
          <div className="w-full h-full grid place-items-center text-[11px]" style={{ color: P.inkDim }}>
            De workout verschijnt hier
          </div>
        ) : flat.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            title={`${STEP_META[f.kind as StepKind]?.label ?? f.kind}${f.rep ? ` (${f.rep}×)` : ''}`}
            className="relative transition-opacity hover:opacity-90"
            style={{
              width: `${(f.sec / total) * 100}%`,
              height: `${Math.max(8, f.h * 100)}%`,
              background: f.color,
              opacity: selectedId === f.id ? 1 : 0.72,
              outline: selectedId === f.id ? `2px solid ${P.ink}` : 'none',
              outlineOffset: -2,
              minWidth: 2,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Blok in de lijst ──────────────────────────────────────────────────────
function SortableBlock({
  block, selectedId, onSelect, onRemove, onTimes,
}: {
  block: WorkoutBlock
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onTimes: (id: string, times: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg" >
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
        style={{ background: P.surface, border: `1px solid ${P.line}` }}
      >
        <button type="button" {...attributes} {...listeners} className="cursor-grab shrink-0" aria-label="Versleep">
          <GripVertical className="w-3.5 h-3.5" style={{ color: P.inkDim }} />
        </button>

        {isRepeat(block) ? (
          <>
            <Repeat className="w-3.5 h-3.5 shrink-0" style={{ color: P.inkMuted }} />
            <input
              type="number"
              min={1}
              max={40}
              value={block.times}
              onChange={e => onTimes(block.id, Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
              className="w-11 px-1 py-0.5 rounded text-[11px] athletic-mono text-center"
              style={{ background: P.surfaceLow, border: `1px solid ${P.line}`, color: P.ink }}
            />
            <span className="text-[11px]" style={{ color: P.inkMuted }}>×</span>
            <div className="flex gap-1 flex-1 min-w-0 flex-wrap">
              {block.steps.map(s => (
                <StepChip key={s.id} step={s} selected={selectedId === s.id} onSelect={onSelect} onRemove={onRemove} />
              ))}
            </div>
          </>
        ) : (
          <StepChip step={block} selected={selectedId === block.id} onSelect={onSelect} onRemove={onRemove} grow />
        )}

        <button
          type="button"
          onClick={() => onRemove(block.id)}
          className="shrink-0 ml-auto"
          aria-label="Verwijder blok"
        >
          <Trash2 className="w-3.5 h-3.5" style={{ color: P.inkDim }} />
        </button>
      </div>
    </div>
  )
}

function StepChip({
  step, selected, onSelect, onRemove, grow,
}: { step: WorkoutStep; selected: boolean; onSelect: (id: string) => void; onRemove: (id: string) => void; grow?: boolean }) {
  const color = targetColor(step.target)
  const len = step.durationSec != null
    ? `${Math.round(step.durationSec / 60)}′`
    : step.distanceM != null
      ? `${(step.distanceM / 1000).toFixed(2).replace(/\.?0+$/, '')} km`
      : '—'
  const tgt = step.target.type === 'ZONE'
    ? (step.target.toZone != null ? `Z${step.target.zone}→${step.target.toZone}` : `Z${step.target.zone}`)
    : step.target.type === 'RPE' ? `RPE ${step.target.min}` : 'vrij'
  return (
    <button
      type="button"
      onClick={() => onSelect(step.id)}
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] font-semibold min-w-0 ${grow ? 'flex-1' : ''}`}
      style={{
        background: selected ? `${color}22` : 'transparent',
        border: `1px solid ${selected ? color : P.line}`,
        color: P.ink,
      }}
    >
      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: color }} />
      <span className="truncate">{STEP_META[step.kind].short}</span>
      <span className="athletic-mono shrink-0" style={{ color: P.inkMuted }}>{len} {tgt}</span>
    </button>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────
function StepEditor({
  step, onPatch,
}: { step: WorkoutStep; onPatch: (id: string, patch: Partial<WorkoutStep>) => void }) {
  const byDistance = step.distanceM != null
  const ramp = IS_RAMP[step.kind]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: targetColor(step.target) }} />
        <span className="text-xs font-semibold" style={{ color: P.ink }}>{STEP_META[step.kind].label}</span>
      </div>

      {/* Lengte: tijd of afstand */}
      <div>
        <MetaLabel>Lengte</MetaLabel>
        <div className="grid grid-cols-2 gap-1 mt-1.5 p-0.5 rounded-lg" style={{ background: P.surface, border: `1px solid ${P.line}` }}>
          {([['tijd', !byDistance], ['afstand', byDistance]] as const).map(([label, on]) => (
            <button
              key={label}
              type="button"
              onClick={() => onPatch(step.id, label === 'tijd'
                ? { durationSec: step.durationSec ?? 300, distanceM: undefined }
                : { distanceM: step.distanceM ?? 1000, durationSec: undefined })}
              className="py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ background: on ? P.surfaceHi : 'transparent', color: on ? P.ink : P.inkMuted }}
            >
              {label === 'tijd' ? 'Tijd' : 'Afstand'}
            </button>
          ))}
        </div>
        {byDistance ? (
          <div className="flex items-center gap-2 mt-2">
            <DarkInput
              type="number"
              min={0.1}
              step={0.1}
              value={String((step.distanceM ?? 0) / 1000)}
              onChange={e => onPatch(step.id, { distanceM: Math.max(50, (Number(e.target.value) || 0) * 1000) })}
              className="text-xs"
            />
            <span className="text-[11px] shrink-0" style={{ color: P.inkMuted }}>km</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            <DarkInput
              type="number"
              min={1}
              max={300}
              value={String(Math.round((step.durationSec ?? 0) / 60))}
              onChange={e => onPatch(step.id, { durationSec: Math.max(1, Math.min(300, Number(e.target.value) || 1)) * 60 })}
              className="text-xs"
            />
            <span className="text-[11px] shrink-0" style={{ color: P.inkMuted }}>min</span>
          </div>
        )}
      </div>

      {/* Doel — op HR-zone óf op RPE (ervaren inspanning 1-10). */}
      <div>
        <div className="flex items-center justify-between">
          <MetaLabel>Doel</MetaLabel>
          <div className="flex gap-1">
            {(['ZONE', 'RPE'] as const).map(mode => {
              const active = step.target.type === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (step.target.type === mode) return
                    // Wisselen van doel-type met een zinvolle startwaarde.
                    onPatch(step.id, {
                      target: mode === 'RPE'
                        ? (ramp ? { type: 'RPE', min: 3, max: 7 } : { type: 'RPE', min: 5 })
                        : (ramp ? { type: 'ZONE', zone: 2, toZone: 4 } : { type: 'ZONE', zone: 2 }),
                    })
                  }}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold athletic-mono transition-colors"
                  style={{
                    background: active ? `color-mix(in srgb, ${P.brand} 13%, transparent)` : 'transparent',
                    border: `1px solid ${active ? P.brand : P.line}`,
                    color: active ? P.brand : P.inkMuted,
                  }}
                >
                  {mode === 'ZONE' ? 'HR-ZONE' : 'RPE'}
                </button>
              )
            })}
          </div>
        </div>

        {step.target.type === 'ZONE' ? (
          <>
            <MetaLabel style={{ marginTop: 8 }}>{ramp ? 'Van zone' : 'Doel-zone'}</MetaLabel>
            <ZonePicker
              value={step.target.zone}
              onChange={z => onPatch(step.id, {
                target: step.target.type === 'ZONE' && step.target.toZone != null
                  ? { type: 'ZONE', zone: z, toZone: step.target.toZone }
                  : { type: 'ZONE', zone: z },
              })}
            />
            {ramp && step.target.toZone != null && (
              <>
                <MetaLabel style={{ marginTop: 8 }}>Naar zone</MetaLabel>
                <ZonePicker
                  value={step.target.toZone}
                  onChange={z => onPatch(step.id, { target: { type: 'ZONE', zone: (step.target as { zone: HRZone }).zone, toZone: z } })}
                />
              </>
            )}
            <p className="text-[10px] leading-relaxed mt-1.5" style={{ color: P.inkDim }}>
              {HR_ZONES[step.target.zone].description} · {HR_ZONES[step.target.zone].rpeFeel}
            </p>
          </>
        ) : (
          <RpePicker
            ramp={ramp}
            min={step.target.type === 'RPE' ? step.target.min : 5}
            max={step.target.type === 'RPE' ? step.target.max : undefined}
            onChange={(min, max) => onPatch(step.id, { target: max != null ? { type: 'RPE', min, max } : { type: 'RPE', min } })}
          />
        )}
      </div>

      <div>
        <MetaLabel>Notitie (optioneel)</MetaLabel>
        <DarkInput
          className="mt-1.5 text-xs"
          value={step.notes ?? ''}
          onChange={e => onPatch(step.id, { notes: e.target.value || undefined })}
          placeholder="Bijv. op gevoel afbouwen"
        />
      </div>
    </div>
  )
}

function ZonePicker({ value, onChange }: { value: HRZone; onChange: (z: HRZone) => void }) {
  return (
    <div className="flex gap-1 mt-1.5">
      {([1, 2, 3, 4, 5] as HRZone[]).map(z => (
        <button
          key={z}
          type="button"
          onClick={() => onChange(z)}
          title={HR_ZONES[z].label}
          className="flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
          style={{
            background: value === z ? `${HR_ZONES[z].color}28` : 'transparent',
            border: `1px solid ${value === z ? HR_ZONES[z].color : P.line}`,
            color: value === z ? HR_ZONES[z].color : P.inkMuted,
          }}
        >
          Z{z}
        </button>
      ))}
    </div>
  )
}

/** RPE-gevoel bij een waarde 1-10 (Borg CR10-achtig). */
function rpeFeel(v: number): string {
  if (v <= 2) return 'zeer licht'
  if (v <= 4) return 'licht'
  if (v <= 6) return 'matig'
  if (v <= 8) return 'zwaar'
  return 'maximaal'
}

/** RPE-doel: één waarde 1-10, of bij een ramp een van→naar-bereik. */
function RpePicker({ ramp, min, max, onChange }: {
  ramp: boolean
  min: number
  max?: number
  onChange: (min: number, max?: number) => void
}) {
  const clamp = (n: number) => Math.max(1, Math.min(10, n))
  const Stepper = ({ label, value, set }: { label?: string; value: number; set: (v: number) => void }) => (
    <div className="flex-1">
      {label && <MetaLabel style={{ marginTop: 8 }}>{label}</MetaLabel>}
      <div className="flex items-center gap-2 mt-1.5">
        <button type="button" onClick={() => set(clamp(value - 1))}
          className="w-7 h-7 rounded-md text-sm font-bold" style={{ border: `1px solid ${P.line}`, color: P.ink }}>−</button>
        <div className="flex-1 text-center athletic-mono text-sm font-bold" style={{ color: P.brand }}>
          RPE {value}
        </div>
        <button type="button" onClick={() => set(clamp(value + 1))}
          className="w-7 h-7 rounded-md text-sm font-bold" style={{ border: `1px solid ${P.line}`, color: P.ink }}>+</button>
      </div>
    </div>
  )
  return (
    <>
      {ramp ? (
        <div className="flex gap-3">
          <Stepper label="Van RPE" value={min} set={v => onChange(v, Math.max(v, max ?? v))} />
          <Stepper label="Naar RPE" value={max ?? min} set={v => onChange(Math.min(min, v), v)} />
        </div>
      ) : (
        <Stepper value={min} set={v => onChange(v)} />
      )}
      <p className="text-[10px] leading-relaxed mt-1.5" style={{ color: P.inkDim }}>
        Ervaren inspanning (1-10) · {ramp ? `${rpeFeel(min)} → ${rpeFeel(max ?? min)}` : rpeFeel(min)}
      </p>
    </>
  )
}
