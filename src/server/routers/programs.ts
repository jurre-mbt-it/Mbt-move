import { z } from 'zod'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'

const createId = () => crypto.randomUUID()

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
  list: therapistProcedure
    .input(z.object({
      patientId: z.string().optional(),
      isTemplate: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.program.findMany({
        where: {
          creatorId: ctx.user!.id,
          ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
          ...(input?.isTemplate !== undefined ? { isTemplate: input.isTemplate } : {}),
        },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          _count: { select: { exercises: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    }),

  get: therapistProcedure
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
      if (program.creatorId !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      return program
    }),

  create: therapistProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      patientId: z.string().nullable().optional(),
      weeks: z.number().int().min(1).default(4),
      daysPerWeek: z.number().int().min(1).default(3),
      isTemplate: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { patientId, ...rest } = input
      return ctx.prisma.program.create({
        data: {
          id: createId(),
          ...rest,
          ...(patientId != null ? { patientId } : {}),
          creatorId: ctx.user!.id,
          status: 'DRAFT',
        },
      })
    }),

  save: therapistProcedure
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

      return ctx.prisma.program.update({
        where: { id },
        data: updateData,
        include: {
          exercises: {
            include: { exercise: { include: { muscleLoads: true } } },
            orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
          },
        },
      })
    }),

  duplicate: therapistProcedure
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

  delete: therapistProcedure
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
})
