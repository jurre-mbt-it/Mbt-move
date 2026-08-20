import { z } from 'zod'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { matchSlug, LABELS, type IntakeAnswers } from '@/lib/shop/intake/flow'
import { sendOrderEmails as sendOrderEmailsLib } from '@/lib/shop/email/order-emails'
import { sendMail, escapeHtml } from '@/server/mail'
import { isShopPublic } from '@/lib/shop/access'
import { SHOP_BRAND } from '@/lib/shop/brand'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
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

      // Een gepubliceerd schema-product zonder gekoppeld schema levert een koper
      // die betaalt maar niets krijgt — server-side blokkeren (de wizard checkt
      // dit ook, maar dit is het vangnet).
      if (data.status === 'PUBLISHED' && data.kind === 'PROGRAM' && !data.programId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Koppel eerst een schema voordat je dit product publiceert.',
        })
      }

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
      // Publiek endpoint dat een betaalde AI-call + DB-write doet: gate op de
      // launch-flag (zoals checkout/previewProgram) en throttle per IP.
      if (!isShopPublic() && ctx.user?.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const ip =
        ctx.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        ctx.req?.headers.get('x-real-ip') ??
        'unknown'
      const rl = await rateLimit('shop.intakeRecommend', ip, RATE_LIMITS.shopIntake)
      if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })

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
            `Je bent de digitale intake van ${SHOP_BRAND.name}, een sportfysiotherapiepraktijk in Amsterdam.`,
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

      // Vangnet: als zowel de AI-keuze als de regel-kandidaat niet (meer) in de
      // catalogus staan, val terug op het eerste gepubliceerde product i.p.v.
      // crashen (products is hierboven al gegarandeerd niet-leeg).
      const recommended =
        products.find((p) => p.slug === recommendedSlug) ??
        products.find((p) => p.slug === candidate) ??
        products[0]
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
      const isAdminCaller = ctx.user?.role === 'ADMIN'
      const allowed = process.env.SHOP_PUBLIC === 'true' || isAdminCaller
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
      // Concepten zijn niet publiek (audit 2026-07-27, M3).
      if (product.status !== 'PUBLISHED' && !isAdminCaller) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }

      const program = product.program
      // Dit is een preview, geen levering: zonder begrenzing gaf deze publieke
      // procedure het complete betaalde programma weg — alle weken, alle sets
      // en reps, plus de video-URL's. Niet-admins krijgen week 1 en geen video.
      const allExercises = program?.exercises ?? []
      const pes = isAdminCaller
        ? allExercises
        : allExercises.filter((p) => p.week <= 1)
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
                // De video's zijn het product. In een publieke preview alleen
                // de naam en het schema, geen speelbare media.
                videoUrl: isAdminCaller ? p.exercise.videoUrl : null,
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
  // Maakt een order + Mollie-betaling en geeft de checkout-URL terug. Kopen kan
  // alleen mét account (protectedProcedure): naam/e-mail komen uit het account,
  // niet uit een formulier. Wie geen account heeft vraagt er een aan via
  // `requestAccess` en wordt door de praktijk uitgenodigd. De ShopCustomer wordt
  // aan de Supabase-gebruiker gekoppeld zodat aankopen (myPurchases) matchen.
  checkout: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
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
      const isAdmin = ctx.user.role === 'ADMIN'
      if (!isShopPublic() && !isAdmin) throw new TRPCError({ code: 'FORBIDDEN' })
      // Elke aanroep maakt een ShopOrder-rij en een Mollie-betaling aan
      // (audit 2026-07-27, L5).
      const rl = await rateLimit('shop.checkout', ctx.user.id, RATE_LIMITS.shopCheckout)
      if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      if (!isMollieConfigured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Betalen is nog niet geconfigureerd. Probeer het later opnieuw.',
        })
      }

      // Identiteit uit het account, niet uit een formulier.
      const account = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { email: true, name: true, firstName: true, lastName: true },
      })
      const email = (account?.email ?? ctx.user.email).toLowerCase()
      const buyerName =
        account?.name ||
        [account?.firstName, account?.lastName].filter(Boolean).join(' ') ||
        email

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
      // Al in bezit (digitaal schema): niet nog een keer laten kopen.
      if (product.kind === 'PROGRAM') {
        const owned = await ctx.prisma.shopEntitlement.findFirst({
          where: { revokedAt: null, productId: product.id, customer: { email } },
          select: { id: true },
        })
        if (owned) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Je hebt dit programma al.' })
        }
      }
      const needsShipping = product.kind === 'PHYSICAL' && product.requiresShipping
      if (needsShipping && !input.shipping) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vul een verzendadres in.' })
      }

      const shippingCents = 0 // verzendkosten nog niet ingesteld (inbegrepen)
      const amountCents = product.priceCents + shippingCents

      // Koper koppelen op e-mail + Supabase-id (account verplicht).
      const customer = await ctx.prisma.shopCustomer.upsert({
        where: { email },
        create: {
          email,
          name: buyerName,
          supabaseUserId: ctx.user.supabaseUserId,
          marketingOptIn: input.marketingOptIn,
        },
        update: {
          name: buyerName,
          supabaseUserId: ctx.user.supabaseUserId,
          ...(input.marketingOptIn ? { marketingOptIn: true } : {}),
        },
      })

      const order = await ctx.prisma.shopOrder.create({
        data: {
          customerId: customer.id,
          email,
          buyerName,
          status: 'PENDING',
          amountCents,
          shippingCents,
          ...(input.shipping
            ? {
                shippingName: buyerName,
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
        // Dit is wat de koper op zijn bankafschrift ziet. De merknaam staat
        // vooraan omdat afschriften afkappen: liever een herkenbare naam die
        // halverwege stopt dan een afkorting die niets zegt.
        description: `${SHOP_BRAND.name} · ${product.name}`.slice(0, 255),
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

  // ── Toegang aanvragen (geen account) ───────────────────────────────────────
  // Kopen kan alleen mét account. Wie er geen heeft laat hier z'n gegevens
  // achter; de praktijk nodigt 'm daarna uit via het reguliere invite-systeem.
  // Publiek + gethrottled; slaat een ShopAccessRequest op en mailt de praktijk.
  requestAccess: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        email: z.string().email(),
        note: z.string().max(1000).optional(),
        productSlug: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user?.role === 'ADMIN'
      if (!isShopPublic() && !isAdmin) throw new TRPCError({ code: 'FORBIDDEN' })

      const ip =
        ctx.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        ctx.req?.headers.get('x-real-ip') ??
        'unknown'
      const rl = await rateLimit('shop.requestAccess', ip, RATE_LIMITS.shopAccessRequest)
      if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })

      const email = input.email.toLowerCase().trim()
      const name = input.name.trim()
      const note = input.note?.trim() || null

      // Al een account? Dan hoeft er niets aangevraagd te worden.
      const existingUser = await ctx.prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true },
      })
      if (existingUser) {
        return { ok: true as const, alreadyHasAccount: true as const }
      }

      // Dubbele open aanvraag samenvoegen i.p.v. stapelen.
      const open = await ctx.prisma.shopAccessRequest.findFirst({
        where: { email, status: 'PENDING' },
        select: { id: true },
      })
      if (open) {
        await ctx.prisma.shopAccessRequest.update({
          where: { id: open.id },
          data: { name, note, productSlug: input.productSlug ?? null },
        })
      } else {
        await ctx.prisma.shopAccessRequest.create({
          data: { name, email, note, productSlug: input.productSlug ?? null },
        })
      }

      // Praktijk op de hoogte brengen (best-effort, nooit hard falen).
      const to = process.env.SHOP_NOTIFY_EMAIL || 'info@movementbasedtherapy.nl'
      try {
        await sendMail({
          to,
          replyTo: email,
          subject: `Nieuwe toegangsaanvraag shop, ${name}`,
          // Alle velden hier zijn door een ongeauthenticeerde aanvrager
          // ingevuld. Consequent escapen, niet alleen `<` in `note`
          // (audit 2026-07-27).
          html: [
            `<p><strong>${escapeHtml(name)}</strong> vraagt toegang tot de shop van ${SHOP_BRAND.name}.</p>`,
            `<p>E-mail: <a href="mailto:${encodeURIComponent(email)}">${escapeHtml(email)}</a></p>`,
            input.productSlug ? `<p>Interesse in: ${escapeHtml(input.productSlug)}</p>` : '',
            note ? `<p>Bericht:<br>${escapeHtml(note)}</p>` : '',
            `<p>Nodig deze persoon uit via het uitnodigingsscherm om ze te laten kopen.</p>`,
          ].join('\n'),
          text: `${name} (${email}) vraagt toegang tot de shop.${note ? `\n\nBericht: ${note}` : ''}`,
        })
      } catch {
        // Mail-fout mag de aanvraag niet blokkeren; de rij staat er al.
      }

      return { ok: true as const, alreadyHasAccount: false as const }
    }),

  // Status van een order (voor de bedankt-pagina). Synct eerst met Mollie zodat
  // de order ook zonder webhook (bv. lokaal) wordt afgerond. Bewust minimaal:
  // geen e-mail/persoonsgegevens terug, alleen wat de bedankt-pagina nodig heeft.
  orderStatus: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Publiek (gast-checkout): de cuid orderId is de capability. Rate-limit
      // per IP tegen enumeratie + ongeauthenticeerde Mollie-amplificatie.
      const ip =
        ctx.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        ctx.req?.headers.get('x-real-ip') ??
        'unknown'
      const rl = await rateLimit('shop.orderStatus', ip, RATE_LIMITS.shopOrderStatus)
      if (!rl.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }
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

  // ── App-koppeling: aankopen activeren als toegewezen programma ─────────────
  // Brug tussen shop (gast-checkout op e-mail) en app-wereld (User): aankopen
  // worden gematcht op e-mailadres. Bij activatie wordt het gekochte
  // Program-template gekopieerd naar een eigen, toegewezen Program
  // (patientId = koper) met een zelfgekozen startmoment. Daarna verschijnt het
  // vanzelf in web én iOS via de bestaande patient-endpoints
  // (`patient.getActiveProgram[s]`) — geen aparte shop-weergave nodig.

  /** Gekochte schema-producten van de ingelogde app-gebruiker (match op e-mail). */
  myPurchases: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.user.email?.toLowerCase()
    if (!email) return []
    const entitlements = await ctx.prisma.shopEntitlement.findMany({
      where: {
        revokedAt: null,
        customer: { email },
        product: { kind: 'PROGRAM', programId: { not: null } },
      },
      orderBy: { grantedAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            tagline: true,
            heroImageUrl: true,
            level: true,
            durationWeeks: true,
            program: { select: { id: true, weeks: true, daysPerWeek: true } },
          },
        },
        // De geactiveerde kopie (als die er is), om de status te tonen.
        program: { select: { id: true, status: true, startDate: true } },
      },
    })
    return entitlements.map((e) => ({
      entitlementId: e.id,
      grantedAt: e.grantedAt,
      product: {
        slug: e.product.slug,
        name: e.product.name,
        tagline: e.product.tagline,
        heroImageUrl: e.product.heroImageUrl,
        level: e.product.level,
        durationWeeks: e.product.durationWeeks,
      },
      template: e.product.program
        ? { weeks: e.product.program.weeks, daysPerWeek: e.product.program.daysPerWeek }
        : null,
      activated: e.program
        ? { programId: e.program.id, status: e.program.status, startDate: e.program.startDate }
        : null,
    }))
  }),

  /**
   * Zet een gekochte aankoop om in een eigen actief programma. De koper kiest
   * het startmoment: `startDate` (ISO-datum, default vandaag) en/of
   * `startWeek` (begin midden in het schema; de startdatum schuift dan terug
   * zodat de weekberekening op die week uitkomt). Idempotent: al geactiveerd →
   * bestaande kopie terug.
   */
  activateProgram: protectedProcedure
    .input(
      z.object({
        entitlementId: z.string(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gebruik JJJJ-MM-DD').optional(),
        startWeek: z.number().int().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = ctx.user.email?.toLowerCase()
      const entitlement = await ctx.prisma.shopEntitlement.findUnique({
        where: { id: input.entitlementId },
        include: {
          customer: { select: { email: true } },
          program: { select: { id: true } },
          product: {
            include: {
              program: { include: { exercises: true, resources: true } },
            },
          },
        },
      })
      if (!entitlement || !email || entitlement.customer.email !== email) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      if (entitlement.revokedAt) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Deze aankoop is niet meer geldig.' })
      }
      // Al geactiveerd en de kopie bestaat nog → die teruggeven.
      if (entitlement.program) {
        return { programId: entitlement.program.id, alreadyActive: true as const }
      }
      const source = entitlement.product.program
      if (!source) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Aan dit product is (nog) geen schema gekoppeld. Neem contact met ons op.',
        })
      }
      if (input.startWeek && input.startWeek > source.weeks) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Dit schema heeft ${source.weeks} weken; kies een startweek binnen het schema.`,
        })
      }

      // Startmoment: gekozen datum (of vandaag), en bij een latere startweek
      // schuift de startdatum terug zodat de weekklok (startDate-gebaseerd,
      // zie computeCurrentWeekDay) op die week uitkomt.
      const base = input.startDate ? new Date(`${input.startDate}T00:00:00`) : new Date()
      if (Number.isNaN(base.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ongeldige startdatum.' })
      }
      const startDate = new Date(base.getTime() - ((input.startWeek ?? 1) - 1) * 7 * 86_400_000)

      const programId = crypto.randomUUID()
      await ctx.prisma.$transaction([
        ctx.prisma.program.create({
          data: {
            id: programId,
            // Consumentgerichte naam van het product, niet de interne templatenaam.
            name: entitlement.product.name,
            description: source.description ?? undefined,
            weeks: source.weeks,
            daysPerWeek: source.daysPerWeek,
            isTemplate: false,
            type: source.type,
            cardioParams: (source.cardioParams ?? null) as never,
            flexibleSchedule: source.flexibleSchedule,
            weeklyTarget: source.weeklyTarget,
            reviewAfterWeeks: source.reviewAfterWeeks,
            tendinopathyMode: source.tendinopathyMode,
            trackOneRepMax: source.trackOneRepMax,
            dailyTarget: source.dailyTarget,
            patientId: ctx.user.id,
            // Maker blijft de template-eigenaar (therapeut/admin), zodat het
            // programma in de praktijk-wereld beheerd kan blijven worden.
            creatorId: source.creatorId,
            practiceId: source.practiceId ?? null,
            status: 'ACTIVE',
            startDate,
            exercises: {
              create: source.exercises.map((ex) => ({
                id: crypto.randomUUID(),
                exerciseId: ex.exerciseId,
                week: ex.week,
                day: ex.day,
                order: ex.order,
                sets: ex.sets,
                setsMax: ex.setsMax,
                reps: ex.reps,
                repsMax: ex.repsMax,
                repUnit: ex.repUnit,
                restTime: ex.restTime,
                supersetGroup: ex.supersetGroup,
                supersetOrder: ex.supersetOrder,
                notes: ex.notes,
                intensityType: ex.intensityType,
                intensityMin: ex.intensityMin,
                intensityMax: ex.intensityMax,
                intensityText: ex.intensityText,
                extraParams: ex.extraParams ?? undefined,
              })),
            },
            resources: {
              create: source.resources.map((r) => ({
                id: crypto.randomUUID(),
                resourceId: r.resourceId,
                week: r.week,
                day: r.day,
                order: r.order,
              })),
            },
          },
        }),
        ctx.prisma.shopEntitlement.update({
          where: { id: entitlement.id },
          data: { programId, activatedAt: new Date() },
        }),
      ])

      return { programId, alreadyActive: false as const }
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

  // ── Toegangsaanvragen beheren (admin) ──────────────────────────────────────
  /** Open (en recent afgehandelde) toegangsaanvragen voor het admin-overzicht. */
  adminAccessRequests: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.shopAccessRequest.findMany({
      where: { status: { in: ['PENDING', 'INVITED'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    })
  }),

  /** Zet een aanvraag op INVITED (uitgenodigd) of DISMISSED (afgewezen). */
  adminResolveAccessRequest: adminProcedure
    .input(z.object({ id: z.string(), status: z.enum(['INVITED', 'DISMISSED', 'PENDING']) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.shopAccessRequest.update({
        where: { id: input.id },
        data: {
          status: input.status,
          handledAt: input.status === 'PENDING' ? null : new Date(),
        },
      })
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
