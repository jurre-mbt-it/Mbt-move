/**
 * Blokkolommen op een programma-oefening (ProgramExercise), dezelfde set als
 * op de planner-rijen. Eén helper voor elk schrijfpad (create, save,
 * duplicate, opslaan-als-programma) zodat een kolom niet stil wegvalt.
 */
import { Prisma } from '@prisma/client'

export type ProgramBlockLike = {
  blockKind?: string | null
  repsPerSet?: unknown
  amrap?: boolean | null
  phase?: string | null
  isBodyweight?: boolean | null
  completionOnly?: boolean | null
  trackMax?: boolean | null
  text?: string | null
  videoUrl?: string | null
  durationSec?: number | null
}

export function programBlockColumns(ex: ProgramBlockLike) {
  const pps = Array.isArray(ex.repsPerSet) && ex.repsPerSet.length > 0
    ? (ex.repsPerSet as Prisma.InputJsonValue)
    : Prisma.DbNull
  return {
    blockKind: ex.blockKind ?? 'EXERCISE',
    repsPerSet: pps,
    amrap: !!ex.amrap,
    phase: ex.phase ?? null,
    isBodyweight: !!ex.isBodyweight,
    completionOnly: !!ex.completionOnly,
    trackMax: ex.trackMax ?? null,
    text: ex.text ?? null,
    videoUrl: ex.videoUrl ?? null,
    durationSec: ex.durationSec ?? null,
  }
}
