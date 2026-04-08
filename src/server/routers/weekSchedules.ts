import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, protectedProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'

const createId = () => crypto.randomUUID()

const DayInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  programId: z.string().nullable().optional(),
})

export const weekSchedulesRouter = createTRPCRouter({
  list: therapistProcedure
    .input(z.object({ patientId: z.string().optional(), isTemplate: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.weekSchedule.findMany({
        where: {
          creatorId: ctx.user.id,
          ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
          ...(input?.isTemplate !== undefined ? { isTemplate: input.isTemplate } : {}),
        },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    }),

  get: therapistProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ws = await ctx.prisma.weekSchedule.findFirst({
        where: { id: input.id, creatorId: ctx.user.id },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          days: { include: { program: { select: { id: true, name: true, status: true, weeks: true, daysPerWeek: true, _count: { select: { exercises: true } } } } }, orderBy: { dayOfWeek: 'asc' } },
        },
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND' })
      return ws
    }),

  create: therapistProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      patientId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isTemplate: z.boolean().default(false),
      days: z.array(DayInput).length(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = createId()
      const { patientId, days, startDate, endDate, ...rest } = input
      return ctx.prisma.weekSchedule.create({
        data: {
          id,
          ...rest,
          ...(patientId ? { patientId } : {}),
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          ...(endDate ? { endDate: new Date(endDate) } : {}),
          creatorId: ctx.user.id,
          days: {
            create: days.map(d => ({
              id: createId(),
              dayOfWeek: d.dayOfWeek,
              ...(d.programId ? { programId: d.programId } : {}),
            })),
          },
        },
        include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
      })
    }),

  save: therapistProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      patientId: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      isTemplate: z.boolean().optional(),
      days: z.array(DayInput).length(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, days, patientId, startDate, endDate, ...rest } = input
      const existing = await ctx.prisma.weekSchedule.findFirst({ where: { id, creatorId: ctx.user.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.prisma.weekScheduleDay.deleteMany({ where: { weekScheduleId: id } })

      return ctx.prisma.weekSchedule.update({
        where: { id },
        data: {
          ...rest,
          patientId: patientId ?? null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          days: {
            create: days.map(d => ({
              id: createId(),
              dayOfWeek: d.dayOfWeek,
              ...(d.programId ? { programId: d.programId } : {}),
            })),
          },
        },
        include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
      })
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.weekSchedule.findFirst({ where: { id: input.id, creatorId: ctx.user.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      return ctx.prisma.weekSchedule.delete({ where: { id: input.id } })
    }),

  // Patient: get their assigned week schedule
  mySchedule: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.weekSchedule.findFirst({
        where: { patientId: ctx.user!.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          days: {
            include: {
              program: {
                include: {
                  exercises: {
                    include: { exercise: { select: { id: true, name: true, category: true, videoUrl: true } } },
                    orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
                  },
                },
              },
            },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      })
    }),
})
