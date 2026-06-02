import { z } from 'zod'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createTRPCRouter, publicProcedure, adminProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { matchSlug, LABELS, type IntakeAnswers } from '@/lib/shop/intake/flow'
import { sendOrderEmails as sendOrderEmailsLib } from '@/lib/shop/email/order-emails'
import { isShopPublic } from '@/lib/shop/access'
import { createPayment, isMollieConfigured } from '@/lib/shop/mollie'
import { syncOrderWithMollie } from '@/lib/shop/fulfillment'
import { getAppUrl } from '@/lib/app-url'

const BODY_REGIONS = [
  'KNEE', 'SHOULDER', 'BACK', 'ANKLE', 'HIP', 'FULL_BODY',
  'CERVICAL', 'THORACIC', 'LUMBAR', 'ELBOW', 'WRIST', 'FOOT',
] as const

const ProductInput = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Alleen kleine letters, cijfers en koppeltekens'),
  name: z.string().min(1),
  kind: z.enum(['PROGRAM', 'PHYSICAL', 'SERVICE']).default('PROGRAM'),
  tagline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  programId: z.string().nullable().optional(),
  therapistId: z.string().nullable().optional(),
  priceCents: z.number().int().min(0),
  vatRate: z.number().int().min(0).max(100).default(21),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).nullable().optional(),
  durationWeeks: z.number().int().min(0).nullable().optional(),
  bodyRegion: z.array(z.enum(BODY_REGIONS)).default([]),
  heroImageUrl: z.string().nullable().optional(),
  previewVideoUrl: z.string().nullable().optional(),
  highlights: z.array(z.string()).default([]),
  intakeTags: z.array(z.string()).default([]),
  // PHYSICAL (artikel): voorraad + verzending.
  sku: z.string().nullable().optional(),
  stockQty: z.number().int().min(0).nullable().optional(),
  requiresShipping: z.boolean().default(false),
  weightGrams: z.number().int().min(0).nullable().optional(),
  // SERVICE (dienst): boekingslink.
  bookingUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
})

export const shopRouter = createTRPCRouter({
  // ── Publiek (storefront) ──────────────────────────────────────────────────
  listPublished: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.shopProduct.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.prisma.shopProduct.findUnique({
        where: { slug: input.slug },
      })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND' })
      // Niet-gepubliceerde producten zijn alleen voor admin zichtbaar (preview).
      if (product.status !== 'PUBLISHED' && ctx.user?.role !== 'ADMIN') {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      return product
    }),

  // ── Admin (product-bouwer) ────────────────────────────────────────────────
  adminList: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.shopProduct.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        program: { select: { id: true, name: true, weeks: true, daysPerWeek: true } },
        therapist: { select: { id: true, name: true, firstName: true, lastName: true } },
      },
    })
  }),

  /** Program-templates die als product gekoppeld kunnen worden. */
  adminListPrograms: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.program.findMany({
      where: { isTemplate: true },
      select: { id: true, name: true, type: true, weeks: true, daysPerWeek: true },
      orderBy: { name: 'asc' },
    })
  }),

  /** Therapeuten die aan een product gekoppeld kunnen worden (omzetverdeling). */
  adminListTherapists: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      where: { role: { in: ['THERAPIST', 'ADMIN'] } },
      select: { id: true, name: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { name: 'asc' }],
    })
  }),

  adminUpsert: adminProcedure
    .input(ProductInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // Slug-uniciteit netjes afvangen (i.p.v. een ruwe DB-constraint-error).
      const slugOwner = await ctx.prisma.shopProduct.findUnique({
        where: { slug: data.slug },
        select: { id: true },
      })
      if (slugOwner && slugOwner.id !== id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Deze slug is al in gebruik.' })
      }

      if (id) {
        return ctx.prisma.shopProduct.update({ where: { id }, data })
      }
      return ctx.prisma.shopProduct.create({ data })
    }),

  adminDelete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Producten met bestellingen niet hard verwijderen — archiveren.
      const sold = await ctx.prisma.shopOrderItem.count({ where: { productId: input.id } })
      if (sold > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Dit product heeft bestellingen. Archiveer het in plaats van verwijderen.',
        })
      }
      await ctx.prisma.shopEntitlement.deleteMany({ where: { productId: input.id } })
      await ctx.prisma.shopProduct.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  // ── AI-intake: rode-vlaggen-check → match op catalogus → opslaan ───────────
  intakeRecommend: publicProcedure
    .input(
      z.object({
        consent: z.literal(true),
        redFlags: z.array(z.string()).default([]),
        goal: z.enum(['hardlopen', 'klacht', 'prehab']),
        level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
        region: z.enum(['achilles', 'patella', 'rug', 'heup']).optional(),
        surgery: z.enum(['acl', 'meniscus']).optional(),
        daysPerWeek: z.enum(['2', '3', '4+']).optional(),
        location: z.enum(['thuis', 'gym', 'allebei']).optional(),
        duration: z.enum(['kort', 'middel', 'lang']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const realFlags = input.redFlags.filter((f) => f && f !== 'none')

      // Verplichte veiligheidscheck: bij een alarmsignaal geen programma adviseren.
      if (realFlags.length > 0) {
        await ctx.prisma.shopIntakeSession.create({
          data: { status: 'RED_FLAGGED', redFlagged: true, consentGiven: true, answers: { goal: input.goal } },
        })
        return { redFlagged: true as const }
      }

      const products = await ctx.prisma.shopProduct.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [{ sortOrder: 'asc' }],
      })
      if (products.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen programma’s beschikbaar.' })
      }

      const answers: IntakeAnswers = {
        goal: input.goal,
        level: input.level,
        region: input.region,
        surgery: input.surgery,
        daysPerWeek: input.daysPerWeek,
        location: input.location,
        duration: input.duration,
      }
      const candidate = matchSlug(answers)
      const slugs = products.map((p) => p.slug) as [string, ...string[]]

      const lines = [
        `Doel: ${LABELS.goal[input.goal]}`,
        input.level ? `Ervaring: ${LABELS.level[input.level]}` : null,
        input.region ? `Klacht: ${LABELS.region[input.region]}` : null,
        input.surgery ? `Operatie: ${LABELS.surgery[input.surgery]}` : null,
        input.duration ? `Duur klacht: ${LABELS.duration[input.duration]}` : null,
        input.daysPerWeek ? `Dagen per week: ${input.daysPerWeek === '4+' ? '4 of meer' : input.daysPerWeek}` : null,
        input.location ? `Traint het liefst: ${input.location}` : null,
      ]
        .filter(Boolean)
        .join('\n')

      let recommendedSlug = candidate
      let alternativeSlug: string | null = null
      let rationale = ''

      try {
        const catalog = products
          .map(
            (p) =>
              `- ${p.slug}: ${p.name}. ${p.tagline ?? ''} (niveau ${p.level ?? '-'}, ${p.durationWeeks ?? '-'} weken). Geschikt voor: ${p.intakeTags.join(', ')}`,
          )
          .join('\n')

        const { object } = await generateObject({
          model: anthropic('claude-haiku-4-5'),
          schema: z.object({
            recommendedSlug: z.enum(slugs),
            alternativeSlug: z.enum(slugs).nullable(),
            rationale: z.string(),
          }),
          system: [
            'Je bent de digitale intake van MBT Gym, een sportfysiotherapiepraktijk in Amsterdam.',
            'Je adviseert precies één trainingsprogramma uit de onderstaande catalogus dat het best past bij de antwoorden. Kies uitsluitend uit de catalogus.',
            '',
            'Schrijfstijl voor de onderbouwing (streng volgen):',
            '- Spreek de lezer aan met "je". Verwijs naar de praktijk als "wij" of "we".',
            '- Nuchter, zelfverzekerd en geruststellend. Evidence-based, geen marketingtaal.',
            '- Gebruik GEEN gedachtestreepjes en geen en-dashes; gebruik gewone leestekens.',
            '- Gebruik GEEN slogan-achtige oneliners of "X, niet Y"-constructies.',
            '- Schrijf 2 tot 3 hele zinnen en verwijs concreet naar wat de bezoeker heeft ingevuld.',
            '- Geen diagnose stellen; het is een trainingsprogramma, geen behandeling.',
            '- Beloof geen persoonlijke aanpassingen of begeleiding; het is een vast, kant-en-klaar programma. Schrijf niet "we passen het voor je aan".',
            '',
            'Catalogus:',
            catalog,
          ].join('\n'),
          prompt: [
            'Antwoorden van de bezoeker:',
            lines,
            '',
            `Op basis van vaste regels lijkt "${candidate}" een logische keuze. Bevestig dit programma of kies een beter passend programma uit de catalogus. Geef ook een passend alternatief (of null) en de onderbouwing.`,
          ].join('\n'),
        })
        recommendedSlug = object.recommendedSlug
        alternativeSlug = object.alternativeSlug
        rationale = object.rationale
      } catch {
        const p = products.find((x) => x.slug === candidate)
        rationale = p
          ? `Op basis van je antwoorden past ${p.name} goed bij je. ${(p.description ?? '').split('. ')[0]}. Je kunt het in je eigen tempo volgen en rustig opbouwen.`
          : 'Op basis van je antwoorden hebben we een passend programma voor je geselecteerd.'
      }

      // Veiligheidsnet: haal eventuele gedachtestreepjes uit de tekst.
      rationale = rationale.replace(/\s*[—–]\s*/g, ', ').trim()

      const recommended =
        products.find((p) => p.slug === recommendedSlug) ?? products.find((p) => p.slug === candidate)!
      const alternative =
        alternativeSlug && alternativeSlug !== recommended.slug
          ? products.find((p) => p.slug === alternativeSlug) ?? null
          : null

      await ctx.prisma.shopIntakeSession.create({
        data: {
          status: 'COMPLETED',
          redFlagged: false,
          consentGiven: true,
          recommendedProductId: recommended.id,
          // Dataminimalisatie: alleen niet-gevoelige keuzes bewaren (geen rauwe
          // rode-vlag-antwoorden).
          answers: {
            goal: input.goal,
            level: input.level ?? null,
            region: input.region ?? null,
            surgery: input.surgery ?? null,
            daysPerWeek: input.daysPerWeek ?? null,
            location: input.location ?? null,
            duration: input.duration ?? null,
          },
        },
      })

      return { redFlagged: false as const, recommended, alternative, rationale }
    }),

  // ── Preview van de "gekocht schema"-ervaring ───────────────────────────────
  // Admin, of wanneer de shop publiek staat. TODO productie: vervang door een
  // entitlement-check voor de ingelogde ShopCustomer (koper).
  previewProgram: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const allowed = process.env.SHOP_PUBLIC === 'true' || ctx.user?.role === 'ADMIN'
      if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' })

      const product = await ctx.prisma.shopProduct.findUnique({
        where: { slug: input.slug },
        include: {
          program: {
            include: {
              exercises: {
                orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
                include: {
                  exercise: {
                    select: { id: true, name: true, videoUrl: true, mediaType: true, thumbnailUrl: true },
                  },
                },
              },
            },
          },
        },
      })
      if (!product) throw new TRPCError({ code: 'NOT_FOUND' })

      const program = product.program
      const pes = program?.exercises ?? []
      const weekNums = [...new Set(pes.map((p) => p.week))].sort((a, b) => a - b)
      const weeks = weekNums.map((w) => {
        const dayNums = [...new Set(pes.filter((p) => p.week === w).map((p) => p.day))].sort((a, b) => a - b)
        return {
          week: w,
          days: dayNums.map((d) => ({
            day: d,
            items: pes
              .filter((p) => p.week === w && p.day === d)
              .map((p) => ({
                id: p.id,
                name: p.exercise.name,
                videoUrl: p.exercise.videoUrl,
                mediaType: p.exercise.mediaType,
                sets: p.sets,
                setsMax: p.setsMax,
                reps: p.reps,
                repsMax: p.repsMax,
                repUnit: p.repUnit,
                restTime: p.restTime,
              })),
          })),
        }
      })

      return {
        product: { name: product.name, slug: product.slug },
        program: program
          ? { name: program.name, weeks: program.weeks, daysPerWeek: program.daysPerWeek }
          : null,
        weeks,
      }
    }),

  // ── Checkout (Mollie) ──────────────────────────────────────────────────────
  // Maakt een order + Mollie-betaling en geeft de checkout-URL terug. Gast-
  // checkout: koper hoeft (nog) niet in te loggen; we koppelen op e-mail.
  checkout: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(1),
        email: z.string().email(),
        marketingOptIn: z.boolean().default(false),
        shipping: z
          .object({
            address: z.string().min(1),
            postalCode: z.string().min(1),
            city: z.string().min(1),
            country: z.string().default('NL'),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user?.role === 'ADMIN'
      if (!isShopPublic() && !isAdmin) throw new TRPCError({ code: 'FORBIDDEN' })
      if (!isMollieConfigured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Betalen is nog niet geconfigureerd. Probeer het later opnieuw.',
        })
      }

      const product = await ctx.prisma.shopProduct.findUnique({ where: { slug: input.slug } })
      if (!product || (product.status !== 'PUBLISHED' && !isAdmin)) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      if (product.kind === 'SERVICE' && product.bookingUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Deze dienst boek je via de afspraakplanner.' })
      }
      if (product.stockQty !== null && product.stockQty <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dit artikel is uitverkocht.' })
      }
      const needsShipping = product.kind === 'PHYSICAL' && product.requiresShipping
      if (needsShipping && !input.shipping) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vul een verzendadres in.' })
      }

      const shippingCents = 0 // verzendkosten nog niet ingesteld (inbegrepen)
      const amountCents = product.priceCents + shippingCents

      // Koper koppelen op e-mail (gast-checkout, geen account nodig).
      const customer = await ctx.prisma.shopCustomer.upsert({
        where: { email: input.email.toLowerCase() },
        create: {
          email: input.email.toLowerCase(),
          name: input.name,
          marketingOptIn: input.marketingOptIn,
        },
        update: {
          name: input.name,
          ...(input.marketingOptIn ? { marketingOptIn: true } : {}),
        },
      })

      const order = await ctx.prisma.shopOrder.create({
        data: {
          customerId: customer.id,
          email: input.email.toLowerCase(),
          buyerName: input.name,
          status: 'PENDING',
          amountCents,
          shippingCents,
          ...(input.shipping
            ? {
                shippingName: input.name,
                shippingAddress: input.shipping.address,
                shippingPostalCode: input.shipping.postalCode,
                shippingCity: input.shipping.city,
                shippingCountry: input.shipping.country,
              }
            : {}),
          items: {
            create: [
              { productId: product.id, quantity: 1, priceCents: product.priceCents, nameSnapshot: product.name },
            ],
          },
        },
      })

      const appUrl = getAppUrl()
      const isLocal = /localhost|127\.0\.0\.1/.test(appUrl)
      const payment = await createPayment({
        amountCents,
        description: `MBT Gym · ${product.name}`.slice(0, 255),
        redirectUrl: `${appUrl}/shop/bedankt?order=${order.id}`,
        webhookUrl: isLocal ? undefined : `${appUrl}/api/shop/mollie/webhook`,
        metadata: { orderId: order.id },
      })

      await ctx.prisma.shopOrder.update({
        where: { id: order.id },
        data: { molliePaymentId: payment.id },
      })

      const checkoutUrl = payment._links.checkout?.href
      if (!checkoutUrl) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Geen betaal-URL ontvangen van Mollie.' })
      }
      return { checkoutUrl, orderId: order.id }
    }),

  // Status van een order (voor de bedankt-pagina). Synct eerst met Mollie zodat
  // de order ook zonder webhook (bv. lokaal) wordt afgerond. Bewust minimaal:
  // geen e-mail/persoonsgegevens terug, alleen wat de bedankt-pagina nodig heeft.
  orderStatus: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      let status: string
      try {
        status = await syncOrderWithMollie(input.orderId)
      } catch {
        const o = await ctx.prisma.shopOrder.findUnique({
          where: { id: input.orderId },
          select: { status: true },
        })
        if (!o) throw new TRPCError({ code: 'NOT_FOUND' })
        status = o.status
      }
      const order = await ctx.prisma.shopOrder.findUnique({
        where: { id: input.orderId },
        select: { invoiceNumber: true, items: { select: { nameSnapshot: true } } },
      })
      return {
        status,
        invoiceNumber: order?.invoiceNumber ?? null,
        productNames: order?.items.map((i) => i.nameSnapshot) ?? [],
      }
    }),

  // ── Omzet- en verkoop-overzicht ────────────────────────────────────────────
  salesSummary: adminProcedure
    .input(z.object({ granularity: z.enum(['month', 'quarter', 'year']).default('month') }).optional())
    .query(async ({ ctx, input }) => {
      const granularity = input?.granularity ?? 'month'

      const orders = await ctx.prisma.shopOrder.findMany({
        where: { status: 'PAID' },
        include: {
          items: {
            include: {
              product: {
                select: {
                  slug: true,
                  name: true,
                  therapist: { select: { id: true, name: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      })

      const revenueCents = orders.reduce((s, o) => s + o.amountCents, 0)
      const ordersCount = orders.length
      const avgOrderCents = ordersCount ? Math.round(revenueCents / ordersCount) : 0

      const periodKey = (d: Date): string => {
        const y = d.getUTCFullYear()
        if (granularity === 'year') return `${y}`
        if (granularity === 'quarter') return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
        return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      }

      const periodMap = new Map<string, { period: string; revenueCents: number; orders: number }>()
      const productMap = new Map<string, { slug: string; name: string; count: number; revenueCents: number }>()
      const therapistMap = new Map<string, { id: string | null; name: string; count: number; revenueCents: number }>()

      for (const o of orders) {
        const when = o.paidAt ?? o.createdAt
        const pk = periodKey(when)
        const pe = periodMap.get(pk) ?? { period: pk, revenueCents: 0, orders: 0 }
        pe.revenueCents += o.amountCents
        pe.orders += 1
        periodMap.set(pk, pe)

        for (const it of o.items) {
          const prod = productMap.get(it.product.slug) ?? {
            slug: it.product.slug,
            name: it.product.name,
            count: 0,
            revenueCents: 0,
          }
          prod.count += 1
          prod.revenueCents += it.priceCents
          productMap.set(it.product.slug, prod)

          const t = it.product.therapist
          const tid = t?.id ?? 'none'
          const tname = t
            ? t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || 'Therapeut'
            : 'Niet toegewezen'
          const te = therapistMap.get(tid) ?? { id: t?.id ?? null, name: tname, count: 0, revenueCents: 0 }
          te.count += 1
          te.revenueCents += it.priceCents
          therapistMap.set(tid, te)
        }
      }

      return {
        granularity,
        totals: { revenueCents, orders: ordersCount, avgOrderCents },
        byPeriod: [...periodMap.values()].sort((a, b) => a.period.localeCompare(b.period)),
        byProduct: [...productMap.values()].sort((a, b) => b.revenueCents - a.revenueCents),
        byTherapist: [...therapistMap.values()].sort((a, b) => b.revenueCents - a.revenueCents),
      }
    }),

  adminRecentOrders: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(15) }).optional())
    .query(async ({ ctx, input }) => {
      const orders = await ctx.prisma.shopOrder.findMany({
        where: { status: 'PAID' },
        orderBy: { paidAt: 'desc' },
        take: input?.limit ?? 15,
        include: { items: { select: { nameSnapshot: true, priceCents: true } } },
      })
      return orders.map((o) => ({
        id: o.id,
        invoiceNumber: o.invoiceNumber,
        buyerName: o.buyerName,
        email: o.email,
        amountCents: o.amountCents,
        paidAt: o.paidAt,
        productNames: o.items.map((i) => i.nameSnapshot),
      }))
    }),

  // Verstuurt bevestiging + factuur-e-mail voor een bestaande order. Wordt later
  // automatisch aangeroepen door de Mollie-webhook; nu een admin-actie om te testen.
  sendOrderEmails: adminProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.shopOrder.findUnique({
        where: { id: input.orderId },
        include: { items: { select: { nameSnapshot: true, priceCents: true } } },
      })
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' })
      return sendOrderEmailsLib({
        email: order.email,
        buyerName: order.buyerName,
        invoiceNumber: order.invoiceNumber,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
        amountCents: order.amountCents,
        items: order.items,
      })
    }),
})
