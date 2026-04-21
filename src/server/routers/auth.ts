import { z } from 'zod'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'

export const authRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return { user: ctx.user }
  }),

  getMe: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        specialty: true,
        bio: true,
        injuryInfo: true,
        injuryVisibleToTherapist: true,
        mfaEnabled: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
    }

    return user
  }),

  /**
   * Sync User.mfaEnabled met de werkelijke Supabase MFA-factoren van de user.
   * De client bepaalt NIET zelf de status — we vragen het aan Supabase op
   * (security review #3). Input werd weggehaald; client roept dit gewoon
   * aan na enroll/unenroll en de server bepaalt de echte stand.
   */
  setMfaStatus: protectedProcedure
    .mutation(async ({ ctx }) => {
      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
        userId: ctx.user.id,
      })
      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      const enabled = (data?.factors ?? []).some((f) => f.status === 'verified')
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { mfaEnabled: enabled },
      })
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        specialty: z.string().optional(),
        bio: z.string().optional(),
        injuryInfo: z.string().nullable().optional(),
        injuryVisibleToTherapist: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: input,
      })
    }),
})
