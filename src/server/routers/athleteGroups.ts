import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { PrismaClient } from '@prisma/client'
import { createTRPCRouter, coachStaffProcedure, protectedProcedure, publicProcedure } from '@/server/trpc'
import { auditLog } from '@/server/audit'
import { rateLimit, RATE_LIMITS } from '@/server/ratelimit'
import { groupAddedMail, groupLeftMail, sendMail } from '@/server/mail'
import { resolveSender } from '@/server/email/sender'
import { signLink, verifyLink } from '@/server/lib/signed-link'
import { getAppUrl } from '@/lib/app-url'
import { assertGroupRole, groupsWhereForUser, type GroupRole } from '@/server/lib/group-access'
import { planVerzending, type GroepsWeek, type LidWeek } from '@/server/lib/group-send'
import { assertNotDischarged } from '@/server/lib/care-guard'
import { notifyNewSchedule } from '@/server/push/notify'
import { copyItemToDay, COPY_ITEM_INCLUDE } from './weekSchedules'
import { mondayKeyOf, addDaysKey, amsMidnight, dateKey, isDateKey } from '@/lib/week-dates'
import { beoordeelLid, sorteerRijen, tellers, type LidInvoer } from '@/lib/group-dashboard'
import { computeReadinessFor } from '@/server/readiness'
import { computeLoadCurve } from '@/server/load-curve'

const createId = () => crypto.randomUUID()
const rolEnum = z.enum(['VIEWER', 'PLANNER', 'MANAGER'])

/**
 * Atletengroepen: verzendlijst plus één gedeelde kalender (week_schedules met
 * groupId). Rechten per rol staan in lib/group-access.ts; elke procedure
 * dwingt zijn minimum af op de server, de UI verbergt alleen knoppen.
 */

/** Mag deze staf dit lid toevoegen? Coach: directe koppeling; therapeut: eigen patiënt of praktijk. */
async function assertLidKoppeling(prisma: PrismaClient, user: { id: string; role: string; practiceId: string | null }, patientId: string) {
  if (user.role === 'ADMIN') return
  const viaPractice = user.role === 'THERAPIST' && user.practiceId ? [{ practiceId: user.practiceId }] : []
  const ok = await prisma.user.findFirst({
    where: {
      id: patientId,
      OR: [
        { patientTherapists: { some: { therapistId: user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } } } },
        ...viaPractice,
      ],
    },
    select: { id: true },
  })
  if (!ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'Geen actieve koppeling met deze atleet' })
}

/**
 * Lid uit de groep. Eén helper voor de staf (`removeMember`), het lid zelf
 * (`leave`) en de knop in de mail (`leaveByToken`): lidmaatschap weg, de al
 * verstuurde trainingen blijven staan zonder groepsverwijzing.
 */
async function verwijderLid(prisma: PrismaClient, groupId: string, patientId: string) {
  await prisma.$transaction([
    prisma.athleteGroupMember.deleteMany({ where: { groupId, patientId } }),
    prisma.weekScheduleDayItem.updateMany({
      where: { groupId, day: { weekSchedule: { patientId } } },
      data: { groupId: null, sourceItemId: null },
    }),
  ])
}

function naamVan(u: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email || 'Je coach'
}

const eigenaarSelect = { select: { email: true, firstName: true, lastName: true, name: true, role: true } } as const

/** De eigenaar hoort het als een lid zelf uit de groep stapt. Nooit blokkerend. */
async function meldVertrekAanEigenaar(prisma: PrismaClient, groupId: string, lidNaam: string) {
  try {
    const g = await prisma.athleteGroup.findUnique({ where: { id: groupId }, select: { name: true, owner: eigenaarSelect } })
    if (!g) return
    const portaal = g.owner.role === 'COACH' ? '/coach/groups' : '/therapist/groups'
    const mail = groupLeftMail({
      ownerName: naamVan(g.owner),
      memberName: lidNaam,
      groupName: g.name,
      groupUrl: `${getAppUrl()}${portaal}/${groupId}`,
    })
    mail.to = g.owner.email
    const r = await sendMail(mail)
    if (!r.ok) console.warn('[groups] vertrekmail niet verstuurd', { groupId, error: r.error })
  } catch (err) {
    console.warn('[groups] vertrekmail mislukt', { groupId, error: (err as Error).message })
  }
}

const groepSelect = {
  id: true, name: true, planName: true, description: true, ownerId: true,
  startDate: true, endDate: true, lastSentAt: true, createdAt: true,
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { members: true, schedules: true } },
} as const

export const athleteGroupsRouter = createTRPCRouter({
  /** Mijn groepen (staf of eigenaar; admin alles) met ledenaantal en rol. */
  list: coachStaffProcedure.query(async ({ ctx }) => {
    const groepen = await ctx.prisma.athleteGroup.findMany({
      where: groupsWhereForUser(ctx.user),
      select: { ...groepSelect, staff: { where: { userId: ctx.user.id }, select: { role: true } } },
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
    })
    return groepen.map(g => ({
      ...g,
      // Admin zonder stafrij kijkt mee als VIEWER.
      role: (g.staff[0]?.role ?? 'VIEWER') as GroupRole,
      memberCount: g._count.members,
      weekCount: g._count.schedules,
    }))
  }),

  get: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const mijn = await assertGroupRole(ctx.prisma, ctx.user, input.id, 'VIEWER')
      const g = await ctx.prisma.athleteGroup.findUniqueOrThrow({
        where: { id: input.id },
        select: {
          ...groepSelect,
          members: {
            select: {
              id: true, patientId: true, note: true, addedAt: true, lastSentAt: true,
              patient: { select: { id: true, name: true, email: true } },
            },
            orderBy: { addedAt: 'asc' },
          },
          staff: {
            select: { id: true, userId: true, role: true, addedAt: true, user: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { addedAt: 'asc' },
          },
        },
      })
      return { ...g, role: mijn.role, memberCount: g._count.members, weekCount: g._count.schedules }
    }),

  create: coachStaffProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(80),
      planName: z.string().trim().max(120).optional(),
      description: z.string().trim().max(500).optional(),
      /** Datumsleutel YYYY-MM-DD; wordt afgerond naar de maandag van die week. */
      startDate: z.string().refine(isDateKey, 'Ongeldige startdatum'),
      endDate: z.string().refine(isDateKey, 'Ongeldige einddatum').nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'COACH' && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Alleen een coach maakt een groep aan' })
      }
      const startKey = mondayKeyOf(amsMidnight(input.startDate))
      if (input.endDate && input.endDate < startKey) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'De einddatum ligt vóór de startdatum' })
      }
      const id = createId()
      await ctx.prisma.athleteGroup.create({
        data: {
          id,
          name: input.name,
          planName: input.planName || null,
          description: input.description || null,
          ownerId: ctx.user.id,
          startDate: amsMidnight(startKey),
          endDate: input.endDate ? amsMidnight(input.endDate) : null,
          staff: { create: { id: createId(), userId: ctx.user.id, role: 'OWNER' } },
        },
      })
      return { id }
    }),

  update: coachStaffProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(80).optional(),
      planName: z.string().trim().max(120).nullable().optional(),
      description: z.string().trim().max(500).nullable().optional(),
      startDate: z.string().refine(isDateKey, 'Ongeldige startdatum').optional(),
      endDate: z.string().refine(isDateKey, 'Ongeldige einddatum').nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.id, 'MANAGER')
      const { id, startDate, endDate, ...rest } = input
      await ctx.prisma.athleteGroup.update({
        where: { id },
        data: {
          ...rest,
          ...(startDate ? { startDate: amsMidnight(mondayKeyOf(amsMidnight(startDate))) } : {}),
          ...(endDate !== undefined ? { endDate: endDate ? amsMidnight(endDate) : null } : {}),
        },
      })
      return { ok: true }
    }),

  delete: coachStaffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.id, 'OWNER')
      // Kopieën bij de leden houden hun rij: de FK op items staat op SET NULL,
      // de groepskalender zelf cascadeert mee.
      await ctx.prisma.athleteGroup.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  addMembers: coachStaffProcedure
    .input(z.object({ groupId: z.string(), patientIds: z.array(z.string()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'MANAGER')
      for (const pid of input.patientIds) await assertLidKoppeling(ctx.prisma, ctx.user, pid)
      const bestaand = await ctx.prisma.athleteGroupMember.findMany({ where: { groupId: input.groupId }, select: { patientId: true } })
      const al = new Set(bestaand.map(b => b.patientId))
      const nieuw = input.patientIds.filter(p => !al.has(p))
      await ctx.prisma.athleteGroupMember.createMany({
        data: nieuw.map(patientId => ({ id: createId(), groupId: input.groupId, patientId })),
      })

      // Elk nieuw lid hoort het van ons: wie, welke groep, en één knop om er
      // weer uit te stappen. Een mail die niet aankomt laat het toevoegen
      // niet mislukken; het lid kan altijd nog via zijn profiel.
      let mailed = 0
      if (nieuw.length > 0) {
        const [groep, leden, actor] = await Promise.all([
          ctx.prisma.athleteGroup.findUnique({ where: { id: input.groupId }, select: { name: true, planName: true } }),
          ctx.prisma.athleteGroupMember.findMany({
            where: { groupId: input.groupId, patientId: { in: nieuw } },
            select: { id: true, patient: { select: { email: true, name: true } } },
          }),
          ctx.prisma.user.findUnique({
            where: { id: ctx.user.id },
            select: { firstName: true, lastName: true, name: true, jobTitle: true, email: true, practice: true },
          }),
        ])
        if (groep && actor) {
          const sender = resolveSender({ therapist: actor, practice: actor.practice ?? null })
          const byName = naamVan(actor)
          const uitkomsten = await Promise.allSettled(
            leden.map(async (lid) => {
              const mail = groupAddedMail({
                recipientName: lid.patient.name ?? lid.patient.email,
                groupName: groep.name,
                planName: groep.planName,
                byName,
                leaveUrl: `${getAppUrl()}/groep/verlaten/${signLink('group-leave', lid.id)}`,
                sender,
              })
              mail.to = lid.patient.email
              const r = await sendMail(mail)
              if (!r.ok) throw new Error(r.error ?? 'mail')
            }),
          )
          mailed = uitkomsten.filter((u) => u.status === 'fulfilled').length
          if (mailed < leden.length) console.warn('[groups] niet alle groepsmails verstuurd', { groupId: input.groupId, mislukt: leden.length - mailed })
        }
        await auditLog({
          event: 'GROUP_MEMBER_ADDED',
          userId: ctx.user.id,
          actorEmail: ctx.user.email,
          resource: 'AthleteGroup',
          resourceId: input.groupId,
          metadata: { added: nieuw.length, mailed },
          req: ctx.req,
        })
      }
      return { added: nieuw.length, mailed }
    }),

  removeMember: coachStaffProcedure
    .input(z.object({ groupId: z.string(), patientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'MANAGER')
      await verwijderLid(ctx.prisma, input.groupId, input.patientId)
      return { ok: true }
    }),

  // ── Het lid zelf ───────────────────────────────────────────────────────────

  /** Groepen waar ik zelf in zit, voor het profiel in app en portaal. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const rijen = await ctx.prisma.athleteGroupMember.findMany({
      where: { patientId: ctx.user.id },
      orderBy: { addedAt: 'desc' },
      select: {
        addedAt: true,
        group: { select: { id: true, name: true, planName: true, owner: { select: { firstName: true, lastName: true, name: true } } } },
      },
    })
    return rijen.map((r) => ({
      groupId: r.group.id,
      name: r.group.name,
      planName: r.group.planName,
      ownerName: naamVan(r.group.owner),
      addedAt: r.addedAt,
    }))
  }),

  /** Zelf uit een groep stappen. Raakt alleen het eigen lidmaatschap. */
  leave: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lid = await ctx.prisma.athleteGroupMember.findUnique({
        where: { groupId_patientId: { groupId: input.groupId, patientId: ctx.user.id } },
        select: { id: true, patient: { select: { name: true, email: true } } },
      })
      if (!lid) return { ok: true, already: true }
      await verwijderLid(ctx.prisma, input.groupId, ctx.user.id)
      await auditLog({
        event: 'GROUP_MEMBER_LEFT',
        userId: ctx.user.id,
        actorEmail: ctx.user.email,
        resource: 'AthleteGroup',
        resourceId: input.groupId,
        metadata: { via: 'account' },
        req: ctx.req,
      })
      void meldVertrekAanEigenaar(ctx.prisma, input.groupId, lid.patient.name ?? lid.patient.email)
      return { ok: true, already: false }
    }),

  /** Wat de pagina achter de knop in de mail toont vóór de bevestiging. Publiek; het token is de toegang. */
  leavePreview: publicProcedure
    .input(z.object({ token: z.string().min(1).max(300) }))
    .query(async ({ ctx, input }) => {
      const ip = ctx.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      const rl = await rateLimit('groups.leaveLink', ip, RATE_LIMITS.groupLeaveLink)
      if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      const lidId = verifyLink('group-leave', input.token)
      if (!lidId) return { status: 'invalid' as const }
      const lid = await ctx.prisma.athleteGroupMember.findUnique({
        where: { id: lidId },
        select: { group: { select: { name: true, planName: true, owner: { select: { firstName: true, lastName: true, name: true } } } } },
      })
      if (!lid) return { status: 'gone' as const }
      return { status: 'ok' as const, groupName: lid.group.name, planName: lid.group.planName, ownerName: naamVan(lid.group.owner) }
    }),

  /** De knop in de mail: uit de groep zonder in te loggen. Idempotent. */
  leaveByToken: publicProcedure
    .input(z.object({ token: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const ip = ctx.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      const rl = await rateLimit('groups.leaveLink', ip, RATE_LIMITS.groupLeaveLink)
      if (!rl.ok) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rl.message })
      const lidId = verifyLink('group-leave', input.token)
      if (!lidId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Deze link is niet geldig.' })
      const lid = await ctx.prisma.athleteGroupMember.findUnique({
        where: { id: lidId },
        select: { groupId: true, patientId: true, group: { select: { name: true } }, patient: { select: { name: true, email: true } } },
      })
      if (!lid) return { ok: true, already: true, groupName: null }
      await verwijderLid(ctx.prisma, lid.groupId, lid.patientId)
      await auditLog({
        event: 'GROUP_MEMBER_LEFT',
        userId: lid.patientId,
        actorEmail: lid.patient.email,
        resource: 'AthleteGroup',
        resourceId: lid.groupId,
        metadata: { via: 'mail' },
        req: ctx.req,
      })
      void meldVertrekAanEigenaar(ctx.prisma, lid.groupId, lid.patient.name ?? lid.patient.email)
      return { ok: true, already: false, groupName: lid.group.name }
    }),

  setMemberNote: coachStaffProcedure
    .input(z.object({ groupId: z.string(), patientId: z.string(), note: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'VIEWER')
      await ctx.prisma.athleteGroupMember.update({
        where: { groupId_patientId: { groupId: input.groupId, patientId: input.patientId } },
        data: { note: input.note || null },
      })
      return { ok: true }
    }),

  addStaff: coachStaffProcedure
    .input(z.object({ groupId: z.string(), email: z.string().trim().email(), role: rolEnum }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'OWNER')
      const user = await ctx.prisma.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' }, role: { in: ['THERAPIST', 'COACH'] } },
        select: { id: true },
      })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Geen therapeut of coach met dit e-mailadres' })
      await ctx.prisma.athleteGroupStaff.upsert({
        where: { groupId_userId: { groupId: input.groupId, userId: user.id } },
        create: { id: createId(), groupId: input.groupId, userId: user.id, role: input.role },
        update: { role: input.role },
      })
      return { ok: true }
    }),

  setStaffRole: coachStaffProcedure
    .input(z.object({ groupId: z.string(), userId: z.string(), role: rolEnum }))
    .mutation(async ({ ctx, input }) => {
      const g = await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'OWNER')
      if (input.userId === g.ownerId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'De eigenaar houdt altijd de eigenaarsrol' })
      await ctx.prisma.athleteGroupStaff.update({
        where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
        data: { role: input.role },
      })
      return { ok: true }
    }),

  removeStaff: coachStaffProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const g = await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'OWNER')
      if (input.userId === g.ownerId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'De eigenaar kan zichzelf niet verwijderen' })
      await ctx.prisma.athleteGroupStaff.deleteMany({ where: { groupId: input.groupId, userId: input.userId } })
      return { ok: true }
    }),

  /** Weken van de groepskalender voor het verzendvenster. */
  weeks: coachStaffProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'VIEWER')
      const weken = await ctx.prisma.weekSchedule.findMany({
        where: { groupId: input.groupId, startDate: { not: null } },
        select: { id: true, weekNumber: true, startDate: true, days: { select: { _count: { select: { items: true } } } } },
        orderBy: { startDate: 'asc' },
      })
      return weken.map(w => ({
        id: w.id,
        weekNumber: w.weekNumber,
        monday: mondayKeyOf(w.startDate!),
        itemCount: w.days.reduce((n, d) => n + d._count.items, 0),
      }))
    }),

  /**
   * Stuur naar iedereen: per lid en per gekozen week de groepsitems vervangen
   * (zie lib/group-send.ts voor de regels). Eén transactie per lid, daarna
   * één push per lid. Overgeslagen leden (uitbehandeld) komen terug in het
   * resultaat, ze blijven gewoon lid.
   */
  send: coachStaffProcedure
    .input(z.object({
      groupId: z.string(),
      weekIds: z.array(z.string()).min(1).max(104),
      memberIds: z.array(z.string()).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const g = await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'MANAGER')
      const groep = await ctx.prisma.athleteGroup.findUniqueOrThrow({ where: { id: g.id }, select: { name: true, planName: true } })
      const leden = await ctx.prisma.athleteGroupMember.findMany({
        where: { groupId: g.id, patientId: { in: input.memberIds } },
        select: { patientId: true, patient: { select: { name: true, email: true } } },
      })
      const bronWeken = await ctx.prisma.weekSchedule.findMany({
        where: { id: { in: input.weekIds }, groupId: g.id, startDate: { not: null } },
        include: {
          days: {
            include: { items: { include: COPY_ITEM_INCLUDE, orderBy: { order: 'asc' } } },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
        orderBy: { startDate: 'asc' },
      })
      if (bronWeken.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Kies minstens één week van de groep' })
      const groepsWeken: GroepsWeek[] = bronWeken.map(w => ({
        id: w.id, monday: mondayKeyOf(w.startDate!),
        days: w.days.map(d => ({
          dayOfWeek: d.dayOfWeek,
          // Een training zonder oefeningen, cardio of programma gaat niet mee.
          items: d.items.map(it => ({ id: it.id, leeg: it.kind === 'WORKOUT' && it.exercises.length === 0 && it.cardioParams == null && !it.programId })),
        })),
      }))
      const bronItem = new Map(bronWeken.flatMap(w => w.days.flatMap(d => d.items.map(it => [it.id, it] as const))))
      const vandaag = dateKey(new Date())

      // Zelfde scope als planTemplates.applyToPatient: eigen weken of praktijk.
      const isAdmin = ctx.user.role === 'ADMIN'
      const scope = isAdmin ? {} : { OR: [{ creatorId: ctx.user.id }, ...(ctx.user.practiceId ? [{ practiceId: ctx.user.practiceId }] : [])] }

      const overgeslagen: string[] = []
      let trainingen = 0
      let verzondenLeden = 0

      for (const lid of leden) {
        const label = lid.patient.name ?? lid.patient.email
        try {
          await assertNotDischarged(ctx.prisma, ctx.user, lid.patientId)
        } catch {
          overgeslagen.push(label)
          continue
        }
        const lidWekenRaw = await ctx.prisma.weekSchedule.findMany({
          where: { patientId: lid.patientId, isTemplate: false, ...scope },
          select: {
            id: true, weekNumber: true, startDate: true,
            days: { select: { id: true, dayOfWeek: true, items: { select: { id: true, groupId: true, _count: { select: { sessionLogs: true, cardioLogs: true } } } } } },
          },
        })
        const lidWeken: LidWeek[] = lidWekenRaw
          .filter(w => w.startDate)
          .map(w => ({
            id: w.id, monday: mondayKeyOf(w.startDate!),
            items: w.days.flatMap(d => d.items.map(it => ({ id: it.id, dayOfWeek: d.dayOfWeek, groupId: it.groupId, gelogd: it._count.sessionLogs + it._count.cardioLogs > 0 }))),
          }))
        let maxWeekNumber = lidWekenRaw.reduce((m, w) => Math.max(m, w.weekNumber), 0)
        const stappen = planVerzending({ groupId: g.id, groepsWeken, lidWeken, vandaag })

        await ctx.prisma.$transaction(async tx => {
          for (const stap of stappen) {
            let weekId = stap.lidWeekId
            if (!weekId) {
              weekId = createId()
              maxWeekNumber++
              await tx.weekSchedule.create({
                data: {
                  id: weekId,
                  name: `${groep.planName ?? groep.name} · week van ${stap.monday}`,
                  creatorId: ctx.user.id,
                  practiceId: ctx.user.practiceId ?? null,
                  patientId: lid.patientId,
                  isTemplate: false,
                  weekNumber: maxWeekNumber,
                  startDate: amsMidnight(stap.monday),
                  endDate: amsMidnight(addDaysKey(stap.monday, 6)),
                  days: { create: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({ id: createId(), dayOfWeek })) },
                },
              })
            }
            if (stap.verwijderen.length) {
              await tx.weekScheduleDayItem.deleteMany({ where: { id: { in: stap.verwijderen } } })
            }
            const dagen = await tx.weekScheduleDay.findMany({ where: { weekScheduleId: weekId }, select: { id: true, dayOfWeek: true } })
            const dagId = new Map(dagen.map(d => [d.dayOfWeek, d.id]))
            for (const k of stap.kopieren) {
              let dayId = dagId.get(k.dayOfWeek)
              if (!dayId) {
                dayId = createId()
                await tx.weekScheduleDay.create({ data: { id: dayId, weekScheduleId: weekId, dayOfWeek: k.dayOfWeek } })
                dagId.set(k.dayOfWeek, dayId)
              }
              const laatste = await tx.weekScheduleDayItem.findFirst({ where: { dayId }, orderBy: { order: 'desc' }, select: { order: true } })
              const bron = bronItem.get(k.bronItemId)!
              await copyItemToDay(tx, bron, dayId, laatste ? laatste.order + 1 : 0)
              // Herkomst op de zojuist gemaakte kopie (copyItemToDay kent geen groepen).
              const kopie = await tx.weekScheduleDayItem.findFirst({ where: { dayId }, orderBy: { order: 'desc' }, select: { id: true } })
              if (kopie) await tx.weekScheduleDayItem.update({ where: { id: kopie.id }, data: { groupId: g.id, sourceItemId: k.bronItemId } })
              trainingen++
            }
          }
          await tx.athleteGroupMember.update({
            where: { groupId_patientId: { groupId: g.id, patientId: lid.patientId } },
            data: { lastSentAt: new Date() },
          })
        }, { timeout: 60_000 })
        verzondenLeden++
        await notifyNewSchedule(lid.patientId).catch(() => {})
      }

      await ctx.prisma.athleteGroup.update({ where: { id: g.id }, data: { lastSentAt: new Date() } })
      return { members: verzondenLeden, weeks: groepsWeken.length, items: trainingen, skipped: overgeslagen }
    }),

  /**
   * Groepsdashboard: per lid de status in één oogopslag, samengesteld uit
   * bestaande bouwstenen (pijnmeldingen, readiness, belastingscurve, sessies,
   * planning). Het oordeel zelf zit in lib/group-dashboard.ts.
   */
  dashboard: coachStaffProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertGroupRole(ctx.prisma, ctx.user, input.groupId, 'VIEWER')
      const leden = await ctx.prisma.athleteGroupMember.findMany({
        where: { groupId: input.groupId },
        select: { patientId: true, note: true, patient: { select: { name: true, email: true, injuryInfo: true } } },
        orderBy: { addedAt: 'asc' },
      })
      const nu = new Date()
      const vandaag = dateKey(nu)
      const maandag = mondayKeyOf(nu)
      const weekStart = amsMidnight(maandag)
      const weekEind = amsMidnight(addDaysKey(maandag, 7))
      const planningEind = amsMidnight(addDaysKey(maandag, 28))
      const zevenDagen = new Date(nu.getTime() - 7 * 864e5)
      const veertienDagen = new Date(nu.getTime() - 14 * 864e5)
      const prisma = ctx.prisma

      const rijen = await Promise.all(leden.map(async lid => {
        const id = lid.patientId
        const [pijn, vitals, sessies, cardio, laatsteSessie, laatsteCardio, weken] = await Promise.all([
          prisma.painEntry.findMany({ where: { userId: id, reportedAt: { gte: zevenDagen } }, orderBy: { reportedAt: 'desc' }, select: { nrs: true, location: true, reportedAt: true } }),
          prisma.vitalsEntry.count({ where: { userId: id, date: { gte: veertienDagen } } }),
          prisma.sessionLog.count({ where: { patientId: id, completedAt: { gte: weekStart, lt: weekEind } } }),
          prisma.cardioLog.count({ where: { patientId: id, completedAt: { gte: weekStart, lt: weekEind } } }),
          prisma.sessionLog.findFirst({ where: { patientId: id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { id: true, completedAt: true, exertionLevel: true, feelScore: true } }),
          prisma.cardioLog.findFirst({ where: { patientId: id }, orderBy: { completedAt: 'desc' }, select: { id: true, completedAt: true, rpe: true, feelScore: true } }),
          prisma.weekSchedule.findMany({
            where: { patientId: id, isTemplate: false, startDate: { gte: weekStart, lt: planningEind } },
            select: {
              startDate: true,
              days: { select: { dayOfWeek: true, items: { where: { kind: { in: ['PROGRAM', 'WORKOUT'] } }, select: { quickName: true, program: { select: { name: true } } }, orderBy: { order: 'asc' } } } },
            },
          }),
        ])
        let gepland = 0
        let volgende: LidInvoer['volgende'] = null
        for (const w of weken) {
          if (!w.startDate) continue
          const mk = mondayKeyOf(w.startDate)
          for (const d of w.days) {
            const dk = addDaysKey(mk, d.dayOfWeek)
            for (const it of d.items) {
              if (mk === maandag) gepland++
              if (dk >= vandaag && (!volgende || dk < volgende.at)) volgende = { at: dk, name: it.quickName ?? it.program?.name ?? 'Training' }
            }
          }
        }
        const readiness = vitals > 0
          ? await computeReadinessFor(prisma, id).then(r => ({ band: r.band, score: r.score })).catch(() => null)
          : null
        const curve = await computeLoadCurve(prisma, id, 28).catch(() => null)
        const vorm: LidInvoer['vorm'] = curve && curve.today && curve.sessionCount > 0
          ? {
              form: Math.round(curve.today.form),
              statusKey: curve.status.key,
              statusLabel: curve.status.label,
              weekLoad: Math.round(curve.points.slice(-7).reduce((n, p) => n + p.load, 0)),
              calibrated: curve.calibration.status === 'ready',
            }
          : null
        const kandidaten: NonNullable<LidInvoer['laatste']>[] = []
        if (laatsteSessie?.completedAt) kandidaten.push({ at: laatsteSessie.completedAt.toISOString(), rpe: laatsteSessie.exertionLevel, feel: laatsteSessie.feelScore, soort: 'kracht', sessionId: laatsteSessie.id })
        if (laatsteCardio) kandidaten.push({ at: laatsteCardio.completedAt.toISOString(), rpe: laatsteCardio.rpe, feel: laatsteCardio.feelScore, soort: 'cardio', sessionId: null })
        kandidaten.sort((a, b) => b.at.localeCompare(a.at))
        return beoordeelLid({
          patientId: id,
          naam: lid.patient.name ?? lid.patient.email,
          pijn: pijn.map(p => ({ nrs: p.nrs, location: p.location, reportedAt: p.reportedAt.toISOString() })),
          injuryInfo: lid.patient.injuryInfo,
          readiness,
          vorm,
          gepland,
          gedaan: sessies + cardio,
          laatste: kandidaten[0] ?? null,
          volgende,
          notitie: lid.note,
        }, vandaag)
      }))
      const gesorteerd = sorteerRijen(rijen)
      return { vandaag, rijen: gesorteerd, tellers: tellers(gesorteerd) }
    }),
})
