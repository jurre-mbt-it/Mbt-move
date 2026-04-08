import { z } from 'zod'
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
