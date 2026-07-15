/**
 * Patient tRPC router — replaces all mock-data functions for the patient section.
 *
 * Procedures:
 * - getTodayExercises   → session page exercise list
 * - getActiveProgram    → full program for schedule / program-detail page
 * - logSession          → save completed session + exercise logs
 * - getSessionHistory   → history / dashboard last session
 * - getRecoverySessions → muscle recovery calculation input
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { muscleLoadsRecord } from '@/server/lib/muscle-loads'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { auditLog } from '@/server/audit'
import { signEducationFile } from '@/lib/education/storage'
import { paceSecPerKm } from '@/lib/cardio-zones'
import { parseStructured, flattenSteps, totalDurationSec, STEP_META } from '@/lib/cardio-workout'
import { estimateOneRepMax } from '@/lib/one-rep-max'
import { clampSessionDurationSec } from '@/lib/training-load'
import { syncHashtagsForLog } from '@/server/tags'
import type { PrismaClient } from '@prisma/client'

// ─── helpers ──────────────────────────────────────────────────────────────────

// Laatst gelogde waarden van een oefening — voor "vorige keer"-hints en
// prefill in de sessie-runner (progressive overload).
export type LastExerciseLog = {
  weight: number | null
  weightsPerSet: Array<number | null> | null
  repsPerSet: Array<number | null> | null
  repsCompleted: number | null
  setsCompleted: number | null
  completedAt: string | null
  // Eenheid + extra parameters van de laatste keer — zodat de sessie-runner
  // sec/min/m en Tempo/RPE/Band kleur kan onthouden (repUnit-memory).
  repUnit: string | null
  extraParams: unknown
}

async function lastLogsForExercises(
  prisma: Pick<PrismaClient, 'exerciseLog'>,
  patientId: string,
  exerciseIds: string[],
): Promise<Record<string, LastExerciseLog>> {
  if (exerciseIds.length === 0) return {}
  // Recentste logs eerst; per exerciseId wint de eerste. `take` begrenst de
  // scan — een sessie-dag heeft zelden >15 oefeningen, dus 300 dekt ruim.
  const logs = await prisma.exerciseLog.findMany({
    where: {
      exerciseId: { in: exerciseIds },
      session: { patientId, status: 'COMPLETED' },
    },
    orderBy: { session: { completedAt: { sort: 'desc', nulls: 'last' } } },
    take: 300,
    select: {
      exerciseId: true,
      weight: true,
      weightsPerSet: true,
      repsPerSet: true,
      repsCompleted: true,
      setsCompleted: true,
      repUnit: true,
      extraParams: true,
      session: { select: { completedAt: true } },
    },
  })
  const out: Record<string, LastExerciseLog> = {}
  for (const log of logs) {
    if (out[log.exerciseId]) continue
    out[log.exerciseId] = {
      weight: log.weight,
      weightsPerSet: Array.isArray(log.weightsPerSet)
        ? (log.weightsPerSet as Array<number | null>)
        : null,
      repsPerSet: Array.isArray(log.repsPerSet)
        ? (log.repsPerSet as Array<number | null>)
        : null,
      repsCompleted: log.repsCompleted,
      setsCompleted: log.setsCompleted,
      completedAt: log.session.completedAt?.toISOString() ?? null,
      repUnit: log.repUnit,
      extraParams: log.extraParams ?? null,
    }
  }
  return out
}

function computeCurrentWeekDay(
  startDate: Date | null,
  programWeeks: number,
  exerciseWeeks: number[]
): { week: number; day: number } {
  const today = new Date()
  const start = startDate ?? today
  const daysSince = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000))
  const week = Math.min(Math.floor(daysSince / 7) + 1, programWeeks)

  const daysAvailable = [...new Set(exerciseWeeks)].sort((a, b) => a - b)
  const dayIndex = daysSince % Math.max(daysAvailable.length, 1)
  const day = daysAvailable[dayIndex] ?? 1

  return { week, day }
}

function mapProgramExercise(pe: {
  id: string
  exerciseId: string
  week: number
  day: number
  order: number
  sets: number
  setsMax?: number | null
  reps: number
  repsMax?: number | null
  repUnit: string
  restTime: number
  supersetGroup: string | null
  supersetOrder: number
  notes: string | null
  intensityType?: string
  intensityMin?: number | null
  intensityMax?: number | null
  intensityText?: string | null
  extraParams?: unknown
  exercise: {
    name: string
    category: string
    difficulty: string
    description?: string | null
    videoUrl: string | null
    muscleLoads?: { muscle: string; load: number }[]
    easierVariantId: string | null
    harderVariantId: string | null
    trackOneRepMax?: boolean
    defaultExtraParams?: unknown
    instructions?: string[]
    tips?: string[]
    easierVariant?: { name: string } | null
    harderVariant?: { name: string } | null
  }
}) {
  return {
    uid: pe.id,
    exerciseId: pe.exerciseId,
    week: pe.week,
    day: pe.day,
    name: pe.exercise.name,
    category: pe.exercise.category,
    difficulty: pe.exercise.difficulty,
    description: pe.exercise.description ?? null,
    sets: pe.sets,
    // Bereik-voorschrift ("3-5 sets" / "8-12 reps"): null = enkele waarde.
    setsMax: pe.setsMax ?? null,
    reps: pe.reps,
    repsMax: pe.repsMax ?? null,
    repUnit: pe.repUnit,
    restTime: pe.restTime,
    videoUrl: pe.exercise.videoUrl ?? null,
    muscleLoads: pe.exercise.muscleLoads
      ? muscleLoadsRecord({ category: pe.exercise.category, muscleLoads: pe.exercise.muscleLoads })
      : {} as Record<string, number>,
    supersetGroup: pe.supersetGroup ?? null,
    supersetOrder: pe.supersetOrder,
    notes: pe.notes ?? null,
    // Intensiteits-voorschrift — de session-runner toont dit als doel-badge en
    // rekent het (waar mogelijk) om naar kg. Zie @/lib/prescription.
    intensityType: pe.intensityType ?? 'NONE',
    intensityMin: pe.intensityMin ?? null,
    intensityMax: pe.intensityMax ?? null,
    intensityText: pe.intensityText ?? null,
    // Door de therapeut ingestelde extra voorschrift-parameters (Tempo,
    // Gewicht, Afstand, Hartslag, Moeite, Band kleur, …). Read-only doel-info
    // voor de runner — losstaand van de invulbare defaultExtraParams.
    programExtraParams: Array.isArray(pe.extraParams) ? pe.extraParams : [],
    easierVariantId: pe.exercise.easierVariantId ?? null,
    harderVariantId: pe.exercise.harderVariantId ?? null,
    // Coaching-cues uit de oefening-library (instructions + tips) en de namen
    // van de makkelijker/zwaarder-varianten — voor het sessie-scherm.
    instructions: pe.exercise.instructions ?? [],
    tips: pe.exercise.tips ?? [],
    easierVariantName: pe.exercise.easierVariant?.name ?? null,
    harderVariantName: pe.exercise.harderVariant?.name ?? null,
    trackOneRepMax: pe.exercise.trackOneRepMax ?? false,
    defaultExtraParams: Array.isArray(pe.exercise.defaultExtraParams)
      ? (pe.exercise.defaultExtraParams as Array<Record<string, unknown>>)
      : [],
  }
}

// ─── router ───────────────────────────────────────────────────────────────────

export const patientRouter = createTRPCRouter({

  // ── Active program (full, for schedule / program detail) ─────────────────

  getActiveProgram: protectedProcedure
    .input(z.object({ programId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const program = await ctx.prisma.program.findFirst({
      where: {
        patientId: ctx.user.id,
        status: 'ACTIVE',
        // Zonder specifiek verzoek: alleen programma's die daadwerkelijk
        // oefeningen hebben. Anders kan een leeg ACTIVE-programma (bv. een
        // rehab-placeholder zonder oefeningen) als "actief" terugkomen en blijft
        // het weekschema leeg terwijl er wél een echt programma is.
        ...(input?.programId ? { id: input.programId } : { exercises: { some: {} } }),
      },
      // Deterministische default als de patient meerdere actieve programma's
      // heeft en er geen specifieke wordt opgevraagd: oudste eerst.
      orderBy: { createdAt: 'asc' },
      include: {
        exercises: {
          include: {
            exercise: { include: { muscleLoads: true } },
          },
          orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
        },
        resources: {
          include: { resource: true },
          orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
        },
      },
    })

    if (!program) return null

    const exercises = program.exercises.map(mapProgramExercise)

    // Educatie-blokken — PDF's krijgen een tijdelijke signed URL.
    const resources = await Promise.all(program.resources.map(async pr => ({
      uid: pr.id,
      resourceId: pr.resourceId,
      title: pr.resource.title,
      description: pr.resource.description ?? null,
      format: pr.resource.format as 'VIDEO' | 'PDF',
      videoUrl: pr.resource.videoUrl ?? null,
      thumbnailUrl: pr.resource.thumbnailUrl ?? null,
      fileUrl: pr.resource.format === 'PDF' ? await signEducationFile(pr.resource.filePath) : null,
      week: pr.week,
      day: pr.day,
    })))

    // Group by week → day
    const byWeekDay: Record<number, Record<number, typeof exercises>> = {}
    for (const ex of exercises) {
      if (!byWeekDay[ex.week]) byWeekDay[ex.week] = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(byWeekDay[ex.week] as any)[ex.day]) (byWeekDay[ex.week] as Record<number, typeof exercises>)[ex.day] = []
      ;(byWeekDay[ex.week] as Record<number, typeof exercises>)[ex.day].push(ex)
    }

    const resourcesByWeekDay: Record<number, Record<number, typeof resources>> = {}
    for (const r of resources) {
      if (!resourcesByWeekDay[r.week]) resourcesByWeekDay[r.week] = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(resourcesByWeekDay[r.week] as any)[r.day]) (resourcesByWeekDay[r.week] as Record<number, typeof resources>)[r.day] = []
      ;(resourcesByWeekDay[r.week] as Record<number, typeof resources>)[r.day].push(r)
    }

    const { week: currentWeek, day: currentDay } = computeCurrentWeekDay(
      program.startDate,
      program.weeks,
      exercises.map(e => e.day)
    )

    // Verplaatste sessies in de huidige week — voor de schema-weergave.
    const sessionMoves = await ctx.prisma.sessionMove.findMany({
      where: { patientId: ctx.user.id, programId: program.id, week: currentWeek },
      select: { fromDay: true, toDay: true },
    })

    return {
      id: program.id,
      name: program.name,
      description: program.description ?? null,
      status: program.status,
      weeks: program.weeks,
      daysPerWeek: program.daysPerWeek,
      startDate: program.startDate?.toISOString() ?? null,
      currentWeek,
      currentDay,
      exercises,
      byWeekDay,
      resources,
      resourcesByWeekDay,
      sessionMoves,
    }
  }),

  // ── Active programs (lichtgewicht lijst — voor de keuze bij meerdere) ─────
  // Geeft álle actieve, niet-template programma's van de patient terug zodat
  // de app een keuzescherm kan tonen wanneer er meer dan één is.

  getActivePrograms: protectedProcedure.query(async ({ ctx }) => {
    const programs = await ctx.prisma.program.findMany({
      where: { patientId: ctx.user.id, status: 'ACTIVE', isTemplate: false },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        weeks: true,
        daysPerWeek: true,
        startDate: true,
        flexibleSchedule: true,
        weeklyTarget: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const now = Date.now()
    return programs.map(p => {
      const start = p.startDate?.getTime() ?? now
      const daysSince = Math.max(0, Math.floor((now - start) / 86_400_000))
      const currentWeek = Math.min(Math.floor(daysSince / 7) + 1, p.weeks)
      return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        type: p.type,
        weeks: p.weeks,
        daysPerWeek: p.daysPerWeek,
        currentWeek,
        flexibleSchedule: p.flexibleSchedule,
        weeklyTarget: p.weeklyTarget ?? null,
      }
    })
  }),

  // ── Sessie verplaatsen binnen de week ─────────────────────────────────────
  // "Vandaag geen tijd → doe ik donderdag." Eén verplaatsing per programma-dag
  // per week; fromDay === toDay zet 'm terug (rij verwijderen). Alleen eigen
  // actieve programma's.

  moveSession: protectedProcedure
    .input(z.object({
      programId: z.string(),
      week: z.number().int().min(1).max(104),
      fromDay: z.number().int().min(1).max(7),
      toDay: z.number().int().min(1).max(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const program = await ctx.prisma.program.findFirst({
        where: { id: input.programId, patientId: ctx.user.id, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!program) throw new TRPCError({ code: 'NOT_FOUND' })

      if (input.fromDay === input.toDay) {
        await ctx.prisma.sessionMove.deleteMany({
          where: {
            patientId: ctx.user.id,
            programId: input.programId,
            week: input.week,
            fromDay: input.fromDay,
          },
        })
        return { moved: false }
      }

      await ctx.prisma.sessionMove.upsert({
        where: {
          patientId_programId_week_fromDay: {
            patientId: ctx.user.id,
            programId: input.programId,
            week: input.week,
            fromDay: input.fromDay,
          },
        },
        create: {
          patientId: ctx.user.id,
          programId: input.programId,
          week: input.week,
          fromDay: input.fromDay,
          toDay: input.toDay,
        },
        update: { toDay: input.toDay },
      })
      return { moved: true }
    }),

  // ── Today's exercises (for session page) ─────────────────────────────────

  getTodayExercises: protectedProcedure
    .input(
      z
        .object({
          patientId: z.string().optional(),
          // Specifiek programma opvragen wanneer de patient meerdere actieve
          // programma's heeft (keuze bij start). Leeg = deterministische
          // default (oudste actieve programma).
          programId: z.string().optional(),
          // Catch-up: laat patient een gemiste dag inhalen door specifiek
          // week/day op te vragen i.p.v. computeCurrentWeekDay.
          week: z.number().int().min(1).optional(),
          day: z.number().int().min(1).max(7).optional(),
          // Voer een specifiek gepland item uit de week-planner uit. Zonder dit
          // kan een quick-workout met inline oefeningen NIET gestart worden:
          // de runner viel terug op het oudste actieve programma, dus tikken op
          // workout B startte programma A. Weglaten = oude gedrag (programma).
          itemId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
    // Default = eigen user. Therapist kan patientId meegeven om door
    // patient's oogpunt te kijken (bv. live-behandeling flow).
    let targetPatientId = ctx.user.id
    if (input?.patientId && input.patientId !== ctx.user.id) {
      if (ctx.user.role !== 'THERAPIST' && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      // Toegang = directe PatientTherapist-relatie OF zelfde praktijk.
      const me = ctx.user
      const ok = await ctx.prisma.user.findFirst({
        where: {
          id: input.patientId,
          OR: [
            {
              patientTherapists: {
                some: {
                  therapistId: me.id,
                  isActive: true, status: 'APPROVED',
                },
              },
            },
            ...(me.practiceId ? [{ practiceId: me.practiceId }] : []),
          ],
        },
        select: { id: true },
      })
      if (!ok && me.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      targetPatientId = input.patientId
    }

    // ── Gepland item uit de week-planner ──────────────────────────────────
    // Een WORKOUT-item draagt zijn eigen oefeningen; die zijn de waarheid en
    // hebben niets met de week/dag-rekensom van een programma te maken. Een
    // PROGRAM-item is een verwijzing: die valt door naar het programma-pad.
    let programIdOverride: string | undefined = input?.programId
    if (input?.itemId) {
      const item = await ctx.prisma.weekScheduleDayItem.findFirst({
        where: {
          id: input.itemId,
          kind: { in: ['PROGRAM', 'WORKOUT'] },
          day: { weekSchedule: { patientId: targetPatientId, isTemplate: false } },
        },
        include: {
          exercises: {
            orderBy: [{ order: 'asc' }],
            include: {
              exercise: {
                select: {
                  name: true, category: true, difficulty: true, description: true,
                  videoUrl: true, easierVariantId: true, harderVariantId: true,
                  trackOneRepMax: true, defaultExtraParams: true,
                  instructions: true, tips: true,
                  easierVariant: { select: { name: true } },
                  harderVariant: { select: { name: true } },
                },
              },
            },
          },
        },
      })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Geplande workout niet gevonden' })

      if (item.kind === 'WORKOUT') {
        const exercises = item.exercises.map(e =>
          mapProgramExercise({
            ...e,
            // Een planner-item hangt aan een kalenderdag, niet aan een
            // week/dag-raster. 1/1 is hier louter vormvereiste.
            week: 1,
            day: 1,
            restTime: e.restTime ?? 60,
          }),
        )
        const lastLogs = await lastLogsForExercises(
          ctx.prisma,
          targetPatientId,
          [...new Set(exercises.map(e => e.exerciseId))],
        )
        return {
          program: null,
          // Additief veld: oude clients negeren het, de web-runner gebruikt het
          // om te tonen wát hij draait en om de sessie eraan te koppelen.
          plannedItem: {
            id: item.id,
            name: item.quickName ?? 'Workout',
            category: item.quickCategory ?? null,
            activity: item.quickActivity ?? null,
            durationSec: item.plannedDurationSec ?? item.quickDurationSec ?? null,
            plannedRpe: item.plannedRpe ?? null,
            notes: item.notes,
            // De gestructureerde cardio-workout (warming-up / intervallen /
            // cooldown). Tot nu toe bleef die bij de therapeut hangen: het
            // cardioscherm van de atleet was volledig handinvoer.
            // Begrensd gecast → geen recursief Prisma JsonValue (TS2589).
            cardio: (item.cardioParams ?? null) as Record<string, unknown> | null,
          },
          exercises,
          lastLogs,
        }
      }
      // PROGRAM-item → het gekoppelde programma draaien.
      programIdOverride = item.programId ?? undefined
    }

    const program = await ctx.prisma.program.findFirst({
      where: {
        patientId: targetPatientId,
        status: 'ACTIVE',
        ...(programIdOverride ? { id: programIdOverride } : {}),
      },
      // Deterministische default bij meerdere actieve programma's: oudste eerst.
      orderBy: { createdAt: 'asc' },
      include: {
        exercises: {
          include: {
            exercise: {
              select: {
                name: true, category: true, difficulty: true, description: true,
                videoUrl: true, easierVariantId: true, harderVariantId: true,
                trackOneRepMax: true, defaultExtraParams: true,
                instructions: true, tips: true,
                easierVariant: { select: { name: true } },
                harderVariant: { select: { name: true } },
              },
            },
          },
          orderBy: [{ order: 'asc' }],
        },
      },
    })

    // plannedItem: null meegeven zodat alle takken dezelfde vorm hebben — anders
    // is de union voor de client niet te narrowen.
    if (!program) return { program: null, plannedItem: null, exercises: [], lastLogs: {} as Record<string, LastExerciseLog> }

    const allExercises = program.exercises.map(mapProgramExercise)

    // Vorige-sessie-hints: meest recente gelogde waarden per oefening, zodat
    // de sessie-runner "vorige keer 22,5 kg × 10" kan tonen en prefillen.
    const lastLogs = await lastLogsForExercises(
      ctx.prisma,
      targetPatientId,
      [...new Set(allExercises.map(e => e.exerciseId))],
    )

    // Flexible-schedule modus: patient mag elke dag het hele programma starten;
    // klaar zodra weeklyTarget keer voltooid in de huidige week (Mo-Su).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flexible = (program as any).flexibleSchedule === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weeklyTarget = (program as any).weeklyTarget as number | null | undefined

    if (flexible && weeklyTarget && weeklyTarget > 0) {
      // Bereken huidige week (Mo-Su) in patient's lokale TZ via server.
      const now = new Date()
      const day0 = now.getDay()  // 0=Su..6=Sa
      const offsetFromMon = (day0 + 6) % 7
      const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - offsetFromMon)
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7)

      const completedThisWeek = await ctx.prisma.sessionLog.count({
        where: {
          patientId: targetPatientId,
          programId: program.id,
          completedAt: { gte: weekStart, lt: weekEnd },
        },
      })

      // Programma-week bepalen op basis van startDate: progressie over
      // meerdere weken (bv. week 1 inwerken, week 4 zwaarder) blijft mogelijk.
      // Cap aan program.weeks; en val terug op hoogste week-met-oefeningen
      // wanneer de therapeut nog niet alle weken heeft ingevuld.
      const start = program.startDate ?? now
      const daysSince = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000))
      const elapsedWeek = Math.floor(daysSince / 7) + 1
      const weeksWithExercises = [...new Set(allExercises.map(e => e.week))].sort((a, b) => a - b)
      const maxAvailable = weeksWithExercises[weeksWithExercises.length - 1] ?? 1
      const currentProgramWeek = Math.min(elapsedWeek, Math.min(program.weeks, maxAvailable))

      // Filter naar oefeningen voor de huidige programma-week. Dag wordt
      // genegeerd in flex-modus (patient kiest dag zelf).
      const exercisesPool = allExercises.filter(e => e.week === currentProgramWeek)

      const targetReached = completedThisWeek >= weeklyTarget

      return {
        // plannedItem hoort in elke tak te zitten (uniforme union).
        plannedItem: null,
        program: {
          id: program.id,
          name: program.name,
          currentWeek: currentProgramWeek,
          currentDay: 1,
          movedToDay: null as number | null,
          weeks: program.weeks,
          isCatchUp: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tendinopathyMode: (program as any).tendinopathyMode ?? false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackOneRepMax: (program as any).trackOneRepMax ?? false,
          flexibleSchedule: true,
          weeklyTarget,
          completedThisWeek,
          weeklyTargetReached: targetReached,
          // Zonder dit stond de week-voortgang op iOS permanent op 0%:
          // de client deelt door daysPerWeek en die ontbrak in de payload.
          daysPerWeek: program.daysPerWeek,
        },
        // Wanneer target bereikt: lege lijst zodat oude clients (iOS) niet
        // dezelfde oefeningen opnieuw aanbieden. Web-app gebruikt
        // weeklyTargetReached om de "lekker bezig" boodschap te tonen.
        exercises: targetReached ? [] : exercisesPool,
        lastLogs,
      }
    }

    const computed = computeCurrentWeekDay(
      program.startDate,
      program.weeks,
      [...new Set(allExercises.map(e => e.day))]
    )

    // Catch-up override: als client expliciet week+day meegeeft (gemiste dag inhalen)
    // gebruiken we die i.p.v. de berekende huidige dag.
    const week = input?.week ?? computed.week
    const day = input?.day ?? computed.day
    const isCatchUp = input?.week !== undefined || input?.day !== undefined

    // Sessie-verplaatsingen binnen deze week ("doe ik donderdag"). Alleen in de
    // default vandaag-flow; expliciete catch-up laat de keuze bij de gebruiker.
    let effectiveDay = day
    let movedToDay: number | null = null
    if (!isCatchUp) {
      const moves = await ctx.prisma.sessionMove.findMany({
        where: { patientId: targetPatientId, programId: program.id, week },
      })
      if (moves.length > 0) {
        const d0 = new Date().getDay()
        const todayWeekday = d0 === 0 ? 7 : d0
        const movedIn = moves.find(m => m.toDay === todayWeekday)
        const movedAway = moves.find(m => m.fromDay === day && m.toDay !== todayWeekday)
        if (movedIn) {
          // Vandaag is het doel van een verplaatsing → serveer die programma-dag.
          effectiveDay = movedIn.fromDay
        } else if (movedAway) {
          // De sessie van vandaag is vooruitgeschoven → vandaag niets.
          movedToDay = movedAway.toDay
          effectiveDay = -1
        }
      }
    }

    const todayExercises =
      effectiveDay === -1 ? [] : allExercises.filter(e => e.week === week && e.day === effectiveDay)

    return {
      // plannedItem hoort in elke tak te zitten (uniforme union).
      plannedItem: null,
      program: {
        id: program.id,
        name: program.name,
        currentWeek: week,
        // Bij een naar-vandaag-verplaatste sessie toont de header de dag die
        // daadwerkelijk gedaan wordt.
        currentDay: effectiveDay !== -1 ? effectiveDay : day,
        // Weekdag (1=ma..7=zo) waarnaar de sessie van vandaag is verplaatst;
        // null = niet verplaatst.
        movedToDay,
        weeks: program.weeks,
        isCatchUp,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tendinopathyMode: (program as any).tendinopathyMode ?? false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackOneRepMax: (program as any).trackOneRepMax ?? false,
        flexibleSchedule: false,
        weeklyTarget: null,
        daysPerWeek: program.daysPerWeek,
        completedThisWeek: 0,
        weeklyTargetReached: false,
      },
      exercises: todayExercises,
      lastLogs,
    }
  }),

  // ── Log a completed session ───────────────────────────────────────────────

  logSession: protectedProcedure
    .input(
      z.object({
        programId: z.string().optional(),
        // Het geplande item dat deze sessie afvinkt. Zonder dit valt de
        // planner terug op matchen per datum + teller, waardoor twee workouts
        // op één dag niet te onderscheiden zijn. Optioneel: iOS stuurt 'm nog
        // niet mee.
        weekScheduleDayItemId: z.string().optional(),
        scheduledAt: z.string(),       // ISO date string
        completedAt: z.string(),       // ISO date string
        durationSeconds: z.number().int().min(0).max(86_400),
        painLevel: z.number().int().min(0).max(10).nullable(),
        exertionLevel: z.number().int().min(0).max(10).nullable(),
        // Subjectief gevoel 1-5 (smiley) — zelfde veld als de therapeut-flow.
        feelScore: z.number().int().min(1).max(5).nullable().optional(),
        notes: z.string().max(2000).optional(),
        // False = eerder gestopt: niet alle oefeningen afgevinkt bij afronden.
        completedAll: z.boolean().optional(),
        // Cap de array-lengte tegen werk-amplificatie; getallen begrensd zodat
        // een atleet de 1RM/belasting-curve niet met absurde waarden vergiftigt
        // (weight/1RM ook in Newton voor krachttesten → ruime bovengrens).
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).max(1000).optional(),
            repsCompleted: z.number().int().min(0).max(100_000).optional(),
            repUnit: z.string().max(20).optional(),
            painLevel: z.number().int().min(0).max(10).nullable().optional(),
            weight: z.number().min(0).max(100_000).nullable().optional(),
            weightsPerSet: z.array(z.number().min(0).max(100_000).nullable()).max(50).nullable().optional(),
            repsPerSet: z.array(z.number().int().min(0).max(100_000).nullable()).max(50).nullable().optional(),
            // Extra parameters (Tempo, RPE, Band kleur, …) — zelfde shape als
            // het therapeut-scherm; begrensd tegen payload-misbruik.
            extraParams: z.array(z.object({
              label: z.string().min(1).max(60),
              type: z.string().max(20).optional(),
              value: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]),
              unit: z.string().max(20).optional(),
            })).max(20).nullable().optional(),
            estimatedOneRepMax: z.number().min(0).max(100_000).nullable().optional(),
            painDuring: z.number().int().min(0).max(10).nullable().optional(),
          })
        ).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.logSession', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }

      // Een item mag alleen afgevinkt worden als het op het eigen weekschema
      // staat. Anders kan een patiënt zijn sessie aan de planning van een ander
      // hangen en daar de gepland/gehaald-cijfers mee vervuilen.
      let linkedItemId: string | undefined
      if (input.weekScheduleDayItemId) {
        const owned = await ctx.prisma.weekScheduleDayItem.findFirst({
          where: {
            id: input.weekScheduleDayItemId,
            day: { weekSchedule: { patientId: ctx.user.id, isTemplate: false } },
          },
          select: { id: true },
        })
        if (!owned) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Deze geplande workout hoort niet bij jou' })
        }
        linkedItemId = owned.id
      }

      // Zelfde regel als hierboven, maar dan voor het programma: alleen aan je
      // eigen programma hangen. Anders kan een geraden programId in de log en
      // lekt de programmanaam terug via sessionDetail/calendarRange.
      if (input.programId) {
        const ownProgram = await ctx.prisma.program.findFirst({
          where: { id: input.programId, patientId: ctx.user.id },
          select: { id: true },
        })
        if (!ownProgram) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Dit programma hoort niet bij jou' })
        }
      }

      const sessionLog = await ctx.prisma.sessionLog.create({
        data: {
          patientId: ctx.user.id,
          weekScheduleDayItemId: linkedItemId,
          // Markeer expliciet als zelf-gelogd (patient == therapist). Zo kan de
          // UI in collega-historie "Patiënt zelf" tonen i.p.v. "—" (legacy).
          therapistId: ctx.user.id,
          programId: input.programId ?? undefined,
          scheduledAt: new Date(input.scheduledAt),
          completedAt: new Date(input.completedAt),
          status: 'COMPLETED',
          completedAll: input.completedAll ?? true,
          // Kap absurde duren (doorgelopen timer) zodat ze de belasting-curve niet vergiftigen.
          duration: clampSessionDurationSec(input.durationSeconds),
          painLevel: input.painLevel,
          exertionLevel: input.exertionLevel,
          feelScore: input.feelScore ?? null,
          notes: input.notes ?? undefined,
          exerciseLogs: {
            create: input.exercises.map(ex => ({
              exerciseId: ex.exerciseId,
              setsCompleted: ex.setsCompleted ?? null,
              repsCompleted: ex.repsCompleted ?? null,
              repUnit: ex.repUnit ?? null,
              painLevel: ex.painLevel ?? null,
              weight: ex.weight ?? null,
              weightsPerSet: ex.weightsPerSet ?? undefined,
              repsPerSet: ex.repsPerSet ?? undefined,
              extraParams: ex.extraParams && ex.extraParams.length > 0 ? ex.extraParams : undefined,
              // Epley-fallback server-side: vóór deze fix werd 1RM alleen
              // client-side berekend als program.trackOneRepMax aanstond —
              // die vlag staat vrijwel nergens aan, dus 1RM-data bleef leeg
              // terwijl gewicht + reps wél gelogd werden.
              estimatedOneRepMax: ex.estimatedOneRepMax
                ?? estimateOneRepMax(ex.weight, ex.repsCompleted),
              painDuring: ex.painDuring ?? null,
            })),
          },
        },
        select: { id: true },
      })
      await auditLog({
        event: 'SESSION_LOGGED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'SessionLog',
        resourceId: sessionLog.id,
        metadata: {
          exerciseCount: input.exercises.length,
          durationSeconds: input.durationSeconds,
        },
        req: ctx.req,
      })
      // Klacht-/aandachts-hashtags uit de notitie (#achillespees) — faalt stil,
      // mag de zojuist opgeslagen sessie nooit terugdraaien.
      await syncHashtagsForLog(ctx.prisma, {
        patientId: ctx.user.id,
        taggedById: ctx.user.id,
        loggedAt: new Date(input.completedAt),
        notes: input.notes,
        target: { sessionLogId: sessionLog.id },
      })
      return sessionLog
    }),

  // ── Eigen gelogde sessie bijwerken ────────────────────────────────────────

  /**
   * Corrigeer een sessie die je zelf hebt gelogd (typo in een gewicht, set
   * vergeten). Spiegelt `patients.updateSessionLog` uit de therapeut-flow —
   * zelfde "alles is editable na opslaan"-intentie — maar alleen op je eigen
   * sessies: een andere `patientId` is FORBIDDEN, ook voor een therapeut die
   * hier per ongeluk belandt (die heeft z'n eigen endpoint mét access-check).
   * ExerciseLogs worden volledig vervangen i.p.v. gediffed.
   */
  updateSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        completedAt: z.string().optional(),
        durationSeconds: z.number().int().min(0).max(86_400).optional(),
        painLevel: z.number().int().min(0).max(10).nullable().optional(),
        exertionLevel: z.number().int().min(0).max(10).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        // Zelfde begrenzingen als logSession — een edit mag geen achterdeur
        // zijn om de 1RM-/belasting-curve met absurde waarden te vergiftigen.
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).max(1000).optional(),
            repsCompleted: z.number().int().min(0).max(100_000).optional(),
            weight: z.number().min(0).max(100_000).nullable().optional(),
            weightsPerSet: z.array(z.number().min(0).max(100_000).nullable()).max(50).nullable().optional(),
            repsPerSet: z.array(z.number().int().min(0).max(100_000).nullable()).max(50).nullable().optional(),
            extraParams: z.array(z.object({
              label: z.string().min(1).max(60),
              type: z.string().max(20).optional(),
              value: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]),
              unit: z.string().max(20).optional(),
            })).max(20).nullable().optional(),
            estimatedOneRepMax: z.number().min(0).max(100_000).nullable().optional(),
          })
        ).max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.logSession', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }

      const session = await ctx.prisma.sessionLog.findUnique({
        where: { id: input.sessionId },
        select: { patientId: true, completedAt: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sessie niet gevonden' })
      }
      if (session.patientId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const updates: Record<string, unknown> = {}
      if (input.completedAt) updates.completedAt = new Date(input.completedAt)
      if (input.durationSeconds !== undefined) {
        updates.duration = clampSessionDurationSec(input.durationSeconds)
      }
      if (input.painLevel !== undefined) updates.painLevel = input.painLevel
      if (input.exertionLevel !== undefined) updates.exertionLevel = input.exertionLevel
      if (input.notes !== undefined) updates.notes = input.notes ?? null

      await ctx.prisma.$transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
          await tx.sessionLog.update({ where: { id: input.sessionId }, data: updates })
        }
        if (input.exercises) {
          await tx.exerciseLog.deleteMany({ where: { sessionId: input.sessionId } })
          if (input.exercises.length > 0) {
            await tx.exerciseLog.createMany({
              data: input.exercises.map((ex) => ({
                sessionId: input.sessionId,
                exerciseId: ex.exerciseId,
                setsCompleted: ex.setsCompleted ?? null,
                repsCompleted: ex.repsCompleted ?? null,
                weight: ex.weight ?? null,
                weightsPerSet: (ex.weightsPerSet ?? undefined) as never,
                repsPerSet: (ex.repsPerSet ?? undefined) as never,
                extraParams: (ex.extraParams && ex.extraParams.length > 0
                  ? ex.extraParams
                  : undefined) as never,
                estimatedOneRepMax: ex.estimatedOneRepMax
                  ?? estimateOneRepMax(ex.weight, ex.repsCompleted),
              })),
            })
          }
        }
      })

      await auditLog({
        event: 'SESSION_LOGGED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'SessionLog',
        resourceId: input.sessionId,
        metadata: { edited: true, exerciseCount: input.exercises?.length ?? 0 },
        req: ctx.req,
      })

      // Notitie-edit kan hashtags toevoegen/verwijderen → hersync (idempotent).
      if (input.notes !== undefined) {
        await syncHashtagsForLog(ctx.prisma, {
          patientId: ctx.user.id,
          taggedById: ctx.user.id,
          loggedAt: input.completedAt
            ? new Date(input.completedAt)
            : session.completedAt ?? new Date(),
          notes: input.notes ?? undefined,
          target: { sessionLogId: input.sessionId },
        })
      }

      return { id: input.sessionId }
    }),

  // ── Progressie per oefening (eigen historie) ──────────────────────────────
  // Voor het voortgang-grafiekje in de sessie-runner: zwaarste set + geschatte
  // 1RM per gelogde sessie, oud → nieuw. Alleen eigen data.

  exerciseProgress: protectedProcedure
    .input(z.object({
      exerciseId: z.string(),
      limit: z.number().int().min(3).max(30).default(15),
    }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.exerciseLog.findMany({
        where: {
          exerciseId: input.exerciseId,
          session: { patientId: ctx.user.id, status: 'COMPLETED' },
        },
        orderBy: { session: { completedAt: { sort: 'desc', nulls: 'last' } } },
        take: input.limit,
        select: {
          weight: true,
          weightsPerSet: true,
          repsCompleted: true,
          estimatedOneRepMax: true,
          session: { select: { completedAt: true, scheduledAt: true } },
        },
      })
      return logs.reverse().map(l => {
        const perSet = Array.isArray(l.weightsPerSet)
          ? (l.weightsPerSet as Array<number | null>).filter((w): w is number => w != null && w > 0)
          : []
        const best = Math.max(...perSet, l.weight ?? 0)
        return {
          date: (l.session.completedAt ?? l.session.scheduledAt).toISOString(),
          bestKg: best > 0 ? Math.round(best * 10) / 10 : null,
          est1Rm: l.estimatedOneRepMax != null && l.estimatedOneRepMax > 0
            ? Math.round(l.estimatedOneRepMax * 10) / 10
            : null,
          reps: l.repsCompleted,
        }
      })
    }),

  // ── Laatste log per oefening (vrije selectie) ─────────────────────────────
  // Voor de quick workout: ghost-waardes/"vorige keer"-hints bij oefeningen
  // die niet in het programma van vandaag zitten. Alleen eigen data
  // (patientId = ctx.user.id) → geen toegangscontrole nodig.

  lastExerciseLogs: protectedProcedure
    .input(z.object({ exerciseIds: z.array(z.string()).min(1).max(50) }))
    .query(async ({ ctx, input }) =>
      lastLogsForExercises(ctx.prisma, ctx.user.id, [...new Set(input.exerciseIds)])
    ),

  // ── Meest gebruikte oefeningen van de atleet zelf ────────────────────────
  // Voor de Quick Workout-picker: telt de eigen ExerciseLogs uit gelogde
  // sessies en geeft de vaakst gebruikte oefeningen terug, zodat de atleet ze
  // snel terugvindt zonder door de hele bibliotheek te scrollen. Alleen eigen
  // data (patientId = ctx.user.id) → geen toegangscontrole nodig.
  mostUsedExercises: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const take = input?.limit ?? 8
      const since = new Date()
      since.setDate(since.getDate() - 120) // 120d historie

      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: ctx.user.id,
          status: 'COMPLETED',
          completedAt: { gte: since },
        },
        select: { exerciseLogs: { select: { exerciseId: true } } },
      })

      const counts = new Map<string, number>()
      for (const s of sessions) {
        for (const el of s.exerciseLogs) {
          counts.set(el.exerciseId, (counts.get(el.exerciseId) ?? 0) + 1)
        }
      }
      const topIds = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, take)
        .map(([id]) => id)
      if (topIds.length === 0) return []

      // Alleen oefeningen die nog bestaan; behoud de count-volgorde.
      const exercises = await ctx.prisma.exercise.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, category: true, videoUrl: true },
      })
      return topIds
        .map((id) => {
          const ex = exercises.find((e) => e.id === id)
          if (!ex) return null
          return { ...ex, count: counts.get(id) ?? 0 }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    }),

  // ── Log a completed cardio session ───────────────────────────────────────

  logCardioSession: protectedProcedure
    .input(
      z.object({
        programId: z.string().nullable().optional(),
        // Het geplande cardio-item dat hiermee wordt afgevinkt. Optioneel:
        // iOS stuurt 'm nog niet mee, en ad-hoc cardio heeft geen plan.
        weekScheduleDayItemId: z.string().nullable().optional(),
        activity: z.enum([
          'RUNNING', 'CYCLING', 'ROWING', 'SWIMMING', 'CROSSTRAINER',
          'WALKING', 'SKIERG', 'ASSAULT_BIKE', 'WATTBIKE', 'STAIRCLIMBER', 'OTHER',
        ]),
        protocol: z.enum([
          'STEADY_STATE', 'INTERVALS', 'TEMPO', 'FARTLEK',
          'ZONE_TRAINING', 'THRESHOLD', 'LONG_SLOW_DISTANCE', 'WALK_RUN',
        ]),
        durationSec: z.number().int().min(0),
        distanceM: z.number().int().min(0).nullable().optional(),
        avgHeartRate: z.number().int().min(40).max(220).nullable().optional(),
        maxHeartRate: z.number().int().min(40).max(220).nullable().optional(),
        zone: z.number().int().min(1).max(5).nullable().optional(),
        targetZone: z.number().int().min(1).max(5).nullable().optional(),
        rpe: z.number().int().min(1).max(10).nullable().optional(),
        painLevel: z.number().int().min(0).max(10).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        // Werkelijk gelogde interval-breakdown.
        intervals: z
          .array(
            z.object({
              label: z.string().max(60).optional(),
              type: z.string().max(20).optional(),
              durationSec: z.number().int().min(0),
              distanceM: z.number().int().min(0).nullable().optional(),
              avgHeartRate: z.number().int().min(40).max(220).nullable().optional(),
            }),
          )
          .nullable()
          .optional(),
        // Tijd-in-zone (seconden per HR-zone): { "1": sec, ... }.
        timeInZones: z.record(z.string(), z.number().int().min(0)).nullable().optional(),
        // Wanneer de sessie is uitgevoerd. Leeg = nu (server-tijd). Laat de
        // patiënt een sessie van een eerdere dag achteraf loggen.
        completedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.logCardioSession', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }
      // Achteraf loggen mag, maar niet in de toekomst en niet absurd ver terug.
      let completedAt: Date | undefined
      if (input.completedAt) {
        const d = new Date(input.completedAt)
        const now = Date.now()
        if (d.getTime() > now + 60_000) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Datum mag niet in de toekomst liggen.' })
        }
        if (d.getTime() < now - 366 * 86_400_000) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Datum ligt te ver in het verleden (max. 1 jaar).' })
        }
        completedAt = d
      }
      const avgPaceSecPerKm = paceSecPerKm(input.distanceM, input.durationSec)
      // Alleen een item van het eigen weekschema mag afgevinkt worden; anders
      // kan iemand zijn cardio aan andermans planning hangen.
      let linkedItemId: string | null = null
      if (input.weekScheduleDayItemId) {
        const owned = await ctx.prisma.weekScheduleDayItem.findFirst({
          where: {
            id: input.weekScheduleDayItemId,
            day: { weekSchedule: { patientId: ctx.user.id, isTemplate: false } },
          },
          select: { id: true },
        })
        if (!owned) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Deze geplande workout hoort niet bij jou' })
        }
        linkedItemId = owned.id
      }

      // Zelfde regel voor het programma: alleen aan je eigen programma hangen.
      if (input.programId) {
        const ownProgram = await ctx.prisma.program.findFirst({
          where: { id: input.programId, patientId: ctx.user.id },
          select: { id: true },
        })
        if (!ownProgram) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Dit programma hoort niet bij jou' })
        }
      }

      const log = await ctx.prisma.cardioLog.create({
        data: {
          patientId: ctx.user.id,
          programId: input.programId ?? null,
          weekScheduleDayItemId: linkedItemId,
          activity: input.activity,
          protocol: input.protocol,
          durationSec: input.durationSec,
          distanceM: input.distanceM ?? null,
          avgHeartRate: input.avgHeartRate ?? null,
          maxHeartRate: input.maxHeartRate ?? null,
          zone: input.zone ?? null,
          targetZone: input.targetZone ?? null,
          rpe: input.rpe ?? null,
          painLevel: input.painLevel ?? null,
          notes: input.notes ?? null,
          avgPaceSecPerKm,
          intervals: input.intervals ?? undefined,
          timeInZones: input.timeInZones ?? undefined,
          // Undefined → DB-default now(). Gezet bij achteraf loggen.
          completedAt,
        },
        select: { id: true },
      })
      await auditLog({
        event: 'CARDIO_SESSION_LOGGED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'CardioLog',
        resourceId: log.id,
        metadata: {
          activity: input.activity,
          protocol: input.protocol,
          durationSec: input.durationSec,
        },
        req: ctx.req,
      })
      await syncHashtagsForLog(ctx.prisma, {
        patientId: ctx.user.id,
        taggedById: ctx.user.id,
        loggedAt: completedAt ?? new Date(),
        notes: input.notes,
        target: { cardioLogId: log.id },
      })
      return log
    }),

  // ── Active cardio program → genormaliseerde sessie ──────────────────────

  /**
   * Vindt het actieve CARDIO-programma van de ingelogde patiënt en converteert
   * het naar de shape die de cardio-session pagina verwacht.
   *
   * cardioParams is sinds 15 jul 2026 overal het blokken-model
   * ({version:1, activity, blocks} — zie de eerste tak). De platte en
   * WALK_RUN-takken eronder zijn leesbaarheid voor oude data: er bestond op
   * dat moment géén enkel cardio-programma in productie, maar oudere
   * app-builds (≤63) kunnen het platte formaat nog schrijven.
   */
  getActiveCardioProgram: protectedProcedure.query(async ({ ctx }) => {
    const program = await ctx.prisma.program.findFirst({
      where: { patientId: ctx.user.id, status: 'ACTIVE', type: 'CARDIO' },
      orderBy: { updatedAt: 'desc' },
    })
    if (!program) return null

    const params = (program.cardioParams ?? {}) as Record<string, unknown>

    // Bepaal current week (1-based) op basis van elapsed days sinds startDate.
    const start = program.startDate ?? program.createdAt
    const daysSince = Math.max(
      0,
      Math.floor((Date.now() - start.getTime()) / 86_400_000),
    )
    const weekIdx = Math.min(Math.floor(daysSince / 7), program.weeks - 1)
    const week = weekIdx + 1

    // ── Nieuw model: {version:1, activity, blocks} (iPad-bouwer) ────────────
    // Zonder deze tak viel een blocks-programma door naar het platte pad
    // hieronder en kreeg de patiënt een verzonnen "30 min zone 2 steady
    // state" zonder intervallen — het voorschrift van de therapeut was dan
    // stil vervangen door defaults.
    const structured = parseStructured(program.cardioParams)
    if (structured) {
      const steps = flattenSteps(structured.blocks)
      const flat: Array<{ label: string; type: 'WALK' | 'RUN'; durationSec: number }> = []
      const zoneSec = new Map<number, number>()
      for (const st of steps) {
        const sec = st.durationSec ?? 120
        const rustig = st.kind === 'RECOVERY' || st.kind === 'COOLDOWN'
        flat.push({
          label: STEP_META[st.kind].label,
          type: rustig ? 'WALK' : 'RUN',
          durationSec: sec,
        })
        if (!rustig && st.target?.type === 'ZONE') {
          zoneSec.set(st.target.zone, (zoneSec.get(st.target.zone) ?? 0) + sec)
        }
      }
      // Doelzone = de zone waar het meeste wérk in zit; de blokken zelf zijn
      // leidend, dit veld is samenvatting voor de oude client-weergave.
      const dominantZone = [...zoneSec.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      const targetZone = (dominantZone && dominantZone >= 1 && dominantZone <= 5
        ? dominantZone
        : 2) as 1 | 2 | 3 | 4 | 5
      return {
        id: program.id,
        programName: program.name,
        activity: (structured.activity ?? 'RUNNING') as
          | 'RUNNING' | 'CYCLING' | 'ROWING' | 'SWIMMING' | 'CROSSTRAINER'
          | 'WALKING' | 'SKIERG' | 'ASSAULT_BIKE' | 'WATTBIKE' | 'STAIRCLIMBER' | 'OTHER',
        protocol: (structured.blocks.some(b => b.kind === 'REPEAT')
          ? 'INTERVALS'
          : 'STEADY_STATE') as
          | 'STEADY_STATE' | 'INTERVALS' | 'TEMPO' | 'FARTLEK'
          | 'ZONE_TRAINING' | 'THRESHOLD' | 'LONG_SLOW_DISTANCE' | 'WALK_RUN',
        week,
        session: 1,
        targetDurationMin: Math.round(totalDurationSec(structured.blocks) / 60),
        targetZone,
        targetPaceSecPerKm: null as number | null,
        intervals: flat,
      }
    }

    // Walk-Run subtype: weken bevatten run/walk minutes en aantal rondes.
    if (params.subType === 'WALK_RUN' && Array.isArray(params.weeks)) {
      const weeks = params.weeks as Array<{
        runMin?: number
        walkMin?: number
        rounds?: number
        sessionsPerWeek?: number
      }>
      const w = weeks[weekIdx] ?? weeks[weeks.length - 1] ?? { runMin: 1, walkMin: 2, rounds: 6 }
      const rounds = Math.max(1, w.rounds ?? 6)
      const intervals: Array<{ label: string; type: 'WALK' | 'RUN'; durationSec: number }> = []
      for (let i = 0; i < rounds; i++) {
        intervals.push({ label: 'Wandelen', type: 'WALK', durationSec: (w.walkMin ?? 2) * 60 })
        intervals.push({ label: 'Lopen', type: 'RUN', durationSec: (w.runMin ?? 1) * 60 })
      }
      return {
        id: program.id,
        programName: program.name,
        activity: 'RUNNING' as const,
        protocol: 'WALK_RUN' as const,
        week,
        session: 1,
        targetDurationMin: Math.round(intervals.reduce((s, i) => s + i.durationSec, 0) / 60),
        targetZone: 2 as const,
        targetPaceSecPerKm: null as number | null,
        intervals,
      }
    }

    // Pure cardio: optioneel intervals[] met workDuration/restDuration/repetitions.
    const rawIntervals = Array.isArray(params.intervals)
      ? (params.intervals as Array<{
          workDuration?: number
          restDuration?: number
          repetitions?: number
          label?: string
        }>)
      : []
    const flatIntervals: Array<{ label: string; type: 'WALK' | 'RUN'; durationSec: number }> = []
    for (const block of rawIntervals) {
      const reps = Math.max(1, block.repetitions ?? 1)
      for (let i = 0; i < reps; i++) {
        flatIntervals.push({
          label: block.label ?? 'Werk',
          type: 'RUN',
          durationSec: block.workDuration ?? 60,
        })
        if ((block.restDuration ?? 0) > 0) {
          flatIntervals.push({
            label: 'Rust',
            type: 'WALK',
            durationSec: block.restDuration ?? 30,
          })
        }
      }
    }

    const targetZoneRaw = params.targetZone
    const targetZone =
      typeof targetZoneRaw === 'number' && targetZoneRaw >= 1 && targetZoneRaw <= 5
        ? (targetZoneRaw as 1 | 2 | 3 | 4 | 5)
        : (2 as const)

    return {
      id: program.id,
      programName: program.name,
      activity: ((params.activity as string) ?? 'RUNNING') as
        | 'RUNNING' | 'CYCLING' | 'ROWING' | 'SWIMMING' | 'CROSSTRAINER'
        | 'WALKING' | 'SKIERG' | 'ASSAULT_BIKE' | 'WATTBIKE' | 'STAIRCLIMBER' | 'OTHER',
      protocol: ((params.protocol as string) ?? 'STEADY_STATE') as
        | 'STEADY_STATE' | 'INTERVALS' | 'TEMPO' | 'FARTLEK'
        | 'ZONE_TRAINING' | 'THRESHOLD' | 'LONG_SLOW_DISTANCE' | 'WALK_RUN',
      week,
      session: 1,
      targetDurationMin:
        typeof params.targetDurationMin === 'number' ? params.targetDurationMin : 30,
      targetZone,
      targetPaceSecPerKm:
        typeof params.targetPaceSecPerKm === 'number' ? params.targetPaceSecPerKm : null,
      intervals: flatIntervals,
    }
  }),

  // ── Log a stand-alone pain report ────────────────────────────────────────

  reportPain: protectedProcedure
    .input(
      z.object({
        nrs: z.number().int().min(0).max(10),
        location: z.string().min(1).max(80),
        context: z.enum(['rest', 'movement', 'exercise', 'after', 'always']),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('patient.reportPain', ctx.user.id, RATE_LIMITS.sessionLog)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }
      const entry = await ctx.prisma.painEntry.create({
        data: {
          userId: ctx.user.id,
          nrs: input.nrs,
          location: input.location,
          context: input.context,
          notes: input.notes ?? null,
        },
        select: { id: true },
      })
      await auditLog({
        event: 'PAIN_REPORTED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'PainEntry',
        resourceId: entry.id,
        metadata: { nrs: input.nrs, context: input.context },
        req: ctx.req,
      })
      return entry
    }),

  // ── Last weights per exercise ─────────────────────────────────────────────

  /**
   * Laatste gebruikte gewicht per oefening voor een user (self of patient
   * via therapeut-flow). Handig om als "laatst gebruikt" hint te tonen.
   */
  getLastWeights: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let targetId = ctx.user!.id
      if (input?.patientId && input.patientId !== ctx.user!.id) {
        if (ctx.user!.role !== 'THERAPIST' && ctx.user!.role !== 'ADMIN') {
          throw new TRPCError({ code: 'FORBIDDEN' })
        }
        // Toegang = directe PatientTherapist-relatie OF zelfde praktijk.
        const me = ctx.user!
        const ok = await ctx.prisma.user.findFirst({
          where: {
            id: input.patientId,
            OR: [
              {
                patientTherapists: {
                  some: {
                    therapistId: me.id,
                    isActive: true, status: 'APPROVED',
                  },
                },
              },
              ...(me.practiceId ? [{ practiceId: me.practiceId }] : []),
            ],
          },
          select: { id: true },
        })
        if (!ok && me.role !== 'ADMIN') {
          throw new TRPCError({ code: 'FORBIDDEN' })
        }
        targetId = input.patientId
      }

      const logs = await ctx.prisma.exerciseLog.findMany({
        where: {
          session: { patientId: targetId, status: 'COMPLETED' },
          weight: { not: null, gt: 0 },
        },
        orderBy: { session: { completedAt: 'desc' } },
        select: {
          exerciseId: true,
          weight: true,
          repsCompleted: true,
          session: { select: { completedAt: true } },
        },
        take: 500, // genoeg voor recente historie
      })

      // Dedupe — eerste (meest recente) per exerciseId wint
      const byExercise: Record<
        string,
        { weight: number; reps: number | null; date: string }
      > = {}
      for (const log of logs) {
        if (!(log.exerciseId in byExercise) && log.weight !== null) {
          byExercise[log.exerciseId] = {
            weight: log.weight,
            reps: log.repsCompleted,
            date: (log.session.completedAt ?? new Date()).toISOString(),
          }
        }
      }

      return byExercise
    }),

  // ── Personal bests: hoogste estimated 1RM per oefening ──────────────────

  /**
   * Hoogste ooit gelogde `estimatedOneRepMax` per oefening voor deze patiënt.
   * Gebruikt op de session-pagina om een PR te detecteren tijdens loggen.
   */
  getPersonalBests: protectedProcedure.query(async ({ ctx }) => {
    const grouped = await ctx.prisma.exerciseLog.groupBy({
      by: ['exerciseId'],
      where: {
        session: { patientId: ctx.user.id, status: 'COMPLETED' },
        estimatedOneRepMax: { not: null, gt: 0 },
      },
      _max: { estimatedOneRepMax: true },
    })
    const out: Record<string, number> = {}
    for (const row of grouped) {
      if (row._max.estimatedOneRepMax != null) {
        out[row.exerciseId] = row._max.estimatedOneRepMax
      }
    }
    return out
  }),

  // ── 1RM progressie per oefening (voor progress page chart) ──────────────

  /**
   * Tijd-reeks van geschatte 1RM per oefening, gesorteerd oud → nieuw.
   * Limiet: top-N oefeningen op basis van aantal datapoints, met max
   * datapoints per oefening om payload klein te houden.
   */
  getOneRmProgression: protectedProcedure
    .input(
      z
        .object({
          maxExercises: z.number().int().min(1).max(20).default(4),
          maxPointsPerExercise: z.number().int().min(2).max(50).default(15),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.maxExercises ?? 4
      const pointsCap = input?.maxPointsPerExercise ?? 15

      const logs = await ctx.prisma.exerciseLog.findMany({
        where: {
          session: { patientId: ctx.user.id, status: 'COMPLETED' },
          estimatedOneRepMax: { not: null, gt: 0 },
        },
        orderBy: { session: { completedAt: 'asc' } },
        select: {
          exerciseId: true,
          estimatedOneRepMax: true,
          session: { select: { completedAt: true } },
        },
        take: 2000,
      })

      // Group by exerciseId.
      const grouped = new Map<string, Array<{ value: number; date: string }>>()
      for (const log of logs) {
        const date = (log.session.completedAt ?? new Date()).toISOString()
        if (!grouped.has(log.exerciseId)) grouped.set(log.exerciseId, [])
        grouped.get(log.exerciseId)!.push({
          value: log.estimatedOneRepMax!,
          date,
        })
      }

      // Top N op aantal datapoints (meest geserveerde oefeningen voorop).
      const top = Array.from(grouped.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, limit)

      const exerciseIds = top.map(([id]) => id)
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const nameMap = new Map(exercises.map(e => [e.id, e.name]))

      return top.map(([exerciseId, points]) => {
        // Subsample naar pointsCap (gelijkmatig verspreid, behoud eerste/laatste).
        const trimmed =
          points.length <= pointsCap
            ? points
            : points.filter((_, i, arr) => {
                if (i === 0 || i === arr.length - 1) return true
                const step = (arr.length - 2) / (pointsCap - 2)
                return Math.round((i - 1) / step) * step + 1 === i
              })
        return {
          exerciseId,
          name: nameMap.get(exerciseId) ?? 'Oefening',
          data: trimmed.map((p, i) => ({
            session: i + 1,
            date: p.date,
            value: Math.round(p.value * 10) / 10,
          })),
        }
      })
    }),

  // ── Tendinopathie-trend (3-lijn chart op progress page) ─────────────────

  /**
   * Tijdreeks van pijnDuring / painAfter24h / morningStiffness uit
   * exerciseLogs in tendinopathy-mode programs. Eén punt per sessie:
   * gemiddelden over de exercise-logs van die sessie.
   */
  getTendinopathyTrend: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: ctx.user.id,
          status: 'COMPLETED',
          program: { tendinopathyMode: true },
        },
        orderBy: { completedAt: 'asc' },
        take: input?.limit ?? 10,
        select: {
          id: true,
          completedAt: true,
          exerciseLogs: {
            select: {
              painDuring: true,
              painAfter24h: true,
              morningStiffness: true,
            },
          },
        },
      })

      const avg = (vals: Array<number | null>): number | null => {
        const nums = vals.filter((v): v is number => v != null)
        if (nums.length === 0) return null
        return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10
      }

      return sessions
        .map((s, i) => ({
          session: i + 1,
          date: (s.completedAt ?? new Date()).toISOString(),
          painDuring: avg(s.exerciseLogs.map(el => el.painDuring)),
          painAfter24h: avg(s.exerciseLogs.map(el => el.painAfter24h)),
          morningStiffness: avg(s.exerciseLogs.map(el => el.morningStiffness)),
        }))
        // Filter sessies zonder enige tendinopathy-data weg.
        .filter(p => p.painDuring != null || p.painAfter24h != null || p.morningStiffness != null)
    }),

  // ── Tendinopathy pain follow-up (24u na sessie) ───────────────────────────

  hasTendinopathyProgram: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.program.count({
      where: {
        patientId: ctx.user!.id,
        status: 'ACTIVE',
        tendinopathyMode: true,
      },
    })
    return count > 0
  }),

  getPendingPainFollowUps: protectedProcedure.query(async ({ ctx }) => {
    // Sessies tussen 16u en 48u geleden waar tendinopathy mode aan stond,
    // met exercise-logs die painDuring hebben maar geen painAfter24h.
    const now = Date.now()
    const earliest = new Date(now - 48 * 60 * 60 * 1000)
    const latest = new Date(now - 16 * 60 * 60 * 1000)

    const sessions = await ctx.prisma.sessionLog.findMany({
      where: {
        patientId: ctx.user!.id,
        status: 'COMPLETED',
        completedAt: { gte: earliest, lte: latest },
        program: { tendinopathyMode: true },
      },
      include: {
        program: { select: { id: true, name: true, tendinopathyMode: true } },
        exerciseLogs: {
          where: {
            painDuring: { not: null },
            painAfter24h: null,
          },
          include: {
            // We need exercise name
          },
        },
      },
    })

    // Haal exercise-namen op
    const exerciseIds = Array.from(
      new Set(sessions.flatMap(s => s.exerciseLogs.map(el => el.exerciseId))),
    )
    const exercises = exerciseIds.length
      ? await ctx.prisma.exercise.findMany({
          where: { id: { in: exerciseIds } },
          select: { id: true, name: true },
        })
      : []
    const exerciseMap = new Map(exercises.map(e => [e.id, e.name]))

    return sessions
      .filter(s => s.exerciseLogs.length > 0)
      .map(s => ({
        sessionId: s.id,
        completedAt: s.completedAt,
        programName: s.program?.name ?? null,
        exerciseLogs: s.exerciseLogs.map(el => ({
          id: el.id,
          exerciseId: el.exerciseId,
          exerciseName: exerciseMap.get(el.exerciseId) ?? 'Oefening',
          painDuring: el.painDuring,
        })),
      }))
  }),

  submitPainFollowUp: protectedProcedure
    .input(
      z.object({
        exerciseLogId: z.string(),
        painAfter24h: z.number().int().min(0).max(10),
        morningStiffness: z.number().int().min(0).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const log = await ctx.prisma.exerciseLog.findUnique({
        where: { id: input.exerciseLogId },
        select: { session: { select: { patientId: true } } },
      })
      if (!log || log.session.patientId !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      return ctx.prisma.exerciseLog.update({
        where: { id: input.exerciseLogId },
        data: {
          painAfter24h: input.painAfter24h,
          morningStiffness: input.morningStiffness ?? null,
        },
      })
    }),

  // ── Session history (for history page / dashboard) ────────────────────────

  getSessionHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: { patientId: ctx.user.id, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: input?.limit ?? 20,
        include: {
          program: { select: { id: true, name: true } },
          exerciseLogs: { select: { exerciseId: true } },
        },
      })

      return sessions.map(s => ({
        id: s.id,
        completedAt: s.completedAt?.toISOString() ?? s.scheduledAt.toISOString(),
        scheduledAt: s.scheduledAt.toISOString(),
        programId: s.program?.id ?? null,
        programName: s.program?.name ?? null,
        durationSeconds: s.duration ?? 0,
        durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
        painLevel: s.painLevel ?? null,
        exertionLevel: s.exertionLevel ?? null,
        exerciseCount: s.exerciseLogs.length,
        notes: s.notes ?? null,
      }))
    }),

  // ── Eigen kalender: gepland + gelogd binnen een datum-range ──────────────
  // Voor de atleet-kalender (maandweergave): alle eigen SessionLogs en
  // CardioLogs in de range, plus de week-schedules met items zodat de client
  // geplande workouts op datum kan mappen (zelfde anchoring als de
  // therapeut-week-planner: startDate = maandag van die week).

  calendarRange: protectedProcedure
    .input(z.object({
      from: z.string(), // ISO timestamp — inclusief
      to: z.string(),   // ISO timestamp — exclusief
    }))
    .query(async ({ ctx, input }) => {
      const fromDate = new Date(input.from)
      const toDate = new Date(input.to)
      const [sessions, cardio, schedules] = await Promise.all([
        ctx.prisma.sessionLog.findMany({
          where: { patientId: ctx.user.id, scheduledAt: { gte: fromDate, lt: toDate } },
          select: {
            id: true,
            scheduledAt: true,
            completedAt: true,
            status: true,
            completedAll: true,
            duration: true,
            programId: true,
            painLevel: true,
            exertionLevel: true,
            program: { select: { name: true } },
            _count: { select: { exerciseLogs: true } },
          },
          orderBy: { scheduledAt: 'asc' },
        }),
        ctx.prisma.cardioLog.findMany({
          where: { patientId: ctx.user.id, completedAt: { gte: fromDate, lt: toDate } },
          select: {
            id: true,
            completedAt: true,
            activity: true,
            protocol: true,
            durationSec: true,
            distanceM: true,
            avgHeartRate: true,
            zone: true,
            rpe: true,
            painLevel: true,
            avgPaceSecPerKm: true,
            notes: true,
          },
          orderBy: { completedAt: 'asc' },
        }),
        ctx.prisma.weekSchedule.findMany({
          where: { patientId: ctx.user.id, isTemplate: false },
          select: {
            id: true,
            weekNumber: true,
            startDate: true,
            createdAt: true,
            days: {
              select: {
                id: true,
                dayOfWeek: true,
                programId: true,
                program: { select: { id: true, name: true } },
                items: {
                  // ALLEEN workouts naar patiënt-clients. Web-atleet en iOS doen
                  // beide `quickCategory ?? 'STRENGTH'`, dus een NOTE/REST/TEST/
                  // EVENT-item zou daar als krachttraining verschijnen — in het
                  // verleden zelfs als "gemist", en als start-knop naar
                  // /session. Zodra die clients `kind` kennen mag dit filter
                  // ruimer. Zie WeekItemKind in schema.prisma.
                  where: { kind: { in: ['PROGRAM', 'WORKOUT'] } },
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    order: true,
                    kind: true,
                    programId: true,
                    program: { select: { id: true, name: true } },
                    quickCategory: true,
                    quickActivity: true,
                    quickName: true,
                    quickDurationSec: true,
                    // Afgeleid uit de oefeningen/blokken zodra die er zijn; de
                    // clients tonen `plannedDurationSec ?? quickDurationSec`,
                    // zodat de patiënt dezelfde duur ziet als de therapeut.
                    plannedDurationSec: true,
                    notes: true,
                    // Kan de patiënt dit item überhaupt uitvoeren? Zonder dit
                    // toont de kalender een start-knop die op een leeg scherm
                    // uitkomt. Het aantal volstaat — de oefeningen zelf komen
                    // via getTodayExercises({ itemId }).
                    //
                    // LET OP: cardio heeft GEEN oefeningen; die inhoud zit in
                    // cardioParams. Alleen op dit aantal gaan betekent dat een
                    // geplande cardio-workout niet te starten is. We sturen
                    // hieronder een `hasContent`-boolean mee i.p.v. de hele
                    // blokken-blob — de client hoeft alleen te weten óf er iets
                    // staat, niet wát.
                    _count: { select: { exercises: true } },
                    cardioParams: true,
                    // Identiteit i.p.v. de oude teller-heuristiek: hoort er al
                    // een gelogde sessie bij dit item?
                    sessionLogs: {
                      select: { id: true, completedAt: true, completedAll: true },
                      orderBy: { completedAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        }),
      ])
      return {
        sessions: sessions.map(s => ({
          id: s.id,
          scheduledAt: s.scheduledAt,
          completedAt: s.completedAt,
          status: s.status,
          completedAll: s.completedAll,
          duration: s.duration,
          programId: s.programId,
          programName: s.program?.name ?? null,
          painLevel: s.painLevel,
          exertionLevel: s.exertionLevel,
          exerciseCount: s._count.exerciseLogs,
        })),
        cardio,
        // cardioParams eruit, `hasContent` erin: de blokken zijn tot 8 kB per
        // item en een maandoverzicht heeft er tientallen. De client hoeft alleen
        // te weten of dit item te starten is.
        schedules: schedules.map(ws => ({
          ...ws,
          days: ws.days.map(d => ({
            ...d,
            items: d.items.map(({ cardioParams, ...it }) => ({
              ...it,
              hasContent:
                it._count.exercises > 0 || it.programId !== null || cardioParams != null,
            })),
          })),
        })),
      }
    }),

  // ── Detail van één eigen sessie (voor de kalender-detailsheet) ───────────

  sessionDetail: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.sessionLog.findFirst({
        where: { id: input.sessionId, patientId: ctx.user.id },
        select: {
          id: true,
          scheduledAt: true,
          completedAt: true,
          completedAll: true,
          duration: true,
          painLevel: true,
          exertionLevel: true,
          notes: true,
          program: { select: { name: true } },
          exerciseLogs: {
            select: {
              id: true,
              exerciseId: true,
              setsCompleted: true,
              repsCompleted: true,
              weight: true,
              // Per-set detail ("42,5 × 10, 45 × 8") — de runner logt dit al,
              // maar de historie-weergaves toonden alleen de samenvatting.
              weightsPerSet: true,
              repsPerSet: true,
              repUnit: true,
              painLevel: true,
              painDuring: true,
              supersetGroup: true,
            },
          },
        },
      })
      if (!session) throw new TRPCError({ code: 'NOT_FOUND' })

      const exerciseIds = [...new Set(session.exerciseLogs.map(l => l.exerciseId))]
      const exercises = exerciseIds.length > 0
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true, category: true },
          })
        : []
      const exerciseById = new Map(exercises.map(e => [e.id, e]))

      return {
        id: session.id,
        scheduledAt: session.scheduledAt,
        completedAt: session.completedAt,
        completedAll: session.completedAll,
        duration: session.duration,
        painLevel: session.painLevel,
        exertionLevel: session.exertionLevel,
        notes: session.notes,
        programName: session.program?.name ?? null,
        exerciseLogs: session.exerciseLogs.map(l => ({
          id: l.id,
          name: exerciseById.get(l.exerciseId)?.name ?? 'Oefening',
          category: exerciseById.get(l.exerciseId)?.category ?? null,
          setsCompleted: l.setsCompleted,
          repsCompleted: l.repsCompleted,
          weight: l.weight,
          painLevel: l.painLevel,
          painDuring: l.painDuring,
          supersetGroup: l.supersetGroup,
        })),
      }
    }),

  // ── Belasting-curve: fitness-fatigue model over kracht + cardio ──────────
  // Zie src/lib/training-load.ts voor het model (Banister CTL/ATL/TSB stuurt de
  // status; week-op-week + Foster monotony/strain + consistentie ernaast. ACWR
  // blijft als stil trend-cijfer bestaan, stuurt niets).

  loadCurve: protectedProcedure
    .input(z.object({
      days: z.number().int().min(28).max(365).default(120),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { computeLoadCurve } = await import('@/server/load-curve')
      return computeLoadCurve(ctx.prisma, ctx.user.id, input?.days ?? 120)
    }),

  // ── Recovery sessions — with muscle loads (ExerciseSession[]) ─────────────

  getRecoverySessions: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date()
    since.setDate(since.getDate() - 7)

    const sessions = await ctx.prisma.sessionLog.findMany({
      where: {
        patientId: ctx.user.id,
        status: 'COMPLETED',
        completedAt: { gte: since },
      },
      include: {
        exerciseLogs: { select: { exerciseId: true, setsCompleted: true, repsCompleted: true, painLevel: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    // Collect all unique exercise IDs
    const exerciseIds = [
      ...new Set(sessions.flatMap(s => s.exerciseLogs.map(el => el.exerciseId))),
    ]

    if (exerciseIds.length === 0) return []

    const exercises = await ctx.prisma.exercise.findMany({
      where: { id: { in: exerciseIds } },
      include: { muscleLoads: true },
    })

    const exMap = new Map(exercises.map(e => [e.id, e]))

    return sessions.flatMap(session =>
      session.exerciseLogs.flatMap(log => {
        const ex = exMap.get(log.exerciseId)
        if (!ex) return []
        return [{
          exerciseId: log.exerciseId,
          muscleLoads: muscleLoadsRecord(ex),
          sets: log.setsCompleted ?? 3,
          reps: log.repsCompleted ?? 10,
          repUnit: 'reps',
          completedAt: session.completedAt ?? session.scheduledAt,
          painLevel: log.painLevel ?? session.painLevel ?? undefined,
          rpe: session.exertionLevel ?? undefined,
        }]
      })
    )
  }),

  // ── Therapist-access consent (Phase C) ──────────────────────────────────
  // Patient ziet welke therapeuten toegang hebben of aanvragen, en kan
  // accepteren, afwijzen, of toegang intrekken.

  getTherapistAccess: protectedProcedure.query(async ({ ctx }) => {
    const relations = await ctx.prisma.patientTherapist.findMany({
      where: { patientId: ctx.user!.id, isActive: true },
      include: {
        therapist: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { requestedAt: 'desc' },
      ],
    })
    return relations.map((r) => ({
      id: r.id,
      status: r.status,
      requestedAt: r.requestedAt,
      respondedAt: r.respondedAt,
      therapist: r.therapist,
    }))
  }),

  respondToTherapistAccess: protectedProcedure
    .input(z.object({ relationId: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findUnique({
        where: { id: input.relationId },
      })
      if (!relation) throw new TRPCError({ code: 'NOT_FOUND' })
      if (relation.patientId !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dit is niet jouw koppeling' })
      }
      return ctx.prisma.patientTherapist.update({
        where: { id: input.relationId },
        data: {
          status: input.accept ? 'APPROVED' : 'DECLINED',
          respondedAt: new Date(),
        },
      })
    }),

  revokeTherapistAccess: protectedProcedure
    .input(z.object({ relationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findUnique({
        where: { id: input.relationId },
      })
      if (!relation) throw new TRPCError({ code: 'NOT_FOUND' })
      if (relation.patientId !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dit is niet jouw koppeling' })
      }
      return ctx.prisma.patientTherapist.update({
        where: { id: input.relationId },
        data: {
          status: 'REVOKED',
          respondedAt: new Date(),
        },
      })
    }),
})
