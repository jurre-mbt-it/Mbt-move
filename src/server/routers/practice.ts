import { z } from 'zod'
import { CATEGORY_COLORS } from '@/lib/palette'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, coachStaffProcedure } from '@/server/trpc'

/**
 * Praktijk-profiel.
 *
 * Read: elke ingelogde user mag de eigen praktijk lezen (nodig voor
 *   email-footer rendering aan therapeut-zijde + waarschuwing-banners).
 * Write: alleen de owner van die praktijk (`isPracticeOwner = true`) of een
 *   ADMIN. Server-side check, omdat Prisma momenteel via service_role draait
 *   en RLS niet effectief is voor deze writes.
 */

const PracticeUpdateInput = z.object({
  name: z.string().trim().min(1).max(120),
  addressLine1: z.string().trim().max(120).nullable().optional(),
  addressLine2: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal('').transform(() => null)),
  website: z.string().trim().url().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  logoUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal('').transform(() => null)),
  agbCodePractice: z.string().trim().max(20).nullable().optional(),
  // Plain text only — geen markdown/HTML, voorkomt XSS in email-templates.
  privacyDisclaimer: z.string().trim().max(500).nullable().optional(),
})

async function assertOwnerOrAdmin(
  prisma: typeof import('@/lib/prisma').prisma,
  userId: string,
  practiceId: string,
) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, practiceId: true, isPracticeOwner: true },
  })
  if (!me) throw new TRPCError({ code: 'NOT_FOUND' })
  if (me.role === 'ADMIN') return
  if (me.practiceId !== practiceId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Niet jouw praktijk' })
  }
  if (!me.isPracticeOwner) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Alleen de praktijkeigenaar mag deze gegevens bewerken',
    })
  }
}

/** Zes-cijferige hexcode; niets anders mag in een style-attribuut belanden. */
const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Ongeldige kleurcode')

/** Alleen de vijf bekende soorten, alleen geldige hexcodes. */
function schoon(inp: Record<string, string>): Record<string, string> {
  const uit: Record<string, string> = {}
  for (const sleutel of Object.keys(CATEGORY_COLORS)) {
    const v = inp[sleutel]
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) uit[sleutel] = v.toUpperCase()
  }
  return uit
}

/**
 * Velden die de client van een praktijk mag zien. Expliciet, zodat `uiPrefs`
 * niet meereist: dat is een recursief Json-type en daar valt de tRPC-typeboom
 * van om (TS2589 in elk scherm dat de router aanraakt).
 */
const PRACTICE_FIELDS = {
  id: true, name: true, addressLine1: true, addressLine2: true, postalCode: true,
  city: true, country: true, phone: true, email: true, website: true,
  logoUrl: true, agbCodePractice: true, privacyDisclaimer: true,
  createdAt: true, updatedAt: true,
} as const

export const practiceRouter = createTRPCRouter({
  /** Eigen praktijk ophalen + de owner-naam (voor de waarschuwing-copy aan
   *  niet-owners: "Vraag {ownerName} om dit aan te passen"). */
  getMine: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user!.practiceId) return null
    const practice = await ctx.prisma.practice.findUnique({
      where: { id: ctx.user!.practiceId },
      select: PRACTICE_FIELDS,
    })
    if (!practice) return null
    const owner = await ctx.prisma.user.findFirst({
      where: { practiceId: practice.id, isPracticeOwner: true },
      select: { id: true, name: true, firstName: true, lastName: true, email: true },
    })
    return { ...practice, owner }
  }),

  update: protectedProcedure
    .input(PracticeUpdateInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user!.practiceId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Geen praktijk gekoppeld' })
      }
      await assertOwnerOrAdmin(ctx.prisma, ctx.user!.id, ctx.user!.practiceId)
      // `email`/`website`/`logoUrl` zijn al genormaliseerd naar null door zod.
      return ctx.prisma.practice.update({
        where: { id: ctx.user!.practiceId },
        data: input,
        select: PRACTICE_FIELDS,
      })
    }),

  /** Logo uit DB en storage verwijderen. Storage-delete via service_role. */
  removeLogo: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user!.practiceId) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Geen praktijk gekoppeld' })
    }
    await assertOwnerOrAdmin(ctx.prisma, ctx.user!.id, ctx.user!.practiceId)
    const current = await ctx.prisma.practice.findUnique({
      where: { id: ctx.user!.practiceId },
      select: { logoUrl: true },
    })
    if (current?.logoUrl) {
      // Pad uit URL halen: ".../object/public/practice-logos/{practiceId}/logo.ext"
      const match = current.logoUrl.match(/\/practice-logos\/(.+?)(?:\?|$)/)
      if (match) {
        const { createClient } = await import('@supabase/supabase-js')
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        await admin.storage.from('practice-logos').remove([match[1]]).catch(() => {
          // Best-effort — als verwijderen faalt blijft het object weeshangen,
          // maar de DB-link is wel weg. Daar is een storage-cleanup-cron voor.
        })
      }
    }
    return ctx.prisma.practice.update({
      where: { id: ctx.user!.practiceId },
      data: { logoUrl: null },
      select: PRACTICE_FIELDS,
    })
  }),

  /** Alleen voor de live email-preview in settings: rendert de footer-HTML
   *  met de huidige (nog niet opgeslagen) praktijk-input + de eigen therapeut-
   *  identiteit. Niet voor mail-versturen — dat gebeurt server-side bij
   *  `/api/email/send`. */
  previewFooter: protectedProcedure
    .input(z.object({
      practice: PracticeUpdateInput.partial().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.user!.id },
        select: { firstName: true, lastName: true, jobTitle: true, name: true },
      })
      const { renderEmailFooter } = await import('@/server/email/footer')
      return {
        html: renderEmailFooter({
          therapist: me ?? {},
          practice: input.practice as Parameters<typeof renderEmailFooter>[0]['practice'],
        }),
      }
    }),
  /**
   * Kleur per trainingssoort. Hoort bij de praktijk zodat collega's dezelfde
   * kalender zien; heb je geen praktijk (losse coach), dan bij jezelf. Alleen
   * de vijf bekende soorten worden opgeslagen en alleen als geldige hexcode —
   * de waarde belandt in een style-attribuut en mag dus niets anders kunnen zijn.
   */
  categoryColors: coachStaffProcedure.query(async ({ ctx }) => {
    const me = ctx.user!
    const bron = me.practiceId
      ? await ctx.prisma.practice.findUnique({ where: { id: me.practiceId }, select: { uiPrefs: true } })
      : await ctx.prisma.user.findUnique({ where: { id: me.id }, select: { uiPrefs: true } })
    const opgeslagen = (bron?.uiPrefs as { categoryColors?: Record<string, string> } | null)?.categoryColors ?? {}
    return {
      scope: me.practiceId ? ('practice' as const) : ('user' as const),
      colors: { ...CATEGORY_COLORS, ...schoon(opgeslagen) },
      defaults: CATEGORY_COLORS,
    }
  }),

  setCategoryColors: coachStaffProcedure
    .input(z.object({
      // Bewust vijf losse velden en geen z.record: dat laatste maakt de
      // tRPC-typeboom zo diep dat TypeScript elders in de app afhaakt (TS2589).
      colors: z.object({
        STRENGTH: HEX.optional(),
        MOBILITY: HEX.optional(),
        PLYOMETRICS: HEX.optional(),
        CARDIO: HEX.optional(),
        STABILITY: HEX.optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.user!
      const colors = schoon(input.colors as Record<string, string>)
      if (me.practiceId) {
        const rij = await ctx.prisma.practice.findUnique({
          where: { id: me.practiceId }, select: { uiPrefs: true },
        })
        const prefs = { ...(rij?.uiPrefs as Record<string, unknown> ?? {}), categoryColors: colors }
        await ctx.prisma.practice.update({ where: { id: me.practiceId }, data: { uiPrefs: prefs } })
      } else {
        const rij = await ctx.prisma.user.findUnique({ where: { id: me.id }, select: { uiPrefs: true } })
        const prefs = { ...(rij?.uiPrefs as Record<string, unknown> ?? {}), categoryColors: colors }
        await ctx.prisma.user.update({ where: { id: me.id }, data: { uiPrefs: prefs } })
      }
      return { colors: { ...CATEGORY_COLORS, ...colors } }
    }),
})
