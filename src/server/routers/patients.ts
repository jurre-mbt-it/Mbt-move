import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'

const createId = () => crypto.randomUUID()

export const patientsRouter = createTRPCRouter({
  list: therapistProcedure.query(async ({ ctx }) => {
    const relations = await ctx.prisma.patientTherapist.findMany({
      where: { therapistId: ctx.user.id, isActive: true },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            phone: true,
            dateOfBirth: true,
            createdAt: true,
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
          },
        },
      },
    })

    return relations.map(r => {
      const p = r.patient
      const program = p.patientPrograms[0] ?? null
      const initials = (p.name ?? p.email)
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      return {
        id: p.id,
        name: p.name ?? p.email,
        email: p.email,
        phone: p.phone,
        avatarInitials: initials,
        dateOfBirth: p.dateOfBirth,
        createdAt: p.createdAt,
        notes: r.notes,
        programId: program?.id ?? null,
        programName: program?.name ?? null,
        programStatus: program?.status ?? null,
        weeksTotal: program?.weeks ?? 0,
        startDate: program?.startDate,
        endDate: program?.endDate,
      }
    })
  }),

  get: therapistProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id, isActive: true },
        include: {
          patient: {
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
            },
          },
        },
      })

      if (!relation) return null

      const p = relation.patient
      const program = p.patientPrograms[0] ?? null
      const initials = (p.name ?? p.email)
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      return {
        id: p.id,
        name: p.name ?? p.email,
        email: p.email,
        role: p.role,
        phone: p.phone,
        avatarInitials: initials,
        dateOfBirth: p.dateOfBirth,
        createdAt: p.createdAt,
        // Alleen tonen als patient ermee instemt
        injuryInfo: p.injuryVisibleToTherapist ? p.injuryInfo : null,
        notes: relation.notes,
        programId: program?.id ?? null,
        programName: program?.name ?? null,
        programStatus: program?.status ?? null,
        weeksTotal: program?.weeks ?? 0,
        startDate: program?.startDate,
        endDate: program?.endDate,
        programs: p.patientPrograms,
      }
    }),

  changeRole: therapistProcedure
    .input(z.object({
      id: z.string(),
      role: z.enum(['PATIENT', 'ATHLETE', 'THERAPIST']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify this is a patient of the current therapist
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id },
      })
      if (!relation) {
        throw new Error('Patiënt niet gevonden')
      }
      return ctx.prisma.user.update({
        where: { id: input.id },
        data: { role: input.role },
      })
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
        role: z.enum(['PATIENT', 'ATHLETE', 'THERAPIST']).default('PATIENT'),
        resend: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { email, name, role, resend } = input

      const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      // If resend: delete the existing Supabase auth user first so we can re-invite
      if (resend) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        const existingUser = users.find(u => u.email === email)
        if (existingUser) {
          await supabaseAdmin.auth.admin.deleteUser(existingUser.id)
        }
      }

      const redirectBase =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

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

      // Create/update the user record
      const patient = await ctx.prisma.user.upsert({
        where: { email },
        update: { name },
        create: {
          id: data.user.id,
          email,
          name,
          role,
        },
      })

      // Link therapist ↔ patient (only for PATIENT/ATHLETE)
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
          },
        })
      }

      return { success: true, resent: !!resend, patientId: patient.id }
    }),

  resendInvite: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id, isActive: true },
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
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(patient.email, {
        data: { role: patient.role, name: patient.name },
        redirectTo: `${redirectBase}/auth/callback`,
      })
      if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })

      return { success: true }
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id },
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
          isActive: true,
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
              estimatedOneRepMax: ex.estimatedOneRepMax ?? null,
              painDuring: ex.painDuring ?? null,
            })),
          },
        },
        select: { id: true },
      })
    }),

  /**
   * Uitgebreide patient-dashboard data voor therapist: sessie-historie,
   * load-metrics bron, frequentie en meest-gedane oefeningen.
   */
  getDashboardData: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: {
          therapistId: ctx.user.id,
          patientId: input.patientId,
          isActive: true,
        },
      })
      if (!relation && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

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
      // Verify access
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.patientId, isActive: true },
      })
      if (!relation) throw new TRPCError({ code: 'FORBIDDEN' })

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

  // Get all patients (including unlinked) for the therapist to invite/link
  search: therapistProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        where: {
          role: 'PATIENT',
          ...(input.query ? {
            OR: [
              { name: { contains: input.query, mode: 'insensitive' } },
              { email: { contains: input.query, mode: 'insensitive' } },
            ],
          } : {}),
        },
        select: { id: true, name: true, email: true },
        take: 20,
      })
    }),
})
