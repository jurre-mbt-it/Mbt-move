import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, protectedProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'

const createId = () => crypto.randomUUID()

const ExerciseInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY']),
  bodyRegion: z.array(z.enum(['KNEE', 'SHOULDER', 'BACK', 'ANKLE', 'HIP', 'FULL_BODY', 'CERVICAL', 'THORACIC', 'LUMBAR', 'ELBOW', 'WRIST', 'FOOT'])),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  mediaType: z.enum(['UPLOAD', 'YOUTUBE', 'VIMEO']).nullable().optional(),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  instructions: z.array(z.string()).default([]),
  tips: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  muscleLoads: z.record(z.string(), z.number().min(1).max(5)).default({}),
  easierVariantId: z.string().nullable().optional(),
  harderVariantId: z.string().nullable().optional(),
})

export const exercisesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      query: z.string().optional(),
      category: z.string().optional(),
      bodyRegion: z.string().optional(),
      difficulty: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const exercises = await ctx.prisma.exercise.findMany({
        where: {
          OR: [
            { createdById: ctx.user!.id },
            { isPublic: true },
          ],
          ...(input?.category ? { category: input.category as never } : {}),
          ...(input?.difficulty ? { difficulty: input.difficulty as never } : {}),
          ...(input?.bodyRegion ? { bodyRegion: { has: input.bodyRegion as never } } : {}),
          ...(input?.query ? {
            OR: [
              { name: { contains: input.query, mode: 'insensitive' } },
              { tags: { has: input.query.toLowerCase() } },
            ],
          } : {}),
        },
        include: {
          muscleLoads: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      return exercises.map(ex => ({
        ...ex,
        muscleLoads: Object.fromEntries(ex.muscleLoads.map(ml => [ml.muscle, ml.load])),
      }))
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ex = await ctx.prisma.exercise.findUnique({
        where: { id: input.id },
        include: { muscleLoads: true },
      })
      if (!ex) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!ex.isPublic && ex.createdById !== ctx.user!.id) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      return {
        ...ex,
        muscleLoads: Object.fromEntries(ex.muscleLoads.map(ml => [ml.muscle, ml.load])),
      }
    }),

  create: therapistProcedure
    .input(ExerciseInput)
    .mutation(async ({ ctx, input }) => {
      const { muscleLoads, ...data } = input
      const id = createId()
      const exercise = await ctx.prisma.exercise.create({
        data: {
          ...data,
          id,
          createdById: ctx.user!.id,
          muscleLoads: {
            create: Object.entries(muscleLoads).map(([muscle, load]) => ({
              id: createId(),
              muscle,
              load,
            })),
          },
        },
        include: { muscleLoads: true },
      })
      return {
        ...exercise,
        muscleLoads: Object.fromEntries(exercise.muscleLoads.map(ml => [ml.muscle, ml.load])),
      }
    }),

  update: therapistProcedure
    .input(ExerciseInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, muscleLoads, ...data } = input
      const existing = await ctx.prisma.exercise.findUnique({ where: { id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.createdById !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      // Replace all muscle loads
      await ctx.prisma.muscleLoad.deleteMany({ where: { exerciseId: id } })

      const exercise = await ctx.prisma.exercise.update({
        where: { id },
        data: {
          ...data,
          muscleLoads: {
            create: Object.entries(muscleLoads).map(([muscle, load]) => ({
              id: createId(),
              muscle,
              load,
            })),
          },
        },
        include: { muscleLoads: true },
      })
      return {
        ...exercise,
        muscleLoads: Object.fromEntries(exercise.muscleLoads.map(ml => [ml.muscle, ml.load])),
      }
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.exercise.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.createdById !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.exercise.delete({ where: { id: input.id } })
      return { success: true }
    }),
})
