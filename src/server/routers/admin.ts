import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import {
  createTRPCRouter,
  adminProcedure,
  mfaAdminProcedure,
} from '@/server/trpc'

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
          canUseAssessment: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    }),

  setUserRole: mfaAdminProcedure
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

  setUserPractice: mfaAdminProcedure
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

  createPractice: mfaAdminProcedure
    .input(z.object({ name: z.string().min(2) }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practice.create({
        data: { name: input.name },
      })
    }),

  renamePractice: mfaAdminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(2) }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.practice.update({
        where: { id: input.id },
        data: { name: input.name },
      })
    }),

  deletePractice: mfaAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Users blijven bestaan (practiceId wordt gezet op null door Prisma SetNull)
      return ctx.prisma.practice.delete({
        where: { id: input.id },
      })
    }),

  // ── Therapeut uitnodigen ───────────────────────────────────────────────

  inviteTherapist: mfaAdminProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Blokkeer als de gebruiker al in Prisma bestaat
      const existing = await ctx.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, role: true },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `${input.email} bestaat al als ${existing.role}.`,
        })
      }

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        input.email,
        { data: { role: 'THERAPIST', name: input.name ?? '' } },
      )
      if (inviteError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: inviteError.message })
      }

      // Pre-create Prisma user zodat ze direct kunnen inloggen
      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          name: input.name ?? input.email.split('@')[0],
          role: 'THERAPIST',
        },
        select: { id: true, email: true, name: true, role: true },
      })

      return { ok: true, user }
    }),
})
