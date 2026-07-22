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
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { deliverToTokens, fetchReceipts } from '@/server/push/send'

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

  // ── Geregistreerde devices van de caller ────────────────────────────────────
  /** Toont waar meldingen heen zouden gaan. Geen tokens naar de client: die
   *  horen niet in een browser thuis en zeggen de gebruiker niets. */
  devices: protectedProcedure.query(async ({ ctx }) => {
    const devices = await ctx.prisma.pushToken.findMany({
      where: { userId: ctx.user.id },
      select: { id: true, platform: true, deviceName: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: 'desc' },
    })
    return devices
  }),

  // ── Testmelding naar de eigen devices ───────────────────────────────────────
  /**
   * Stuurt een melding naar de eigen toestellen en rapporteert wat er onderweg
   * gebeurde. Bewust langs voorkeuren en quiet hours heen: de gebruiker vraagt
   * hier expliciet om, en het doel is de keten testen (server → Expo → Apple →
   * toestel). Staat de master-switch uit, dan zegt het antwoord dat erbij —
   * anders lijkt het alsof alles werkt terwijl echte meldingen geblokkeerd zijn.
   */
  sendTest: protectedProcedure.mutation(async ({ ctx }) => {
    const rl = await rateLimit('push.sendTest', ctx.user.id, RATE_LIMITS.pushTest)
    if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })

    const tokens = await ctx.prisma.pushToken.findMany({
      where: { userId: ctx.user.id },
      select: { token: true },
    })
    if (tokens.length === 0) {
      return {
        devices: 0,
        delivered: 0,
        pushEnabled: true,
        errors: [] as string[],
        removedTokens: 0,
        receiptErrors: [] as string[],
      }
    }

    const prefs = await ctx.prisma.notificationPreference.findUnique({
      where: { userId: ctx.user.id },
    })

    const result = await deliverToTokens(
      tokens.map((t) => t.token),
      {
        title: 'Testmelding',
        body: 'Als je dit ziet, komen pushmeldingen aan op dit toestel.',
        data: { type: 'test' },
      },
    )

    // Apple meldt een geweigerde push pas in het ontvangstbewijs. Even wachten
    // levert een veel bruikbaarder antwoord dan "aangenomen door Expo".
    let receiptErrors: string[] = []
    if (result.ticketIds.length > 0) {
      await new Promise((r) => setTimeout(r, 2500))
      receiptErrors = (await fetchReceipts(result.ticketIds)).errors
    }

    return {
      devices: tokens.length,
      delivered: result.delivered,
      pushEnabled: prefs?.pushEnabled ?? true,
      errors: result.errors,
      removedTokens: result.removedTokens,
      receiptErrors,
    }
  }),
})
