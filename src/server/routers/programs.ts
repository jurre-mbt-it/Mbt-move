import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, creatorProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { maskMuscleLoadsArray } from '@/server/lib/muscle-loads'

const createId = () => crypto.randomUUID()

async function assertCanAssignPatient(
  prisma: PrismaClient,
  user: { id: string; role: string },
  patientId: string | null | undefined,
) {
  if (!patientId) return
  if (user.role === 'ADMIN') return
  if (patientId === user.id) return
  const relation = await prisma.patientTherapist.findFirst({
    where: { therapistId: user.id, patientId, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
  })
  if (!relation) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve koppeling met deze patiënt',
    })
  }
}

const ProgramExerciseInput = z.object({
  id: z.string().optional(), // existing id for updates
  exerciseId: z.string(),
  week: z.number().int().min(1).default(1),
  day: z.number().int().min(1).default(1),
  order: z.number().int().default(0),
  sets: z.number().int().min(1).default(3),
  reps: z.number().int().min(1).default(10),
  repUnit: z.string().default('reps'),
  restTime: z.number().int().default(60),
  supersetGroup: z.string().nullable().optional(),
  supersetOrder: z.number().int().default(0),
  notes: z.string().nullable().optional(),
})

export const programsRouter = createTRPCRouter({
  list: creatorProcedure
    .input(z.object({
      patientId: z.string().optional(),
      isTemplate: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Multi-tenant scope: admins zien alles. Therapeuten zien hun eigen
      // programma's PLUS programma's van collega's binnen dezelfde praktijk
      // (practiceId-match). Zonder practiceId: alleen eigen programma's.
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
          ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
          ...(input?.isTemplate !== undefined ? { isTemplate: input.isTemplate } : {}),
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
      type: z.enum(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY', 'MIXED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...rest } = input
      await assertCanAssignPatient(ctx.prisma, ctx.user!, patientId)
      return ctx.prisma.program.create({
        data: {
          id: createId(),
          ...rest,
          patientId: patientId ?? null,
          creatorId: ctx.user!.id,
          practiceId: ctx.user!.practiceId ?? null,
          status: patientId ? 'ACTIVE' : 'DRAFT',
        },
      })
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
      patientId: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      exercises: z.array(ProgramExerciseInput).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, exercises, startDate, endDate, ...data } = input

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
            reps: ex.reps,
            repUnit: ex.repUnit,
            restTime: ex.restTime,
            supersetGroup: ex.supersetGroup ?? null,
            supersetOrder: ex.supersetOrder ?? 0,
            notes: ex.notes ?? null,
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
        include: { exercises: true },
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
          ...(targetPatientId ? { patientId: targetPatientId } : {}),
          creatorId: ctx.user!.id,
          practiceId: ctx.user!.practiceId ?? null,
          status: 'DRAFT',
          exercises: {
            create: source.exercises.map(ex => ({
              id: createId(),
              exerciseId: ex.exerciseId,
              week: ex.week,
              day: ex.day,
              order: ex.order,
              sets: ex.sets,
              reps: ex.reps,
              repUnit: ex.repUnit,
              restTime: ex.restTime,
              supersetGroup: ex.supersetGroup,
              supersetOrder: ex.supersetOrder,
              notes: ex.notes,
            })),
          },
        },
      })
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
      const samePractice =
        !!ctx.user!.practiceId && !!program.practiceId && program.practiceId === ctx.user!.practiceId
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
})
