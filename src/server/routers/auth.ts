import { z } from 'zod'
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
   * Mobile client roept dit aan na succesvolle MFA enroll/unenroll zodat
   * User.mfaEnabled synchroon blijft met Supabase factors.
   */
  setMfaStatus: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { mfaEnabled: input.enabled },
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
