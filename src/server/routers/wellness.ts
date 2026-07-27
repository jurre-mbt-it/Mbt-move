import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { practiceScope } from '@/server/lib/patient-access'
import { auditLog } from '@/server/audit'

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
  notes: z.string().max(2000).optional(),
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
      // Check therapist-patient relatie (directe koppeling OF zelfde praktijk).
      if (ctx.user!.role !== 'THERAPIST' && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      if (ctx.user!.role !== 'ADMIN') {
        const me = ctx.user!
        const ok = await ctx.prisma.user.findFirst({
          where: {
            id: input.patientId,
            OR: [
              {
                patientTherapists: {
                  some: {
                    therapistId: me.id,
                    isActive: true,
                    status: { in: ['APPROVED', 'PENDING'] },
                  },
                },
              },
              ...practiceScope(me),
            ],
          },
          select: { id: true },
        })
        if (!ok) throw new TRPCError({ code: 'FORBIDDEN' })
      }
      // Dossier-inzage door therapeut/admin → Wabvpz-audit (net als patients.*).
      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: ctx.user!.id,
        actorEmail: ctx.user!.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'wellness.forPatient' },
        req: ctx.req,
      })
      const since = new Date()
      since.setDate(since.getDate() - 30)
      return ctx.prisma.wellnessCheck.findMany({
        where: { userId: input.patientId, date: { gte: since } },
        orderBy: { date: 'desc' },
      })
    }),
})
