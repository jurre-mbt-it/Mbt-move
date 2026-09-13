/**
 * Eén plek voor alle kolommen van een planner-rij. Elk kopieerpad
 * (copyItemToDay, plan toepassen, dupliceren) en elke lees-mapping gaat
 * hierlangs, zodat een nieuwe kolom niet stil wegvalt bij het kopiëren.
 */
import { Prisma } from '@prisma/client'
import type { BlockKind, BlockParam, BlockPhase, IntensityTypeKey, PlannerBlock } from '@/lib/planner-blocks'
import type { BlockInputParsed } from '@/server/lib/planner-block-schema'

export const BLOCK_SELECT = {
  id: true, order: true, blockKind: true, exerciseId: true,
  sets: true, reps: true, repUnit: true, restTime: true, notes: true,
  setsMax: true, repsMax: true,
  intensityType: true, intensityMin: true, intensityMax: true, intensityText: true,
  supersetGroup: true, supersetOrder: true, extraParams: true,
  repsPerSet: true, amrap: true, phase: true,
  isBodyweight: true, completionOnly: true, trackMax: true,
  text: true, videoUrl: true, durationSec: true,
  exercise: { select: { name: true, category: true } },
} satisfies Prisma.WeekScheduleDayItemExerciseSelect

export type BlockRow = Prisma.WeekScheduleDayItemExerciseGetPayload<{ select: typeof BLOCK_SELECT }>

function repsPerSetOf(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const nums = raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return nums.length > 0 ? nums : null
}

/** Prisma-rij → plat clienttype. De casts houden Prisma's recursieve JsonValue buiten de tRPC-return (TS2589). */
export function toPlannerBlock(e: BlockRow): PlannerBlock {
  return {
    id: e.id,
    order: e.order,
    blockKind: e.blockKind as BlockKind,
    exerciseId: e.exerciseId,
    exerciseName: e.exercise?.name ?? null,
    exerciseCategory: e.exercise?.category ?? null,
    sets: e.sets, reps: e.reps, repUnit: e.repUnit, restTime: e.restTime, notes: e.notes,
    setsMax: e.setsMax, repsMax: e.repsMax,
    intensityType: e.intensityType as IntensityTypeKey,
    intensityMin: e.intensityMin, intensityMax: e.intensityMax, intensityText: e.intensityText,
    supersetGroup: e.supersetGroup, supersetOrder: e.supersetOrder,
    extraParams: (e.extraParams ?? []) as BlockParam[],
    repsPerSet: repsPerSetOf(e.repsPerSet),
    amrap: e.amrap,
    phase: (e.phase === 'WARMUP' || e.phase === 'COOLDOWN' ? e.phase : null) as BlockPhase | null,
    isBodyweight: e.isBodyweight, completionOnly: e.completionOnly, trackMax: e.trackMax,
    text: e.text, videoUrl: e.videoUrl, durationSec: e.durationSec,
  }
}

/** Gevalideerde invoer → createMany-rij. */
export function blockCreateData(b: BlockInputParsed, itemId: string, order: number): Prisma.WeekScheduleDayItemExerciseCreateManyInput {
  return {
    itemId, order,
    blockKind: b.blockKind,
    exerciseId: b.blockKind === 'EXERCISE' ? (b.exerciseId ?? null) : null,
    sets: b.sets, reps: b.reps, repUnit: b.repUnit,
    restTime: b.restTime ?? null, notes: b.notes ?? null,
    setsMax: b.setsMax ?? null, repsMax: b.repsMax ?? null,
    intensityType: b.intensityType ?? 'NONE',
    intensityMin: b.intensityMin ?? null, intensityMax: b.intensityMax ?? null,
    intensityText: b.intensityText ?? null,
    supersetGroup: b.supersetGroup ?? null, supersetOrder: b.supersetOrder ?? 0,
    extraParams: (b.extraParams ?? []) as Prisma.InputJsonValue,
    repsPerSet: b.repsPerSet && b.repsPerSet.length > 0 ? (b.repsPerSet as Prisma.InputJsonValue) : Prisma.DbNull,
    amrap: !!b.amrap, phase: b.phase ?? null,
    isBodyweight: !!b.isBodyweight, completionOnly: !!b.completionOnly, trackMax: b.trackMax ?? null,
    text: b.text ?? null, videoUrl: b.videoUrl ?? null, durationSec: b.durationSec ?? null,
  }
}

/** Bestaande rij → geneste create bij het kopiëren van een item. Alle kolommen, bewust uitgeschreven. */
export function copyBlockColumns(ex: {
  blockKind: string; exerciseId: string | null; order: number
  sets: number; reps: number; repUnit: string; restTime: number | null; notes: string | null
  setsMax: number | null; repsMax: number | null
  intensityType: Prisma.WeekScheduleDayItemExerciseCreateManyInput['intensityType']
  intensityMin: number | null; intensityMax: number | null; intensityText: string | null
  supersetGroup: string | null; supersetOrder: number
  extraParams: Prisma.JsonValue; repsPerSet: Prisma.JsonValue | null
  amrap: boolean; phase: string | null; isBodyweight: boolean; completionOnly: boolean
  trackMax: boolean | null; text: string | null; videoUrl: string | null; durationSec: number | null
}): Prisma.WeekScheduleDayItemExerciseUncheckedCreateWithoutItemInput {
  return {
    blockKind: ex.blockKind,
    exerciseId: ex.exerciseId,
    order: ex.order,
    sets: ex.sets, reps: ex.reps, repUnit: ex.repUnit, restTime: ex.restTime, notes: ex.notes,
    setsMax: ex.setsMax, repsMax: ex.repsMax,
    intensityType: ex.intensityType,
    intensityMin: ex.intensityMin, intensityMax: ex.intensityMax, intensityText: ex.intensityText,
    supersetGroup: ex.supersetGroup, supersetOrder: ex.supersetOrder,
    extraParams: (ex.extraParams ?? []) as Prisma.InputJsonValue,
    repsPerSet: ex.repsPerSet == null ? Prisma.DbNull : (ex.repsPerSet as Prisma.InputJsonValue),
    amrap: ex.amrap, phase: ex.phase, isBodyweight: ex.isBodyweight, completionOnly: ex.completionOnly,
    trackMax: ex.trackMax, text: ex.text, videoUrl: ex.videoUrl, durationSec: ex.durationSec,
  }
}
