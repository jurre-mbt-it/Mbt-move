import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import type { PrismaClient } from '@prisma/client'
import { createTRPCRouter, therapistProcedure, mfaTherapistProcedure } from '@/server/trpc'
import { auditLog } from '@/server/audit'

const createId = () => crypto.randomUUID()

// Onboarding-placeholder die bij invite.create wordt gezet en bij invite.finalize
// gewist hoort te worden. Self-heal in patients.list pikt rijen op die door een
// eerdere bug nog steeds met deze tekst rondlopen terwijl de patient al
// geaccepteerd heeft.
const PENDING_INVITE_NOTE = 'Aangemaakt via invite — wacht op acceptatie'

/**
 * Toegang tot een patient = directe PatientTherapist-koppeling, OF dezelfde
 * praktijk als de patient. ADMIN krijgt altijd toegang.
 */
async function hasPatientAccess(
  prisma: PrismaClient,
  user: { id: string; role: string; practiceId: string | null },
  patientId: string,
): Promise<boolean> {
  if (user.role === 'ADMIN') return true
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: {
              therapistId: user.id,
              isActive: true,
              status: { in: ['APPROVED', 'PENDING'] },
            },
          },
        },
        ...(user.practiceId ? [{ practiceId: user.practiceId }] : []),
      ],
    },
    select: { id: true },
  })
  return !!found
}

export const patientsRouter = createTRPCRouter({
  list: therapistProcedure.query(async ({ ctx }) => {
    // Zichtbaar = directe koppeling (PatientTherapist) OF zelfde praktijk.
    // Dat laatste laat collega-therapeuten binnen één praktijk elkaars
    // patiënten zien zonder aparte invite.
    const me = ctx.user

    // Self-heal stale onboarding-notes voor reeds geaccepteerde patiënten
    // van deze therapeut. Eén UPDATE per dashboard-load; raakt alleen rijen
    // die nog letterlijk de placeholder bevatten.
    await ctx.prisma.patientTherapist.updateMany({
      where: {
        therapistId: me.id,
        status: 'APPROVED',
        notes: PENDING_INVITE_NOTE,
      },
      data: { notes: null },
    })

    // Therapietrouw-window: laatste 14 dagen. Lage compliance = ≥ 3 geplande
    // sessies en < 60% afgerond. Threshold is bewust conservatief zodat
    // nieuwe patiënten met 1-2 sessies niet meteen 'low' zijn.
    const COMPLIANCE_WINDOW_DAYS = 14
    const COMPLIANCE_MIN_SCHEDULED = 3
    const COMPLIANCE_THRESHOLD = 0.6
    const since = new Date(Date.now() - COMPLIANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const patients = await ctx.prisma.user.findMany({
      where: {
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
        avatarUrl: true,
        phone: true,
        dateOfBirth: true,
        createdAt: true,
        role: true,
        patientPrograms: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            name: true,
            status: true,
            weeks: true,
            startDate: true,
            endDate: true,
          },
        },
        patientTherapists: {
          where: {
            therapistId: me.id,
            isActive: true,
            status: { in: ['APPROVED', 'PENDING'] },
          },
          take: 1,
          select: { status: true, notes: true },
        },
        sessionLogs: {
          where: { scheduledAt: { gte: since } },
          select: { completedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return patients.map(p => {
      const program = p.patientPrograms[0] ?? null
      const myRel = p.patientTherapists[0] ?? null
      const initials = (p.name ?? p.email)
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      const scheduled = p.sessionLogs.length
      const completed = p.sessionLogs.filter(s => s.completedAt !== null).length
      const compliancePercent = scheduled > 0 ? completed / scheduled : null
      const complianceLow =
        scheduled >= COMPLIANCE_MIN_SCHEDULED &&
        compliancePercent !== null &&
        compliancePercent < COMPLIANCE_THRESHOLD

      return {
        accessStatus: myRel?.status ?? 'APPROVED',
        id: p.id,
        role: p.role,
        name: p.name ?? p.email,
        email: p.email,
        phone: p.phone,
        avatarInitials: initials,
        dateOfBirth: p.dateOfBirth,
        createdAt: p.createdAt,
        notes: myRel?.notes ?? null,
        programId: program?.id ?? null,
        programName: program?.name ?? null,
        programStatus: program?.status ?? null,
        weeksTotal: program?.weeks ?? 0,
        startDate: program?.startDate,
        endDate: program?.endDate,
        // Therapietrouw afgelopen 14 dagen
        compliancePercent,
        complianceLow,
        complianceScheduled: scheduled,
        complianceCompleted: completed,
      }
    })
  }),

  get: therapistProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user
      const p = await ctx.prisma.user.findFirst({
        where: {
          id: input.id,
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
          avatarUrl: true,
          phone: true,
          dateOfBirth: true,
          createdAt: true,
          injuryInfo: true,
          injuryVisibleToTherapist: true,
          patientPrograms: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              status: true,
              weeks: true,
              daysPerWeek: true,
              startDate: true,
              endDate: true,
            },
          },
          patientTherapists: {
            where: {
              therapistId: me.id,
              isActive: true,
              status: { in: ['APPROVED', 'PENDING'] },
            },
            take: 1,
            select: { status: true, notes: true },
          },
        },
      })

      if (!p) return null

      // NEN 7513 / Wabvpz: dossier-toegang door therapeut moet gelogd
      // worden. auditLog faalt silently, breekt de query nooit.
      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: me.id,
        actorEmail: me.email,
        resource: 'User',
        resourceId: p.id,
        metadata: { route: 'patients.get' },
        req: ctx.req,
      })

      const myRel = p.patientTherapists[0] ?? null
      const program = p.patientPrograms[0] ?? null
      const initials = (p.name ?? p.email)
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      return {
        id: p.id,
        accessStatus: myRel?.status ?? 'APPROVED',
        name: p.name ?? p.email,
        email: p.email,
        role: p.role,
        phone: p.phone,
        avatarInitials: initials,
        dateOfBirth: p.dateOfBirth,
        createdAt: p.createdAt,
        // Alleen tonen als patient ermee instemt
        injuryInfo: p.injuryVisibleToTherapist ? p.injuryInfo : null,
        notes: myRel?.notes ?? null,
        programId: program?.id ?? null,
        programName: program?.name ?? null,
        programStatus: program?.status ?? null,
        weeksTotal: program?.weeks ?? 0,
        startDate: program?.startDate,
        endDate: program?.endDate,
        programs: p.patientPrograms,
      }
    }),

  /**
   * Bewerk basisgegevens van een patiënt (naam, telefoon, geboortedatum) +
   * private notities van de behandelend therapeut. Toegankelijk voor de
   * gekoppelde therapeut of een collega binnen dezelfde praktijk.
   */
  update: therapistProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1, 'Naam is verplicht').optional(),
      phone: z.string().nullable().optional(),
      // YYYY-MM-DD of null om te wissen
      dateOfBirth: z.string().refine(
        (v) => v === '' || !Number.isNaN(Date.parse(v)),
        'Ongeldige geboortedatum',
      ).nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.id))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden of geen toegang.' })
      }

      const userData: {
        name?: string
        phone?: string | null
        dateOfBirth?: Date | null
      } = {}
      if (input.name !== undefined) userData.name = input.name.trim()
      if (input.phone !== undefined) userData.phone = input.phone?.trim() || null
      if (input.dateOfBirth !== undefined) {
        userData.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null
      }

      if (Object.keys(userData).length > 0) {
        await ctx.prisma.user.update({
          where: { id: input.id },
          data: userData,
        })
      }

      if (input.notes !== undefined) {
        // Notities zijn private per therapeut → alleen eigen relatie updaten.
        await ctx.prisma.patientTherapist.updateMany({
          where: { therapistId: ctx.user.id, patientId: input.id, isActive: true },
          data: { notes: input.notes },
        })
      }

      return { ok: true }
    }),

  changeRole: mfaTherapistProcedure
    .input(z.object({
      id: z.string(),
      // Therapeuten mogen alleen tussen PATIENT en ATHLETE wisselen — NIET promoveren
      // naar THERAPIST of ADMIN. Zie security review #1.
      role: z.enum(['PATIENT', 'ATHLETE']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify this is a patient of the current therapist
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
      })
      if (!relation && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Patiënt niet gevonden' })
      }

      // Extra defense: zorg dat de target-user geen THERAPIST/ADMIN is die we hiermee
      // zouden degraderen naar PATIENT/ATHLETE.
      const target = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { role: true },
      })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })
      if (target.role !== 'PATIENT' && target.role !== 'ATHLETE') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Kan rol van deze gebruiker niet wijzigen' })
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.id },
        data: { role: input.role },
        select: { id: true, role: true, supabaseUserId: true, email: true },
      })

      // Sync ook Supabase user_metadata.role — anders blijft de proxy/middleware
      // en LoginForm de oude rol gebruiken (die lezen user_metadata, niet de DB).
      try {
        const supabaseAdmin = createSupabaseAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        let supaUserId = updated.supabaseUserId
        if (!supaUserId) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
          supaUserId = users.find(u => u.email?.toLowerCase() === updated.email.toLowerCase())?.id ?? null
        }
        if (supaUserId) {
          await supabaseAdmin.auth.admin.updateUserById(supaUserId, {
            user_metadata: { role: updated.role },
          })
        }
      } catch (e) {
        console.error('changeRole: failed to sync Supabase user_metadata', e)
      }

      return updated
    }),

  /**
   * Invite a new patient/athlete/therapist. Works for both web (cookie auth) and
   * mobile (Bearer token) — no internal fetch needed.
   */
  invite: therapistProcedure
    .input(
      z.object({
        email: z.string().email('Ongeldig e-mailadres'),
        name: z.string().min(1, 'Naam is verplicht'),
        // Therapeuten mogen ALLEEN patiënten/atleten uitnodigen. Nieuwe therapeuten
        // aanmaken is admin-only; nooit via deze procedure (security review #2).
        role: z.enum(['PATIENT', 'ATHLETE']).default('PATIENT'),
        resend: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { email, name, role, resend } = input

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      // Als er al een User-record bestaat met dit e-mailadres: verifieer dat
      // (a) het een PATIENT/ATHLETE is en (b) de caller een actieve relatie heeft
      // (of ADMIN is). Anders kan een kwaadwillende therapeut via `resend: true`
      // Supabase auth-users van willekeurige e-mailadressen laten verwijderen.
      const existingDbUser = await ctx.prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      })
      if (existingDbUser) {
        if (existingDbUser.role !== 'PATIENT' && existingDbUser.role !== 'ATHLETE') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Dit e-mailadres hoort bij een bestaand therapeut- of admin-account.',
          })
        }
        if (ctx.user.role !== 'ADMIN') {
          const relation = await ctx.prisma.patientTherapist.findFirst({
            where: { therapistId: ctx.user.id, patientId: existingDbUser.id },
          })
          if (!relation) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Deze gebruiker is al bekend en niet aan jou gekoppeld.',
            })
          }
        }
      }

      // If resend: delete the existing Supabase auth user first so we can re-invite
      if (resend) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = users.find(u => u.email === email)
        if (existingUser) {
          // Alleen verwijderen als we hierboven hebben geverifieerd dat het een
          // eigen patiënt/atleet is (of de caller admin is).
          if (!existingDbUser && ctx.user.role !== 'ADMIN') {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Kan deze uitnodiging niet opnieuw versturen.',
            })
          }
          await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
        }
      }

      const redirectBase =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : 'http://localhost:3000')

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role, name },
        redirectTo: `${redirectBase}/auth/callback`,
      })

      if (error) {
        if (!resend && (error.message.includes('already') || error.message.includes('exists'))) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Deze gebruiker bestaat al.',
          })
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message || 'Uitnodiging mislukt',
        })
      }

      // Create/update the user record. Nieuwe user krijgt dezelfde practiceId
      // als de uitnodigende therapeut, zodat multi-tenant scope klopt.
      const patient = await ctx.prisma.user.upsert({
        where: { email },
        update: { name },
        create: {
          id: data.user.id,
          email,
          name,
          role,
          practiceId: ctx.user.practiceId ?? null,
        },
      })

      // Link therapist ↔ patient (only for PATIENT/ATHLETE). Status = PENDING
      // zodat de patiënt zelf moet bevestigen voordat de therapeut data inziet.
      if (role === 'PATIENT' || role === 'ATHLETE') {
        await ctx.prisma.patientTherapist.upsert({
          where: {
            therapistId_patientId: {
              therapistId: ctx.user.id,
              patientId: patient.id,
            },
          },
          update: { isActive: true },
          create: {
            therapistId: ctx.user.id,
            patientId: patient.id,
            status: 'PENDING',
            requestedAt: new Date(),
          },
        })
      }

      return { success: true, resent: !!resend, patientId: patient.id }
    }),

  resendInvite: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
      })
      if (!relation && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze patiënt' })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { email: true, name: true, role: true },
      })
      if (!patient) throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden' })

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = users.find(u => u.email === patient.email)
      if (existingUser) {
        await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
      }

      const redirectBase =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : 'http://localhost:3000')

      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(patient.email, {
        data: { role: patient.role, name: patient.name },
        redirectTo: `${redirectBase}/auth/callback`,
      })
      if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })

      return { success: true }
    }),

  delete: mfaTherapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Alleen actieve relaties (APPROVED of PENDING) mogen via deze knop
      // gedelete worden. Een ex-therapeut wiens toegang door de patient is
      // ingetrokken (REVOKED/DECLINED) mag de programma's van die patient
      // niet meer cascade-deleten.
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: {
          therapistId: ctx.user.id,
          patientId: input.id,
          isActive: true,
          status: { in: ['APPROVED', 'PENDING'] },
        },
      })
      if (!relation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Patiënt niet gevonden' })
      }

      await ctx.prisma.patientTherapist.deleteMany({
        where: { therapistId: ctx.user.id, patientId: input.id },
      })

      await ctx.prisma.program.deleteMany({
        where: { patientId: input.id, creatorId: ctx.user.id },
      })

      return { success: true }
    }),

  // ── Live behandeling loggen (therapist doet dit ter plekke met patient) ──

  /**
   * Therapeut logt een behandelsessie voor een patient. Gebaseerd op
   * patient.logSession, maar neemt patientId als input en verifieert de
   * therapist-patient-relatie.
   */
  logSessionForPatient: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        programId: z.string().optional(),
        scheduledAt: z.string(),
        completedAt: z.string(),
        durationSeconds: z.number().int().min(0),
        painLevel: z.number().int().min(0).max(10).nullable(),
        exertionLevel: z.number().int().min(0).max(10).nullable(),
        notes: z.string().optional(),
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).optional(),
            repsCompleted: z.number().int().min(0).optional(),
            painLevel: z.number().int().min(0).max(10).nullable().optional(),
            weight: z.number().nullable().optional(),
            weightsPerSet: z.array(z.number().nullable()).nullable().optional(),
            extraParams: z.array(z.object({
              id: z.string(),
              label: z.string(),
              type: z.enum(['number', 'text', 'select', 'slider']),
              value: z.union([z.string(), z.number()]),
              unit: z.string().optional(),
              options: z.array(z.string()).optional(),
              min: z.number().optional(),
              max: z.number().optional(),
            })).nullable().optional(),
            supersetGroup: z.string().nullable().optional(),
            phase: z.enum(['WARMUP', 'MAIN']).nullable().optional(),
            estimatedOneRepMax: z.number().nullable().optional(),
            painDuring: z.number().int().min(0).max(10).nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: {
          therapistId: ctx.user.id,
          patientId: input.patientId,
          isActive: true, status: { in: ['APPROVED', 'PENDING'] },
        },
      })
      if (!relation && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Patient is niet aan jou gekoppeld',
        })
      }

      return ctx.prisma.sessionLog.create({
        data: {
          id: createId(),
          patientId: input.patientId,
          programId: input.programId ?? undefined,
          scheduledAt: new Date(input.scheduledAt),
          completedAt: new Date(input.completedAt),
          status: 'COMPLETED',
          duration: input.durationSeconds,
          painLevel: input.painLevel,
          exertionLevel: input.exertionLevel,
          notes: input.notes ?? undefined,
          exerciseLogs: {
            create: input.exercises.map((ex) => ({
              id: createId(),
              exerciseId: ex.exerciseId,
              setsCompleted: ex.setsCompleted ?? null,
              repsCompleted: ex.repsCompleted ?? null,
              painLevel: ex.painLevel ?? null,
              weight: ex.weight ?? null,
              weightsPerSet: ex.weightsPerSet ?? undefined,
              extraParams: ex.extraParams ?? undefined,
              supersetGroup: ex.supersetGroup ?? null,
              phase: ex.phase ?? null,
              estimatedOneRepMax: ex.estimatedOneRepMax ?? null,
              painDuring: ex.painDuring ?? null,
            })),
          },
        },
        select: { id: true },
      })
    }),

  /**
   * Bewerk een eerder gelogde sessie (na "BEHANDELING AFRONDEN"). Vervangt
   * de exerciseLogs volledig — eenvoudiger dan diff-en, en past bij de
   * intentie ("alles is editable na opslaan").
   */
  updateSessionLog: therapistProcedure
    .input(
      z.object({
        sessionId: z.string(),
        scheduledAt: z.string().optional(),
        completedAt: z.string().optional(),
        durationSeconds: z.number().int().min(0).optional(),
        painLevel: z.number().int().min(0).max(10).nullable().optional(),
        exertionLevel: z.number().int().min(0).max(10).nullable().optional(),
        notes: z.string().nullable().optional(),
        exercises: z.array(
          z.object({
            exerciseId: z.string(),
            setsCompleted: z.number().int().min(0).nullable().optional(),
            repsCompleted: z.number().int().min(0).nullable().optional(),
            painLevel: z.number().int().min(0).max(10).nullable().optional(),
            weight: z.number().nullable().optional(),
            weightsPerSet: z.array(z.number().nullable()).nullable().optional(),
            extraParams: z.array(z.object({
              id: z.string(),
              label: z.string(),
              type: z.enum(['number', 'text', 'select', 'slider']),
              value: z.union([z.string(), z.number()]),
              unit: z.string().optional(),
              options: z.array(z.string()).optional(),
              min: z.number().optional(),
              max: z.number().optional(),
            })).nullable().optional(),
            supersetGroup: z.string().nullable().optional(),
            painDuring: z.number().int().min(0).max(10).nullable().optional(),
          }),
        ).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.sessionLog.findUnique({
        where: { id: input.sessionId },
        select: { patientId: true },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sessie niet gevonden' })
      }
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, session.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      const updates: Record<string, unknown> = {}
      if (input.scheduledAt) updates.scheduledAt = new Date(input.scheduledAt)
      if (input.completedAt) updates.completedAt = new Date(input.completedAt)
      if (input.durationSeconds !== undefined) updates.duration = input.durationSeconds
      if (input.painLevel !== undefined) updates.painLevel = input.painLevel
      if (input.exertionLevel !== undefined) updates.exertionLevel = input.exertionLevel
      if (input.notes !== undefined) updates.notes = input.notes ?? null

      await ctx.prisma.$transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
          await tx.sessionLog.update({
            where: { id: input.sessionId },
            data: updates,
          })
        }
        if (input.exercises) {
          await tx.exerciseLog.deleteMany({ where: { sessionId: input.sessionId } })
          if (input.exercises.length > 0) {
            await tx.exerciseLog.createMany({
              data: input.exercises.map((ex) => ({
                id: createId(),
                sessionId: input.sessionId,
                exerciseId: ex.exerciseId,
                setsCompleted: ex.setsCompleted ?? null,
                repsCompleted: ex.repsCompleted ?? null,
                painLevel: ex.painLevel ?? null,
                weight: ex.weight ?? null,
                weightsPerSet: (ex.weightsPerSet ?? undefined) as never,
                extraParams: (ex.extraParams ?? undefined) as never,
                supersetGroup: ex.supersetGroup ?? null,
                painDuring: ex.painDuring ?? null,
              })),
            })
          }
        }
      })

      return { id: input.sessionId }
    }),

  /**
   * Volledige sessie ophalen voor bewerking — inclusief alle exerciseLogs
   * met nieuwe velden (weightsPerSet, extraParams, supersetGroup).
   */
  getSessionLog: therapistProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.sessionLog.findUnique({
        where: { id: input.sessionId },
        include: {
          program: { select: { id: true, name: true } },
          exerciseLogs: true,
        },
      })
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sessie niet gevonden' })
      }
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, session.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const exerciseIds = session.exerciseLogs.map((el) => el.exerciseId)
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true, category: true },
          })
        : []
      const nameById = new Map(exercises.map((e) => [e.id, e]))
      return {
        id: session.id,
        patientId: session.patientId,
        programName: session.program?.name ?? null,
        scheduledAt: session.scheduledAt,
        completedAt: session.completedAt,
        durationSeconds: session.duration,
        painLevel: session.painLevel,
        exertionLevel: session.exertionLevel,
        notes: session.notes,
        exercises: session.exerciseLogs.map((el) => ({
          id: el.id,
          exerciseId: el.exerciseId,
          name: nameById.get(el.exerciseId)?.name ?? 'Oefening',
          category: nameById.get(el.exerciseId)?.category ?? 'STRENGTH',
          setsCompleted: el.setsCompleted,
          repsCompleted: el.repsCompleted,
          weight: el.weight,
          weightsPerSet: Array.isArray(el.weightsPerSet)
            ? (el.weightsPerSet as Array<number | null>)
            : null,
          extraParams: Array.isArray(el.extraParams)
            ? (el.extraParams as Array<Record<string, unknown>>)
            : [],
          supersetGroup: el.supersetGroup,
          painLevel: el.painLevel,
          painDuring: el.painDuring,
          notes: el.notes,
        })),
      }
    }),

  /**
   * Uitgebreide patient-dashboard data voor therapist: sessie-historie,
   * load-metrics bron, frequentie en meest-gedane oefeningen.
   */
  getDashboardData: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.getDashboardData' },
        req: ctx.req,
      })

      const since = new Date()
      since.setDate(since.getDate() - 60) // 60d historie

      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: input.patientId,
          status: 'COMPLETED',
          completedAt: { gte: since },
        },
        orderBy: { completedAt: 'desc' },
        include: {
          program: { select: { id: true, name: true } },
          exerciseLogs: {
            select: { exerciseId: true },
          },
        },
      })

      // Exercise-namen voor top-5
      const exIdCounts = new Map<string, number>()
      for (const s of sessions) {
        for (const el of s.exerciseLogs) {
          exIdCounts.set(el.exerciseId, (exIdCounts.get(el.exerciseId) ?? 0) + 1)
        }
      }
      const topExerciseIds = Array.from(exIdCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id)

      const topExercises = topExerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: topExerciseIds } },
            select: { id: true, name: true, category: true },
          })
        : []

      const topExercisesWithCount = topExerciseIds.map((id) => {
        const ex = topExercises.find((e) => e.id === id)
        return {
          id,
          name: ex?.name ?? 'Oefening',
          category: ex?.category ?? 'STRENGTH',
          count: exIdCounts.get(id) ?? 0,
        }
      })

      // Recent wellness checks
      const wellnessChecks = await ctx.prisma.wellnessCheck.findMany({
        where: { userId: input.patientId, date: { gte: since } },
        orderBy: { date: 'desc' },
        take: 14,
      })

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          completedAt: s.completedAt,
          programName: s.program?.name ?? null,
          durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
          exerciseCount: s.exerciseLogs.length,
          painLevel: s.painLevel,
          exertionLevel: s.exertionLevel,
          notes: s.notes,
        })),
        topExercises: topExercisesWithCount,
        wellnessChecks,
      }
    }),

  // ── Voortgangsdata voor therapist ────────────────────────────────────────
  getProgress: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'PATIENT_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.getProgress' },
        req: ctx.req,
      })

      // Sessions (last 90 days)
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: { patientId: input.patientId, status: 'COMPLETED', completedAt: { gte: since } },
        orderBy: { completedAt: 'asc' },
        select: {
          id: true, completedAt: true, duration: true,
          painLevel: true, exertionLevel: true, notes: true,
        },
      })

      // Exercise logs met gewicht/1RM (laatste 60 sessies)
      const exerciseLogs = await ctx.prisma.exerciseLog.findMany({
        where: {
          session: { patientId: input.patientId, status: 'COMPLETED' },
          weight: { not: null },
        },
        orderBy: { session: { completedAt: 'asc' } },
        select: {
          exerciseId: true, weight: true, estimatedOneRepMax: true,
          setsCompleted: true, repsCompleted: true,
          session: { select: { completedAt: true } },
        },
        take: 500,
      })

      // Exercise namen
      const exerciseIds = [...new Set(exerciseLogs.map(l => l.exerciseId))]
      const exercises = await ctx.prisma.exercise.findMany({
        where: { id: { in: exerciseIds } },
        select: { id: true, name: true },
      })
      const exerciseMap = Object.fromEntries(exercises.map(e => [e.id, e.name]))

      // Groepeer 1RM per oefening over tijd
      const oneRmByExercise: Record<string, { date: string; oneRm: number }[]> = {}
      for (const log of exerciseLogs) {
        if (!log.estimatedOneRepMax || !log.session.completedAt) continue
        const name = exerciseMap[log.exerciseId] ?? log.exerciseId
        if (!oneRmByExercise[name]) oneRmByExercise[name] = []
        oneRmByExercise[name].push({
          date: log.session.completedAt.toISOString().slice(0, 10),
          oneRm: Math.round(log.estimatedOneRepMax),
        })
      }

      return {
        sessions: sessions.map(s => ({
          id: s.id,
          date: s.completedAt?.toISOString() ?? '',
          durationMinutes: s.duration ? Math.round(s.duration / 60) : 0,
          painLevel: s.painLevel ?? null,
          exertionLevel: s.exertionLevel ?? null,
          notes: s.notes ?? null,
        })),
        oneRmByExercise,
        totalSessions: sessions.length,
        avgPain: sessions.filter(s => s.painLevel !== null).length
          ? Math.round(sessions.filter(s => s.painLevel !== null)
              .reduce((s, l) => s + (l.painLevel ?? 0), 0) /
              sessions.filter(s => s.painLevel !== null).length * 10) / 10
          : null,
        avgExertion: sessions.filter(s => s.exertionLevel !== null).length
          ? Math.round(sessions.filter(s => s.exertionLevel !== null)
              .reduce((s, l) => s + (l.exertionLevel ?? 0), 0) /
              sessions.filter(s => s.exertionLevel !== null).length * 10) / 10
          : null,
      }
    }),

  // Search binnen eigen gekoppelde patiënten. ADMIN mag globaal zoeken.
  // Eerder leverde deze endpoint PII van alle patiënten in de DB op — zie
  // security review #6.
  /** Laatste N gelogde sessies van deze patient, voor de geschiedenis-tab. */
  recentSessions: therapistProcedure
    .input(z.object({ patientId: z.string(), limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPatientAccess(ctx.prisma, ctx.user, input.patientId))) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      await auditLog({
        event: 'SESSION_LOG_VIEWED',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'User',
        resourceId: input.patientId,
        metadata: { route: 'patients.recentSessions', limit: input.limit },
        req: ctx.req,
      })

      const sessions = await ctx.prisma.sessionLog.findMany({
        where: { patientId: input.patientId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: input.limit,
        include: {
          program: { select: { id: true, name: true } },
          exerciseLogs: {
            select: {
              id: true,
              exerciseId: true,
              setsCompleted: true,
              repsCompleted: true,
              painLevel: true,
              weight: true,
              weightsPerSet: true,
              extraParams: true,
              supersetGroup: true,
              painDuring: true,
              notes: true,
            },
          },
        },
      })

      const exerciseIds = Array.from(new Set(sessions.flatMap((s) => s.exerciseLogs.map((el) => el.exerciseId))))
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]))

      return sessions.map((s) => ({
        id: s.id,
        completedAt: s.completedAt,
        durationMinutes: s.duration ? Math.round(s.duration / 60) : null,
        programName: s.program?.name ?? null,
        painLevel: s.painLevel,
        exertionLevel: s.exertionLevel,
        notes: s.notes,
        exercises: s.exerciseLogs.map((el) => ({
          id: el.id,
          exerciseId: el.exerciseId,
          name: exerciseNameById.get(el.exerciseId) ?? 'Oefening',
          sets: el.setsCompleted,
          reps: el.repsCompleted,
          painLevel: el.painLevel,
          weight: el.weight,
          weightsPerSet: el.weightsPerSet,
          extraParams: el.extraParams,
          supersetGroup: el.supersetGroup,
          painDuring: el.painDuring,
          notes: el.notes,
        })),
      }))
    }),

  search: therapistProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const baseWhere = {
        ...(input.query ? {
          OR: [
            { name: { contains: input.query, mode: 'insensitive' as const } },
            { email: { contains: input.query, mode: 'insensitive' as const } },
          ],
        } : {}),
      }

      if (ctx.user.role === 'ADMIN') {
        return ctx.prisma.user.findMany({
          where: {
            role: { in: ['PATIENT', 'ATHLETE'] },
            ...baseWhere,
          },
          select: { id: true, name: true, email: true },
          take: 20,
        })
      }

      return ctx.prisma.user.findMany({
        where: {
          role: { in: ['PATIENT', 'ATHLETE'] },
          OR: [
            {
              patientTherapists: {
                some: {
                  therapistId: ctx.user.id,
                  isActive: true,
                  status: { in: ['APPROVED', 'PENDING'] },
                },
              },
            },
            ...(ctx.user.practiceId ? [{ practiceId: ctx.user.practiceId }] : []),
          ],
          ...baseWhere,
        },
        select: { id: true, name: true, email: true },
        take: 20,
      })
    }),
})
