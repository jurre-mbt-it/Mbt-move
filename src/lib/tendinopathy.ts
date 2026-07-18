/**
 * Tendinopathie-dagritme: voortgang, mijlpalen en herinner-status.
 *
 * Waarom hier: zowel de patient-tRPC (`getTendinopathyToday`) als de latere
 * herinner-cron (push-notificaties, aparte flow) hebben dezelfde twee dingen
 * nodig: hoe ver de patient is (week/mijlpaal) en of er vandaag nog een ronde
 * openstaat. Door dat hier te centraliseren blijft de copy op één plek en
 * rendert de mobiele app alleen wat de server stuurt (geen gedupliceerde
 * tone-of-voice-teksten in de app-repo).
 *
 * Klinisch model: een tendinopathie-programma draait op consistent, dagelijks
 * belasten (isometrisch/HSR). `Program.dailyTarget` = hoe vaak per dag elke
 * ISO-oefening gedaan zou moeten worden. Mijlpalen liggen op een derde, twee
 * derde en het eind van de looptijd (`Program.weeks`) — bij 12 weken dus op
 * week 4, 8 en 12.
 */

import type { PrismaClient } from '@prisma/client'
import { dateKey, amsMidnight, addDaysKey } from '@/lib/week-dates'

export type MilestoneKey = 'third' | 'twoThirds' | 'complete'

export interface MilestoneWeeks {
  third: number
  twoThirds: number
  complete: number
}

export interface TendinopathyProgress {
  /** 1-based, gecapt op totalWeeks. */
  currentWeek: number
  totalWeeks: number
  milestoneWeeks: MilestoneWeeks
  /** Hoogste mijlpaal waarvan de week-drempel al bereikt is, of null. */
  reachedMilestone: MilestoneKey | null
}

/** Week-drempels van de drie mijlpalen, afgeleid uit de looptijd. */
export function milestoneWeeks(totalWeeks: number): MilestoneWeeks {
  const w = Math.max(3, totalWeeks) // < 3 weken kent geen zinnige derden
  return {
    third: Math.max(1, Math.round(w / 3)),
    twoThirds: Math.max(2, Math.round((w * 2) / 3)),
    complete: w,
  }
}

/** Volle weken sinds de startdatum, in NL-tijd (0-based). */
export function weeksSinceStart(startDate: Date | null, now = new Date()): number {
  if (!startDate) return 0
  const startKey = dateKey(startDate)
  const nowKey = dateKey(now)
  const startMs = amsMidnight(startKey).getTime()
  const nowMs = amsMidnight(nowKey).getTime()
  if (nowMs <= startMs) return 0
  return Math.floor((nowMs - startMs) / (7 * 86_400_000))
}

export function computeTendinopathyProgress(
  startDate: Date | null,
  totalWeeks: number,
  now = new Date(),
): TendinopathyProgress {
  const mw = milestoneWeeks(totalWeeks)
  const currentWeek = Math.min(weeksSinceStart(startDate, now) + 1, mw.complete)

  let reached: MilestoneKey | null = null
  if (currentWeek >= mw.complete) reached = 'complete'
  else if (currentWeek >= mw.twoThirds) reached = 'twoThirds'
  else if (currentWeek >= mw.third) reached = 'third'

  return { currentWeek, totalWeeks: mw.complete, milestoneWeeks: mw, reachedMilestone: reached }
}

// ── Copy (MBT tone of voice) ────────────────────────────────────────────────
// Direct, "je", evidence-based, geen em-dashes, geen slogan-oneliners.

export interface MilestoneMessage {
  key: MilestoneKey
  kicker: string
  title: string
  body: string
}

/** Mijlpaal-bericht met de echte week-getallen ingevuld. */
export function milestoneMessage(key: MilestoneKey, mw: MilestoneWeeks): MilestoneMessage {
  switch (key) {
    case 'third':
      return {
        key,
        kicker: 'MIJLPAAL 1 VAN 3',
        title: `${mw.third} weken consistent belast`,
        body: `Je zit op een derde van de rit. Peesweefsel bouwt langzaam op, en precies de belasting die je nu geeft is wat de pees steviger maakt. Blijf dit volhouden, ook op de dagen dat het al beter voelt.`,
      }
    case 'twoThirds':
      return {
        key,
        kicker: 'MIJLPAAL 2 VAN 3',
        title: `${mw.twoThirds} weken, twee derde`,
        body: `De pees wordt sterker, ook al merk je dat niet elke dag even goed. Deze fase is waar veel mensen afhaken omdat de pijn weg is. Juist nu doorgaan zorgt dat het ook wegblijft.`,
      }
    case 'complete':
      return {
        key,
        kicker: 'MIJLPAAL 3 VAN 3',
        title: `${mw.complete} weken belast`,
        body: `Vanaf nu gaan we echte verandering in de pees zien. We zijn er alleen nog niet: een pees blijft zich aanpassen zolang je hem blijft belasten. Houd deze oefeningen vast, ook nu het goed gaat.`,
      }
  }
}

/**
 * Drie oplopende dag-herinneringen (max 3 per dag), voor de push-cron.
 * Index 0 = eerste prompt, 2 = laatste van de dag. Nadruk op consistentie,
 * niet op schuld.
 */
export const REMINDER_COPY: Array<{ title: string; body: string }> = [
  {
    title: 'Je peesoefeningen staan klaar',
    body: 'Even je ronde van vandaag doen. Bij peesklachten is dagelijks belasten wat het herstel op gang houdt.',
  },
  {
    title: 'Je oefeningen staan nog open',
    body: 'De winst zit in de herhaling, dag na dag. Pak je oefeningen er even bij, het kost je een paar minuten.',
  },
  {
    title: 'Laatste herinnering voor vandaag',
    body: 'Een dag overslaan haalt je niet onderuit, maar consistentie is precies wat een pees sterker maakt. Doe je ronde als het je lukt.',
  },
]

// ── Dag-status (reminder-state) ─────────────────────────────────────────────

/** NL-kalenderdag [start, eind) als instants, voor "vandaag"-filters. */
export function nlDayRange(now = new Date()): { start: Date; end: Date } {
  const key = dateKey(now)
  return { start: amsMidnight(key), end: amsMidnight(addDaysKey(key, 1)) }
}

export interface ReminderState {
  hasProgram: boolean
  programId: string | null
  dailyTarget: number | null
  /** Aantal oefeningen dat zijn dagdoel nog niet gehaald heeft. */
  exercisesRemaining: number
  /** Totaal openstaande rondes vandaag (som van target - gedaan per oefening). */
  remaining: number
}

/**
 * Actief tendinopathie-programma met een ingesteld dagdoel + hoeveel er vandaag
 * nog openstaat. Puur lezend, herbruikbaar buiten tRPC-context (cron). Neemt
 * het oudste actieve tendinopathie-programma als de patient er meerdere heeft.
 */
export async function getTendinopathyReminderState(
  prisma: PrismaClient,
  userId: string,
  now = new Date(),
): Promise<ReminderState> {
  const program = await prisma.program.findFirst({
    where: {
      patientId: userId,
      status: 'ACTIVE',
      tendinopathyMode: true,
      dailyTarget: { not: null },
      exercises: { some: {} },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      dailyTarget: true,
      exercises: { select: { exerciseId: true }, distinct: ['exerciseId'] },
    },
  })

  if (!program || !program.dailyTarget) {
    return { hasProgram: false, programId: null, dailyTarget: null, exercisesRemaining: 0, remaining: 0 }
  }

  const { start, end } = nlDayRange(now)
  const logs = await prisma.exerciseLog.findMany({
    where: {
      session: { patientId: userId, programId: program.id, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
    },
    select: { exerciseId: true },
  })

  const doneByExercise = new Map<string, number>()
  for (const l of logs) doneByExercise.set(l.exerciseId, (doneByExercise.get(l.exerciseId) ?? 0) + 1)

  let exercisesRemaining = 0
  let remaining = 0
  for (const ex of program.exercises) {
    const done = doneByExercise.get(ex.exerciseId) ?? 0
    const left = Math.max(0, program.dailyTarget - done)
    if (left > 0) exercisesRemaining++
    remaining += left
  }

  return {
    hasProgram: true,
    programId: program.id,
    dailyTarget: program.dailyTarget,
    exercisesRemaining,
    remaining,
  }
}
