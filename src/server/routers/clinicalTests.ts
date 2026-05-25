/**
 * Clinical Tests library + losse test-toewijzing per patient.
 *
 *  - `clinicalTests`             — read-only library (global, geseed)
 *  - `patientTestAssignments`    — koppel test ↔ patient
 *  - `patientTestResults`        — meetwaardes per uitvoering
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { Prisma, BodyRegion, TestConstruct } from '@prisma/client'
import { createTRPCRouter, protectedProcedure, therapistProcedure } from '@/server/trpc'

const BODY_REGIONS = [
  'KNEE',
  'SHOULDER',
  'BACK',
  'ANKLE',
  'HIP',
  'FULL_BODY',
  'CERVICAL',
  'THORACIC',
  'LUMBAR',
  'ELBOW',
  'WRIST',
  'FOOT',
] as const
const BodyRegionEnum = z.enum(BODY_REGIONS)

const CONSTRUCTS = [
  'STRENGTH',
  'ROM',
  'POWER',
  'BALANCE',
  'ENDURANCE',
  'PROVOCATION',
  'NEURODYNAMIC',
  'MOVEMENT_QUALITY',
  'SENSORIMOTOR',
  'FUNCTIONAL',
  'SPORT_SPECIFIC',
  'SENSIBILITY',
  'RESPIRATORY',
  'EFFUSION',
  'DECISION_RULE',
] as const
const TestConstructEnum = z.enum(CONSTRUCTS)

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
  if (patientId === user.id) return
  const relation = await prisma.patientTherapist.findFirst({
    where: { therapistId: user.id, patientId, ...ACTIVE_LINK },
  })
  if (!relation) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Geen actieve behandelrelatie met deze patiënt',
    })
  }
}

// ─── Library: clinical tests ────────────────────────────────────────────────

export const clinicalTestsRouter = createTRPCRouter({
  /**
   * Library-overzicht met optionele filters. Tests zijn global (niet
   * practice-scoped) — elke ingelogde gebruiker mag de catalog inzien.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          bodyRegion: z.array(BodyRegionEnum).optional(),
          construct: TestConstructEnum.optional(),
          phase: z.number().int().min(0).max(5).optional(),
          search: z.string().optional(),
          tag: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const search = input?.search?.trim()
      const where: Prisma.ClinicalTestWhereInput = {
        ...(input?.bodyRegion && input.bodyRegion.length > 0
          ? { bodyRegion: { hasSome: input.bodyRegion as BodyRegion[] } }
          : {}),
        ...(input?.construct ? { construct: input.construct as TestConstruct } : {}),
        ...(input?.phase !== undefined ? { phases: { has: input.phase } } : {}),
        ...(input?.tag ? { tags: { has: input.tag } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { alternativeNames: { has: search } },
                { shortGoal: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
      return ctx.prisma.clinicalTest.findMany({
        where,
        orderBy: [{ bodyRegion: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          key: true,
          name: true,
          alternativeNames: true,
          bodyRegion: true,
          tags: true,
          construct: true,
          shortGoal: true,
          benchmark: true,
          applicableTo: true,
          phases: true,
          loE: true,
          estimatedTimeMin: true,
        },
      })
    }),

  /** Volledig test-record op `key` (URL-segment). */
  byKey: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const test = await ctx.prisma.clinicalTest.findUnique({
        where: { key: input.key },
      })
      if (!test) throw new TRPCError({ code: 'NOT_FOUND' })
      return test
    }),
})

// ─── Patient test-assignments ───────────────────────────────────────────────

export const patientTestAssignmentsRouter = createTRPCRouter({
  /**
   * Toewijzing aanmaken — therapeut kiest test uit library voor een patient.
   * `assignedAt` default-now zorgt voor uniciteit als dezelfde test meerdere
   * keren wordt toegewezen (longitudinaal hertest).
   */
  create: therapistProcedure
    .input(
      z.object({
        patientId: z.string(),
        clinicalTestId: z.string(),
        dueDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const test = await ctx.prisma.clinicalTest.findUnique({
        where: { id: input.clinicalTestId },
        select: { id: true },
      })
      if (!test) throw new TRPCError({ code: 'NOT_FOUND', message: 'Test bestaat niet' })
      return ctx.prisma.patientTestAssignment.create({
        data: {
          patientId: input.patientId,
          clinicalTestId: input.clinicalTestId,
          assignedById: ctx.user.id,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          notes: input.notes ?? null,
        },
        include: {
          clinicalTest: {
            select: { id: true, key: true, name: true, construct: true, bodyRegion: true },
          },
        },
      })
    }),

  /** Lijst van toewijzingen voor één patient, met latest-result preview. */
  list: protectedProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'ADMIN'
      const isSelf = ctx.user.id === input.patientId
      if (!isAdmin && !isSelf) {
        // therapeut moet treating-relatie hebben
        await assertTreating(ctx.prisma, ctx.user, input.patientId)
      }
      return ctx.prisma.patientTestAssignment.findMany({
        where: { patientId: input.patientId },
        orderBy: { assignedAt: 'desc' },
        include: {
          clinicalTest: {
            select: {
              id: true,
              key: true,
              name: true,
              construct: true,
              bodyRegion: true,
              shortGoal: true,
              benchmark: true,
            },
          },
          results: {
            orderBy: { performedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              performedAt: true,
              value: true,
              leftValue: true,
              rightValue: true,
              lsi: true,
              painScore: true,
            },
          },
          assignedBy: { select: { id: true, name: true } },
        },
      })
    }),

  delete: therapistProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.patientTestAssignment.findUnique({
        where: { id: input.id },
        select: { patientId: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, existing.patientId)
      await ctx.prisma.patientTestAssignment.delete({ where: { id: input.id } })
      return { success: true }
    }),
})

// ─── Patient test-results ────────────────────────────────────────────────────

function computeLsi(left: number | null | undefined, right: number | null | undefined): number | null {
  if (left == null || right == null) return null
  if (left <= 0 || right <= 0) return null
  return Math.round((Math.min(left, right) / Math.max(left, right)) * 1000) / 10
}

export const patientTestResultsRouter = createTRPCRouter({
  /**
   * Resultaat-invoer. `lsi` wordt server-side berekend als L+R aangeleverd
   * worden en de therapeut geen handmatige override meestuurt.
   */
  create: therapistProcedure
    .input(
      z.object({
        assignmentId: z.string(),
        value: z.string().nullable().optional(),
        leftValue: z.number().nullable().optional(),
        rightValue: z.number().nullable().optional(),
        lsi: z.number().nullable().optional(),
        painScore: z.number().int().min(0).max(10).nullable().optional(),
        notes: z.string().nullable().optional(),
        performedAt: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignment = await ctx.prisma.patientTestAssignment.findUnique({
        where: { id: input.assignmentId },
        select: { patientId: true },
      })
      if (!assignment) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, assignment.patientId)

      const lsi =
        input.lsi !== undefined && input.lsi !== null
          ? input.lsi
          : computeLsi(input.leftValue, input.rightValue)

      return ctx.prisma.patientTestResult.create({
        data: {
          assignmentId: input.assignmentId,
          performedById: ctx.user.id,
          performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
          value: input.value ?? null,
          leftValue: input.leftValue ?? null,
          rightValue: input.rightValue ?? null,
          lsi,
          painScore: input.painScore ?? null,
          notes: input.notes ?? null,
        },
      })
    }),

  listForAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const assignment = await ctx.prisma.patientTestAssignment.findUnique({
        where: { id: input.assignmentId },
        select: { patientId: true },
      })
      if (!assignment) throw new TRPCError({ code: 'NOT_FOUND' })
      const isAdmin = ctx.user.role === 'ADMIN'
      const isSelf = ctx.user.id === assignment.patientId
      if (!isAdmin && !isSelf) {
        await assertTreating(ctx.prisma, ctx.user, assignment.patientId)
      }
      return ctx.prisma.patientTestResult.findMany({
        where: { assignmentId: input.assignmentId },
        orderBy: { performedAt: 'desc' },
        include: {
          performedBy: { select: { id: true, name: true } },
        },
      })
    }),
})
