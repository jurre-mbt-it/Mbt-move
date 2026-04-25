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
 *      → server triggert Supabase `signInWithOtp` met `shouldCreateUser: true`.
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
  mfaTherapistProcedure,
  publicProcedure,
  protectedProcedure,
} from '@/server/trpc'
import { auditLog } from '@/server/audit'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { inviteMail, sendMail } from '@/server/mail'

const CODE_TTL_HOURS = 24
const MAX_REDEEM_ATTEMPTS = 5

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
  create: mfaTherapistProcedure
    .input(
      z.object({
        email: z.string().email('Ongeldig e-mailadres'),
        name: z.string().min(2, 'Naam is verplicht'),
        dateOfBirth: z.string().refine(
          (v) => !Number.isNaN(Date.parse(v)),
          'Ongeldige geboortedatum',
        ),
        role: z.enum(['PATIENT', 'ATHLETE']).default('PATIENT'),
      }),
    )
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
      if (existingForEmail && (existingForEmail.role === 'THERAPIST' || existingForEmail.role === 'ADMIN')) {
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
      if ((input.role === 'PATIENT' || input.role === 'ATHLETE')) {
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
            // Niets doen — bestaande link blijft staan. Geen overwrite.
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
              notes: `Aangemaakt via invite — wacht op acceptatie`,
            },
          })
        }
      }

      // Stuur een branded invite-mail via Resend (als geconfigureerd). Bevat
      // de URL naar /login/code. De 6-cijfer code zelf komt later via
      // Supabase's OTP-mail wanneer de patiënt op de URL "Stuur code" klikt.
      const instructionUrl = `${
        process.env.NEXT_PUBLIC_APP_URL ?? 'https://mbt-gym.nl'
      }/login/code?email=${encodeURIComponent(email)}`

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
            ...(me.practiceId ? [{ practiceId: me.practiceId }] : []),
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
          message: 'Patiënt heeft geen geboortedatum — vul die eerst in voordat je opnieuw uitnodigt.',
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

      const instructionUrl = `${
        process.env.NEXT_PUBLIC_APP_URL ?? 'https://mbt-gym.nl'
      }/login/code?email=${encodeURIComponent(email)}`

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
  listMine: therapistProcedure.query(async ({ ctx }) => {
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
  revoke: therapistProcedure
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

      // Registreer poging altijd (ook als invite bestaat) zodat we fraud kunnen zien
      if (invite) {
        await ctx.prisma.inviteCode.update({
          where: { id: invite.id },
          data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
        })
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
            'We kunnen geen invite vinden met deze gegevens. Klopt je e-mail en geboortejaar?',
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

      // Match! Trigger Supabase OTP-mail.
      const admin = getSupabaseAdmin()
      if (!admin) {
        // Supabase niet geconfigureerd — dev-mode
        return { ok: true, delivered: false, devNote: 'Supabase niet geconfigureerd' }
      }

      const { error } = await admin.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: {
            name: invite.name,
            role: invite.role,
            practiceId: invite.practiceId,
            inviteId: invite.id,
          },
        },
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

      return { ok: true, delivered: true }
    }),

  /**
   * Stap 3 (na `supabase.auth.verifyOtp` client-side): finaliseer de invite.
   * De user is nu ingelogd (sessie in cookies), dus we kunnen via `ctx.user`
   * matchen op e-mail.
   */
  finalize: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.user!.email.toLowerCase()

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
      if (existingUser.role === 'THERAPIST' || existingUser.role === 'ADMIN') {
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
      await ctx.prisma.patientTherapist.upsert({
        where: {
          therapistId_patientId: {
            therapistId: invite.invitedById,
            patientId: user.id,
          },
        },
        update: { isActive: true, status: 'APPROVED' },
        create: {
          therapistId: invite.invitedById,
          patientId: user.id,
          status: 'APPROVED',
        },
      })
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

