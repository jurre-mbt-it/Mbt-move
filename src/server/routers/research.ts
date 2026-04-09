/**
 * Research tRPC router — consent management & admin data access.
 *
 * Security rules enforced here:
 * - AnonymousIdMapping is NEVER queried or returned from any procedure.
 * - Only aggregated stats are returned to admins (no individual records).
 * - Raw export returns only AnonymizedRecord rows (no mapping, no PII).
 */

import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/server/trpc'
import { withdrawConsent, CONSENT_VERSION } from '@/lib/anonymization'

export const researchRouter = createTRPCRouter({
  // ── Patient: read their own consent status ────────────────────────────────

  getConsentStatus: protectedProcedure.query(async ({ ctx }) => {
    const consent = await ctx.prisma.researchConsent.findUnique({
      where: { userId: ctx.user.id },
      select: {
        consentGiven: true,
        consentVersion: true,
        consentGivenAt: true,
        updatedAt: true,
      },
    })

    return {
      hasRecord: !!consent,
      consentGiven: consent?.consentGiven ?? false,
      consentVersion: consent?.consentVersion ?? null,
      consentGivenAt: consent?.consentGivenAt ?? null,
      currentVersion: CONSENT_VERSION,
      needsNewConsent: !consent || consent.consentVersion !== CONSENT_VERSION,
    }
  }),

  // ── Patient: give or update consent ──────────────────────────────────────

  setConsent: protectedProcedure
    .input(z.object({ consentGiven: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.consentGiven) {
        // Withdraw: hard-delete anonymised data + mapping
        await withdrawConsent(ctx.user.id)
        return { consentGiven: false }
      }

      const now = new Date()
      await ctx.prisma.researchConsent.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          consentGiven: true,
          consentVersion: CONSENT_VERSION,
          consentGivenAt: now,
        },
        update: {
          consentGiven: true,
          consentVersion: CONSENT_VERSION,
          consentGivenAt: now,
        },
      })

      return { consentGiven: true }
    }),

  // ── Admin: aggregated statistics ─────────────────────────────────────────

  getAggregates: adminProcedure.query(async ({ ctx }) => {
    const [
      totalRecords,
      totalConsenting,
      byDiagnosis,
      avgAge,
      avgPain,
      avgExertion,
    ] = await Promise.all([
      ctx.prisma.anonymizedRecord.count(),

      ctx.prisma.researchConsent.count({ where: { consentGiven: true } }),

      ctx.prisma.anonymizedRecord.groupBy({
        by: ['diagnosisCategory'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      ctx.prisma.anonymizedRecord.aggregate({
        _avg: { ageAtRecord: true },
      }),

      ctx.prisma.anonymizedRecord.aggregate({
        _avg: { painLevel: true },
      }),

      ctx.prisma.anonymizedRecord.aggregate({
        _avg: { exertionLevel: true },
      }),
    ])

    return {
      totalRecords,
      totalConsenting,
      averageAge: avgAge._avg.ageAtRecord ? Math.round(avgAge._avg.ageAtRecord) : null,
      averagePainLevel: avgPain._avg.painLevel
        ? Math.round(avgPain._avg.painLevel * 10) / 10
        : null,
      averageExertion: avgExertion._avg.exertionLevel
        ? Math.round(avgExertion._avg.exertionLevel * 10) / 10
        : null,
      byDiagnosis: byDiagnosis.map(r => ({
        category: r.diagnosisCategory ?? 'Onbekend',
        count: r._count.id,
      })),
    }
  }),

  // ── Admin: raw export of AnonymizedRecord only ────────────────────────────

  exportRecords: adminProcedure
    .input(
      z.object({
        format: z.enum(['json', 'csv']).default('json'),
        limit: z.number().min(1).max(10000).default(1000),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const records = await ctx.prisma.anonymizedRecord.findMany({
        select: {
          // SECURITY: only AnonymizedRecord fields — no join to mapping or users
          id: true,
          anonymousId: true,
          recordDate: true,
          ageAtRecord: true,
          diagnosisCategory: true,
          exerciseName: true,
          setsCompleted: true,
          repsCompleted: true,
          sessionDuration: true,
          painLevel: true,
          exertionLevel: true,
          createdAt: true,
        },
        orderBy: { recordDate: 'desc' },
        take: input.limit,
        skip: input.offset,
      })

      const total = await ctx.prisma.anonymizedRecord.count()

      if (input.format === 'csv') {
        const header = [
          'id', 'anonymousId', 'recordDate', 'ageAtRecord', 'diagnosisCategory',
          'exerciseName', 'setsCompleted', 'repsCompleted', 'sessionDuration',
          'painLevel', 'exertionLevel', 'createdAt',
        ].join(',')

        const rows = records.map(r =>
          [
            r.id,
            r.anonymousId,
            r.recordDate.toISOString(),
            r.ageAtRecord,
            r.diagnosisCategory ?? '',
            r.exerciseName ?? '',
            r.setsCompleted ?? '',
            r.repsCompleted ?? '',
            r.sessionDuration ?? '',
            r.painLevel ?? '',
            r.exertionLevel ?? '',
            r.createdAt.toISOString(),
          ].join(',')
        )

        return { format: 'csv' as const, csv: [header, ...rows].join('\n'), total }
      }

      return { format: 'json' as const, records, total }
    }),
})
