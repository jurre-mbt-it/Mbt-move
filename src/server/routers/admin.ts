import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, adminProcedure } from '@/server/trpc'

/**
 * Admin-only router. Beheer van users, rollen en praktijken.
 */
export const adminRouter = createTRPCRouter({
  // ── Users ─────────────────────────────────────────────────────────────

  listUsers: adminProcedure
    .input(
      z
        .object({
          role: z.enum(['PATIENT', 'ATHLETE', 'THERAPIST', 'ADMIN']).optional(),
          query: z.string().optional(),
          practiceId: z.string().nullable().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        where: {
          ...(input?.role ? { role: input.role } : {}),
          ...(input?.practiceId !== undefined
            ? { practiceId: input.practiceId }
            : {}),
          ...(input?.query
            ? {
                OR: [
                  { name: { contains: input.query, mode: 'insensitive' as const } },
                  { email: { contains: input.query, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          practiceId: true,
          createdAt: true,
          mfaEnabled: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    }),

  setUserRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(['PATIENT', 'ATHLETE', 'THERAPIST', 'ADMIN']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Bescherming tegen self-demote: admin kan zichzelf niet downgraden
      if (input.userId === ctx.user.id && input.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Je kunt je eigen admin-rol niet intrekken',
        })
      }
      return ctx.prisma.user.update({
        where: { id: input.userId },
        data: { role: input.role },
        select: { id: true, name: true, email: true, role: true },
      })
    }),

  setUserPractice: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        practiceId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.practiceId) {
        const practice = await ctx.prisma.practice.findUnique({
          where: { id: input.practiceId },
        })
        if (!practice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Praktijk niet gevonden' })
      }
      return ctx.prisma.user.update({
        where: { id: input.userId },
        data: { practiceId: input.practiceId },
        select: { id: true, name: true, email: true, role: true, practiceId: true },
      })
    }),

  // ── Practices ─────────────────────────────────────────────────────────

  listPractices: adminProcedure.query(({ ctx }) => {
    return ctx.prisma.practice.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { users: true } },
      },
    })
  }),

  createPractice: adminProcedure
    .input(z.object({ name: z.string().min(2) }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practice.create({
        data: { name: input.name },
      })
    }),

  renamePractice: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(2) }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practice.update({
        where: { id: input.id },
        data: { name: input.name },
      })
    }),

  deletePractice: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Users blijven bestaan (practiceId wordt gezet op null door Prisma SetNull)
      return ctx.prisma.practice.delete({
        where: { id: input.id },
      })
    }),
})
