/**
 * Berichten tussen patiënt/atleet en behandelend therapeut(en).
 *
 * Model: één draad per patiënt. Toegang volgt hetzelfde multi-tenant-model als
 * de rest van de patiënt-data: de patiënt zelf, therapeuten met een directe
 * PatientTherapist-relatie, of collega's in dezelfde praktijk. `authorId` legt
 * vast wie wat schreef (audit-trail); `fromPatient` maakt ongelezen-tellingen
 * per kant mogelijk.
 *
 * Een bericht kan gekoppeld zijn aan een gelogde sessie en/of een oefening
 * ("vond deze echt zwaar" bij de deadlift van week 3) — de client rendert die
 * koppeling als context-kaartje boven het bericht.
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from '@/server/trpc'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import type { PrismaClient } from '@prisma/client'

type SessionUserLite = { id: string; role: string; practiceId: string | null }

/**
 * Bepaal wiens draad de caller mag zien/beschrijven. Patiënt/atleet: alleen de
 * eigen draad. Therapeut/admin: draad van een toegankelijke patiënt.
 */
async function resolveThreadPatient(
  prisma: Pick<PrismaClient, 'user'>,
  user: SessionUserLite,
  patientId: string | undefined,
): Promise<string> {
  if (!patientId || patientId === user.id) return user.id
  if (user.role !== 'THERAPIST' && user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  if (user.role === 'ADMIN') return patientId
  // Zelfde toegangsmodel als hasPatientAccess in patients.ts.
  const found = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        {
          patientTherapists: {
            some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
          },
        },
        ...(user.practiceId ? [{ practiceId: user.practiceId }] : []),
      ],
    },
    select: { id: true },
  })
  if (!found) throw new TRPCError({ code: 'FORBIDDEN' })
  return patientId
}

const messageSelect = {
  id: true,
  patientId: true,
  authorId: true,
  body: true,
  fromPatient: true,
  readAt: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
  exercise: { select: { id: true, name: true } },
  sessionLog: {
    select: {
      id: true,
      completedAt: true,
      scheduledAt: true,
      program: { select: { name: true } },
    },
  },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessage(m: any) {
  return {
    id: m.id as string,
    authorId: m.authorId as string,
    authorName: (m.author?.name as string | null) ?? null,
    authorRole: m.author?.role as string,
    fromPatient: m.fromPatient as boolean,
    body: m.body as string,
    readAt: m.readAt ? (m.readAt as Date).toISOString() : null,
    createdAt: (m.createdAt as Date).toISOString(),
    exercise: m.exercise ? { id: m.exercise.id as string, name: m.exercise.name as string } : null,
    session: m.sessionLog
      ? {
          id: m.sessionLog.id as string,
          completedAt: ((m.sessionLog.completedAt ?? m.sessionLog.scheduledAt) as Date).toISOString(),
          programName: (m.sessionLog.program?.name as string | null) ?? null,
        }
      : null,
  }
}

export const messagesRouter = createTRPCRouter({
  // ── Draad ophalen (nieuwste 200, oplopend gesorteerd) ─────────────────────
  thread: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const patientId = await resolveThreadPatient(ctx.prisma, ctx.user, input?.patientId)
      const rows = await ctx.prisma.message.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: messageSelect,
      })
      return rows.reverse().map(mapMessage)
    }),

  // ── Bericht sturen ─────────────────────────────────────────────────────────
  send: protectedProcedure
    .input(z.object({
      patientId: z.string().optional(),
      body: z.string().trim().min(1).max(2000),
      sessionLogId: z.string().optional(),
      exerciseId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rl = await rateLimit('messages.send', ctx.user.id, RATE_LIMITS.messageSend)
      if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })

      const patientId = await resolveThreadPatient(ctx.prisma, ctx.user, input.patientId)

      // Gekoppelde sessie moet van deze patiënt zijn — anders lekt een
      // willekeurig sessionLogId andermans sessie-context de draad in.
      if (input.sessionLogId) {
        const session = await ctx.prisma.sessionLog.findFirst({
          where: { id: input.sessionLogId, patientId },
          select: { id: true },
        })
        if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sessie niet gevonden.' })
      }
      if (input.exerciseId) {
        const exercise = await ctx.prisma.exercise.findUnique({
          where: { id: input.exerciseId },
          select: { id: true },
        })
        if (!exercise) throw new TRPCError({ code: 'NOT_FOUND', message: 'Oefening niet gevonden.' })
      }

      const created = await ctx.prisma.message.create({
        data: {
          patientId,
          authorId: ctx.user.id,
          fromPatient: ctx.user.id === patientId,
          body: input.body,
          sessionLogId: input.sessionLogId ?? null,
          exerciseId: input.exerciseId ?? null,
        },
        select: messageSelect,
      })
      return mapMessage(created)
    }),

  // ── Draad als gelezen markeren (de berichten van de ándere kant) ──────────
  markRead: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const patientId = await resolveThreadPatient(ctx.prisma, ctx.user, input?.patientId)
      const iAmPatient = ctx.user.id === patientId
      await ctx.prisma.message.updateMany({
        where: { patientId, fromPatient: !iAmPatient, readAt: null },
        data: { readAt: new Date() },
      })
      return { ok: true }
    }),

  // ── Ongelezen-teller voor de eigen draad (patiënt/atleet) ─────────────────
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.message.count({
      where: { patientId: ctx.user.id, fromPatient: false, readAt: null },
    })
  }),

  // ── Therapeut-inbox: draden met laatste bericht + ongelezen-telling ───────
  inbox: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'THERAPIST' && ctx.user.role !== 'ADMIN') {
      throw new TRPCError({ code: 'FORBIDDEN' })
    }
    const accessiblePatient =
      ctx.user.role === 'ADMIN'
        ? {}
        : {
            patient: {
              OR: [
                {
                  patientTherapists: {
                    some: { therapistId: ctx.user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] as never } },
                  },
                },
                ...(ctx.user.practiceId ? [{ practiceId: ctx.user.practiceId }] : []),
              ],
            },
          }

    // Recentste berichten eerst; eerste per patiënt = de draad-preview.
    const recent = await ctx.prisma.message.findMany({
      where: accessiblePatient,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        patientId: true,
        body: true,
        fromPatient: true,
        createdAt: true,
        patient: { select: { id: true, name: true, email: true } },
      },
    })
    const threads = new Map<string, {
      patientId: string
      patientName: string
      lastBody: string
      lastFromPatient: boolean
      lastAt: Date
    }>()
    for (const m of recent) {
      if (threads.has(m.patientId)) continue
      threads.set(m.patientId, {
        patientId: m.patientId,
        patientName: m.patient.name ?? m.patient.email,
        lastBody: m.body,
        lastFromPatient: m.fromPatient,
        lastAt: m.createdAt,
      })
    }
    if (threads.size === 0) return []

    const unread = await ctx.prisma.message.groupBy({
      by: ['patientId'],
      where: {
        patientId: { in: [...threads.keys()] },
        fromPatient: true,
        readAt: null,
      },
      _count: { _all: true },
    })
    const unreadByPatient = new Map(unread.map(u => [u.patientId, u._count._all]))

    return [...threads.values()]
      .sort((a, b) => +b.lastAt - +a.lastAt)
      .map(t => ({
        patientId: t.patientId,
        patientName: t.patientName,
        lastBody: t.lastBody,
        lastFromPatient: t.lastFromPatient,
        lastAt: t.lastAt.toISOString(),
        unread: unreadByPatient.get(t.patientId) ?? 0,
      }))
  }),

  // ── Ongelezen-totaal voor de therapeut (sidebar-badge) ────────────────────
  unreadTotal: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'THERAPIST' && ctx.user.role !== 'ADMIN') return 0
    return ctx.prisma.message.count({
      where: {
        fromPatient: true,
        readAt: null,
        ...(ctx.user.role === 'ADMIN'
          ? {}
          : {
              patient: {
                OR: [
                  {
                    patientTherapists: {
                      some: { therapistId: ctx.user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] as never } },
                    },
                  },
                  ...(ctx.user.practiceId ? [{ practiceId: ctx.user.practiceId }] : []),
                ],
              },
            }),
      },
    })
  }),

  // ── Context-kiezer: recente sessies + oefeningen om aan te koppelen ───────
  recentContext: protectedProcedure
    .input(z.object({ patientId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const patientId = await resolveThreadPatient(ctx.prisma, ctx.user, input?.patientId)
      const sessions = await ctx.prisma.sessionLog.findMany({
        where: { patientId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          completedAt: true,
          scheduledAt: true,
          program: { select: { name: true } },
          exerciseLogs: { select: { exerciseId: true } },
        },
      })
      const exerciseIds = [...new Set(sessions.flatMap(s => s.exerciseLogs.map(e => e.exerciseId)))]
      const exercises = exerciseIds.length
        ? await ctx.prisma.exercise.findMany({
            where: { id: { in: exerciseIds } },
            select: { id: true, name: true },
          })
        : []
      const nameById = new Map(exercises.map(e => [e.id, e.name]))
      return sessions.map(s => ({
        id: s.id,
        completedAt: (s.completedAt ?? s.scheduledAt).toISOString(),
        programName: s.program?.name ?? null,
        exercises: [...new Set(s.exerciseLogs.map(e => e.exerciseId))]
          .map(id => ({ id, name: nameById.get(id) ?? 'Oefening' }))
          .filter(e => e.name !== 'Oefening' || nameById.has(e.id)),
      }))
    }),
})
