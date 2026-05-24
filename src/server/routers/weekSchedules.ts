import { z } from 'zod'
import { createTRPCRouter, therapistProcedure, protectedProcedure } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'

const createId = () => crypto.randomUUID()

/**
 * Security: zorg dat een therapeut alleen een schedule kan koppelen aan een
 * patiënt waarmee een actieve relatie bestaat. Admin mag altijd.
 * Zie security review #5.
 */
async function assertPatientLink(
  prisma: PrismaClient,
  user: { id: string; role: string },
  patientId: string | null | undefined,
) {
  if (!patientId) return
  if (user.role === 'ADMIN') return
  if (patientId === user.id) return
  const relation = await prisma.patientTherapist.findFirst({
    where: { therapistId: user.id, patientId, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
  })
  if (!relation) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve koppeling met deze patiënt',
    })
  }
}

const DayInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  programId: z.string().nullable().optional(),
})

/**
 * Synchroniseer legacy `WeekScheduleDay.programId` met het eerste
 * program-gekoppelde item (op `order`). Voor backwards-compat met
 * patient-app + iOS die nog via die kolom lezen.
 */
async function syncDayProgramId(prisma: PrismaClient, dayId: string) {
  const firstProgramItem = await prisma.weekScheduleDayItem.findFirst({
    where: { dayId, programId: { not: null } },
    orderBy: { order: 'asc' },
    select: { programId: true },
  })
  await prisma.weekScheduleDay.update({
    where: { id: dayId },
    data: { programId: firstProgramItem?.programId ?? null },
  })
}

export const weekSchedulesRouter = createTRPCRouter({
  list: therapistProcedure
    .input(z.object({ patientId: z.string().optional(), isTemplate: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'ADMIN'
      const practiceId = ctx.user.practiceId
      // Eigen schema's altijd zichtbaar. Daarnaast: schema's van collega-
      // therapeuten binnen dezelfde praktijk ook (practiceId-match).
      const ownership = isAdmin
        ? {}
        : practiceId
          ? { OR: [{ creatorId: ctx.user.id }, { practiceId }] }
          : { creatorId: ctx.user.id }
      return ctx.prisma.weekSchedule.findMany({
        where: {
          ...ownership,
          ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
          ...(input?.isTemplate !== undefined ? { isTemplate: input.isTemplate } : {}),
        },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    }),

  get: therapistProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ws = await ctx.prisma.weekSchedule.findUnique({
        where: { id: input.id },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          days: { include: { program: { select: { id: true, name: true, status: true, weeks: true, daysPerWeek: true, _count: { select: { exercises: true } } } } }, orderBy: { dayOfWeek: 'asc' } },
        },
      })
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = ws.creatorId === ctx.user.id
      const isAssignedPatient = ws.patientId === ctx.user.id
      const isSamePractice =
        !!ctx.user.practiceId &&
        !!ws.practiceId &&
        ws.practiceId === ctx.user.practiceId
      if (!isAdmin && !isOwner && !isAssignedPatient && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      return ws
    }),

  create: therapistProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      patientId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isTemplate: z.boolean().default(false),
      days: z.array(DayInput).length(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = createId()
      const { patientId, days, startDate, endDate, ...rest } = input
      await assertPatientLink(ctx.prisma, ctx.user, patientId)
      return ctx.prisma.weekSchedule.create({
        data: {
          id,
          ...rest,
          ...(patientId ? { patientId } : {}),
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          ...(endDate ? { endDate: new Date(endDate) } : {}),
          creatorId: ctx.user.id,
          practiceId: ctx.user.practiceId ?? null,
          days: {
            create: days.map(d => ({
              id: createId(),
              dayOfWeek: d.dayOfWeek,
              ...(d.programId ? { programId: d.programId } : {}),
            })),
          },
        },
        include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
      })
    }),

  save: therapistProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      patientId: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      isTemplate: z.boolean().optional(),
      days: z.array(DayInput).length(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, days, patientId, startDate, endDate, ...rest } = input
      // Owner-check + nieuwe patient-link in één lokale invariant. Eerst
      // ownership, dan de target patient (kan ander zijn dan `existing.patientId`
      // bij her-toewijzing). Audit M1 — voorkomt dat een toekomstige refactor
      // de assertPatientLink call laat verdwijnen zonder dat de re-assignment
      // gevaarlijk wordt.
      const existing = await ctx.prisma.weekSchedule.findFirst({
        where: { id, creatorId: ctx.user.id },
        select: { id: true, patientId: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertPatientLink(ctx.prisma, ctx.user, patientId)
      // Als de patient verandert, dubbel-check ook de huidige link (zou
      // theoretisch al gecovered moeten zijn door ownership, maar
      // defense-in-depth).
      if (existing.patientId && existing.patientId !== patientId) {
        await assertPatientLink(ctx.prisma, ctx.user, existing.patientId)
      }

      await ctx.prisma.weekScheduleDay.deleteMany({ where: { weekScheduleId: id } })

      return ctx.prisma.weekSchedule.update({
        where: { id },
        data: {
          ...rest,
          patientId: patientId ?? null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          days: {
            create: days.map(d => ({
              id: createId(),
              dayOfWeek: d.dayOfWeek,
              ...(d.programId ? { programId: d.programId } : {}),
            })),
          },
        },
        include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
      })
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.weekSchedule.findFirst({ where: { id: input.id, creatorId: ctx.user.id } })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      return ctx.prisma.weekSchedule.delete({ where: { id: input.id } })
    }),

  /**
   * Granulaire set/unset van een programma op één weekdag voor een patient.
   * Maakt het week-schedule automatisch aan als 't nog niet bestaat.
   * Geeft `programId: null` mee om de dag leeg te maken.
   */
  setDayProgram: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      dayOfWeek: z.number().int().min(0).max(6),
      programId: z.string().nullable(),
      weekNumber: z.number().int().min(1).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)

      if (input.programId) {
        const program = await ctx.prisma.program.findUnique({ where: { id: input.programId } })
        if (!program) throw new TRPCError({ code: 'NOT_FOUND', message: 'Programma niet gevonden' })
        const isAdmin = ctx.user.role === 'ADMIN'
        const isOwner = program.creatorId === ctx.user.id
        const samePractice =
          !!ctx.user.practiceId && !!program.practiceId && program.practiceId === ctx.user.practiceId
        if (!isAdmin && !isOwner && !samePractice) {
          throw new TRPCError({ code: 'FORBIDDEN' })
        }
      }

      const existing = await ctx.prisma.weekSchedule.findFirst({
        where: { creatorId: ctx.user.id, patientId: input.patientId, weekNumber: input.weekNumber },
        include: { days: true },
      })

      if (!existing) {
        const patient = await ctx.prisma.user.findUnique({
          where: { id: input.patientId },
          select: { name: true, email: true },
        })
        const label = patient?.name ?? patient?.email ?? 'Patient'
        return ctx.prisma.weekSchedule.create({
          data: {
            id: createId(),
            name: `Weekplan · ${label} · week ${input.weekNumber}`,
            creatorId: ctx.user.id,
            practiceId: ctx.user.practiceId ?? null,
            patientId: input.patientId,
            startDate: new Date(),
            isTemplate: false,
            weekNumber: input.weekNumber,
            days: {
              create: Array.from({ length: 7 }, (_, dow) => ({
                id: createId(),
                dayOfWeek: dow,
                ...(dow === input.dayOfWeek && input.programId ? { programId: input.programId } : {}),
              })),
            },
          },
          include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
        })
      }

      const day = existing.days.find(d => d.dayOfWeek === input.dayOfWeek)
      if (day) {
        await ctx.prisma.weekScheduleDay.update({
          where: { id: day.id },
          data: { programId: input.programId },
        })
      } else {
        await ctx.prisma.weekScheduleDay.create({
          data: {
            id: createId(),
            weekScheduleId: existing.id,
            dayOfWeek: input.dayOfWeek,
            programId: input.programId,
          },
        })
      }

      return ctx.prisma.weekSchedule.findUnique({
        where: { id: existing.id },
        include: { days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } } },
      })
    }),

  /**
   * Kopieer alle days van bron-week naar één of meerdere doel-weken voor
   * dezelfde patient. Maakt nieuwe WeekSchedule-records aan, of overschrijft
   * bestaande ones met dezelfde weekNumber.
   */
  copyWeek: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      fromWeekNumber: z.number().int().min(1),
      toWeekNumbers: z.array(z.number().int().min(1)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)

      const source = await ctx.prisma.weekSchedule.findFirst({
        where: {
          creatorId: ctx.user.id,
          patientId: input.patientId,
          weekNumber: input.fromWeekNumber,
        },
        include: { days: true },
      })
      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Week ${input.fromWeekNumber} bestaat niet voor deze patient`,
        })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { name: true, email: true },
      })
      const label = patient?.name ?? patient?.email ?? 'Patient'

      const targets = input.toWeekNumbers.filter(n => n !== input.fromWeekNumber)
      let created = 0

      for (const wn of targets) {
        const existing = await ctx.prisma.weekSchedule.findFirst({
          where: { creatorId: ctx.user.id, patientId: input.patientId, weekNumber: wn },
        })
        if (existing) {
          // Overschrijf: clear days, herinsert
          await ctx.prisma.weekScheduleDay.deleteMany({ where: { weekScheduleId: existing.id } })
          await ctx.prisma.weekSchedule.update({
            where: { id: existing.id },
            data: {
              days: {
                create: source.days.map(d => ({
                  id: createId(),
                  dayOfWeek: d.dayOfWeek,
                  programId: d.programId,
                })),
              },
            },
          })
        } else {
          await ctx.prisma.weekSchedule.create({
            data: {
              id: createId(),
              name: `Weekplan · ${label} · week ${wn}`,
              creatorId: ctx.user.id,
              practiceId: ctx.user.practiceId ?? null,
              patientId: input.patientId,
              startDate: source.startDate ?? new Date(),
              isTemplate: false,
              weekNumber: wn,
              days: {
                create: source.days.map(d => ({
                  id: createId(),
                  dayOfWeek: d.dayOfWeek,
                  programId: d.programId,
                })),
              },
            },
          })
        }
        created++
      }

      return { copied: created }
    }),

  /**
   * Volledige details van één SessionLog — voor de detail-popup in
   * de week-planner. Inclusief exerciseLogs + namen van de oefeningen.
   */
  sessionDetails: therapistProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.sessionLog.findUnique({
        where: { id: input.sessionId },
        include: {
          program: { select: { id: true, name: true } },
          exerciseLogs: {
            select: {
              id: true,
              exerciseId: true,
              setsCompleted: true,
              repsCompleted: true,
              duration: true,
              weight: true,
              painLevel: true,
              painDuring: true,
              notes: true,
            },
          },
        },
      })
      if (!session) throw new TRPCError({ code: 'NOT_FOUND' })
      // Authz: sessie moet bij een patient horen waar deze therapeut
      // toegang toe heeft.
      await assertPatientLink(ctx.prisma, ctx.user, session.patientId)

      // ExerciseLog heeft geen Prisma-relatie naar Exercise — fetch in
      // één extra query en merge in.
      const exerciseIds = [...new Set(session.exerciseLogs.map(l => l.exerciseId))]
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true, category: true },
          })
        : []
      const byId = new Map(exercises.map(e => [e.id, e]))

      return {
        ...session,
        exerciseLogs: session.exerciseLogs.map(log => ({
          ...log,
          exercise: byId.get(log.exerciseId) ?? { name: 'Onbekende oefening', category: 'STRENGTH' },
        })),
      }
    }),

  /**
   * Geeft de vroegste activiteit (SessionLog) van een patient terug.
   * Gebruikt om de anchor-datum voor week 1 te kiezen — zonder dit zou
   * de week-planner alleen 'deze week' tonen voor patienten zonder
   * Program of WeekSchedule.
   */
  firstActivityDate: therapistProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)
      const session = await ctx.prisma.sessionLog.findFirst({
        where: { patientId: input.patientId },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      })
      return { date: session?.scheduledAt ?? null }
    }),

  /**
   * Alle SessionLogs binnen een datum-range (Ma..Zo van een specifieke
   * behandel-week). Voor de week-planner zodat we per dag kunnen tonen
   * wat gepland was, wat afgerond is, en welke eigen workouts erbij
   * gedaan zijn.
   */
  sessionsInRange: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      from: z.string(), // ISO timestamp — start van de week (Ma 00:00 local)
      to: z.string(),   // ISO timestamp — exclusive einde (volgende Ma 00:00 local)
    }))
    .query(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)
      const fromDate = new Date(input.from)
      const toDate = new Date(input.to)

      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: input.patientId,
          // lt (exclusive) op `to` — frontend stuurt volgende Ma 00:00,
          // dus alle Zo-sessies (ook 23:59) zitten erin. Geen server-side
          // setHours die alsnog TZ-fouten introduceert.
          scheduledAt: { gte: fromDate, lt: toDate },
        },
        select: {
          id: true,
          scheduledAt: true,
          completedAt: true,
          status: true,
          duration: true,
          programId: true,
          program: { select: { id: true, name: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      })

      return sessions.map(s => {
        const d = new Date(s.scheduledAt)
        const weekdayIndex = (d.getDay() + 6) % 7 // 0=Ma..6=Zo
        return {
          id: s.id,
          scheduledAt: s.scheduledAt,
          completedAt: s.completedAt,
          status: s.status,
          duration: s.duration,
          programId: s.programId,
          programName: s.program?.name ?? null,
          weekdayIndex,
        }
      })
    }),

  /**
   * Recent gelogde quick-workouts van een patient (SessionLog met
   * programId IS NULL). Voor de week-planner-overview zodat ad-hoc
   * trainingen ook zichtbaar zijn naast de geplande programma's.
   */
  recentExtraSessions: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      days: z.number().int().min(1).max(120).default(30),
    }))
    .query(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: {
          patientId: input.patientId,
          programId: null,
          scheduledAt: { gte: since },
        },
        select: {
          id: true,
          scheduledAt: true,
          completedAt: true,
          status: true,
          duration: true,
          exerciseLogs: {
            select: { exerciseId: true },
            take: 1,
          },
        },
        orderBy: { scheduledAt: 'desc' },
      })
      // Map naar weekday-index (0=Ma..6=Zo) zodat de UI direct kan groeperen
      return sessions.map(s => {
        const d = new Date(s.scheduledAt)
        // JS getDay: 0=Sun..6=Sat — converteer naar 0=Mon..6=Sun
        const weekdayIndex = (d.getDay() + 6) % 7
        return {
          id: s.id,
          scheduledAt: s.scheduledAt,
          completedAt: s.completedAt,
          status: s.status,
          duration: s.duration,
          weekdayIndex,
          hasExercises: s.exerciseLogs.length > 0,
        }
      })
    }),

  /**
   * Verwijder één weekNumber voor een patient.
   */
  deleteWeek: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      weekNumber: z.number().int().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)
      const existing = await ctx.prisma.weekSchedule.findFirst({
        where: {
          creatorId: ctx.user.id,
          patientId: input.patientId,
          weekNumber: input.weekNumber,
        },
      })
      if (!existing) return { deleted: false }
      await ctx.prisma.weekSchedule.delete({ where: { id: existing.id } })
      return { deleted: true }
    }),

  // Patient: get their assigned week schedule
  mySchedule: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.weekSchedule.findFirst({
        where: { patientId: ctx.user!.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          days: {
            include: {
              program: {
                include: {
                  exercises: {
                    include: { exercise: { select: { id: true, name: true, category: true, videoUrl: true } } },
                    orderBy: [{ week: 'asc' }, { day: 'asc' }, { order: 'asc' }],
                  },
                },
              },
            },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      })
    }),

  /**
   * Plan een programma in de kalender van een patient voor X weken op bepaalde dagen.
   * Merged met bestaande schedule: overschrijft de geselecteerde dagen, laat andere dagen
   * intact. Als er nog geen schedule bestaat voor de patient, wordt er eentje aangemaakt.
   */
  scheduleProgram: therapistProcedure
    .input(
      z.object({
        programId: z.string(),
        patientId: z.string(),
        weeks: z.number().int().min(1).max(52),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check ownership van programma
      const program = await ctx.prisma.program.findUnique({
        where: { id: input.programId },
      })
      if (!program) throw new TRPCError({ code: 'NOT_FOUND', message: 'Programma niet gevonden' })
      if (program.creatorId !== ctx.user.id && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      // Check dat patient gekoppeld is aan deze therapist
      const relation = await ctx.prisma.patientTherapist.findFirst({
        where: { therapistId: ctx.user.id, patientId: input.patientId, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
      })
      if (!relation) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Patient is niet aan jou gekoppeld' })
      }

      const patient = await ctx.prisma.user.findUnique({
        where: { id: input.patientId },
        select: { name: true, email: true },
      })

      const now = new Date()
      const endDate = new Date(now.getTime() + input.weeks * 7 * 24 * 60 * 60 * 1000)

      // Zoek bestaande schedule (per therapist + patient)
      const existing = await ctx.prisma.weekSchedule.findFirst({
        where: { creatorId: ctx.user.id, patientId: input.patientId },
        include: { days: true },
      })

      const uniqueDays = Array.from(new Set(input.daysOfWeek))

      if (existing) {
        // Merge: update/insert dagen voor dit programma, laat andere dagen ongemoeid
        // (behalve dagen die voorheen dit programma hadden maar nu niet meer geselecteerd zijn)
        const existingDayMap = new Map(existing.days.map(d => [d.dayOfWeek, d]))

        // Verwijder dagen die voorheen dit programma hadden maar nu niet meer in selectie
        const toClear = existing.days.filter(
          d => d.programId === input.programId && !uniqueDays.includes(d.dayOfWeek),
        )
        for (const d of toClear) {
          await ctx.prisma.weekScheduleDay.update({
            where: { id: d.id },
            data: { programId: null },
          })
        }

        // Zet geselecteerde dagen op dit programma
        for (const dow of uniqueDays) {
          const existingDay = existingDayMap.get(dow)
          if (existingDay) {
            await ctx.prisma.weekScheduleDay.update({
              where: { id: existingDay.id },
              data: { programId: input.programId },
            })
          } else {
            await ctx.prisma.weekScheduleDay.create({
              data: {
                id: createId(),
                weekScheduleId: existing.id,
                dayOfWeek: dow,
                programId: input.programId,
              },
            })
          }
        }

        return ctx.prisma.weekSchedule.update({
          where: { id: existing.id },
          data: {
            startDate: existing.startDate ?? now,
            endDate,
            updatedAt: now,
          },
          include: {
            days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } },
          },
        })
      }

      // Nieuwe schedule aanmaken met 7 dagen
      const patientLabel = patient?.name ?? patient?.email ?? 'Patient'
      return ctx.prisma.weekSchedule.create({
        data: {
          id: createId(),
          name: `Weekplan · ${patientLabel}`,
          creatorId: ctx.user.id,
          practiceId: ctx.user.practiceId ?? null,
          patientId: input.patientId,
          startDate: now,
          endDate,
          isTemplate: false,
          days: {
            create: Array.from({ length: 7 }, (_, dow) => ({
              id: createId(),
              dayOfWeek: dow,
              ...(uniqueDays.includes(dow) ? { programId: input.programId } : {}),
            })),
          },
        },
        include: {
          days: { include: { program: { select: { id: true, name: true } } }, orderBy: { dayOfWeek: 'asc' } },
        },
      })
    }),

  // ─── Multi-workout per dag — fase 2 procedures ─────────────────────────────
  // Werken bovenop het nieuwe WeekScheduleDayItem-model. De legacy
  // WeekScheduleDay.programId blijft behouden (set door create/save) en zal
  // pas in fase 5 verwijderd worden zodat de patient-app niet breekt.
  //
  // Backwards-compat: bij elke item-mutation roepen we `syncDayProgramId`
  // aan zodat WeekScheduleDay.programId altijd gelijk staat aan het EERSTE
  // program-gekoppelde item op die dag (op order). Patient-app + iOS blijven
  // dus werken zonder code-aanpassingen — multi-workouts worden voor hen
  // gezien als alleen het eerste programma. Wordt verwijderd in fase 5 zodra
  // alle consumers naar items[] zijn gemigreerd.

  /**
   * Geeft week-schedules met items[] EXTRA (naast legacy programId per dag).
   * UI-laag mapt later van programId naar items voor de oude shape; nieuwe UI
   * gebruikt items[] direct.
   */
  listWithItems: therapistProcedure
    .input(z.object({ patientId: z.string().optional(), isTemplate: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'ADMIN'
      const practiceId = ctx.user.practiceId
      const ownership = isAdmin
        ? {}
        : practiceId
          ? { OR: [{ creatorId: ctx.user.id }, { practiceId }] }
          : { creatorId: ctx.user.id }
      return ctx.prisma.weekSchedule.findMany({
        where: {
          ...ownership,
          ...(input?.patientId !== undefined ? { patientId: input.patientId } : {}),
          ...(input?.isTemplate !== undefined ? { isTemplate: input.isTemplate } : {}),
        },
        include: {
          patient: { select: { id: true, name: true, email: true } },
          days: {
            include: {
              program: { select: { id: true, name: true } },
              items: {
                include: { program: { select: { id: true, name: true, status: true } } },
                orderBy: { order: 'asc' },
              },
            },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
        orderBy: [{ patientId: 'asc' }, { weekNumber: 'asc' }],
      })
    }),

  /**
   * Voeg een item toe aan een dag. Twee varianten:
   *   - { programId } → koppeling aan bestaand programma
   *   - { quickCategory, quickName, quickDurationSec } → losse snelle workout
   * Server bepaalt `order` automatisch (laatste positie binnen die dag).
   * Authorisatie: alleen owner van het schedule of ADMIN of zelfde-praktijk.
   */
  addItem: therapistProcedure
    .input(z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('program'),
        dayId: z.string(),
        programId: z.string(),
        notes: z.string().nullable().optional(),
      }),
      z.object({
        kind: z.literal('quick'),
        dayId: z.string(),
        quickCategory: z.enum(['STRENGTH', 'MOBILITY', 'PLYOMETRICS', 'CARDIO', 'STABILITY']),
        quickName: z.string().min(1).max(120),
        quickDurationSec: z.number().int().positive().max(60 * 60 * 12),  // max 12u
        notes: z.string().nullable().optional(),
      }),
    ]))
    .mutation(async ({ ctx, input }) => {
      const day = await ctx.prisma.weekScheduleDay.findUnique({
        where: { id: input.dayId },
        include: { weekSchedule: { select: { creatorId: true, practiceId: true } } },
      })
      if (!day) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = day.weekSchedule.creatorId === ctx.user.id
      const isSamePractice =
        !!ctx.user.practiceId &&
        !!day.weekSchedule.practiceId &&
        day.weekSchedule.practiceId === ctx.user.practiceId
      if (!isAdmin && !isOwner && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const last = await ctx.prisma.weekScheduleDayItem.findFirst({
        where: { dayId: input.dayId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const nextOrder = last ? last.order + 1 : 0
      const created = await ctx.prisma.weekScheduleDayItem.create({
        data: input.kind === 'program'
          ? {
              dayId: input.dayId,
              order: nextOrder,
              programId: input.programId,
              notes: input.notes ?? null,
            }
          : {
              dayId: input.dayId,
              order: nextOrder,
              quickCategory: input.quickCategory,
              quickName: input.quickName,
              quickDurationSec: input.quickDurationSec,
              notes: input.notes ?? null,
            },
        include: {
          program: { select: { id: true, name: true, status: true } },
        },
      })
      await syncDayProgramId(ctx.prisma, input.dayId)
      return created
    }),

  /** Velden van een item bewerken (naam, duur, notes, order). */
  updateItem: therapistProcedure
    .input(z.object({
      id: z.string(),
      quickName: z.string().min(1).max(120).optional(),
      quickDurationSec: z.number().int().positive().max(60 * 60 * 12).optional(),
      notes: z.string().nullable().optional(),
      order: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.weekScheduleDayItem.findUnique({
        where: { id: input.id },
        include: { day: { include: { weekSchedule: { select: { creatorId: true, practiceId: true } } } } },
      })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = item.day.weekSchedule.creatorId === ctx.user.id
      const isSamePractice =
        !!ctx.user.practiceId &&
        !!item.day.weekSchedule.practiceId &&
        item.day.weekSchedule.practiceId === ctx.user.practiceId
      if (!isAdmin && !isOwner && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      const { id, ...patch } = input
      return ctx.prisma.weekScheduleDayItem.update({
        where: { id },
        data: patch,
      })
    }),

  /** Item verwijderen. */
  removeItem: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.weekScheduleDayItem.findUnique({
        where: { id: input.id },
        include: { day: { include: { weekSchedule: { select: { creatorId: true, practiceId: true } } } } },
      })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = item.day.weekSchedule.creatorId === ctx.user.id
      const isSamePractice =
        !!ctx.user.practiceId &&
        !!item.day.weekSchedule.practiceId &&
        item.day.weekSchedule.practiceId === ctx.user.practiceId
      if (!isAdmin && !isOwner && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.weekScheduleDayItem.delete({ where: { id: input.id } })
      await syncDayProgramId(ctx.prisma, item.day.id)
      return { ok: true }
    }),

  /**
   * Clear de legacy `programId` op een WeekScheduleDay. Voor backwards-compat
   * met dagen die nog niet door de nieuwe UI zijn aangeraakt: items[] is leeg
   * maar `day.programId` heeft een legacy waarde. Klik op X in de UI roept
   * deze procedure aan ipv removeItem.
   */
  clearLegacyDay: therapistProcedure
    .input(z.object({ dayId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const day = await ctx.prisma.weekScheduleDay.findUnique({
        where: { id: input.dayId },
        include: { weekSchedule: { select: { creatorId: true, practiceId: true } } },
      })
      if (!day) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isOwner = day.weekSchedule.creatorId === ctx.user.id
      const isSamePractice =
        !!ctx.user.practiceId &&
        !!day.weekSchedule.practiceId &&
        day.weekSchedule.practiceId === ctx.user.practiceId
      if (!isAdmin && !isOwner && !isSamePractice) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }
      await ctx.prisma.weekScheduleDay.update({
        where: { id: input.dayId },
        data: { programId: null },
      })
      return { ok: true }
    }),

  /**
   * Bulk-reorder items binnen een dag, of verplaats items naar een andere dag.
   * Input is een list van (itemId, dayId, order). UI gebruikt dit voor
   * drag-drop binnen een dag én tussen dagen.
   */
  reorderItems: therapistProcedure
    .input(z.object({
      moves: z.array(z.object({
        itemId: z.string(),
        dayId: z.string(),
        order: z.number().int().min(0),
      })).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      // Authorisatie via één lookup van alle betrokken schedules.
      const itemIds = input.moves.map(m => m.itemId)
      const items = await ctx.prisma.weekScheduleDayItem.findMany({
        where: { id: { in: itemIds } },
        include: { day: { include: { weekSchedule: { select: { id: true, creatorId: true, practiceId: true } } } } },
      })
      if (items.length !== itemIds.length) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      for (const it of items) {
        const isOwner = it.day.weekSchedule.creatorId === ctx.user.id
        const isSamePractice =
          !!ctx.user.practiceId &&
          !!it.day.weekSchedule.practiceId &&
          it.day.weekSchedule.practiceId === ctx.user.practiceId
        if (!isAdmin && !isOwner && !isSamePractice) {
          throw new TRPCError({ code: 'FORBIDDEN' })
        }
      }
      // Transactie: alle moves atomisch toepassen.
      await ctx.prisma.$transaction(
        input.moves.map(m =>
          ctx.prisma.weekScheduleDayItem.update({
            where: { id: m.itemId },
            data: { dayId: m.dayId, order: m.order },
          })
        )
      )
      // Sync legacy programId voor alle dagen die door de moves zijn geraakt
      // (zowel bron als doel). Backwards-compat met patient-app.
      const touchedDayIds = new Set<string>()
      for (const it of items) touchedDayIds.add(it.dayId)
      for (const m of input.moves) touchedDayIds.add(m.dayId)
      for (const dayId of touchedDayIds) {
        await syncDayProgramId(ctx.prisma, dayId)
      }
      return { ok: true }
    }),

  /**
   * Dupliceer alle items van bron-week naar doel-week voor dezelfde patient.
   * Maakt automatisch een doel-WeekSchedule + dagen aan als die nog niet bestaan
   * (gemodelleerd op het bron-schema's name/description).
   * Doel-week behoudt eigen bestaande items NIET — wordt vervangen indien `replace=true`,
   * anders wordt er een 409 teruggegeven als doel niet leeg is.
   */
  duplicateWeek: therapistProcedure
    .input(z.object({
      patientId: z.string(),
      sourceWeekNumber: z.number().int().min(1),
      targetWeekNumber: z.number().int().min(1),
      replace: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceWeekNumber === input.targetWeekNumber) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bron en doel zijn gelijk' })
      }
      await assertPatientLink(ctx.prisma, ctx.user, input.patientId)

      // Scope source + target lookup tot week-schema's die deze user mag
      // aanraken: eigen (creatorId=me), zelfde praktijk, of admin (overal).
      // Zonder deze filter zou een mede-behandelende therapeut per ongeluk
      // een collega's week-schema kunnen overschrijven (vooral met
      // replace=true → deleteMany op de gevonden target).
      const isAdmin = ctx.user.role === 'ADMIN'
      const practiceId = ctx.user.practiceId ?? null
      const accessibleScopeFilter = isAdmin
        ? {}
        : {
            OR: [
              { creatorId: ctx.user.id },
              ...(practiceId ? [{ practiceId }] : []),
            ],
          }

      const source = await ctx.prisma.weekSchedule.findFirst({
        where: {
          patientId: input.patientId,
          weekNumber: input.sourceWeekNumber,
          isTemplate: false,
          ...accessibleScopeFilter,
        },
        include: {
          days: { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { dayOfWeek: 'asc' } },
        },
      })
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Bron-week niet gevonden' })

      let target = await ctx.prisma.weekSchedule.findFirst({
        where: {
          patientId: input.patientId,
          weekNumber: input.targetWeekNumber,
          isTemplate: false,
          ...accessibleScopeFilter,
        },
        include: { days: { include: { items: true } } },
      })

      // Als doel-week bestaat met content → afhankelijk van `replace`.
      if (target) {
        const hasContent = target.days.some(d => d.items.length > 0 || d.programId !== null)
        if (hasContent && !input.replace) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Doel-week bevat al items. Stel replace=true om te overschrijven.',
          })
        }
        // Wis alle bestaande items op alle dagen.
        await ctx.prisma.weekScheduleDayItem.deleteMany({
          where: { day: { weekScheduleId: target.id } },
        })
      } else {
        // Maak een nieuwe doel-week aan (kopie van source-naam + 7 dagen leeg).
        target = await ctx.prisma.weekSchedule.create({
          data: {
            id: createId(),
            name: source.name,
            description: source.description,
            patientId: input.patientId,
            isTemplate: false,
            weekNumber: input.targetWeekNumber,
            creatorId: ctx.user.id,
            practiceId: ctx.user.practiceId ?? null,
            days: {
              create: Array.from({ length: 7 }, (_, i) => ({
                id: createId(),
                dayOfWeek: i,
              })),
            },
          },
          include: { days: { include: { items: true } } },
        })
      }

      // Map source.dayOfWeek → target.day.id voor item-create.
      const targetDayMap = new Map(target.days.map(d => [d.dayOfWeek, d.id]))

      // Bouw item-creates op uit source.
      const creates: Array<{
        dayId: string; order: number;
        programId?: string | null;
        quickCategory?: 'STRENGTH' | 'MOBILITY' | 'PLYOMETRICS' | 'CARDIO' | 'STABILITY' | null;
        quickName?: string | null;
        quickDurationSec?: number | null;
        notes?: string | null;
      }> = []
      for (const sDay of source.days) {
        const tDayId = targetDayMap.get(sDay.dayOfWeek)
        if (!tDayId) continue
        for (const it of sDay.items) {
          creates.push({
            dayId: tDayId,
            order: it.order,
            programId: it.programId,
            quickCategory: it.quickCategory ?? null,
            quickName: it.quickName,
            quickDurationSec: it.quickDurationSec,
            notes: it.notes,
          })
        }
      }
      if (creates.length > 0) {
        await ctx.prisma.weekScheduleDayItem.createMany({ data: creates })
      }
      // Sync legacy programId voor alle doel-dagen na de bulk create.
      for (const td of target.days) {
        await syncDayProgramId(ctx.prisma, td.id)
      }
      return { targetWeekScheduleId: target.id, copied: creates.length }
    }),
})
