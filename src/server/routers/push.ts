/**
 * Push-registratie en notificatie-voorkeuren voor de mobiele app.
 *
 * `register`/`unregister` beheren de Expo push-tokens per device; `getPreferences`/
 * `setPreferences` de master-switch + per-categorie toggles. Alle toegang loopt
 * via een geverifieerde JWT-context (protectedProcedure); de tabellen hebben RLS
 * deny-all zodat de anon-key er niet bij kan.
 */
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'

const categoriesSchema = z.object({
  message: z.boolean().optional(),
  schedule: z.boolean().optional(),
  reminder: z.boolean().optional(),
  insight: z.boolean().optional(),
})

function readCategory(categories: unknown, key: string): boolean {
  if (!categories || typeof categories !== 'object') return true
  return (categories as Record<string, unknown>)[key] !== false
}

export const pushRouter = createTRPCRouter({
  // ── Device registreren ─────────────────────────────────────────────────────
  register: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1).max(255),
        platform: z.enum(['ios', 'android']),
        deviceName: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Upsert op token: registreert hetzelfde device opnieuw (of wisselt van
      // gebruiker op een gedeeld toestel), dan herbinden aan de huidige user en
      // lastSeen verversen. Zo hoort een token altijd bij precies één account.
      await ctx.prisma.pushToken.upsert({
        where: { token: input.token },
        create: {
          userId: ctx.user.id,
          token: input.token,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
        },
        update: {
          userId: ctx.user.id,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          lastSeenAt: new Date(),
        },
      })
      return { ok: true }
    }),

  // ── Device afmelden (bij uitloggen) ─────────────────────────────────────────
  unregister: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Alleen een token verwijderen dat aan de huidige gebruiker hangt.
      await ctx.prisma.pushToken.deleteMany({
        where: { token: input.token, userId: ctx.user.id },
      })
      return { ok: true }
    }),

  // ── Voorkeuren lezen ────────────────────────────────────────────────────────
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.prisma.notificationPreference.findUnique({
      where: { userId: ctx.user.id },
    })
    return {
      pushEnabled: prefs?.pushEnabled ?? true,
      categories: {
        message: readCategory(prefs?.categories, 'message'),
        schedule: readCategory(prefs?.categories, 'schedule'),
        reminder: readCategory(prefs?.categories, 'reminder'),
        insight: readCategory(prefs?.categories, 'insight'),
      },
    }
  }),

  // ── Voorkeuren zetten (partieel; ongenoemde velden blijven staan) ───────────
  setPreferences: protectedProcedure
    .input(
      z.object({
        pushEnabled: z.boolean().optional(),
        categories: categoriesSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.notificationPreference.findUnique({
        where: { userId: ctx.user.id },
      })
      const currentCategories =
        existing?.categories && typeof existing.categories === 'object'
          ? (existing.categories as Record<string, unknown>)
          : {}
      const mergedCategories = { ...currentCategories, ...(input.categories ?? {}) }

      await ctx.prisma.notificationPreference.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          pushEnabled: input.pushEnabled ?? true,
          categories: mergedCategories as Prisma.InputJsonValue,
        },
        update: {
          ...(input.pushEnabled !== undefined ? { pushEnabled: input.pushEnabled } : {}),
          categories: mergedCategories as Prisma.InputJsonValue,
        },
      })
      return { ok: true }
    }),
})
