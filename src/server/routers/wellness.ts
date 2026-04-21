import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'

const createId = () => crypto.randomUUID()

/**
 * Daily wellness check — 4-5 items (1-5 Likert).
 * Evidence: Jeffries 2023 + Ahmun 2019 — subjectieve scores detecteren
 * maladaptatie eerder dan load-ratios.
 */
const checkInput = z.object({
  sleep: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  fatigue: z.number().int().min(1).max(5),
  mood: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  notes: z.string().optional(),
})

function startOfDay(d = new Date()) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export const wellnessRouter = createTRPCRouter({
  /** Vandaag's wellness-check (of null). */
  today: protectedProcedure.query(async ({ ctx }) => {
    const today = startOfDay()
    return ctx.prisma.wellnessCheck.findUnique({
      where: { userId_date: { userId: ctx.user!.id, date: today } },
    })
  }),

  /** Laatste 30 dagen aan wellness-checks. Gebruikt voor trend + Z-score. */
  history: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date()
    since.setDate(since.getDate() - 30)
    return ctx.prisma.wellnessCheck.findMany({
      where: { userId: ctx.user!.id, date: { gte: since } },
      orderBy: { date: 'desc' },
    })
  }),

  /** Save / upsert today's check. */
  submit: protectedProcedure
    .input(checkInput)
    .mutation(async ({ ctx, input }) => {
      const today = startOfDay()
      return ctx.prisma.wellnessCheck.upsert({
        where: { userId_date: { userId: ctx.user!.id, date: today } },
        update: input,
        create: {
          id: createId(),
          userId: ctx.user!.id,
          date: today,
          ...input,
        },
      })
    }),

  /** Therapist: bekijk patient's wellness-trend. */
  forPatient: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check therapist-patient relatie
      if (ctx.user!.role !== 'THERAPIST' && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: {
          therapistId: ctx.user!.id,
          patientId: input.patientId,
          isActive: true, status: 'APPROVED',
        },
      })
      if (!relation && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const since = new Date()
      since.setDate(since.getDate() - 30)
      return ctx.prisma.wellnessCheck.findMany({
        where: { userId: input.patientId, date: { gte: since } },
        orderBy: { date: 'desc' },
      })
    }),
})
