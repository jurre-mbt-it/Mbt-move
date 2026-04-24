/**
 * Mobility Assessment router (The Ready State methodology).
 *
 * Access model:
 *   - Feature is admin-gated: alleen therapeuten met User.canUseAssessment=true
 *     (of ADMIN) kunnen endpoints aanroepen. Zie `assessmentProcedure`.
 *   - Per patient: behandelend therapeut (isActive + APPROVED) of admin.
 *   - Catalog (tests + mobilizations): therapist read, admin write.
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure, adminProcedure, mfaAdminProcedure } from '@/server/trpc'

const ACTIVE_LINK = { isActive: true, status: 'APPROVED' as const }

async function assertTreating(
  prisma: typeof import('@/lib/prisma').prisma,
  user: { id: string; role: string },
  patientId: string,
) {
  if (user.role === 'ADMIN') return
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

/**
 * Gate alle therapeut-procedures op User.canUseAssessment. ADMIN altijd door.
 */
const assessmentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user!.role === 'ADMIN') return next({ ctx })
  if (ctx.user!.role !== 'THERAPIST') {
    throw new TRPCError({ code: 'FORBIDDEN' })
  }
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.user!.id },
    select: { canUseAssessment: true },
  })
  if (!user?.canUseAssessment) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Mobility Assessment is niet geactiveerd voor jouw account. Neem contact op met een admin.',
    })
  }
  return next({ ctx })
})

export const assessmentsRouter = createTRPCRouter({
  /** Snelle check: mag deze user de assessment-feature gebruiken? */
  hasAccess: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'ADMIN') return { hasAccess: true, reason: 'admin' as const }
    if (ctx.user.role !== 'THERAPIST') return { hasAccess: false, reason: 'role' as const }
    const u = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { canUseAssessment: true },
    })
    return { hasAccess: !!u?.canUseAssessment, reason: 'flag' as const }
  }),

  /** Volledige test-catalog gegroepeerd per archetype. */
  listTests: assessmentProcedure.query(async ({ ctx }) => {
    const tests = await ctx.prisma.assessmentTest.findMany({
      orderBy: [{ archetype: 'asc' }, { testType: 'asc' }, { order: 'asc' }],
      include: {
        suggestedMobilizations: {
          orderBy: { order: 'asc' },
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                category: true,
                bodyRegion: true,
                difficulty: true,
              },
            },
          },
        },
      },
    })
    return tests
  }),

  /** Lijst van assessments voor een patient (nieuwste eerst). */
  listForPatient: assessmentProcedure
    .input(z.object({ patientId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const rows = await ctx.prisma.patientAssessment.findMany({
        where: { patientId: input.patientId },
        orderBy: { performedAt: 'desc' },
        include: {
          therapist: { select: { id: true, name: true, email: true } },
          _count: { select: { scores: true } },
          scores: { select: { score: true } },
        },
      })
      return rows.map((a) => {
        const pass = a.scores.filter((s) => s.score === 'PASS').length
        const partial = a.scores.filter((s) => s.score === 'PARTIAL').length
        const fail = a.scores.filter((s) => s.score === 'FAIL').length
        return {
          id: a.id,
          performedAt: a.performedAt,
          therapistName: a.therapist.name ?? a.therapist.email,
          notes: a.notes,
          totalScored: pass + partial + fail,
          pass,
          partial,
          fail,
        }
      })
    }),

  /** Detail van één assessment: alle scores + archetype-summaries. */
  get: assessmentProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.prisma.patientAssessment.findUnique({
        where: { id: input.id },
        include: {
          scores: {
            include: {
              test: {
                include: {
                  suggestedMobilizations: {
                    orderBy: { order: 'asc' },
                    include: { exercise: { select: { id: true, name: true, category: true } } },
                  },
                },
              },
            },
          },
          archetypeSummaries: true,
          therapist: { select: { id: true, name: true, email: true } },
          patient: { select: { id: true, name: true, email: true } },
        },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)
      return a
    }),

  /** Nieuwe assessment aanmaken (leeg — scores worden per test ingevuld). */
  create: assessmentProcedure
    .input(
      z.object({
        patientId: z.string(),
        performedAt: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreating(ctx.prisma, ctx.user, input.patientId)
      const assessment = await ctx.prisma.patientAssessment.create({
        data: {
          patientId: input.patientId,
          therapistId: ctx.user.id,
          performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
          notes: input.notes,
        },
      })
      return { id: assessment.id }
    }),

  delete: assessmentProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.prisma.patientAssessment.findUnique({
        where: { id: input.id },
        select: { patientId: true },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)
      await ctx.prisma.patientAssessment.delete({ where: { id: input.id } })
      return { ok: true }
    }),

  /** Upsert van score voor één test binnen een assessment. */
  scoreTest: assessmentProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        testId: z.string(),
        score: z.enum(['NOT_TESTED', 'FAIL', 'PARTIAL', 'PASS']),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.prisma.patientAssessment.findUnique({
        where: { id: input.assessmentId },
        select: { patientId: true },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)
      await ctx.prisma.assessmentTestScore.upsert({
        where: {
          assessmentId_testId: { assessmentId: input.assessmentId, testId: input.testId },
        },
        update: {
          score: input.score,
          notes: input.notes ?? null,
        },
        create: {
          assessmentId: input.assessmentId,
          testId: input.testId,
          score: input.score,
          notes: input.notes ?? null,
        },
      })
      return { ok: true }
    }),

  /** Upsert van archetype-samenvatting (compensation + tissue + programming). */
  upsertArchetypeSummary: assessmentProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        archetype: z.enum([
          'LUMBAR_SPINE',
          'SQUAT_HINGE',
          'PISTOL',
          'LUNGE',
          'THORACIC_SPINE',
          'OVERHEAD',
          'FRONT_RACK',
          'PRESS',
          'HANG',
          'BREATHING',
        ]),
        compensationStrategy: z.string().nullable().optional(),
        primaryTissue: z
          .enum(['JOINT', 'SLIDING_SURFACE', 'MUSCLE_DYNAMICS', 'MOTOR_CONTROL'])
          .nullable()
          .optional(),
        mobilityJoint: z.string().nullable().optional(),
        mobilitySlidingSurface: z.string().nullable().optional(),
        mobilityLoadedEndRange: z.string().nullable().optional(),
        motorSkillTransfer: z.string().nullable().optional(),
        motorMovementModification: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.prisma.patientAssessment.findUnique({
        where: { id: input.assessmentId },
        select: { patientId: true },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)
      const { assessmentId, archetype, ...data } = input
      await ctx.prisma.assessmentArchetypeSummary.upsert({
        where: { assessmentId_archetype: { assessmentId, archetype } },
        update: data,
        create: { assessmentId, archetype, ...data },
      })
      return { ok: true }
    }),

  updateNotes: assessmentProcedure
    .input(z.object({ id: z.string(), notes: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.prisma.patientAssessment.findUnique({
        where: { id: input.id },
        select: { patientId: true },
      })
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' })
      await assertTreating(ctx.prisma, ctx.user, a.patientId)
      await ctx.prisma.patientAssessment.update({
        where: { id: input.id },
        data: { notes: input.notes },
      })
      return { ok: true }
    }),

  // ── ADMIN: feature-flag + catalog beheer ────────────────────────────────

  /** Admin: flip canUseAssessment voor een therapeut. */
  adminGrantAccess: mfaAdminProcedure
    .input(z.object({ therapistId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.prisma.user.findUnique({
        where: { id: input.therapistId },
        select: { id: true, role: true },
      })
      if (!target || target.role !== 'THERAPIST') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'User is geen therapeut' })
      }
      await ctx.prisma.user.update({
        where: { id: input.therapistId },
        data: { canUseAssessment: input.enabled },
      })
      return { ok: true }
    }),

  /** Admin: lijst therapeuten + hun canUseAssessment status. */
  adminListTherapists: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      where: { role: 'THERAPIST', deletedAt: null },
      orderBy: { email: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        canUseAssessment: true,
        practice: { select: { id: true, name: true } },
      },
    })
  }),
})
