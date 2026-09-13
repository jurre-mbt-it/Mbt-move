/**
 * Vertaling tussen de builder-rij (BuilderExercise, met week/dag en de
 * bibliotheekvelden voor spierbalans) en de bloklijst-rij (PlannerBlock) die
 * de gedeelde pop-up en rijenweergave gebruiken.
 */
import type { BlockDraft, PlannerBlock } from '@/lib/planner-blocks'
import type { BuilderExercise, ExtraParam } from './types'

export type LibraryExerciseLike = {
  id: string
  name: string
  category: string
  difficulty?: string | null
  muscleLoads?: unknown
  videoUrl?: string | null
  easierVariantId?: string | null
  harderVariantId?: string | null
  trackOneRepMax?: boolean
}

export function builderToBlock(e: BuilderExercise, order: number): PlannerBlock {
  const kind = e.blockKind ?? 'EXERCISE'
  return {
    id: e.uid,
    order,
    blockKind: kind,
    exerciseId: kind === 'EXERCISE' ? e.exerciseId : null,
    exerciseName: kind === 'EXERCISE' ? e.name : null,
    exerciseCategory: kind === 'EXERCISE' ? e.category : null,
    sets: e.sets,
    reps: e.reps,
    repUnit: e.repUnit,
    restTime: e.rest ?? null,
    notes: e.notes ?? null,
    setsMax: e.setsMax ?? null,
    repsMax: e.repsMax ?? null,
    intensityType: e.intensityType ?? 'NONE',
    intensityMin: e.intensityMin ?? null,
    intensityMax: e.intensityMax ?? null,
    intensityText: e.intensityText ?? null,
    supersetGroup: e.supersetGroup ?? null,
    supersetOrder: e.supersetOrder ?? 0,
    extraParams: e.extraParams ?? [],
    repsPerSet: e.repsPerSet ?? null,
    amrap: !!e.amrap,
    phase: e.phase ?? null,
    isBodyweight: !!e.isBodyweight,
    completionOnly: !!e.completionOnly,
    trackMax: e.trackMax ?? null,
    text: e.text ?? null,
    videoUrl: e.videoUrl ?? null,
    durationSec: e.durationSec ?? null,
  }
}

function muscleLoadsRecord(raw: unknown): Record<string, number> {
  if (Array.isArray(raw)) {
    const out: Record<string, number> = {}
    for (const ml of raw as { muscle?: string; load?: number }[]) if (ml?.muscle && typeof ml.load === 'number') out[ml.muscle] = ml.load
    return out
  }
  if (raw && typeof raw === 'object') return raw as Record<string, number>
  return {}
}

/** De velden die een pop-up-concept op een builder-rij zet (zonder uid/week/dag). */
export function draftToBuilderPatch(d: BlockDraft, lib: LibraryExerciseLike | undefined): Omit<BuilderExercise, 'uid' | 'week' | 'day' | 'selected'> {
  const kind = d.blockKind
  const isEx = kind === 'EXERCISE'
  return {
    blockKind: kind,
    exerciseId: isEx ? (d.exerciseId ?? '') : '',
    name: isEx ? (lib?.name ?? d.exerciseName ?? 'Oefening') : (kind === 'NOTE' ? 'Notitie' : 'Pauze'),
    category: isEx ? (lib?.category ?? d.exerciseCategory ?? 'STRENGTH') : 'STRENGTH',
    difficulty: lib?.difficulty ?? '',
    muscleLoads: isEx ? muscleLoadsRecord(lib?.muscleLoads) : {},
    easierVariantId: lib?.easierVariantId ?? null,
    harderVariantId: lib?.harderVariantId ?? null,
    videoUrl: isEx ? (lib?.videoUrl ?? null) : (d.videoUrl ?? null),
    trackOneRepMax: lib?.trackOneRepMax ?? false,
    sets: d.sets,
    setsMax: d.setsMax ?? null,
    reps: d.reps,
    repsMax: d.repsMax ?? null,
    repUnit: d.repUnit as BuilderExercise['repUnit'],
    rest: d.restTime ?? 60,
    intensityType: d.intensityType,
    intensityMin: d.intensityMin ?? null,
    intensityMax: d.intensityMax ?? null,
    intensityText: d.intensityText ?? null,
    extraParams: (d.extraParams ?? []).map((p, i) => ({
      id: p.id ?? `p-${i}`,
      label: p.label,
      type: (p.type ?? 'number') as ExtraParam['type'],
      value: p.value ?? '',
      valueMax: p.valueMax ?? undefined,
      unit: p.unit,
      options: p.options,
      min: p.min,
      max: p.max,
    })),
    notes: d.notes ?? null,
    supersetGroup: d.supersetGroup ?? null,
    supersetOrder: d.supersetOrder ?? 0,
    repsPerSet: d.repsPerSet ?? null,
    amrap: !!d.amrap,
    phase: d.phase ?? null,
    isBodyweight: !!d.isBodyweight,
    completionOnly: !!d.completionOnly,
    trackMax: d.trackMax ?? null,
    text: d.text ?? null,
    durationSec: d.durationSec ?? null,
  }
}
