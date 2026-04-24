'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BuilderExercise, ExtraParam, RepUnit } from './types'
import { STANDARD_PARAMS, REP_UNITS } from '@/lib/program-constants'
import { cn } from '@/lib/utils'
import {
  GripVertical, X, Plus, ArrowUp, ArrowDown, MoreHorizontal, Play,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { VideoPlayer } from '@/components/exercises/VideoPlayer'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CustomParameter } from './types'

const CATEGORY_COLORS: Record<string, string> = {
  STRENGTH: '#BEF264', MOBILITY: '#60a5fa', PLYOMETRICS: '#f59e0b',
  CARDIO: '#f87171', STABILITY: '#a78bfa',
}

interface LibraryExerciseLike {
  id: string
  name: string
  category: string
  difficulty: string
  videoUrl?: string | null
  easierVariantId?: string | null
  harderVariantId?: string | null
  muscleLoads: Record<string, number>
}

interface Props {
  exercise: BuilderExercise
  onUpdate: (uid: string, patch: Partial<BuilderExercise>) => void
  onRemove: (uid: string) => void
  onToggleSelect: (uid: string) => void
  onSwapVariant: (uid: string, direction: 'easier' | 'harder') => void
  isInSuperset?: boolean
  allExercises?: LibraryExerciseLike[]
  customParams?: CustomParameter[]
}

function InlineNumber({
  value, onChange, min = 0, className,
}: { value: number; onChange: (n: number) => void; min?: number; className?: string }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={e => onChange(Math.max(min, Number(e.target.value)))}
      className={cn(
        'w-12 h-6 text-center text-xs font-semibold bg-[#1C2425] rounded border-0 focus:outline-none focus:ring-1 focus:ring-[#BEF264]',
        className
      )}
    />
  )
}

export function ProgramExerciseBlock({
  exercise, onUpdate, onRemove, onToggleSelect, onSwapVariant,
  isInSuperset = false, allExercises = [], customParams = [],
}: Props) {
  const [videoOpen, setVideoOpen] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.uid,
    data: { type: 'canvas-exercise', exercise },
  })

  const style = { transform: CSS.Transform.toString(transform), transition }
  const color = CATEGORY_COLORS[exercise.category] ?? '#BEF264'

  const addParam = (tpl: { label: string; type: 'number' | 'text' | 'select' | 'slider'; unit?: string; options?: string[]; min?: number; max?: number; defaultValue?: string | number }) => {
    if (exercise.extraParams.find(p => p.label === tpl.label)) return
    const newParam: ExtraParam = {
      id: `p-${Date.now()}`,
      label: tpl.label,
      type: tpl.type,
      value: tpl.defaultValue ?? (tpl.type === 'number' || tpl.type === 'slider' ? 0 : ''),
      unit: tpl.unit,
      options: tpl.options,
      min: tpl.min,
      max: tpl.max,
    }
    onUpdate(exercise.uid, { extraParams: [...exercise.extraParams, newParam] })
  }

  const removeParam = (id: string) =>
    onUpdate(exercise.uid, { extraParams: exercise.extraParams.filter(p => p.id !== id) })

  const updateParam = (id: string, value: string | number) =>
    onUpdate(exercise.uid, {
      extraParams: exercise.extraParams.map(p => p.id === id ? { ...p, value } : p),
    })

  const easierEx = exercise.easierVariantId
    ? allExercises.find(e => e.id === exercise.easierVariantId)
    : null
  const harderEx = exercise.harderVariantId
    ? allExercises.find(e => e.id === exercise.harderVariantId)
    : null

  // All available custom params not already added
  const availableCustom = customParams.filter(
    cp => !exercise.extraParams.find(ep => ep.label === cp.label)
  )
  const availableStandard = STANDARD_PARAMS.filter(
    p => !exercise.extraParams.find(ep => ep.label === p.label)
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group rounded-lg border bg-[#141A1B] transition-all cursor-grab active:cursor-grabbing touch-none',
        isDragging ? 'opacity-50 shadow-xl z-50' : 'hover:border-[rgba(255,255,255,0.16)]',
        exercise.selected && 'ring-2 ring-[#BEF264] border-[#BEF264]',
        isInSuperset && 'border-transparent'
      )}
    >
      {/* Header row */}
      <div className="flex flex-col px-2 pt-2 pb-1 gap-1">
        {/* Top line: drag-indicator + checkbox + color + name + menu + X */}
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-zinc-300 shrink-0" />

          <input
            type="checkbox"
            checked={exercise.selected}
            onChange={() => onToggleSelect(exercise.uid)}
            className="w-3.5 h-3.5 shrink-0 accent-[#BEF264]"
          />

          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />

          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            className="flex-1 text-sm font-semibold truncate min-w-0 text-left hover:underline decoration-dotted underline-offset-2"
          >
            {exercise.name}
          </button>

          {/* Variant-swap quick-chips — direct zichtbaar zodat therapeut
              weet dat er een progressie/regressie beschikbaar is. */}
          {(easierEx || harderEx) && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {easierEx && (
                <button
                  type="button"
                  onClick={() => onSwapVariant(exercise.uid, 'easier')}
                  title={`Wissel naar gemakkelijker: ${easierEx.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors"
                  style={{
                    color: '#93C5FD',
                    borderColor: 'rgba(147,197,253,0.3)',
                    background: 'rgba(147,197,253,0.08)',
                    letterSpacing: '0.08em',
                  }}
                >
                  <ArrowDown className="w-3 h-3" />
                  EASY
                </button>
              )}
              {harderEx && (
                <button
                  type="button"
                  onClick={() => onSwapVariant(exercise.uid, 'harder')}
                  title={`Wissel naar zwaarder: ${harderEx.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors"
                  style={{
                    color: '#F4C261',
                    borderColor: 'rgba(244,194,97,0.3)',
                    background: 'rgba(244,194,97,0.08)',
                    letterSpacing: '0.08em',
                  }}
                >
                  <ArrowUp className="w-3 h-3" />
                  HARD
                </button>
              )}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {/* Variant swap */}
              {easierEx && (
                <DropdownMenuItem onClick={() => onSwapVariant(exercise.uid, 'easier')} className="gap-2 text-blue-600">
                  <ArrowDown className="w-3.5 h-3.5" />
                  Regressie → {easierEx.name}
                </DropdownMenuItem>
              )}
              {harderEx && (
                <DropdownMenuItem onClick={() => onSwapVariant(exercise.uid, 'harder')} className="gap-2 text-amber-600">
                  <ArrowUp className="w-3.5 h-3.5" />
                  Progressie → {harderEx.name}
                </DropdownMenuItem>
              )}
              {(easierEx || harderEx) && <DropdownMenuSeparator />}

              {/* Standard params */}
              {availableStandard.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs">Standaard parameters</DropdownMenuLabel>
                  {availableStandard.map(p => (
                    <DropdownMenuItem key={p.label} onClick={() => addParam(p)} className="text-xs">
                      + {p.label}
                      {(p as { unit?: string }).unit && (
                        <span className="text-muted-foreground ml-1">{(p as { unit?: string }).unit}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Custom params */}
              {availableCustom.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Custom parameters</DropdownMenuLabel>
                  {availableCustom.map(cp => (
                    <DropdownMenuItem key={cp.id} onClick={() => addParam(cp)} className="text-xs">
                      + {cp.label}
                      {cp.unit && <span className="text-muted-foreground ml-1">{cp.unit}</span>}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onRemove(exercise.uid)} className="text-destructive gap-2">
                <X className="w-3.5 h-3.5" />
                Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button onClick={() => onRemove(exercise.uid)} className="text-zinc-300 hover:text-destructive shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Second line: sets × reps · rest */}
        <div className="flex items-center gap-1 pl-10 text-xs text-muted-foreground pb-1">
          <InlineNumber value={exercise.sets} onChange={v => onUpdate(exercise.uid, { sets: v })} min={1} />
          <span>×</span>
          <InlineNumber value={exercise.reps} onChange={v => onUpdate(exercise.uid, { reps: v })} min={1} />
          <select
            value={exercise.repUnit}
            onChange={e => onUpdate(exercise.uid, { repUnit: e.target.value as RepUnit })}
            className="text-xs bg-[#1C2425] border-0 rounded px-1 h-6 focus:outline-none focus:ring-1 focus:ring-[#BEF264]"
          >
            {REP_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
          <span className="text-zinc-300 mx-0.5">·</span>
          <InlineNumber value={exercise.rest} onChange={v => onUpdate(exercise.uid, { rest: v })} min={0} className="w-10" />
          <span className="text-[#7B8889]">s</span>
        </div>
      </div>

      {/* Video dialog */}
      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="max-w-lg" style={{ borderRadius: '16px' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              {exercise.name}
            </DialogTitle>
          </DialogHeader>
          {exercise.videoUrl ? (
            <VideoPlayer url={exercise.videoUrl} />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border-2 border-dashed">
              <div className="w-12 h-12 rounded-full bg-[#1C2425] flex items-center justify-center mb-3">
                <Play className="w-5 h-5 text-[#7B8889]" />
              </div>
              <p className="text-sm font-medium">Nog geen video gekoppeld</p>
              <p className="text-xs text-muted-foreground mt-1">Voeg een video URL toe bij het bewerken van de oefening</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Extra params */}
      {exercise.extraParams.length > 0 && (
        <div className="px-8 pb-2 flex flex-wrap gap-2">
          {exercise.extraParams.map(param => (
            <div key={param.id} className="flex items-center gap-1 bg-[#1C2425] border rounded-md px-2 py-1 text-xs group/param">
              <span className="text-muted-foreground">{param.label}:</span>
              {param.type === 'number' ? (
                <input
                  type="number"
                  value={param.value as number}
                  min={param.min}
                  max={param.max}
                  onChange={e => updateParam(param.id, Number(e.target.value))}
                  className="w-10 text-center bg-transparent border-0 focus:outline-none font-semibold"
                />
              ) : param.type === 'slider' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={param.min ?? 0}
                    max={param.max ?? 10}
                    value={param.value as number}
                    onChange={e => updateParam(param.id, Number(e.target.value))}
                    className="w-16 h-1 accent-[#BEF264]"
                  />
                  <span className="font-semibold w-4 text-center">{param.value}</span>
                </div>
              ) : param.type === 'select' && param.options ? (
                <select
                  value={param.value as string}
                  onChange={e => updateParam(param.id, e.target.value)}
                  className="bg-transparent border-0 text-xs font-semibold focus:outline-none"
                >
                  {param.options.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={param.value as string}
                  onChange={e => updateParam(param.id, e.target.value)}
                  className="w-16 bg-transparent border-0 text-xs font-semibold focus:outline-none"
                />
              )}
              {param.unit && <span className="text-muted-foreground">{param.unit}</span>}
              <button onClick={() => removeParam(param.id)} className="opacity-0 group-hover/param:opacity-100 ml-0.5">
                <X className="w-2.5 h-2.5 text-[#7B8889] hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
