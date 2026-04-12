import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, therapistProcedure } from '@/server/trpc'

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

  resendInvite: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { email: true, name: true },
      })
      if (!patient) throw new Error('Patiënt niet gevonden')

      // Call the invite API internally
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const res = await fetch(`${baseUrl}/api/auth/invite-patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: patient.email, name: patient.name, resend: true }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Uitnodiging mislukt')
      }
      return { success: true }
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify this is a patient of the current therapist
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.id },
      })
      if (!relation) throw new Error('Patiënt niet gevonden')

      // Remove the therapist-patient relation
      await ctx.prisma.patientTherapist.deleteMany({
        where: { therapistId: ctx.user.id, patientId: input.id },
      })

      // Delete associated programs created by this therapist
      await ctx.prisma.program.deleteMany({
        where: { patientId: input.id, creatorId: ctx.user.id },
      })

      // Delete the user record
      await ctx.prisma.user.delete({ where: { id: input.id } })

      return { success: true }
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
