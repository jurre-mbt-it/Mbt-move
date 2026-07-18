import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, creatorProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { maskMuscleLoadsArray } from '@/server/lib/muscle-loads'
import { assertPatientAccess } from '@/server/lib/patient-access'
import { isReviewDue, weeksSince, reviewThresholdWeeks } from '@/lib/program-review'
import { notifyNewSchedule } from '@/server/push/notify'

/**
 * "Leeg concept" van één therapeut: DRAFT zonder inhoud en zonder verwijzingen.
 * Elke relatie die betekenis draagt telt als inhoud — een concept met sessies,
 * planner-items of shop-koppeling is niet leeg, wat de naam ook zegt.
 */
const EMPTY_DRAFT_WHERE = (creatorId: string): Prisma.ProgramWhereInput => ({
  creatorId,
  status: 'DRAFT',
  isTemplate: false,
  cardioParams: { equals: Prisma.AnyNull },
  exercises: { none: {} },
  resources: { none: {} },
  sessionLogs: { none: {} },
  weekScheduleDays: { none: {} },
  weekScheduleDayItems: { none: {} },
  cardioLogs: { none: {} },
  shopProducts: { none: {} },
  activatedEntitlements: { none: {} },
  sessionMoves: { none: {} },
})

const createId = () => crypto.randomUUID()

async function assertCanAssignPatient(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string | null | undefined,
) {
  // Sjabloon/bibliotheek-programma zonder patient: niets toe te wijzen.
  if (!patientId) return
  await assertPatientAccess(prisma, user, patientId, 'Geen actieve koppeling met deze patiënt')
}

// Caps ruim boven wat er feitelijk staat (gemeten: notes 101, intensityText 62,
// 248 oefeningen in het grootste programma) — dit is een rem op opslag-bommen,
// geen functionele grens. setItemExercises hanteert hetzelfde patroon.
const ProgramExerciseInput = z.object({
  id: z.string().max(60).optional(), // existing id for updates
  exerciseId: z.string().max(60),
  week: z.number().int().min(1).default(1),
  day: z.number().int().min(1).default(1),
  order: z.number().int().default(0),
  sets: z.number().int().min(1).default(3),
  setsMax: z.number().int().min(1).nullable().optional(),
  reps: z.number().int().min(1).default(10),
  repsMax: z.number().int().min(1).nullable().optional(),
  repUnit: z.string().max(20).default('reps'),
  restTime: z.number().int().default(60),
  supersetGroup: z.string().max(4).nullable().optional(),
  supersetOrder: z.number().int().default(0),
  notes: z.string().max(1000).nullable().optional(),
  // Gestructureerd intensiteits-voorschrift (zie IntensityType in schema.prisma).
  // min/max dragen afhankelijk van type een RPE, percentage of kg-offset.
  intensityType: z
    .enum(['NONE', 'RPE', 'PERCENT_1RM', 'RELATIVE_DAILY_MAX', 'TECHNIQUE', 'TEXT'])
    .default('NONE'),
  intensityMin: z.number().nullable().optional(),
  intensityMax: z.number().nullable().optional(),
  intensityText: z.string().max(200).nullable().optional(),
  // Extra voorschrift-parameters (Tempo, Gewicht, Afstand, Hartslag, Moeite,
  // Band kleur, …). Vrij van vorm aan de rand; opgeslagen als JSON.
  extraParams: z
    .array(
      z.object({
        id: z.string().max(60),
        label: z.string().max(60),
        type: z.enum(['number', 'text', 'select', 'slider']),
        value: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]),
        unit: z.string().max(20).optional(),
        options: z.array(z.string().max(60)).max(20).optional(),
        min: z.number().min(-1_000_000).max(1_000_000).optional(),
        max: z.number().min(-1_000_000).max(1_000_000).optional(),
        valueMax: z.union([z.string().max(200), z.number().min(-1_000_000).max(1_000_000)]).optional(),
      }),
    )
    .max(20)
    .nullable()
    .optional(),
})

// Educatie-blok (de "Leer"-items) gekoppeld aan een dag/week van het programma.
const ProgramResourceInput = z.object({
  resourceId: z.string(),
  week: z.number().int().min(1).default(1),
  day: z.number().int().min(1).default(1),
  order: z.number().int().default(0),
})

export const programsRouter = createTRPCRouter({
  list: creatorProcedure
    .input(z.object({
      patientId: z.string().optional(),
      isTemplate: z.boolean().optional(),
      /** Patient-gekoppelde programma's meenemen in de output. Default false:
       *  programma's die aan een patient gekoppeld zijn worden uit de hoofd-
       *  lijst gefilterd zodat de bibliotheek schoon blijft. Therapeut ziet
       *  ze nog steeds via het patient-profiel.
       *  Wordt automatisch overschreven naar true zodra een specifieke
       *  patientId is meegegeven (anders zou het filter nul matches geven). */
      includeAssigned: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Multi-tenant scope: admins zien alles. Therapeuten zien hun eigen
      // programma's PLUS programma's van collega's binnen dezelfde praktijk
      // (practiceId-match). Zonder practiceId: alleen eigen programma's.
      const isAdmin = ctx.user!.role === 'ADMIN'
      const practiceId = ctx.user!.practiceId
      // Praktijk-brede zichtbaarheid is alleen voor therapeuten/admins. Een
      // atleet krijgt bij invite dezelfde practiceId; zonder deze rol-gate zou
      // de praktijk-tak programma's (incl. naam/e-mail) van mede-patiënten
      // lekken. Atleet ziet daarom enkel zijn eigen aangemaakte programma's.
      const canSeePractice = !!practiceId && ctx.user!.role === 'THERAPIST'
      const ownership = isAdmin
        ? {}
        : canSeePractice
          ? { OR: [{ creatorId: ctx.user!.id }, { practiceId }] }
          : { creatorId: ctx.user!.id }
      const includeAssigned = input?.includeAssigned ?? (input?.patientId !== undefined)
      // Sjablonen (isTemplate=true) zijn altijd patient-loos en blijven in
      // het bibliotheek-overzicht. Voor niet-sjablonen verbergen we patient-
      // programma's tenzij explicitly opt-in via includeAssigned.
      const hideAssigned = !includeAssigned && input?.isTemplate !== true
      const programs = await ctx.prisma.program.findMany({
        where: {
          ...ownership,
          ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
          ...(input?.isTemplate !== undefined ? { isTemplate: input.isTemplate } : {}),
          ...(hideAssigned ? { patientId: null } : {}),
        },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          _count: { select: { exercises: true } },
          exercises: {
            select: { day: true, exercise: { select: { category: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })

      // Derive dominantCategory zodat de week-planner programma's kan filteren
      // op Kracht/Cardio/Mobiliteit/Plyometrie/Stabiliteit zonder een extra
      // ronde naar de DB. CARDIO-programma's hebben vaak geen exercises en
      // vallen terug op program.type.
      // Ook: daysScheduled = unieke `day`-waarden uit exercises (1=Ma..7=Zo
      // conform DAY_LABELS in program builder). Zo kan de week-planner laten
      // zien op welke weekdagen een programma staat zonder een extra query.
      return programs.map(({ exercises, ...rest }) => {
        const counts: Record<string, number> = {}
        const daysSet = new Set<number>()
        for (const pe of exercises) {
          const cat = pe.exercise?.category
          if (cat) counts[cat] = (counts[cat] ?? 0) + 1
          if (pe.day) daysSet.add(pe.day)
        }
        let dominantCategory: string | null = null
        for (const [cat, n] of Object.entries(counts)) {
          if (!dominantCategory || n > counts[dominantCategory]) dominantCategory = cat
        }
        if (!dominantCategory && rest.type) dominantCategory = rest.type
        const daysScheduled = [...daysSet].sort((a, b) => a - b)
        return { ...rest, dominantCategory, daysScheduled }
      })
    }),

  get: creatorProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const program = await ctx.prisma.program.findUnique({
        where: { id: input.id },
        include: {
          exercises: {
            include: {
              exercise: {
                include: { muscleLoads: true },
              },
            },
            orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
          },
          resources: {
            include: { resource: true },
            orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
          },
          patient: { select: { id: true, name: true, email: true } },
        },
      })
      if (!program) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user!.role === 'ADMIN'
      const isOwner = program.creatorId === ctx.user!.id
      // Patient mag zijn eigen programma zien (assigned)
      const isAssignedPatient = program.patientId === ctx.user!.id
      // Therapist in dezelfde practice mag collega-programma zien
      const isSamePractice =
        !!ctx.user!.practiceId &&
        !!program.practiceId &&
        program.practiceId === ctx.user!.practiceId &&
        (ctx.user!.role === 'THERAPIST' || ctx.user!.role === 'ADMIN')
      if (!isAdmin && !isOwner && !isAssignedPatient && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      return {
        ...program,
        exercises: program.exercises.map(pe => ({
          ...pe,
          exercise: maskMuscleLoadsArray(pe.exercise),
        })),
      }
    }),

  create: creatorProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      patientId: z.string().nullable().optional(),
      weeks: z.number().int().min(1).default(4),
      daysPerWeek: z.number().int().min(1).default(3),
      isTemplate: z.boolean().default(false),
      // Looptijd/controle-interval in weken (leeg = standaard 8). Levert na
      // afloop een controle-signaal voor de therapeut op.
      reviewAfterWeeks: z.number().int().min(1).max(104).nullable().optional(),
      type: z.enum(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY', 'MIXED']).optional(),
      // Vrije JSON-blob voor cardio/walk-run protocollen. Geen strikte schema
      // omdat de wizards verschillende velden vastleggen (zone-training,
      // intervallen, walk-run weken, etc.). UI blijft de bron van waarheid.
      cardioParams: z
        .unknown()
        .refine((v) => v == null || JSON.stringify(v).length <= 8000, 'cardioParams te groot (max 8 kB)')
        .optional(),
      // Flexible-schedule modus + weekly target. Wanneer aan, kan patient
      // het programma elke dag van de week starten; klaar zodra weeklyTarget
      // is bereikt.
      flexibleSchedule: z.boolean().optional(),
      weeklyTarget: z.number().int().min(1).max(14).nullable().optional(),
      tendinopathyMode: z.boolean().optional(),
      trackOneRepMax: z.boolean().optional(),
      // Tendinopathie-dagdoel: aantal ISO-rondes per dag per oefening.
      dailyTarget: z.number().int().min(1).max(10).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, cardioParams, ...rest } = input
      await assertCanAssignPatient(ctx.prisma, ctx.user!, patientId)
      const program = await ctx.prisma.program.create({
        data: {
          id: createId(),
          ...rest,
          cardioParams: (cardioParams ?? null) as never,
          patientId: patientId ?? null,
          creatorId: ctx.user!.id,
          practiceId: ctx.user!.practiceId ?? null,
          status: patientId ? 'ACTIVE' : 'DRAFT',
          // Week-berekening (computeCurrentWeekDay) leunt op startDate; bij
          // directe toewijzing aan een patiënt start de klok nu i.p.v. terug
          // te vallen op createdAt.
          startDate: patientId ? new Date() : null,
        },
      })
      // Direct aan een patiënt toegewezen (niet een losse template) → melden.
      if (patientId) await notifyNewSchedule(patientId).catch(() => {})
      return program
    }),

  save: creatorProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
      weeks: z.number().int().min(1).optional(),
      daysPerWeek: z.number().int().min(1).optional(),
      isTemplate: z.boolean().optional(),
      reviewAfterWeeks: z.number().int().min(1).max(104).nullable().optional(),
      patientId: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      exercises: z.array(ProgramExerciseInput).optional(),
      resources: z.array(ProgramResourceInput).optional(),
      flexibleSchedule: z.boolean().optional(),
      weeklyTarget: z.number().int().min(1).max(14).nullable().optional(),
      tendinopathyMode: z.boolean().optional(),
      trackOneRepMax: z.boolean().optional(),
      dailyTarget: z.number().int().min(1).max(10).nullable().optional(),
      type: z.enum(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY', 'MIXED']).optional(),
      // Zelfde vrije blob als bij create — de cardio/walk-run wizards kunnen
      // hiermee een bestaand programma bijwerken.
      cardioParams: z
        .unknown()
        .refine((v) => v == null || JSON.stringify(v).length <= 8000, 'cardioParams te groot (max 8 kB)')
        .optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, exercises, resources, startDate, endDate, cardioParams, ...data } = input

      const existing = await ctx.prisma.program.findUnique({ where: { id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.creatorId !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      if (data.patientId !== undefined) {
        await assertCanAssignPatient(ctx.prisma, ctx.user!, data.patientId)
      }

      const updateData: Record<string, unknown> = { ...data }
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
      if (cardioParams !== undefined) updateData.cardioParams = cardioParams

      // Deploy-moment: programma wordt (of is) patient-gebonden en gaat ACTIVE
      // zonder expliciete startDate → klok start nu. Voorkomt de fallback op
      // createdAt in computeCurrentWeekDay wanneer een concept dagen later
      // pas wordt gedeployed.
      const willBeActive = (data.status ?? existing.status) === 'ACTIVE'
      const willHavePatient = data.patientId !== undefined ? data.patientId : existing.patientId
      if (startDate === undefined && willBeActive && willHavePatient && !existing.startDate) {
        updateData.startDate = new Date()
      }

      if (exercises !== undefined) {
        // Replace all exercises
        await ctx.prisma.programExercise.deleteMany({ where: { programId: id } })
        updateData.exercises = {
          create: exercises.map((ex, i) => ({
            id: createId(),
            exerciseId: ex.exerciseId,
            week: ex.week,
            day: ex.day,
            order: ex.order ?? i,
            sets: ex.sets,
            setsMax: ex.setsMax ?? null,
            reps: ex.reps,
            repsMax: ex.repsMax ?? null,
            repUnit: ex.repUnit,
            restTime: ex.restTime,
            supersetGroup: ex.supersetGroup ?? null,
            supersetOrder: ex.supersetOrder ?? 0,
            notes: ex.notes ?? null,
            intensityType: ex.intensityType,
            intensityMin: ex.intensityMin ?? null,
            intensityMax: ex.intensityMax ?? null,
            intensityText: ex.intensityText ?? null,
            extraParams: ex.extraParams && ex.extraParams.length > 0 ? ex.extraParams : undefined,
          })),
        }
      }

      if (resources !== undefined) {
        // Replace all educatie-blokken
        await ctx.prisma.programResource.deleteMany({ where: { programId: id } })
        updateData.resources = {
          create: resources.map((r, i) => ({
            id: createId(),
            resourceId: r.resourceId,
            week: r.week,
            day: r.day,
            order: r.order ?? i,
          })),
        }
      }

      const saved = await ctx.prisma.program.update({
        where: { id },
        data: updateData,
        include: {
          exercises: {
            include: { exercise: { include: { muscleLoads: true } } },
            orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
          },
        },
      })
      return {
        ...saved,
        exercises: saved.exercises.map(pe => ({
          ...pe,
          exercise: maskMuscleLoadsArray(pe.exercise),
        })),
      }
    }),

  duplicate: creatorProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      patientId: z.string().nullable().optional(),
      isTemplate: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.program.findUnique({
        where: { id: input.id },
        include: { exercises: true, resources: true },
      })
      if (!source) throw new TRPCError({ code: 'NOT_FOUND' })
      if (source.creatorId !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const newId = createId()
      const targetPatientId = input.patientId !== undefined
        ? (input.patientId != null ? input.patientId : undefined)
        : (source.patientId ?? undefined)
      await assertCanAssignPatient(ctx.prisma, ctx.user!, targetPatientId)
      return ctx.prisma.program.create({
        data: {
          id: newId,
          name: input.name ?? `${source.name} (kopie)`,
          description: source.description ?? undefined,
          weeks: source.weeks,
          daysPerWeek: source.daysPerWeek,
          isTemplate: input.isTemplate ?? source.isTemplate,
          type: source.type,
          cardioParams: (source.cardioParams ?? null) as never,
          flexibleSchedule: source.flexibleSchedule,
          weeklyTarget: source.weeklyTarget,
          reviewAfterWeeks: source.reviewAfterWeeks,
          ...(targetPatientId ? { patientId: targetPatientId } : {}),
          creatorId: ctx.user!.id,
          practiceId: ctx.user!.practiceId ?? null,
          // Kopie die direct aan een patiënt wordt toegewezen is meteen
          // ACTIVE (zichtbaar voor de patiënt), net als `create`. Alleen een
          // template/los concept blijft DRAFT.
          status: targetPatientId ? 'ACTIVE' : 'DRAFT',
          startDate: targetPatientId ? new Date() : null,
          tendinopathyMode: source.tendinopathyMode,
          trackOneRepMax: source.trackOneRepMax,
          dailyTarget: source.dailyTarget,
          exercises: {
            create: source.exercises.map(ex => ({
              id: createId(),
              exerciseId: ex.exerciseId,
              week: ex.week,
              day: ex.day,
              order: ex.order,
              sets: ex.sets,
              setsMax: ex.setsMax,
              reps: ex.reps,
              repsMax: ex.repsMax,
              repUnit: ex.repUnit,
              restTime: ex.restTime,
              supersetGroup: ex.supersetGroup,
              supersetOrder: ex.supersetOrder,
              notes: ex.notes,
              intensityType: ex.intensityType,
              intensityMin: ex.intensityMin,
              intensityMax: ex.intensityMax,
              intensityText: ex.intensityText,
              extraParams: ex.extraParams ?? undefined,
            })),
          },
          resources: {
            create: source.resources.map(r => ({
              id: createId(),
              resourceId: r.resourceId,
              week: r.week,
              day: r.day,
              order: r.order,
            })),
          },
        },
      })
    }),

  /**
   * Lege concept-programma's van de ingelogde therapeut: DRAFT, geen
   * oefeningen/cardio-inhoud en nergens aan gekoppeld (geen sessies, planner-
   * items, resources of shop). Ontstaan doordat de snelle-flow op de iPad bij
   * het openen van de builder meteen een concept aanmaakte; wie terug-tikte
   * liet er zo één achter. Query voor de opruim-banner in de programma-lijst.
   */
  emptyDrafts: therapistProcedure.query(async ({ ctx }) => {
    const empty = await ctx.prisma.program.findMany({
      where: EMPTY_DRAFT_WHERE(ctx.user!.id),
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return empty
  }),

  /** Verwijder alle (nu nog steeds) lege concepten — zie emptyDrafts. */
  cleanupEmptyDrafts: therapistProcedure.mutation(async ({ ctx }) => {
    // Her-evalueren op het moment van verwijderen: een concept dat inmiddels
    // inhoud kreeg valt automatisch buiten de filter.
    const empty = await ctx.prisma.program.findMany({
      where: EMPTY_DRAFT_WHERE(ctx.user!.id),
      select: { id: true },
    })
    if (empty.length > 0) {
      await ctx.prisma.program.deleteMany({ where: { id: { in: empty.map(p => p.id) } } })
    }
    return { deleted: empty.length }
  }),

  delete: creatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.program.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.creatorId !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.program.delete({ where: { id: input.id } })
      return { success: true }
    }),

  /**
   * Verplaats alle exercises met `day=fromDay` naar `day=toDay`. Optioneel
   * binnen één specifieke `week`. Handig voor "verplaats Di → Do" zonder
   * de hele program builder te openen.
   */
  changeDay: creatorProcedure
    .input(z.object({
      programId: z.string(),
      fromDay: z.number().int().min(1).max(7),
      toDay: z.number().int().min(1).max(7),
      week: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.fromDay === input.toDay) return { updated: 0 }

      const program = await ctx.prisma.program.findUnique({ where: { id: input.programId } })
      if (!program) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user!.role === 'ADMIN'
      const isOwner = program.creatorId === ctx.user!.id
      // Praktijk-tak alleen voor therapeuten/admins — anders kan een atleet met
      // dezelfde practiceId trainingsdagen in andermans programma verschuiven.
      const samePractice =
        !!ctx.user!.practiceId &&
        !!program.practiceId &&
        program.practiceId === ctx.user!.practiceId &&
        (ctx.user!.role === 'THERAPIST' || ctx.user!.role === 'ADMIN')
      if (!isAdmin && !isOwner && !samePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const result = await ctx.prisma.programExercise.updateMany({
        where: {
          programId: input.programId,
          day: input.fromDay,
          ...(input.week !== undefined ? { week: input.week } : {}),
        },
        data: { day: input.toDay },
      })

      // Bump Program.updatedAt zodat consumers (program builder o.a.) kunnen
      // zien dat de data ververst is en hun lokale state moeten remounten.
      if (result.count > 0) {
        await ctx.prisma.program.update({
          where: { id: input.programId },
          data: { updatedAt: new Date() },
        })
      }

      return { updated: result.count }
    }),

  /**
   * Programma's die toe zijn aan een controle: actief, aan een patiënt
   * gekoppeld en langer dan de drempel (`reviewAfterWeeks` of standaard 8
   * weken) ongewijzigd. Scope = eigen programma's + die van praktijk-collega's.
   * Voedt het therapeut-dashboard en de signalen-melding.
   */
  reviewDue: therapistProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user!.role === 'ADMIN'
    const practiceId = ctx.user!.practiceId
    const ownership = isAdmin
      ? {}
      : practiceId
        ? { OR: [{ creatorId: ctx.user!.id }, { practiceId }] }
        : { creatorId: ctx.user!.id }

    const programs = await ctx.prisma.program.findMany({
      where: {
        ...ownership,
        status: 'ACTIVE',
        isTemplate: false,
        patientId: { not: null },
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        reviewAfterWeeks: true,
        patient: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: 'asc' },
    })

    const now = new Date()
    return programs
      .filter((p) => isReviewDue(p.updatedAt, p.reviewAfterWeeks, now))
      .map((p) => ({
        programId: p.id,
        programName: p.name,
        patientId: p.patient?.id ?? null,
        patientName: p.patient?.name ?? p.patient?.email ?? 'Onbekend',
        weeksUnchanged: Math.floor(weeksSince(p.updatedAt, now)),
        thresholdWeeks: reviewThresholdWeeks(p.reviewAfterWeeks),
      }))
  }),

  /**
   * "Markeer als gecontroleerd" — bumpt updatedAt zonder inhoudelijke wijziging
   * zodat de controle-klok reset en het signaal verdwijnt. Gebruik dit als het
   * schema na controle ongewijzigd passend blijkt.
   */
  markReviewed: creatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.program.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user!.role === 'ADMIN'
      const isOwner = existing.creatorId === ctx.user!.id
      // Praktijk-tak alleen voor therapeuten/admins — anders kan een atleet met
      // dezelfde practiceId de controle-klok van andermans programma resetten.
      const samePractice =
        !!ctx.user!.practiceId &&
        !!existing.practiceId &&
        existing.practiceId === ctx.user!.practiceId &&
        (ctx.user!.role === 'THERAPIST' || ctx.user!.role === 'ADMIN')
      if (!isAdmin && !isOwner && !samePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.program.update({
        where: { id: input.id },
        data: { updatedAt: new Date() },
      })
      return { ok: true }
    }),
})
