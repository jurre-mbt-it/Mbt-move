import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, protectedProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'

const createId = () => crypto.randomUUID()

/**
 * Security: zorg dat een therapeut alleen een schedule kan koppelen aan een
 * patiënt waarmee een actieve relatie bestaat. Admin mag altijd.
 * Zie security review #5.
 */
async function assertPatientLink(
  prisma: PrismaClient,
  user: { id: string; role: string },
  patientId: string | null | undefined,
) {
  if (!patientId) return
  if (user.role === 'ADMIN') return
  if (patientId === user.id) return
  const relation = await prisma.patientTherapist.findFirst({
    where: { therapistId: user.id, patientId, isActive: true, status: 'APPROVED' },
  })
  if (!relation) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve koppeling met deze patiënt',
    })
  }
}

const DayInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  programId: z.string().nullable().optional(),
})

export const weekSchedulesRouter = createTRPCRouter({
  list: therapistProcedure
    .input(z.object({ patientId: z.string().optional(), isTemplate: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'ADMIN'
      const practiceId = ctx.user.practiceId
      return ctx.prisma.weekSchedule.findMany({
        where: {
          ...(isAdmin ? {} : { creatorId: ctx.user.id }),
          ...(practiceId && !isAdmin ? { practiceId } : {}),
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
      const ws = await ctx.prisma.weekSchedule.findUnique({
        where: { id: input.id },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          days: { include: { program: { select: { id: true, name: true, status: true, weeks: true, daysPerWeek: true, _count: { select: { exercises: true } } } } }, orderBy: { dayOfWeek: 'asc' } },
        },
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = ws.creatorId === ctx.user.id
      const isAssignedPatient = ws.patientId === ctx.user.id
      const isSamePractice =
        !!ctx.user.practiceId &&
        !!ws.practiceId &&
        ws.practiceId === ctx.user.practiceId
      if (!isAdmin && !isOwner && !isAssignedPatient && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
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
      await assertPatientLink(ctx.prisma, ctx.user, patientId)
      return ctx.prisma.weekSchedule.create({
        data: {
          id,
          ...rest,
          ...(patientId ? { patientId } : {}),
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          ...(endDate ? { endDate: new Date(endDate) } : {}),
          creatorId: ctx.user.id,
          practiceId: ctx.user.practiceId ?? null,
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
      await assertPatientLink(ctx.prisma, ctx.user, patientId)

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

  /**
   * Plan een programma in de kalender van een patient voor X weken op bepaalde dagen.
   * Merged met bestaande schedule: overschrijft de geselecteerde dagen, laat andere dagen
   * intact. Als er nog geen schedule bestaat voor de patient, wordt er eentje aangemaakt.
   */
  scheduleProgram: therapistProcedure
    .input(
      z.object({
        programId: z.string(),
        patientId: z.string(),
        weeks: z.number().int().min(1).max(52),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check ownership van programma
      const program = await ctx.prisma.program.findUnique({
        where: { id: input.programId },
      })
      if (!program) throw new TRPCError({ code: 'NOT_FOUND', message: 'Programma niet gevonden' })
      if (program.creatorId !== ctx.user.id && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      // Check dat patient gekoppeld is aan deze therapist
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.patientId, isActive: true, status: 'APPROVED' },
      })
      if (!relation) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Patient is niet aan jou gekoppeld' })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { name: true, email: true },
      })

      const now = new Date()
      const endDate = new Date(now.getTime() + input.weeks * 7 * 24 * 60 * 60 * 1000)

      // Zoek bestaande schedule (per therapist + patient)
      const existing = await ctx.prisma.weekSchedule.findFirst({
        where: { creatorId: ctx.user.id, patientId: input.patientId },
        include: { days: true },
      })

      const uniqueDays = Array.from(new Set(input.daysOfWeek))

      if (existing) {
        // Merge: update/insert dagen voor dit programma, laat andere dagen ongemoeid
        // (behalve dagen die voorheen dit programma hadden maar nu niet meer geselecteerd zijn)
        const existingDayMap = new Map(existing.days.map(d => [d.dayOfWeek, d]))

        // Verwijder dagen die voorheen dit programma hadden maar nu niet meer in selectie
        const toClear = existing.days.filter(
          d => d.programId === input.programId && !uniqueDays.includes(d.dayOfWeek),
        )
        for (const d of toClear) {
          await ctx.prisma.weekScheduleDay.update({
            where: { id: d.id },
            data: { programId: null },
          })
        }

        // Zet geselecteerde dagen op dit programma
        for (const dow of uniqueDays) {
          const existingDay = existingDayMap.get(dow)
          if (existingDay) {
            await ctx.prisma.weekScheduleDay.update({
              where: { id: existingDay.id },
              data: { programId: input.programId },
            })
          } else {
            await ctx.prisma.weekScheduleDay.create({
              data: {
                id: createId(),
                weekScheduleId: existing.id,
                dayOfWeek: dow,
                programId: input.programId,
              },
            })
          }
        }

        return ctx.prisma.weekSchedule.update({
          where: { id: existing.id },
          data: {
            startDate: existing.startDate ?? now,
            endDate,
            updatedAt: now,
          },
          include: {
            days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } },
          },
        })
      }

      // Nieuwe schedule aanmaken met 7 dagen
      const patientLabel = patient?.name ?? patient?.email ?? 'Patient'
      return ctx.prisma.weekSchedule.create({
        data: {
          id: createId(),
          name: `Weekplan · ${patientLabel}`,
          creatorId: ctx.user.id,
          practiceId: ctx.user.practiceId ?? null,
          patientId: input.patientId,
          startDate: now,
          endDate,
          isTemplate: false,
          days: {
            create: Array.from({ length: 7 }, (_, dow) => ({
              id: createId(),
              dayOfWeek: dow,
              ...(uniqueDays.includes(dow) ? { programId: input.programId } : {}),
            })),
          },
        },
        include: {
          days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } },
        },
      })
    }),
})
