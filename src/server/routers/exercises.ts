import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, creatorProcedure, protectedProcedure } from '@/server/trpc'
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
  loadType: z.enum(['BODYWEIGHT', 'WEIGHTED', 'MACHINE', 'BAND']).default('BODYWEIGHT'),
  isUnilateral: z.boolean().default(false),
  movementPattern: z.enum([
    'SQUAT', 'LUNGE', 'HINGE',
    'PUSH_HORIZONTAL', 'PUSH_VERTICAL',
    'PULL_HORIZONTAL', 'PULL_VERTICAL',
    'HIP_THRUST', 'CALF_RAISE',
    'CORE', 'ROTATION',
    'ISOLATION_UPPER', 'ISOLATION_LOWER',
    'CARRY', 'FULL_BODY',
  ]).nullable().optional(),
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

  create: creatorProcedure
    .input(ExerciseInput)
    .mutation(async ({ ctx, input }) => {
      // Duplicate prevention: check for exercises with same name (case-insensitive)
      const existing = await ctx.prisma.exercise.findFirst({
        where: {
          name: { equals: input.name, mode: 'insensitive' },
          OR: [
            { createdById: ctx.user!.id },
            { isPublic: true },
          ],
        },
        select: { id: true, name: true },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Er bestaat al een oefening met de naam "${existing.name}". Gebruik een andere naam of bewerk de bestaande oefening.`,
        })
      }

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

  update: creatorProcedure
    .input(ExerciseInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, muscleLoads, ...data } = input
      const existing = await ctx.prisma.exercise.findUnique({ where: { id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const canEdit = existing.createdById === ctx.user!.id
        || ctx.user!.role === 'ADMIN'
        || ctx.user!.role === 'THERAPIST'
      if (!canEdit) {
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

  delete: creatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.exercise.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const canDelete = existing.createdById === ctx.user!.id
        || ctx.user!.role === 'ADMIN'
        || ctx.user!.role === 'THERAPIST'
      if (!canDelete) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.exercise.delete({ where: { id: input.id } })
      return { success: true }
    }),

  // ── Collections CRUD ────────────────────────────────────────────────────

  listCollections: protectedProcedure
    .query(async ({ ctx }) => {
      const collections = await ctx.prisma.exerciseCollection.findMany({
        where: { therapistId: ctx.user!.id },
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'asc' },
      })
      return collections.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color ?? '#4ECDC4',
        count: c._count.items,
      }))
    }),

  createCollection: therapistProcedure
    .input(z.object({
      name: z.string().min(1),
      color: z.string().default('#4ECDC4'),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.prisma.exerciseCollection.create({
        data: {
          id: createId(),
          name: input.name,
          color: input.color,
          therapistId: ctx.user!.id,
        },
      })
      return collection
    }),

  updateCollection: therapistProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.exerciseCollection.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.therapistId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN' })
      return ctx.prisma.exerciseCollection.update({
        where: { id: input.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.color ? { color: input.color } : {}),
        },
      })
    }),

  deleteCollection: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.exerciseCollection.findUnique({ where: { id: input.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      if (existing.therapistId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN' })
      await ctx.prisma.exerciseCollection.delete({ where: { id: input.id } })
      return { success: true }
    }),

  addToCollection: therapistProcedure
    .input(z.object({
      collectionId: z.string(),
      exerciseId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.prisma.exerciseCollection.findUnique({ where: { id: input.collectionId } })
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' })
      if (collection.therapistId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN' })
      // Upsert to avoid duplicate errors
      return ctx.prisma.exerciseCollectionItem.upsert({
        where: {
          collectionId_exerciseId: {
            collectionId: input.collectionId,
            exerciseId: input.exerciseId,
          },
        },
        create: {
          id: createId(),
          collectionId: input.collectionId,
          exerciseId: input.exerciseId,
        },
        update: {},
      })
    }),

  removeFromCollection: therapistProcedure
    .input(z.object({
      collectionId: z.string(),
      exerciseId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.prisma.exerciseCollection.findUnique({ where: { id: input.collectionId } })
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' })
      if (collection.therapistId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN' })
      await ctx.prisma.exerciseCollectionItem.deleteMany({
        where: {
          collectionId: input.collectionId,
          exerciseId: input.exerciseId,
        },
      })
      return { success: true }
    }),

  getCollectionExercises: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.exerciseCollectionItem.findMany({
        where: { collectionId: input.collectionId },
        include: {
          exercise: { include: { muscleLoads: true } },
        },
        orderBy: { addedAt: 'asc' },
      })
      return items.map(item => ({
        ...item.exercise,
        muscleLoads: Object.fromEntries(item.exercise.muscleLoads.map(ml => [ml.muscle, ml.load])),
      }))
    }),
})
