/**
 * Dagdoelen voor de activiteitsringen in de mobiele app.
 *
 * `get`/`set` beheren de persoonlijke doelen (kcal, trainingsminuten, stappen,
 * slaap). Elke null betekent "automatisch": de client rekent dan zelf de
 * slimme default uit (mediaan van 30 dagen wearable-data / persoonlijke
 * slaapbehoefte). Alle toegang loopt via een geverifieerde JWT-context
 * (protectedProcedure); de tabel heeft RLS deny-all zodat de anon-key er
 * niet bij kan.
 */
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'

export const dailyGoalsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const g = await ctx.prisma.dailyGoal.findUnique({ where: { userId: ctx.user.id } })
    return {
      kcalGoal: g?.kcalGoal ?? null,
      trainMinGoal: g?.trainMinGoal ?? null,
      stepsGoal: g?.stepsGoal ?? null,
      sleepMinGoal: g?.sleepMinGoal ?? null,
    }
  }),

  set: protectedProcedure
    .input(
      z.object({
        kcalGoal: z.number().int().min(50).max(5000).nullable().optional(),
        trainMinGoal: z.number().int().min(5).max(600).nullable().optional(),
        stepsGoal: z.number().int().min(500).max(100_000).nullable().optional(),
        sleepMinGoal: z.number().int().min(240).max(840).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Alleen meegegeven velden raken; expliciete null = terug naar automatisch.
      const data: Record<string, number | null> = {}
      for (const k of ['kcalGoal', 'trainMinGoal', 'stepsGoal', 'sleepMinGoal'] as const) {
        if (input[k] !== undefined) data[k] = input[k] ?? null
      }
      await ctx.prisma.dailyGoal.upsert({
        where: { userId: ctx.user.id },
        create: { userId: ctx.user.id, ...data },
        update: data,
      })
      return { ok: true }
    }),
})
