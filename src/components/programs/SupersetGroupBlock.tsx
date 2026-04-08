'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ProgramExerciseBlock } from './ProgramExerciseBlock'
import type { BuilderExercise, CustomParameter } from './types'
import { SUPERSET_COLORS } from '@/lib/program-constants'

interface Props {
  groupLetter: string
  exercises: BuilderExercise[]
  onUpdate: (uid: string, patch: Partial<BuilderExercise>) => void
  onRemove: (uid: string) => void
  onToggleSelect: (uid: string) => void
  onSwapVariant: (uid: string, direction: 'easier' | 'harder') => void
  allExercises?: { id: string; name: string; category: string; difficulty: string; videoUrl?: string | null; easierVariantId?: string | null; harderVariantId?: string | null; muscleLoads: Record<string, number> }[]
  customParams?: CustomParameter[]
}

export function SupersetGroupBlock({ groupLetter, exercises, onUpdate, onRemove, onToggleSelect, onSwapVariant, allExercises, customParams }: Props) {
  const colors = SUPERSET_COLORS[groupLetter] ?? SUPERSET_COLORS.A

  const { setNodeRef, isOver } = useDroppable({
    id: `superset-${groupLetter}`,
    data: { type: 'superset-group', groupLetter },
  })

  return (
    <div
      ref={setNodeRef}
      className="rounded-xl p-2 space-y-1.5 transition-colors"
      style={{
        background: isOver ? colors.bg : colors.bg,
        border: `2px solid ${colors.border}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: colors.border, color: colors.text }}
        >
          Superset {groupLetter}
        </span>
        <span className="text-xs" style={{ color: colors.text }}>
          {exercises.length} oefeningen
        </span>
      </div>

      {/* Exercises */}
      <SortableContext
        items={exercises.map(e => e.uid)}
        strategy={verticalListSortingStrategy}
      >
        {exercises.map(ex => (
          <ProgramExerciseBlock
            key={ex.uid}
            exercise={ex}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onToggleSelect={onToggleSelect}
            onSwapVariant={onSwapVariant}
            isInSuperset
            allExercises={allExercises}
            customParams={customParams}
          />
        ))}
      </SortableContext>
    </div>
  )
}
