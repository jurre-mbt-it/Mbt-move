/**
 * DPA (Verwerkingsovereenkomst) tRPC router.
 *
 * AVG-verplicht voor fysiotherapie praktijken. Aparte overeenkomst van research consent.
 * Versie bijgehouden in User model (dpaAcceptedVersion + dpaAcceptedAt).
 */

import { createTRPCRouter, protectedProcedure, therapistProcedure } from '@/server/trpc'
import { DPA_VERSION } from '@/lib/dpa-constants'

export { DPA_VERSION }

export const dpaRouter = createTRPCRouter({
  // ── Patiënt: eigen DPA-status opvragen ───────────────────────────────────

  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { dpaAcceptedVersion: true, dpaAcceptedAt: true },
    })

    const accepted = user?.dpaAcceptedVersion === DPA_VERSION

    return {
      accepted,
      acceptedVersion: user?.dpaAcceptedVersion ?? null,
      acceptedAt: user?.dpaAcceptedAt?.toISOString() ?? null,
      currentVersion: DPA_VERSION,
      needsAcceptance: !accepted,
    }
  }),

  // ── Patiënt: DPA accepteren ───────────────────────────────────────────────

  accept: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        dpaAcceptedVersion: DPA_VERSION,
        dpaAcceptedAt: new Date(),
      },
    })
    return { accepted: true, version: DPA_VERSION }
  }),

  // ── Therapeut/admin: DPA-overzicht van eigen patiënten ───────────────────

  listPatients: therapistProcedure.query(async ({ ctx }) => {
    const patients = await ctx.prisma.user.findMany({
      where: {
        role: 'PATIENT',
        patientTherapists: {
          some: { therapistId: ctx.user.id, isActive: true, status: { in: ['APPROVED', 'PENDING'] } },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        dpaAcceptedVersion: true,
        dpaAcceptedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return patients.map(p => ({
      id: p.id,
      name: p.name ?? 'Onbekend',
      email: p.email,
      dpaAcceptedVersion: p.dpaAcceptedVersion ?? null,
      dpaAcceptedAt: p.dpaAcceptedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      accepted: p.dpaAcceptedVersion === DPA_VERSION,
    }))
  }),
})
