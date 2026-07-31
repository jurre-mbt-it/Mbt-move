/**
 * Invite-code router — Physitrack-achtige onboarding.
 *
 * Flow:
 *   1. Therapeut: `invite.create({ email, name, dateOfBirth, role })`
 *      → slaat een `InviteCode` record op (whitelist-entry, 24u TTL).
 *      → geen eigen code — Supabase verstuurt de 6-digit OTP via z'n eigen
 *        mail-infrastructuur (template: "Your login code is ...").
 *   2. Patient opent `/login/code`, stap 1:
 *      → `invite.request({ email, birthYear })`
 *      → server checkt dat er een geldige InviteCode bestaat met die
 *        email + birthYear (anders: generieke fout, geen user-enumeratie).
 *      → server maakt de Supabase auth-user aan via de admin-API en vraagt
 *        daarna de code aan met `signInWithOtp({ shouldCreateUser: false })`.
 *        Sinds 2026-07-27 staat projectbrede signup uit, en `/auth/v1/otp`
 *        respecteert dat ook met de service_role-key. Zie de toelichting bij
 *        de aanroep zelf.
 *      → patient ontvangt mail met 6-digit code.
 *   3. Stap 2 (client-side):
 *      → `supabase.auth.verifyOtp({ email, token, type: 'email' })` — sessie komt in cookies.
 *   4. Stap 3 (na verify):
 *      → `invite.finalize()` — markeer InviteCode als gebruikt, maak Prisma user
 *        + PatientTherapist-relatie, schrijf audit-log.
 *
 * Security-eigenschappen:
 *   - Geboortejaar is de identity-proof (alleen echte patiënt kent eigen DOB).
 *   - Supabase rate-limit op OTP-generatie (~4/uur/email standaard).
 *   - Onze eigen rate-limit: 20 invites/uur/therapeut, 5 request-pogingen/15min/email.
 *   - Max 5 redeem-pogingen voor een code, daarna geblokkeerd.
 *   - Alle happy + sad paths audit-gelogd.
 */
import { z } from 'zod'
import crypto from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import {
  createTRPCRouter,
  therapistProcedure,
  coachStaffProcedure,
  mfaCoachStaffProcedure,
  mfaTherapistProcedure,
  publicProcedure,
  protectedProcedure,
} from '@/server/trpc'
import { practiceScope } from '@/server/lib/patient-access'
import { hefUitbehandeldOp } from '@/server/lib/care-reactivate'
import { auditLog } from '@/server/audit'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { inviteMail, sendMail } from '@/server/mail'
import { getAppUrl } from '@/lib/app-url'

const CODE_TTL_HOURS = 24
const MAX_REDEEM_ATTEMPTS = 5
const PENDING_INVITE_NOTE = 'Aangemaakt via invite, wacht op acceptatie'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseJsClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export const inviteRouter = createTRPCRouter({
  /**
   * Therapeut nodigt een patiënt uit met e-mail + naam + geboortedatum.
   * De InviteCode dient als whitelist + identity-factor voor `/login/code`.
   */
  create: mfaCoachStaffProcedure
    .input(
      z.object({
        email: z.string().email('Ongeldig e-mailadres'),
        name: z.string().min(2, 'Naam is verplicht'),
        dateOfBirth: z.string().refine(
          (v) => !Number.isNaN(Date.parse(v)),
          'Ongeldige geboortedatum',
        ),
        role: z.enum(['PATIENT', 'ATHLETE', 'COACH']).default('PATIENT'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Wie mag wie uitnodigen. Server-side afgedwongen, niet alleen in de UI:
      //  - COACH nodigt uitsluitend atleten uit (geen patiënten: dat is
      //    praktijk-zorg, en geen coaches: dat is accountbeheer).
      //  - Een coach-account aanmaken mag alleen de admin.
      if (ctx.user!.role === 'COACH' && input.role !== 'ATHLETE') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Als coach kun je alleen atleten uitnodigen.',
        })
      }
      if (input.role === 'COACH' && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Alleen een beheerder kan een coach-account aanmaken.',
        })
      }
      const rl = await rateLimit('invite.create', ctx.user!.id, RATE_LIMITS.inviteCreate)
      if (!rl.ok) {
        await auditLog({
          event: 'RATE_LIMIT_HIT',
          userId: ctx.user!.id,
          actorEmail: ctx.user!.email,
          resource: 'InviteCode',
          metadata: { bucket: 'invite.create' },
          req: ctx.req,
        })
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }

      const email = input.email.toLowerCase().trim()
      const dob = new Date(input.dateOfBirth)
      const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 3600 * 1000)

      // SECURITY: weiger invites voor e-mails die al door een THERAPIST/ADMIN
      // worden gebruikt — anders kan een malafide therapeut hun rol later
      // platwalsen via finalize.
      const existingForEmail = await ctx.prisma.user.findUnique({
        where: { email },
        select: { role: true },
      })
      if (
        existingForEmail &&
        (existingForEmail.role === 'THERAPIST' ||
          existingForEmail.role === 'ADMIN' ||
          existingForEmail.role === 'COACH')
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Dit e-mailadres is al in gebruik door een ander account.',
        })
      }

      // Voorkom meerdere actieve invites voor dezelfde e-mail
      await ctx.prisma.inviteCode.updateMany({
        where: {
          email,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { expiresAt: new Date(0) }, // verloopt oude invites
      })

      const invite = await ctx.prisma.inviteCode.create({
        data: {
          // codeHash is uniek per invite — redundant bij Supabase-OTP flow,
          // maar bewaart de mogelijkheid om later naar eigen codes over te
          // stappen zonder schema-wijziging.
          codeHash: `supabase-otp:${crypto.randomBytes(16).toString('hex')}`,
          email,
          name: input.name.trim(),
          dateOfBirth: dob,
          role: input.role,
          practiceId: ctx.user!.practiceId,
          invitedById: ctx.user!.id,
          expiresAt,
        },
      })

      // Pre-create Prisma User + PatientTherapist (status=PENDING) zodat de
      // therapeut al sessies kan loggen vóór de patiënt de invite accepteert.
      // Bij `invite.finalize` wordt de User gekoppeld aan Supabase-auth via
      // email-match en wordt PatientTherapist opgehoogd naar APPROVED.
      //
      // SECURITY: Als er al een Prisma User bestaat met dit email-adres, dan
      // mag de invite GEEN nieuwe PatientTherapist relatie aanmaken zonder
      // bewijs dat de patient daadwerkelijk wil koppelen. Anders kan een
      // malafide therapeut willekeurige bestaande patiënten "uitnodigen" en
      // direct PHI lezen via PENDING-toegang. We laten de invite-row staan
      // (zodat de patient via OTP kan accepteren), maar de PatientTherapist
      // wordt pas in `invite.finalize` aangemaakt na patient-redeem.
      // patientUserId wordt teruggegeven aan de UI zodat je direct na de
      // invite door kunt klikken naar "maak programma voor deze patiënt".
      // Alleen gevuld in scenario's waarin we al een Prisma User + actieve
      // therapist-koppeling hebben (= veilig om programma's voor te maken).
      let patientUserId: string | null = null

      if (input.role === 'COACH') {
        const existingCoach = await ctx.prisma.user.findUnique({ where: { email } })
        if (!existingCoach) {
          // practiceId blijft bewust null: een coach hoort nooit bij een praktijk.
          await ctx.prisma.user.create({
            data: { email, name: input.name.trim(), role: 'COACH', dateOfBirth: dob, practiceId: null },
          })
        }
      } else if (input.role === 'PATIENT' || input.role === 'ATHLETE') {
        const existingUser = await ctx.prisma.user.findUnique({ where: { email } })
        if (existingUser) {
          // Bestaande user: alleen pre-link aanmaken als deze user al aan
          // ons (deze therapist) gekoppeld is. Anders moet de patient via
          // OTP redeem expliciet akkoord geven (PatientTherapist wordt dan
          // door invite.finalize aangemaakt).
          const existingLinkSelf = await ctx.prisma.patientTherapist.findUnique({
            where: {
              therapistId_patientId: {
                therapistId: ctx.user!.id,
                patientId: existingUser.id,
              },
            },
          })
          if (existingLinkSelf) {
            // Bestaande koppeling blijft staan — geen overwrite, maar wel
            // doorgeven dat we direct programma's voor 'm kunnen maken.
            patientUserId = existingUser.id
          }
          // (Geen `else { upsert }` meer — dat was het lek.)
        } else {
          // Nieuwe user — geen risico op cross-tenant: maak Prisma User
          // én pre-link aan zoals voorheen.
          const patientUser = await ctx.prisma.user.create({
            data: {
              email,
              name: input.name.trim(),
              role: input.role,
              dateOfBirth: dob,
              practiceId: ctx.user!.practiceId,
            },
          })
          await ctx.prisma.patientTherapist.create({
            data: {
              therapistId: ctx.user!.id,
              patientId: patientUser.id,
              status: 'PENDING',
              isActive: true,
              requestedAt: new Date(),
              notes: PENDING_INVITE_NOTE,
            },
          })
          patientUserId = patientUser.id
        }
      }

      // Stuur een branded invite-mail via Resend (als geconfigureerd). Bevat
      // de URL naar /login/code. De 6-cijfer code zelf komt later via
      // Supabase's OTP-mail wanneer de patiënt op de URL "Stuur code" klikt.
      const instructionUrl = `${getAppUrl()}/login/code?email=${encodeURIComponent(email)}`

      const mail = inviteMail({
        recipientName: input.name.trim(),
        codeUrl: instructionUrl,
        therapistName: ctx.user!.email.split('@')[0],
        expiresAt: invite.expiresAt,
      })
      mail.to = email
      const mailResult = await sendMail(mail)

      await auditLog({
        event: 'INVITE_CREATED',
        userId: ctx.user!.id,
        actorEmail: ctx.user!.email,
        resource: 'InviteCode',
        resourceId: invite.id,
        metadata: {
          email,
          role: input.role,
          mailProvider: mailResult.provider,
          mailSent: mailResult.ok,
        },
        req: ctx.req,
      })

      return {
        id: invite.id,
        email,
        expiresAt: invite.expiresAt,
        instructionUrl,
        mailDelivered: mailResult.ok,
        mailProvider: mailResult.provider,
        patientUserId,
      }
    }),

  /**
   * Verstuur de invite-mail opnieuw voor een patiënt die de invite nog niet
   * heeft geaccepteerd. Verlengt de TTL en gebruikt de bekende DOB van de
   * patiënt (geen extra invoer nodig).
   */
  resend: mfaTherapistProcedure
    .input(z.object({ patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('invite.create', ctx.user!.id, RATE_LIMITS.inviteCreate)
      if (!rl.ok) {
        await auditLog({
          event: 'RATE_LIMIT_HIT',
          userId: ctx.user!.id,
          actorEmail: ctx.user!.email,
          resource: 'InviteCode',
          metadata: { bucket: 'invite.create' },
          req: ctx.req,
        })
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }

      // Toegang = directe PatientTherapist-koppeling OF dezelfde praktijk
      // (consistent met patients.get/list).
      const me = ctx.user!
      const patient = await ctx.prisma.user.findFirst({
        where: {
          id: input.patientId,
          role: { in: ['PATIENT', 'ATHLETE'] },
          OR: [
            {
              patientTherapists: {
                some: {
                  therapistId: me.id,
                  isActive: true,
                  status: { in: ['APPROVED', 'PENDING'] },
                },
              },
            },
            ...practiceScope(me),
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          dateOfBirth: true,
          practiceId: true,
        },
      })
      if (!patient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Patiënt niet gevonden of geen toegang.',
        })
      }
      if (!patient.dateOfBirth) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Patiënt heeft geen geboortedatum, vul die eerst in voordat je opnieuw uitnodigt.',
        })
      }

      const email = patient.email.toLowerCase().trim()
      const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 3600 * 1000)

      await ctx.prisma.inviteCode.updateMany({
        where: { email, usedAt: null, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date(0) },
      })

      const invite = await ctx.prisma.inviteCode.create({
        data: {
          codeHash: `supabase-otp:${crypto.randomBytes(16).toString('hex')}`,
          email,
          name: patient.name ?? email,
          dateOfBirth: patient.dateOfBirth,
          role: patient.role === 'ATHLETE' ? 'ATHLETE' : 'PATIENT',
          practiceId: patient.practiceId ?? ctx.user!.practiceId,
          invitedById: ctx.user!.id,
          expiresAt,
        },
      })

      // Opnieuw uitnodigen betekent weer in behandeling. Zonder dit krijg je
      // een patiënt met een levende koppeling die in geen enkele lijst
      // verschijnt, zonder foutmelding.
      await hefUitbehandeldOp(ctx.prisma, ctx.user!, patient.id)

      const instructionUrl = `${getAppUrl()}/login/code?email=${encodeURIComponent(email)}`

      const mail = inviteMail({
        recipientName: patient.name ?? email,
        codeUrl: instructionUrl,
        therapistName: ctx.user!.email.split('@')[0],
        expiresAt: invite.expiresAt,
      })
      mail.to = email
      const mailResult = await sendMail(mail)

      await auditLog({
        event: 'INVITE_CREATED',
        userId: ctx.user!.id,
        actorEmail: ctx.user!.email,
        resource: 'InviteCode',
        resourceId: invite.id,
        metadata: {
          email,
          role: patient.role,
          mailProvider: mailResult.provider,
          mailSent: mailResult.ok,
          resend: true,
        },
        req: ctx.req,
      })

      return {
        id: invite.id,
        email,
        expiresAt: invite.expiresAt,
        instructionUrl,
        mailDelivered: mailResult.ok,
        mailProvider: mailResult.provider,
        mailError: mailResult.ok ? null : mailResult.error ?? 'Onbekende fout',
      }
    }),

  /**
   * Therapeut lijst alle invites die hij heeft gestuurd.
   */
  listMine: coachStaffProcedure.query(async ({ ctx }) => {
    return ctx.prisma.inviteCode.findMany({
      where: { invitedById: ctx.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        dateOfBirth: true,
        expiresAt: true,
        usedAt: true,
        usedByUserId: true,
        attempts: true,
        createdAt: true,
      },
    })
  }),

  /**
   * Therapeut trekt een nog niet gebruikte invite in.
   */
  revoke: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.inviteCode.findUnique({
        where: { id: input.id },
      })
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND' })
      if (invite.invitedById !== ctx.user!.id && ctx.user!.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      if (invite.usedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite is al gebruikt' })
      }
      await ctx.prisma.inviteCode.update({
        where: { id: input.id },
        data: { expiresAt: new Date(0) },
      })
      return { ok: true }
    }),

  /**
   * Stap 1 van patient-onboarding: email + geboortejaar check.
   * Bij match: we triggeren Supabase OTP (6-digit code komt in patient-mail).
   * Bij mismatch: generieke fout (geen enumeratie).
   */
  request: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim()

      // Twee buckets. De e-mail-bucket remt geboortejaar-raden op één adres;
      // die alleen is niet genoeg, want de aanvaller kiest het adres zelf en
      // kan door te varieren ongelimiteerd audit_logs-rijen laten schrijven
      // vanaf een onauthenticated endpoint (audit 2026-07-27, L4).
      const ip =
        ctx.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      const ipLimit = await rateLimit('invite.requestIp', ip, RATE_LIMITS.inviteRequestIp)
      if (!ipLimit.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: ipLimit.message })
      }

      const rl = await rateLimit('invite.request', email, RATE_LIMITS.inviteRedeem)
      if (!rl.ok) {
        await auditLog({
          event: 'RATE_LIMIT_HIT',
          actorEmail: email,
          resource: 'InviteCode',
          metadata: { bucket: 'invite.request' },
          req: ctx.req,
        })
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      }

      const invite = await ctx.prisma.inviteCode.findFirst({
        where: {
          email,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Registreer poging atomair via updateMany. Audit M3: voorkomt dubbele
      // OTP-mails bij concurrent calls (dubbel-klik, retry-race). De WHERE
      // bevat een debounce-window van OTP_DEBOUNCE_MS — een tweede call
      // binnen dat window wint geen rij, en wij keren ok=throttled terug
      // zonder Supabase opnieuw te triggeren.
      const OTP_DEBOUNCE_MS = 3_000
      let throttled = false
      if (invite) {
        const debounceCutoff = new Date(Date.now() - OTP_DEBOUNCE_MS)
        const updated = await ctx.prisma.inviteCode.updateMany({
          where: {
            id: invite.id,
            OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: debounceCutoff } }],
          },
          data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
        })
        if (updated.count === 0) {
          // Vorige OTP is binnen 3s verstuurd. UI ziet visueel hetzelfde
          // resultaat als een succesvolle verzending; échte fouten (geen
          // invite, max attempts, year-mismatch) gaan hieronder nog
          // door alle reguliere paden.
          throttled = true
        }
      }

      function throwGeneric(reason: 'no-invite' | 'year-mismatch'): never {
        void auditLog({
          event: 'INVITE_FAILED',
          actorEmail: email,
          resource: 'InviteCode',
          resourceId: invite?.id,
          metadata: { reason },
          req: ctx.req,
        })
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message:
            'We kunnen geen actieve uitnodiging vinden. Klopt je e-mail en geboortejaar? ' +
            'Heb je al eerder ingelogd? Dan log je in met alleen je e-mail via "Al een account?" hieronder.',
        })
      }

      if (!invite) throwGeneric('no-invite')

      if (invite.attempts >= MAX_REDEEM_ATTEMPTS) {
        await auditLog({
          event: 'INVITE_FAILED',
          actorEmail: email,
          resource: 'InviteCode',
          resourceId: invite.id,
          metadata: { reason: 'max-attempts' },
          req: ctx.req,
        })
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Te veel pogingen. Neem contact op met je therapeut voor een nieuwe invite.',
        })
      }

      const expectedYear = invite.dateOfBirth.getUTCFullYear()
      if (expectedYear !== input.birthYear) throwGeneric('year-mismatch')

      // Match! Trigger Supabase OTP-mail — tenzij we binnen debounce-window
      // zitten (zojuist al verstuurd), dan respecteren we de eerdere send.
      if (throttled) {
        return { ok: true, delivered: true, throttled: true }
      }

      const admin = getSupabaseAdmin()
      if (!admin) {
        // Supabase niet geconfigureerd — dev-mode
        return { ok: true, delivered: false, devNote: 'Supabase niet geconfigureerd' }
      }

      // Signup staat projectbreed uit sinds 2026-07-27 (audit C1: anders kan
      // iedereen zich met een zelfgekozen rol registreren). `/auth/v1/otp` is
      // geen admin-endpoint en respecteert `disable_signup` ook met de
      // service_role-key, dus `shouldCreateUser: true` loopt daar nu op stuk.
      //
      // Daarom in twee stappen: de auth-user expliciet aanmaken via de
      // admin-API (die negeert disable_signup wel), en daarna alleen nog de
      // code versturen. De uitnodiging is op dit punt al gevalideerd op e-mail
      // + geboortejaar, dus dit maakt geen account aan voor wie dat niet al
      // mocht.
      //
      // `email_confirm: true` is nodig, niet cosmetisch: GoTrue routeert een
      // OTP naar een ONbevestigde user alsnog door de signup-tak en geeft dan
      // "Signups not allowed for this instance" (422), ook met
      // shouldCreateUser: false. Empirisch vastgesteld op 2026-07-27.
      // Veiligheidsafweging: het adres is hier al gekoppeld aan een door een
      // therapeut aangemaakte InviteCode én aan het juiste geboortejaar, en de
      // code moet uit die mailbox worden overgetypt. Dat is het bewijs van
      // adresbezit; GoTrue's eigen confirm-mail voegt daar niets aan toe.
      //
      // De rol staat bewust NIET in de metadata. `handle_new_user()` leest hem
      // sinds dezelfde audit uit `invite_codes`, en meesturen zou de indruk
      // wekken dat de client hem nog bepaalt.
      const createRes = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name: invite.name,
          practiceId: invite.practiceId,
          inviteId: invite.id,
        },
      })
      if (createRes.error) {
        const msg = createRes.error.message ?? ''
        const alreadyExists = /already|exists|registered|duplicate/i.test(msg)
        if (!alreadyExists) {
          // Geen error.message loggen — die bevat vaak het patient-emailadres.
          console.warn('[invite.request] supabase createUser error', {
            status: (createRes.error as { status?: number }).status ?? null,
          })
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Kon op dit moment geen code versturen. Probeer het straks opnieuw.',
          })
        }
        // Bestaat al (her-verzending, of de patiënt had al een account) — door.
      }

      const { error } = await admin.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (error) {
        // Geen error.message loggen — Supabase OTP-fouten bevatten vaak het
        // patient-emailadres (PHI). Alleen status/category bewaren.
        console.warn('[invite.request] supabase otp error', {
          status: (error as { status?: number }).status ?? null,
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Kon op dit moment geen code versturen. Probeer het straks opnieuw.',
        })
      }

      // Geslaagde send (e-mail + geboortejaar klopten) → teller terug naar 0.
      // `attempts` telt élke request-poging, ook legitieme her-verzendingen
      // (mail in spam, code verlopen). Zonder reset zat een echte patiënt na
      // 5 keer "stuur mij een code" permanent vast op max-attempts, terwijl de
      // teller bedoeld is tegen geboortejaar-raden — dat pad blijft gewoon
      // optellen, want daar komt de flow nooit tot hier.
      await ctx.prisma.inviteCode.update({
        where: { id: invite.id },
        data: { attempts: 0 },
      })

      return { ok: true, delivered: true }
    }),

  /**
   * Stap 3 (na `supabase.auth.verifyOtp` client-side): finaliseer de invite.
   * De user is nu ingelogd (sessie in cookies), dus we kunnen via `ctx.user`
   * matchen op e-mail.
   */
  finalize: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.user!.email.toLowerCase()

    // Self-heal: voor patiënten die al eerder finalize hebben doorlopen toen
    // de "wacht op acceptatie"-note nog niet werd gewist. Draaien we ongeacht
    // of er nog een actieve invite is — kost één UPDATE en voorkomt dat
    // therapeuten nog stale onboarding-notes zien voor reeds geaccepteerde
    // patiënten.
    await ctx.prisma.patientTherapist.updateMany({
      where: {
        patient: { email },
        status: 'APPROVED',
        notes: PENDING_INVITE_NOTE,
      },
      data: { notes: null },
    })

    const invite = await ctx.prisma.inviteCode.findFirst({
      where: {
        email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!invite) {
      // Geen actieve invite meer — misschien al eerder gefinaliseerd. Idempotent success.
      return { ok: true, alreadyFinalized: true }
    }

    // SECURITY: Bestaande user-rows NIET overschrijven. Anders kan een
    // openstaande PATIENT-invite voor een email die later door een andere
    // user (bv THERAPIST) geclaimed is, hun rol/practice/dob platwalsen
    // zodra zij toevallig deze flow doorlopen. Alleen create-if-missing.
    const existingUser = await ctx.prisma.user.findUnique({ where: { email } })
    let user
    if (existingUser) {
      // Voor THERAPIST/ADMIN: weiger silently — invite was niet voor hen.
      //
      // COACH ligt subtieler: `invite.create` maakt de coach-row zelf al aan
      // (nog zonder supabaseUserId), dus die row hoort hier juist gebonden te
      // worden. Alleen dát geval mag door; een coach-account dat al een
      // binding heeft, of een invite met een andere rol, wordt geweigerd —
      // anders kan een openstaande atleet-invite een coach-account kapen.
      const isCoachRedeemingOwnInvite =
        existingUser.role === 'COACH' && invite.role === 'COACH' && !existingUser.supabaseUserId
      if (
        existingUser.role === 'THERAPIST' ||
        existingUser.role === 'ADMIN' ||
        (existingUser.role === 'COACH' && !isCoachRedeemingOwnInvite)
      ) {
        return { ok: true, alreadyFinalized: true, skipped: 'role-mismatch' as const }
      }
      // Backfill supabaseUserId als de bestaande row nog geen binding had.
      if (!existingUser.supabaseUserId) {
        try {
          await ctx.prisma.user.update({
            where: { id: existingUser.id },
            data: { supabaseUserId: ctx.user!.supabaseUserId },
          })
        } catch { /* unique constraint — laat staan */ }
      }
      user = existingUser
    } else {
      user = await ctx.prisma.user.create({
        data: {
          email,
          supabaseUserId: ctx.user!.supabaseUserId,
          name: invite.name,
          role: invite.role,
          practiceId: invite.practiceId,
          dateOfBirth: invite.dateOfBirth,
        },
      })
    }

    await ctx.prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedByUserId: user.id },
    })

    if (invite.role === 'PATIENT' || invite.role === 'ATHLETE') {
      // Weer in behandeling bij de therapeut die uitnodigde. Hier is er geen
      // ingelogde therapeut in de context. `ctx.user` is de patiënt zelf en die
      // heeft geen scope, dus komt de scope uit de uitnodiger op de
      // InviteCode-rij. Is die niet te bepalen, dan blijft de markering staan
      // en loggen we dat: liever een patiënt die na een handmatige
      // heractivering terugkomt dan blind elke markering opheffen.
      const uitnodiger = await ctx.prisma.user.findUnique({
        where: { id: invite.invitedById },
        select: { id: true, role: true, practiceId: true },
      })
      const opheffen = uitnodiger
        ? await hefUitbehandeldOp(ctx.prisma, uitnodiger, user.id)
        : ({ status: 'geen-scope' } as const)
      if (opheffen.status === 'geen-scope') {
        console.warn(
          'invite.finalize: uitbehandel-markering blijft staan, geen scope voor uitnodiger',
          { inviteId: invite.id, invitedById: invite.invitedById },
        )
      }

      const existingLink = await ctx.prisma.patientTherapist.findUnique({
        where: {
          therapistId_patientId: {
            therapistId: invite.invitedById,
            patientId: user.id,
          },
        },
        select: { id: true, notes: true },
      })
      if (existingLink) {
        await ctx.prisma.patientTherapist.update({
          where: { id: existingLink.id },
          data: {
            isActive: true,
            status: 'APPROVED',
            // Wis de placeholder-note alleen als die nog ongewijzigd is —
            // anders blijft een handmatig toegevoegde note van de therapeut
            // staan.
            ...(existingLink.notes === PENDING_INVITE_NOTE ? { notes: null } : {}),
          },
        })
      } else {
        await ctx.prisma.patientTherapist.create({
          data: {
            therapistId: invite.invitedById,
            patientId: user.id,
            status: 'APPROVED',
          },
        })
      }
    }

    await auditLog({
      event: 'INVITE_REDEEMED',
      userId: user.id,
      actorEmail: email,
      resource: 'InviteCode',
      resourceId: invite.id,
      req: ctx.req,
    })

    return { ok: true, alreadyFinalized: false }
  }),
})

